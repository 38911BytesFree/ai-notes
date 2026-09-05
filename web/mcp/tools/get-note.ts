import { z } from "zod";
import { backendFetch, BACKEND_URL } from "../../app/services/backend.server";
import { getErrorMessage } from "../../app/services/error-messages";
import { uidToIdToken } from "../identity";

export const GetNoteInputSchema = {
  note_id: z
    .string()
    .min(1)
    .describe("ID of the note to retrieve"),
  include_transcript: z
    .boolean()
    .optional()
    .default(false)
    .describe("Whether to include the full original conversation transcript if preserved"),
};

export async function handleGetNote(
  args: z.infer<z.ZodObject<typeof GetNoteInputSchema>>,
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
    const url = `${BACKEND_URL}/v1/notes/${encodeURIComponent(args.note_id)}`;
    const res = await backendFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (!res.ok) {
      let code = "not_found";
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

    const note = (await res.json()) as Record<string, any>;

    // If transcript was requested and is present, fetch it
    if (args.include_transcript && note.has_transcript) {
      const transcriptUrl = `${BACKEND_URL}/v1/notes/${encodeURIComponent(args.note_id)}/transcript`;
      const transcriptRes = await backendFetch(transcriptUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      if (transcriptRes.ok) {
        note.transcript = await transcriptRes.json();
      }
    }

    const publicBase = process.env.PUBLIC_BASE_URL || "http://localhost:5173";
    const noteUrl = `${publicBase}/app/notes/${note.id}`;
    note.url = noteUrl;

    // Markdown text rendering
    let text = `# ${note.title}\n\n`;
    text += `**Category:** ${note.category}\n`;
    if (note.tags?.length) {
      text += `**Tags:** ${note.tags.map((t: string) => `#${t}`).join(" ")}\n`;
    }
    text += `**Link:** ${noteUrl}\n\n`;
    text += `## Summary\n\n${note.summary}\n\n`;

    if (note.takeaways?.length) {
      text += `## Key Takeaways\n\n`;
      text += note.takeaways.map((t: string) => `- ${t}`).join("\n");
      text += `\n\n`;
    }

    if (note.code_blocks?.length) {
      text += `## Code Blocks\n\n`;
      for (const cb of note.code_blocks) {
        text += `\`\`\`${cb.lang || ""}\n${cb.code}\n\`\`\`\n\n`;
      }
    }

    return {
      content: [{ type: "text" as const, text: text.trim() }],
      structuredContent: note,
    };
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: `Failed to get note: ${err?.message || err}` }],
      structuredContent: { code: "internal_error" },
    };
  }
}
