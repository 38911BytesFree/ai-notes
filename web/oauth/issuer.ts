/**
 * One source of truth for the canonical origin.
 *
 * RFC 9207 has the client compare the authorization response's `iss` against
 * the issuer in the authorization server metadata with a simple string
 * comparison, and RFC 8707 compares `resource` the same way. The SDK builds its
 * metadata from `URL.href`, which normalises `https://host` to `https://host/`,
 * so anything we emit by hand has to use the same normalised form or a strict
 * client rejects the callback.
 */

const DEV_BASE_URL = "http://localhost:5173";

/** The configured origin, with any trailing slash removed. */
export function getPublicBaseUrl(): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  return (configured || DEV_BASE_URL).replace(/\/+$/, "");
}

/** The issuer as a URL, the value passed to `mcpAuthRouter`. */
export function getIssuerUrl(): URL {
  return new URL(getPublicBaseUrl());
}

/**
 * The issuer identifier exactly as it appears in the authorization server
 * metadata. Use this for the `iss` authorization response parameter.
 */
export function getIssuer(): string {
  return getIssuerUrl().href;
}

/** The MCP resource identifier, the `resource` in the protected resource metadata. */
export function getResourceUrl(): URL {
  return new URL("/mcp", getIssuerUrl());
}
