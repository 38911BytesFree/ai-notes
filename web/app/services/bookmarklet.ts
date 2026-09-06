import { getPublicBaseUrl } from "~/services/meta.server";

export function getBookmarkletCode(baseUrl?: string): string {
  const base = (baseUrl || getPublicBaseUrl()).replace(/\/$/, "");
  return `javascript:void(open('${base}/app/share?url='+encodeURIComponent(location.href),'_blank'))`;
}
