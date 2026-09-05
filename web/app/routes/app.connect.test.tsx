import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import { ConnectContent } from "./app.connect";

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useFetcher: () => ({
      data: null,
      state: "idle",
      Form: (props: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props} />,
      submit: vi.fn(),
    }),
  };
});

describe("app.connect", () => {
  const dummyPats = [
    {
      id: "pat-1",
      label: "Work Laptop",
      prefix: "ain_pat_1234",
      created_at: "2026-09-01T12:00:00Z",
      last_used_at: "2026-09-02T12:00:00Z",
    },
  ];

  it("renders the one-time reveal state with warning, token, and copy button", async () => {
    const revealedToken = {
      id: "pat-new-1",
      label: "Claude Code on Desktop",
      prefix: "ain_pat_9999",
      token: "ain_pat_9999abcdefghijklmnopqrstuvwxyz123456",
    };

    // Mock clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <MemoryRouter>
        <ConnectContent
          pats={dummyPats}
          publicBaseUrl="https://ai-notes.example.com"
          initialCreatedToken={revealedToken}
        />
      </MemoryRouter>
    );

    // Verify one-time reveal banner is present
    const banner = screen.getByTestId("pat-reveal-banner");
    expect(banner).toBeInTheDocument();

    // Verify warning text
    expect(
      screen.getByText(/Make sure to copy your personal access token now/)
    ).toBeInTheDocument();

    // Verify token is displayed in input
    const input = screen.getByTestId("pat-token-input") as HTMLInputElement;
    expect(input.value).toBe("ain_pat_9999abcdefghijklmnopqrstuvwxyz123456");

    // Verify copy button clicks and writes to clipboard
    const copyButton = screen.getByTestId("copy-pat-button");
    expect(copyButton).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalledWith(
      "ain_pat_9999abcdefghijklmnopqrstuvwxyz123456"
    );
  });

  it("renders client configuration snippets", () => {
    render(
      <MemoryRouter>
        <ConnectContent
          pats={dummyPats}
          publicBaseUrl="https://ai-notes.example.com"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("1. Claude Code")).toBeInTheDocument();
    expect(screen.getByText("2. Cursor")).toBeInTheDocument();
    expect(screen.getByText("3. Claude.ai")).toBeInTheDocument();
    expect(screen.getByText("4. ChatGPT")).toBeInTheDocument();
    expect(
      screen.getByText(/claude mcp add --transport http ai-notes https:\/\/ai-notes\.example\.com\/mcp/)
    ).toBeInTheDocument();
  });
});
