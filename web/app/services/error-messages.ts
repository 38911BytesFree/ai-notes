export const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "Please sign in to continue.",
  not_found: "Note not found.",
  invalid_argument: "Invalid input provided.",
  unsupported_provider:
    "Only ChatGPT, Claude, Gemini, and Grok share links are supported. Short links (such as g.co or x.com) must be opened in your browser first to copy the full URL. You can also paste the conversation text instead.",
  fetch_failed:
    "Failed to fetch the conversation from the provider. Please try pasting the text instead.",
  fetch_blocked:
    "This provider's share links cannot be fetched directly from Cloud Run (due to automated access restrictions or login requirements). Please paste the conversation text instead.",
  transcript_empty: "The conversation appears to be empty.",
  transcript_too_long: "The conversation exceeds the maximum allowed size (2 MB).",
  summarise_failed: "AI summarisation failed. Please try again.",
  ingest_limit_reached: "You have reached your monthly ingest limit (30 notes per month).",
  rate_limited: "Too many requests. Please wait a moment before trying again.",
  forbidden: "You do not have permission to do that.",
  pii_unacknowledged:
    "This note contains something that looks like personal or secret data. Review the highlighted items, then confirm to publish.",
  internal_error: "An unexpected error occurred. Please try again later.",
};

export function getErrorMessage(code?: string): string {
  if (!code) {
    return ERROR_MESSAGES.internal_error;
  }
  return ERROR_MESSAGES[code] ?? `An error occurred (${code}). Please try again.`;
}
