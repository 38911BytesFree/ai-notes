import {
  InvalidClientMetadataError,
  type OAuthRegisteredClientsStore,
} from "@modelcontextprotocol/server-legacy/auth";
import {
  getClient as getClientFromApi,
  registerClient as registerClientInApi,
  type OAuthClientRecord,
} from "../app/services/oauth-api.server";

export function validateRedirectUri(uri: string): void {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "https:") {
      return;
    }
    if (
      parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
    ) {
      return;
    }
  } catch {}
  throw new InvalidClientMetadataError(
    `Redirect URI "${uri}" is invalid. Must use https:// or loopback http://127.0.0.1 or http://localhost.`
  );
}

export class ClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<any | undefined> {
    const record = await getClientFromApi(clientId);
    if (!record) {
      return undefined;
    }

    return {
      client_id: record.client_id,
      client_secret: record.client_secret,
      client_name: record.client_name,
      redirect_uris: record.redirect_uris,
      grant_types: record.grant_types,
      response_types: record.response_types,
      token_endpoint_auth_method: record.token_endpoint_auth_method,
      scope: record.scopes.join(" "),
      client_id_issued_at: record.created_at
        ? Math.floor(new Date(record.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
    };
  }

  async registerClient(client: any): Promise<any> {
    const redirectUris: string[] = client.redirect_uris ?? [];
    if (!redirectUris.length) {
      throw new InvalidClientMetadataError("At least one redirect_uri is required");
    }

    for (const uri of redirectUris) {
      validateRedirectUri(uri);
    }

    const rawScopes =
      typeof client.scope === "string"
        ? client.scope.split(" ").filter(Boolean)
        : client.scopes ?? ["notes:read", "notes:write"];

    const clientRecord: OAuthClientRecord = {
      client_id: client.client_id,
      client_secret: client.client_secret,
      client_name: client.client_name,
      redirect_uris: redirectUris,
      grant_types: client.grant_types ?? ["authorization_code", "refresh_token"],
      response_types: client.response_types ?? ["code"],
      token_endpoint_auth_method: client.token_endpoint_auth_method ?? "none",
      scopes: rawScopes,
    };

    const stored = await registerClientInApi(clientRecord);

    return {
      client_id: stored.client_id,
      client_secret: stored.client_secret,
      client_name: stored.client_name,
      redirect_uris: stored.redirect_uris,
      grant_types: stored.grant_types,
      response_types: stored.response_types,
      token_endpoint_auth_method: stored.token_endpoint_auth_method,
      scope: stored.scopes.join(" "),
      client_id_issued_at: stored.created_at
        ? Math.floor(new Date(stored.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
    };
  }
}

export const clientsStore = new ClientsStore();
