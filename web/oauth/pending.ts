import { createCookie } from "react-router";

const sessionSecret =
  process.env.SESSION_SECRET || "dev-session-secret-change-in-production";

export const oauthPendingCookie = createCookie("__oauth_pending", {
  sameSite: "lax",
  path: "/",
  httpOnly: true,
  secrets: [sessionSecret],
  secure: process.env.NODE_ENV === "production",
  maxAge: 600, // 10 minutes
});

export interface OAuthPendingPayload {
  client_id: string;
  redirect_uri: string;
  scopes: string[];
  state?: string;
  code_challenge: string;
  resource: string;
  createdAt: number;
}

export async function createPendingCookieHeader(
  payload: OAuthPendingPayload
): Promise<string> {
  return oauthPendingCookie.serialize(payload);
}

export async function parsePendingCookie(
  cookieHeader: string | null | undefined
): Promise<OAuthPendingPayload | null> {
  if (!cookieHeader) return null;
  const parsed = (await oauthPendingCookie.parse(cookieHeader)) as OAuthPendingPayload | null;
  if (!parsed || !parsed.client_id || !parsed.redirect_uri) {
    return null;
  }
  // Check age: 10 minutes max (600,000 ms)
  if (Date.now() - parsed.createdAt > 600_000) {
    return null;
  }
  return parsed;
}

export async function clearPendingCookieHeader(): Promise<string> {
  return oauthPendingCookie.serialize("", { maxAge: 0 });
}
