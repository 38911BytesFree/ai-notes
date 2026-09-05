// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~/services/auth.server", () => ({
  getAuthToken: vi.fn(async () => "mock-token"),
}));

vi.mock("~/services/backend.server", () => ({
  backendFetch: vi.fn(),
}));

import { ingest, patchNote, getNote } from "./notes-api.server";
import { backendFetch } from "~/services/backend.server";

describe("notes-api.server non-circular response serialization", () => {
  beforeEach(() => {
    vi.mocked(backendFetch).mockReset();
  });

  it("returns non-circular object from ingest that can be serialized with Response.json", async () => {
    const rawNote = {
      id: "note-123",
      title: "Test Note",
      summary: "Summary",
      takeaways: ["t1", "t2"],
      category: "Programming",
      tags: ["test"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.mocked(backendFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(rawNote), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = new Request("http://localhost/api/ingest");
    const result = await ingest(req, { text: "hello" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Direct and nested data access
    expect(result.id).toBe("note-123");
    expect(result.data.id).toBe("note-123");

    // Must NOT be circular
    expect(result.data).not.toHaveProperty("data");

    // Must serialize cleanly with Response.json (as in api.ingest action)
    expect(() => {
      Response.json({ ok: true, id: result.data.id, note: result.data }, { status: 201 });
    }).not.toThrow();

    // Must serialize cleanly with JSON.stringify
    const jsonStr = JSON.stringify(result.data);
    expect(jsonStr).toContain('"id":"note-123"');
  });

  it("returns non-circular object from patchNote that can be serialized with Response.json", async () => {
    const rawNote = {
      id: "note-456",
      title: "Updated Title",
      summary: "Updated Summary",
      takeaways: ["t1"],
      category: "Work",
      tags: ["tag1"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.mocked(backendFetch).mockResolvedValueOnce(
      new Response(JSON.stringify(rawNote), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = new Request("http://localhost/app/notes/note-456");
    const result = await patchNote(req, "note-456", { title: "Updated Title" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Must NOT be circular
    expect(result.data).not.toHaveProperty("data");

    // Must serialize cleanly with Response.json (as in app.notes.$id action)
    expect(() => {
      Response.json({ ok: true, note: result.data });
    }).not.toThrow();
  });

  it("handles 204 No Content without circular structure", async () => {
    vi.mocked(backendFetch).mockResolvedValueOnce(
      new Response(null, { status: 204 })
    );

    const req = new Request("http://localhost/app/notes/note-456");
    const result = await patchNote(req, "note-456", {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data).not.toHaveProperty("data");
    expect(() => JSON.stringify(result.data)).not.toThrow();
  });
});
