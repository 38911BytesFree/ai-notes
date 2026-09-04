import { GoogleAuth } from "google-auth-library";
import type { IdTokenClient } from "google-auth-library";

// Single source of truth for talking to the Go backend.
//
// In production the Go service runs on a *private* Cloud Run service that
// requires a Google-signed ID token. Locally (and in any setup where the
// backend is publicly reachable) no ID token is needed, so backendFetch behaves
// like a plain fetch.
//
// Header choice:
// Our app uses the standard `Authorization: Bearer <firebase-token>`
// header for end-user auth. Cloud Run's IAM layer also consumes the
// `Authorization` header for its own service-to-service check, which would
// clobber the Firebase token. To keep both, we send the Google ID token in the
// `X-Serverless-Authorization` header — Cloud Run validates that one for IAM and
// forwards `Authorization` to the container untouched.

const BACKEND_URL = (process.env.BACKEND_URL ?? "").replace(/\/$/, "");

/**
 * Whether to attach a Google ID token to backend requests.
 *
 * Resolution order:
 *  1. `BACKEND_USE_ID_TOKEN` env var, if set ("true"/"1" -> on, anything else -> off).
 *  2. Otherwise auto-detect: on when running on Cloud Run (`K_SERVICE` is set by
 *     the runtime) against an https backend.
 */
function idTokenEnabled(): boolean {
  const explicit = process.env.BACKEND_USE_ID_TOKEN?.trim();
  if (explicit) {
    return explicit === "true" || explicit === "1";
  }
  return Boolean(process.env.K_SERVICE) && BACKEND_URL.startsWith("https://");
}

let clientPromise: Promise<IdTokenClient> | null = null;
function getIdTokenClient(): Promise<IdTokenClient> {
  if (!clientPromise) {
    const auth = new GoogleAuth();
    clientPromise = auth.getIdTokenClient(BACKEND_URL);
  }
  return clientPromise;
}

async function getIdTokenHeader(): Promise<string | null> {
  const client = await getIdTokenClient();
  const headers = await client.getRequestHeaders();
  if (headers instanceof Headers) {
    return headers.get("authorization");
  }
  const record = headers as Record<string, string>;
  return record.Authorization ?? record.authorization ?? null;
}

/**
 * fetch() wrapper for all calls to the Go backend.
 *
 * When ID-token auth is enabled it adds the `X-Serverless-Authorization` header
 * carrying a Google-signed ID token; otherwise it is a transparent passthrough.
 * The caller still sets `Authorization: Bearer <firebase-token>` as usual.
 */
export async function backendFetch(
  url: string | URL,
  init: RequestInit = {}
): Promise<Response> {
  if (!idTokenEnabled()) {
    return fetch(url, init);
  }

  const idToken = await getIdTokenHeader();
  if (!idToken) {
    throw new Error(
      "backendFetch: ID-token auth is enabled but no token could be obtained " +
        `(check that the runtime service account can mint ID tokens for ${BACKEND_URL}).`
    );
  }

  const headers = new Headers(init.headers);
  headers.set("X-Serverless-Authorization", idToken);
  return fetch(url, { ...init, headers });
}
