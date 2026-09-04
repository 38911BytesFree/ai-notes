# Phase 0 review

Reviewed 4 September 2026 against `docs/phase0-handoff.md` at commit `77baf5a`.
Verdict: Phase 0 is functionally complete and the security boundary is
correct. Six exit criteria pass, two fail on infrastructure that was never
created (domain mapping, transcripts bucket), and one fails because of a Cloud
Run front-end quirk (`/healthz`). Everything that fails is listed as a
carry-over work item in `docs/phase1-handoff.md` section 4.

## 1. Exit criteria

| Criterion | Result | Evidence |
|---|---|---|
| `https://ai-notes.io` serves over TLS | FAIL | DNS does not resolve. No `google_cloud_run_domain_mapping` in Terraform; `var.domain` is declared but unused. |
| Google sign-in, `/app` shows email, sign-out | PASS (code review) | `login.tsx`, `app.tsx`, `api.auth.session.ts`, `api.auth.logout.ts` match the spec. `/app` unauthenticated redirects to `/login?returnTo=%2Fapp` on the deployed service. |
| `/app` data comes from `GET /v1/me`, user upserted | PASS (code review) | `auth.server.ts` → `auth-api.server.ts` → `backendFetch` → Go `handleMe` → `UpsertUser` transaction. |
| Go API unreachable from the internet | PASS | `curl https://ai-notes-api-…run.app/healthz` returns 404 from Google's front end. Ingress is `internal`; only `sa-ai-notes-web` holds `roles/run.invoker`. |
| Push to `main` deploys both services | PASS | Cloud Build runs `3d8fb102` (api) and `169d96e2` (web) succeeded on 4 Sep 2026. |
| `terraform plan` shows zero changes | NOT VERIFIED | Not run in this review. Likely drift: Cloud Build stamps `maxScale=20` and the `scaling` block is in `ignore_changes`, so probably clean. |
| `pnpm dev` runs the full stack against emulators | PASS (code review) | `scripts/dev-emulator.mjs` refuses to start without `GOOGLE_CLOUD_PROJECT`, sets env in the script, kills children on Ctrl-C. |
| Go tests, web tests, typecheck pass; CI runs them | PASS | `go vet` clean, `go test` 3 tests pass, vitest 2 tests pass, `tsc` clean. `.github/workflows/ci.yml` has api, web, terraform-fmt, and secret-scan jobs. |
| Budget alert exists | PASS | `google_billing_budget` at 4000 JPY with 50/90/100 percent thresholds. |
| README under a page | PASS | |

## 2. Deviations from the handoff

These are not bugs. They are places where the implementation chose
differently from the spec, listed so nobody rediscovers them later.

| Area | Handoff said | Implementation did | Consequence |
|---|---|---|---|
| Region | `asia-northeast1` | `europe-west1` | Fine. Check Vertex AI model availability in `europe-west1` during the Phase 1 spike. |
| Web to API networking | Direct VPC Egress, `PRIVATE_RANGES_ONLY` | Serverless VPC Access connector, 2 to 3 `e2-micro` instances, `ALL_TRAFFIC` on both services | The connector is the only always-on resource in a scale-to-zero design and carries a fixed monthly charge. Works correctly. |
| API `vpc_access` | None | Same connector, `ALL_TRAFFIC` | Unnecessary: the API only needs outbound to Google APIs. In Phase 1 it will also fetch third-party share pages, and routing that through the connector is an unknown. Remove it (carry-over item). |
| Transcripts bucket | `${project_id}-transcripts` with `storage.objectAdmin` for `api-sa` | Not created | Phase 1 blocker; listed as carry-over. |
| Domain mapping | `google_cloud_run_domain_mapping` behind `manage_domain` | Not created | Human task plus Terraform; listed as carry-over. |
| Cloud Build image tags | SHA only, no `:latest` | Pushes both `:sha` and `:latest`, uses `--no-cache` | Harmless. `--no-cache` makes every build slower than necessary. |
| Trigger `includedFiles` | Filter so `api/**` does not rebuild web | Not set | Every push rebuilds and redeploys both services. |
| Trigger definitions | Import from `cloudbuild/triggers/*.yaml` | Defined in Terraform `cloud_build.tf` **and** the yaml files, which still contain `<GITHUB_OWNER>` placeholders | Two sources of truth. Terraform is the live one. Delete the yaml files or mark them as reference only. |
| Cloud Run `scaling` and `timeout` | `max_instance_count = 3`, web `timeout = 900s` | No `scaling` block (Cloud Build sets `maxScale=20`), web timeout is the 300s default | Set the web timeout to 900s before Phase 2 MCP. Cap max instances so a traffic spike cannot run up the bill. |
| Web Dockerfile | Multi-stage | Single stage, devDependencies present in the runtime image | Larger image and slower cold starts. Not urgent. |
| Local web dev entry | `tsx server.ts` (custom Express) | `dev-emulator.mjs` runs `react-router dev`; `pnpm --filter web dev` runs `tsx server.ts` | The Express layer is never exercised locally. It must be before Phase 2 mounts `/mcp` on it. Cheap to fix now. |
| Go dependencies | Only firebase, firestore, godotenv | Also `google.golang.org/grpc` (direct) for status codes | Fine, it was already transitive. |

## 3. Defects and risks found

1. **`/healthz` is unreachable on the public web URL.** `GET /healthz` on the
   `run.app` URL returns a Google front-end 404 with no `server: Google
   Frontend` header and no request log in Cloud Run. A control request to
   `/healthzz` reaches the app. Something in front of Cloud Run answers that
   exact path. Rename the health route to `/api/health` (or similar) on both
   Express and React Router and update the exit-criterion curl.
2. **`GET /v1/me` runs a Firestore read-write transaction on every call, and
   the BFF calls it on every authenticated page load** (`requireAuth`) plus
   once more from `AuthProvider` on hydration. That is two writes per page
   view. In Phase 1 every library route calls `requireAuth`. Fix: only write
   `last_seen_at` when it is older than one hour, otherwise return after the
   read.
3. **Open redirect on `/login?returnTo=`.** `login.tsx` calls
   `navigate(returnTo)` with the raw query value. Accept only values that
   start with `/` and not `//`.
4. **`pnpm lint` fails**: root script filters to `web`, which has no `lint`
   script. Either add one or remove the root script.
5. **Method mismatch returns 404 instead of 405.** `server.go` treats an empty
   pattern from `mux.Handler` as not found, but Go's mux also returns an empty
   pattern for a known path with the wrong method. Cosmetic; error bodies
   still carry a code.
6. **Session cookie holds a one-hour Firebase ID token with a 14-day cookie
   lifetime.** A user returning after an hour with no tab open gets a redirect
   to `/login` where they must click again, because the SSR loader sees an
   expired token and clears the cookie before the client SDK can refresh.
   Acceptable for now; a silent-refresh step on `/login` would remove the
   extra click.

Nothing here is a security hole in the service boundary. The API stays
private, the cookie is HTTPOnly and signed, no secrets are tracked in git
(`git ls-files` shows only `.env.example`), and the runtime service accounts
hold only the listed roles.

## 4. Things done well

- `NewCloudLoggingLogger` maps slog levels to Cloud Logging `severity` and
  `message` keys correctly, and the access log carries no user identifiers.
- `UpsertUser` preserves `created_at` inside a transaction on both the
  Firestore and memory stores, and the test proves it.
- `validateAuth` distinguishes "token rejected" (clear cookie) from "API
  unreachable" (keep cookie), exactly as specified.
- Firestore has `DELETE_PROTECTION_ENABLED` and `deletion_policy = ABANDON`.
- The custom 404 wrapper on the Go mux means even unmatched routes return
  `{"code":"not_found"}` rather than Go's plain-text default.
- CI has a secret scan and a Terraform format check the handoff did not ask for.
