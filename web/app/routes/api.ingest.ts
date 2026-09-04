import type { ActionFunctionArgs } from "react-router";
import { rateLimit } from "~/services/ratelimit.server";
import { isAllowedShareUrl } from "~/services/share-url";
import * as notesApi from "~/services/notes-api.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ code: "invalid_argument" }, { status: 405 });
  }

  // Rate limiting: 10 per minute per IP
  if (!rateLimit(request)) {
    return Response.json({ code: "rate_limited" }, { status: 429 });
  }

  let input = "";
  let keepTranscript = true;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = await request.json();
      input = String(body.input ?? body.share_url ?? body.text ?? "").trim();
      if (typeof body.keep_transcript === "boolean") {
        keepTranscript = body.keep_transcript;
      }
    } catch {
      return Response.json({ code: "invalid_argument" }, { status: 400 });
    }
  } else {
    try {
      const formData = await request.formData();
      input = String(formData.get("input") ?? formData.get("share_url") ?? formData.get("text") ?? "").trim();
      const keepVal = formData.get("keep_transcript");
      if (keepVal !== null) {
        keepTranscript = keepVal === "on" || keepVal === "true" || keepVal === "1";
      }
    } catch {
      return Response.json({ code: "invalid_argument" }, { status: 400 });
    }
  }

  if (!input) {
    return Response.json({ code: "invalid_argument" }, { status: 400 });
  }

  const isUrl = /^https?:\/\//i.test(input);

  if (isUrl) {
    if (!isAllowedShareUrl(input)) {
      return Response.json({ code: "unsupported_provider" }, { status: 400 });
    }
  }

  const payload = isUrl
    ? { share_url: input, keep_transcript: keepTranscript }
    : { text: input, provider: "manual", keep_transcript: keepTranscript };

  const result = await notesApi.ingest(request, payload);

  if (!result.ok) {
    let status = 500;
    switch (result.code) {
      case "unauthenticated":
        status = 401;
        break;
      case "unsupported_provider":
      case "invalid_argument":
      case "transcript_empty":
      case "transcript_too_long":
        status = 400;
        break;
      case "ingest_limit_reached":
        status = 429;
        break;
      case "fetch_failed":
      case "fetch_blocked":
      case "summarise_failed":
        status = 502;
        break;
    }
    return Response.json({ code: result.code }, { status });
  }

  const note = result.data;
  return Response.json({ ok: true, id: note.id, note }, { status: 201 });
}
