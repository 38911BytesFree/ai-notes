import { McpServer, type AuthInfo } from "@modelcontextprotocol/server";
import { SaveNoteInputSchema, handleSaveNote } from "./tools/save-note";
import { SearchNotesInputSchema, handleSearchNotes } from "./tools/search-notes";
import { GetNoteInputSchema, handleGetNote } from "./tools/get-note";

export interface McpServerContext {
  authInfo?: AuthInfo;
  [key: string]: any;
}

/**
 * Builds an McpServer instance scoped to the authenticated caller in `ctx.authInfo`.
 * The caller's UID is extracted from `ctx.authInfo.extra.uid`.
 */
export function buildServer(ctx: McpServerContext): McpServer {
  const uid = ctx?.authInfo?.extra?.uid as string | undefined;

  const server = new McpServer({
    name: "ai-notes",
    version: "1.0.0",
  });

  server.registerTool(
    "save_note",
    {
      description:
        "Save a structured note to AI Notes. Takes a title, summary, takeaways, optional code blocks, category, tags, and transcript.",
      inputSchema: SaveNoteInputSchema,
    },
    async (args) => handleSaveNote(args, uid)
  );

  server.registerTool(
    "search_notes",
    {
      description:
        "Perform semantic search over the user's saved notes with cosine distance ranking. Filter by category or limit count.",
      inputSchema: SearchNotesInputSchema,
    },
    async (args) => handleSearchNotes(args, uid)
  );

  server.registerTool(
    "get_note",
    {
      description:
        "Retrieve the full contents of a note by note ID, optionally including the original conversation transcript.",
      inputSchema: GetNoteInputSchema,
    },
    async (args) => handleGetNote(args, uid)
  );

  return server;
}
