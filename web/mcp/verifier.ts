import {
  OAuthError,
  OAuthErrorCode,
  getOAuthProtectedResourceMetadataUrl,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { hashToken, isAccessToken, isPatToken } from "../oauth/tokens";
import { getPATByHash } from "../app/services/pats-api.server";
import { getOAuthToken } from "../app/services/oauth-api.server";

interface CachedAuth {
  authInfo: AuthInfo;
  expiresAtMs: number;
}

const verifierCache = new Map<string, CachedAuth>();

/**
 * Verifies an access token (either a PAT or an OAuth access token) by prefix.
 *
 * `ain_pat_` -> hash -> Go /v1/oauth/pats/{hash}
 * `ain_at_`  -> hash -> Go /v1/oauth/tokens/{hash}
 *
 * Any other prefix throws OAuthError(InvalidToken).
 * Positive results are cached for 60 seconds keyed by token hash.
 */
export async function verifyAccessToken(token: string): Promise<AuthInfo> {
  if (!token || typeof token !== "string") {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "Token must be a non-empty string");
  }

  if (!isPatToken(token) && !isAccessToken(token)) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "Unsupported or invalid token prefix"
    );
  }

  const hash = hashToken(token);
  const now = Date.now();
  const cached = verifierCache.get(hash);
  if (cached && cached.expiresAtMs > now) {
    return cached.authInfo;
  }

  if (isPatToken(token)) {
    const pat = await getPATByHash(hash);
    if (!pat) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        "Personal access token not found or invalid"
      );
    }
    if (pat.revoked_at) {
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        "Personal access token has been revoked"
      );
    }

    const authInfo: AuthInfo = {
      token,
      clientId: "pat",
      scopes: pat.scopes?.length ? pat.scopes : ["notes:read", "notes:write"],
      expiresAt: Math.floor(now / 1000) + 3600,
      extra: { uid: pat.uid },
    };

    verifierCache.set(hash, {
      authInfo,
      expiresAtMs: now + 60_000,
    });

    return authInfo;
  }

  // OAuth access token (`ain_at_`)
  const tokenRecord = await getOAuthToken(hash);
  if (!tokenRecord) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "OAuth access token not found or expired"
    );
  }
  if (tokenRecord.revoked) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "OAuth access token has been revoked"
    );
  }
  if (tokenRecord.kind !== "access") {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "Token is not an access token"
    );
  }

  const expTimeMs = new Date(tokenRecord.expires_at).getTime();
  if (isNaN(expTimeMs) || expTimeMs <= now) {
    throw new OAuthError(
      OAuthErrorCode.InvalidToken,
      "OAuth access token has expired"
    );
  }

  const authInfo: AuthInfo = {
    token,
    clientId: tokenRecord.client_id,
    scopes: tokenRecord.scopes ?? [],
    expiresAt: Math.floor(expTimeMs / 1000),
    resource: tokenRecord.resource ? new URL(tokenRecord.resource) : undefined,
    extra: { uid: tokenRecord.uid },
  };

  const cacheTtlMs = Math.min(60_000, Math.max(0, expTimeMs - now));
  verifierCache.set(hash, {
    authInfo,
    expiresAtMs: now + cacheTtlMs,
  });

  return authInfo;
}

export class TokenVerifier implements OAuthTokenVerifier {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    return verifyAccessToken(token);
  }
}

export const verifier = new TokenVerifier();

export function getMcpResourceMetadataUrl(): string {
  const base = process.env.PUBLIC_BASE_URL || "http://localhost:5173";
  const resourceUrl = new URL("/mcp", base);
  return getOAuthProtectedResourceMetadataUrl(resourceUrl);
}

/**
 * Clears the verifier cache. Intended for testing.
 */
export function _clearVerifierCacheForTesting(): void {
  verifierCache.clear();
}
