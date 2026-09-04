import type { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import * as notesApi from "~/services/notes-api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAuth(request);
  const resp = await notesApi.exportMe(request);

  const headers = new Headers(resp.headers);
  headers.set("Content-Disposition", 'attachment; filename="ai-notes-export.json"');
  headers.set("Content-Type", "application/json");

  return new Response(resp.body, {
    status: resp.status,
    headers,
  });
}
