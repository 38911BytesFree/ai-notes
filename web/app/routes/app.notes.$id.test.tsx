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

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useLoaderData: () => ({ note: fixtureNote }),
    useFetcher: () => ({
      data: null,
      state: "idle",
      Form: (props: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props} />,
      submit: vi.fn(),
    }),
  };
});

describe("NoteDetailView", () => {
  it("renders note title, category, tags, summary, takeaways, code block, and provenance", () => {
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
});
