import type { LoaderFunctionArgs } from "react-router";
import { getPublicBaseUrl, isPublicIndexingEnabled } from "~/services/meta.server";
import { listPublicNotes } from "~/services/public-api.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const isIndexing = isPublicIndexingEnabled();
  const baseUrl = getPublicBaseUrl();

  if (!isIndexing) {
    return new Response("", {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const allNotes: Array<{ id: string; updated_at: string }> = [];
  let cursor: string | undefined = undefined;

  while (allNotes.length < 5000) {
    const limit = Math.min(100, 5000 - allNotes.length);
    const res = await listPublicNotes({ cursor, limit });
    if (!res.ok) break;

    for (const n of res.data.notes) {
      allNotes.push({ id: n.id, updated_at: n.updated_at });
    }

    if (!res.data.next_cursor || res.data.notes.length === 0) {
      break;
    }
    cursor = res.data.next_cursor;
  }

  const urls: string[] = [
    `  <url>\n    <loc>${baseUrl}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${baseUrl}/feed</loc>\n    <changefreq>hourly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
  ];

  for (const n of allNotes) {
    const lastmod = n.updated_at ? `\n    <lastmod>${new Date(n.updated_at).toISOString()}</lastmod>` : "";
    urls.push(
      `  <url>\n    <loc>${baseUrl}/n/${n.id}</loc>${lastmod}\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>`
    );
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
