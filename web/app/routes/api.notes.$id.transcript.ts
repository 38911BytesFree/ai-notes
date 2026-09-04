import type { LoaderFunctionArgs } from "react-router";
import { requireAuth } from "~/services/auth.server";
import * as notesApi from "~/services/notes-api.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireAuth(request);
  const id = params.id;
  if (!id) {
    return new Response("Missing note id", { status: 400 });
  }

  const res = await notesApi.getTranscript(request, id);
  if (!res.ok) {
    return new Response("Transcript not found", { status: 404 });
  }

  return new Response(JSON.stringify(res.data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="transcript-${id}.json"`,
    },
  });
}
