import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import Landing, { loader } from "./_index";
import * as authServer from "~/services/auth.server";

vi.mock("~/services/auth.server", () => ({
  validateAuth: vi.fn(),
}));

describe("Landing page", () => {
  it("renders product name, sentence, and sign-in link", () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("AI Notes");
    expect(
      screen.getByText("Save useful AI conversations into one private, searchable library.")
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
  });

  it("redirects authenticated users to /app", async () => {
    vi.mocked(authServer.validateAuth).mockResolvedValueOnce({
      isAuthenticated: true,
      authSession: {} as any,
      user: { uid: "user-1", email: "test@example.com" } as any,
    });

    const request = new Request("http://localhost:5173/");
    const res = await loader({ request } as any);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(302);
    expect((res as Response).headers.get("Location")).toBe("/app");
  });

  it("returns null for unauthenticated users so landing page renders", async () => {
    vi.mocked(authServer.validateAuth).mockResolvedValueOnce({
      isAuthenticated: false,
      authSession: {} as any,
    });

    const request = new Request("http://localhost:5173/");
    const res = await loader({ request } as any);
    expect(res).toBeNull();
  });
});
