# AI Notes (ai-notes.io)

AI Notes is a private, searchable library for useful AI conversations.

## Prerequisites

- **Go**: `1.24+` (tested on Go 1.25)
- **Node.js**: `24+` (Node 24 LTS or later)
- **pnpm**: `10.x`
- **Google Cloud SDK (`gcloud`)**: for GCP deployments and triggers
- **Terraform**: `1.9+`
- **firebase-tools**: for local emulator suite

## First-time Setup

1. Install Node workspace dependencies:
   ```bash
   pnpm install
   ```

2. Configure local environment:
   ```bash
   cp .env.example .env
   ```
   Fill in `GOOGLE_CLOUD_PROJECT` (`ai-notes-507510`), `SESSION_SECRET`, and the client-side `VITE_FIREBASE_*` web configuration values.

3. Verify Go dependencies:
   ```bash
   cd api && go mod download && cd ..
   ```

## Local Development

Start the complete local development stack with:
```bash
pnpm dev
```

`pnpm dev` launches `scripts/dev-emulator.mjs` which:
- Starts the Firebase Emulator suite:
  - **Auth Emulator**: `http://127.0.0.1:9099`
  - **Firestore Emulator**: `http://127.0.0.1:8088`
- Starts the Go API backend:
  - **API**: `http://127.0.0.1:8000` (talks to the local emulators)
  - Automatically sets `USE_FAKE_AI=true` so no GCP credentials or billing accounts are required locally.
- Starts the React Router web application:
  - **Web**: `http://localhost:5173` (proxies auth to the Go API)

Press `Ctrl+C` in the terminal to gracefully terminate all child processes.

## Environment Variables

| Variable | Service | Purpose | Default |
|---|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | api, web | GCP Project ID | `ai-notes-507510` |
| `TRANSCRIPTS_BUCKET` | api | GCS bucket name for gzipped raw transcripts | Required in prod (`ai-notes-507510-transcripts`) |
| `GEMINI_MODEL` | api | Gemini summariser model ID | `gemini-2.5-flash` |
| `VERTEX_LOCATION` | api | Vertex AI location region | `europe-west1` |
| `INGEST_MONTHLY_LIMIT` | api | Monthly free ingest quota per user | `30` |
| `SUMMARISER_MAX_CHARS` | api | Transcript summarisation truncation character budget | `200000` |
| `USE_FAKE_AI` | api (local) | Wires deterministic fake AI and memory blob store | `false` (set `true` in `pnpm dev`) |
| `BACKEND_URL` | web | Private Go API base URL | `http://127.0.0.1:8000` |
| `SESSION_SECRET` | web | Iron session cookie encryption secret | Required |
| `PORT` | web | Express server listen port | `5173` local, `8080` prod |

## Tests and Verification

- **Full workspace test suite**:
  ```bash
  pnpm test
  ```
- **Go API unit tests**:
  ```bash
  cd api && go test -v ./... && cd ..
  ```
- **Web app tests**:
  ```bash
  pnpm --filter web test
  ```
- **TypeScript type checking**:
  ```bash
  pnpm typecheck
  ```
- **Terraform formatting check**:
  ```bash
  terraform -chdir=infra/terraform/bootstrap fmt -check
  terraform -chdir=infra/terraform fmt -check
  ```

## Deployment Overview

- **Cloud Run Services**:
  - `ai-notes-api`: Private Go API running on Cloud Run (`INGRESS_TRAFFIC_INTERNAL_ONLY`). Accessible only inside VPC via Direct VPC Egress / Serverless VPC Access connector. Authenticates caller service with `X-Serverless-Authorization` and user with `Authorization: Bearer <Firebase ID Token>`.
  - `ai-notes-web`: Public React Router SSR application running on Cloud Run (`INGRESS_TRAFFIC_ALL`).
- **Cloud Build Triggers**:
  - `ai-notes-api-deploy`: Triggered on push to `main` (`cloudbuild/api.yaml`). Builds Docker image, pushes to Artifact Registry (`europe-west1-docker.pkg.dev/ai-notes-507510/ai-notes/ai-notes-api`), and updates Cloud Run.
  - `ai-notes-web-deploy`: Triggered on push to `main` (`cloudbuild/web.yaml`). Builds Docker image with Firebase client build args, pushes to Artifact Registry, and updates Cloud Run.
- **Terraform State**:
  - Remote state is stored in Google Cloud Storage bucket `ai-notes-tfstate` (created by `infra/terraform/bootstrap`).
