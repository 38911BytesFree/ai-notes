import type { Response } from "express";
import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  type OAuthServerProvider,
} from "@modelcontextprotocol/server-legacy/auth";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { clientsStore } from "./clients-store";
import {
  createPendingCookieHeader,
  type OAuthPendingPayload,
} from "./pending";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
} from "./tokens";
import {
  getAuthorizationCode,
  consumeAuthorizationCode,
  storeOAuthToken,
  getOAuthToken,
  rotateOAuthToken,
  revokeOAuthToken,
} from "../app/services/oauth-api.server";
import { verifyAccessToken } from "../mcp/verifier";
import { getResourceUrl } from "./issuer";
import { SUPPORTED_SCOPES, scopesBeyond, unsupportedScopes } from "./scopes";

function getAccessTokenTtlSeconds(): number {
  const envVal = process.env.OAUTH_ACCESS_TOKEN_TTL_SECONDS;
  if (envVal) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 3600;
}

export class OAuthProvider implements OAuthServerProvider {
  readonly authorizationResponseIssParameterSupported = true;

  get clientsStore() {
    return clientsStore;
  }

  async authorize(client: any, params: any, res: Response): Promise<void> {
    const expectedResource = getResourceUrl().toString();

    if (params.resource) {
      const resourceStr = params.resource.toString().replace(/\/$/, "");
      const expectedStr = expectedResource.replace(/\/$/, "");
      if (resourceStr !== expectedStr) {
        throw new InvalidTargetError(
          `Invalid resource parameter. Expected ${expectedResource}, got ${params.resource}`
        );
      }
    }

    // Neither the SDK nor the client is trusted to keep scopes to the supported
    // set, and whatever lands here is shown on the consent screen and stored on
    // the grant, so reject anything we do not define.
    const requestedScopes: string[] = params.scopes?.length
      ? params.scopes
      : [...SUPPORTED_SCOPES];
    const unknown = unsupportedScopes(requestedScopes);
    if (unknown.length > 0) {
      throw new InvalidScopeError(`Unsupported scope(s): ${unknown.join(" ")}`);
    }

    const payload: OAuthPendingPayload = {
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      scopes: requestedScopes,
      state: params.state,
      code_challenge: params.codeChallenge,
      resource: params.resource ? params.resource.toString() : expectedResource,
      createdAt: Date.now(),
    };

    const cookieHeader = await createPendingCookieHeader(payload);
    res.setHeader("Set-Cookie", cookieHeader);
    res.redirect("/oauth/consent");
  }

  async challengeForAuthorizationCode(
    client: any,
    authorizationCode: string
  ): Promise<string> {
    const codeHash = hashToken(authorizationCode);
    const rec = await getAuthorizationCode(codeHash);
    if (!rec || rec.consumed || rec.client_id !== client.client_id) {
      throw new InvalidGrantError("Invalid or expired authorization code");
    }
    return rec.code_challenge;
  }

  async exchangeAuthorizationCode(
    client: any,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL
  ): Promise<any> {
    const codeHash = hashToken(authorizationCode);
    const rec = await consumeAuthorizationCode(codeHash);
    if (!rec) {
      throw new InvalidGrantError("Invalid or already consumed authorization code");
    }

    if (rec.client_id !== client.client_id) {
      throw new InvalidGrantError("client_id mismatch");
    }

    if (redirectUri && rec.redirect_uri !== redirectUri) {
      throw new InvalidGrantError("redirect_uri mismatch");
    }

    if (resource) {
      const expected = resource.toString().replace(/\/$/, "");
      const actual = rec.resource.replace(/\/$/, "");
      if (expected !== actual) {
        throw new InvalidTargetError("resource mismatch");
      }
    }

    const { token: accessToken, hash: accessHash } = generateAccessToken();
    const { token: refreshToken, hash: refreshHash } = generateRefreshToken();

    const now = Date.now();
    const accessTtl = getAccessTokenTtlSeconds();
    const accessExpiresAt = new Date(now + accessTtl * 1000).toISOString();
    const refreshExpiresAt = new Date(now + 30 * 24 * 3600 * 1000).toISOString();

    await storeOAuthToken({
      token_hash: accessHash,
      kind: "access",
      client_id: client.client_id,
      uid: rec.uid,
      scopes: rec.scopes,
      resource: rec.resource,
      expires_at: accessExpiresAt,
    });

    await storeOAuthToken({
      token_hash: refreshHash,
      kind: "refresh",
      client_id: client.client_id,
      uid: rec.uid,
      scopes: rec.scopes,
      resource: rec.resource,
      expires_at: refreshExpiresAt,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: accessTtl,
      refresh_token: refreshToken,
      scope: rec.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: any,
    refreshToken: string,
    scopes?: string[],
    resource?: URL
  ): Promise<any> {
    const refreshHash = hashToken(refreshToken);
    const oldToken = await rotateOAuthToken(refreshHash);
    if (!oldToken) {
      throw new InvalidGrantError("Invalid, expired, or already used refresh token");
    }

    if (oldToken.client_id !== client.client_id) {
      throw new InvalidGrantError("client_id mismatch");
    }

    if (resource) {
      const expected = resource.toString().replace(/\/$/, "");
      const actual = oldToken.resource.replace(/\/$/, "");
      if (expected !== actual) {
        throw new InvalidTargetError("resource mismatch");
      }
    }

    // RFC 6749 section 6: the requested scope must not exceed the original
    // grant. Neither the SDK's token handler nor the client checks this.
    const widened = scopes?.length ? scopesBeyond(scopes, oldToken.scopes) : [];
    if (widened.length > 0) {
      throw new InvalidScopeError(
        `Refresh cannot widen the grant: ${widened.join(" ")}`
      );
    }
    const effectiveScopes = scopes?.length ? scopes : oldToken.scopes;

    const { token: newAccessToken, hash: newAccessHash } = generateAccessToken();
    const { token: newRefreshToken, hash: newRefreshHash } = generateRefreshToken();

    const now = Date.now();
    const accessTtl = getAccessTokenTtlSeconds();
    const accessExpiresAt = new Date(now + accessTtl * 1000).toISOString();
    const refreshExpiresAt = new Date(now + 30 * 24 * 3600 * 1000).toISOString();

    await storeOAuthToken({
      token_hash: newAccessHash,
      kind: "access",
      client_id: client.client_id,
      uid: oldToken.uid,
      scopes: effectiveScopes,
      resource: oldToken.resource,
      expires_at: accessExpiresAt,
      refresh_parent_hash: refreshHash,
    });

    await storeOAuthToken({
      token_hash: newRefreshHash,
      kind: "refresh",
      client_id: client.client_id,
      uid: oldToken.uid,
      scopes: effectiveScopes,
      resource: oldToken.resource,
      expires_at: refreshExpiresAt,
      refresh_parent_hash: refreshHash,
    });

    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: accessTtl,
      refresh_token: newRefreshToken,
      scope: effectiveScopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return verifyAccessToken(token);
  }

  async revokeToken(
    client: any,
    request: { token: string; token_type_hint?: string }
  ): Promise<void> {
    if (!request?.token) return;
    const tokenHash = hashToken(request.token);

    // RFC 7009 section 2.1: a client may only revoke its own tokens. An unknown
    // or already-revoked token is not an error (section 2.2), and neither is
    // another client's, so both are a silent no-op rather than an existence
    // oracle.
    const record = await getOAuthToken(tokenHash);
    if (!record || record.client_id !== client?.client_id) {
      return;
    }

    await revokeOAuthToken(tokenHash);
  }
}

export const oauthProvider = new OAuthProvider();
