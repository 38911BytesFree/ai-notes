import { createCookie } from "react-router";

const sessionSecret = process.env.SESSION_SECRET || "dev-session-secret-change-in-production";

export interface SharePendingPayload {
  url?: string;
  title?: string;
  text?: string;
}

export const sharePendingCookie = createCookie("__share_pending", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secrets: [sessionSecret],
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 10, // 10 minutes
});

/**
 * Extracts a valid http(s) URL from url or text.
 * The shared URL is url if present, otherwise the first https?:// token in text.
 */
export function extractShareUrl(url?: string | null, text?: string | null): string | undefined {
  if (url) {
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        new URL(trimmed);
        return trimmed;
      } catch {
        // invalid URL
      }
    }
  }

  if (text) {
    const match = text.match(/https?:\/\/[^\s]+/i);
    if (match) {
      const candidate = match[0].trim();
      try {
        new URL(candidate);
        return candidate;
      } catch {
        // invalid URL
      }
    }
  }

  return undefined;
}

export async function getPendingShare(request: Request): Promise<SharePendingPayload | null> {
  const cookieHeader = request.headers.get("Cookie");
  return (await sharePendingCookie.parse(cookieHeader)) || null;
}

export async function setPendingShare(payload: SharePendingPayload): Promise<string> {
  return await sharePendingCookie.serialize(payload);
}

export async function clearPendingShare(): Promise<string> {
  return await sharePendingCookie.serialize("", {
    maxAge: 0,
    expires: new Date(0),
  });
}
