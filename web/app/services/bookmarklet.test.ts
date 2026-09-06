import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getBookmarkletCode } from "./bookmarklet";

describe("bookmarklet service", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("generates javascript: URI with correct scheme, encoding, and PUBLIC_BASE_URL", () => {
    process.env.PUBLIC_BASE_URL = "https://notes.example.com";
    const code = getBookmarkletCode();

    expect(code.startsWith("javascript:void(open('")).toBe(true);
    expect(code).toContain("https://notes.example.com/app/share?url='+encodeURIComponent(location.href)");
    expect(code.endsWith(",'_blank'))")).toBe(true);
  });

  it("strips trailing slash from baseUrl", () => {
    const code = getBookmarkletCode("https://ai-notes.app/");
    expect(code).toContain("https://ai-notes.app/app/share?url=");
    expect(code).not.toContain("https://ai-notes.app//app/share");
  });

  it("never includes hardcoded origins when a custom baseUrl is supplied", () => {
    const code = getBookmarkletCode("https://custom-domain.org");
    expect(code).toContain("https://custom-domain.org/app/share");
    expect(code).not.toContain("localhost");
  });
});
