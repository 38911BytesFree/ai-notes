import type { Request, Response, NextFunction } from "express";
import { InvalidClientError } from "@modelcontextprotocol/server-legacy/auth";
import { getClient } from "../app/services/oauth-api.server";
import { hashToken } from "./tokens";

/**
 * Authenticates a confidential client at `/token` and `/revoke`.
 *
 * The SDK's own `authenticateClient` compares `client.client_secret` from the
 * clients store against the presented secret, which only works if the store
 * hands back the plaintext. We store the SHA-256 hash and nothing else, so the
 * SDK's check always sees `undefined` and skips; this middleware does the
 * comparison instead, before the router's handlers run.
 *
 * Clients registered with `token_endpoint_auth_method: "none"` have no stored
 * hash and pass straight through — PKCE is what protects those.
 */
export function verifyClientSecret() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const clientId = typeof body.client_id === "string" ? body.client_id : "";
    const presented =
      typeof body.client_secret === "string" ? body.client_secret : "";

    // No client_id at all is the SDK's error to report, with its own shape.
    if (!clientId) {
      return next();
    }

    let record;
    try {
      record = await getClient(clientId);
    } catch (err) {
      console.error("verifyClientSecret: client lookup failed", err);
      return next(err);
    }

    // Unknown client is likewise the SDK's error to report.
    if (!record || !record.client_secret_hash) {
      return next();
    }

    const fail = (message: string) => {
      const error = new InvalidClientError(message);
      res.status(401).json(error.toResponseObject());
    };

    if (!presented) {
      return fail("Client secret is required");
    }
    if (hashToken(presented) !== record.client_secret_hash) {
      return fail("Invalid client_secret");
    }
    if (
      record.client_secret_expires_at &&
      record.client_secret_expires_at < Math.floor(Date.now() / 1000)
    ) {
      return fail("Client secret has expired");
    }

    next();
  };
}
