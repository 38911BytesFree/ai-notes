import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyClientSecret } from "./client-auth";
import { hashToken } from "./tokens";

describe("verifyClientSecret", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  let fakeClients: Map<string, any>;

  const SECRET = "the-real-client-secret";

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend-api.local";
    process.env.BACKEND_USE_ID_TOKEN = "false";

    fakeClients = new Map([
      [
        "confidential",
        {
          client_id: "confidential",
          client_secret_hash: hashToken(SECRET),
          token_endpoint_auth_method: "client_secret_post",
        },
      ],
      [
        "public",
        { client_id: "public", token_endpoint_auth_method: "none" },
      ],
      [
        "expired",
        {
          client_id: "expired",
          client_secret_hash: hashToken(SECRET),
          client_secret_expires_at: 1000,
        },
      ],
    ]);

    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const match = input.toString().match(/\/v1\/oauth\/clients\/([^/]+)$/);
      const client = match ? fakeClients.get(match[1]) : undefined;
      if (!client) {
        return new Response(JSON.stringify({ code: "not_found" }), { status: 404 });
      }
      return new Response(JSON.stringify(client), { status: 200 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  function run(body: Record<string, unknown>) {
    const req = { body } as any;
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })), json } as any;
    const next = vi.fn();
    return { promise: verifyClientSecret()(req, res, next), res, next, json };
  }

  it("accepts a confidential client presenting the right secret", async () => {
    const { promise, next } = run({ client_id: "confidential", client_secret: SECRET });
    await promise;
    expect(next).toHaveBeenCalled();
  });

  it("rejects a confidential client presenting the wrong secret", async () => {
    const { promise, res, next } = run({
      client_id: "confidential",
      client_secret: "guess",
    });
    await promise;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a confidential client presenting no secret at all", async () => {
    const { promise, res, next } = run({ client_id: "confidential" });
    await promise;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects an expired client secret", async () => {
    const { promise, res, next } = run({ client_id: "expired", client_secret: SECRET });
    await promise;
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("lets a public client through, since PKCE is what protects it", async () => {
    const { promise, next } = run({ client_id: "public" });
    await promise;
    expect(next).toHaveBeenCalled();
  });

  it("leaves an unknown client to the SDK's own error handling", async () => {
    const { promise, next } = run({ client_id: "nobody" });
    await promise;
    expect(next).toHaveBeenCalled();
  });
});
