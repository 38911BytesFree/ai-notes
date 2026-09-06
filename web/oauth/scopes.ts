export const SCOPE_READ = "notes:read";
export const SCOPE_WRITE = "notes:write";

/** Every scope this authorization server will ever issue. */
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE] as const;

export type Scope = (typeof SUPPORTED_SCOPES)[number];

export function isSupportedScope(scope: string): scope is Scope {
  return (SUPPORTED_SCOPES as readonly string[]).includes(scope);
}

/** The scopes in `requested` that this server does not know about. */
export function unsupportedScopes(requested: readonly string[]): string[] {
  return requested.filter((scope) => !isSupportedScope(scope));
}

/** The scopes in `requested` that `granted` does not already cover. */
export function scopesBeyond(
  requested: readonly string[],
  granted: readonly string[]
): string[] {
  return requested.filter((scope) => !granted.includes(scope));
}

export function hasScope(
  scopes: readonly string[] | undefined,
  required: Scope
): boolean {
  return Boolean(scopes?.includes(required));
}
