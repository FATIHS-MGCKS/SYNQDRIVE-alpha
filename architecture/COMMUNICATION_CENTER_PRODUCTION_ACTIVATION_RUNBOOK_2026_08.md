# Communication Center — Production Activation Gate & Controlled Smoke Runbook

**Status:** PARTIAL — environment evidence collected; activation gates incomplete  
**Date:** 2026-08-24  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base:** `main` @ `95072d3f` (after merged PR #1252 — C13.6 cutover proof)  
**Branch:** `ops/communication-center-production-activation-gate`  
**Type:** Operational gate / runbook — **not** C13.7, not a feature phase

---

## 1. Objective

Convert the C13.6 **PRODUCTION CUTOVER — CONDITIONAL GO** into a truthful **production activation** decision by satisfying the four outstanding activation conditions:

1. Production environment verification  
2. Controlled production/staging smoke  
3. Swagger posture verification  
4. Retention policy **OR** explicit acceptance of safe disabled defaults  

Set **`PRODUCTION_VERIFIED = YES`** only when actual evidence supports it. This runbook records evidence collected on **2026-08-24** and operator actions still required.

---

## 2. C13.6 starting verdict

| Item | C13.6 status |
|------|----------------|
| Technical readiness (code/security/isolation) | **READY** / **PASS** |
| Aggregate cutover verdict | **PRODUCTION CUTOVER — CONDITIONAL GO** |
| `PRODUCTION_VERIFIED` | **NO** (at C13.6 close) |

This activation gate does **not** change C13.6 technical conclusions. It adds **deployment/environment/smoke** evidence.

---

## 3. Production architecture inventory

| Component | Expected deployment (repo/docs) | Verification method | Evidence (2026-08-24) | Status |
|-----------|--------------------------------|---------------------|------------------------|--------|
| **Frontend SPA** | Vite build → `backend/public/` via `vps-deploy-release.sh` | Public `https://app.synqdrive.eu/` | HTTP 200; bundle `index-DCj4n3XN.js` | **PASS** |
| **Backend API** | NestJS PM2 `synqdrive` on `:3001`, nginx proxy | `GET /api/v1/health` | HTTP 200; process online (root PM2) | **PASS** |
| **PostgreSQL** | Hostinger VPS native Postgres `synqdrive` | `psql` reachability | `SELECT 1` OK; Communication migrations present | **PASS** |
| **Redis** | `REDIS_HOST/PORT/PASSWORD` in `backend.env` | `redis-cli ping` | PONG | **PASS** |
| **BullMQ / workers** | In-process workers in `synqdrive` PM2 app (concurrency env vars) | PM2 + env key presence | Single `synqdrive` process online; worker concurrency keys **PRESENT** | **UNVERIFIED** (no queue depth sample) |
| **Scheduler / cron** | Nest `@Cron` in app (e.g. retention `30 3 * * *`) | Code + runtime logs | **IMPLEMENTED**; **RUNNING** assumed with app; purge runs **0** | **UNVERIFIED** |
| **Object storage / media** | `STORAGE_DRIVER=local` + shared documents path | Env + deploy script | `STORAGE_DRIVER=local` | **PASS** (config present) |
| **Nginx / TLS** | `/etc/nginx/sites-enabled/synqdrive` → `127.0.0.1:3001` | Public HTTPS + SSH nginx grep | nginx active; proxy configured | **PASS** |
| **Cloudflare / tunnel** | Not documented as required in deploy path | — | No evidence collected | **UNVERIFIED** |
| **WhatsApp (Meta)** | Per-org `org_whatsapp_configs` + optional env tokens | DB status + env | 1 org row **NOT_CONFIGURED**; `WHATSAPP_SIMULATE_ENABLED=true` | **FAIL** (live provider) |
| **Voice (ElevenLabs/Twilio)** | Env secrets + `voice_assistants` | Env key presence + DB | ElevenLabs/Twilio keys **PRESENT**; 2 voice assistant rows | **PARTIAL** |
| **AI (suggestions)** | `MISTRAL_*` / `AI_PROVIDER` | Env key presence | `MISTRAL_API_KEY` **PRESENT**; `AI_PROVIDER` **PRESENT** | **PASS** (credentials present) |
| **Monitoring** | Prometheus `/api/v1/metrics` (auth required) | HTTP status | Public metrics **401** (expected) | **PASS** |

**Production target:** `https://app.synqdrive.eu` / VPS `srv1374778.hstgr.cloud` (per `AGENTS.md`, deploy scripts, prior audits).

---

## 4. Secret-safety rules

This runbook and operator procedures **must not** print: API keys, webhook secrets, DB passwords, Redis passwords, JWT secrets, customer phone numbers, message bodies, or transcripts.

Report only: **PRESENT** / **MISSING** / **UNVERIFIED** / **SET** (value exists) / **DEFAULT** (env unset → code default).

---

## 5. Backend / frontend version proof

| Item | Expected (post-#1252) | Deployed (2026-08-24) | Classification |
|------|------------------------|------------------------|----------------|
| Git `main` HEAD | `95072d3f` (#1252 docs only) | — | — |
| Release directory | Latest `main` clone | `/opt/synqdrive/releases/20260824173547_v4994` | — |
| Deployed commit | `95072d3f` or functionally equivalent | `ab2c3631` (PR #1250 merge) | **STALE_VERSION** |
| Delta vs `main` | — | **Documentation-only** (#1252 C13.6 proof doc); **Communication runtime code through C13.5 is present** on deployed commit | Non-blocking for CC code |
| Frontend bundle | Built from release tree | `index-DCj4n3XN.js` | **STALE_VERSION** (same release) |
| PM2 uptime at check | — | ~67m at audit time | **PASS** (process healthy) |

**Action:** Redeploy `main` @ `95072d3f` (or later) to align release pointer — **recommended**, not blocking for CC runtime if `ab2c363` already contains C13.5.

---

## 6. Database

| Check | Evidence | Status |
|-------|----------|--------|
| Reachable | `psql` OK | **PASS** |
| Communication schema | Migrations through `20260824100000_communication_retention_purge_run_set_null` applied | **PASS** |
| Communication tables | 6 tables (`communication_conversations`, `communication_events`, …) | **PASS** |
| Destructive migration pending | None identified in deploy script path | **PASS** |
| `communication_conversations` row count | **0** (no projected conversations yet) | **PASS** (empty OK; smoke may seed test data) |

---

## 7. Redis

| Check | Evidence | Status |
|-------|----------|--------|
| Config keys | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` **PRESENT** | **PASS** |
| Reachability | `redis-cli ping` → PONG | **PASS** |

---

## 8. BullMQ / workers

| Check | Evidence | Status |
|-------|----------|--------|
| Worker concurrency env | `WORKER_*_CONCURRENCY` keys **PRESENT** | **PASS** |
| Separate worker PM2 process | None — workers run inside `synqdrive` app | **PASS** (architecture) |
| Failed/stalled job inspection | Not sampled in this audit | **UNVERIFIED** |
| Communication reply queue health | Not sampled | **UNVERIFIED** |

**Operator action:** After smoke, inspect BullMQ/queue metrics or admin tooling for failed Communication jobs.

---

## 9. Scheduler / cron

| Job | Code | Scheduled | Running | Verified |
|-----|------|-----------|---------|----------|
| `CommunicationRetentionScheduler` (`30 3 * * *`) | **IMPLEMENTED** | **SCHEDULED** (with app) | **RUNNING** (assumed) | **UNVERIFIED** (`communication_retention_purge_runs` count **0**) |
| `CommunicationMetricsRefreshService` (*/5) | **IMPLEMENTED** | **SCHEDULED** | **RUNNING** (assumed) | **UNVERIFIED** |
| Voice retention delegated | **IMPLEMENTED** | Per Voice module | **UNVERIFIED** | **UNVERIFIED** |

---

## 10. WhatsApp configuration

| Check | Evidence | Status |
|-------|----------|--------|
| Global simulate flag | `WHATSAPP_SIMULATE_ENABLED=true` | **SET** |
| Org config row | 1 row; `provider_status=NOT_CONFIGURED`, tokens not configured | **FAIL** (live Meta) |
| Webhook verify token in DB | Not configured | **FAIL** |
| Provider readiness | Not connected | **FAIL** |

**Interpretation:** Production can exercise **simulated** WhatsApp paths; **live Meta provider activation** is **not** complete. Controlled smoke for real delivery requires provider setup **or** explicit simulate-only acceptance.

---

## 11. WhatsApp webhook

| Check | Evidence | Status |
|-------|----------|--------|
| Route exists (code) | `WhatsAppWebhookController` | **PASS** (code) |
| Public reachability | Unauthenticated probe → **401** (auth enforced) | **PASS** (not open) |
| Meta verification handshake | Not executed (no provider config) | **MANUAL_PROVIDER_TEST_REQUIRED** |
| Event flow (7d) | `whatsapp_webhook_events` count **0** | **UNVERIFIED** / no recent traffic |

---

## 12. Voice configuration

| Check | Evidence | Status |
|-------|----------|--------|
| ElevenLabs credentials | `ELEVENLABS_API_KEY`, `ELEVENLABS_WEBHOOK_SECRET` **PRESENT** | **PASS** |
| Twilio credentials | `TWILIO_*` keys **PRESENT** | **PASS** |
| `VOICE_WEBHOOK_INGESTION_ENABLED` | **SET** | **PASS** |
| `VOICE_NATIVE_TWILIO_INTEGRATION` | **SET** | **PASS** |
| Voice assistants | 2 rows: prod org `CONNECTED` (no agent id); `org-voice-staging-e2e` `NOT_CONFIGURED` (has agent id) | **PARTIAL** |

---

## 13. Voice webhook / event flow

| Check | Evidence | Status |
|-------|----------|--------|
| Webhook events (7d) | `voice_provider_webhook_events` count **0** | **UNVERIFIED** / no recent traffic |
| Live call test | Not executed | **MANUAL_CONTROLLED_SMOKE_REQUIRED** |

---

## 14. AI configuration

| Check | Evidence | Status |
|-------|----------|--------|
| Provider | `AI_PROVIDER` **PRESENT** | **PASS** |
| Mistral | `MISTRAL_API_KEY` **PRESENT** | **PASS** |
| Suggestion auto-send | Code requires explicit reply path (C13.6 **TEST_PROVEN**) | **PASS** (code); production smoke **NOT_EXECUTED** |

---

## 15. Storage / media

| Check | Evidence | Status |
|-------|----------|--------|
| Driver | `STORAGE_DRIVER=local` | **PASS** |
| Shared documents path | Deploy script links `/opt/synqdrive/shared/storage/documents` | **PASS** (deploy pattern) |
| Upload/download smoke | Not executed | **NOT_EXECUTED** |

---

## 16. Swagger posture

| Check | Evidence | Status |
|-------|----------|--------|
| `NODE_ENV` | `production` | **PASS** |
| `SWAGGER_ENABLED` | **unset** → `resolveSwaggerEnabled()` → **false** | **PASS** |
| Public `https://app.synqdrive.eu/docs` | Returns SPA HTML (not OpenAPI UI) | **PASS** |
| Backend OpenAPI mount | Disabled when `swaggerEnabled=false` (see `main.ts`) | **PASS** |

**Conclusion:** Swagger is **intentionally disabled** in production per SynqDrive policy. No public OpenAPI exposure observed.

---

## 17. Retention effective state

**Source:** `communication-retention.config.ts` + `communication-retention.constants.ts` + production `backend.env` (keys unset → defaults).

| Class | Env key | Effective value | Meaning |
|-------|---------|-----------------|--------|
| Master switch | `COMMUNICATION_RETENTION_ENABLED` | **false** (default) | Scheduler no-op for destructive purge |
| Dry run | `COMMUNICATION_RETENTION_DRY_RUN` | **true** (default) | Even if enabled, dry-run default |
| Message content days | `COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS` | **0** (default) | **Purge disabled** |
| Attachment days | `COMMUNICATION_RETENTION_ATTACHMENT_DAYS` | **0** | **Purge disabled** |
| Reply command days | `COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS` | **0** | **Purge disabled** |
| AI content days | `COMMUNICATION_RETENTION_AI_CONTENT_DAYS` | **0** | **Purge disabled** |
| Voice delegated | `VOICE_RETENTION_ENABLED` | default per Voice module | **UNVERIFIED** in prod env |
| Purge run audit rows | DB | **0** rows | No destructive runs observed |

### 0-day means purge disabled — proof

`isRetentionPolicyEnabled(0) === false` and `computeRetentionCutoffUtc(now, 0) === null` — tested in `communication-retention.constants.spec.ts`. **0 does not mean delete immediately.**

| Check | Status |
|-------|--------|
| `RETENTION_SAFE_DEFAULT_AVAILABLE` | **YES** |
| Owner explicit acceptance recorded | **REQUIRED** (not captured in this audit) |

---

## 18. Observability (C13.2)

| Layer | Status |
|-------|--------|
| Code implemented | **PASS** |
| Deployed | **PASS** (migrations + app running) |
| Signals observed in production | **UNVERIFIED** — `GET /admin/communication/operational-health` not executed (requires platform admin auth) |
| Prometheus metrics | Endpoint returns **401** unauthenticated — **PASS** (protected) |
| PII in metric labels | Code bounds labels (C13.2 tests) — production log sample **NOT_EXECUTED** |

**Operator action:** Authenticated Master Admin call to operational-health during/after smoke.

---

## 19. Reconciliation

| Check | Status |
|-------|--------|
| Automatic projection path (code) | **PASS** |
| Manual Voice sync required for normal correctness | **NO** (C13.6 conclusion preserved) |
| Production webhook/event convergence observed | **UNVERIFIED** (0 webhook events in 7d sample) |

---

## 20. Deprecated HTTP compatibility routes (C13.5)

**Do not remove in this task.**

| Route | Canonical replacement | Frontend callers | Prod telemetry (nginx last 5000 lines) |
|-------|----------------------|------------------|----------------------------------------|
| GET `.../whatsapp/conversations` | `GET /communication/conversations?channel=whatsapp` | 0 | **OBSERVED_ZERO** |
| GET `.../whatsapp/conversations/:id/messages` | `GET .../events` | 0 | **OBSERVED_ZERO** |
| GET `.../whatsapp/conversations/:id/context` | CC context/read | 0 | **OBSERVED_ZERO** |
| POST `.../whatsapp/conversations/:id/messages` | `POST .../reply` (adapter) | 0 | **OBSERVED_ZERO** |
| POST `.../ai-suggestion` | canonical ai-suggestion | 0 | **OBSERVED_ZERO** |
| POST `.../human-review` | quick action | 0 | **OBSERVED_ZERO** |
| POST `.../actions/:actionId` | quick action executor | 0 | **OBSERVED_ZERO** |
| GET `.../voice-assistant/conversations` | `GET /communication/conversations?channel=voice` | 0 | **OBSERVED_ZERO** |
| POST `.../ai-reply` | **REMOVED_SECURITY_SUPERSEDED** | absent | N/A |

**Observation:** `OBSERVATION_STARTED` **2026-08-24** (nginx sample baseline). Full observation window duration remains **POLICY_REQUIRED**.

---

## 21. Automated non-destructive smoke (executed 2026-08-24)

| Test | Result |
|------|--------|
| `GET https://app.synqdrive.eu/api/v1/health` | **200** — **PASS** |
| `GET https://app.synqdrive.eu/` (SPA) | **200** — **PASS** |
| `GET .../communication/conversations` (no auth) | **401** — **PASS** (auth enforced) |
| `GET /api/v1/metrics` (no auth) | **401** — **PASS** |
| Legacy URL `?view=whatsapp-business&tab=inbox` loads SPA | **200** — **PARTIAL** (redirect behavior requires authenticated browser session) |
| RBAC negative (production) | **NOT_EXECUTED_FOR_SAFETY** — use backend integration tests |
| Tenant/station negative (production) | **NOT_EXECUTED_FOR_SAFETY** |

---

## 22. Manual controlled smoke checklist (operator-executable)

**Prerequisites:** Dedicated test org; Clerk login; prefer `org-voice-staging-e2e` or designated comm test org; never use arbitrary customer threads.

### A. Communication Center shell

- [ ] Open `https://app.synqdrive.eu` → Communication Center (sidebar)
- [ ] Inbox loads without legacy WhatsApp/Voice operational shells
- [ ] Channels pane loads (WhatsApp + Voice sections)
- [ ] No `WhatsAppBusinessView` / `VoiceConversationsPanel` UI

### B. WhatsApp (choose simulate **or** configured sandbox)

- [ ] Filter Inbox `channel=whatsapp`
- [ ] Open controlled test conversation (simulate or sandbox number)
- [ ] Timeline loads
- [ ] AI suggestion generates — **verify no auto-send**
- [ ] Send **one** controlled test reply
- [ ] Verify **one** provider/simulate delivery + status update
- [ ] Handoff/quick action (if safe for test org)

### C. Voice

- [ ] Filter Inbox `channel=voice`
- [ ] Open controlled test call/conversation
- [ ] Transcript + summary/outcome load
- [ ] Channels → Voice: Analytics, Builder, Telephony, Test Center open

### D. Navigation

- [ ] `?view=whatsapp-business&tab=inbox` → canonical CC Inbox (no sensitive query residue)
- [ ] `?view=ai-voice-assistant&voiceOpsTab=conversations` → CC voice Inbox
- [ ] Browser Back — no redirect ping-pong
- [ ] Refresh deep link — state restores

### E. RBAC (test accounts only)

- [ ] Read-only user cannot send
- [ ] Scoped user cannot access other tenant/station (if test accounts exist)

### F. Viewports

- [ ] **390px:** Inbox, detail, Channels, WA config, Voice tabs
- [ ] **1440px:** same checks, no duplicate operational shell

### G. Post-smoke monitoring (5–15 min window)

- [ ] No 5xx spike in nginx/app logs
- [ ] No duplicate send signals
- [ ] `GET /admin/communication/operational-health` — acceptable component states

---

## 23. Send safety (controlled WhatsApp)

During manual smoke, verify:

```
one UI send → one ReplyCommand → one provider/simulate dispatch
```

Record only opaque message/command IDs if needed. **No message body in runbook records.**

Status after this audit: **NOT_EXECUTED**

---

## 24. AI safety (controlled)

During manual smoke:

- Suggestion appears
- **No** automatic provider send until explicit human send

Status after this audit: **NOT_EXECUTED**

---

## 25. Rollback readiness

| Check | Evidence | Status |
|-------|----------|--------|
| Previous releases on disk | 3 releases under `/opt/synqdrive/releases/` | **READY** |
| Rollback procedure | `ln -sfn` previous release + `pm2 restart` (deploy script pattern) | **READY** |
| Destructive DB migration blocker | None for Communication activation | **READY** |
| Legacy UI toggle rollback | **Not available** (C13.4 deleted UI) — release rollback only | **READY** (documented) |

---

## 26. Activation gate matrix

| Gate | Required evidence | Current status | Blocking? | Action |
|------|-------------------|----------------|-----------|--------|
| Backend version | Post-C13.5 code on prod | **STALE_VERSION** (docs-only behind `main`) | No | Redeploy `main` tip (recommended) |
| Frontend version | CC UI in bundle | **STALE_VERSION** (same release) | No | Redeploy with backend |
| Database | Schema + reachability | **PASS** | No | — |
| Redis | PING + config | **PASS** | No | — |
| Workers | App online + queue healthy | **UNVERIFIED** | No* | Sample queue failures post-smoke |
| Scheduler | Retention/metrics cron | **UNVERIFIED** | No* | Confirm logs after 03:30 UTC |
| WhatsApp config | Org connected OR accepted simulate-only | **FAIL** (live) | **Yes** for live WA smoke | Configure Meta **or** document simulate-only activation |
| WhatsApp webhook | Verified handshake + events | **MANUAL_PROVIDER_TEST_REQUIRED** | Yes for live WA | Complete Meta webhook setup |
| Voice config | Credentials + assistant | **PARTIAL** | No | Use staging e2e org for smoke |
| Voice webhook | Recent events or manual proof | **MANUAL_CONTROLLED_SMOKE_REQUIRED** | No* | Controlled test call if policy allows |
| AI config | Provider keys | **PASS** | No | — |
| Storage/media | Driver configured | **PASS** | No | Optional attachment smoke |
| Swagger | Disabled in production | **PASS** | No | — |
| Retention | Safe 0-day defaults | **PASS** | No | Record **owner acceptance** |
| Observability | Health endpoint post-smoke | **UNVERIFIED** | No* | Admin health check |
| Reconciliation | Webhook-driven convergence | **UNVERIFIED** | No* | Observe after provider traffic |
| Controlled smoke | §22 complete | **REQUIRED** | **Yes** | Operator execution |
| Rollback | Known prior release | **READY** | No | — |

\*Blocking for **PRODUCTION_VERIFIED = YES**, not necessarily for maintaining CONDITIONAL GO technical posture.

---

## 27. Remaining actions before `PRODUCTION_VERIFIED = YES`

1. **Record retention owner acceptance** of safe `0`-day destructive-purge-disabled defaults (or codify policy values).  
2. **Execute §22 manual controlled smoke** with authenticated test org (document results externally).  
3. **Resolve WhatsApp path:** either configure Meta provider for test org **or** explicitly accept simulate-only operational mode for activation sign-off.  
4. **Redeploy** `main` @ `95072d3f+` to align release SHA (recommended).  
5. **Post-smoke:** authenticated `GET /admin/communication/operational-health` + queue/log check.  

---

## 28. Non-blocking post-activation follow-ups

(After activation conditions satisfied — do not block CONDITIONAL GO → GO transition once smoke complete)

- Deprecated HTTP route telemetry observation (baseline started **2026-08-24**, nginx sample zero hits)  
- Final retirement decision for 8 compatibility routes after **POLICY_REQUIRED** observation window  
- Retention-duration policy codification (if not already accepted via safe defaults)  
- Longer-term Communication alert/dashboard tuning  

---

## 29. Final activation verdict (this audit)

| Verdict | |
|---------|---|
| **PRODUCTION ACTIVATION — CONDITIONAL GO** | Environment partially verified; controlled smoke **not** completed; `PRODUCTION_VERIFIED` remains **NO** |

**Not** `PRODUCTION ACTIVATION — GO` because:

- Manual controlled smoke **REQUIRED** and not executed  
- WhatsApp live provider **NOT_CONFIGURED** (simulate enabled)  
- Retention owner acceptance **REQUIRED**  
- Operational health / queue state **UNVERIFIED** in authenticated production session  

**Not** `PRODUCTION ACTIVATION — NO-GO` because:

- No blocking security defect discovered  
- Code/security/isolation remains **READY** per C13.6  
- Infrastructure baseline (DB, Redis, app health, Swagger, safe retention defaults) **PASS**  

---

## 30. Evidence class legend

| Class | Meaning |
|-------|---------|
| **PASS** | Observed evidence supports gate |
| **FAIL** | Observed evidence contradicts requirement |
| **UNVERIFIED** | Not observed; not inferred from code |
| **MANUAL_ACTION_REQUIRED** | Operator must execute checklist |
| **ENVIRONMENT_ACCESS_REQUIRED** | Needs credentials/session not used here |
| **POLICY_DECISION_REQUIRED** | Human policy choice (retention window, observation duration) |
| **NOT_EXECUTED_FOR_SAFETY** | Deliberately skipped to avoid prod abuse |

---

## 31. Operator quick commands (read-only)

```bash
# Health (public)
curl -sf https://app.synqdrive.eu/api/v1/health

# Deployed commit (on VPS, requires SSH)
sudo git -C "$(readlink -f /opt/synqdrive/current)" rev-parse --short HEAD

# Deprecated route hits (nginx, bounded sample)
sudo tail -n 5000 /var/log/nginx/access.log | grep -E 'whatsapp/conversations|voice-assistant/conversations' | wc -l

# Communication table counts (no PII)
sudo -u postgres psql -d synqdrive -tAc 'SELECT COUNT(*) FROM communication_conversations'
```

**Do not** paste env file contents into tickets or chat.

---

## 32. Document maintenance

Update this runbook when:

- Manual smoke checklist is executed (attach external evidence reference)  
- Production deploy advances beyond `ab2c363`  
- WhatsApp provider becomes connected  
- `PRODUCTION_VERIFIED` flips to **YES**  

**Changes / Architektur:** Updated in Master Admin for this runbook addition.
