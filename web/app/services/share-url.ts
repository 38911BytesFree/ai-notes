export type Provider = "chatgpt" | "claude";

export const ALLOWED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai"] as const;

/**
 * Detects whether a URL belongs to a supported conversation sharing provider.
 * Returns 'chatgpt', 'claude', or null.
 * Isomorphic so client components can inspect input dynamically.
 */
export function detectProvider(rawUrl: string): Provider | null {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === "chatgpt.com" || host === "chat.openai.com") {
      return "chatgpt";
    }
    if (host === "claude.ai") {
      return "claude";
    }
    return null;
  } catch {
    return null;
  }
}

export function isAllowedShareUrl(rawUrl: string): boolean {
  return detectProvider(rawUrl) !== null;
}
