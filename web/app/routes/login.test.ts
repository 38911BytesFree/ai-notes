import { describe, it, expect } from "vitest";
import { sanitizeReturnTo } from "./login";

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
