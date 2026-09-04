# Phase 0 handoff: skeleton and deploy for ai-notes.io

This document is self-contained. It is written for an implementing agent that
has not seen the design discussion. Read `docs/PLAN.md` for the full product
plan; this file covers only Phase 0.

## 1. What ai-notes is, in three sentences

AI Notes lets people save useful AI conversations from ChatGPT, Claude, Gemini,
and Grok into one private, searchable library. A user pastes a share link (or
later, says "save this to ai-notes" via MCP), the service distils it into a
summary with a category and tags, and stores it. Notes can optionally be
published on a public page with provenance back to the original conversation.

## 2. Phase 0 goal and exit criteria

Goal: a deployed, authenticated, empty application at https://ai-notes.io with
a repeatable build and deploy pipeline. No product features.

Phase 0 is complete when every item below is true:

- [ ] `https://ai-notes.io` serves the landing page over TLS from Cloud Run.
- [ ] A user can sign in with Google, land on `/app`, and see "Signed in as
      their-email". Signing out returns them to `/`.
- [ ] The `/app` page's data comes from the Go API (`GET /v1/me`), which
      verified the Firebase ID token and upserted a `users/{uid}` document in
      Firestore. The document is visible in the Firestore console.
- [ ] The Go API Cloud Run service is not reachable from the internet. It has
      internal-only ingress and only the web service's service account holds
      the invoker role. Confirmed by a `curl` to the API URL from outside GCP
      returning HTTP 404 from Google's front end (internal ingress hides the
      service entirely).
- [ ] A push to `main` on GitHub builds both images with Cloud Build and
      deploys both Cloud Run services with no manual step.
- [ ] `terraform plan` on the committed configuration shows zero changes after
      the deploy pipeline has run once.
- [ ] `pnpm dev` starts the Firebase emulators, the Go API, and the web app
      locally, and the sign-in flow works end to end against the emulators
      with no real GCP resources touched.
- [ ] `go test ./...` and `pnpm test` and `pnpm typecheck` pass, and a GitHub
      Actions workflow runs them on every pull request.
- [ ] A GCP budget alert exists on the project.
- [ ] `README.md` documents local setup and deploy in under a page.

## 3. Decisions already made (do not re-open)

| Area | Decision |
|---|---|
| Frontend | React Router v7, framework mode, SSR on Node 24, Tailwind v4, pnpm. The web service is also the BFF: it holds the session cookie and proxies to the Go API. It runs behind a small custom Express entry (`web/server.ts`, React Router's documented custom-server setup) rather than `react-router-serve`, because Phase 2 mounts the MCP transport and OAuth routes on that same server. In Phase 0 the Express entry only serves the React Router handler and `/healthz`. |
| Public surface | The web service is the only public Cloud Run service, now and in every later phase. MCP and OAuth endpoints will live on it in Phase 2. The Go API is never public. |
| Backend | Go 1.25, standard library `net/http` with the Go 1.22+ method-pattern mux (`mux.HandleFunc("GET /v1/me", ...)`). No web framework. Structured logs via `log/slog` JSON handler. |
| Database | Firestore, native mode, in the same GCP project. Vector search and other features arrive in Phase 1; Phase 0 only creates the database and the `users` collection. |
| Auth | Firebase Auth with Google sign-in only. The browser gets an ID token, POSTs it to the BFF, which stores it in an HTTPOnly cookie. The BFF forwards it as `Authorization: Bearer` to the Go API, which verifies it with the Firebase Admin SDK. Email-link sign-in comes in Phase 1. |
| Service-to-service auth | The Go API Cloud Run service has internal-only ingress and is IAM-gated. The web service reaches it over a VPC subnet using Direct VPC Egress (no connector), mints a Google ID token for the API audience, and sends it in the `X-Serverless-Authorization` header so the end-user `Authorization` header passes through untouched. See `../emx-template/app/services/backend.server.ts` and the `vpc_access` block on `remix_app` in `../emx-template/terraform/main.tf`. |
| Hosting | Google Cloud Run v2, two services (`web`, `api`), both `min_instances = 0`. Region `asia-northeast1`. Single GCP project which is also the Firebase project. |
| Infra as code | Terraform with the `google` provider `~> 6.0`, state in a GCS bucket created by a separate bootstrap module. Cloud Build for build and deploy, triggered by push to `main`. GitHub Actions only for tests. |
| Credentials | No service-account JSON files anywhere. Cloud Run uses its attached service account via Application Default Credentials. Locally, the emulators need no credentials. |
| Secrets | Secret Manager. Terraform creates the secret resources; a human adds the versions. The only Phase 0 secret is `SESSION_SECRET` for the web cookie. |
| Analytics, i18n, feature flags | None in Phase 0. |

## 4. Reference projects to copy from

Both live next to this repo. Copy patterns, not code wholesale; strip anything
patent-specific.

`../emx-template` (React Router v7 + Go + Firestore + Cloud Run + Terraform):

| File | Take from it |
|---|---|
| `Dockerfile.goproj`, `Dockerfile.web` | Multi-stage Go build on `golang:1.25` to `gcr.io/distroless/base-debian12`; Node 24 alpine with corepack pnpm and `VITE_*` build args. |
| `cloudbuild/go-app.yaml`, `cloudbuild/remix-app.yaml`, `cloudbuild/triggers/*.trigger.yaml`, `cloudbuild/README.md` | Build, push, `gcloud run services update` deploy; filename-based trigger definitions imported with `gcloud builds triggers import`. |
| `terraform/main.tf` | `google_cloud_run_v2_service` shape with `env` from Secret Manager `value_source`, `lifecycle.ignore_changes` on image and labels so Cloud Build deploys don't fight Terraform. Copy the VPC network, subnet, the `INGRESS_TRAFFIC_INTERNAL_ONLY` backend, and the `vpc_access` Direct VPC Egress block on the web service. Ignore the Cloud Run Jobs, schedulers, and alert policies. |
| `app/services/backend.server.ts` | Copy nearly verbatim. It is the BFF-to-API fetch wrapper. |
| `app/services/session.server.ts`, `auth.server.ts`, `auth-api.server.ts`, `firebase.client.ts` | Cookie session storage, `requireAuth`, `validateAuth`, token validation against the API, client Firebase init with emulator switching. Strip the device-id, demo-session, read-only, and beta-gate logic. |
| `app/routes/api.auth.session.ts` | The POST that turns an ID token into the session cookie. Strip everything except validate, set cookie, return. |
| `scripts/dev-emulator.mjs`, `firebase.json` | Emulator boot script and port layout. Drop the fake-gcs-server and seeding. |
| `pmpserver/main.go` | `AuthMux` pattern: a wrapper that verifies the bearer token and passes the decoded token to the handler. Reimplement as middleware on the new mux; keep the idea of every route declaring its access level. |

`../neurex/infra/terraform`:

| File | Take from it |
|---|---|
| `bootstrap/main.tf` | The state-bucket bootstrap module. |
| `versions.tf` | Provider `~> 6.0`, GCS backend block. |
| `main.tf` | `google_project_service` for_each, Artifact Registry repo, Secret Manager secret plus `secret_iam_member` pairs, bucket with versioning. |

## 5. Repository layout to create

```
ai-notes/
  README.md
  CLAUDE.md                  short: layout, commands, the rules in section 9
  GEMINI.md                  same content as CLAUDE.md
  .gitignore
  .env.example
  package.json               root: pnpm workspace with scripts that fan out to web/
  pnpm-workspace.yaml
  firebase.json              emulator ports
  firestore.rules            deny all (clients never talk to Firestore directly)
  firestore.indexes.json     empty indexes array
  scripts/
    dev-emulator.mjs
  api/
    Dockerfile
    go.mod                   module ainotes
    cmd/api/main.go
    internal/config/config.go
    internal/httpapi/server.go        mux, middleware, route registration
    internal/httpapi/auth.go          bearer verification middleware, TokenVerifier interface
    internal/httpapi/me.go            GET /v1/me
    internal/httpapi/server_test.go
    internal/store/store.go           Store interface
    internal/store/firestore.go       Firestore implementation
    internal/store/memory.go          in-memory implementation for tests
  web/
    Dockerfile
    package.json
    react-router.config.ts
    vite.config.ts
    tsconfig.json
    app/
      root.tsx
      routes.ts
      routes/_index.tsx               landing
      routes/login.tsx
      routes/app.tsx                  authenticated shell
      routes/api.auth.session.ts      POST: ID token to cookie
      routes/api.auth.logout.ts       POST: clear cookie
      routes/healthz.ts
      services/backend.server.ts
      services/session.server.ts
      services/auth.server.ts
      services/auth-api.server.ts
      services/firebase.client.ts
      components/AuthProvider.tsx
      app.css
  cloudbuild/
    README.md
    api.yaml
    web.yaml
    triggers/api.trigger.yaml
    triggers/web.trigger.yaml
  infra/terraform/
    bootstrap/main.tf
    versions.tf
    variables.tf
    main.tf
    outputs.tf
    envs/prod.tfvars
  .github/workflows/ci.yml
  docs/
    PLAN.md
    phase0-handoff.md
```

## 6. Work items, in order

Commit after each numbered item with a message of the form
`phase0: <item>`. Do not squash.

### 6.1 Repo scaffold
- `git init`, `.gitignore` covering Go, Node, `.env`, `*.tfstate*`,
  `.terraform/`, `firebase-debug.log`, `firestore-debug.log`.
- Root `package.json` with `packageManager: pnpm@10`, `engines.node >= 24`,
  and scripts: `dev` (runs `scripts/dev-emulator.mjs`), `dev:web`, `dev:api`,
  `build`, `typecheck`, `test`, `lint`. `pnpm-workspace.yaml` listing `web`.
- `.env.example` with every variable from section 8, empty values, one
  comment each.

### 6.2 Go API
- `go mod init ainotes`. Dependencies: `firebase.google.com/go/v4`,
  `cloud.google.com/go/firestore`, `github.com/joho/godotenv`. Nothing else.
- `internal/config`: read `BIND_ADDRESS` (default `0.0.0.0:8000`),
  `GOOGLE_CLOUD_PROJECT` (required), `FIRESTORE_EMULATOR_HOST` and
  `FIREBASE_AUTH_EMULATOR_HOST` (optional, the SDKs read them themselves but
  log which mode is active at startup).
- `internal/store`: `Store` interface with `UpsertUser(ctx, User) error` and
  `GetUser(ctx, uid) (User, error)`. `User{UID, Email, DisplayName, CreatedAt,
  LastSeenAt}`. Firestore implementation writes `users/{uid}`; `UpsertUser`
  sets `CreatedAt` only on first write and always updates `LastSeenAt`. Memory
  implementation for tests.
- `internal/httpapi`:
  - `TokenVerifier` interface: `Verify(ctx, idToken string) (*auth.Token, error)`.
    Production implementation wraps `authClient.VerifyIDTokenAndCheckRevoked`.
    Test implementation returns a fixed token for a fixed string.
  - Middleware `requireUser` that reads `Authorization: Bearer`, verifies, and
    puts the decoded token on the request context. Missing or bad token
    returns `401` with JSON body `{"code":"unauthenticated"}`.
  - Every error response is JSON `{"code": "<machine_readable>"}`. No prose
    messages in bodies; prose goes to the log.
  - Routes: `GET /healthz` returns `{"status":"ok"}` with no auth.
    `GET /v1/me` requires a user, calls `UpsertUser`, returns
    `{"uid","email","display_name"}`.
  - `slog` JSON handler on stdout with keys `severity` and `message` so Cloud
    Logging parses level and text. One access-log line per request with
    method, path, status, duration, and no user identifiers.
  - Graceful shutdown on SIGTERM with a 10 second drain (Cloud Run sends
    SIGTERM before scaling to zero).
- Tests: `healthz` returns 200; `/v1/me` without a token returns 401 with the
  code; `/v1/me` with the test token returns the user and the memory store
  holds one user with `CreatedAt` set; a second call leaves `CreatedAt`
  unchanged and advances `LastSeenAt`.
- `api/Dockerfile`: build context is the `api/` directory. Two stages, final
  image distroless, `EXPOSE 8000`, `CMD ["/app/api"]`.

### 6.3 Web app
- Scaffold React Router v7 in `web/` with `ssr: true`, Tailwind v4 via
  `@tailwindcss/vite`, path alias `~` to `app/`. Dependencies: `react-router`,
  `@react-router/node`, `@react-router/express`, `express`, `compression`,
  `firebase`, `google-auth-library`, `isbot`. Dev: `vitest`,
  `@testing-library/react`, `typescript`, `@react-router/dev`, `tsx`.
- `web/server.ts`: the custom Express entry. In development it wires the Vite
  dev server middleware; in production it serves `build/client` statically
  and `createRequestHandler` from `@react-router/express` for everything
  else. It registers `GET /healthz` directly on Express before the React
  Router handler. Leave a clearly marked block where Phase 2 will mount
  `/mcp`, `/oauth/*`, and `/.well-known/*`. `pnpm start` runs
  `node build/server/index.js`; `pnpm dev:web` runs `tsx server.ts`.
- `services/session.server.ts`: `createCookieSessionStorage` named
  `__session`, `httpOnly`, `sameSite: "lax"`, `secure` in production, secret
  from `SESSION_SECRET`, max age 14 days. Fail at startup if `SESSION_SECRET`
  is unset in production.
- `services/backend.server.ts`: copy from emx-template. It auto-enables ID
  token minting when `K_SERVICE` is set and `BACKEND_URL` is https.
- `services/auth-api.server.ts`: `validateToken(idToken)` calls
  `GET ${BACKEND_URL}/v1/me` through `backendFetch` with the bearer token.
  Returns `{ok: true, user}` on 200, `{ok: false, status}` on 401, throws on
  network errors so the caller can distinguish "bad token" from "API down".
- `services/auth.server.ts`: `validateAuth(request)` and `requireAuth(request)`
  as in emx-template. Keep the behaviour that an unreachable API does not
  clear the cookie.
- `services/firebase.client.ts`: initialise from `VITE_FIREBASE_*`; if
  `VITE_FIREBASE_AUTH_EMULATOR_HOST` is set, call `connectAuthEmulator`.
- `components/AuthProvider.tsx`: subscribes to `onIdTokenChanged`; whenever a
  token arrives, POSTs it to `/api/auth/session`. This keeps the cookie fresh
  because Firebase rotates ID tokens hourly.
- Routes:
  - `/` landing: product name, one sentence, a "Sign in" link. No marketing
    copy beyond that.
  - `/login`: a single "Continue with Google" button using
    `signInWithPopup(GoogleAuthProvider)`. On success, wait for the session
    POST to resolve, then navigate to `returnTo` or `/app`.
  - `/app`: loader calls `requireAuth`, renders "Signed in as {email}" and a
    sign-out button that POSTs to `/api/auth/logout` and calls Firebase
    `signOut`.
  - `/api/auth/session` POST: validate via API, set cookie, return
    `{ok: true}`. `/api/auth/logout` POST: destroy cookie, redirect `/`.
  - `/healthz`: returns `{"status":"ok"}`.
- Tests: one vitest test rendering the landing route; one for the session
  cookie helper round-trip.
- `web/Dockerfile`: build context is `web/`. Node 24 alpine, corepack,
  `pnpm install --frozen-lockfile`, `VITE_FIREBASE_*` as `ARG` then `ENV`,
  `pnpm build`, `CMD ["pnpm","start"]`, `EXPOSE 3000`.

### 6.4 Local development
- `firebase.json`: auth on 9099, firestore on 8088, `ui.enabled: false`,
  `singleProjectMode: true`.
- `firestore.rules`: deny all reads and writes. Clients never talk to
  Firestore directly; only the Go API does, with the Admin SDK, which bypasses
  rules.
- `scripts/dev-emulator.mjs`: starts `firebase emulators:start`, waits for
  both ports, then starts the Go API with `FIRESTORE_EMULATOR_HOST`,
  `FIREBASE_AUTH_EMULATOR_HOST`, and `GOOGLE_CLOUD_PROJECT` set, then starts
  `react-router dev` with `BACKEND_URL=http://127.0.0.1:8000` and
  `VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`. Set env vars inside the
  script, never inline in `package.json`, because the primary dev shell is
  PowerShell. Kill all children on Ctrl-C.
- The emulator project id must equal `GOOGLE_CLOUD_PROJECT` or the Admin SDK
  rejects every token with an invalid `aud` claim. Read it from `.env` and
  refuse to start without it.

### 6.5 Terraform
Two modules. Region variable defaults to `asia-northeast1`.

`infra/terraform/bootstrap/`: one bucket `${project_id}-tfstate`, versioned,
uniform access. Applied once with local state. Copy from Neurex.

`infra/terraform/` (backend `gcs`, bucket from bootstrap, prefix
`terraform/state`):

- `google_project_service` for: `run`, `artifactregistry`, `secretmanager`,
  `firestore`, `iam`, `iamcredentials`, `cloudbuild`, `storage`,
  `billingbudgets`, `cloudresourcemanager`. `disable_on_destroy = false`.
- `google_artifact_registry_repository` `ai-notes`, format DOCKER.
- `google_firestore_database` name `(default)`, `location_id = var.region`,
  `type = "FIRESTORE_NATIVE"`, `deletion_policy = "DELETE"` is not acceptable;
  use `"ABANDON"` so a destroy never drops user data.
- `google_storage_bucket` `${project_id}-transcripts`, versioning off,
  uniform access, no public access. Unused until Phase 1 but cheap to create
  now so IAM is settled.
- Two service accounts: `api-sa` and `web-sa`. Least privilege:
  - `api-sa`: `roles/datastore.user` on the project,
    `roles/storage.objectAdmin` on the transcripts bucket only,
    `roles/firebaseauth.viewer` so `VerifyIDTokenAndCheckRevoked` can look up
    users (token signature checks need no API call; the revocation check does).
  - `web-sa`: `roles/secretmanager.secretAccessor` on `SESSION_SECRET` only,
    `roles/run.invoker` on the `api` service.
- `google_secret_manager_secret` `SESSION_SECRET`, auto replication. No
  version in Terraform; a human adds it (section 7).
- `google_compute_network` `ai-notes-vpc` (no auto subnets) and
  `google_compute_subnetwork` `ai-notes-subnet`, `10.0.1.0/24`, in
  `var.region`, `private_ip_google_access = true`. Add `compute` to the
  enabled services. Copy from emx-template.
- `google_cloud_run_v2_service` `api`: `ingress =
  "INGRESS_TRAFFIC_INTERNAL_ONLY"` and no `allUsers` binding, so the service
  is reachable only from inside the VPC and only by identities holding
  `roles/run.invoker`. `service_account = api-sa`. Container image on first
  apply is the public placeholder `us-docker.pkg.dev/cloudrun/container/hello`,
  with `lifecycle.ignore_changes = [template[0].containers[0].image, client,
  client_version, template[0].labels]` so Cloud Build owns the image from
  then on. Env: `BIND_ADDRESS`, `GOOGLE_CLOUD_PROJECT`. Port 8000.
  `scaling { min_instance_count = 0, max_instance_count = 3 }`.
  This service stays private in every later phase. Handlers still verify the
  end-user token themselves (defence in depth), but the network and IAM
  layers are the outer boundary and are never removed.
- `google_cloud_run_v2_service` `web`: `ingress = "INGRESS_TRAFFIC_ALL"`,
  `google_cloud_run_v2_service_iam_member` with `allUsers` as
  `roles/run.invoker`. `service_account = web-sa`. Same placeholder image and
  `ignore_changes`. Env: `BACKEND_URL = google_cloud_run_v2_service.api.uri`,
  `SESSION_SECRET` from Secret Manager `value_source`, `NODE_ENV=production`.
  Port 3000. Same scaling. `vpc_access { network_interfaces { network,
  subnetwork } egress = "PRIVATE_RANGES_ONLY" }` so calls to the API go
  through the VPC while public egress (Firebase, Google APIs) stays direct.
  If the ID-token call to the API fails with a 404 from Google's front end,
  switch egress to `ALL_TRAFFIC` as emx-template does and note it.
  Set `timeout = "900s"` now; Phase 2's MCP streams need it.
- `google_cloud_run_domain_mapping` for `ai-notes.io` and `www.ai-notes.io`
  pointing at `web`, wrapped in `count = var.manage_domain ? 1 : 0` with
  the variable defaulting to `false`. Domain mapping fails until the domain
  is verified (section 7), so the first apply runs with it off. Output the
  DNS records the mapping returns.
- `google_billing_budget`: amount `var.budget_usd` (default 20), thresholds
  at 50, 90, 100 percent, email to the billing account's default recipients.
  Wrapped in `count = var.billing_account_id == "" ? 0 : 1`.
- `outputs.tf`: `web_url`, `api_url`, `artifact_registry`, `domain_dns_records`.
- `envs/prod.tfvars`: `project_id`, `region`, `billing_account_id`,
  `manage_domain`.

### 6.6 Cloud Build
- `cloudbuild/api.yaml` and `cloudbuild/web.yaml`, copied from emx-template
  with the build context changed to `api` and `web` respectively
  (`docker build -f api/Dockerfile api`). Image path
  `${_AR_HOSTNAME}/${PROJECT_ID}/ai-notes/${_SERVICE_NAME}:${COMMIT_SHA}`.
  Deploy step: `gcloud run services update ${_SERVICE_NAME} --image ...
  --region ${_DEPLOY_REGION}`. No `:latest` tag; nothing needs it.
- `web.yaml` passes the seven `VITE_FIREBASE_*` values as `--build-arg` from
  trigger substitutions. These are public client config, not secrets.
- `cloudbuild/triggers/*.trigger.yaml`: filename-based triggers on push to
  `^main$`, GitHub repo from `var`-style placeholders `<GITHUB_OWNER>/ai-notes`,
  with `includedFiles` so an `api/**` change does not rebuild `web` and vice
  versa. Both triggers also include `cloudbuild/**`.
- `cloudbuild/README.md`: the import command and the ordering caveat (import
  a filename-based trigger only after the yaml is on `main`).
- The Cloud Build service account needs `roles/run.admin`,
  `roles/iam.serviceAccountUser` on both runtime service accounts, and
  `roles/artifactregistry.writer`. Grant these in Terraform against the
  project's default Cloud Build service account
  (`${project_number}@cloudbuild.gserviceaccount.com`).

### 6.7 GitHub Actions
`.github/workflows/ci.yml` on `pull_request` and `push` to `main`: two jobs.
`api`: setup Go 1.25, `go vet ./...`, `go test ./...`. `web`: setup Node 24
and pnpm 10, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`.
No deploy from Actions.

### 6.8 Docs
- `README.md`: what it is, prerequisites (Go 1.25, Node 24, pnpm 10, Firebase
  CLI, gcloud, Terraform 1.9+), `pnpm dev`, how deploy works, link to
  `docs/PLAN.md`.
- `CLAUDE.md` and `GEMINI.md`: identical, under 60 lines: layout, commands,
  the rules in section 9, and "read `docs/PLAN.md` before product work".

## 7. Tasks only a human can do

These need console access, billing, or domain ownership. The implementing
agent should stop and list the ones that block it at the point they block.

1. Create the GCP project, attach billing, note `<PROJECT_ID>` and
   `<BILLING_ACCOUNT_ID>`.
2. Run the bootstrap module: `terraform init && terraform apply` in
   `infra/terraform/bootstrap` with `-var project_id=<PROJECT_ID>`.
3. Add Firebase to the project in the Firebase console, enable Authentication,
   enable the Google sign-in provider, add `ai-notes.io` and `localhost` to
   the authorised domains. Copy the web app config values into
   `cloudbuild/triggers/web.trigger.yaml` substitutions and into `.env`.
4. Add the `SESSION_SECRET` version:
   `openssl rand -base64 48 | gcloud secrets versions add SESSION_SECRET --data-file=-`
5. Connect the GitHub repository to Cloud Build (Cloud Build console, second
   generation GitHub connection), then import the two triggers with the
   commands in `cloudbuild/README.md`.
6. Verify `ai-notes.io` in Google Search Console with the same Google account
   that runs Terraform, then set `manage_domain = true` and apply. Add the
   `A`/`AAAA`/`CNAME` records from the `domain_dns_records` output at the
   registrar. Certificate provisioning takes up to an hour after DNS resolves.
7. Push to `main` and watch the two Cloud Build runs.

## 8. Environment variables

| Name | Where | Purpose |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | api, dev script | Project id for Firebase Admin and Firestore. Must match the emulator project id locally. |
| `BIND_ADDRESS` | api | Default `0.0.0.0:8000`. |
| `FIRESTORE_EMULATOR_HOST` | api, local only | Set by the dev script. |
| `FIREBASE_AUTH_EMULATOR_HOST` | api, local only | Set by the dev script. |
| `BACKEND_URL` | web | The api service URL. Local: `http://127.0.0.1:8000`. |
| `BACKEND_USE_ID_TOKEN` | web, optional | Force ID-token minting on or off. Auto-detected otherwise. |
| `SESSION_SECRET` | web | Cookie signing secret. Secret Manager in prod. |
| `NODE_ENV` | web | `production` on Cloud Run. |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` | web build | Public Firebase web config, baked into the bundle at build time. |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST` | web, local only | Points the browser SDK at the emulator. |

## 9. Rules that apply to every file

- **No credentials in the repo.** No service-account JSON, no `.env`, no
  secret values in Terraform or Cloud Build yaml. The `VITE_FIREBASE_*` values
  are the only exception because they are public by design.
- **The Go API is never public.** Internal ingress and IAM are the outer
  boundary; every Go handler still verifies the end-user token itself as
  defence in depth. Anything that must face the internet (MCP, OAuth,
  webhooks) goes on the web service and calls Go through `backendFetch`.
- **Error responses carry a machine-readable `code`, never prose.** The
  frontend maps codes to text.
- **Terraform owns infrastructure; Cloud Build owns images.** Anything Cloud
  Build stamps on a service (image, labels) is in `ignore_changes`. After a
  deploy, `terraform plan` must show zero changes.
- **Local dev never touches real GCP.** If a step would need a real
  credential locally, the design is wrong; use the emulator.
- **Environment variables are set in scripts, not inline in `package.json`**,
  because PowerShell is a primary dev shell.
- **Least-privilege service accounts.** `api-sa` and `web-sa` are separate and
  each gets only the roles listed in 6.5.
- **Do not add** analytics, i18n, feature flags, a CSS component library, an
  ORM, a Go web framework, or any Phase 1 feature. If something seems
  necessary and is not in this document, stop and ask.

## 10. Verification script for the final check

Run these in order and paste the results into the completion report:

```bash
# local
pnpm install && pnpm typecheck && pnpm test && (cd api && go vet ./... && go test ./...)
pnpm dev   # then sign in at http://localhost:5173/login with an emulator user

# deployed
curl -sS https://ai-notes.io/healthz
curl -sS -o /dev/null -w '%{http_code}\n' "$(terraform -chdir=infra/terraform output -raw api_url)/healthz"   # expect 404: internal ingress
terraform -chdir=infra/terraform plan -var-file=envs/prod.tfvars   # expect: No changes
# after one sign-in: open the Firestore console, collection "users", confirm one document with created_at and last_seen_at
```

The completion report should list: every exit criterion from section 2 with
pass/fail, the commit hash of the last `phase0:` commit, the two Cloud Build
run URLs, and any item from section 7 still outstanding.
