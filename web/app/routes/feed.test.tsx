import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import FeedRoute, { loader } from "./feed";
import type { PublicNote } from "~/services/public-api.server";

const mockNotes: PublicNote[] = [
  {
    id: "feed-note-1",
    title: "Rust Ownership Model",
    summary: "Understanding borrow checking and lifetimes.",
    takeaways: ["Move semantics prevent double-free."],
    category: "Programming",
    tags: ["rust"],
    source: { provider: "claude" },
    visibility: "public",
    created_at: "2026-09-02T10:00:00Z",
    updated_at: "2026-09-02T10:00:00Z",
  },
  {
    id: "feed-note-2",
    title: "Venture Capital Basics",
    summary: "Term sheets, liquidation preferences, and dilution.",
    takeaways: ["Check 1x non-participating preferred."],
    category: "Finance & Investing",
    tags: ["vc", "finance"],
    source: { provider: "chatgpt" },
    visibility: "public",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-01T10:00:00Z",
  },
];

let mockListResult: any = {
  ok: true,
  data: {
    notes: mockNotes,
    next_cursor: "next-cursor-xyz",
  },
};

const mockListPublicNotes = vi.fn(async (params: any) => mockListResult);

vi.mock("~/services/public-api.server", () => ({
  listPublicNotes: (params: any) => mockListPublicNotes(params),
}));

let currentLoaderData: {
  notes: PublicNote[];
  next_cursor?: string;
  selectedCategory?: string;
} = {
  notes: mockNotes,
  next_cursor: "next-cursor-xyz",
  selectedCategory: undefined,
};

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useLoaderData: () => currentLoaderData,
    useNavigate: () => vi.fn(),
  };
});

describe("Public Feed route feed.tsx", () => {
  beforeEach(() => {
    mockListPublicNotes.mockClear();
    mockListResult = {
      ok: true,
      data: {
        notes: mockNotes,
        next_cursor: "next-cursor-xyz",
      },
    };
    currentLoaderData = {
      notes: mockNotes,
      next_cursor: "next-cursor-xyz",
      selectedCategory: undefined,
    };
  });

  it("loader parses category and cursor query params and queries listPublicNotes", async () => {
    const req = new Request("http://localhost/feed?category=Programming&cursor=cursor-123");
    const res = await loader({ request: req, params: {}, context: {} } as any);

    const headers = new Headers(res.init?.headers);
    expect(headers.get("Cache-Control")).toBe("public, max-age=120");

    expect(mockListPublicNotes).toHaveBeenCalledWith({
      category: "Programming",
      cursor: "cursor-123",
      limit: 30,
    });

    expect(res.data.notes.length).toBe(2);
    expect(res.data.selectedCategory).toBe("Programming");
    expect(res.data.next_cursor).toBe("next-cursor-xyz");
  });

  it("loader ignores invalid categories not in taxonomy", async () => {
    const req = new Request("http://localhost/feed?category=InvalidCategory");
    await loader({ request: req, params: {}, context: {} } as any);

    expect(mockListPublicNotes).toHaveBeenCalledWith({
      category: undefined,
      cursor: undefined,
      limit: 30,
    });
  });

  it("renders public feed notes and pagination link", () => {
    render(
      <MemoryRouter>
        <FeedRoute />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Public Feed");
    expect(screen.getByText("Rust Ownership Model")).toBeInTheDocument();
    expect(screen.getByText("Venture Capital Basics")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Load more notes/i })).toBeInTheDocument();
  });

  it("renders empty state when no notes are found", () => {
    currentLoaderData = {
      notes: [],
      next_cursor: undefined,
      selectedCategory: "Science",
    };

    render(
      <MemoryRouter>
        <FeedRoute />
      </MemoryRouter>
    );

    expect(screen.getByText("No public notes found")).toBeInTheDocument();
    expect(
      screen.getByText("There are no public notes in the Science category yet.")
    ).toBeInTheDocument();
  });
});
