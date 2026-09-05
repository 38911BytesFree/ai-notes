import { z } from "zod";
import { backendFetch, BACKEND_URL } from "../../app/services/backend.server";
import { getErrorMessage } from "../../app/services/error-messages";
import { uidToIdToken } from "../identity";
import { RateLimiter } from "../../app/services/ratelimit.server";

export const TAXONOMY = [
  "Programming",
  "AI & ML",
  "Finance & Investing",
  "Business",
  "Science",
  "Health",
  "Law",
  "Writing",
  "Education",
  "Cooking",
  "Travel",
  "Home",
  "Career",
  "Productivity",
  "Design",
  "Marketing",
  "Personal",
  "Other",
] as const;

export const mcpSaveRateLimiter = new RateLimiter({
  capacity: 60,
  refillPerMinute: 60,
});

export const SaveNoteInputSchema = {
  title: z
    .string()
    .min(1)
    .max(200)
    .describe("Title of the note (1 to 200 characters)"),
  summary: z
    .string()
    .min(1)
    .max(4000)
    .describe("Structured summary of the conversation or topic in plain text paragraphs (1 to 4000 characters)"),
  takeaways: z
    .array(z.string())
    .min(1)
    .max(8)
    .describe("Key actionable takeaways or main points (1 to 8 items)"),
  code_blocks: z
    .array(
      z.object({
        lang: z.string().describe("Language identifier, e.g. python, typescript, go"),
        code: z.string().describe("Code content"),
      })
    )
    .optional()
    .describe("Optional key code snippets from the conversation"),
  category: z
    .enum(TAXONOMY)
    .optional()
    .describe("Optional category from the AI Notes taxonomy"),
  tags: z
    .array(z.string())
    .max(10)
    .optional()
    .describe("Optional keywords or tags (up to 10)"),
  source: z
    .object({
      provider: z
        .enum(["chatgpt", "claude", "gemini", "grok", "perplexity", "other"])
        .describe("Source platform or assistant"),
      share_url: z.string().url().optional().describe("Optional share URL"),
      model: z.string().optional().describe("Optional model name"),
      conversation_date: z.string().optional().describe("Optional ISO date string"),
    })
    .describe("Source provenance of the conversation"),
  transcript: z
    .object({
      messages: z.array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })
      ),
    })
    .optional()
    .describe("Optional full transcript messages"),
  keep_transcript: z
    .boolean()
    .optional()
    .describe("Whether to preserve full transcript in private storage. Defaults to user profile setting."),
};

export async function handleSaveNote(
  args: z.infer<z.ZodObject<typeof SaveNoteInputSchema>>,
  uid?: string
) {
  if (!uid) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: getErrorMessage("unauthenticated") }],
      structuredContent: { code: "unauthenticated" },
    };
  }

  // Rate limit check: 60 calls per minute per UID
  if (!mcpSaveRateLimiter.consume(uid)) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: getErrorMessage("rate_limited") }],
      structuredContent: { code: "rate_limited" },
    };
  }

  try {
    const idToken = await uidToIdToken(uid);
    const url = `${BACKEND_URL}/v1/notes`;
    const res = await backendFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });

    if (!res.ok) {
      let code = "internal_error";
      try {
        const errJson = (await res.json()) as { code?: string };
        if (errJson.code) code = errJson.code;
      } catch {}
      return {
        isError: true,
        content: [{ type: "text" as const, text: getErrorMessage(code) }],
        structuredContent: { code },
      };
    }

    const createdNote = (await res.json()) as {
      id: string;
      title: string;
      category: string;
    };

    const publicBase = process.env.PUBLIC_BASE_URL || "http://localhost:5173";
    const noteUrl = `${publicBase}/app/notes/${createdNote.id}`;

    const structuredContent = {
      id: createdNote.id,
      url: noteUrl,
      title: createdNote.title,
      category: createdNote.category,
    };

    const text = `Saved note "${createdNote.title}" (${createdNote.category}). View at ${noteUrl}`;

    return {
      content: [{ type: "text" as const, text }],
      structuredContent,
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Error saving note: ${err?.message || err}` }],
      structuredContent: { code: "internal_error" },
    };
  }
}
