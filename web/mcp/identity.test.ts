import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCreateCustomToken = vi.fn();

vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{ name: "[DEFAULT]" }]),
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: vi.fn(() => ({
    createCustomToken: mockCreateCustomToken,
  })),
}));

import { uidToIdToken, _clearIdentityCacheForTesting } from "./identity";

describe("mcp/identity", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useRealTimers();
    mockCreateCustomToken.mockReset();
    _clearIdentityCacheForTesting();
    process.env.VITE_FIREBASE_API_KEY = "test-api-key";
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("exchanges custom token for ID token and caches per UID", async () => {
    mockCreateCustomToken.mockResolvedValue("custom-token-uid1");

    let fetchCount = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          idToken: "id-token-uid1",
          expiresIn: "3600",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    // First call -> calls createCustomToken and fetch
    const token1 = await uidToIdToken("uid-1");
    expect(token1).toBe("id-token-uid1");
    expect(mockCreateCustomToken).toHaveBeenCalledWith("uid-1");
    expect(fetchCount).toBe(1);

    // Second call -> returns from cache, no new fetch or createCustomToken call
    const token2 = await uidToIdToken("uid-1");
    expect(token2).toBe("id-token-uid1");
    expect(fetchCount).toBe(1);
    expect(mockCreateCustomToken).toHaveBeenCalledTimes(1);

    // Different UID -> fetches separately
    mockCreateCustomToken.mockResolvedValue("custom-token-uid2");
    (globalThis.fetch as any).mockImplementationOnce(async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          idToken: "id-token-uid2",
          expiresIn: "3600",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });

    const token3 = await uidToIdToken("uid-2");
    expect(token3).toBe("id-token-uid2");
    expect(fetchCount).toBe(2);
    expect(mockCreateCustomToken).toHaveBeenCalledWith("uid-2");
  });

  it("refreshes ID token near expiry (expiresIn - 5 minutes)", async () => {
    vi.useFakeTimers();
    mockCreateCustomToken.mockResolvedValue("custom-token-uid1");

    let fetchCall = 0;
    globalThis.fetch = vi.fn(async () => {
      fetchCall++;
      return new Response(
        JSON.stringify({
          idToken: `id-token-${fetchCall}`,
          // 360 seconds (6 minutes) -> cache valid for 360 - 300 = 60 seconds
          expiresIn: "360",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const token1 = await uidToIdToken("uid-expiry");
    expect(token1).toBe("id-token-1");
    expect(fetchCall).toBe(1);

    // Advance 30 seconds -> should still be cached
    vi.advanceTimersByTime(30 * 1000);
    const tokenCached = await uidToIdToken("uid-expiry");
    expect(tokenCached).toBe("id-token-1");
    expect(fetchCall).toBe(1);

    // Advance another 35 seconds (total 65s > 60s) -> should refresh
    vi.advanceTimersByTime(35 * 1000);
    const tokenRefreshed = await uidToIdToken("uid-expiry");
    expect(tokenRefreshed).toBe("id-token-2");
    expect(fetchCall).toBe(2);
  });

  it("targets the emulator when FIREBASE_AUTH_EMULATOR_HOST is set", async () => {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    mockCreateCustomToken.mockResolvedValue("custom-token-emu");

    let requestedUrl = "";
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      requestedUrl = url.toString();
      return new Response(
        JSON.stringify({
          idToken: "id-token-emu",
          expiresIn: "3600",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const token = await uidToIdToken("uid-emu");
    expect(token).toBe("id-token-emu");
    expect(requestedUrl).toContain("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken");
  });
});
