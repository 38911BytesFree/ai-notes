import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import PublicNoteRoute, { loader, headers } from "./n.$id";
import type { PublicNote } from "~/services/public-api.server";

const mockPublicNote: PublicNote = {
  id: "public-note-1",
  title: "Building Microservices in Go",
  summary: "A comprehensive guide to building resilient microservices in Go.",
  takeaways: ["Use context for cancellation and timeouts.", "Structure errors with symbolic codes."],
  code_blocks: [{ lang: "go", code: "func main() {}" }],
  category: "Programming",
  tags: ["go", "microservices"],
  source: {
    provider: "chatgpt",
    share_url: "https://chatgpt.com/share/test-share",
    model: "gpt-5",
    conversation_date: "2026-09-01T12:00:00Z",
  },
  visibility: "public",
  published_at: "2026-09-01T12:00:00Z",
  created_at: "2026-09-01T12:00:00Z",
  updated_at: "2026-09-01T12:00:00Z",
};

let currentApiResult: any = { ok: true, data: mockPublicNote };

vi.mock("~/services/public-api.server", () => ({
  getPublicNote: vi.fn(async (id: string) => {
    if (id === "non-existent" || id === "private-note") {
      return { ok: false, code: "not_found", status: 404 };
    }
    return currentApiResult;
  }),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useLoaderData: () => ({
      note: mockPublicNote,
      jsonLd: '{"@type":"Article"}',
      noindex: false,
    }),
  };
});

describe("Public note route n.$id", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    currentApiResult = { ok: true, data: mockPublicNote };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws 404 response when note is private or not found", async () => {
    const req = new Request("http://localhost/n/private-note");
    await expect(
      loader({ request: req, params: { id: "private-note" }, context: {} } as any)
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns 200 with note data and headers for public note", async () => {
    process.env.PUBLIC_INDEXING = "true";
    const req = new Request("http://localhost/n/public-note-1");
    const res = await loader({
      request: req,
      params: { id: "public-note-1" },
      context: {},
    } as any);

    expect(res.data.note.id).toBe("public-note-1");
    expect(res.data.note.title).toBe("Building Microservices in Go");
    const resHeaders = new Headers(res.init?.headers);
    expect(resHeaders.get("Cache-Control")).toBe("public, max-age=300");
    expect(resHeaders.get("X-Robots-Tag")).toBeNull();
  });

  it("sets X-Robots-Tag: noindex header when note is unlisted", async () => {
    currentApiResult = {
      ok: true,
      data: { ...mockPublicNote, visibility: "unlisted" },
    };

    const req = new Request("http://localhost/n/public-note-1");
    const res = await loader({
      request: req,
      params: { id: "public-note-1" },
      context: {},
    } as any);

    const resHeaders = new Headers(res.init?.headers);
    expect(resHeaders.get("X-Robots-Tag")).toBe("noindex");

    const h = headers({ loaderHeaders: resHeaders });
    expect(h.get("X-Robots-Tag")).toBe("noindex");
  });

  it("renders public note view with title, takeaways, provenance and source link", () => {
    render(
      <MemoryRouter>
        <PublicNoteRoute />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Building Microservices in Go"
    );
    expect(screen.getByText("Programming")).toBeInTheDocument();
    expect(screen.getByText("#go")).toBeInTheDocument();
    expect(
      screen.getByText("A comprehensive guide to building resilient microservices in Go.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Use context for cancellation and timeouts.")
    ).toBeInTheDocument();
    expect(screen.getByText("ChatGPT conversation")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /View original conversation/i })
    ).toHaveAttribute("rel", "noopener nofollow ugc");
  });
});
