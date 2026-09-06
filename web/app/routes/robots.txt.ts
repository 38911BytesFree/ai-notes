import type { LoaderFunctionArgs } from "react-router";
import { getPublicBaseUrl, isPublicIndexingEnabled } from "~/services/meta.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const isIndexing = isPublicIndexingEnabled();
  const baseUrl = getPublicBaseUrl();

  let body: string;
  if (!isIndexing) {
    body = "User-agent: *\nDisallow: /\n";
  } else {
    body = `User-agent: *
Allow: /
Disallow: /app
Disallow: /api
Disallow: /mcp
Disallow: /oauth
Disallow: /login
Disallow: /.well-known
Disallow: /token
Disallow: /revoke
Disallow: /register
Disallow: /authorize

Sitemap: ${baseUrl}/sitemap.xml
`;
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
