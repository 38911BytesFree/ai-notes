# Phase 1 review

Reviewed 4 September 2026 against `docs/phase1-handoff.md` at commit
`1d437ab` (18 commits after `9532a64`). Focus: infrastructure and the
scale-to-zero cost profile, then code correctness.

Verdict: the code is complete, every test suite is green, and `terraform
plan` is clean. But Phase 1 has not been deployed: the 18 commits are
unpushed, production still runs the Phase 0 image, and none of the
production exit criteria can have been exercised. On scale-to-zero there is
one real blocker (the always-on VPC connector) and a handful of hygiene
items. Section 6 is the ordered to-do list.

## 1. What was verified

| Check | Result |
|---|---|
| `go vet ./...`, `go test ./...` | pass, 8 packages |
| `pnpm typecheck`, `pnpm test` | pass, 15 tests in 6 files |
| `terraform plan -var-file=environments/prod.tfvars` | No changes |
| Firestore indexes | 3 indexes on `notes`, all `READY`, match `firestore.indexes.json` |
| Transcripts bucket | `ai-notes-507510-transcripts` exists, uniform access, public access prevented, `api-sa` has `objectAdmin` |
| Vertex AI | API enabled, `api-sa` has `roles/aiplatform.user` |
| Firebase Auth | `api-sa` has `roles/firebaseauth.admin` for account deletion |
| API `vpc_access` | removed, as the spike proved it must be |
| Cloud Run scaling | both services min 0, max 5, CPU throttled when idle |
| Web timeout | 900 s, ready for Phase 2 MCP streams |
| Cloud Build triggers | `included_files` set, `:latest` and `--no-cache` gone, yaml trigger files deleted |
| Spike job | no Cloud Run Jobs remain |
| XSS surface | no `dangerouslySetInnerHTML` anywhere in `web/app` |
| Hydration suppression | reverted; rule 11 added to CLAUDE.md and GEMINI.md |

## 2. Deployment gap

| Item | State |
|---|---|
| `origin/main` | at `9532a64`, pushed 11:59 UTC. Everything after is local only. |
| Deployed images | both services run tag `9532a64…`, the Phase 0 code plus the hydration commit |
| API env in prod | `TRANSCRIPTS_BUCKET`, `GEMINI_MODEL`, `VERTEX_LOCATION`, `INGEST_MONTHLY_LIMIT`, `SUMMARISER_MAX_CHARS` are set by Terraform but the running binary ignores them |
| `ai-notes.io` | does not resolve; `manage_domain = false`; human task 10.1 not done |
| Exit criteria needing production | ingest a ChatGPT link, transcript object in bucket, search, export, delete account: none verifiable yet |
| Vertex model availability | `gemini-2.5-flash` and `gemini-embedding-001` in `europe-west1` never exercised from Cloud Run |

Push to `main`, let Cloud Build deploy both services, then run the section
13 verification script from the handoff.

## 3. Scale-to-zero audit

Every resource in the project, what it costs when nobody is using the
product, and what to do about it.

| Resource | Idle cost | Status | Action |
|---|---|---|---|
| Cloud Run `ai-notes-api` | none (min 0, CPU throttled) | OK | Add `startup_cpu_boost = true` so cold starts are shorter. Remove `scaling` from `ignore_changes` so Terraform stays authoritative. |
| Cloud Run `ai-notes-web` | none (min 0, CPU throttled) | OK | Same two changes. |
| **Serverless VPC Access connector** | **two `e2-micro` instances running 24×7** | **Blocker** | Replace with Direct VPC Egress on the web service (see 3.1). Delete the connector. Remove `vpcaccess.googleapis.com` from enabled services. |
| VPC and subnet | none | OK | Set `private_ip_google_access = true` on the subnet (currently `False`); Direct VPC Egress with all-traffic routing needs it to reach Google APIs. |
| Artifact Registry | storage only, but already 532 MB after one day with no cleanup policy | Grows forever | Add `cleanup_policies` to the repo: keep the 5 most recent tagged versions per package, delete untagged after 1 day. Delete the `:spike` tag by hand. |
| Firestore | on demand, free tier | OK | none |
| Cloud Storage transcripts | per GB, effectively zero | OK | none |
| Cloud Storage `_cloudbuild` source bucket | small, grows per manual `gcloud builds submit` | Minor | Optional 7-day lifecycle rule. |
| Secret Manager | per version, negligible | OK | `github-token` appears unused; delete if the Cloud Build GitHub connection does not need it. |
| Vertex AI | per call | OK | Ingest is capped at 30 per user per month. Search embeds are uncapped but cost a fraction of a cent each; fine at this scale. |
| Cloud Build | per build minute | OK | `included_files` now prevents double builds. |
| Cloud Logging | free tier | OK | One access-log line per request; no user identifiers. |
| Billing budget | n/a | OK | 4000 JPY with 50/90/100 percent alerts. |

### 3.1 Replacing the connector

The web service must keep `egress = "ALL_TRAFFIC"`: Cloud Run's internal
ingress only accepts calls from another Cloud Run service when that service
routes all traffic through the VPC. Direct VPC Egress supports this without
any always-on instances. The web service's only outbound calls are the
private API (through the VPC), the metadata server (local, for ID-token
minting), and in Phase 2 the Identity Toolkit REST API (a Google API, so
Private Google Access on the subnet covers it). No Cloud NAT is needed.

In `cloud_run.tf` on the web service, replace the `vpc_access` block with:

```hcl
vpc_access {
  network_interfaces {
    network    = google_compute_network.vpc.id
    subnetwork = google_compute_subnetwork.subnet.id
  }
  egress = "ALL_TRAFFIC"
}
```

In `network.tf`, add `private_ip_google_access = true` to the subnet and
delete `google_vpc_access_connector.connector`. In `project.tf`, drop
`vpcaccess.googleapis.com`. Apply, then confirm sign-in still works on the
deployed web URL (the loader calls the API through the new path). Direct
VPC Egress reserves IPs in the subnet per instance; the `/24` is ample for
max 5 instances.

## 4. Code defects

Ordered by severity.

1. **The ChatGPT fetcher does not use the SSRF-safe client.** `chatgpt.New()`
   returns a provider wrapping `http.DefaultClient`, and `fetcher.go`
   registers it that way. `ingest.NewClient` (allowlist, redirect check,
   public-IP dialer, 5 MB cap, 20 s timeout) is only used by the `-probe`
   flag. In production an ingest follows redirects anywhere, has no timeout,
   and reads unbounded bodies. Fix: in `fetcher.go`, build the registry with
   `chatgpt.NewWithClient(NewClient(DefaultAllowlist))`. Add a test that a
   redirect to an off-list host from the provider returns `fetch_failed`.
2. **Unchecking "Keep original transcript" has no effect.** An unchecked
   checkbox is omitted from the form post; `api.ingest.ts` treats a missing
   `keep_transcript` as `true`. Fix: render a hidden `keep_transcript=false`
   before the checkbox, or default the action to the user's stored setting
   rather than `true`. Add a test.
3. **Each API call does a Firebase Auth network lookup, and the library page
   makes three or four of them.** `requireUser` calls
   `VerifyIDTokenAndCheckRevoked`, which fetches the user record from
   Identity Toolkit on every request. `app.tsx`'s loader calls `requireAuth`
   (`/v1/me`), then `getMe` (`/v1/me` again), then list or search;
   `AuthProvider` posts the token once more on hydration. Fix: use
   `VerifyIDToken` (signature and expiry only; revocation is a rare event
   and the cookie is 14 days anyway), and have `requireAuth` return the
   profile so loaders stop calling `getMe`. This is latency on every cold
   start, not just cost.
4. **`go.mod` marks `google.golang.org/genai` and `cloud.google.com/go/storage`
   as `// indirect`** although they are imported directly. Run `go mod tidy`.
5. **Orphan transcript on a failed note write.** The pipeline puts the blob
   before `CreateNote`; if the Firestore write fails the object stays.
   Reverse the order or delete the blob on failure. Also, a summariser
   failure keeps the quota charge; the handoff said so, but it will feel
   unfair to users when Vertex has an outage.
6. **Account deletion returns 204 when the Firebase Auth delete fails.** The
   user can sign in again and get a fresh, empty account. Return
   `internal_error` instead and let the user retry.
7. **Settings copy claims transcripts are "encrypted".** They are gzipped in
   a bucket with Google-managed encryption at rest. Say "stored privately".
8. **`claude.ParseJSON` hardcodes `claude-3-5-sonnet` as the model.** It is
   unused in production (Claude is `fetch_blocked`) but will mislead whoever
   revives it. Leave the model empty.
9. **The Firestore integration test is skipped unless
   `FIRESTORE_EMULATOR_HOST` is set**, so whether the emulator supports
   `FindNearest` is still unknown. Run `go test ./internal/store/...` with
   the emulator up once and record the answer in the spike doc.

## 5. Done well

- The spike is exactly what was asked for: a full origin × endpoint × UA
  matrix, saved fixtures, a decision, and it also proved the connector had
  no route to the internet, which settled the API networking question with
  evidence.
- The ChatGPT HTML parser walks the React Router stream payload rather than
  screen-scraping, so it survives layout changes.
- `ReserveIngest` is a transaction with period reset, and quota is rolled
  back on fetch errors before any LLM spend.
- Every handler checks ownership inside the store and returns `not_found`
  on mismatch; there is no 403 that leaks existence.
- `errors.go` is the single closed set and `error-messages.ts` mirrors it
  one to one.
- `USE_FAKE_AI` keeps local dev credential-free, and the dev script now
  boots the Express entry that Phase 2 depends on.
- The hydration-warning suppression was reverted and the rule against it
  written down.

## 6. Status after the follow-up session (4 September 2026, later)

Done and committed: defects 1, 2, 3, 4, 5, 6, 7, 8 from
section 4, and the Terraform edits from section 3 (Direct VPC Egress on the
web service, Private Google Access on the subnet, startup CPU boost,
`scaling` out of `ignore_changes`, Artifact Registry cleanup policies). The
connector resource is still declared so the switch can be verified before it
is destroyed. Phase 1 code was pushed and deployed at `1d437ab`. Still open:
`terraform apply` (two steps, see the session notes), the human domain tasks,
the production verification run, and defect 9.

## 7. What needs to be done, in order

1. Push `main` and let Cloud Build deploy both services. Watch the API
   revision start: it now needs Vertex and GCS clients at boot.
2. Fix defect 1 (SSRF client wiring) and defect 2 (keep-transcript
   checkbox) before real users touch it; both are small.
3. Terraform: replace the connector with Direct VPC Egress (3.1), enable
   Private Google Access on the subnet, add `startup_cpu_boost`, remove
   `scaling` from `ignore_changes`, add the Artifact Registry cleanup
   policy. Apply, confirm sign-in and ingest still work, confirm
   `terraform plan` is clean.
4. Human: verify `ai-notes.io` in Search Console, set `manage_domain = true`,
   apply, add the DNS records, add the domain to Firebase Auth authorised
   domains, and enable the Email link provider.
5. Run the handoff's section 13 verification in production: one ChatGPT
   link, one pasted text, one Claude link (expect `fetch_blocked`), a
   semantic search, edit, delete, export, delete account. Confirm a gzip
   object appears in the bucket and disappears on delete.
6. Defect 3 (auth lookups per page) and `go mod tidy`; then defects 5 to 9
   as a single tidy-up commit.
7. Run the 20-link summary quality pass from human task 10.5 and adjust
   `prompt.go`.
