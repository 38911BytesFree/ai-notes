import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildServer } from "./server";
import { mcpSaveRateLimiter } from "./tools/save-note";

// Mock identity module
vi.mock("./identity", () => ({
  uidToIdToken: vi.fn(async (uid: string) => `mock-id-token-for-${uid}`),
}));

describe("mcp/server and tools", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.BACKEND_URL = "http://backend-api.local";
    process.env.PUBLIC_BASE_URL = "https://ai-notes.example.com";
    mcpSaveRateLimiter.reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("buildServer registers save_note, search_notes, and get_note tools", () => {
    const server = buildServer({
      authInfo: {
        token: "tok",
        clientId: "pat",
        scopes: ["notes:read", "notes:write"],
        extra: { uid: "user-test" },
      },
    });

    const registeredTools = (server as any)._registeredTools;
    expect(registeredTools).toHaveProperty("save_note");
    expect(registeredTools).toHaveProperty("search_notes");
    expect(registeredTools).toHaveProperty("get_note");
  });

  describe("save_note tool", () => {
    it("saves a note via Go API and returns structured content with note URL", async () => {
      let requestBody: any = null;
      let authHeader = "";

      globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const rawHeaders = init?.headers;
        if (rawHeaders instanceof Headers) {
          authHeader = rawHeaders.get("authorization") || "";
        } else if (rawHeaders) {
          authHeader = (rawHeaders as any).Authorization || (rawHeaders as any).authorization || "";
        }
        requestBody = JSON.parse(init?.body as string);
        return new Response(
          JSON.stringify({
            id: "note-saved-12345",
            title: "Test Note",
            category: "Programming",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      const server = buildServer({
        authInfo: {
          token: "tok",
          clientId: "pat",
          scopes: ["notes:read", "notes:write"],
          extra: { uid: "user-save" },
        },
      });

      const handler = (server as any)._registeredTools.save_note.handler;
      const result = await handler({
        title: "Test Note",
        summary: "This is a great test note summary.",
        takeaways: ["Takeaway 1", "Takeaway 2"],
        category: "Programming",
        tags: ["vitest", "mcp"],
        source: { provider: "claude" },
      });

      expect(result.isError).toBeFalsy();
      expect(authHeader).toBe("Bearer mock-id-token-for-user-save");
      expect(requestBody.title).toBe("Test Note");
      expect(result.structuredContent).toEqual({
        id: "note-saved-12345",
        url: "https://ai-notes.example.com/app/notes/note-saved-12345",
        title: "Test Note",
        category: "Programming",
      });
      expect(result.content[0].text).toContain("Saved note \"Test Note\"");
    });

    it("enforces rate limiting per UID at 60/min", async () => {
      const server = buildServer({
        authInfo: {
          token: "tok",
          clientId: "pat",
          scopes: ["notes:read", "notes:write"],
          extra: { uid: "user-rate-limited" },
        },
      });

      globalThis.fetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({ id: "note-1", title: "Note", category: "Personal" }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      const handler = (server as any)._registeredTools.save_note.handler;

      // Exhaust 60 tokens in bucket
      for (let i = 0; i < 60; i++) {
        mcpSaveRateLimiter.consume("user-rate-limited");
      }

      // Next call should be rate limited
      const result = await handler({
        title: "Overflow Note",
        summary: "Summary text",
        takeaways: ["Takeaway"],
        source: { provider: "chatgpt" },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent.code).toBe("rate_limited");
    });
  });

  describe("search_notes tool", () => {
    it("searches notes and formats results with distances and summaries", async () => {
      let searchUrl = "";
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        searchUrl = url.toString();
        return new Response(
          JSON.stringify({
            notes: [
              {
                id: "note-s1",
                title: "Rust Ownership",
                category: "Programming",
                summary: "Learn Rust ownership rules and borrow checker.",
                tags: ["rust"],
                created_at: "2026-09-01T10:00:00Z",
                distance: 0.12,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      const server = buildServer({
        authInfo: {
          token: "tok",
          clientId: "pat",
          scopes: ["notes:read"],
          extra: { uid: "user-search" },
        },
      });

      const handler = (server as any)._registeredTools.search_notes.handler;
      const result = await handler({
        query: "rust borrow checker",
        limit: 5,
        category: "Programming",
      });

      expect(result.isError).toBeFalsy();
      expect(searchUrl).toContain("q=rust+borrow+checker");
      expect(searchUrl).toContain("limit=5");
      expect(searchUrl).toContain("category=Programming");
      expect(result.structuredContent.notes).toHaveLength(1);
      expect(result.structuredContent.notes[0].id).toBe("note-s1");
      expect(result.content[0].text).toContain("Rust Ownership");
    });
  });

  describe("get_note tool", () => {
    it("retrieves a note with optional transcript and renders markdown", async () => {
      globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = url.toString();
        if (urlStr.includes("/transcript")) {
          return new Response(
            JSON.stringify({
              provider: "claude",
              messages: [{ role: "user", content: "Explain quantum computing" }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            id: "note-g1",
            title: "Quantum Basics",
            category: "Science",
            summary: "Superposition and entanglement basics.",
            takeaways: ["Qubits can exist in superposition."],
            code_blocks: [{ lang: "python", code: "import qiskit" }],
            has_transcript: true,
            created_at: "2026-09-01T12:00:00Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as any;

      const server = buildServer({
        authInfo: {
          token: "tok",
          clientId: "pat",
          scopes: ["notes:read"],
          extra: { uid: "user-get" },
        },
      });

      const handler = (server as any)._registeredTools.get_note.handler;
      const result = await handler({
        note_id: "note-g1",
        include_transcript: true,
      });

      expect(result.isError).toBeFalsy();
      expect(result.structuredContent.title).toBe("Quantum Basics");
      expect(result.structuredContent.transcript).toBeDefined();
      expect(result.content[0].text).toContain("# Quantum Basics");
      expect(result.content[0].text).toContain("import qiskit");
    });
  });
});
