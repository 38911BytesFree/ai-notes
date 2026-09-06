import type { PublicNote } from "~/services/public-api.server";

export function getPublicBaseUrl(): string {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) {
    return base.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

export function isPublicIndexingEnabled(): boolean {
  return process.env.PUBLIC_INDEXING === "true";
}

export function buildCanonicalUrl(path: string, baseUrl = getPublicBaseUrl()): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

export function buildArticleJsonLd(note: PublicNote, baseUrl = getPublicBaseUrl()): string {
  const url = buildCanonicalUrl(`/n/${note.id}`, baseUrl);
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    headline: note.title,
    description: note.summary,
    datePublished: note.published_at || note.created_at,
    dateModified: note.updated_at || note.created_at,
    author: {
      "@type": "Organization",
      name: "AI Notes",
      url: baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "AI Notes",
      url: baseUrl,
    },
  };

  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export interface MetaOptions {
  noindex?: boolean;
  publicBaseUrl?: string;
}

export function buildPublicNoteMeta(
  note: PublicNote,
  options: MetaOptions = {}
) {
  const baseUrl = options.publicBaseUrl ? options.publicBaseUrl.replace(/\/$/, "") : getPublicBaseUrl();
  const canonicalUrl = buildCanonicalUrl(`/n/${note.id}`, baseUrl);
  const ogImageUrl = buildCanonicalUrl("/og-default.png", baseUrl);

  const shouldNoindex =
    options.noindex !== undefined
      ? options.noindex
      : note.visibility === "unlisted" || !isPublicIndexingEnabled();

  return [
    { title: `${note.title} — AI Notes` },
    { name: "description", content: note.summary },
    { tagName: "link", rel: "canonical", href: canonicalUrl },

    // OpenGraph
    { property: "og:type", content: "article" },
    { property: "og:title", content: note.title },
    { property: "og:description", content: note.summary },
    { property: "og:url", content: canonicalUrl },
    { property: "og:site_name", content: "AI Notes" },
    { property: "og:image", content: ogImageUrl },

    // Twitter Card
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: note.title },
    { name: "twitter:description", content: note.summary },
    { name: "twitter:image", content: ogImageUrl },

    // Robots
    ...(shouldNoindex
      ? [{ name: "robots", content: "noindex, nofollow" }]
      : [{ name: "robots", content: "index, follow" }]),
  ];
}
