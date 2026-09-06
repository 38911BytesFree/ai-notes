import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import { VisibilityControl, formatPiiFlag } from "./VisibilityControl";
import { NoteCard } from "./NoteCard";
import type { NoteListItem } from "~/services/notes-api.server";

// Mock react-router's useFetcher
let mockFetcherData: any = null;
let mockFetcherState = "idle";
const mockSubmit = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useFetcher: () => ({
      data: mockFetcherData,
      state: mockFetcherState,
      Form: (props: React.FormHTMLAttributes<HTMLFormElement>) => (
        <form
          {...props}
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            mockSubmit(Object.fromEntries(formData.entries()));
          }}
        />
      ),
      submit: mockSubmit,
    }),
  };
});

describe("VisibilityControl Component", () => {
  beforeEach(() => {
    mockFetcherData = null;
    mockFetcherState = "idle";
    mockSubmit.mockClear();
  });

  it("renders three radio options with one-line explanations", () => {
    render(
      <MemoryRouter>
        <VisibilityControl
          noteId="note-123"
          visibility="private"
          publicBaseUrl="https://example.com"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("radio", { name: /^Private/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Unlisted/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Public/i })).toBeInTheDocument();

    expect(screen.getByText("Only you can view this note.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Anyone with the link can view. Excluded from public feed and search engines."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Visible to everyone on the public feed and indexed by search engines.")
    ).toBeInTheDocument();
  });

  it("does not render public link when private", () => {
    render(
      <MemoryRouter>
        <VisibilityControl
          noteId="note-123"
          visibility="private"
          publicBaseUrl="https://example.com"
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("Public link")).not.toBeInTheDocument();
    expect(screen.queryByText("Copy link")).not.toBeInTheDocument();
  });

  it("renders public URL and copy button when unlisted or public", () => {
    render(
      <MemoryRouter>
        <VisibilityControl
          noteId="note-123"
          visibility="public"
          publicBaseUrl="https://example.com"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Public link")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://example.com/n/note-123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("renders PII panel when piiFlags is non-empty with plain word descriptions", () => {
    render(
      <MemoryRouter>
        <VisibilityControl
          noteId="note-123"
          visibility="private"
          piiFlags={["api_key", "email"]}
          publicBaseUrl="https://example.com"
        />
      </MemoryRouter>
    );

    const panel = screen.getByTestId("pii-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.getByText(formatPiiFlag("api_key"))).toBeInTheDocument();
    expect(screen.getByText(formatPiiFlag("email"))).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /I have reviewed this and want to publish it anyway/i,
      })
    ).toBeInTheDocument();
  });

  it("submits acknowledge_pii when checkbox is checked", () => {
    render(
      <MemoryRouter>
        <VisibilityControl
          noteId="note-123"
          visibility="private"
          piiFlags={["jwt"]}
          publicBaseUrl="https://example.com"
        />
      </MemoryRouter>
    );

    // Select public
    const publicRadio = screen.getByRole("radio", { name: /^Public/i });
    fireEvent.click(publicRadio);

    // Check acknowledgement
    const checkbox = screen.getByRole("checkbox", {
      name: /I have reviewed this and want to publish it anyway/i,
    });
    fireEvent.click(checkbox);

    // Submit
    const submitBtn = screen.getByRole("button", { name: "Save visibility" });
    fireEvent.click(submitBtn);

    expect(mockSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: "visibility",
        visibility: "public",
        acknowledge_pii: "true",
      })
    );
  });

  it("re-renders PII panel when pii_unacknowledged response is received", () => {
    render(
      <MemoryRouter>
        <VisibilityControl
          noteId="note-123"
          visibility="private"
          publicBaseUrl="https://example.com"
          actionData={{ code: "pii_unacknowledged", pii_unacknowledged: true }}
        />
      </MemoryRouter>
    );

    const panel = screen.getByTestId("pii-panel");
    expect(panel).toBeInTheDocument();
    expect(
      screen.getByText(/Publishing refused: You must acknowledge the detected sensitive data/i)
    ).toBeInTheDocument();
  });
});

describe("NoteCard Visibility Badge", () => {
  const baseItem: NoteListItem = {
    id: "test-id",
    owner_uid: "uid-1",
    visibility: "private",
    title: "Test Note",
    summary: "Summary line 1\nSummary line 2",
    takeaways: ["takeaway 1"],
    category: "Programming",
    tags: ["go"],
    source: {
      provider: "chatgpt",
      fetched_at: "2026-09-01T00:00:00Z",
    },
    has_transcript: false,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };

  it("renders Public badge when visibility is public", () => {
    render(
      <MemoryRouter>
        <NoteCard note={{ ...baseItem, visibility: "public" }} />
      </MemoryRouter>
    );

    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("renders Unlisted badge when visibility is unlisted", () => {
    render(
      <MemoryRouter>
        <NoteCard note={{ ...baseItem, visibility: "unlisted" }} />
      </MemoryRouter>
    );

    expect(screen.getByText("Unlisted")).toBeInTheDocument();
  });

  it("does not render visibility badge when private", () => {
    render(
      <MemoryRouter>
        <NoteCard note={{ ...baseItem, visibility: "private" }} />
      </MemoryRouter>
    );

    expect(screen.queryByText("Public")).not.toBeInTheDocument();
    expect(screen.queryByText("Unlisted")).not.toBeInTheDocument();
  });
});
