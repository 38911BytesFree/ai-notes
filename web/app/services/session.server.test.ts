import { describe, it, expect } from "vitest";
import { authenticationStorage } from "./session.server";

describe("session.server", () => {
  it("round-trips auth_token through cookie serialization and parsing", async () => {
    const session = await authenticationStorage.getSession();
    session.set("auth_token", "sample-firebase-id-token-12345");

    const cookieHeader = await authenticationStorage.commitSession(session);
    expect(cookieHeader).toContain("__session=");

    // Extract cookie value for Cookie request header
    const cookieValue = cookieHeader.split(";")[0];
    const parsedSession = await authenticationStorage.getSession(cookieValue);

    expect(parsedSession.get("auth_token")).toBe("sample-firebase-id-token-12345");

    const clearCookieHeader = await authenticationStorage.destroySession(parsedSession);
    expect(clearCookieHeader).toContain("__session=;");
  });
});
