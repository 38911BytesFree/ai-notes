# Phase 1 Fetcher Spike Results

**Date**: 4 September 2026  
**Spike Target**: Evaluate whether plain HTTP fetching from Cloud Run can read ChatGPT and Claude share URLs, identifying endpoint viability and Cloudflare restrictions.

---

## 1. Results Table

| Provider | Endpoint | Origin | User-Agent | HTTP Status | Outcome | Details / Key Findings |
|---|---|---|---|---|---|---|
| **ChatGPT** | `https://chatgpt.com/share/{id}` (HTML) | Developer Machine | Default Go UA | `200 OK` | full transcript | 519,445 bytes. Full conversation tree (`mapping`, `linear_conversation`, message text) in server-rendered stream payload. |
| **ChatGPT** | `https://chatgpt.com/share/{id}` (HTML) | Developer Machine | Browser UA | `200 OK` | full transcript | 521,215 bytes. Same stream payload containing entire chat transcript. |
| **ChatGPT** | `https://chatgpt.com/share/{id}` (HTML) | Cloud Run (no VPC) | Default Go UA | `200 OK` | full transcript | 519,190 bytes. **Success from Cloud Run.** No Cloudflare challenge on HTML page. |
| **ChatGPT** | `https://chatgpt.com/share/{id}` (HTML) | Cloud Run (no VPC) | Browser UA | `200 OK` | full transcript | 521,796 bytes. **Success from Cloud Run.** No Cloudflare challenge. |
| **ChatGPT** | `https://chatgpt.com/share/{id}` (HTML) | Cloud Run (VPC connector) | Both UAs | `Error` | other (i/o timeout) | `dial tcp 172.64.155.209:443: i/o timeout`. The VPC connector routes all traffic to `ai-notes-vpc`, which has no Cloud NAT gateway. Proves API must not have `vpc_access`. |
| **ChatGPT** | `https://chatgpt.com/backend-api/share/{id}` (JSON) | Developer Machine | Default Go UA | `403 Forbidden` | Cloudflare challenge | 8,668 bytes. Cloudflare bot challenge HTML. |
| **ChatGPT** | `https://chatgpt.com/backend-api/share/{id}` (JSON) | Developer Machine | Browser UA | `200 OK` | full transcript | 9,243 bytes. Clean structured JSON with `title`, `mapping`, and author messages. |
| **ChatGPT** | `https://chatgpt.com/backend-api/share/{id}` (JSON) | Cloud Run (no VPC) | Default Go UA | `403 Forbidden` | Cloudflare challenge | Cloudflare challenge triggered. |
| **ChatGPT** | `https://chatgpt.com/backend-api/share/{id}` (JSON) | Cloud Run (no VPC) | Browser UA | `403 Forbidden` | Cloudflare challenge | Cloudflare blocks Cloud Run datacenter egress IPs on the `/backend-api/*` path regardless of UA. |
| **ChatGPT** | `https://chatgpt.com/backend-api/share/{id}` (JSON) | Cloud Run (VPC connector) | Both UAs | `Error` | other (i/o timeout) | `i/o timeout` due to lack of Cloud NAT in VPC. |
| **Claude** | `https://claude.ai/share/{id}` (HTML) | Developer Machine | Default Go UA | `200 OK` | title only / empty SPA shell | 107,538 bytes. Client-side SPA skeleton with `<div id="root"></div>`. No conversation messages in HTML. |
| **Claude** | `https://claude.ai/share/{id}` (HTML) | Developer Machine | Browser UA | `200 OK` | title only / empty SPA shell | 107,538 bytes. Same client-side SPA shell without message content. |
| **Claude** | `https://claude.ai/share/{id}` (HTML) | Cloud Run (no VPC) | Default Go UA | `200 OK` | title only / empty SPA shell | 107,538 bytes. Returns HTML skeleton, but transcript is missing from DOM. |
| **Claude** | `https://claude.ai/share/{id}` (HTML) | Cloud Run (no VPC) | Browser UA | `200 OK` | title only / empty SPA shell | 107,538 bytes. Returns HTML skeleton, but transcript is missing from DOM. |
| **Claude** | `https://claude.ai/share/{id}` (HTML) | Cloud Run (VPC connector) | Both UAs | `Error` | other (i/o timeout) | `i/o timeout` due to lack of Cloud NAT in VPC. |
| **Claude** | `https://claude.ai/api/chat_snapshots/{id}` (JSON) | Developer Machine | Default Go UA | `403 Forbidden` | Cloudflare challenge | 5,565 bytes. Cloudflare challenge page (`<title>Just a moment...</title>`). |
| **Claude** | `https://claude.ai/api/chat_snapshots/{id}` (JSON) | Developer Machine | Browser UA | `200 OK` | full transcript | 9,373 bytes. Clean JSON containing `snapshot_name` and `chat_messages` array. |
| **Claude** | `https://claude.ai/api/chat_snapshots/{id}` (JSON) | Cloud Run (no VPC) | Default Go UA | `403 Forbidden` | Cloudflare challenge | 5,586 bytes. Cloudflare bot challenge on Cloud Run IP. |
| **Claude** | `https://claude.ai/api/chat_snapshots/{id}` (JSON) | Cloud Run (no VPC) | Browser UA | `403 Forbidden` | Cloudflare challenge | 5,821 bytes. Cloudflare bot challenge on Cloud Run IP despite browser User-Agent. |
| **Claude** | `https://claude.ai/api/chat_snapshots/{id}` (JSON) | Cloud Run (VPC connector) | Both UAs | `Error` | other (i/o timeout) | `i/o timeout` due to lack of Cloud NAT in VPC. |

---

## 2. Response Snippets That Matter

### ChatGPT HTML Stream Payload (`https://chatgpt.com/share/{id}`)
From Cloud Run (no VPC):
```html
<script nonce="...">
window.__reactRouterContext = ...;
window.__reactRouterContext.streamController.enqueue("[...\"title\",\"当前工作目录解释\",\"create_time\",1732635958.606984,\"mapping\",{...\"linear_conversation\",[...],\"message_type\",\"model_slug\",\"gpt-4o\",...,\"content_type\",\"text\",\"parts\",[\"C:\\\\Users\\\\byaidu> pdf2zh example.pdf\\n简单解释当前工作目录\"],\"role\",\"user\"...\"role\",\"assistant\"...]");
</script>
```
The React Router stream payload contains the complete conversation hierarchy and message text, parseable directly without headless browsers or JavaScript execution.

### ChatGPT Backend JSON (`https://chatgpt.com/backend-api/share/{id}`)
From Developer Machine with browser UA:
```json
{
  "title": "当前工作目录解释",
  "create_time": 1732635958.606984,
  "conversation_id": "6745ed36-9acc-800e-8a90-59204bd13444",
  "mapping": {
    "aaa2d557-f70c-44a8-988f-e4e846ceb7fa": {
      "id": "aaa2d557-f70c-44a8-988f-e4e846ceb7fa",
      "message": {
        "author": { "role": "user" },
        "content": {
          "content_type": "text",
          "parts": ["C:\\Users\\byaidu> pdf2zh example.pdf\n简单解释当前工作目录..."]
        }
      }
    }
  }
}
```

### Claude Chat Snapshot JSON (`https://claude.ai/api/chat_snapshots/{id}`)
From Developer Machine with browser UA:
```json
{
  "uuid": "8807c67a-750f-4ba7-a719-7d57df697456",
  "snapshot_name": "The Future of AI Agents as Conversational Components",
  "chat_messages": [
    {
      "uuid": "5c751519-f5f4-4aef-a040-44fdeea30359",
      "text": "I suspect the future of AI is that AI Agents will be talking to each other in natural language...",
      "sender": "human"
    },
    {
      "uuid": "e769d7ed-8310-4a69-9a0a-34aed54e0cbd",
      "text": "You're touching on a fascinating topic about the future of AI agent architectures...",
      "sender": "assistant"
    }
  ]
}
```

### Cloudflare Challenge on Cloud Run (`https://claude.ai/api/chat_snapshots/{id}`)
From Cloud Run (no VPC) with browser UA:
```html
<!DOCTYPE html><html lang="en-US">
<head><title>Just a moment...</title>
...
<script nonce="..." src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
...
```

---

## 3. Spike Decision

Following the decision criteria defined in Section 8.2 of `docs/phase1-handoff.md`:

> **One works: implement that one; the other provider's share URLs return `fetch_blocked` with UI copy that says to paste the text instead.**

- **ChatGPT**: **Works.** Plain HTTP fetch of `https://chatgpt.com/share/{id}` succeeds from Cloud Run with status 200, returning the full conversation transcript embedded in the server-rendered stream script tags. ChatGPT share links will be fully implemented (Section 8.5) by parsing the HTML stream payload.
- **Claude**: **Blocked from Cloud Run.** Claude's HTML page is a client-rendered SPA skeleton that does not embed message contents on the server. Claude's JSON API endpoint (`/api/chat_snapshots/{id}`) is protected by Cloudflare bot management, which rejects requests originating from Cloud Run datacenter IP ranges with HTTP 403 challenge pages even when realistic browser headers are supplied. Per the handoff instructions, Claude share URLs will return `{"code":"fetch_blocked"}` from Cloud Run, and the BFF/UI will explain that Claude share URLs cannot be fetched directly and prompt the user to paste the conversation text instead.
- **VPC Egress Confirmation**: Cloud Run Job probes via the VPC connector confirmed that outbound internet connections stall with `i/o timeout` because the VPC connector does not have a Cloud NAT gateway attached. This confirms the architectural decision in Carry-Over Item 7: the private Go API service must NOT configure `vpc_access`, ensuring direct egress to the public internet for third-party fetches.

---

## 4. Test Fixtures Saved

Raw responses obtained during the spike have been preserved under `api/internal/ingest/providers/`:
- `providers/chatgpt/testdata/share.html`: Full 519 KB HTML document from `https://chatgpt.com/share/6745ed36-9acc-800e-8a90-59204bd13444`.
- `providers/chatgpt/testdata/backend_share.json`: Full 9.2 KB raw JSON from `/backend-api/share/{id}`.
- `providers/claude/testdata/share.html`: Full 107 KB HTML SPA shell from `https://claude.ai/share/8807c67a-750f-4ba7-a719-7d57df697456`.
- `providers/claude/testdata/chat_snapshot.json`: Full 9.3 KB raw JSON from `/api/chat_snapshots/{id}`.

---

## 5. Emulator Vector Search Check

`go test ./internal/store/...` with `FIRESTORE_EMULATOR_HOST` confirmed that `FindNearest` vector search works in the Firestore emulator.
