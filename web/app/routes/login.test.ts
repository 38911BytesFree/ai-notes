import { describe, it, expect, vi } from "vitest";
import { sanitizeReturnTo, loader } from "./login";
import * as authServer from "~/services/auth.server";

vi.mock("~/services/auth.server", () => ({
  validateAuth: vi.fn(),
}));

describe("sanitizeReturnTo", () => {
  it("allows safe relative paths", () => {
    expect(sanitizeReturnTo("/app")).toBe("/app");
    expect(sanitizeReturnTo("/app/settings")).toBe("/app/settings");
    expect(sanitizeReturnTo("/notes/123")).toBe("/notes/123");
  });

  it("rejects open redirects and protocol-relative URLs", () => {
    expect(sanitizeReturnTo("//evil.com")).toBe("/app");
    expect(sanitizeReturnTo("//evil.com/app")).toBe("/app");
    expect(sanitizeReturnTo("https://evil.com")).toBe("/app");
    expect(sanitizeReturnTo("http://evil.com")).toBe("/app");
    expect(sanitizeReturnTo("javascript:alert(1)")).toBe("/app");
  });

  it("handles empty or missing returnTo", () => {
    expect(sanitizeReturnTo("")).toBe("/app");
    expect(sanitizeReturnTo(null)).toBe("/app");
    expect(sanitizeReturnTo(undefined)).toBe("/app");
  });
});

describe("login loader", () => {
  it("redirects authenticated users to /app by default", async () => {
    vi.mocked(authServer.validateAuth).mockResolvedValueOnce({
      isAuthenticated: true,
      authSession: {} as any,
      user: { uid: "user-1", email: "test@example.com" } as any,
    });

    const request = new Request("http://localhost:5173/login");
    const res = await loader({ request } as any);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get("Location")).toBe("/app");
  });

  it("redirects authenticated users to returnTo destination", async () => {
    vi.mocked(authServer.validateAuth).mockResolvedValueOnce({
      isAuthenticated: true,
      authSession: {} as any,
      user: { uid: "user-1", email: "test@example.com" } as any,
    });

    const request = new Request("http://localhost:5173/login?returnTo=%2Fapp%2Fnotes%2Fnote-123");
    const res = await loader({ request } as any);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get("Location")).toBe("/app/notes/note-123");
  });

  it("returns null for unauthenticated users so login form renders", async () => {
    vi.mocked(authServer.validateAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      authSession: {} as any,
    });

    const request = new Request("http://localhost:5173/login");
    const res = await loader({ request } as any);
    expect(res).toBeNull();
  });
});
