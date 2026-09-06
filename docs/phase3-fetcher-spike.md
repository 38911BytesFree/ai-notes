# Phase 3 Fetcher Spike Results

**Date**: 6 September 2026  
**Spike Target**: Evaluate whether plain HTTP fetching from Cloud Run can read Google Gemini and xAI Grok share URLs, identifying endpoint viability, client-side rendering hurdles, and Cloudflare/bot restrictions.

---

## 1. Results Table

| Provider | Endpoint | Origin | User-Agent | HTTP Status | Outcome | Details / Key Findings |
|---|---|---|---|---|---|---|
| **Gemini** | `https://gemini.google.com/share/{id}` (HTML) | Developer Machine | Default Go UA | `200 OK` | title only / empty Wiz shell | ~838,000 bytes. Google Wiz / Angular client SPA shell. Conversation messages are not rendered in static server HTML; client retrieves them dynamically via internal batch RPCs. |
| **Gemini** | `https://gemini.google.com/share/{id}` (HTML) | Developer Machine | Browser UA | `200 OK` | title only / empty Wiz shell | ~838,472 bytes. Same Wiz client SPA shell with `AF_initDataCallback` and `WIZ_global_data`. Static transcript absent. |
| **Gemini** | `https://gemini.google.com/share/{id}` (HTML) | Cloud Run | Both UAs | `200 OK` | title only / empty Wiz shell | Shell returned, but conversation transcript requires browser JavaScript execution and client RPCs. |
| **Gemini** | `https://gemini.google.com/_/BardChatUi/data/batchexecute` (RPC) | Cloud Run & Dev | Both UAs | `400 / 401` | blocked / auth required | Google internal RPC endpoints require Google Account session cookies (`SAPISID`, `f.req`, `at` CSRF tokens) not present in public share requests. |
| **Grok** | `https://grok.com/share/{id}` (HTML) | Developer Machine | Default Go UA | `200 OK` | RSC shell + Cloudflare | ~906,000 bytes. Next.js App Router RSC payload (`self.__next_f`). Fronted by Cloudflare (`Server: cloudflare`, `__cf_bm` cookie). |
| **Grok** | `https://grok.com/share/{id}` (HTML) | Developer Machine | Browser UA | `200 OK` | RSC shell + Cloudflare | ~906,621 bytes. Cloudflare Turnstile / Challenge script tags injected (`challenges.cloudflare.com`). |
| **Grok** | `https://grok.com/share/{id}` (HTML) | Cloud Run | Default Go UA | `403 Forbidden` | Cloudflare challenge | Cloudflare bot management intercepts requests originating from Cloud Run datacenter IP blocks, requiring interactive challenge completion. |
| **Grok** | `https://grok.com/share/{id}` (HTML) | Cloud Run | Browser UA | `403 Forbidden` | Cloudflare challenge | Cloudflare challenge page returned regardless of realistic browser User-Agent headers. |

---

## 2. Response Snippets That Matter

### Gemini HTML Wiz Shell (`https://gemini.google.com/share/{id}`)
```html
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
...
<script nonce="...">
window.WIZ_global_data = {...};
...
</script>
</head>
<body class="... overflow-hidden">
<bard-chat-app ...></bard-chat-app>
```
The page is an Angular/Wiz client application (`bard-chat-app`). The conversation messages are retrieved on the client via `batchexecute` RPCs rather than embedded in parseable static server HTML.

### Grok HTML & Cloudflare Interception (`https://grok.com/share/{id}`)
```html
<!DOCTYPE html>
<html lang="en">
<head>
...
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=..."></script>
...
<script>self.__next_f.push([1,"..."])</script>
```
From Cloud Run, Cloudflare detects datacenter egress IPs and serves an HTTP 403 challenge, identical to the restriction encountered for Claude in Phase 1.

---

## 3. Spike Decision

Following the decision rules in Section 8.2 of `docs/phase1-handoff.md` and Section 9.2 of `docs/phase3-handoff.md`:

> **Whichever passes is implemented as a provider with fixture-based parser tests; whichever fails returns `fetch_blocked` and the UI says to paste the text instead. Both hosts are in the SSRF allowlist and in `web/app/services/share-url.ts` either way.**

- **Gemini**: **Fetch blocked.** Gemini share URLs serve a JavaScript-heavy Wiz SPA shell whose messages are retrieved via internal authenticated batch RPCs (`/_/BardChatUi/data/batchexecute`). Plain HTTP fetching from Cloud Run cannot reliably extract conversation transcripts without headless browsers. Therefore, Gemini share URLs will return `{"code":"fetch_blocked"}`, and the UI will instruct users to paste the conversation text.
- **Grok**: **Fetch blocked.** Grok is hosted behind Cloudflare bot management, which rejects requests from Cloud Run datacenter IPs with HTTP 403 challenges, even with browser headers. Like Claude, Grok share URLs will return `{"code":"fetch_blocked"}`, with clear UI copy prompting the user to paste the conversation text.
- **SSRF and Provider Registration**: Both `gemini.google.com` and `grok.com` will be added to the Go SSRF allowlist (`DefaultAllowlist`), the Web BFF `ALLOWED_HOSTS`, and the provider registry so they return `fetch_blocked` rather than `unsupported_provider`. Shortlink domains (`g.co`, `x.com`) remain rejected with `unsupported_provider` directing users to paste the expanded URL or text.

---

## 4. Test Fixtures Saved

Raw responses obtained during the spike have been preserved under `api/internal/ingest/providers/`:
- `api/internal/ingest/providers/gemini/testdata/share.html`: 838 KB Wiz HTML shell.
- `api/internal/ingest/providers/grok/testdata/share.html`: 906 KB Next.js / Cloudflare HTML document.
