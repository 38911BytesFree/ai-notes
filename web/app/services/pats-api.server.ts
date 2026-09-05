import { getAuthToken } from "./auth.server";
import { backendFetch, BACKEND_URL } from "./backend.server";

export interface PATListItem {
  id: string;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at?: string;
}

export interface ListPATsResponse {
  pats: PATListItem[];
}

export interface CreatePATResponse {
  id: string;
  label: string;
  prefix: string;
  token: string;
}

export interface PATRecord {
  id: string;
  uid: string;
  label: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at?: string;
  revoked_at?: string;
}

export type ApiResult<T> =
  | (T & { ok: true; data: T; code?: undefined })
  | { ok: false; data?: undefined; code: string };

export function isApiError<T>(
  result: ApiResult<T>
): result is { ok: false; data?: undefined; code: string } {
  return "code" in result && typeof result.code === "string";
}

async function callUserApi<T extends object>(
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
  const resp = await backendFetch(url, { ...init, headers });

  if (resp.status === 204) {
    return { ok: true, data: {} as T, ...({} as T) };
  }

  if (!resp.ok) {
    try {
      const err = (await resp.json()) as { code?: string };
      return { ok: false, code: err.code ?? "internal_error" };
    } catch {
      return { ok: false, code: "internal_error" };
    }
  }

  const data = (await resp.json()) as T;
  return { ok: true, data, ...data };
}

export async function listPATs(request: Request): Promise<ApiResult<ListPATsResponse>> {
  return callUserApi<ListPATsResponse>(request, "/v1/me/pats", { method: "GET" });
}

export async function createPAT(
  request: Request,
  label: string
): Promise<ApiResult<CreatePATResponse>> {
  return callUserApi<CreatePATResponse>(request, "/v1/me/pats", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function revokePAT(
  request: Request,
  id: string
): Promise<ApiResult<Record<string, never>>> {
  return callUserApi<Record<string, never>>(request, `/v1/me/pats/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * Service-to-service lookup for the MCP verifier.
 */
export async function getPATByHash(hash: string): Promise<PATRecord | null> {
  const url = `${BACKEND_URL}/v1/oauth/pats/${encodeURIComponent(hash)}`;
  const resp = await backendFetch(url, { method: "GET" }, { service: true });

  if (resp.status === 404) {
    return null;
  }
  if (!resp.ok) {
    throw new Error(`Failed to lookup PAT by hash: ${resp.status} ${await resp.text()}`);
  }

  return (await resp.json()) as PATRecord;
}
