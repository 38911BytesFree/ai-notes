import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loader } from "./robots.txt";

describe("robots.txt route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns Disallow: / when PUBLIC_INDEXING is not true", async () => {
    process.env.PUBLIC_INDEXING = "false";
    process.env.PUBLIC_BASE_URL = "https://notes.example.com";

    const res = await loader({ request: new Request("http://localhost/robots.txt") } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const text = await res.text();
    expect(text).toContain("User-agent: *\nDisallow: /");
    expect(text).not.toContain("Sitemap:");
  });

  it("allows public pages, disallows private routes, and links to sitemap when PUBLIC_INDEXING is true", async () => {
    process.env.PUBLIC_INDEXING = "true";
    process.env.PUBLIC_BASE_URL = "https://notes.example.com";

    const res = await loader({ request: new Request("http://localhost/robots.txt") } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const text = await res.text();
    expect(text).toContain("Allow: /");
    expect(text).toContain("Disallow: /app");
    expect(text).toContain("Disallow: /api");
    expect(text).toContain("Disallow: /mcp");
    expect(text).toContain("Disallow: /oauth");
    expect(text).toContain("Disallow: /login");
    expect(text).toContain("Sitemap: https://notes.example.com/sitemap.xml");
  });
});
