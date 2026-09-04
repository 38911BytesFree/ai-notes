import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import Landing from "./_index";

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
});
