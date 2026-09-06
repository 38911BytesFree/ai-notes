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

## Model Context Protocol (MCP)

AI Notes exposes a remote Model Context Protocol (MCP) streamable HTTP server endpoint at `/mcp` (e.g. `https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp` or `http://127.0.0.1:5173/mcp` locally).

### Available Tools
- `save_note`: Saves a pre-summarised note directly into your Firestore library with 768-dimensional Vertex AI embeddings without consuming your monthly web ingest quota.
- `search_notes`: Semantic vector search (`FindNearest` cosine distance) returning the most relevant notes matching a query.
- `get_note`: Retrieves full note details and optionally decompresses the raw conversation transcript.

### Authentication
- **Command-line / IDE Clients (Claude Code, Cursor)**: Authenticate with Personal Access Tokens (`ain_pat_...`) created in the web UI at `/app/connect`.
  ```bash
  claude mcp add --transport http ai-notes https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp --header "Authorization: Bearer <token>"
  ```
- **Hosted Web Clients (Claude.ai, ChatGPT)**: Authenticate via OAuth 2.1 authorization code flow with PKCE and Dynamic Client Registration (RFC 7591) at `/register` and `/authorize`. Provide the MCP endpoint URL (`https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp`) in your client settings.

### Local Testing with MCP Inspector
1. Start the local stack with `pnpm dev`.
2. Visit `http://127.0.0.1:5173/app/connect` and generate a Personal Access Token.
3. In a separate terminal, launch the MCP Inspector:
   ```bash
   npx @modelcontextprotocol/inspector
   ```
4. Connect using transport **HTTP**, URL `http://127.0.0.1:5173/mcp`, with header `Authorization: Bearer <your_token>`.

## Publishing & Public Notes

AI Notes supports three note visibility tiers:
- **Private** (default): Only visible to the note owner. Transcripts, summaries, and takeaways remain completely confidential.
- **Unlisted**: Accessible via direct permalink (`/n/:id`) to anyone possessing the URL. Not listed on the public feed, excluded from sitemaps, and served with `X-Robots-Tag: noindex, nofollow`.
- **Public**: Discoverable via the public feed (`/feed`), included in `sitemap.xml`, and indexed by search engines when `PUBLIC_INDEXING="true"`.

### Deterministic PII Scanning Gate
Before any note can be published as `unlisted` or `public`, a deterministic regex scanner runs across the title, summary, takeaways, tags, and code blocks. If potential personal data or secrets are identified (email addresses, phone numbers, API keys, private keys), publishing is blocked until the owner explicitly reviews and acknowledges the detected items.

### Public Feed & Reader View
- **Feed (`/feed`)**: Fast, paginated browse experience showing public notes grouped by taxonomy category, with cursor pagination.
- **Note View (`/n/:id`)**: Server-rendered, clean distraction-free reader view with Open Graph preview cards, Twitter cards, and escaped JSON-LD Article structured data. Raw conversation transcripts are never exposed on public or unlisted notes.

## Mobile & Browser Integrations

### Progressive Web App (PWA) & Web Share Target
AI Notes installs as a Progressive Web App on mobile (Android / Chrome). By registering as a Web Share Target (`/manifest.webmanifest`), you can tap "Share" inside the ChatGPT, Claude, Gemini, or Grok apps and select **AI Notes** to immediately route the share link to `/app/share` and summarise it into your library.

### Desktop Browser Bookmarklet
Available at `/app/connect`, the **Save to AI Notes** bookmarklet can be dragged to your browser's bookmarks bar in Chrome, Firefox, Safari, or Edge. When viewing any AI conversation share page, clicking the bookmarklet opens AI Notes in a new tab with the URL pre-populated.

### Supported Conversation Providers
- **ChatGPT** (`chatgpt.com`, `chat.openai.com`): Automated server-side fetch & parse.
- **Claude** (`claude.ai`): Share link detection; manual transcript paste supported (due to Cloudflare bot protection on datacenter IPs).
- **Gemini** (`gemini.google.com`): Share link detection; manual transcript paste supported (requires authenticated Google RPCs).
- **Grok** (`grok.com`): Share link detection; manual transcript paste supported (due to Cloudflare challenges).

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
| `SERVICE_AUDIENCE` | api | Expected `aud` claim on service tokens (API URL) | Required in prod |
| `WEB_SERVICE_ACCOUNT` | api | Expected caller email on service tokens | Required in prod |
| `SERVICE_DEV_TOKEN` | api, web | Static bearer token accepted for local service auth | `dev-service-token` |
| `BACKEND_URL` | web | Private Go API base URL | `http://127.0.0.1:8000` |
| `PUBLIC_BASE_URL` | web | Canonical issuer and resource origin URL | `http://127.0.0.1:5173` |
| `OAUTH_ACCESS_TOKEN_TTL_SECONDS` | web | OAuth access token lifetime in seconds | `3600` |
| `MCP_ALLOWED_HOSTS` | web | Optional comma-separated hosts allowed by MCP handler | None |
| `PUBLIC_INDEXING` | web | If `"true"`, allows search crawlers in `robots.txt`/`sitemap.xml` and drops blanket `noindex` | `"false"` |
| `ABUSE_CONTACT_EMAIL` | web | Abuse reporting email address displayed in public note footers | `abuse@ai-notes.io` |
| `SESSION_SECRET` | web | Session cookie encryption secret | Required |
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
