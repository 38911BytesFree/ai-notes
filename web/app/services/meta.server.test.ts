import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildArticleJsonLd,
  buildCanonicalUrl,
  buildPublicNoteMeta,
  getPublicBaseUrl,
} from "./meta.server";
import type { PublicNote } from "./public-api.server";

const mockNote: PublicNote = {
  id: "test-note-1",
  title: "Test Note Title",
  summary: "This is a test summary with <script>alert(1)</script> dangerous characters.",
  takeaways: ["takeaway 1"],
  category: "Programming",
  tags: ["typescript"],
  source: {
    provider: "chatgpt",
    share_url: "https://chatgpt.com/share/test",
  },
  visibility: "public",
  published_at: "2026-09-01T12:00:00Z",
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-02T15:00:00Z",
};

describe("meta.server", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getPublicBaseUrl and buildCanonicalUrl", () => {
    it("uses PUBLIC_BASE_URL env var and strips trailing slash", () => {
      process.env.PUBLIC_BASE_URL = "https://notes.example.com/";
      expect(getPublicBaseUrl()).toBe("https://notes.example.com");
      expect(buildCanonicalUrl("/n/test-123")).toBe("https://notes.example.com/n/test-123");
    });

    it("falls back to default baseUrl if PUBLIC_BASE_URL is not set", () => {
      delete process.env.PUBLIC_BASE_URL;
      expect(getPublicBaseUrl()).toBe("http://localhost:3000");
      expect(buildCanonicalUrl("/feed")).toBe("http://localhost:3000/feed");
    });
  });

  describe("buildArticleJsonLd", () => {
    it("escapes raw < characters with \\u003c to prevent script injection", () => {
      process.env.PUBLIC_BASE_URL = "https://notes.example.com";
      const jsonLd = buildArticleJsonLd(mockNote);
      expect(jsonLd).not.toContain("<script>");
      expect(jsonLd).toContain("\\u003cscript>");
      expect(jsonLd).toContain('"@type":"Article"');
      expect(jsonLd).toContain('"headline":"Test Note Title"');
    });
  });

  describe("buildPublicNoteMeta", () => {
    it("constructs canonical and OG URLs using PUBLIC_BASE_URL and never Host header", () => {
      process.env.PUBLIC_BASE_URL = "https://notes.example.com";
      process.env.PUBLIC_INDEXING = "true";

      const tags = buildPublicNoteMeta(mockNote);

      const canonicalTag = tags.find(
        (t: any) => t.tagName === "link" && t.rel === "canonical"
      );
      expect(canonicalTag).toBeDefined();
      expect((canonicalTag as any).href).toBe("https://notes.example.com/n/test-note-1");

      const ogUrlTag = tags.find((t: any) => t.property === "og:url");
      expect(ogUrlTag).toBeDefined();
      expect((ogUrlTag as any).content).toBe("https://notes.example.com/n/test-note-1");

      const ogImageTag = tags.find((t: any) => t.property === "og:image");
      expect(ogImageTag).toBeDefined();
      expect((ogImageTag as any).content).toBe("https://notes.example.com/og-default.png");

      const robotsTag = tags.find((t: any) => t.name === "robots");
      expect(robotsTag).toBeDefined();
      expect((robotsTag as any).content).toBe("index, follow");
    });

    it("sets robots to noindex when note is unlisted even if indexing is enabled", () => {
      process.env.PUBLIC_BASE_URL = "https://notes.example.com";
      process.env.PUBLIC_INDEXING = "true";

      const tags = buildPublicNoteMeta({
        ...mockNote,
        visibility: "unlisted",
      });

      const robotsTag = tags.find((t: any) => t.name === "robots");
      expect(robotsTag).toBeDefined();
      expect((robotsTag as any).content).toBe("noindex, nofollow");
    });

    it("sets robots to noindex when PUBLIC_INDEXING is not true", () => {
      process.env.PUBLIC_BASE_URL = "https://notes.example.com";
      process.env.PUBLIC_INDEXING = "false";

      const tags = buildPublicNoteMeta(mockNote);

      const robotsTag = tags.find((t: any) => t.name === "robots");
      expect(robotsTag).toBeDefined();
      expect((robotsTag as any).content).toBe("noindex, nofollow");
    });
  });
});
