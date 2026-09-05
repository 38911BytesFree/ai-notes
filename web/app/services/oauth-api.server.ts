import { backendFetch, BACKEND_URL } from "./backend.server";

export interface OAuthClientRecord {
  client_id: string;
  client_secret?: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scopes: string[];
  created_at?: string;
}

export interface OAuthCodeRecord {
  code_hash: string;
  client_id: string;
  uid: string;
  scopes: string[];
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  resource: string;
  expires_at: string;
  consumed?: boolean;
}

export interface OAuthTokenRecord {
  token_hash?: string;
  kind: "access" | "refresh";
  client_id: string;
  uid: string;
  scopes: string[];
  resource: string;
  expires_at: string;
  created_at?: string;
  refresh_parent_hash?: string;
  revoked?: boolean;
}

export async function registerClient(client: OAuthClientRecord): Promise<OAuthClientRecord> {
  const url = `${BACKEND_URL}/v1/oauth/clients`;
  const res = await backendFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(client),
    },
    { service: true }
  );

  if (!res.ok) {
    throw new Error(`Failed to register OAuth client: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthClientRecord;
}

export async function getClient(clientId: string): Promise<OAuthClientRecord | null> {
  const url = `${BACKEND_URL}/v1/oauth/clients/${encodeURIComponent(clientId)}`;
  const res = await backendFetch(url, { method: "GET" }, { service: true });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to get OAuth client: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthClientRecord;
}

export async function storeAuthorizationCode(code: OAuthCodeRecord): Promise<void> {
  const url = `${BACKEND_URL}/v1/oauth/codes`;
  const res = await backendFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(code),
    },
    { service: true }
  );

  if (!res.ok) {
    throw new Error(`Failed to store OAuth code: ${res.status} ${await res.text()}`);
  }
}

export async function consumeAuthorizationCode(codeHash: string): Promise<OAuthCodeRecord | null> {
  const url = `${BACKEND_URL}/v1/oauth/codes/${encodeURIComponent(codeHash)}/consume`;
  const res = await backendFetch(url, { method: "POST" }, { service: true });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to consume OAuth code: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthCodeRecord;
}

export async function storeOAuthToken(token: OAuthTokenRecord): Promise<void> {
  const url = `${BACKEND_URL}/v1/oauth/tokens`;
  const res = await backendFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token),
    },
    { service: true }
  );

  if (!res.ok) {
    throw new Error(`Failed to store OAuth token: ${res.status} ${await res.text()}`);
  }
}

export async function getOAuthToken(tokenHash: string): Promise<OAuthTokenRecord | null> {
  const url = `${BACKEND_URL}/v1/oauth/tokens/${encodeURIComponent(tokenHash)}`;
  const res = await backendFetch(url, { method: "GET" }, { service: true });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to get OAuth token: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthTokenRecord;
}

export async function rotateOAuthToken(tokenHash: string): Promise<OAuthTokenRecord | null> {
  const url = `${BACKEND_URL}/v1/oauth/tokens/${encodeURIComponent(tokenHash)}/rotate`;
  const res = await backendFetch(url, { method: "POST" }, { service: true });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to rotate OAuth token: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as OAuthTokenRecord;
}

export async function revokeOAuthToken(tokenHash: string): Promise<void> {
  const url = `${BACKEND_URL}/v1/oauth/tokens/${encodeURIComponent(tokenHash)}`;
  const res = await backendFetch(url, { method: "DELETE" }, { service: true });

  if (res.status === 404 || res.status === 204) {
    return;
  }
  if (!res.ok) {
    throw new Error(`Failed to revoke OAuth token: ${res.status} ${await res.text()}`);
  }
}
