import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import NoteDetailView from "./app.notes.$id";
import type { Note } from "~/services/notes-api.server";

const fixtureNote: Note = {
  id: "test-note-1234567890",
  owner_uid: "uid-123",
  visibility: "private",
  title: "Understanding Go Concurrency",
  summary: "This note covers goroutines, channels, and select statements in Go.",
  takeaways: [
    "Goroutines are lightweight threads managed by the Go runtime.",
    "Channels facilitate safe communication between goroutines without shared memory locks.",
  ],
  code_blocks: [
    {
      lang: "go",
      code: "func worker(ch chan int) {\n  ch <- 42\n}",
    },
  ],
  category: "Programming",
  tags: ["go", "concurrency"],
  source: {
    provider: "chatgpt",
    share_url: "https://chatgpt.com/share/test-share",
    model: "gpt-5",
    conversation_date: "2026-09-01T12:00:00Z",
    fetched_at: "2026-09-01T12:05:00Z",
  },
  has_transcript: true,
  transcript_bytes: 12288,
  created_at: "2026-09-01T12:05:00Z",
  updated_at: "2026-09-01T12:05:00Z",
};

let currentNote: Note = fixtureNote;

vi.mock("~/services/auth.server", () => ({
  requireAuth: vi.fn(async () => ({ user: { uid: "uid-123" } })),
}));

vi.mock("~/services/notes-api.server", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("~/services/notes-api.server");
  return {
    ...actual,
    patchNote: vi.fn(async () => ({
      ok: true,
      data: {
        ...fixtureNote,
        title: "Patched Title",
      },
    })),
    setNoteVisibility: vi.fn(async (_req, _id, visibility, acknowledgePii) => {
      if (visibility === "public" && !acknowledgePii) {
        return { ok: false, code: "pii_unacknowledged" };
      }
      return {
        ok: true,
        data: {
          ...fixtureNote,
          visibility,
        },
      };
    }),
    refineNote: vi.fn(async (_req, _id, instruction) => {
      if (!instruction) {
        return { ok: false, code: "invalid_argument" };
      }
      return {
        ok: true,
        data: {
          title: "Refined Title",
          summary: "Refined Summary",
          takeaways: ["Takeaway 1"],
          category: "Cooking",
          tags: ["refined"],
        },
      };
    }),
    integrateNote: vi.fn(async (_req, _id, payload) => {
      if (!payload.share_url && !payload.text) {
        return { ok: false, code: "invalid_argument" };
      }
      return {
        ok: true,
        data: {
          ...fixtureNote,
          title: "Integrated Title",
          summary: "Integrated Summary with new info",
        },
      };
    }),
  };
});

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useLoaderData: () => ({ note: currentNote, publicBaseUrl: "https://example.com" }),
    useFetcher: () => ({
      data: null,
      state: "idle",
      Form: (props: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props} />,
      submit: vi.fn(),
    }),
  };
});

import { action } from "./app.notes.$id";

describe("NoteDetailView", () => {
  it("renders note title, category, tags, summary, takeaways, code block, and provenance", () => {
    currentNote = fixtureNote;
    render(
      <MemoryRouter>
        <NoteDetailView />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Understanding Go Concurrency"
    );
    expect(screen.getByText("Programming")).toBeInTheDocument();
    expect(screen.getByText("#go")).toBeInTheDocument();
    expect(screen.getByText("#concurrency")).toBeInTheDocument();
    expect(
      screen.getByText("This note covers goroutines, channels, and select statements in Go.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Goroutines are lightweight threads managed by the Go runtime.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/func worker\(ch chan int\)/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Original transcript kept/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/ChatGPT conversation/)
    ).toBeInTheDocument();
  });

  it("handles notes with null or empty tags and takeaways gracefully without crashing", () => {
    currentNote = {
      ...fixtureNote,
      // @ts-expect-error test potential null from API
      tags: null,
      // @ts-expect-error test potential null from API
      takeaways: null,
      code_blocks: undefined,
    };

    render(
      <MemoryRouter>
        <NoteDetailView />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("executes patch action successfully returning serialized json", async () => {
    const params = new URLSearchParams();
    params.append("intent", "patch");
    params.append("title", "Patched Title");
    params.append("summary", "New Summary");
    params.append("category", "General");
    params.append("tags", "tag1, tag2");
    params.append("takeaways", "line1\nline2");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.note.title).toBe("Patched Title");
  });

  it("refuses visibility change when PII is unacknowledged", async () => {
    const params = new URLSearchParams();
    params.append("intent", "visibility");
    params.append("visibility", "public");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(403);
    const body = await resp.json();
    expect(body.code).toBe("pii_unacknowledged");
    expect(body.pii_unacknowledged).toBe(true);
  });

  it("accepts visibility change when PII is acknowledged", async () => {
    const params = new URLSearchParams();
    params.append("intent", "visibility");
    params.append("visibility", "public");
    params.append("acknowledge_pii", "true");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.note.visibility).toBe("public");
  });

  it("executes refine action successfully returning refined summary", async () => {
    const params = new URLSearchParams();
    params.append("intent", "refine");
    params.append("instruction", "focus only on the second recipe");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.refined.title).toBe("Refined Title");
    expect(body.refined.summary).toBe("Refined Summary");
    expect(body.refined.category).toBe("Cooking");
  });

  it("rejects refine action when instruction is empty", async () => {
    const params = new URLSearchParams();
    params.append("intent", "refine");
    params.append("instruction", "   ");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("invalid_argument");
  });

  it("renders the Update note button alongside Edit", () => {
    currentNote = fixtureNote;
    render(
      <MemoryRouter>
        <NoteDetailView />
      </MemoryRouter>
    );

    const updateBtn = screen.getByRole("button", { name: "Update note" });
    const editBtn = screen.getByRole("button", { name: "Edit" });
    expect(updateBtn).toBeInTheDocument();
    expect(editBtn).toBeInTheDocument();
  });

  it("executes integrate action with text payload successfully", async () => {
    const params = new URLSearchParams();
    params.append("intent", "integrate");
    params.append("text", "New conversation content to integrate");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.note.title).toBe("Integrated Title");
    expect(body.note.summary).toBe("Integrated Summary with new info");
  });

  it("executes integrate action with allowed share URL successfully", async () => {
    const params = new URLSearchParams();
    params.append("intent", "integrate");
    params.append("input", "https://chatgpt.com/share/some-id");
    params.append("keep_transcript", "true");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.note.title).toBe("Integrated Title");
  });

  it("rejects integrate action when share URL has unsupported provider", async () => {
    const params = new URLSearchParams();
    params.append("intent", "integrate");
    params.append("input", "https://unsupported-site.com/share/123");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("unsupported_provider");
  });

  it("rejects integrate action when input is empty", async () => {
    const params = new URLSearchParams();
    params.append("intent", "integrate");
    params.append("input", "   ");

    const req = new Request("http://localhost/app/notes/note-123", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const resp = await action({
      request: req,
      params: { id: "note-123" },
      context: {},
    } as any);

    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.code).toBe("invalid_argument");
  });
});


