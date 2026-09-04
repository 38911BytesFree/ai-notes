import { backendFetch } from "~/services/backend.server";

export type UserData = {
  uid: string;
  email: string;
  display_name: string;
  default_keep_transcript: boolean;
  ingest_count: number;
  ingest_limit: number;
};

export type ValidateTokenResult =
  | { ok: true; user: UserData }
  | { ok: false; status: number };

const BACKEND_URL = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");

export async function validateToken(idToken: string): Promise<ValidateTokenResult> {
  const url = `${BACKEND_URL}/v1/me`;
  const response = await backendFetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (response.status === 200) {
    const user = (await response.json()) as UserData;
    return { ok: true, user };
  }

  if (response.status === 401) {
    return { ok: false, status: 401 };
  }

  return { ok: false, status: response.status };
}
