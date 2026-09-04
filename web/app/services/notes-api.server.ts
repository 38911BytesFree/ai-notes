import { getAuthToken } from "~/services/auth.server";
import { backendFetch } from "~/services/backend.server";

export interface CodeBlock {
  lang: string;
  code: string;
}

export interface NoteSource {
  provider: string;
  share_url?: string;
  model?: string;
  conversation_date?: string;
  fetched_at: string;
}

export interface Note {
  id: string;
  owner_uid: string;
  visibility: string;
  title: string;
  summary: string;
  takeaways: string[];
  code_blocks?: CodeBlock[];
  category: string;
  tags: string[];
  source: NoteSource;
  has_transcript: boolean;
  transcript_bytes?: number;
  created_at: string;
  updated_at: string;
  distance?: number;
}

export interface NoteListItem {
  id: string;
  owner_uid: string;
  visibility: string;
  title: string;
  summary: string;
  takeaways: string[];
  category: string;
  tags: string[];
  source: NoteSource;
  has_transcript: boolean;
  transcript_bytes?: number;
  created_at: string;
  updated_at: string;
  distance?: number;
}

export interface ListNotesResponse {
  notes: NoteListItem[];
  next_cursor?: string;
}

export interface SearchNotesResponse {
  notes: NoteListItem[];
}

export interface UserProfile {
  uid: string;
  email: string;
  display_name: string;
  default_keep_transcript: boolean;
  ingest_count: number;
  ingest_limit: number;
}

export interface TranscriptMessage {
  role: string;
  content: string;
}

export interface Transcript {
  provider: string;
  model?: string;
  conversation_date?: string;
  messages: TranscriptMessage[];
}

export interface ApiErrorCode {
  code: string;
}

export type ApiResult<T> = (T & { ok: true; data: T; code?: undefined }) | { ok: false; data?: undefined; code: string };

export function isApiError<T>(result: ApiResult<T>): result is { ok: false; data?: undefined; code: string } {
  return "code" in result && typeof result.code === "string";
}

const BACKEND_URL = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");

async function callApi<T extends object>(
  request: Request,
  path: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  const token = await getAuthToken(request);
  if (!token) {
    return { ok: false, code: "unauthenticated" };
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const url = `${BACKEND_URL}${path}`;

  try {
    const resp = await backendFetch(url, { ...init, headers });
    if (resp.status === 204) {
      const emptyObj = {} as T;
      return Object.assign(emptyObj, { ok: true as const, data: emptyObj });
    }
    if (resp.ok) {
      const body = (await resp.json()) as T;
      return Object.assign(body, { ok: true as const, data: body });
    }
    try {
      const errJson = (await resp.json()) as { code?: string };
      return { ok: false, code: errJson.code ?? "internal_error" };
    } catch {
      return { ok: false, code: "internal_error" };
    }
  } catch {
    return { ok: false, code: "internal_error" };
  }
}

export async function ingest(
  request: Request,
  payload: { share_url?: string; text?: string; provider?: string; keep_transcript?: boolean }
): Promise<ApiResult<Note>> {
  return callApi<Note>(request, "/v1/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listNotes(
  request: Request,
  params?: { category?: string; cursor?: string; limit?: number }
): Promise<ApiResult<ListNotesResponse>> {
  const query = new URLSearchParams();
  if (params?.category) query.set("category", params.category);
  if (params?.cursor) query.set("cursor", params.cursor);
  if (params?.limit) query.set("limit", String(params.limit));
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return callApi<ListNotesResponse>(request, `/v1/notes${queryString}`, {
    method: "GET",
  });
}

export async function searchNotes(
  request: Request,
  params: { q: string; category?: string; limit?: number }
): Promise<ApiResult<SearchNotesResponse>> {
  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.category) query.set("category", params.category);
  if (params.limit) query.set("limit", String(params.limit));
  return callApi<SearchNotesResponse>(request, `/v1/notes/search?${query.toString()}`, {
    method: "GET",
  });
}

export async function getNote(request: Request, id: string): Promise<ApiResult<Note>> {
  return callApi<Note>(request, `/v1/notes/${encodeURIComponent(id)}`, {
    method: "GET",
  });
}

export async function patchNote(
  request: Request,
  id: string,
  payload: {
    title?: string;
    summary?: string;
    takeaways?: string[];
    category?: string;
    tags?: string[];
  }
): Promise<ApiResult<Note>> {
  return callApi<Note>(request, `/v1/notes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteNote(request: Request, id: string): Promise<ApiResult<Record<string, never>>> {
  return callApi<Record<string, never>>(request, `/v1/notes/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function getTranscript(request: Request, id: string): Promise<ApiResult<Transcript>> {
  return callApi<Transcript>(request, `/v1/notes/${encodeURIComponent(id)}/transcript`, {
    method: "GET",
  });
}

export async function deleteTranscript(
  request: Request,
  id: string
): Promise<ApiResult<Record<string, never>>> {
  return callApi<Record<string, never>>(request, `/v1/notes/${encodeURIComponent(id)}/transcript`, {
    method: "DELETE",
  });
}

export async function getMe(request: Request): Promise<ApiResult<UserProfile>> {
  return callApi<UserProfile>(request, "/v1/me", {
    method: "GET",
  });
}

export async function patchMe(
  request: Request,
  payload: { default_keep_transcript: boolean }
): Promise<ApiResult<UserProfile>> {
  return callApi<UserProfile>(request, "/v1/me", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function exportMe(request: Request): Promise<Response> {
  const token = await getAuthToken(request);
  if (!token) {
    return new Response(JSON.stringify({ code: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const BACKEND_URL = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");
  return backendFetch(`${BACKEND_URL}/v1/me/export`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function deleteMe(request: Request): Promise<ApiResult<Record<string, never>>> {
  return callApi<Record<string, never>>(request, "/v1/me", {
    method: "DELETE",
  });
}
