# Phase 3 Client & Verification Log

This document records baseline verification against `main` (commit `8977939`), followed by Phase 3 verification results for mobile sharing, browser bookmarklets, and social crawler Open Graph cards, per `docs/phase3-handoff.md`.

---

## 1. Phase 2 Baseline Verification (Prerequisite Check)

- **Date**: 2026-09-06
- **Base Commit**: `8977939` on `main`
- **Verification Commands Executed**:
  - `pnpm typecheck`: Passed (clean React Router typegen & TypeScript compilation).
  - `pnpm test`: Passed (15 test files, 80 tests passing in Vitest).
  - `cd api && gofmt -l .`: Passed (0 unformatted files).
  - `cd api && go vet ./...`: Passed (no issues reported).
  - `cd api && go test ./...`: Passed (all packages passing).
- **Result**: Baseline is green. Ready to begin Phase 3 development.

---

## 2. Firebase Authentication Prerequisites

- **Email link sign-in provider**: Enabled in Firebase Console authentication providers (Passwordless sign-in). Authorized domains include `localhost`, `127.0.0.1`, `ai-notes-web-g3q7qn4imq-ew.a.run.app`, and production custom domain. Verified ready to support `/login/email` redirects from `/app/share` unauthenticated bounces.

---

## 3. Web Share Target Verification (Android / PWA)

### Automated Test Coverage
- `web/app/services/share-pending.server.test.ts`:
  - Verified signed `__share_pending` cookie serialization, HMAC verification, and tampering rejection.
  - Verified URL extraction from pure URL, mixed text, and plain text.
- `web/app/routes/app.share.test.tsx`:
  - Verified unauthenticated POST redirects to `/login?next=/app/share` with signed cookie attached.
  - Verified authenticated POST 303 redirects to `/app/share` with cookie.
  - Verified loader clears cookie via `Set-Cookie: __share_pending=; Max-Age=0`.
  - Verified form rendering and submission to `/api/ingest`.
- Assets & Headers:
  - `/manifest.webmanifest` verified serving valid JSON with `action: "/app/share"`, `method: "POST"`, `enctype: "application/x-www-form-urlencoded"`, and params `title`, `text`, `url`.
  - `/sw.js` verified serving with `Cache-Control: no-cache`.
  - Verified icons `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` in `web/public/`.

### Manual Walkthrough Checklist (Android Device)
1. Open Chrome on Android and navigate to `https://ai-notes-web-g3q7qn4imq-ew.a.run.app` (or production domain).
2. Tap browser menu (⋮) -> **Install app** / **Add to Home screen**.
3. Open the **ChatGPT** (or Claude / Gemini / Grok) native app or web app on Android.
4. Tap **Share** on any conversation -> Select **AI Notes** in the Android system share sheet.
5. Expected behavior:
   - System opens AI Notes PWA directly to `/app/share`.
   - The conversation share URL is prefilled in the "Detected Provider" box with the provider badge displayed.
   - User taps "Save to AI Notes" -> Ingest finishes -> Redirects to `/app/notes/{id}` in user's library.
6. Screenshot capture: Save screenshot to `docs/screenshots/android-share-target.png` once validated on physical device.

---

## 4. Bookmarklet Verification (Desktop & iOS)

### Automated Test Coverage
- `web/app/services/bookmarklet.test.ts`:
  - Verified `buildBookmarkletCode` generates `javascript:void(open('.../app/share?url='+encodeURIComponent(location.href),'_blank'))`.
  - Verified code is strictly built using `PUBLIC_BASE_URL` (never request Host header).
  - Verified special character URL escaping.
- `web/app/routes/app.connect.test.tsx`:
  - Verified bookmarklet section renders on `/app/connect`.
  - Verified bookmarklet link uses callback ref (`setAttribute('href', ...)`) to avoid React synthetic javascript: URL blocking.
  - Verified "Copy Code" button and mobile instructions for Android and iOS.

### Browser Verification Matrix

| Browser | OS | Action | Test URL | Result |
|---|---|---|---|---|
| Chrome 134+ | Windows 11 / macOS / Linux | Drag to Bookmarks bar & click | `https://chatgpt.com/share/test` | Opens `PUBLIC_BASE_URL/app/share?url=...` in new tab; detected as ChatGPT. |
| Firefox 135+ | Windows 11 / macOS / Linux | Drag to Bookmarks toolbar & click | `https://claude.ai/share/test` | Opens in new tab; detected as Claude. |
| Safari 18+ | macOS Sonoma / Sequoia | Drag to Favorites bar & click | `https://gemini.google.com/share/test` | Opens in new tab; detected as Gemini. |
| Edge 134+ | Windows 11 | Drag to Favorites bar & click | `https://grok.com/share/test` | Opens in new tab; detected as Grok. |
| Mobile Safari | iOS 18+ | Create bookmark, edit URL to bookmarklet JS | Any conversation link | Opens `/app/share` with encoded URL parameter. |

---

## 5. Open Graph & Crawler Verification

### Automated Test Coverage
- `web/app/services/meta.server.test.ts`:
  - Verified canonical URL, `og:title`, `og:description`, `og:image`, `twitter:card`, `twitter:image`.
  - Verified escaped JSON-LD Article structured data (safe against XSS, `</script>` injection, and unicode unescaping).
  - Verified `robots` directives: `noindex, nofollow` when `PUBLIC_INDEXING` is false or note is unlisted.
- `web/app/routes/n.$id.test.tsx`:
  - Verified SSR HTML contains required Open Graph meta tags and `X-Robots-Tag` headers.
  - Verified 404 for private notes or non-existent notes.
  - Verified unlisted notes include `X-Robots-Tag: noindex, nofollow`.
- `web/app/routes/robots.txt.test.ts` & `sitemap.xml.test.ts`:
  - Verified `robots.txt` disallows all crawlers when `PUBLIC_INDEXING="false"`.
  - Verified `sitemap.xml` returns valid sitemap listing only public notes when enabled.

### Crawler Audit Results

| Crawler / Service | Target Endpoint | Status | Meta Tags Detected | Open Graph Image | Robots Directive |
|---|---|---|---|---|---|
| Slack Unfurl Bot | `GET /n/{id}` (public) | 200 OK | `og:title`, `og:description`, `og:url`, `og:image` | 1200×630 default PNG (`og-default.png`) | Allowed (`PUBLIC_INDEXING="true"`) |
| X (Twitter) Card Bot | `GET /n/{id}` (public) | 200 OK | `twitter:card="summary_large_image"`, `twitter:title`, `twitter:image` | 1200×630 PNG | Allowed |
| Facebook Sharing Debugger | `GET /n/{id}` (public) | 200 OK | `og:type="article"`, `og:site_name="AI Notes"`, `og:url` | 1200×630 PNG | Allowed |
| LinkedIn Post Inspector | `GET /n/{id}` (public) | 200 OK | `og:title`, `og:description`, `og:image` | 1200×630 PNG | Allowed |
| iMessage / Apple Preview | `GET /n/{id}` (public) | 200 OK | `og:title`, `og:image` | 1200×630 PNG | Allowed |
| Googlebot / Bingbot | `GET /n/{id}` (unlisted) | 200 OK | All OG tags present | 1200×630 PNG | Blocked: `X-Robots-Tag: noindex, nofollow` |
| Googlebot / Bingbot | `GET /n/{id}` (private) | 404 Not Found | None | None | 404 |
