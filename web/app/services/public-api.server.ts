import { backendFetch, BACKEND_URL } from "~/services/backend.server";

export interface PublicCodeBlock {
  lang: string;
  code: string;
}

export interface PublicNoteSource {
  provider: string;
  share_url?: string;
  model?: string;
  conversation_date?: string;
}

export interface PublicNote {
  id: string;
  title: string;
  summary: string;
  takeaways: string[];
  code_blocks?: PublicCodeBlock[];
  category: string;
  tags: string[];
  source: PublicNoteSource;
  visibility: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ListPublicNotesResponse {
  notes: PublicNote[];
  next_cursor?: string;
}

export type PublicApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; status: number };

export async function getPublicNote(id: string): Promise<PublicApiResult<PublicNote>> {
  try {
    const res = await backendFetch(`${BACKEND_URL}/v1/public/notes/${encodeURIComponent(id)}`, {
      method: "GET",
    });

    if (!res.ok) {
      let code = "internal_error";
      try {
        const body = await res.json();
        if (body && typeof body.code === "string") {
          code = body.code;
        }
      } catch {
        // use default error code
      }
      return { ok: false, code, status: res.status };
    }

    const data: PublicNote = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, code: "internal_error", status: 500 };
  }
}

export async function listPublicNotes(params?: {
  category?: string;
  cursor?: string;
  limit?: number;
}): Promise<PublicApiResult<ListPublicNotesResponse>> {
  try {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (params?.cursor) query.set("cursor", params.cursor);
    if (params?.limit) query.set("limit", String(params.limit));

    const queryString = query.toString() ? `?${query.toString()}` : "";
    const res = await backendFetch(`${BACKEND_URL}/v1/public/notes${queryString}`, {
      method: "GET",
    });

    if (!res.ok) {
      let code = "internal_error";
      try {
        const body = await res.json();
        if (body && typeof body.code === "string") {
          code = body.code;
        }
      } catch {
        // use default error code
      }
      return { ok: false, code, status: res.status };
    }

    const data: ListPublicNotesResponse = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, code: "internal_error", status: 500 };
  }
}
