export function getBookmarkletCode(baseUrl?: string): string {
  const envBase = typeof process !== "undefined" ? process.env?.PUBLIC_BASE_URL?.trim() : undefined;
  const base = (baseUrl || envBase || "http://localhost:3000").replace(/\/$/, "");
  return `javascript:void(open('${base}/app/share?url='+encodeURIComponent(location.href),'_blank'))`;
}
