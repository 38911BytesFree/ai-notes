import { z } from "zod";
import { backendFetch, BACKEND_URL } from "../../app/services/backend.server";
import { getErrorMessage } from "../../app/services/error-messages";
import { uidToIdToken } from "../identity";
import { TAXONOMY } from "./save-note";

export const SearchNotesInputSchema = {
  query: z
    .string()
    .min(1)
    .max(500)
    .describe("Semantic search query to find relevant notes (1 to 500 characters)"),
  category: z
    .enum(TAXONOMY)
    .optional()
    .describe("Optional category to filter search results"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(10)
    .optional()
    .describe("Maximum number of results to return (1 to 30, default 10)"),
};

export async function handleSearchNotes(
  args: z.infer<z.ZodObject<typeof SearchNotesInputSchema>>,
  uid?: string
) {
  if (!uid) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: getErrorMessage("unauthenticated") }],
      structuredContent: { code: "unauthenticated" },
    };
  }

  try {
    const idToken = await uidToIdToken(uid);
    const limit = args.limit ?? 10;
    const params = new URLSearchParams({
      q: args.query,
      limit: String(limit),
    });
    if (args.category) {
      params.set("category", args.category);
    }

    const url = `${BACKEND_URL}/v1/notes/search?${params.toString()}`;
    const res = await backendFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
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

    const data = (await res.json()) as {
      notes?: Array<{
        id: string;
        title: string;
        category: string;
        summary: string;
        tags?: string[];
        created_at: string;
        distance?: number;
      }>;
    };

    const publicBase = process.env.PUBLIC_BASE_URL || "http://localhost:5173";
    const rawNotes = data.notes ?? [];

    const notes = rawNotes.map((n) => ({
      id: n.id,
      url: `${publicBase}/app/notes/${n.id}`,
      title: n.title,
      category: n.category,
      summary: (n.summary || "").slice(0, 300),
      tags: n.tags || [],
      created_at: n.created_at,
      distance: n.distance,
    }));

    let textSummary = "";
    if (notes.length === 0) {
      textSummary = `No notes found matching "${args.query}".`;
    } else {
      textSummary = `Found ${notes.length} note(s) for "${args.query}":\n` +
        notes
          .map(
            (n, idx) =>
              `${idx + 1}. [${n.title}](${n.url}) (${n.category})\n   ${n.summary}`
          )
          .join("\n\n");
    }

    return {
      content: [{ type: "text" as const, text: textSummary }],
      structuredContent: { notes },
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Search failed: ${err?.message || err}` }],
      structuredContent: { code: "internal_error" },
    };
  }
}
