import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";
import {
  generatePat,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "../oauth/tokens";
import {
  verifyAccessToken,
  _clearVerifierCacheForTesting,
} from "./verifier";

describe("mcp/verifier", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useRealTimers();
    _clearVerifierCacheForTesting();
    process.env.BACKEND_URL = "http://backend-api.local";
    process.env.BACKEND_USE_ID_TOKEN = "false";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("verifies a PAT token by prefix, calls Go pats endpoint, and maps AuthInfo", async () => {
    const { token, hash } = generatePat();

    let fetchedUrl = "";
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      fetchedUrl = url.toString();
      return new Response(
        JSON.stringify({
          id: "pat-id-1",
          token_hash: hash,
          uid: "user-123",
          label: "My Claude PAT",
          prefix: token.slice(0, 12),
          scopes: ["notes:read", "notes:write"],
          created_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const authInfo = await verifyAccessToken(token);

    expect(authInfo.token).toBe(token);
    expect(authInfo.clientId).toBe("pat");
    expect(authInfo.scopes).toEqual(["notes:read", "notes:write"]);
    expect(authInfo.extra).toEqual({ uid: "user-123" });
    expect(authInfo.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(fetchedUrl).toContain(`/v1/oauth/pats/${hash}`);
  });

  it("verifies an OAuth access token by prefix, calls Go tokens endpoint, and maps AuthInfo", async () => {
    const { token, hash } = generateAccessToken();
    const expiryDate = new Date(Date.now() + 3600 * 1000).toISOString();

    let fetchedUrl = "";
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      fetchedUrl = url.toString();
      return new Response(
        JSON.stringify({
          kind: "access",
          client_id: "client-abc",
          uid: "user-oauth-456",
          scopes: ["notes:read"],
          resource: "http://localhost:5173/mcp",
          expires_at: expiryDate,
          created_at: new Date().toISOString(),
          revoked: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const authInfo = await verifyAccessToken(token);

    expect(authInfo.token).toBe(token);
    expect(authInfo.clientId).toBe("client-abc");
    expect(authInfo.scopes).toEqual(["notes:read"]);
    expect(authInfo.resource?.toString()).toBe("http://localhost:5173/mcp");
    expect(authInfo.extra).toEqual({ uid: "user-oauth-456" });
    expect(fetchedUrl).toContain(`/v1/oauth/tokens/${hash}`);
  });

  it("rejects unknown prefixes and does not make network calls", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;

    const unknownTokens = [
      "unknown_token_12345",
      "ain_xx_12345",
      generateRefreshToken().token, // refresh token cannot be used as access token
      "Bearer some-random-string",
    ];

    for (const tok of unknownTokens) {
      await expect(verifyAccessToken(tok)).rejects.toThrow(OAuthError);
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches positive results for 60 seconds", async () => {
    const { token, hash } = generatePat();
    let backendCalls = 0;

    globalThis.fetch = vi.fn(async () => {
      backendCalls++;
      return new Response(
        JSON.stringify({
          id: "pat-id-cached",
          token_hash: hash,
          uid: "user-cache",
          label: "Cache PAT",
          prefix: token.slice(0, 12),
          scopes: ["notes:read"],
          created_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    // First call -> backend hit
    const auth1 = await verifyAccessToken(token);
    expect(auth1.clientId).toBe("pat");
    expect(backendCalls).toBe(1);

    // Immediate second call -> cached, no backend hit
    const auth2 = await verifyAccessToken(token);
    expect(auth2.clientId).toBe("pat");
    expect(backendCalls).toBe(1);
  });

  it("invalidates cache after 60 seconds", async () => {
    vi.useFakeTimers();
    const { token, hash } = generatePat();
    let backendCalls = 0;

    globalThis.fetch = vi.fn(async () => {
      backendCalls++;
      return new Response(
        JSON.stringify({
          id: "pat-id-ttl",
          token_hash: hash,
          uid: "user-ttl",
          label: "TTL PAT",
          prefix: token.slice(0, 12),
          scopes: ["notes:read"],
          created_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    await verifyAccessToken(token);
    expect(backendCalls).toBe(1);

    // Advance 59 seconds -> still cached
    vi.advanceTimersByTime(59 * 1000);
    await verifyAccessToken(token);
    expect(backendCalls).toBe(1);

    // Advance 2 more seconds (61 seconds total) -> cache expired, refetches
    vi.advanceTimersByTime(2 * 1000);
    await verifyAccessToken(token);
    expect(backendCalls).toBe(2);
  });

  it("rejects revoked PATs", async () => {
    const { token } = generatePat();

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          id: "pat-revoked",
          uid: "user-revoked",
          label: "Revoked PAT",
          prefix: token.slice(0, 12),
          scopes: ["notes:read"],
          created_at: new Date(Date.now() - 3600000).toISOString(),
          revoked_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    await expect(verifyAccessToken(token)).rejects.toThrow(OAuthError);
  });

  it("rejects expired OAuth access tokens", async () => {
    const { token } = generateAccessToken();
    const pastDate = new Date(Date.now() - 1000).toISOString();

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          kind: "access",
          client_id: "client-expired",
          uid: "user-expired",
          scopes: ["notes:read"],
          expires_at: pastDate,
          created_at: new Date(Date.now() - 7200000).toISOString(),
          revoked: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    await expect(verifyAccessToken(token)).rejects.toThrow(OAuthError);
  });

  it("rejects 404 not found tokens from Go", async () => {
    const { token } = generatePat();

    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ code: "not_found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    await expect(verifyAccessToken(token)).rejects.toThrow(OAuthError);
  });
});
