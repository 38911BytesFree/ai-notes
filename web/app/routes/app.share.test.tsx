import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router";
import ShareTargetRoute, { action, loader } from "./app.share";
import { setPendingShare } from "~/services/share-pending.server";

let mockIsAuthenticated = false;
let mockUser: any = null;

vi.mock("~/services/auth.server", () => ({
  validateAuth: vi.fn(async () => {
    if (mockIsAuthenticated) {
      return { isAuthenticated: true, user: mockUser || { uid: "uid-1" } };
    }
    return { isAuthenticated: false };
  }),
  requireAuth: vi.fn(async () => {
    if (mockIsAuthenticated) {
      return { isAuthenticated: true, user: mockUser || { uid: "uid-1" } };
    }
    throw new Response(null, { status: 302, headers: { Location: "/login" } });
  }),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-router");
  return {
    ...actual,
    useLoaderData: () => ({
      url: "https://chatgpt.com/share/test-share",
      title: "Test Share Title",
      text: "",
    }),
    useFetcher: () => ({
      data: null,
      state: "idle",
      Form: (props: React.FormHTMLAttributes<HTMLFormElement>) => <form {...props} />,
      submit: vi.fn(),
    }),
    useNavigate: () => vi.fn(),
  };
});

describe("app.share route", () => {
  beforeEach(() => {
    mockIsAuthenticated = false;
    mockUser = null;
  });

  it("unauthenticated action writes cookie and redirects to login with next=/app/share", async () => {
    mockIsAuthenticated = false;

    const params = new URLSearchParams();
    params.append("text", "Check out https://chatgpt.com/share/android-share");

    const req = new Request("http://localhost/app/share", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const res = await action({ request: req, params: {}, context: {} } as any);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("/login?next=/app/share");
    expect(res.headers.get("Set-Cookie")).toContain("__share_pending=");
  });

  it("authenticated action writes cookie and 303 redirects to /app/share", async () => {
    mockIsAuthenticated = true;
    mockUser = { uid: "user-123" };

    const params = new URLSearchParams();
    params.append("url", "https://claude.ai/share/auth-share");
    params.append("title", "My Claude Chat");

    const req = new Request("http://localhost/app/share", {
      method: "POST",
      body: params.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const res = await action({ request: req, params: {}, context: {} } as any);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/app/share");
    expect(res.headers.get("Set-Cookie")).toContain("__share_pending=");
  });

  it("authenticated loader clears the cookie and yields the URL and payload", async () => {
    mockIsAuthenticated = true;
    mockUser = { uid: "user-123" };

    const cookieHeader = await setPendingShare({
      url: "https://chatgpt.com/share/saved-chat",
      title: "Saved Chat",
      text: "Some notes",
    });

    const cookieVal = cookieHeader.split(";")[0];
    const req = new Request("http://localhost/app/share", {
      headers: {
        Cookie: cookieVal,
      },
    });

    const res = await loader({ request: req, params: {}, context: {} } as any);
    expect(res.data.url).toBe("https://chatgpt.com/share/saved-chat");
    expect(res.data.title).toBe("Saved Chat");

    // Verify Set-Cookie clears the cookie
    const setCookie = res.init?.headers ? new Headers(res.init.headers).get("Set-Cookie") : null;
    expect(setCookie).toContain("__share_pending=;");
    expect(setCookie).toContain("Max-Age=0");
  });

  it("renders confirmation view with detected provider and save button", () => {
    render(
      <MemoryRouter>
        <ShareTargetRoute />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Save to AI Notes");
    expect(screen.getByText(/chatgpt/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save to AI Notes" })).toBeInTheDocument();
  });
});
