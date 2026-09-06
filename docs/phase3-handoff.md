# Phase 3 handoff: public notes, sharing, and mobile

This document is self-contained. It is written for an implementing agent that
has not seen the design discussion. Read `docs/PLAN.md` for the product plan,
`docs/phase1-handoff.md` for the ingest pipeline and data model, and
`docs/phase2-handoff.md` for the MCP and OAuth surface you are building on.
This file covers only Phase 3.

Written 6 September 2026, against commit `8977939` on `main`.

## 1. What Phase 3 delivers, in three sentences

A note in someone's private library can be published: `unlisted` makes it
reachable by its unguessable URL, `public` also lists it in a chronological
feed by category, and both render as a server-side page at `/n/{id}` with Open
Graph tags, provenance, and never the transcript. Publishing is gated on a
deterministic PII scan that runs in Go on both the ingest and the MCP save
path, and a note whose scanned text has flags cannot leave `private` until the
owner acknowledges those exact flags. Getting a conversation in from a phone
stops requiring a desktop: the web app becomes an installable PWA with a Web
Share Target, and a bookmarklet covers the browsers that have no share sheet.

## 2. Goal and exit criteria

Goal: a note can be shared with someone who has no account, from a link that
survives being pasted into Slack or X, and a conversation can be captured from
a phone. Still two scale-to-zero Cloud Run services, still one public service,
Go still private.

Phase 3 is complete when every item below is true:

- [ ] On `/app/notes/{id}` the owner can set visibility to Private, Unlisted,
      or Public, sees the resulting public URL with a copy button when it is
      not private, and setting it back to Private makes `/n/{id}` return 404
      on the next request.
- [ ] `GET /n/{id}` for a public note returns 200 to a signed-out browser and
      renders title, summary, takeaways, code blocks, category, tags and a
      provenance line ("Distilled from a ChatGPT conversation, 2 Sep 2026")
      linking to the source share URL. It renders no transcript, no owner
      identity, and no PII flags.
- [ ] The same page carries `og:title`, `og:description`, `og:url`,
      `og:image`, `og:type=article`, `twitter:card=summary_large_image`, a
      `<link rel="canonical">`, and JSON-LD `Article`. Every absolute URL in
      them is built from `PUBLIC_BASE_URL`, never from the request `Host`.
      A web test asserts this.
- [ ] An unlisted note serves 200 at `/n/{id}` with `<meta name="robots"
      content="noindex">` and an `X-Robots-Tag: noindex` header, and never
      appears in `/feed` or in `GET /v1/public/notes`. A Go test and a web
      test each cover one half.
- [ ] A note whose title, summary, takeaways, tags or code blocks contain an
      email address, a phone number, a Luhn-valid card number, a private key
      block, a JWT, or a recognised API key cannot be published: Go answers
      `{"code":"pii_unacknowledged"}` with 403 and the note is unchanged. The
      UI lists the flags and offers one explicit acknowledgement, after which
      publishing succeeds.
- [ ] Editing a published note so that new, unacknowledged PII appears is
      rejected with the same code and leaves both the content and the
      visibility unchanged. A Go test covers it.
- [ ] `GET /v1/public/notes/{id}` and `GET /v1/public/notes` are the only
      unauthenticated routes on the Go API. A table-driven Go test lists every
      registered route with its auth class and asserts that every other route
      answers 401 or 403 without credentials.
- [ ] The JSON of a public note has exactly the key set in section 7.3. A Go
      test marshals a fully populated note through the public projection and
      compares the key set literally, so a field added to `notes.Note` later
      cannot leak by default.
- [ ] `/feed` lists public notes newest first with working category filtering
      and cursor paging, and `/feed` never shows a private or unlisted note.
- [ ] `/robots.txt` disallows `/app`, `/api`, `/mcp`, `/oauth`, `/login` and
      the well-known paths, and serves `Disallow: /` for everything while
      `PUBLIC_INDEXING` is not `true`. `/sitemap.xml` lists public notes only,
      and is empty when indexing is off.
- [ ] On an Android phone, installing the app from Chrome and then using the
      system share sheet from the ChatGPT app lands on `/app/share` with the
      shared URL pre-filled, and one tap creates the note. Recorded with a
      screenshot in `docs/phase3-clients.md`.
- [ ] Sharing to the installed app while signed out stores the payload in the
      short-lived `__share_pending` cookie, sends the user through the normal
      login, and returns to `/app/share` with the payload intact.
- [ ] The bookmarklet on `/app/connect` opens `/app/share?url=...` for the
      current tab and works from desktop Safari, Chrome and Firefox.
- [ ] `docs/phase3-fetcher-spike.md` records, in the shape of
      `docs/phase1-fetcher-spike.md`, whether Gemini and Grok share pages can
      be read by plain HTTP from Cloud Run. Whichever passes is implemented as
      a provider with fixture-based parser tests; whichever fails returns
      `fetch_blocked` and the UI says to paste the text instead. Both hosts are
      in the SSRF allowlist and in `web/app/services/share-url.ts` either way.
- [ ] `pnpm dev` with `USE_FAKE_AI=true` does all of the above locally except
      the phone: publish a note, open `/n/{id}` in a private window, see it in
      `/feed`, unpublish, get a 404.
- [ ] Both Cloud Run services still have `min_instance_count = 0`, no new
      always-on resource exists, and `terraform plan` is clean after apply.
- [ ] `go test ./...`, `pnpm test`, `pnpm typecheck` and `gofmt -l` pass in CI.

## 3. Decisions already made (do not re-open)

| Area | Decision |
|---|---|
| Visibility values | `private`, `unlisted`, `public`. `unlisted` is reachable by URL, excluded from the feed, the sitemap and any future public search, and served `noindex`. `public` is everything unlisted is, plus the feed and the sitemap. Note ids are 20 base32 characters from 15 random bytes, so an unlisted URL is not enumerable. |
| Who may publish | The owner, through the BFF, with a Firebase ID token. There is no publish path from MCP in this phase: `save_note` still creates private notes only. |
| PII detection | A deterministic scanner in Go (`internal/pii`), not the summariser. It has to cover notes saved through MCP, which never go near the LLM, and it has to be unit-testable and stable across runs. High-precision detectors only: e-mail, international and NANP phone numbers, Luhn-valid card numbers, `-----BEGIN … PRIVATE KEY-----` blocks, JWTs, and recognised API-key shapes (`sk-`, `sk-ant-`, `ghp_`/`gho_`/`github_pat_`, `AKIA`, `ASIA`, `xoxb-`/`xoxp-`, `AIza`). No name, address or "sensitive topic" detection: a false positive blocks a publish, which is worse here than a miss the owner can see for themselves. |
| When the scan runs | On every write that can change the scanned text (`POST /v1/ingest`, `POST /v1/notes`, `PATCH /v1/notes/{id}`), storing `pii_flags` and `pii_scanned_hash` so the UI can warn before the user clicks; **and again, authoritatively, inside the visibility change**, so notes written before this phase are covered without a backfill. |
| Acknowledgement | `pii_ack_hash` holds the `pii_scanned_hash` the owner acknowledged. Publishing is allowed when the flags are empty, or when `pii_ack_hash` equals the hash of the text as scanned right now. Any edit changes the hash and voids the acknowledgement. |
| Editing a published note into new PII | Rejected with `pii_unacknowledged`; nothing is written. The alternative, silently reverting the note to private, changes state the caller did not ask to change and is invisible to an API client. The UI resubmits with `acknowledge_pii: true` after showing the flags. |
| OG images | One static, branded 1200×630 PNG at `/og-default.png` for every note. Per-note generated images need `satori` + `resvg` (about 10 MB of dependencies and a bundled font) on a scale-to-zero service whose cold start is already the thing MCP clients notice. Deferred to Phase 4 with a resource route and a long `Cache-Control` when there is traffic to justify it. |
| Indexing | Gated on `PUBLIC_INDEXING`, default `false`, set by Terraform to whether `manage_domain` is true. On `run.app` the pages work, are shareable, and render OG cards, but `robots.txt` is `Disallow: /`, `/sitemap.xml` is empty and every public page carries `noindex`. Indexing the `run.app` origin before the custom-domain cutover would earn duplicate content and dead links for exactly the pages we most want ranked. |
| Public reads on Go | Two unauthenticated routes under `/v1/public/*`, served through a hand-written projection type. They still sit behind Cloud Run IAM, so only the web service can call them; "unauthenticated" means no Firebase and no service token, not open to the internet. Rule 4 of `CLAUDE.md` gains a third auth class, not an exception. |
| Feed ordering | `published_at`, set on every transition into `public`, not `created_at`. A note written a month ago and published today belongs at the top of the feed. |
| Feed shape | Chronological, filterable by category, cursor-paged, 30 per page. No ranking, no trending, no per-user pages, no author names. `users.public_handle` from `docs/PLAN.md` stays unimplemented: a public note carries no identity in this phase, which is both simpler and the safer default. |
| Share target | `method: "POST"`, `enctype: "application/x-www-form-urlencoded"`, action `/app/share`. The POST is handled by a React Router action, which 303-redirects to a GET confirmation screen with the payload in a signed cookie. Ingesting straight from the POST would spend a monthly ingest on a mis-tap and would re-fire on refresh. |
| Service worker | A minimal `/sw.js` with an empty `fetch` listener and no caching whatsoever, registered from the root document, served `Cache-Control: no-cache`. It exists only because Web Share Target requires an installed PWA and Chrome's installability check has historically wanted a fetch handler. Any caching logic in it would serve stale authenticated pages; there is none, deliberately. |
| iOS | Safari implements neither Web Share Target nor PWA share sheets. iOS users get the bookmarklet and paste. Say so on the page rather than shipping something that half works. |
| Bookmarklet | Passes only `location.href` to `/app/share`. It does not scrape the page: reading a conversation out of a provider's DOM is a browser-extension job with a matching trust model, and the extension is deferred in `docs/PLAN.md`. |
| Gemini and Grok | Spike before implementing, exactly as Phase 1 section 8.2 did. Whatever the result, both hosts join the allowlist and the provider enum so a blocked provider fails with `fetch_blocked` and clear copy, not `unsupported_provider`. `g.co` and other shortlink hosts are rejected: no redirect off the allowlist, ever. |

### 3.1 What stays constrained by running on the Cloud Run URL

Section 3.1 of `docs/phase2-handoff.md` still governs the origin: build every
URL from `PUBLIC_BASE_URL`, and the canonical-host redirect in `web/server.ts`
stays in front of everything. Phase 3 adds two consequences.

1. **Shared links are minted with the current origin.** A note shared today
   carries a `run.app` URL in someone's Slack history forever. At custom-domain
   cutover the old origin must keep serving the 301 redirect it already serves,
   and `/n/{id}` must keep answering on it. Do not remove the redirect.
2. **Indexing waits for the domain.** See the `PUBLIC_INDEXING` decision above.
   Flipping it is one Terraform variable and one deploy, no code change.

## 4. Carry-over and prerequisites (do these first, one commit each)

1. **Re-run the Phase 2 verification script** (section 14 of
   `docs/phase2-handoff.md`) against `main` and record the result at the top of
   `docs/phase3-clients.md`. Do not start on a red baseline.
2. **Audit `FirestoreStore.UpdateNote`.** It copies a fixed list of fields onto
   the loaded document and silently drops anything not in that list —
   `visibility` is already dropped today. Every field this phase adds must be
   handled explicitly there and in `MemoryStore`, and the store test that
   round-trips a fully populated note must assert field-by-field equality so
   the next added field cannot be dropped in silence.
3. **Enable the Email link sign-in provider** in the Firebase console. It is
   still outstanding from Phase 2 section 11.1, and a share-target flow that
   bounces a signed-out user through `/login` makes it more visible.

## 5. Repository layout to add

```
api/internal/
  pii/
    pii.go                     Scan(text) []string, ScanNote(*notes.Note) (flags, hash)
    pii_test.go                positives, and a false-positive corpus that must stay clean
  httpapi/
    public.go                  GET /v1/public/notes, GET /v1/public/notes/{id}
    visibility.go              PUT /v1/notes/{id}/visibility
    public_test.go             projection key set, private/unlisted exclusion, route auth table
  store/
    store.go                   + GetPublicNote, ListPublicNotes, SetNoteVisibility
    firestore.go, memory.go    implementations
  ingest/providers/
    gemini/gemini.go           only if the spike says fetchable
    grok/grok.go               only if the spike says fetchable
web/
  public/
    manifest.webmanifest
    sw.js
    og-default.png
    favicon.ico
    icons/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png
  app/routes/
    n.$id.tsx                  public note page (SSR, OG, JSON-LD, noindex when unlisted)
    feed.tsx                   public feed, ?category= &cursor=
    robots.txt.ts              resource route
    sitemap.xml.ts             resource route
    app.share.tsx              share-target POST + confirmation GET
  app/components/
    PublicNoteView.tsx         renderer with no app chrome, reused by n.$id
    VisibilityControl.tsx      publish UI, PII panel, acknowledgement
  app/services/
    public-api.server.ts       unauthenticated calls to /v1/public/*
    meta.server.ts             canonical URL, OG tag and JSON-LD builders
    share-pending.server.ts    signed __share_pending cookie
    bookmarklet.ts             builds the javascript: string from PUBLIC_BASE_URL
infra/terraform/
  firestore.tf                 two feed indexes
  cloud_run.tf                 PUBLIC_INDEXING on web
docs/
  phase3-fetcher-spike.md      Gemini and Grok probe results
  phase3-clients.md            share sheet, bookmarklet and OG crawler results
```

## 6. Data model

`notes/{note_id}` gains five fields. Nothing else in Firestore changes.

```
visibility            private | unlisted | public   (exists, was always "private")
pii_flags             [string]     e.g. ["email","api_key"], empty when clean
pii_scanned_hash      string       sha256 hex of the scanned text at last scan
pii_ack_hash          string       the scanned hash the owner acknowledged, "" if never
published_at          timestamp    set on every transition into public, null otherwise
```

Scanned text is, joined by `\n`: title, summary, every takeaway, every tag,
and every code block's `code`. The hash is over exactly that string, so the
same content always produces the same hash.

Two new indexes, in `infra/terraform/firestore.tf` and mirrored in
`firestore.indexes.json`:

```
notes (visibility ASC, published_at DESC)
notes (visibility ASC, category ASC, published_at DESC)
```

Existing notes have no `pii_*` fields and no `published_at`. That is fine:
absent flags read as empty, absent hashes as `""`, and the authoritative scan
inside the visibility change covers them. There is no backfill job.

## 7. API contract (Go)

### 7.1 User-authenticated routes (unchanged middleware)

| Method and path | Request | Response |
|---|---|---|
| `PUT /v1/notes/{id}/visibility` | `{"visibility":"private\|unlisted\|public","acknowledge_pii":false}` | 200 full owner note. Loads the note, rescans it, stores `pii_flags`/`pii_scanned_hash`, sets `pii_ack_hash` when `acknowledge_pii` is true, then applies the visibility. Sets `published_at` when the new value is `public`. |
| `PATCH /v1/notes/{id}` | existing body plus `"acknowledge_pii"?: bool` | 200 full note. After `CleanAndTruncateNote`, rescan and store the flags and hash. |

Both answer `{"code":"pii_unacknowledged"}` with 403 when the resulting note
would be non-private, has flags, and the acknowledged hash does not equal the
hash just computed. Nothing is written in that case. `visibility` outside the
three values is `invalid_argument`.

`GET /v1/notes/{id}` gains the five new fields in its response, because the
owner's UI needs the flags to render the warning. `GET /v1/notes` list items
gain `visibility` (already present) and `pii_flags`, nothing else.

`GET /v1/notes/{id}/transcript` is unchanged and stays owner-only whatever the
visibility is. Add the test that says so.

### 7.2 Public routes (no Firebase token, no service token)

| Method and path | Purpose |
|---|---|
| `GET /v1/public/notes/{id}` | 200 with the public projection when the note is `public` or `unlisted`; `not_found` otherwise, including for a private note that exists. The response never depends on who is calling. |
| `GET /v1/public/notes?category=&cursor=&limit=` | `{"notes":[...],"next_cursor":"..."}`, `visibility == "public"` only, ordered `published_at` desc, default limit 30, max 100. Cursor is the last item's `published_at` as RFC3339Nano, matching `ListNotes`. |

Both set `Cache-Control: public, max-age=60`.

Register them without `requireUser` or `requireService`, grouped under a
comment that names them as the entire public surface. `public_test.go` holds
the route table: every pattern in `server.go`, its expected auth class, and an
assertion that the two above are the only ones that answer without
credentials.

### 7.3 The public projection

`PublicNote` is a distinct struct in `httpapi/public.go`, built field by field
from `notes.Note`. Its JSON keys are exactly:

```
id, title, summary, takeaways, code_blocks, category, tags,
source{provider, share_url, model, conversation_date},
visibility, published_at, created_at, updated_at
```

Never `owner_uid`, `embedding`, `embedding_model`, `embedding_text_hash`,
`has_transcript`, `transcript_bytes`, `pii_flags`, `pii_scanned_hash`,
`pii_ack_hash`, `distance`, or `source.fetched_at`. Do not reuse
`NoteListItem`; it carries `owner_uid`. The key-set test in section 2 guards
this.

### 7.4 New error code

`pii_unacknowledged` (403) in `errors.go`, and in the same commit the copy map
`web/app/services/error-messages.ts`: "This note contains something that looks
like personal or secret data. Review the highlighted items, then confirm to
publish."

## 8. Web contracts

### `services/public-api.server.ts`
`getPublicNote(id)` and `listPublicNotes({category, cursor, limit})`. They call
`backendFetch` with no `Authorization` header and no `service` option — the
`X-Serverless-Authorization` header that `backendFetch` already adds is what
gets them past Cloud Run IAM. They take no `Request`, because nothing about
the caller may influence the answer. Errors come back as `{code}` like the
authenticated wrappers.

### `routes/n.$id.tsx`
Loader: rate-limit by IP (60/min, the existing `RateLimiter`), fetch the public
note, `throw new Response(null, {status: 404})` on any error. Headers:
`Cache-Control: public, max-age=300`, `Vary: Cookie`, and `X-Robots-Tag:
noindex` when the note is unlisted or `PUBLIC_INDEXING` is not `true`.
`meta` returns the OG, Twitter, canonical and robots tags from
`meta.server.ts`, all absolute URLs built from `PUBLIC_BASE_URL`. The page
renders `PublicNoteView`: title, provenance line, summary paragraphs,
takeaways, code blocks via the existing `CodeBlock`, category and tags, a
footer with a link to the source share URL (`rel="noopener nofollow ugc"`), a
"Made with AI Notes" link, and the abuse contact. The JSON-LD `Article` block
is `JSON.stringify(...).replace(/</g, "\\u003c")` before it goes into the
script tag.

### `routes/feed.tsx`
Loader: rate-limit, `listPublicNotes`, category from the query string
validated against the taxonomy. Renders `CategoryChips` plus `NoteCard`s
linking to `/n/{id}`, and a "Load more" link carrying `cursor`. Empty state
says so plainly. `Cache-Control: public, max-age=120`.

### `routes/robots.txt.ts` and `routes/sitemap.xml.ts`
`robots.txt` when `PUBLIC_INDEXING !== "true"`: `User-agent: *` /
`Disallow: /`. Otherwise: allow `/`, disallow `/app`, `/api`, `/mcp`,
`/oauth`, `/login`, `/.well-known`, `/token`, `/revoke`, `/register`,
`/authorize`, and point at `${PUBLIC_BASE_URL}/sitemap.xml`.
`sitemap.xml` is empty when indexing is off; otherwise it pages
`listPublicNotes` up to 5000 entries, emitting `/`, `/feed`, and each
`/n/{id}` with its `updated_at` as `lastmod`. Both `Cache-Control: public,
max-age=3600`.

### `routes/app.share.tsx`
`action` (the share target and the form): read `title`, `text`, `url` from the
form body. The shared URL is `url` if present, otherwise the first
`https?://` token in `text` — Android apps routinely put the link in `text`.
If the request is unauthenticated, write the payload to the signed
`__share_pending` cookie (10 minutes, `SameSite=Lax`, HTTPOnly) and redirect to
`/login?next=/app/share`. If authenticated, write the same cookie and 303 to
`/app/share`.
`loader`: `requireAuth`, read and clear the cookie, return the payload.
The page shows the detected provider and the URL, or the shared text in the
paste box when there is no supported URL, and one "Save to AI Notes" button
that posts to the existing `/api/ingest` action. It never ingests on its own.

### `routes/app.notes.$id.tsx`
Gains `VisibilityControl`: three radio options with one-line explanations, the
public URL and a copy button when not private, and, when `pii_flags` is
non-empty, a panel listing each flag in plain words with a single "I have
reviewed this and want to publish it anyway" checkbox. Approving submits
`intent=visibility` with `acknowledge_pii`. A `pii_unacknowledged` response
re-renders the panel; it is not an error toast.

### `root.tsx`
Adds `<link rel="manifest">`, the apple-touch-icon link, `theme-color`,
default OG tags for pages that do not set their own, and the service-worker
registration script. Registration is guarded on `"serviceWorker" in
navigator`.

### `services/bookmarklet.ts`
Returns, from `PUBLIC_BASE_URL`:
`javascript:void(open('${base}/app/share?url='+encodeURIComponent(location.href),'_blank'))`
`/app/connect` renders it as a draggable anchor plus the same text in a copy
box, under a new "Save from your browser" section. A second new section,
"Save from your phone", covers installing the PWA on Android and says plainly
that iOS has no share-sheet support and should use the bookmarklet.

## 9. Work items, in order

Commit after each numbered item, message `phase3: <item>`. Do not squash.
9.4 through 9.8 are the product; 9.9 and 9.10 are independent of them and can
be done in either order once 9.2 has produced its answer.

### 9.1 Carry-over and prerequisites
Section 4, three commits.

### 9.2 Fetcher spike: Gemini and Grok
Run it early — it needs a human to supply real share links, and its answer
decides 9.11. Follow the method of `docs/phase1-fetcher-spike.md`: for each of
`https://gemini.google.com/share/{id}` and `https://grok.com/share/{id}`,
probe the HTML page and any JSON endpoint the page reveals, from a developer
machine and from a Cloud Run job, with the default Go UA and a browser UA.
Record status, byte count, and whether the transcript is actually present.
Save every raw response as a fixture under
`api/internal/ingest/providers/{gemini,grok}/testdata/`. Write
`docs/phase3-fetcher-spike.md` with the same table shape and an explicit
decision paragraph per provider. Do not write a parser in this item.

### 9.3 Terraform and indexes
Two `google_firestore_index` resources for the feed, mirrored in
`firestore.indexes.json`; `PUBLIC_INDEXING` on the web service, valued
`var.manage_domain ? "true" : "false"`. Apply, confirm the indexes reach
`READY`, confirm `terraform plan` is clean. Nothing with a fixed cost.

### 9.4 Go: the PII scanner
`internal/pii` with `Scan(text string) []string` returning sorted, deduplicated
flag names, and `ScanNote(n *notes.Note) (flags []string, hash string)` doing
the field join and the sha256. Tests: one positive case per detector; a
false-positive corpus of realistic technical prose that must return no flags
(version strings, UUIDs, git SHAs, base64 blobs that are not JWTs, `1.2.3.4`,
prices, dates, `example.com` without a local part); and a determinism test that
the same note hashes the same twice. No network, no LLM, no `regexp` compiled
per call — compile at package level.

### 9.5 Go: visibility, the publish gate, and the store
`SetNoteVisibility(ctx, uid, id, visibility, ackHash)` in `Store`, implemented
transactionally in `FirestoreStore` and directly in `MemoryStore`; the new
fields carried through `UpdateNote` in both. `handleSetVisibility` in
`visibility.go`, the rescan and gate in `handlePatchNote`, the scan on the two
create paths (`pipeline.SaveNote` covers both — put it there, not in the two
handlers). `pii_unacknowledged` in `errors.go` and the copy map in the same
commit. Tests: publish clean note; publish flagged note refused; publish after
acknowledgement; edit that introduces PII into a published note refused and
nothing written; edit that removes the PII allows publishing without a new
acknowledgement; unpublish; `published_at` set on each transition into public;
a note created before the phase (no `pii_*` fields) publishes correctly.

### 9.6 Go: public read endpoints
`public.go` with the projection, the two handlers, and their registration in
`server.go` under a comment naming them as the whole public surface.
`GetPublicNote` and `ListPublicNotes` in both stores. `public_test.go`: the
projection key set; private note is 404; unlisted note is 200 by id and absent
from the list; the route auth table from section 7.2; transcript endpoint
still owner-only for a public note.

### 9.7 Web: publish UI
`VisibilityControl`, the `intent=visibility` action branch,
`patchNote`/`setVisibility` wrappers in `notes-api.server.ts`, the badge on
`NoteCard`. Tests: the PII panel renders from flags; acknowledgement submits
the flag; a `pii_unacknowledged` response re-renders the panel rather than a
generic error.

### 9.8 Web: public pages
`public-api.server.ts`, `meta.server.ts`, `PublicNoteView`, `n.$id.tsx`,
`feed.tsx`, `robots.txt.ts`, `sitemap.xml.ts`, the routes in `routes.ts`, a
`/feed` link on the landing page. Tests: OG and canonical tags are absolute
and built from `PUBLIC_BASE_URL`; unlisted gets `noindex` in both the meta tag
and the header; a 404 from the API becomes a 404 page with no stack;
`robots.txt` in both indexing modes; the sitemap contains only public ids.

### 9.9 Web: PWA and share target
Manifest, icons, `sw.js`, `root.tsx` head and registration,
`share-pending.server.ts`, `app.share.tsx`. Tests: the URL is extracted from
`text` when `url` is absent; an unauthenticated POST sets the cookie and
redirects to login; the loader clears the cookie after reading it; an
unsupported URL falls through to the paste box.
Verify locally that `/manifest.webmanifest` is served with
`application/manifest+json` and that `/sw.js` is served `no-cache`.

### 9.10 Web: bookmarklet and connect page
`bookmarklet.ts` and the two new sections on `/app/connect`. Test that the
bookmarklet string is built from `PUBLIC_BASE_URL` and URL-encodes the href.

### 9.11 Go: Gemini and Grok
Both hosts into `DefaultAllowlist` and into `detectProvider` /
`ALLOWED_HOSTS`, both providers into `allowedNoteProviders` (already there) and
into the ingest registry. For whichever the spike says is fetchable, a parser
built against the saved fixtures with table tests, routed through the SSRF-safe
client exactly as `chatgpt` is. For whichever is not, a `Match`-only fetcher
returning `ErrFetchBlocked`, as `claude` does today, plus provider-specific
copy in `error-messages.ts`. Shortlink hosts (`g.co`, `x.com`) are rejected
with `unsupported_provider` and copy telling the user to open the link and copy
the full URL.

### 9.12 Docs, copy, and deployment verification
README: publishing, the feed, the PWA, the bookmarklet, the new env var.
`CLAUDE.md` and `GEMINI.md`: the third auth class on the Go API and the rule
that the public projection is a separate struct with a key-set test; the new
web routes in the layout. `docs/phase3-clients.md`: OG rendering results per
crawler, the Android share-sheet walkthrough with a screenshot, bookmarklet
results per desktop browser. Terms and privacy pages: what publishing means,
that unlisted is not secret, and the abuse contact. Then the section 14 script.

## 10. Not in Phase 3

Per-note generated OG images; public semantic search and `search_notes(scope=
public)`; `users.public_handle` and author attribution; collections; comments,
likes or any social surface; a moderation queue or automated content
classification; publishing from MCP or an `update_note` tool; a browser
extension; ChatGPT App submission; the digest email; export or bulk import;
custom-domain cutover. If one of these seems necessary, stop and ask.

## 11. Tasks only a human can do

1. Supply real Gemini and Grok share links for the 9.2 spike, and run the
   Cloud Run half of the probe.
2. Provide the icon set and the 1200×630 OG image, or approve generated
   placeholders. Until they exist, 9.9 is not verifiable on a phone.
3. Install the PWA on an Android device and walk the share sheet from the
   ChatGPT app; capture the screenshot for `docs/phase3-clients.md`.
4. Validate OG rendering with the real crawlers: Slack, X, Facebook's sharing
   debugger, LinkedIn's post inspector, and iMessage. Crawlers cache; use each
   tool's re-scrape button after a fix.
5. Enable the Email link sign-in provider (outstanding from Phase 2).
6. Decide and publish the abuse contact address, and read the public-page,
   publish-dialog and PII-panel copy before release.
7. Confirm the terms and privacy pages cover public publishing before the
   first note is made public.

## 12. Environment variables (new)

| Name | Where | Purpose |
|---|---|---|
| `PUBLIC_INDEXING` | web | `"true"` allows `robots.txt` and `sitemap.xml` to invite crawlers and drops the blanket `noindex`. Default `false`. Terraform sets it from `var.manage_domain`. |
| `ABUSE_CONTACT_EMAIL` | web | Shown in the public page footer. Defaults to a placeholder that fails the copy review, deliberately. |

## 13. Rules that apply to every file

Section 9 of `docs/phase0-handoff.md`, section 12 of `docs/phase1-handoff.md`
and section 13 of `docs/phase2-handoff.md` all still apply. In addition:

- **A public response is built by an explicit projection, never by marshalling
  a domain struct.** Adding a field to `notes.Note` must not be able to publish
  it. The key-set test is the enforcement.
- **Nothing about the caller may change a public response.** No session read,
  no personalisation, no `Set-Cookie` on `/n/{id}`, `/feed`, `/robots.txt` or
  `/sitemap.xml`.
- **The transcript is never public.** Not in the projection, not in the feed,
  not in the sitemap, not in an OG description, not in JSON-LD.
- **Every absolute URL is built from `PUBLIC_BASE_URL`.** Never from the
  request `Host`, in any meta tag, redirect, sitemap entry, bookmarklet or
  tool response.
- **LLM and user text is rendered as text.** The JSON-LD block is the only
  place any note content reaches a script tag, and it is escaped there.
- **The service worker caches nothing.** If it grows a caching strategy, it
  will serve one user's authenticated HTML to the next; there is no scenario in
  this phase where that trade is worth making.
- **A new provider host is added to the Go allowlist and to
  `web/app/services/share-url.ts` in the same commit**, with a test on both
  sides.

## 14. Verification script for the final check

```bash
# local
pnpm install && pnpm typecheck && pnpm test && (cd api && gofmt -l . && go vet ./... && go test ./...)
pnpm dev
# signed in at http://127.0.0.1:5173: publish a note, then in a private window:
#   /n/{id} renders, /feed lists it, unpublish, /n/{id} is 404
# paste an email address into the summary, try to publish, see the panel

# deployed
BASE=https://ai-notes-web-g3q7qn4imq-ew.a.run.app
curl -sS -o /dev/null -w '%{http_code}\n' $BASE/n/$PUBLIC_NOTE_ID          # 200
curl -sS -o /dev/null -w '%{http_code}\n' $BASE/n/$PRIVATE_NOTE_ID         # 404
curl -sS $BASE/n/$UNLISTED_NOTE_ID -D - -o /dev/null | grep -i x-robots-tag
curl -sS $BASE/n/$PUBLIC_NOTE_ID | grep -Eo '<meta property="og:[^>]+>'
curl -sS $BASE/robots.txt
curl -sS $BASE/sitemap.xml | head -20
curl -sS $BASE/manifest.webmanifest | jq .share_target
curl -sS -o /dev/null -w '%{content_type}\n' $BASE/sw.js
curl -sS "$BASE/feed" | grep -c 'href="/n/'
terraform -chdir=infra/terraform plan -var-file=environments/prod.tfvars    # No changes
gcloud firestore indexes composite list --project ai-notes-507510           # feed indexes READY
gcloud run services describe ai-notes-web --region europe-west1 \
  --format='value(spec.template.metadata.annotations."autoscaling.knative.dev/minScale")'   # 0
```

The completion report should list: every exit criterion from section 2 with
pass/fail, the spike decision per provider, the contents of
`docs/phase3-clients.md`, the commit hash of the last `phase3:` commit, and any
item from section 11 still outstanding.
