# Phase 2 handoff: MCP and OAuth for AI Notes

This document is self-contained. It is written for an implementing agent that
has not seen the design discussion. Read `docs/PLAN.md` for the product plan,
`docs/phase1-handoff.md` for the API and data model you are building on, and
`docs/phase1-review.md` for the state Phase 1 left behind. This file covers
only Phase 2.

## 1. What Phase 2 delivers, in three sentences

Any MCP client can connect to the service's `/mcp` endpoint, authenticate as a
user, and call three tools: save a note the model has already summarised,
search the user's library by meaning, and fetch a note (optionally with its
transcript) to continue the conversation elsewhere. Command-line clients
(Claude Code, Cursor) authenticate with a personal access token the user
creates in the web app; hosted clients (Claude.ai, ChatGPT) authenticate
through an OAuth 2.1 flow with dynamic client registration and a consent
screen served by the web app. Everything still runs on two scale-to-zero
Cloud Run services, and the Go API stays private.

## 2. Goal and exit criteria

Goal: "save this to AI Notes" works from Claude Code, Cursor, Claude.ai, and
ChatGPT against production. Nothing public, no mobile.

Phase 2 is complete when every item below is true:

- [ ] `/app/connect` lets a signed-in user create a personal access token
      (shown once, prefix visible afterwards), see the list, and revoke one.
      A revoked token is refused on the next MCP request.
- [ ] `GET ${PUBLIC_BASE_URL}/mcp` without a token returns 401 with a
      `WWW-Authenticate` header pointing at
      `/.well-known/oauth-protected-resource/mcp`, and both well-known
      documents validate against RFC 9728 and RFC 8414.
- [ ] From Claude Code with a PAT: `save_note` creates a note that appears in
      `/app` with `source.provider` set by the caller and no ingest quota
      consumed; `search_notes` returns it by meaning; `get_note` with
      `include_transcript=true` returns the messages that were saved.
- [ ] The same three tools work from Cursor with the PAT in `mcp.json`.
- [ ] From Claude.ai (custom connector) the OAuth flow completes: dynamic
      registration, redirect to `/oauth/consent`, sign-in if needed, consent,
      code exchange with PKCE, then all three tools work. Refresh works after
      the access token expires (test by setting a 2 minute lifetime once).
- [ ] The same flow works from ChatGPT developer mode. Grok is tried and the
      result recorded in `docs/phase2-clients.md`, pass or fail.
- [ ] An access token issued for one client cannot be used by another
      client's `client_id`, a code cannot be exchanged twice, a token bound to
      a different `resource` is refused, and a PAT is refused at `/token`.
      All four are Go or web tests.
- [ ] A Firebase ID token obtained through the custom-token exchange reaches
      Go, and Go serves `/v1/me` for that uid without blanking `email` or
      `display_name` on the user document.
- [ ] `pnpm dev` with `USE_FAKE_AI=true` runs the whole thing locally: MCP
      Inspector connects to `http://127.0.0.1:5173/mcp` with a locally created
      PAT and all three tools succeed against the emulators.
- [ ] A request to the non-canonical Cloud Run host
      (`ai-notes-web-786405456691.europe-west1.run.app`) redirects to the same
      path on `PUBLIC_BASE_URL`, and every issuer, `resource` and `iss` value
      in the two well-known documents equals `PUBLIC_BASE_URL` exactly.
- [ ] Both Cloud Run services still have `min_instance_count = 0`; there is no
      new always-on resource; `terraform plan` shows no changes after deploy.
- [ ] `go test ./...`, `pnpm test`, `pnpm typecheck` pass in CI.

## 3. Decisions already made (do not re-open)

The MCP TypeScript SDK moved to v2 on 28 July 2026 (protocol revision
`2026-07-28`). The v1 package `@modelcontextprotocol/sdk` is superseded by a
split set of packages, and the authorization-server helpers `docs/PLAN.md`
counted on are now a frozen legacy package. The decisions below reflect that.

| Area | Decision |
|---|---|
| SDK packages | `@modelcontextprotocol/server`, `@modelcontextprotocol/express`, `@modelcontextprotocol/node` at 2.x, and `zod` 4.x. Pin exact versions. Node 24 is already the runtime. |
| MCP transport | `createMcpHandler(buildServer, { responseMode: "json" })` from `@modelcontextprotocol/server`, mounted on the existing Express app in `web/server.ts` with `toNodeHandler` from `@modelcontextprotocol/node`. Stateless: the v2 handler builds a fresh server per request and keeps nothing between requests, so no session affinity is needed across Cloud Run instances. JSON response mode means no open SSE streams on a scale-to-zero service. Do not enable `sessionIdGenerator` or an event store. |
| Resource-server auth | `requireBearerAuth({ verifier, requiredScopes, resourceMetadataUrl })` from `@modelcontextprotocol/express` in front of the handler. The verifier accepts two token kinds: personal access tokens (prefix `ain_pat_`) and OAuth access tokens. Both are opaque random strings; only SHA-256 hashes are stored. |
| Authorization server | `mcpAuthRouter` and the `OAuthServerProvider` interface from `@modelcontextprotocol/server-legacy/auth`, pinned at the 2.0.x line. The SDK calls this package a frozen migration copy and recommends a dedicated identity provider instead; the ones it names (Auth0, Keycloak) are paid or need a running server, both rejected by `docs/PLAN.md`. The router gives us PKCE checks, DCR validation, client auth, token-endpoint parsing, rate limits, and RFC-shaped error bodies for free. Our exposure is the `OAuthServerProvider` implementation, about 200 lines of storage code that calls Go. If the legacy package is removed in a future major, the five endpoints it mounts are a bounded rewrite. Record this in the risk list and move on. |
| Where the AS lives | On the web service, mounted at the root so the paths are `/authorize`, `/token`, `/register`, `/revoke`, `/.well-known/oauth-authorization-server`, and `/.well-known/oauth-protected-resource/mcp`. `issuerUrl` and `resourceServerUrl` come from `PUBLIC_BASE_URL`. Consent is a React Router route at `/oauth/consent`. |
| Token storage | Firestore, through new Go endpoints under `/v1/oauth/*`. Go remains the only Firestore client. Codes live 10 minutes and are single-use (consumed in a transaction). Access tokens live 1 hour, refresh tokens 30 days and rotate on use. Firestore TTL policies on `expires_at` delete expired documents for free. |
| Service-to-service auth on Go | `/v1/oauth/*` routes are called by the web service, not by a user. They use a new `requireService` middleware that validates a Google-signed ID token with audience equal to the API's own URL and `email` equal to the web service account. The web sends the same token it already mints for `X-Serverless-Authorization`, additionally in `Authorization: Bearer`. Locally, when the emulators are configured, both sides accept the static value in `SERVICE_DEV_TOKEN`. |
| User identity for tool calls | Exactly one identity path into Go, unchanged: a Firebase ID token. For a PAT or OAuth token the web resolves the uid, mints a Firebase custom token with `firebase-admin` (which signs through the IAM `signBlob` API, no key file), exchanges it for an ID token with the Identity Toolkit `accounts:signInWithCustomToken` REST call using the public web API key, and caches the ID token per uid until five minutes before expiry. Go verifies it like any other ID token. |
| Scopes | `notes:read` and `notes:write`. PATs always carry both. OAuth clients request them; consent shows them. `save_note` requires write; the other two require read. |
| Tools | `save_note`, `search_notes`, `get_note`. Nothing else in this phase. Tool input schemas are zod objects and the descriptions are written for a model, not a human. |
| Saving from MCP costs no LLM | `save_note` calls a new `POST /v1/notes` on Go that validates, normalises, embeds, and stores. It does not touch the ingest quota. It is rate limited per uid in the BFF (60 per minute) and the note limits from Phase 1 section 6 apply by truncation. |
| Cold starts | The web Dockerfile becomes multi-stage with production dependencies only (carry-over from Phase 1). `min_instance_count` stays 0. MCP clients tolerate a few seconds on first call; the setup page says so. |
| Base URL | Phase 2 ships on the Cloud Run service URL. A custom domain is **not** a prerequisite: OAuth 2.1, dynamic client registration and RFC 9728 discovery only require a stable HTTPS origin, which `run.app` is. The canonical origin is `https://ai-notes-web-g3q7qn4imq-ew.a.run.app`, the value Terraform exposes as `google_cloud_run_v2_service.web.uri`. See section 3.1 for the two things this constrains. |
| Second Cloud Run host | The service also answers on `https://ai-notes-web-786405456691.europe-west1.run.app`. That host is **not** in Firebase Auth's authorised domains, so sign-in fails there, and OAuth resource indicators are compared by exact string. Treat the canonical origin as the only supported one: the BFF redirects any other host to `PUBLIC_BASE_URL` before the session and OAuth routes run. |

### 3.1 Running on the Cloud Run URL, and moving off it later

Nothing in Phase 2 needs a custom domain. Two things follow from using the
service URL, and both are cheap:

1. **One origin, enforced.** Two `run.app` hosts answer for this service, and
   only `ai-notes-web-g3q7qn4imq-ew.a.run.app` is an authorised Firebase Auth
   domain. Resource indicators and the `iss` parameter are compared as exact
   strings, so a client that discovers on one host and is issued a token for
   the other fails validation. Build every URL from `PUBLIC_BASE_URL`, never
   from the request's `Host`, and add a redirect in `web/server.ts` that sends
   any other host to the same path on `PUBLIC_BASE_URL` before the session and
   OAuth routes run. Test it: `curl -sS -o /dev/null -w '%{http_code} %{redirect_url}'
   https://ai-notes-web-786405456691.europe-west1.run.app/mcp` must redirect.

2. **The later switch to a custom domain is a migration, not a rename.**
   Personal access tokens are opaque and carry no origin, so they keep working
   and users only edit the endpoint URL in their client config. OAuth is
   different: registered clients hold the old authorisation and token
   endpoints, and issued tokens are bound to the old `resource`. At cutover,
   set `manage_domain = true`, apply, let `PUBLIC_BASE_URL` follow, then delete
   the `oauth_clients`, `oauth_codes` and `oauth_tokens` collections and tell
   connected users to remove and re-add the connector. Dynamic registration
   means that is a couple of clicks for them. Keep the old origin serving a
   redirect so nothing dead-ends.

The `run.app` hostname is stable for the life of the service. It changes only
if the service is deleted and recreated, so do not delete it.

## 4. Carry-over fixes from Phase 1 (do these first, one commit each)

1. **Multi-stage web Dockerfile.** Build stage runs `pnpm install` and
   `pnpm build`; runtime stage copies `build/`, `package.json`,
   `pnpm-lock.yaml`, and installs with `--prod`. Keep the `VITE_*` build args
   and also copy them into the runtime stage as `ENV`: the server reads
   `VITE_FIREBASE_API_KEY` at runtime for the custom-token exchange.
2. **`UpsertUser` must not blank fields.** An ID token from the custom-token
   flow carries no `email` or `name` claim. In both stores, only overwrite
   `Email` and `DisplayName` when the incoming values are non-empty. Test it.
3. **Emulator vector search check.** Run `go test ./internal/store/...` once
   with the Firestore emulator up and add one line to
   `docs/phase1-fetcher-spike.md` saying whether `FindNearest` works in the
   emulator. If it does not, the memory store stays the search test and this
   is known.
4. **Delete the unused `github-token` secret** from `secrets.tf` if the Cloud
   Build GitHub connection does not reference it (check the trigger's
   connection settings in the console first).

## 5. Repository layout to add

```
web/
  server.ts                      mounts, in this order: canonical-host redirect,
                                 JSON body parser for /mcp, CORS for /mcp and
                                 /.well-known and the AS routes, mcpAuthRouter,
                                 requireBearerAuth + MCP handler on /mcp,
                                 then the React Router handler
  mcp/
    server.ts                    buildServer(ctx): McpServer with the three tools
    tools/save-note.ts, search-notes.ts, get-note.ts
    identity.ts                  uidToIdToken(uid): custom token -> ID token, cached
    verifier.ts                  OAuthTokenVerifier for PATs and OAuth access tokens
  oauth/
    provider.ts                  OAuthServerProvider implementation calling Go
    clients-store.ts             OAuthRegisteredClientsStore calling Go
    tokens.ts                    random token generation, hashing, prefixes
    pending.ts                   signed short-lived cookie holding the pending authorize request
  app/routes/
    oauth.consent.tsx            requires login, shows client and scopes, approve/deny
    app.connect.tsx              PAT list/create/revoke and per-client setup snippets
    api.pats.ts                  POST create, DELETE revoke (BFF to Go)
  app/services/
    oauth-api.server.ts          typed wrappers for /v1/oauth/* (service auth)
    pats-api.server.ts           typed wrappers for /v1/me/pats (user auth)
    backend.server.ts            gains { service: true } option
api/internal/
  httpapi/
    service_auth.go              requireService middleware, Google ID token validation
    oauth.go                     /v1/oauth/* handlers
    pats.go                      /v1/me/pats handlers and /v1/oauth/pats/{hash}
    notes.go                     + POST /v1/notes
  store/
    store.go                     + OAuth client, code, token, and PAT operations
    firestore.go, memory.go      implementations
    oauth.go                     types
infra/terraform/
  iam.tf                         web-sa: roles/iam.serviceAccountTokenCreator on itself
  firestore.tf                   TTL fields, pat_tokens index
  cloud_run.tf                   new env on both services
docs/
  phase2-clients.md              per-client test results and config snippets
```

## 6. Data model (Firestore)

```
oauth_clients/{client_id}
  client_id, client_secret_hash (empty for public clients), client_name,
  redirect_uris [string], token_endpoint_auth_method, grant_types,
  scope, client_id_issued_at, created_at

oauth_codes/{code_hash}                 TTL on expires_at
  client_id, uid, scopes [string], code_challenge, code_challenge_method,
  redirect_uri, resource, expires_at, consumed (bool)

oauth_tokens/{token_hash}               TTL on expires_at
  kind (access|refresh), client_id, uid, scopes [string], resource,
  expires_at, created_at, refresh_parent_hash (for rotation), revoked (bool)

pat_tokens/{token_hash}
  uid, label (max 60), prefix (first 12 chars, for display), scopes,
  created_at, last_used_at (write at most hourly), revoked_at
```

Indexes: `pat_tokens (uid ASC, created_at DESC)`. Mirror in
`firestore.indexes.json`. TTL policies on `oauth_codes.expires_at` and
`oauth_tokens.expires_at` via `google_firestore_field` with `ttl_config {}`.

Token formats: PAT `ain_pat_` + 32 random bytes base64url. OAuth access
`ain_at_`, refresh `ain_rt_`, code `ain_ac_`, same construction. Only the
SHA-256 hex of the full string is stored or looked up. The prefix lets the
verifier route without a lookup and lets `/token` reject a PAT outright.

## 7. API contract (Go)

### User-authenticated routes (Firebase ID token, existing middleware)

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/notes` | `{title, summary, takeaways[], code_blocks?[], category?, tags?[], source{provider, share_url?, model?, conversation_date?}, transcript?{messages[]}, keep_transcript?}` | 201 full note. Validates with `CleanAndTruncateNote`, embeds, stores transcript when given and kept. Rejects `summary` empty or fewer than one takeaway with `invalid_argument`. `provider` must be one of `chatgpt, claude, gemini, grok, perplexity, other`. |
| `GET /v1/me/pats` | | `{"pats":[{id, label, prefix, created_at, last_used_at}]}` never the hash |
| `POST /v1/me/pats` | `{"label": "..."}` | 201 `{id, label, prefix, token}`: the only time `token` is returned |
| `DELETE /v1/me/pats/{id}` | | 204; sets `revoked_at` |

### Service-authenticated routes (`requireService`)

| Method and path | Purpose |
|---|---|
| `POST /v1/oauth/clients` | register; returns the stored client |
| `GET /v1/oauth/clients/{client_id}` | lookup |
| `POST /v1/oauth/codes` | store a code (hash, client, uid, scopes, PKCE, redirect, resource, expiry) |
| `POST /v1/oauth/codes/{hash}/consume` | transaction: must exist, not consumed, not expired; marks consumed; returns the record. `not_found` otherwise |
| `POST /v1/oauth/tokens` | store an access or refresh token record |
| `GET /v1/oauth/tokens/{hash}` | lookup; `not_found` if revoked or expired |
| `POST /v1/oauth/tokens/{hash}/rotate` | transaction: consume a refresh token, return its record so the caller can issue a new pair |
| `DELETE /v1/oauth/tokens/{hash}` | revoke |
| `GET /v1/oauth/pats/{hash}` | lookup for the verifier; `not_found` if revoked; bumps `last_used_at` at most once an hour |

Error codes added to `errors.go`: `forbidden` (403, service token valid but
wrong caller), `rate_limited` (429, for the BFF-side save limiter to reuse).
Everything else uses the existing set.

`requireService` in `service_auth.go`: read `Authorization: Bearer`, validate
with `google.golang.org/api/idtoken.Validate(ctx, token, cfg.ServiceAudience)`,
require `email == cfg.WebServiceAccount`. If `cfg.ServiceDevToken` is set
(dev script only), a bearer equal to it passes. Log the caller email on
failure, never the token.

## 8. Web contracts

### `backend.server.ts`
`backendFetch(url, init, { service?: boolean })`. When `service` is true and
ID-token auth is enabled, also set `Authorization: Bearer <google id token>`.
When ID-token auth is disabled locally, set `Authorization: Bearer
${SERVICE_DEV_TOKEN}` instead.

### `mcp/identity.ts`
`uidToIdToken(uid)`: `getAuth().createCustomToken(uid)` from `firebase-admin`
initialised with application default credentials and `projectId`; then
`POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${VITE_FIREBASE_API_KEY}`
with `{token, returnSecureToken: true}`; cache `idToken` per uid in a `Map`
with `expiresIn` minus five minutes. Locally, `FIREBASE_AUTH_EMULATOR_HOST`
switches both calls to the emulator (firebase-admin reads the variable; the
REST URL becomes `http://${host}/identitytoolkit.googleapis.com/v1/...`).
A single module-level `firebase-admin` app; never per request.

### `mcp/verifier.ts`
`verifyAccessToken(token)`: by prefix. `ain_pat_` → hash → Go
`/v1/oauth/pats/{hash}` → `AuthInfo{token, clientId: "pat", scopes:
["notes:read","notes:write"], expiresAt: now + 3600, extra: {uid}}`.
`ain_at_` → hash → Go `/v1/oauth/tokens/{hash}` → `AuthInfo` with the stored
client, scopes, expiry, `resource`, and `extra: {uid}`. Anything else throws
`OAuthError(InvalidToken)`. Cache positive results for 60 seconds keyed by
hash so a burst of tool calls costs one Go round-trip. `requireBearerAuth`
gets `resourceMetadataUrl` from `getOAuthProtectedResourceMetadataUrl(new URL("/mcp", PUBLIC_BASE_URL))`.

### `mcp/server.ts`
`buildServer(ctx)`: `ctx.authInfo.extra.uid` is the user. Each tool handler
resolves `uidToIdToken(uid)` and calls Go through `backendFetch` with
`Authorization: Bearer <id token>`, exactly as the browser routes do. Tools:

```
save_note
  title: string 1..200
  summary: string 1..4000, plain text paragraphs
  takeaways: string[] 1..8
  code_blocks?: {lang, code}[]
  category?: enum from taxonomy
  tags?: string[] ≤10
  source: { provider: enum, share_url?: url, model?: string }
  transcript?: { messages: {role: "user"|"assistant", content}[] }
  keep_transcript?: boolean (default: user setting)
  -> { id, url, title, category }   url = `${PUBLIC_BASE_URL}/app/notes/${id}`

search_notes
  query: string 1..500
  category?: enum
  limit?: 1..30, default 10
  -> { notes: [{ id, url, title, category, summary (≤300 chars), tags, created_at, distance }] }

get_note
  note_id: string
  include_transcript?: boolean, default false
  -> the full note without embedding; plus transcript when asked and kept
```

Every tool returns `structuredContent` and a short text rendering. Errors
from Go map to `isError: true` with the error code and the same copy the web
app uses.

### `oauth/provider.ts`
Implements `OAuthServerProvider`:
- `clientsStore`: `getClient` and `registerClient` via Go. Public clients
  (`token_endpoint_auth_method: "none"`) are allowed; PKCE is mandatory
  (leave `skipLocalPkceValidation` unset). Restrict `redirect_uris` to
  `https://` or `http://127.0.0.1` / `http://localhost` loopback.
- `authorize(client, params, res)`: write `{client_id, redirect_uri, scopes,
  state, code_challenge, resource}` into the signed `__oauth_pending` cookie
  (10 minute max age) and redirect to `/oauth/consent`. Reject a `resource`
  that is not `${PUBLIC_BASE_URL}/mcp` with `invalid_target`.
- `challengeForAuthorizationCode`: look up the code by hash, return the
  stored challenge.
- `exchangeAuthorizationCode`: consume via Go (single use), check
  `client_id` and `redirect_uri` match, mint access + refresh, store both,
  return `{access_token, token_type: "bearer", expires_in, refresh_token, scope}`.
- `exchangeRefreshToken`: rotate via Go, refuse if `client_id` differs,
  mint a new pair.
- `verifyAccessToken`: the same function as `mcp/verifier.ts`.
- `revokeToken`: delete by hash.
- `authorizationResponseIssParameterSupported: true`.

### `app/routes/oauth.consent.tsx`
Loader: `requireAuth` (so the user signs in with the normal flow and comes
back), read and validate the pending cookie, load the client from Go, render
client name, scopes in plain words, approve and deny buttons. Action:
`deny` → redirect to `redirect_uri?error=access_denied&state=`; `approve` →
generate code, store via Go with the pending fields and the signed-in uid,
clear the cookie, redirect to `redirect_uri?code=&state=&iss=${PUBLIC_BASE_URL}`.
Reject when the cookie is missing or older than 10 minutes.

### `app/routes/app.connect.tsx`
Sections: "Personal access tokens" (label input, create, one-time reveal with
copy button, list with prefix and last used, revoke with confirm), then
"Connect a client" with copy-paste blocks:
- Claude Code: `claude mcp add --transport http ai-notes ${PUBLIC_BASE_URL}/mcp --header "Authorization: Bearer <token>"`
- Cursor: `mcp.json` with `{"mcpServers":{"ai-notes":{"url":"${PUBLIC_BASE_URL}/mcp","headers":{"Authorization":"Bearer <token>"}}}}`
- Claude.ai: Settings → Connectors → Add custom connector → URL
  `${PUBLIC_BASE_URL}/mcp`, no token needed, sign in when prompted.
- ChatGPT: Settings → Connectors → developer mode → same URL.
Say that the first call after idle can take a few seconds.

## 9. Work items, in order

Commit after each numbered item with a message of the form
`phase2: <item>`. Do not squash. Items 9.1 through 9.6 make PATs work end to
end and are the product; OAuth follows.

### 9.1 Carry-over fixes
Section 4, four commits.

### 9.2 Terraform
- `iam.tf`: `google_service_account_iam_member` giving `web-sa`
  `roles/iam.serviceAccountTokenCreator` on `web-sa` itself (needed for
  `createCustomToken` via `signBlob`).
- `firestore.tf`: `google_firestore_field` TTL on `oauth_codes.expires_at`
  and `oauth_tokens.expires_at`; `google_firestore_index` for
  `pat_tokens (uid, created_at desc)`.
- `cloud_run.tf`: API env `SERVICE_AUDIENCE = google_cloud_run_v2_service.api.uri`
  and `WEB_SERVICE_ACCOUNT = google_service_account.web.email`. Web env
  `PUBLIC_BASE_URL`: a local that is `"https://${var.domain}"` when
  `manage_domain` is true and `google_cloud_run_v2_service.web.uri` otherwise,
  so the switch to a custom domain is a one-line change. Nothing with a fixed
  cost.
- Apply. `terraform plan` clean.

### 9.3 Go: store and handlers
- `store/oauth.go` types; `Store` gains the operations implied by section 7;
  Firestore and memory implementations; transactions for consume and rotate.
- `service_auth.go` with `requireService`; config gains `ServiceAudience`,
  `WebServiceAccount`, `ServiceDevToken`.
- `pats.go`, `oauth.go`, and `POST /v1/notes` in `notes.go`. `POST /v1/notes`
  reuses the pipeline's embed and transcript steps: extract them from
  `ingest.Pipeline` into a `notes.Saver` (or a method on the pipeline) so
  ingest and direct save share one code path. Do not duplicate the embed
  text formula.
- Tests: consume is single use; rotate refuses a second use; token lookup
  returns `not_found` when revoked or expired; PAT create returns the token
  once and list never does; `POST /v1/notes` stores an embedding and does not
  change `ingest_count`; `requireService` rejects a user token and accepts
  the dev token only when configured; upsert keeps email when the claim is
  absent.

### 9.4 Web: identity and verifier
- Add `firebase-admin`, `@modelcontextprotocol/server`,
  `@modelcontextprotocol/express`, `@modelcontextprotocol/node`, `zod`,
  `cors`. Pin exact versions.
- `backend.server.ts` service option. `mcp/identity.ts`, `mcp/verifier.ts`,
  `oauth/tokens.ts`, `services/pats-api.server.ts`, `services/oauth-api.server.ts`.
- Tests with mocked fetch: identity caches per uid and refreshes near expiry;
  verifier routes by prefix, rejects unknown prefixes, caches for 60 s.

### 9.5 Web: PAT UI
- `api.pats.ts` and `app.connect.tsx` as in section 8. Link from the `/app`
  header. Render test for the one-time reveal state.

### 9.6 Web: MCP endpoint with PATs
- `mcp/server.ts` and the three tools. In `server.ts`, first a middleware that
  301-redirects any request whose `Host` is not `PUBLIC_BASE_URL`'s host to the
  same path on `PUBLIC_BASE_URL` (skip it when `PUBLIC_BASE_URL` is a localhost
  origin, so dev and tests are unaffected). Then `express.json()` scoped to
  `/mcp`; `cors()` for `/mcp` exposing `Mcp-Session-Id` and
  `Mcp-Protocol-Version`; `requireBearerAuth` then the handler. Mount before
  the React Router handler. If the v2 handler's host validation rejects the
  production hostname, pass `allowedHosts` from `MCP_ALLOWED_HOSTS` (see
  `docs/serving/http.md` in the SDK repo for the option's home).
- Local check: `npx @modelcontextprotocol/inspector` against
  `http://127.0.0.1:5173/mcp` with a PAT created at `/app/connect`; call all
  three tools. Then deploy and repeat from Claude Code and Cursor against
  production. Record both in `docs/phase2-clients.md`.

### 9.7 Web: OAuth authorization server
- `oauth/provider.ts`, `oauth/clients-store.ts`, `oauth/pending.ts`,
  `routes/oauth.consent.tsx`. In `server.ts`, `mcpAuthRouter({ provider,
  issuerUrl, resourceServerUrl: new URL("/mcp", base), scopesSupported:
  ["notes:read","notes:write"], resourceName: "AI Notes" })` mounted at the
  root before the React Router handler. Remove any separate
  `mcpAuthMetadataRouter` since the router serves both well-known documents.
- Tests: provider unit tests against a fake Go (`registerClient` rejects a
  non-https redirect; `exchangeAuthorizationCode` refuses a mismatched
  `redirect_uri`, a second exchange, and a wrong `resource`; refresh rotation
  refuses reuse). Route test for consent deny and approve redirects.
- Local check with the SDK's `examples/cli-client` or MCP Inspector in OAuth
  mode against `http://127.0.0.1:5173/mcp`.

### 9.8 Hosted clients
Deploy. From Claude.ai add the custom connector, complete consent, run the
three tools. Same from ChatGPT developer mode. Try Grok. Write
`docs/phase2-clients.md` with, per client: date, what worked, exact error
text for anything that did not, and the config snippet that ended up
working. If Claude.ai or ChatGPT fails on discovery, capture their requests
from the Cloud Run request log before changing anything.

### 9.9 Setup page polish and docs
- Finish `app.connect.tsx` snippets from what actually worked in 9.8.
- README: MCP section (URL, PAT, OAuth), new env vars, local Inspector
  instructions. CLAUDE.md and GEMINI.md: `web/mcp` and `web/oauth` in the
  layout, the rule that Go's `/v1/oauth/*` routes are service-auth only, and
  that the SDK's legacy auth package is pinned deliberately.

## 10. Not in Phase 2

Public note pages, `scope=public` search, PWA share target, bookmarklet,
Gemini and Grok fetchers, `update_note` and `delete_note` tools, client
credentials grant, token introspection endpoint, per-tool scopes beyond
read/write, session-based (stateful) MCP, an admin UI for registered
clients, replacing the legacy auth router. If one of these seems necessary,
stop and ask.

## 11. Tasks only a human can do

1. Enable the Email link (passwordless) sign-in provider in the Firebase
   console. It is still not configured, so the email-link half of `/login`
   cannot work until it is. Google sign-in already works on the canonical
   origin, which is in the authorised-domain list.
   A custom domain is **not** needed for Phase 2; when you do add one, follow
   section 3.1.
2. Confirm the Claude.ai plan in use allows custom connectors, and that
   ChatGPT developer mode is enabled on the account used for testing.
3. Check Grok's current remote MCP support and auth model before 9.8; if it
   has none, record that and skip.
4. Set the access token lifetime to 2 minutes once (env override) to test
   refresh from Claude.ai, then set it back.
5. Read the consent screen copy and the setup page copy before release.

## 12. Environment variables (new)

| Name | Where | Purpose |
|---|---|---|
| `PUBLIC_BASE_URL` | web | Canonical issuer and resource origin, no trailing slash. Production: `https://ai-notes-web-g3q7qn4imq-ew.a.run.app`. Local: `http://127.0.0.1:5173`, set by the dev script. Every OAuth document, redirect and tool response URL is built from it. |
| `SERVICE_AUDIENCE` | api | Expected `aud` on service tokens: the API's own URL. |
| `WEB_SERVICE_ACCOUNT` | api | Expected `email` on service tokens. |
| `SERVICE_DEV_TOKEN` | api, web, local only | Static bearer accepted by `requireService` and sent by `backendFetch` when ID tokens are off. Set by the dev script, never in production. |
| `OAUTH_ACCESS_TOKEN_TTL_SECONDS` | web | Default 3600. Human task 11.4 overrides it once. |
| `MCP_ALLOWED_HOSTS` | web, optional | Comma-separated hosts if the handler's host validation needs them. |
| `VITE_FIREBASE_API_KEY` | web runtime | Already baked in by the Dockerfile `ENV`; now also read at runtime by `identity.ts`. |

## 13. Rules that apply to every file

All of section 9 in `docs/phase0-handoff.md` and section 12 in
`docs/phase1-handoff.md` still apply. In addition:

- **Tokens are never stored or logged in clear.** Hash on receipt, compare
  hashes, log at most the prefix.
- **Go's `/v1/oauth/*` routes never accept a user token, and user routes never
  accept a service token.** Two middlewares, no route on both.
- **The MCP endpoint is stateless.** No module-level maps keyed by session,
  no in-memory state that a second Cloud Run instance would not have, except
  the two bounded caches named in section 8 (ID tokens per uid, verifier
  results for 60 s), both of which are correct when empty.
- **No always-on infrastructure.** Anything that needs a warm instance,
  a Redis, or a connector is out of scope; say so and stop.
- **Every OAuth failure mode in the exit criteria is a test**, not a manual
  check.

## 14. Verification script for the final check

```bash
# local
pnpm install && pnpm typecheck && pnpm test && (cd api && go vet ./... && go test ./...)
pnpm dev
# in another shell: create a PAT at http://127.0.0.1:5173/app/connect, then
npx @modelcontextprotocol/inspector   # connect to http://127.0.0.1:5173/mcp with the PAT

# deployed
BASE=https://ai-notes-web-g3q7qn4imq-ew.a.run.app
curl -sS -i $BASE/mcp | head -5                                      # 401 + WWW-Authenticate
curl -sS $BASE/.well-known/oauth-protected-resource/mcp | jq .
curl -sS $BASE/.well-known/oauth-authorization-server | jq .
# every issuer/resource field above must equal $BASE exactly
claude mcp add --transport http ai-notes $BASE/mcp --header "Authorization: Bearer $PAT"
# in Claude Code: "save a note titled X with summary Y", then "search my notes for X"
terraform -chdir=infra/terraform plan -var-file=environments/prod.tfvars   # No changes
gcloud run services describe ai-notes-web --region europe-west1 --format='value(spec.template.metadata.annotations."autoscaling.knative.dev/minScale")'   # 0
```

The completion report should list: every exit criterion from section 2 with
pass/fail, the contents of `docs/phase2-clients.md`, the commit hash of the
last `phase2:` commit, the SDK package versions pinned, and any item from
section 11 still outstanding.
