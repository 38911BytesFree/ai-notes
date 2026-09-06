import { data, useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { getPublicNote } from "~/services/public-api.server";
import { RateLimiter } from "~/services/ratelimit.server";
import {
  buildArticleJsonLd,
  buildPublicNoteMeta,
  isPublicIndexingEnabled,
} from "~/services/meta.server";
import { PublicNoteView } from "~/components/PublicNoteView";

const publicLimiter = new RateLimiter({ capacity: 60, refillPerMinute: 60 });

export async function loader({ request, params }: LoaderFunctionArgs) {
  if (!publicLimiter.checkRequest(request)) {
    throw new Response("Too Many Requests", { status: 429 });
  }

  const id = params.id;
  if (!id) {
    throw new Response(null, { status: 404 });
  }

  const res = await getPublicNote(id);
  if (!res.ok) {
    throw new Response(null, { status: 404 });
  }

  const note = res.data;
  const noindex = note.visibility === "unlisted" || !isPublicIndexingEnabled();
  const jsonLd = buildArticleJsonLd(note);
  const metaTags = buildPublicNoteMeta(note, { noindex });

  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=300");
  headers.set("Vary", "Cookie");
  if (noindex) {
    headers.set("X-Robots-Tag", "noindex");
  }

  return data({ note, jsonLd, noindex, metaTags }, { headers });
}

export function headers({ loaderHeaders }: { loaderHeaders: Headers }) {
  const h = new Headers();
  h.set("Cache-Control", "public, max-age=300");
  h.set("Vary", "Cookie");
  const xRobots = loaderHeaders.get("X-Robots-Tag");
  if (xRobots) {
    h.set("X-Robots-Tag", xRobots);
  }
  return h;
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data || !data.metaTags) {
    return [
      { title: "Note not found — AI Notes" },
      { name: "robots", content: "noindex, nofollow" },
    ];
  }

  return data.metaTags;
};

export default function PublicNoteRoute() {
  const { note, jsonLd } = useLoaderData<typeof loader>();
  return <PublicNoteView note={note} jsonLd={jsonLd} />;
}
