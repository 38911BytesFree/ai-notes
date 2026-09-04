import { redirect } from "react-router";
import type { Session } from "react-router";
import { validateToken } from "~/services/auth-api.server";
import type { UserData } from "~/services/auth-api.server";
import { authenticationStorage } from "~/services/session.server";

export type ValidateAuthResult = {
  isAuthenticated: boolean;
  authSession: Session;
  user?: UserData;
  clearCookie?: string;
  serviceError?: boolean;
};

export async function validateAuth(request: Request): Promise<ValidateAuthResult> {
  const authSession = await authenticationStorage.getSession(
    request.headers.get("Cookie")
  );

  const token = authSession.get("auth_token");
  if (!token) {
    return { isAuthenticated: false, authSession };
  }

  try {
    const res = await validateToken(token);
    if (res.ok) {
      return { isAuthenticated: true, authSession, user: res.user };
    }
    // Token was explicitly rejected (e.g. 401 unauthenticated) -> clear stale cookie
    const clearCookie = await authenticationStorage.destroySession(authSession);
    return { isAuthenticated: false, authSession, clearCookie };
  } catch (error) {
    // API is unreachable / network error -> keep cookie so user is not forcibly logged out
    console.warn("[auth] backend unreachable, keeping session", error);
    return { isAuthenticated: false, authSession, serviceError: true };
  }
}

export async function requireAuth(request: Request): Promise<ValidateAuthResult> {
  const result = await validateAuth(request);
  if (result.serviceError) {
    throw new Response("Authentication service is temporarily unavailable.", {
      status: 503,
    });
  }
  if (!result.isAuthenticated || !result.user) {
    const url = new URL(request.url);
    throw redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`, {
      headers: result.clearCookie ? { "Set-Cookie": result.clearCookie } : undefined,
    });
  }
  return result;
}

export async function getAuthToken(request: Request): Promise<string | null> {
  const session = await authenticationStorage.getSession(request.headers.get("Cookie"));
  return session.get("auth_token") ?? null;
}
