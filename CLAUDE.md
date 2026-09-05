# AI Notes Project Guide

## Architecture Overview

AI Notes is composed of two containerized services running on Google Cloud Run:
1. **Private Go API (`ai-notes-api`)**:
   - Runs on Cloud Run with `INGRESS_TRAFFIC_INTERNAL_ONLY`.
   - Accessible only within the VPC network (via Direct VPC Egress / Serverless VPC Access connector).
   - Backed by Google Cloud Firestore (Native Mode).
   - Validates Firebase ID tokens passed in `Authorization: Bearer <token>`.
   - Never exposed to the public internet; Cloud Run IAM validates service-to-service callers via `X-Serverless-Authorization`.

2. **Public Web BFF (`ai-notes-web`)**:
   - Runs on Cloud Run with `INGRESS_TRAFFIC_ALL`.
   - Built on React Router v7 with server-side rendering (SSR) in Node 24.
   - Fronted by a lightweight custom Express server (`web/server.ts`).
   - Acts as the Backend-For-Frontend (BFF): manages the encrypted `__session` cookie and proxies authenticated requests to the private Go API.
   - **Why Express fronts React Router**: Phase 2 mounts the Model Context Protocol (MCP) streamable HTTP transport (`/mcp`) and OAuth 2.1 authorization server endpoints (`/oauth/*`, `/.well-known/*`) directly on the same Express instance.

## Service Boundaries

- **Go API (`api/`)**:
  - Authoritative data storage and transactional domain operations in Firestore.
  - The Go API is the **only** service that talks to Firestore, Cloud Storage (GCS), or Vertex AI.
  - Package layout:
    - `internal/notes`: Domain models, 20-character base32 ID generation, 18-category taxonomy, validation and truncation.
    - `internal/ingest`: SSRF-safe HTTP client, provider scrapers/parsers (ChatGPT, Claude), 7-step ingest pipeline.
    - `internal/ai`: Vertex AI structured JSON summarisation and 768-dim embeddings, deterministic fakes for local dev.
    - `internal/store`: Firestore native store with `FindNearest` cosine vector search, Memory store, GCS and Memory blob stores.
    - `internal/httpapi`: REST handlers, strict JSON errors defined in `internal/httpapi/errors.go`.
  - User record management (`GET /v1/me` upserts and retrieves user profiles).
  - Pure JSON API: errors are strictly structured (`{"code":"<symbolic_code>"}`), never free-form prose.

- **Node Web BFF (`web/`)**:
  - User interface rendering and routing (React Router v7 Framework Mode).
  - Session cookie issuance, serialization, rotation, and revocation (`__session`).
  - Google Identity authentication orchestration via Firebase Client SDK.
  - Rate limiting (token bucket per IP) and share URL provider allowlist verification.
  - Translates symbolic API error codes into user-friendly copy. Never touches GCP services directly.
  - Package layout:
    - `mcp/`: MCP server implementation (`server.ts`), tools (`tools/save-note.ts`, `search-notes.ts`, `get-note.ts`), bearer token verifier (`verifier.ts`), and Firebase Custom Token identity resolver (`identity.ts`).
    - `oauth/`: OAuth 2.1 server provider (`provider.ts`), client registration store (`clients-store.ts`), pending consent cookie (`pending.ts`), and token generation/hashing (`tokens.ts`).

## Developer Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Starts the Firebase emulator stack (Auth + Firestore), Go API with `USE_FAKE_AI=true`, and React Router web app. |
| `pnpm dev:web` | Starts the web app only (assumes API and emulators are already running). |
| `pnpm dev:api` | Starts the Go API only (assumes emulators or GCP credentials are active). |
| `pnpm build` | Builds the web app for production (`react-router build && esbuild server.ts`). |
| `pnpm typecheck` | Runs React Router typegen and TypeScript compiler checks. |
| `pnpm test` | Runs web tests (`vitest run`) and Go tests (`cd api && go test ./...`). |

## Style & Architectural Rules

1. **No prose errors in Go API responses**: Every error response is a JSON object with at least a `code` field drawn strictly from the closed set defined in `api/internal/httpapi/errors.go` (e.g. `unauthenticated`, `not_found`, `invalid_argument`, `unsupported_provider`, `fetch_failed`, `fetch_blocked`, `transcript_empty`, `transcript_too_long`, `summarise_failed`, `ingest_limit_reached`, `internal_error`).
2. **Go API is never public**: It has no `allUsers` invoker binding in Terraform, its Cloud Run ingress is internal-only, and its tests verify rejection of unauthenticated requests.
3. **Only Go API touches cloud data services**: The Go API is the only service with access to Firestore, Cloud Storage, or Vertex AI. The Web BFF never calls GCP data APIs directly.
4. **Go `/v1/oauth/*` routes are service-auth only**: These endpoints accept only service authentication (`requireService` with verified Google ID token matching `SERVICE_AUDIENCE` and `WEB_SERVICE_ACCOUNT`, or `SERVICE_DEV_TOKEN` in local dev). They never accept user tokens. Conversely, user routes never accept service tokens.
5. **Node BFF owns the session cookie**: The browser never holds a long-lived database or API credential.
6. **Least privilege on service accounts**: No `owner`, `editor`, or broad admin roles on runtime service accounts (`sa-ai-notes-api`, `sa-ai-notes-web`).
7. **No checked-in secrets**: Any file containing secrets (`.env`, `*-service-account*.json`, `*.pem`, `*.key`) is gitignored. CI rejects commits with secret keys.
8. **Monorepo, not polyrepo**: One repo, one commit history, one CI pipeline.
9. **Explicit dependencies only**: No required global tools beyond standard runtimes.
10. **Build from the repo root or subproject root identically**: Dockerfiles are tested with respective build contexts.
11. **No premature abstraction**: Write concrete implementations first.
12. **Don't touch what works**: Preserve tested patterns from reference architectures unless there is a specific, documented need to adapt them.
13. **Pin legacy auth package deliberately**: `@modelcontextprotocol/server-legacy/auth` is pinned deliberately for the OAuth authorization server router, Dynamic Client Registration, and RFC 9728 protected resource metadata endpoints.
14. **Never suppress warnings or errors**: Never suppress warnings, ignore errors, or hide diagnostic outputs. Diagnose and fix the underlying root cause directly.

## Deployment Notes

- **Cloud Build Triggers**:
  - `ai-notes-api-deploy` (`cloudbuild/api.yaml`): Deploys private Go API on push to `main`.
  - `ai-notes-web-deploy` (`cloudbuild/web.yaml`): Deploys public Web BFF on push to `main`.
  - Declarative trigger definitions are located in `cloudbuild/triggers/`.
- **Service Accounts**:
  - `sa-ai-notes-api`: Grants `roles/datastore.user` and `roles/logging.logWriter`.
  - `sa-ai-notes-web`: Grants `roles/logging.logWriter`, `roles/run.invoker` on `ai-notes-api`, and `roles/secretmanager.secretAccessor` on `session-secret`.
  - `sa-ai-notes-build`: Cloud Build agent with `roles/run.admin`, `roles/artifactregistry.writer`, and `roles/iam.serviceAccountUser`.
- **Secrets Management**:
  - Managed via Google Cloud Secret Manager (`session-secret`, `github-token`).
  - Web service mounts `session-secret` as an environment variable via Cloud Run secret references.
- **Terraform State**:
  - Managed in `infra/terraform/` using remote GCS backend `ai-notes-tfstate` (provisioned by `infra/terraform/bootstrap/`).
