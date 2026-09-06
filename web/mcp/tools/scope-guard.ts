import { getErrorMessage } from "../../app/services/error-messages";
import { hasScope, type Scope } from "../../oauth/scopes";

/**
 * Refuses a tool call whose token was not granted `required`.
 *
 * `requireBearerAuth` only checks the scopes the transport declares, and the
 * transport can't know which tool a request will reach, so the check belongs
 * here: `save_note` needs `notes:write`, the read-only tools need `notes:read`.
 * Returns the error result to hand back, or null when the call may proceed.
 */
export function requireScope(scopes: readonly string[] | undefined, required: Scope) {
  if (hasScope(scopes, required)) {
    return null;
  }
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `${getErrorMessage("forbidden")} This action needs the "${required}" permission; reconnect and grant it.`,
      },
    ],
    structuredContent: { code: "forbidden", required_scope: required },
  };
}
