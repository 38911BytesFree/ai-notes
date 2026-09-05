// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader, action } from "./oauth.consent";
import { createPendingCookieHeader } from "../../oauth/pending";
import * as oauthApi from "~/services/oauth-api.server";
import * as authServer from "~/services/auth.server";

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(async () => ({
    user: { uid: "user-123", email: "user@example.com" },
    session: {},
  })),
}));

vi.mock("~/services/oauth-api.server", () => ({
  getClient: vi.fn(async (clientId: string) => ({
    client_id: clientId,
    client_name: "Claude Code",
    redirect_uris: ["https://example.com/oauth/callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scopes: ["notes:read", "notes:write"],
  })),
  storeAuthorizationCode: vi.fn(async () => {}),
}));

describe("oauth.consent route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-long";
    process.env.PUBLIC_BASE_URL = "https://ai-notes.example.com";
  });

  async function createValidCookie() {
    return createPendingCookieHeader({
      client_id: "client-abc",
      redirect_uri: "https://example.com/oauth/callback",
      scopes: ["notes:read", "notes:write"],
      state: "xyz-state",
      code_challenge: "challenge-hash",
      resource: "https://ai-notes.example.com/mcp",
      createdAt: Date.now(),
    });
  }

  describe("loader", () => {
    it("throws 400 when no pending cookie is provided", async () => {
      const request = new Request("http://localhost/oauth/consent");
      await expect(loader({ request, params: {}, context: {} } as any)).rejects.toMatchObject({
        status: 400,
      });
    });

    it("returns clientName, user, and scopes with valid cookie", async () => {
      const cookieHeader = await createValidCookie();
      const request = new Request("http://localhost/oauth/consent", {
        headers: { Cookie: cookieHeader },
      });

      const data = await loader({ request, params: {}, context: {} } as any);
      expect(data.clientName).toBe("Claude Code");
      expect(data.user.email).toBe("user@example.com");
      expect(data.scopes).toEqual(["notes:read", "notes:write"]);
    });
  });

  describe("action", () => {
    it("throws 400 when no pending cookie is provided", async () => {
      const fd = new FormData();
      fd.append("decision", "deny");
      const request = new Request("http://localhost/oauth/consent", {
        method: "POST",
        body: fd,
      });

      await expect(action({ request, params: {}, context: {} } as any)).rejects.toMatchObject({
        status: 400,
      });
    });

    it("handles deny: redirects to redirect_uri with error=access_denied and clears cookie", async () => {
      const cookieHeader = await createValidCookie();
      const fd = new FormData();
      fd.append("decision", "deny");
      const request = new Request("http://localhost/oauth/consent", {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: fd,
      });

      const res = (await action({ request, params: {}, context: {} } as any)) as Response;
      expect(res.status).toBe(302);

      const location = res.headers.get("Location");
      expect(location).toBeDefined();
      const redirectUrl = new URL(location!);
      expect(redirectUrl.origin).toBe("https://example.com");
      expect(redirectUrl.pathname).toBe("/oauth/callback");
      expect(redirectUrl.searchParams.get("error")).toBe("access_denied");
      expect(redirectUrl.searchParams.get("state")).toBe("xyz-state");

      // Verify pending cookie is cleared
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toMatch(/__oauth_pending=;/);
    });

    it("handles approve: generates auth code, stores code in Go API, redirects with code, state, and iss", async () => {
      const cookieHeader = await createValidCookie();
      const fd = new FormData();
      fd.append("decision", "approve");
      const request = new Request("http://localhost/oauth/consent", {
        method: "POST",
        headers: { Cookie: cookieHeader },
        body: fd,
      });

      const res = (await action({ request, params: {}, context: {} } as any)) as Response;
      expect(res.status).toBe(302);

      const location = res.headers.get("Location");
      expect(location).toBeDefined();
      const redirectUrl = new URL(location!);
      expect(redirectUrl.origin).toBe("https://example.com");
      expect(redirectUrl.pathname).toBe("/oauth/callback");

      const code = redirectUrl.searchParams.get("code");
      expect(code).toMatch(/^ain_ac_/);
      expect(redirectUrl.searchParams.get("state")).toBe("xyz-state");
      expect(redirectUrl.searchParams.get("iss")).toBe("https://ai-notes.example.com");

      // Verify storeAuthorizationCode called with hashed code
      expect(oauthApi.storeAuthorizationCode).toHaveBeenCalledTimes(1);
      const stored = vi.mocked(oauthApi.storeAuthorizationCode).mock.calls[0][0];
      expect(stored.client_id).toBe("client-abc");
      expect(stored.uid).toBe("user-123");
      expect(stored.code_challenge).toBe("challenge-hash");
      expect(stored.code_challenge_method).toBe("S256");
      expect(stored.redirect_uri).toBe("https://example.com/oauth/callback");
      expect(stored.resource).toBe("https://ai-notes.example.com/mcp");

      // Verify pending cookie is cleared
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toMatch(/__oauth_pending=;/);
    });
  });
});
