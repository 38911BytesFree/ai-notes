# Phase 1 handoff: private library for ai-notes.io

This document is self-contained. It is written for an implementing agent that
has not seen the design discussion. Read `docs/PLAN.md` for the product plan
and `docs/phase0-review.md` for the state Phase 0 left behind. This file
covers only Phase 1.

## 1. What Phase 1 delivers, in three sentences

A signed-in user pastes a ChatGPT or Claude share link (or the raw text of a
conversation) and, within about thirty seconds, sees a note: a title, a plain
text summary, key takeaways, extracted code blocks, a category, and tags. The
user can browse their notes by category, search them by meaning, edit or
delete them, and control whether the original transcript is kept. Nothing is
public yet; every note is private to its owner.

## 2. Goal and exit criteria

Goal: the product works for one person with their own library at
https://ai-notes.io. No MCP, no public pages, no mobile.

Phase 1 is complete when every item below is true:

- [ ] `docs/phase1-fetcher-spike.md` exists with a results table showing, for
      ChatGPT and Claude share URLs, whether a plain HTTP fetch from Cloud Run
      returns the full conversation, and the decision that follows from it.
- [ ] Pasting a ChatGPT share URL at `/app` produces a note with a non-empty
      title, summary, at least one takeaway, a category from the fixed
      taxonomy, and a `source.provider` of `chatgpt`. Same for Claude.
- [ ] Pasting conversation text (no URL) produces a note the same way.
- [ ] A share URL on a host outside the allowlist is rejected by the BFF and
      by the Go API with `{"code":"unsupported_provider"}`.
- [ ] `/app` lists the user's notes newest first, filterable by category. A
      search box returns semantically related notes (searching "python async"
      finds a note about asyncio even if the word "async" is not in it).
- [ ] `/app/notes/{id}` shows the note; title, summary, takeaways, category,
      and tags are editable; delete works; a user cannot read or edit another
      user's note (Go returns `{"code":"not_found"}`).
- [ ] With "keep transcript" on, the gzip transcript exists in the transcripts
      bucket after ingest and the note view offers it for download. With it
      off, no object is written. Deleting a note deletes the object.
- [ ] `/app/settings` lets the user set the keep-transcript default, download
      a JSON export of all their notes, and delete their account. After
      account deletion the Firestore user doc, all notes, all transcript
      objects, and the Firebase Auth user are gone.
- [ ] The 31st ingest in a calendar month returns `{"code":"ingest_limit_reached"}`
      and the UI explains it. Ten ingests in one minute from one IP hit the
      BFF rate limit.
- [ ] `/terms` and `/privacy` render, linked from the landing page footer.
- [ ] `https://ai-notes.io` and `https://www.ai-notes.io` serve the app over
      TLS (carry-over from Phase 0).
- [ ] `terraform plan -var-file=environments/prod.tfvars` shows no changes
      after the deploy pipeline has run.
- [ ] `go test ./...`, `pnpm test`, `pnpm typecheck` pass in CI. Go tests
      cover the ingest pipeline with fake fetcher, summariser, and embedder,
      and both fetcher parsers against saved fixtures.

## 3. Decisions already made (do not re-open)

| Area | Decision |
|---|---|
| Ingest is synchronous | `POST /v1/ingest` fetches, summarises, embeds, stores, and returns the note in one request. No job collection, no polling. Reason: Cloud Run throttles CPU after the response is sent, so a fire-and-forget goroutine would stall, and Cloud Tasks is extra infrastructure for no user-visible gain at this scale. The web action waits; Cloud Run's 300 s request timeout is ample. If p95 ingest time exceeds 60 s, revisit with Cloud Tasks (which can call an internal-ingress service). |
| Summary format | Plain text paragraphs separated by blank lines, not Markdown. Code lives in the structured `code_blocks` field. Reason: no Markdown renderer or HTML sanitiser dependency in the web app this phase, and no XSS surface from LLM output. |
| LLM and embeddings | Vertex AI through the Google Gen AI Go SDK (`google.golang.org/genai`, `BackendVertexAI`, ADC). Summariser model from env `GEMINI_MODEL`, default the current Gemini Flash. Embeddings `gemini-embedding-001`, 768 dimensions, task type `RETRIEVAL_DOCUMENT` when indexing and `RETRIEVAL_QUERY` when searching. Vertex location from env `VERTEX_LOCATION`, default `europe-west1`; fall back to `global` if a model is not served there. No API keys anywhere. |
| Vector search | Firestore `FindNearest` on `notes.embedding`, cosine distance, prefiltered by `owner_uid`. Vector index and composite indexes are declared in Terraform (`google_firestore_index`), not clicked in the console. |
| Transcript storage | Cloud Storage bucket `${project_id}-transcripts`, object `transcripts/{note_id}.json.gz`. Content is the normalised `Transcript` JSON. Only the Go API touches the bucket. Never returned inline in list or search responses. |
| Fetcher | `Fetcher` interface with one implementation per provider under `internal/ingest/providers/`. Plain `net/http` only in this phase. If the spike shows both ChatGPT and Claude need a headless browser, stop and report; do not add chromedp to this service. |
| SSRF guard | Allowlist of exact hosts per provider, enforced in the BFF (cheap rejection) and again in Go (authoritative). The Go HTTP client refuses redirects to hosts outside the allowlist, refuses responses over 5 MB, times out at 20 s, and dials only public IPs. |
| Rate limits | Monthly ingest cap per user enforced in Go inside the user document transaction (`INGEST_MONTHLY_LIMIT`, default 30). Per-IP burst limit on the ingest action enforced in the BFF with an in-memory token bucket (10 per minute per IP, per instance). Search and reads are unlimited. |
| Visibility | The `visibility` field exists and is always `private` in Phase 1. No UI for it. Public pages are Phase 3. |
| Category taxonomy | Fixed list in `internal/notes/taxonomy.go`: Programming, AI & ML, Finance & Investing, Business, Science, Health, Law, Writing, Education, Cooking, Travel, Home, Career, Productivity, Design, Marketing, Personal, Other. The summariser must pick one; anything else maps to Other. |
| Email-link sign-in | Added to `/login` alongside Google, using Firebase `sendSignInLinkToEmail`. Phase 0 deferred it here. |
| Networking clean-up | Remove `vpc_access` from the API service. It never needed it, and third-party fetches must not depend on the connector. The web service keeps its current connector configuration; switching it to Direct VPC Egress is optional and separate. |
| Error codes | Closed set, see section 7. Add to the set only by editing `internal/httpapi/errors.go`. |

## 4. Carry-over fixes from Phase 0 (do these first, one commit each)

From `docs/phase0-review.md`. Small, independent, and they unblock later items.

1. **Health route.** Rename `/healthz` to `/api/health` in `web/server.ts`,
   `web/app/routes/healthz.ts` (rename file to `api.health.ts`), and
   `web/app/routes.ts`. The Go API keeps `/healthz` (it is internal).
2. **Local dev uses the Express entry.** In `scripts/dev-emulator.mjs`, start
   the web app with `pnpm exec tsx server.ts` and pass `PORT=5173`. Confirm
   the Vite middleware path in `server.ts` serves the app with HMR.
3. **Cheaper `/v1/me`.** In both stores, `UpsertUser` writes only when the
   document is missing or `last_seen_at` is older than one hour. Keep the
   existing test's assertion that `created_at` is stable; change the
   "advances `last_seen_at`" assertion to inject a clock (`func() time.Time`
   on the store) rather than sleeping.
4. **Open redirect.** In `login.tsx`, use `returnTo` only if it starts with
   `/` and not `//`; otherwise `/app`.
5. **`pnpm lint`.** Remove the root `lint` script. Do not add ESLint.
6. **Cloud Build triggers.** Delete `cloudbuild/triggers/*.yaml` and the
   import instructions in `cloudbuild/README.md`; Terraform is the source of
   truth. Add `included_files = ["api/**", "cloudbuild/api.yaml"]` and
   `["web/**", "cloudbuild/web.yaml"]` to the two `google_cloudbuild_trigger`
   resources. Drop `--no-cache` and the `:latest` tag from both yaml files.
7. **Cloud Run shape.** Remove the `vpc_access` block from the API service.
   Add `scaling { min_instance_count = 0, max_instance_count = 5 }` to both
   services and remove `scaling` from `ignore_changes`. Set `timeout = "900s"`
   on the web service. Apply and confirm sign-in still works (this proves the
   web-to-API path never depended on the API's own VPC egress).
8. **Domain mapping.** Add `google_cloud_run_domain_mapping` resources for
   `var.domain` and `www.${var.domain}` targeting the web service, behind
   `var.manage_domain` (default `false`). Output the DNS records. The human
   task in section 10 turns it on.

## 5. Repository layout to add

```
api/
  cmd/api/main.go                        wires Vertex, GCS, new handlers; add -probe flag (spike)
  internal/
    notes/
      note.go                            Note, Source, CodeBlock, Transcript, Message types
      taxonomy.go                        Categories list, Normalise(category) string
      validate.go                        title/summary/tag limits
    ingest/
      fetcher.go                         Fetcher interface, ErrUnsupportedProvider, ProviderFor(url)
      client.go                          SSRF-safe *http.Client (allowlist, redirect check, size cap, public-IP dialer)
      providers/chatgpt/chatgpt.go       parse share page or backend JSON
      providers/chatgpt/testdata/        saved fixtures from the spike
      providers/claude/claude.go
      providers/claude/testdata/
      pipeline.go                        Ingest(ctx, IngestRequest) (Note, error): fetch → summarise → embed → store
      pipeline_test.go                   with fakes
    ai/
      ai.go                              Summariser and Embedder interfaces, Summary struct
      vertex.go                          genai client, structured-output summarise, embed
      fake.go                            deterministic fakes for tests
      prompt.go                          the summariser system prompt and JSON schema
    store/
      store.go                           Store interface grows: notes CRUD, search, ingest quota
      firestore.go                       + FindNearest, batched delete
      memory.go                          + brute-force cosine search
      blob.go                            BlobStore interface: Put/Get/Delete(ctx, key, []byte)
      gcs.go                             GCS implementation
      blob_memory.go
    httpapi/
      errors.go                          the closed error-code set and writeError helper
      ingest.go                          POST /v1/ingest
      notes.go                           GET/PATCH/DELETE /v1/notes/{id}, GET /v1/notes, GET /v1/notes/search
      transcript.go                      GET /v1/notes/{id}/transcript
      me.go                              + PATCH /v1/me, GET /v1/me/export, DELETE /v1/me
      ratelimit.go                       nothing in Go; quota lives in the store transaction (file exists only if needed)
web/app/
  routes.ts                              add the routes below
  routes/app.tsx                         becomes the library: list, category filter, search, add form
  routes/app.notes.$id.tsx               view and edit
  routes/app.settings.tsx
  routes/api.ingest.ts                   POST action: allowlist check, IP rate limit, proxy to Go
  routes/login.tsx                       + email link
  routes/login.email.tsx                 completes the email-link sign-in
  routes/terms.tsx
  routes/privacy.tsx
  services/notes-api.server.ts           typed wrappers over backendFetch for every /v1/notes* call
  services/ratelimit.server.ts           token bucket keyed by IP
  services/share-url.ts                  allowlist + provider detection, shared by client and server
  components/NoteCard.tsx, NoteForm.tsx, CategoryChips.tsx, CodeBlock.tsx
docs/
  phase1-fetcher-spike.md
infra/terraform/
  storage.tf                             transcripts bucket + IAM
  firestore.tf                           + indexes
  iam.tf                                 + aiplatform.user, firebaseauth.admin
  project.tf                             + aiplatform.googleapis.com
  cloud_run.tf                           + domain mapping, env for GCS bucket and model names
```

## 6. Data model

Firestore documents. Field names are snake_case and match the `firestore`
struct tags; JSON tags are identical.

```
users/{uid}                              (existing, extended)
  uid, email, display_name, created_at, last_seen_at
  default_keep_transcript   bool         default true
  ingest_period             string       "2026-09"
  ingest_count              int          resets when ingest_period changes

notes/{note_id}                          note_id = 20-char random base32, generated in Go
  owner_uid                 string
  visibility                string       always "private" in Phase 1
  title                     string       max 200 chars
  summary                   string       plain text, max 4000 chars
  takeaways                 []string     3 to 8 items, each max 300 chars
  code_blocks               []{lang, code}   max 20, code max 8000 chars each
  category                  string       from taxonomy
  tags                      []string     max 10, lowercase, max 30 chars
  source                    {provider, share_url, model, conversation_date, fetched_at}
                                         provider in chatgpt|claude|manual
  embedding                 Vector       firestore.Vector32, 768 dims
  embedding_model           string       "gemini-embedding-001"
  embedding_text_hash       string       sha256 of the text that was embedded; skip re-embed on edit if unchanged
  has_transcript            bool
  transcript_bytes          int
  created_at, updated_at    timestamp
```

Transcript object in GCS (`transcripts/{note_id}.json.gz`):

```json
{"provider":"chatgpt","model":"gpt-5","conversation_date":"2026-09-01T10:00:00Z",
 "messages":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

Indexes, declared in Terraform:

- Vector: collection `notes`, fields `owner_uid` ASC + `embedding` vector
  (dimension 768, flat).
- Composite: `notes` on `owner_uid` ASC, `created_at` DESC.
- Composite: `notes` on `owner_uid` ASC, `category` ASC, `created_at` DESC.

Mirror them in `firestore.indexes.json` so the emulator has them.

## 7. API contract (Go)

Every endpoint requires `Authorization: Bearer <firebase id token>` except
`/healthz`. Every non-2xx body is `{"code": "<one of the set below>"}` and
nothing else; details go to the log.

Error codes (`internal/httpapi/errors.go`):
`unauthenticated`, `not_found`, `invalid_argument`, `unsupported_provider`,
`fetch_failed`, `fetch_blocked`, `transcript_empty`, `transcript_too_long`,
`summarise_failed`, `ingest_limit_reached`, `internal_error`.
HTTP status: 401, 404, 400, 400, 502, 502, 400, 400, 502, 429, 500.

| Method and path | Request | Response |
|---|---|---|
| `POST /v1/ingest` | `{"share_url": "..."}` or `{"text": "...", "provider": "manual"}`; optional `keep_transcript` bool overriding the user default | 201 with the full note (without `embedding`) |
| `GET /v1/notes?category=&cursor=&limit=` | limit default 30, max 100; cursor is the `created_at` of the last item as RFC3339 | `{"notes": [...], "next_cursor": "..."}` list items omit `summary` body beyond 300 chars, `code_blocks`, `embedding` |
| `GET /v1/notes/search?q=&category=&limit=` | q max 500 chars; limit default 10, max 30 | `{"notes": [...]}` in distance order, same trimmed shape, plus `distance` per item |
| `GET /v1/notes/{id}` | | full note without `embedding` |
| `PATCH /v1/notes/{id}` | any of `title`, `summary`, `takeaways`, `category`, `tags` | full note. Re-embed if the concatenated title+summary+takeaways hash changed |
| `DELETE /v1/notes/{id}` | | 204. Deletes the transcript object first, then the doc |
| `GET /v1/notes/{id}/transcript` | | `application/json`, the decompressed transcript; 404 if `has_transcript` is false |
| `DELETE /v1/notes/{id}/transcript` | | 204; clears `has_transcript` |
| `GET /v1/me` | existing | existing shape plus `default_keep_transcript`, `ingest_count`, `ingest_limit` |
| `PATCH /v1/me` | `{"default_keep_transcript": bool}` | me shape |
| `GET /v1/me/export` | | `application/json`, streamed: `{"user": {...}, "notes": [full notes with `transcript` inline when kept]}` |
| `DELETE /v1/me` | | 204. Order: transcript objects, notes (batched 400 per commit), user doc, Firebase Auth user |

Ownership: every note read or write filters on `owner_uid == uid` and returns
`not_found` on mismatch, never a 403 that would confirm existence.

The ingest pipeline (`internal/ingest/pipeline.go`), in order:

1. `ProviderFor(url)` or `provider == "manual"` with text. Unknown host →
   `unsupported_provider`.
2. Quota: transaction on `users/{uid}` that resets the counter if the period
   changed, rejects with `ingest_limit_reached` if at the limit, otherwise
   increments. Do this before the fetch so a blocked fetch cannot be used to
   bypass the counter. Decrement on `fetch_failed`, `fetch_blocked`, and
   `transcript_empty` so a bad link does not cost the user.
3. Fetch → `Transcript`. Empty messages → `transcript_empty`.
4. Truncate to `SUMMARISER_MAX_CHARS` (default 200000) keeping the head and
   tail with a marker in the middle; over 2 MB raw → `transcript_too_long`.
5. Summarise with structured output. Validate: title non-empty, category
   normalised to taxonomy, tags lowercased and deduplicated, limits from
   section 6 enforced by truncation not rejection. Two attempts on a schema
   validation failure, then `summarise_failed`.
6. Embed `title + "\n" + summary + "\n" + takeaways joined`.
7. Write the note. If keep-transcript, gzip and put the transcript object,
   then set `has_transcript` and `transcript_bytes` on the same doc write. If
   the GCS put fails, still save the note with `has_transcript=false` and log.

## 8. Work items, in order

Commit after each numbered item with a message of the form
`phase1: <item>`. Do not squash. Items 8.1 and 8.2 are the carry-overs and
the spike; nothing else starts until the spike result is written down.

### 8.1 Carry-over fixes
Section 4, in order, eight commits.

### 8.2 Fetcher spike (blocks everything after it)

Purpose: find out whether plain HTTP from Cloud Run can read ChatGPT and
Claude share pages. This decides whether Phase 1 ships with two providers,
one, or only paste-text.

- Add `internal/ingest/client.go` (the SSRF-safe client) and a `-probe <url>`
  flag on `cmd/api` that fetches the URL with that client, prints status,
  final URL, content type, body length, and the first 2 KB, then exits. This
  runs inside the existing API image, so no new Dockerfile.
- Candidate endpoints to try, per provider. These are what worked at some
  point; treat them as hypotheses:
  - ChatGPT: `https://chatgpt.com/share/{id}` (HTML, look for a
    `<script id="__NEXT_DATA__">` or an inline JSON blob containing
    `linear_conversation` or `mapping`), and
    `https://chatgpt.com/backend-api/share/{id}` (JSON).
  - Claude: `https://claude.ai/share/{id}` (HTML, likely client-rendered) and
    `https://claude.ai/api/chat_snapshots/{id}` (JSON with `chat_messages`).
- Run each from three places: the developer machine, a Cloud Run Job created
  from the deployed API image with `--args=-probe,<url>` and no VPC settings,
  and the same job with the web service's connector settings. Use a browser
  `User-Agent` and a plain Go default `User-Agent` for each.
- Write `docs/phase1-fetcher-spike.md`: a table of provider × endpoint ×
  origin × UA → outcome (full transcript, title only, Cloudflare challenge,
  403, other), the response snippets that matter, and one of these decisions:
  - Both work: implement both providers (8.5).
  - One works: implement that one; the other provider's share URLs return
    `fetch_blocked` with UI copy that says to paste the text instead.
  - Neither works: stop and report. Phase 1 continues with paste-text only
    and the headless fetcher becomes its own design question.
- Save the successful raw responses (redact nothing; share pages are public
  by construction) as fixtures under `providers/<name>/testdata/`.
- Delete the Cloud Run Job afterwards. Keep the `-probe` flag; it is the
  canary later.

### 8.3 Terraform for Phase 1
- `storage.tf`: bucket `${var.project_id}-transcripts`, `var.region`,
  uniform access, versioning off, `public_access_prevention = "enforced"`,
  no lifecycle rules. `google_storage_bucket_iam_member` for
  `roles/storage.objectAdmin` to `api-sa`, scoped to this bucket.
- `project.tf`: add `aiplatform.googleapis.com`.
- `iam.tf`: `roles/aiplatform.user` to `api-sa` on the project; replace
  `roles/firebaseauth.viewer` with `roles/firebaseauth.admin` (needed for
  `DeleteUser`).
- `firestore.tf`: the three indexes from section 6 as `google_firestore_index`
  resources. The vector index uses `fields { field_path = "embedding"
  vector_config { dimension = 768 flat {} } }`.
- `cloud_run.tf`: API env `TRANSCRIPTS_BUCKET`, `GEMINI_MODEL`,
  `VERTEX_LOCATION`, `INGEST_MONTHLY_LIMIT`. No change to web env.
- Apply. Index builds take minutes; wait for `READY` before testing search.

### 8.4 Go: domain, store, blob store
- `internal/notes`: types, taxonomy, validation. Table test for
  `Normalise` (exact, case-insensitive, unknown → Other).
- `internal/store`: extend `Store` with `CreateNote`, `GetNote(uid, id)`,
  `UpdateNote`, `DeleteNote`, `ListNotes(uid, category, cursor, limit)`,
  `SearchNotes(uid, category, vector, limit)`, `ReserveIngest(uid, period,
  limit) error`, `ReleaseIngest(uid)`, `DeleteAllForUser(uid)`, `UpdateUserSettings`.
  Memory implementation does brute-force cosine. Firestore implementation
  uses `Query.FindNearest` with `DistanceMeasureCosine` and a `Where` on
  `owner_uid`.
- `BlobStore` with GCS and memory implementations. GCS client from
  `cloud.google.com/go/storage`.
- Integration test for the Firestore store that runs only when
  `FIRESTORE_EMULATOR_HOST` is set (skip otherwise). Check whether the
  emulator supports `FindNearest`; if it does not, the search test is memory
  only and the spike doc notes it.

### 8.5 Go: fetchers
- `client.go`: `NewClient(allowlist []string)` returning an `*http.Client`
  whose `CheckRedirect` rejects off-list hosts and more than 3 hops, whose
  transport dials only after resolving to a public IP, with a 20 s timeout.
  `io.LimitReader` at 5 MB on every body. Tests with `httptest` for redirect
  rejection and size cap.
- One provider package per working provider from the spike. Each exposes
  `Fetch(ctx, url) (notes.Transcript, error)` and `Match(host) bool`. Parser
  tests against the saved fixtures assert message count, first user message
  prefix, and model string.
- `fetcher.go`: `ProviderFor(rawURL)` returns the provider or
  `ErrUnsupportedProvider`. Allowlist hosts: `chatgpt.com`, `chat.openai.com`,
  `claude.ai`. Exact match only, no subdomain wildcard.

### 8.6 Go: AI
- `ai.go`: `Summariser.Summarise(ctx, Transcript) (Summary, error)`,
  `Embedder.Embed(ctx, text string, task EmbedTask) ([]float32, error)`.
- `vertex.go`: one `genai.Client` created at startup with
  `ClientConfig{Backend: BackendVertexAI, Project, Location}`. Summarise uses
  `GenerateContent` with `ResponseMIMEType: "application/json"` and a
  `ResponseSchema` matching `Summary`. Temperature 0.2. Embed uses
  `EmbedContent` with `OutputDimensionality: 768` and `TaskType`.
- `prompt.go`: the system prompt. It must say: summarise for someone who
  wants to reuse the knowledge later, not for someone who wants a recap of the
  chat; plain text, no Markdown; 3 to 8 takeaways as complete sentences;
  extract every code block verbatim with its language; choose exactly one
  category from the list; up to 10 lowercase tags; do not include personal
  names, emails, or phone numbers in the summary.
- `fake.go`: summariser that derives a title from the first user message and
  fixed takeaways; embedder that hashes text into a deterministic 768-vector.
  Tests use these.
- Startup: fail fast if Vertex is unreachable in production; in local dev,
  if `USE_FAKE_AI=true`, wire the fakes so `pnpm dev` needs no GCP
  credentials. This is the only way local dev stays free of real GCP.

### 8.7 Go: handlers
- `errors.go`, then the handlers from section 7. Route registration in
  `server.go` follows the existing `requireUser` pattern.
- Tests (memory store, fakes): ingest with a share URL via a fake fetcher;
  ingest with text; unsupported host; quota at limit; list with category and
  cursor; search returns the nearer note first; get/patch/delete for another
  user's note returns `not_found`; delete removes the blob; export includes
  the transcript; delete account empties the store. Existing Phase 0 tests
  keep passing.

### 8.8 Web: BFF routes and services
- `share-url.ts`: `detectProvider(url)` returning `chatgpt | claude | null`,
  isomorphic so the form can show the provider badge before submit.
- `ratelimit.server.ts`: token bucket per IP (`X-Forwarded-For` first value on
  Cloud Run), 10 per minute, capacity 10. Return 429 with
  `{"code":"rate_limited"}` from the action. In-memory is fine; note that it
  is per instance.
- `notes-api.server.ts`: one function per Go endpoint, each taking the
  request (for the cookie token) and returning either the parsed body or
  `{ code }` so loaders and actions map codes to copy. Never let Go prose
  through, there is none.
- `api.ingest.ts`: action only. Validates the URL against the allowlist,
  rate limits, calls Go, returns the note id or the error code.

### 8.9 Web: UI
Tailwind only. No component library. Keep it plain; the product is the notes.
- `/app`: header with product name, settings link, sign-out. A single "Add a
  conversation" form: one input that accepts a URL or pasted text (detect by
  `^https?://`), a keep-transcript checkbox defaulting from the user setting,
  submit via `useFetcher`. While pending show "Fetching and summarising, this
  takes about thirty seconds". On success navigate to the note. On error show
  copy keyed by code (`unsupported_provider`: "Only ChatGPT and Claude share
  links are supported. You can paste the conversation text instead.").
  Below: category chips (from the taxonomy, counts not required), a search
  box that navigates to `/app?q=`, and the note list (title, category,
  provider badge, date, first line of summary). When `q` is present the
  loader calls search instead of list. "Load more" via cursor.
- `/app/notes/:id`: title, provenance line ("From a ChatGPT conversation,
  1 Sep 2026, gpt-5" with a link to the share URL), summary paragraphs,
  takeaways list, code blocks in `<pre>` with a copy button, tags. Edit
  toggles inputs for title, summary (textarea), takeaways (one per line),
  category (select), tags (comma separated); save via action → PATCH. Delete
  with a confirm. Transcript section: "Original transcript kept (12 KB)" with
  download and delete, or "Not kept".
- `/app/settings`: keep-transcript default toggle (PATCH `/v1/me`), "Download
  my data" (streams `/v1/me/export` through the BFF), "Delete my account"
  (type the email to confirm, then DELETE `/v1/me`, sign out, redirect `/`).
- `/login`: add "Email me a sign-in link" with an email input, calling
  `sendSignInLinkToEmail` with `url = {origin}/login/email`. `/login/email`
  completes with `signInWithEmailLink` and posts the session like Google.
- `/terms`, `/privacy`: static pages with placeholder headings the human
  fills in. Landing page gets a footer with both links.
- Tests: `share-url.test.ts` (allowlist), `ratelimit.server.test.ts`, one
  render test for the note view with a fixture note.

### 8.10 Docs
- README: mention `USE_FAKE_AI=true` for local dev, the new env vars, and the
  ingest limit.
- CLAUDE.md and GEMINI.md: add the `internal/{notes,ingest,ai}` packages to
  the layout, the error-code rule pointing at `errors.go`, and "the API is
  the only service that talks to Firestore, GCS, or Vertex".

## 9. Not in Phase 1

MCP, PAT tokens, OAuth, public note pages, PII scanning, Gemini and Grok
fetchers, PWA share target, bookmarklet, Markdown rendering, daily canary
job, full-text search, collections, export to Obsidian, any billing or plan
tiers beyond the free ingest cap. If one of these seems necessary, stop and
ask.

## 10. Tasks only a human can do

1. Verify `ai-notes.io` in Google Search Console with the account that runs
   Terraform, then set `manage_domain = true` in `environments/prod.tfvars`,
   apply, and create the DNS records from the `domain_dns_records` output at
   the registrar. Add `ai-notes.io` to Firebase Auth authorised domains.
2. Enable the Email link (passwordless) sign-in provider in the Firebase
   console.
3. Confirm Vertex AI model availability in `europe-west1` for the chosen
   Flash model and `gemini-embedding-001`; if either is missing, set
   `VERTEX_LOCATION=global` in `cloud_run.tf`.
4. Write the real terms and privacy text (the agent ships placeholders).
5. Run 20 real share links through the pipeline and read the summaries. The
   prompt in `prompt.go` is the thing most likely to need a second pass.

## 11. Environment variables (new)

| Name | Where | Purpose |
|---|---|---|
| `TRANSCRIPTS_BUCKET` | api | GCS bucket name. Required in production. |
| `GEMINI_MODEL` | api | Summariser model id. Default the current Gemini Flash. |
| `VERTEX_LOCATION` | api | Vertex region. Default `europe-west1`. |
| `INGEST_MONTHLY_LIMIT` | api | Default 30. |
| `SUMMARISER_MAX_CHARS` | api | Transcript truncation budget. Default 200000. |
| `USE_FAKE_AI` | api, local only | `true` wires fake summariser, embedder, and memory blob store. The dev script sets it. |
| `PORT` | web, local | Dev script sets 5173 for the Express entry. |

## 12. Rules that apply to every file

All of section 9 in `docs/phase0-handoff.md` still applies. In addition:

- **Only the Go API touches Firestore, Cloud Storage, or Vertex AI.** The web
  service has no GCP client libraries beyond `google-auth-library` for the
  ID token.
- **Share URLs are untrusted input.** Allowlist in both services, no
  redirects off-list, no private IPs, bounded bodies and timeouts.
- **LLM output is untrusted input.** Validate the structured response against
  the limits in section 6 before storing; render it as text, never as HTML.
- **Transcripts never leave the API except through the two endpoints that
  serve them to their owner.** Not in list, search, or error bodies, not in
  logs.
- **Every new error code is added to `errors.go` and to the copy map in the
  web app in the same commit.**
- **Local dev with `USE_FAKE_AI=true` must produce a working note** from a
  pasted transcript with no GCP credentials present.

## 13. Verification script for the final check

```bash
# local
pnpm install && pnpm typecheck && pnpm test && (cd api && go vet ./... && go test ./...)
pnpm dev   # paste text at /app, confirm a note appears with USE_FAKE_AI

# deployed
curl -sS https://ai-notes.io/api/health
curl -sS -o /dev/null -w '%{http_code}\n' "$(terraform -chdir=infra/terraform output -raw api_service_url)/healthz"   # expect 404
terraform -chdir=infra/terraform plan -var-file=environments/prod.tfvars    # expect: No changes
gcloud firestore indexes composite list --project ai-notes-507510            # three READY indexes on notes
gcloud storage ls gs://ai-notes-507510-transcripts/transcripts/ | head       # objects after an ingest with keep on
# then, signed in: ingest one ChatGPT link, one Claude link, one pasted text;
# search for a concept not literally in a title; edit; delete; export; delete account.
```

The completion report should list: every exit criterion from section 2 with
pass/fail, the spike decision, the commit hash of the last `phase1:` commit,
the p50 and p95 ingest time over the 20 human-run links, and any item from
section 10 still outstanding.
