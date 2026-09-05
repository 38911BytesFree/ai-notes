import { randomBytes, createHash } from "node:crypto";

export const PAT_PREFIX = "ain_pat_";
export const ACCESS_TOKEN_PREFIX = "ain_at_";
export const REFRESH_TOKEN_PREFIX = "ain_rt_";
export const AUTH_CODE_PREFIX = "ain_ac_";

/**
 * Computes the SHA-256 hex digest of a token or string.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function generatePrefixedToken(prefix: string): string {
  const random = randomBytes(32).toString("base64url");
  return `${prefix}${random}`;
}

export function generatePat(): { token: string; hash: string; prefix: string } {
  const token = generatePrefixedToken(PAT_PREFIX);
  return {
    token,
    hash: hashToken(token),
    prefix: token.slice(0, 12),
  };
}

export function generateAccessToken(): { token: string; hash: string } {
  const token = generatePrefixedToken(ACCESS_TOKEN_PREFIX);
  return {
    token,
    hash: hashToken(token),
  };
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = generatePrefixedToken(REFRESH_TOKEN_PREFIX);
  return {
    token,
    hash: hashToken(token),
  };
}

export function generateAuthorizationCode(): { token: string; hash: string } {
  const token = generatePrefixedToken(AUTH_CODE_PREFIX);
  return {
    token,
    hash: hashToken(token),
  };
}

export function isPatToken(token: string): boolean {
  return token.startsWith(PAT_PREFIX);
}

export function isAccessToken(token: string): boolean {
  return token.startsWith(ACCESS_TOKEN_PREFIX);
}

export function isRefreshToken(token: string): boolean {
  return token.startsWith(REFRESH_TOKEN_PREFIX);
}

export function isAuthorizationCode(token: string): boolean {
  return token.startsWith(AUTH_CODE_PREFIX);
}
