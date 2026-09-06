import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loader } from "./sitemap.xml";

vi.mock("~/services/public-api.server", () => ({
  listPublicNotes: vi.fn(async ({ cursor }: { cursor?: string }) => {
    if (!cursor) {
      return {
        ok: true,
        data: {
          notes: [
            { id: "note-1", updated_at: "2026-09-02T12:00:00Z" },
            { id: "note-2", updated_at: "2026-09-03T15:00:00Z" },
          ],
          next_cursor: "cursor-token-2",
        },
      };
    }
    if (cursor === "cursor-token-2") {
      return {
        ok: true,
        data: {
          notes: [{ id: "note-3", updated_at: "2026-09-04T18:00:00Z" }],
          next_cursor: undefined,
        },
      };
    }
    return {
      ok: true,
      data: { notes: [], next_cursor: undefined },
    };
  }),
}));

describe("sitemap.xml route", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty body when PUBLIC_INDEXING is not true", async () => {
    process.env.PUBLIC_INDEXING = "false";
    process.env.PUBLIC_BASE_URL = "https://notes.example.com";

    const res = await loader({ request: new Request("http://localhost/sitemap.xml") } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const text = await res.text();
    expect(text).toBe("");
  });

  it("pages listPublicNotes and generates sitemap with lastmod when PUBLIC_INDEXING is true", async () => {
    process.env.PUBLIC_INDEXING = "true";
    process.env.PUBLIC_BASE_URL = "https://notes.example.com";

    const res = await loader({ request: new Request("http://localhost/sitemap.xml") } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const text = await res.text();
    expect(text).toContain("<urlset");
    expect(text).toContain("<loc>https://notes.example.com/</loc>");
    expect(text).toContain("<loc>https://notes.example.com/feed</loc>");
    expect(text).toContain("<loc>https://notes.example.com/n/note-1</loc>");
    expect(text).toContain("<lastmod>2026-09-02T12:00:00.000Z</lastmod>");
    expect(text).toContain("<loc>https://notes.example.com/n/note-2</loc>");
    expect(text).toContain("<loc>https://notes.example.com/n/note-3</loc>");
  });
});
