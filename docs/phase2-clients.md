# Phase 2 MCP Client Verification Log

This document records verification results for all target MCP clients connecting to AI Notes, as required by Phase 2 handoff sections 9.6, 9.8, and 14.

**Date**: 2026-09-05  
**Environment**: Production (`https://ai-notes-web-g3q7qn4imq-ew.a.run.app`) & Local Emulator Stack  
**Server Protocol**: Model Context Protocol (MCP) Streamable HTTP transport at `/mcp`

---

## 1. Summary of Tested Clients

| Client | Auth Type | Status | Notes |
|---|---|---|---|
| **MCP Inspector (Local)** | PAT (`ain_pat_...`) | Verified | Tools `save_note`, `search_notes`, `get_note` fully verified. |
| **Claude Code** | PAT (`Authorization: Bearer <token>`) | Verified | HTTP transport with custom header. Note saving, searching, reading functional. |
| **Cursor** | PAT (`Authorization: Bearer <token>`) | Verified | Configured via `mcpServers` in `.cursor/mcp.json` or Cursor Settings. |
| **Claude.ai** | OAuth 2.1 (RFC 8414, RFC 7591 DCR, PKCE) | Verified | RFC 9728 discovery -> DCR registration -> `/oauth/consent` -> token exchange -> tool invocation. |
| **ChatGPT Developer Mode** | OAuth 2.1 (RFC 8414, PKCE) | Verified | Discovers `/.well-known/oauth-authorization-server`, completes consent flow, invokes tools. |
| **xAI Grok** | Remote MCP / OAuth | Documented | Current status: Grok does not currently support remote HTTP MCP connectors or dynamic OAuth MCP integrations. Documented and skipped per Section 11.3. |

---

## 2. Command-Line & IDE Clients (PAT Authentication)

### 2.1 Claude Code

**Command**:
```bash
claude mcp add --transport http ai-notes https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp --header "Authorization: Bearer ain_pat_YOUR_TOKEN_HERE"
```

**What Worked**:
- Connection initializes immediately with 200 OK.
- `save_note`: Successfully creates notes directly in Firestore library with 768-dim embeddings without decrementing ingest quota.
- `search_notes`: Semantic vector search (`FindNearest` cosine distance) retrieves matching notes by semantic intent.
- `get_note`: Retrieves full note detail and decompresses gzipped transcript if requested.

**Errors Encountered**:
- None. Ensure user creates PAT at `/app/connect` and copies token before leaving page.

---

### 2.2 Cursor

**Configuration** (`.cursor/mcp.json` or Settings > MCP):
```json
{
  "mcpServers": {
    "ai-notes": {
      "url": "https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp",
      "headers": {
        "Authorization": "Bearer ain_pat_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

**What Worked**:
- Remote HTTP transport detected.
- Tool schemas discovered and listed in Composer.
- All three tools invoke cleanly and return markdown formatted responses.

---

## 3. Hosted Clients (OAuth 2.1 Authorization)

### 3.1 Claude.ai Custom Connector

**Connector URL**: `https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp`

**Flow Verified**:
1. **Discovery**: Claude.ai makes unauthenticated GET request to `https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp`.
2. **Challenge**: Server returns `401 Unauthorized` with:
   ```http
   WWW-Authenticate: Bearer error="invalid_token", error_description="Missing Authorization header", resource_metadata="https://ai-notes-web-g3q7qn4imq-ew.a.run.app/.well-known/oauth-protected-resource/mcp"
   ```
3. **Protected Resource Metadata**: Claude.ai queries `/.well-known/oauth-protected-resource/mcp` and discovers:
   ```json
   {
     "resource": "https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp",
     "authorization_servers": ["https://ai-notes-web-g3q7qn4imq-ew.a.run.app/"],
     "scopes_supported": ["notes:read", "notes:write"],
     "resource_name": "AI Notes"
   }
   ```
4. **Authorization Server Metadata**: Claude.ai queries `/.well-known/oauth-authorization-server` to discover endpoints (`/authorize`, `/token`, `/register`, `/revoke`).
5. **Dynamic Client Registration (RFC 7591)**:
   Claude.ai registers via `POST /register`:
   ```json
   {
     "client_name": "Claude.ai",
     "redirect_uris": ["https://claude.ai/api/mcp/callback"],
     "token_endpoint_auth_method": "none"
   }
   ```
   Server responds with `201 Created` and generated `client_id`.
6. **User Consent**:
   Claude.ai redirects user to:
   ```
   https://ai-notes-web-g3q7qn4imq-ew.a.run.app/authorize?client_id=...&redirect_uri=https://claude.ai/api/mcp/callback&code_challenge=...&code_challenge_method=S256&resource=https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp
   ```
   User logs in via Google Identity on AI Notes, views consent screen with requested scopes (`notes:read`, `notes:write`), and clicks "Authorize".
7. **Token Exchange**:
   Authorization code (`ain_ac_...`) returned to redirect URI with `iss` parameter. Claude.ai POSTs code and PKCE verifier to `/token`. Server returns access token (`ain_at_...`, 1h TTL) and refresh token (`ain_rt_...`, 30d TTL).
8. **Tool Calls**:
   Claude.ai calls `/mcp` with `Authorization: Bearer ain_at_...`. Web service resolves UID, obtains Firebase ID token, and proxies calls to private Go API.

---

### 3.2 ChatGPT Developer Mode / Custom Actions

**Endpoint**: `https://ai-notes-web-g3q7qn4imq-ew.a.run.app/mcp`

**Flow Verified**:
- Discovers OAuth authorization server metadata at `/.well-known/oauth-authorization-server`.
- Authenticates using PKCE Authorization Code grant.
- Obtains Bearer token and executes MCP tool calls successfully.

---

### 3.3 xAI Grok Assessment (Per Section 11.3)

**Status**:
As of September 2026, xAI Grok does not support third-party remote Model Context Protocol (MCP) server integration or dynamic OAuth 2.1 client discovery in its public web or API interfaces. Documented and skipped per Section 11.3.

---

## 4. Operational & Security Checklist

- [x] Cloud Run ingress internal-only on `ai-notes-api`; Web BFF is public.
- [x] Only Go API touches Cloud Firestore, Cloud Storage, or Vertex AI.
- [x] Zero-cost scale-to-zero verified: `minScale = 0` on both Cloud Run services.
- [x] Canonical host 301 redirect verified for all non-canonical host headers.
- [x] Token hashing: plaintext tokens never stored in Firestore or logged.
- [x] Single-use authorization codes with transactional consumption.
- [x] Refresh token rotation with immediate reuse refusal.
