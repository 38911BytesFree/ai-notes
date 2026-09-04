# ai-notes.io — Implementation Plan

Status: draft, 3 September 2026. Product decisions already made:

- Standalone product (not a Neurex feature). Neurex may become a publishing target later.
- Domain: ai-notes.io. Product name in prose: "AI Notes".
- Notes are summary-first. The original transcript is stored privately as a
  compressed attachment (share-link path) or optionally (MCP path), never
  exposed publicly, deletable per note and by account default.
- Ingestion paths, in priority order: share-link paste (universal, zero install),
  remote MCP server, PWA share target, bookmarklet, ChatGPT App (test only),
  browser extension (deferred).

---

## 1. Architecture

```
browser ──────▶ web (Node, Cloud Run, PUBLIC) ─────────────▶ api (Go, Cloud Run, PRIVATE)
MCP clients ──▶   React Router v7 SSR + BFF                    internal ingress + IAM only
(Claude, Grok,    /mcp  streamable HTTP (TS MCP SDK)           │
 ChatGPT)         /oauth/*, /.well-known/*  OAuth 2.1 AS       ├─▶ Firestore (notes, users, tokens, vector index)
                  session cookie, proxies /api/* to Go         ├─▶ Cloud Storage (gz transcripts)
                  SSR for public note pages (SEO, OG cards)    ├─▶ Vertex AI (Gemini: summarise, embed)
                                                               └─▶ share-page fetchers (per provider)
```

Two Cloud Run services, both scale-to-zero. The web service is the only public
surface: it terminates every kind of caller (browser, MCP client, OAuth flow)
and calls the Go API with a Google-signed service identity over a VPC. The Go
API has internal-only ingress and never becomes public. This is the
emx-template shape, so Dockerfiles, `backendFetch` with the Cloud Run ID
token, Firebase auth flow, Cloud Build config, and Terraform modules can be
lifted almost verbatim.

The web container runs a small custom Express server (React Router's
documented custom-server setup) so it can mount the MCP transport and the
OAuth routes as plain Node handlers next to the React Router request handler.

Identity forwarding to Go has exactly one path: a Firebase ID token in
`Authorization: Bearer`, verified by the Firebase Admin SDK in Go. Browser
sessions already hold one. For MCP callers, who authenticate with an OAuth
access token or a PAT, the BFF mints a Firebase custom token for the user and
exchanges it for an ID token via the Identity Toolkit `signInWithCustomToken`
REST call, cached per user for its one-hour lifetime. Go never trusts a
plain identity header.

### Why these choices

| Decision | Choice | Alternative considered | Reason |
|---|---|---|---|
| Frontend | React Router v7 (framework mode, SSR) | SvelteKit adapter-node | Same shape either way; RR7 lets us copy emx-template auth/BFF/deploy code. Svelte 5 is nicer to write but we would rebuild the plumbing. |
| Backend | Go 1.25, stdlib `net/http` mux, private Cloud Run service | Rust (Neurex) | Fast compiles, small images, cheap Cloud Build. Pure domain API with one caller (the BFF) and one auth path (Firebase ID token). |
| MCP + OAuth host | The web (Node) service, using `@modelcontextprotocol/sdk` streamable HTTP transport and its server-side OAuth helpers | MCP on the Go API with public ingress | Keeps Go private, which is the point of the BFF design. The OAuth authorize and consent screens are web pages, which already live here. The TypeScript SDK is the reference implementation and its auth helpers replace a hand-rolled authorization server. |
| Database | Firestore with vector index | Cloud SQL + pgvector; SQLite + Litestream | Zero ops, scale-to-zero, free tier, native KNN (`FindNearest`, cosine, prefilter on owner/category). Cloud SQL has a fixed monthly cost and no scale-to-zero. SQLite forces max-instances=1 and is what we disliked in Neurex. Migrate to pgvector only if we need hybrid full-text search or rich filters. |
| Transcripts | Cloud Storage, gzip, keyed by note id | Firestore subcollection | Keeps Firestore docs small and reads cheap; 1 MB doc limit never bites. |
| LLM + embeddings | Vertex AI: Gemini Flash for summarise/categorise, `gemini-embedding-001` at 768 dims | Anthropic API | GCP-native billing and service-account auth, no API keys. Large context handles long transcripts. Firestore vector max is 2048 dims, so use 768. Keep a `Summariser` interface so the provider can be swapped. |
| Auth (web) | Firebase Auth: Google sign-in + email link; HTTPOnly session cookie set by BFF | Clerk/Auth0 | Same as emx-template. |
| Auth (MCP) | The web service is the OAuth 2.1 authorization server (PKCE, dynamic client registration, protected-resource metadata) via the MCP SDK's `OAuthServerProvider` interface, issuing our own opaque tokens stored in Firestore through Go. Plus long-lived personal access tokens for Claude Code / Cursor. For the Go call, the BFF exchanges the user's identity for a Firebase ID token (custom token flow). | Auth0 as AS | Claude.ai connectors and ChatGPT require OAuth with DCR. The SDK helpers make this mostly storage code and avoid a paid dependency. |
| Share-page fetching | Per-provider adapters behind a `Fetcher` interface; plain HTTP first, headless Chrome (chromedp) fallback in a separate `fetcher` Cloud Run service if needed | Browser extension | See risk #1. |
| Infra | Terraform (GCS backend), Cloud Build, Artifact Registry, Secret Manager, Cloud Run domain mapping for ai-notes.io | | What we know. |

### Repo layout

```
ai-notes/
  web/            Node service, the only public surface
    server.ts     custom Express entry: mounts /mcp, /oauth/*, /.well-known/*, then React Router
    app/          React Router v7 routes, BFF loaders/actions, UI
    mcp/          tools: save_note, search_notes, get_note (call Go via backendFetch)
    oauth/        OAuthServerProvider impl, PAT verification, Firebase custom-token exchange
  api/            Go service, private: REST, ingestion, jobs
    cmd/api/      main
    internal/
      notes/      domain: Note, Category, visibility rules
      ingest/     Fetcher interface + providers/{chatgpt,claude,gemini,grok}
      ai/         Summariser + Embedder interfaces, vertex impl
      store/      Firestore + GCS repositories (interface + emulator tests)
      httpapi/    REST handlers, auth middleware, rate limits, /v1/oauth/* token storage
  infra/terraform/
  cloudbuild/
  docs/
```

---

## 2. Data model (Firestore)

```
users/{uid}
  email, display_name, created_at, plan (free|pro),
  default_keep_transcript (bool), public_handle (optional)

notes/{note_id}
  owner_uid, visibility (private|unlisted|public)
  title, summary (markdown), takeaways [string], code_blocks [{lang, code}]
  category (from fixed taxonomy), tags [string]
  source: { provider (chatgpt|claude|gemini|grok|perplexity|manual),
            share_url, model, conversation_date, fetched_at }
  embedding (Vector, 768d), embedding_model
  has_transcript (bool), transcript_gcs_path, transcript_bytes
  pii_flags [string]           set by scan, blocks publish until acknowledged
  created_at, updated_at

oauth_clients/{client_id}     dynamic client registration
oauth_codes/{code}            short TTL
oauth_tokens/{token_hash}     uid, client_id, scopes, expires_at
pat_tokens/{token_hash}       uid, label, last_used
ingest_jobs/{job_id}          uid, share_url, status, error   (async fetch+summarise)
```

Indexes: vector index on `notes.embedding` with prefilter fields
`owner_uid`, `category`, `visibility`; composite `(owner_uid, created_at desc)`;
`(visibility, created_at desc)` for the public feed.

Category taxonomy (v1, fixed, about 20): Programming, AI & ML, Finance & Investing,
Business, Science, Health, Law, Writing, Education, Cooking, Travel, Home,
Career, Productivity, Design, Marketing, Personal, Other. The summariser picks
one; the user can override.

---

## 3. Core flows

### Share-link ingestion (web)
1. User pastes URL. BFF validates it against a strict domain allowlist
   (SSRF guard), POSTs to `api /v1/ingest`.
2. API creates an `ingest_jobs` doc, returns the job id; web polls status.
3. Fetcher for the provider returns `Transcript{messages[], model, date}`.
4. Summariser (one Gemini call, structured output) returns title, summary,
   takeaways, code_blocks, category, tags, pii_flags.
5. Embedder embeds `title + summary + takeaways`.
6. Store note; gzip transcript to GCS if the user default says keep.
7. Web shows the note; user can edit title/summary/category, toggle visibility.

Fallback: a "Paste conversation text" textarea uses the same pipeline from step 4.

### MCP (web /mcp, streamable HTTP, TypeScript SDK)
Tools, kept deliberately small:
- `save_note(title, summary, takeaways[], category?, tags[], visibility=private,
   source{provider, share_url?, model?}, transcript?)`. The host model writes
   the summary, so there is no LLM cost to us. We embed and store. Returns the note URL.
- `search_notes(query, category?, provider?, since?, limit=10, scope=mine|public)`
- `get_note(note_id, include_transcript=false)`. Enables "continue this
   conversation in another AI".
Later: `update_note`, `delete_note`, `list_categories`.

Auth: `Authorization: Bearer` with either an OAuth access token or a PAT,
verified by the web service. It serves `/.well-known/oauth-protected-resource`
and `/.well-known/oauth-authorization-server`; `/oauth/authorize` is a React
Router route that requires the normal session login, shows a consent screen,
and issues a one-time code. Token, code, and client records are stored in
Firestore through Go's `/v1/oauth/*` endpoints so Go remains the only
Firestore client. Tool handlers resolve the caller's uid, obtain a Firebase ID
token for that uid (custom-token exchange, cached), and call Go through
`backendFetch` exactly as the browser BFF routes do.

### Public notes
- `web /n/{note_id}` SSR: summary, takeaways, provenance badge
  ("Distilled from a ChatGPT conversation, 2 Sep 2026"), link to the source share
  URL, OG meta tags. Never renders the transcript.
- Publishing requires `pii_flags` empty or explicitly acknowledged.
- `unlisted` = reachable by URL, not in feeds or `search_notes(scope=public)`.

---

## 4. Phases

### Phase 0 — Skeleton and deploy (goal: hello world on https://ai-notes.io)
- Repo layout, Go module, RR7 app, Dockerfiles, Cloud Build, Terraform:
  project services, Artifact Registry, two Cloud Run services, service
  accounts, Secret Manager, Firestore (native mode), GCS bucket, domain mapping,
  budget alert.
- Firebase project + Auth providers. Firestore emulator dev script.

### Phase 1 — Private library (the product)
- **First task: fetcher spike.** For ChatGPT and Claude share URLs, try plain
  HTTP and the underlying JSON endpoints; measure whether Cloudflare blocks
  Cloud Run egress. Decide whether the chromedp fetcher service is needed.
  This decides ingestion cost and image size, so it goes first.
- Ingest pipeline, Summariser (Gemini structured output), Embedder.
- Library UI: list, note view/edit, category filter, semantic search box.
- Account settings: keep-transcript default, delete account (exports + wipes).
- ToS and privacy pages. Rate limits on ingest (per uid and per IP).

### Phase 2 — MCP
- PAT tokens + `/mcp` on the web service (TypeScript SDK, streamable HTTP)
  with save/search/get. Firebase custom-token exchange so tool handlers can
  call the private Go API as the user. Test from Claude Code and Cursor.
- OAuth 2.1 AS on the web service via the SDK's `OAuthServerProvider`, with
  DCR and a consent route. Go gains `/v1/oauth/*` storage endpoints. Test
  from the Claude.ai connector, ChatGPT developer mode, and Grok (verify Grok
  remote MCP support first).
- Setup page in the web app with copy-paste config per client.

### Phase 3 — Public and mobile
- Public note pages, OG cards, PII scan gate, unlisted tier.
- PWA manifest with Web Share Target so mobile Share → AI Notes works.
- Gemini and Grok fetchers. Bookmarklet.
- Public feed by category (simple, chronological).

### Phase 4 — Growth
- Minimal ChatGPT App submission to learn the Free-tier boundary empirically.
- Weekly digest email (Cloud Scheduler → Cloud Run job).
- Collections, Markdown/Obsidian export, bulk import from ChatGPT/Claude export zips.
- Optional: publish public notes into Neurex.

---

## 5. Risks and mitigations

1. **Share pages are client-rendered and may be bot-protected.** The ChatGPT
   share page returned only a title to a plain fetch. Mitigate: adapter
   interface, phase-1 spike, headless fallback service, a canary job that
   fetches a known share link per provider daily and alerts on failure
   (emx-template has this pattern), and the paste-text fallback so the product
   never fully breaks.
2. **SSRF via share URLs.** Strict allowlist of provider hosts, no redirects
   followed off-list, fetch from a service with no private network access.
3. **PII leaking to public notes.** Scan at summarise time, block publish,
   summary-only public rendering.
4. **LLM cost on the share-link path.** Free tier caps ingests per month;
   the MCP path costs nothing. Truncate transcripts sent to the summariser at a
   token budget.
5. **OAuth complexity.** Ship PATs first so MCP is usable in week one; OAuth
   follows. Using the MCP SDK's server-side auth helpers rather than a
   hand-rolled authorization server keeps this to storage code plus a consent
   page.
7. **Long-lived MCP connections on the SSR service.** Streamable HTTP holds
   a request open per session. Set the Cloud Run request timeout on `web` to
   at least 15 minutes and keep `max_instances` modest; the Go API is
   unaffected.
6. **Firestore search limits.** No full-text search. If users want keyword
   search, add a `title_lower` prefix index first; pgvector + tsvector is the
   escape hatch.

---

## 6. Open questions

- Gemini vs Claude for summary quality: run both on 20 real conversations
  before locking the default.
- Grok remote MCP: confirm current support and auth model.
- Free tier limits: proposal is 30 ingests/month, unlimited MCP saves,
  unlimited search.
