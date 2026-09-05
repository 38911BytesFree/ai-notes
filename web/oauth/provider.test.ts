import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidTargetError,
} from "@modelcontextprotocol/server-legacy/auth";
import { OAuthProvider } from "./provider";
import { ClientsStore, validateRedirectUri } from "./clients-store";
import { hashToken } from "./tokens";

describe("OAuthProvider and ClientsStore", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let provider: OAuthProvider;
  let clientsStore: ClientsStore;

  // In-memory fake Go backend store for tests
  let fakeClients: Map<string, any>;
  let fakeCodes: Map<string, any>;
  let fakeTokens: Map<string, any>;

  beforeEach(() => {
    fakeClients = new Map();
    fakeCodes = new Map();
    fakeTokens = new Map();

    process.env.BACKEND_URL = "http://backend-api.local";
    process.env.BACKEND_USE_ID_TOKEN = "false";
    process.env.PUBLIC_BASE_URL = "https://ai-notes.example.com";
    process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";

    provider = new OAuthProvider();
    clientsStore = new ClientsStore();

    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const urlStr = input.toString();
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(init.body as string) : {};

      // POST /v1/oauth/clients
      if (urlStr.endsWith("/v1/oauth/clients") && method === "POST") {
        const client = {
          client_id: body.client_id || "client-123",
          client_secret: body.client_secret,
          client_name: body.client_name,
          redirect_uris: body.redirect_uris,
          grant_types: body.grant_types,
          response_types: body.response_types,
          token_endpoint_auth_method: body.token_endpoint_auth_method,
          scopes: body.scopes,
          created_at: new Date().toISOString(),
        };
        fakeClients.set(client.client_id, client);
        return new Response(JSON.stringify(client), { status: 201 });
      }

      // GET /v1/oauth/clients/{id}
      const clientGetMatch = urlStr.match(/\/v1\/oauth\/clients\/([^/]+)$/);
      if (clientGetMatch && method === "GET") {
        const clientId = clientGetMatch[1];
        const client = fakeClients.get(clientId);
        if (!client) {
          return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
        }
        return new Response(JSON.stringify(client), { status: 200 });
      }

      // GET /v1/oauth/codes/{hash}
      const codeGetMatch = urlStr.match(/\/v1\/oauth\/codes\/([^/]+)$/);
      if (codeGetMatch && method === "GET") {
        const hash = codeGetMatch[1];
        const codeRec = fakeCodes.get(hash);
        if (!codeRec || codeRec.consumed) {
          return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
        }
        return new Response(JSON.stringify(codeRec), { status: 200 });
      }

      // POST /v1/oauth/codes/{hash}/consume
      const consumeMatch = urlStr.match(/\/v1\/oauth\/codes\/([^/]+)\/consume$/);
      if (consumeMatch && method === "POST") {
        const hash = consumeMatch[1];
        const codeRec = fakeCodes.get(hash);
        if (!codeRec || codeRec.consumed) {
          return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
        }
        codeRec.consumed = true;
        return new Response(JSON.stringify(codeRec), { status: 200 });
      }

      // POST /v1/oauth/tokens (store token)
      if (urlStr.endsWith("/v1/oauth/tokens") && method === "POST") {
        fakeTokens.set(body.token_hash, {
          token_hash: body.token_hash,
          kind: body.kind,
          client_id: body.client_id,
          uid: body.uid,
          scopes: body.scopes,
          resource: body.resource,
          expires_at: body.expires_at,
          refresh_parent_hash: body.refresh_parent_hash,
          revoked: false,
          created_at: new Date().toISOString(),
        });
        return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      }

      // POST /v1/oauth/tokens/{hash}/rotate
      const rotateMatch = urlStr.match(/\/v1\/oauth\/tokens\/([^/]+)\/rotate$/);
      if (rotateMatch && method === "POST") {
        const hash = rotateMatch[1];
        const tokenRec = fakeTokens.get(hash);
        if (!tokenRec || tokenRec.kind !== "refresh" || tokenRec.revoked) {
          return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
        }
        tokenRec.revoked = true;
        return new Response(JSON.stringify(tokenRec), { status: 200 });
      }

      // DELETE /v1/oauth/tokens/{hash}
      const revokeMatch = urlStr.match(/\/v1\/oauth\/tokens\/([^/]+)$/);
      if (revokeMatch && method === "DELETE") {
        const hash = revokeMatch[1];
        const tokenRec = fakeTokens.get(hash);
        if (tokenRec) {
          tokenRec.revoked = true;
        }
        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  describe("Client Registration & Redirect URI Validation", () => {
    it("rejects non-https redirect URIs that are not loopback", () => {
      expect(() => validateRedirectUri("http://example.com/callback")).toThrow(
        InvalidClientMetadataError
      );
      expect(() => validateRedirectUri("ftp://example.com/callback")).toThrow(
        InvalidClientMetadataError
      );
    });

    it("accepts https redirect URIs and loopback http redirect URIs", () => {
      expect(() => validateRedirectUri("https://claude.ai/api/mcp/callback")).not.toThrow();
      expect(() => validateRedirectUri("http://localhost:8080/callback")).not.toThrow();
      expect(() => validateRedirectUri("http://127.0.0.1:3000/callback")).not.toThrow();
    });

    it("registerClient rejects client with non-https redirect uri", async () => {
      await expect(
        clientsStore.registerClient({
          client_name: "Insecure Client",
          redirect_uris: ["http://insecure.example.com/oauth/callback"],
        })
      ).rejects.toThrow(InvalidClientMetadataError);
    });

    it("registerClient registers valid client with Go API", async () => {
      const registered = await clientsStore.registerClient({
        client_id: "test-client-1",
        client_name: "Test Client",
        redirect_uris: ["https://test.example.com/oauth/callback"],
        scopes: ["notes:read", "notes:write"],
      });

      expect(registered.client_id).toBe("test-client-1");
      expect(registered.client_name).toBe("Test Client");
      expect(registered.redirect_uris).toEqual(["https://test.example.com/oauth/callback"]);

      const fetched = await clientsStore.getClient("test-client-1");
      expect(fetched).toBeDefined();
      expect(fetched.client_name).toBe("Test Client");
    });
  });

  describe("Authorization & Consent redirect", () => {
    it("refuses authorization if resource parameter does not match /mcp", async () => {
      const client = { client_id: "client-123" };
      const res = { setHeader: vi.fn(), redirect: vi.fn() } as any;

      await expect(
        provider.authorize(
          client,
          {
            redirectUri: "https://example.com/cb",
            codeChallenge: "ch123",
            resource: new URL("https://ai-notes.example.com/other"),
          },
          res
        )
      ).rejects.toThrow(InvalidTargetError);
    });

    it("sets pending cookie and redirects to /oauth/consent when valid", async () => {
      const client = { client_id: "client-123" };
      let setCookie = "";
      let redirectTarget = "";
      const res = {
        setHeader: vi.fn((name: string, val: string) => {
          if (name === "Set-Cookie") setCookie = val;
        }),
        redirect: vi.fn((target: string) => {
          redirectTarget = target;
        }),
      } as any;

      await provider.authorize(
        client,
        {
          redirectUri: "https://example.com/cb",
          codeChallenge: "challenge-xyz",
          resource: new URL("https://ai-notes.example.com/mcp"),
          state: "state-123",
        },
        res
      );

      expect(redirectTarget).toBe("/oauth/consent");
      expect(setCookie).toContain("__oauth_pending=");
    });
  });

  describe("Authorization Code Exchange", () => {
    const rawCode = "ain_code_testcode1234567890abcdef";
    const codeHash = hashToken(rawCode);

    beforeEach(() => {
      fakeCodes.set(codeHash, {
        code_hash: codeHash,
        client_id: "client-123",
        uid: "user-abc",
        scopes: ["notes:read", "notes:write"],
        code_challenge: "expected-challenge",
        code_challenge_method: "S256",
        redirect_uri: "https://example.com/cb",
        resource: "https://ai-notes.example.com/mcp",
        consumed: false,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      });
    });

    it("challengeForAuthorizationCode returns stored challenge", async () => {
      const challenge = await provider.challengeForAuthorizationCode(
        { client_id: "client-123" },
        rawCode
      );
      expect(challenge).toBe("expected-challenge");
    });

    it("challengeForAuthorizationCode rejects invalid client or consumed code", async () => {
      await expect(
        provider.challengeForAuthorizationCode({ client_id: "wrong-client" }, rawCode)
      ).rejects.toThrow(InvalidGrantError);

      fakeCodes.get(codeHash).consumed = true;
      await expect(
        provider.challengeForAuthorizationCode({ client_id: "client-123" }, rawCode)
      ).rejects.toThrow(InvalidGrantError);
    });

    it("exchangeAuthorizationCode refuses mismatched redirect_uri", async () => {
      await expect(
        provider.exchangeAuthorizationCode(
          { client_id: "client-123" },
          rawCode,
          "verifier",
          "https://evil.com/cb"
        )
      ).rejects.toThrow(InvalidGrantError);
    });

    it("exchangeAuthorizationCode refuses wrong resource", async () => {
      await expect(
        provider.exchangeAuthorizationCode(
          { client_id: "client-123" },
          rawCode,
          "verifier",
          "https://example.com/cb",
          new URL("https://ai-notes.example.com/wrong")
        )
      ).rejects.toThrow(InvalidTargetError);
    });

    it("exchangeAuthorizationCode succeeds and generates access & refresh tokens", async () => {
      const tokens = await provider.exchangeAuthorizationCode(
        { client_id: "client-123" },
        rawCode,
        "verifier",
        "https://example.com/cb",
        new URL("https://ai-notes.example.com/mcp")
      );

      expect(tokens.token_type).toBe("bearer");
      expect(tokens.expires_in).toBe(3600);
      expect(tokens.access_token).toMatch(/^ain_at_/);
      expect(tokens.refresh_token).toMatch(/^ain_rt_/);
      expect(tokens.scope).toBe("notes:read notes:write");
    });

    it("exchangeAuthorizationCode refuses a second exchange (code consumed)", async () => {
      // First exchange
      await provider.exchangeAuthorizationCode(
        { client_id: "client-123" },
        rawCode,
        "verifier",
        "https://example.com/cb"
      );

      // Second exchange with same code
      await expect(
        provider.exchangeAuthorizationCode(
          { client_id: "client-123" },
          rawCode,
          "verifier",
          "https://example.com/cb"
        )
      ).rejects.toThrow(InvalidGrantError);
    });

    it("respects OAUTH_ACCESS_TOKEN_TTL_SECONDS env variable override", async () => {
      process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS = "120"; // 2 minutes
      const tokens = await provider.exchangeAuthorizationCode(
        { client_id: "client-123" },
        rawCode,
        "verifier",
        "https://example.com/cb"
      );
      expect(tokens.expires_in).toBe(120);
      delete process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS;
    });
  });

  describe("Refresh Token Rotation & Reuse Refusal", () => {
    const rawRefresh = "ain_rt_refresh1234567890abcdef";
    const refreshHash = hashToken(rawRefresh);

    beforeEach(() => {
      fakeTokens.set(refreshHash, {
        token_hash: refreshHash,
        kind: "refresh",
        client_id: "client-123",
        uid: "user-abc",
        scopes: ["notes:read", "notes:write"],
        resource: "https://ai-notes.example.com/mcp",
        expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        revoked: false,
      });
    });

    it("successfully rotates refresh token and returns new access & refresh tokens", async () => {
      const tokens = await provider.exchangeRefreshToken(
        { client_id: "client-123" },
        rawRefresh,
        ["notes:read"],
        new URL("https://ai-notes.example.com/mcp")
      );

      expect(tokens.token_type).toBe("bearer");
      expect(tokens.access_token).toMatch(/^ain_at_/);
      expect(tokens.refresh_token).toMatch(/^ain_rt_/);
      expect(tokens.scope).toBe("notes:read");

      // Verify old token is revoked in store
      expect(fakeTokens.get(refreshHash).revoked).toBe(true);
    });

    it("refresh rotation refuses reuse (second use of same refresh token)", async () => {
      // First rotation succeeds
      await provider.exchangeRefreshToken(
        { client_id: "client-123" },
        rawRefresh,
        ["notes:read"]
      );

      // Second rotation with same token fails
      await expect(
        provider.exchangeRefreshToken(
          { client_id: "client-123" },
          rawRefresh,
          ["notes:read"]
        )
      ).rejects.toThrow(InvalidGrantError);
    });

    it("exchangeRefreshToken refuses mismatched client_id", async () => {
      await expect(
        provider.exchangeRefreshToken(
          { client_id: "other-client" },
          rawRefresh
        )
      ).rejects.toThrow(InvalidGrantError);
    });

    it("exchangeRefreshToken refuses mismatched resource", async () => {
      await expect(
        provider.exchangeRefreshToken(
          { client_id: "client-123" },
          rawRefresh,
          undefined,
          new URL("https://ai-notes.example.com/wrong")
        )
      ).rejects.toThrow(InvalidTargetError);
    });
  });

  describe("Token Revocation", () => {
    it("revokes token via Go API", async () => {
      const rawToken = "ain_at_testtoken123";
      const tokenHash = hashToken(rawToken);
      fakeTokens.set(tokenHash, { token_hash: tokenHash, revoked: false });

      await provider.revokeToken({ client_id: "client-123" }, { token: rawToken });

      expect(fakeTokens.get(tokenHash).revoked).toBe(true);
    });
  });
});
