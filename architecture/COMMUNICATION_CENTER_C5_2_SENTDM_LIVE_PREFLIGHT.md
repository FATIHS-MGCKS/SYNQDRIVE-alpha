# Communication Center C5.2 — sent.dm Live Validation Preflight

**Date (UTC):** 2026-08-22  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**PR:** #1134 (`cursor/communication-center-c5-2-sentdm-runtime-40bb`)  
**Task type:** Read-only / non-billable preflight  
**Live SMS sent:** NO  
**Deploy performed:** NO  
**Merge performed:** NO  

---

## Executive summary

| Verdict | **BLOCKED** — environment is not ready for first controlled live SMS validation |
|---------|---|

C5.2 code on PR #1134 is implementation-complete from a review perspective, but **production VPS currently runs `main` without #1134**. C5.1 database objects exist; C5.2 runtime code, C5.2 migration (`processing_claimed_at`), sent.dm credentials, `OrgSmsConfig`, test recipient, and webhook route are **not** in place on the live host.

---

## 1. Deployed runtime (verified read-only on VPS)

| Item | Observed value |
|------|----------------|
| Host | `srv1374778.hstgr.cloud` |
| Public API | `https://app.synqdrive.eu/api/v1` |
| Release directory | `/opt/synqdrive/releases/20260822001146_v4994` |
| Current symlink | `/opt/synqdrive/current` → above release |
| **Deployed commit** | `9fc2692854b438ca0678bb67ac550ec5698dfd1a` (`main` — post #1135/#1133, **pre-#1134**) |
| Process | `node /opt/synqdrive/current/backend/dist/src/main.js` (root, port **3001**) |
| Runtime manager | PM2 (process observed running; `synqdrive-admin` PM2 list empty — app runs under root) |
| Env source | `/opt/synqdrive/shared/backend.env` (symlinked into release) |
| DB target | PostgreSQL database `synqdrive` (local `postgres` user) |
| Reverse proxy | nginx site `synqdrive` → `proxy_pass http://127.0.0.1:3001` for `/` |
| TLS | **OK** — `https://app.synqdrive.eu/api/v1/health` returns `{"status":"ok",...}` |

### #1134 deployment status

| Check | Result |
|-------|--------|
| #1134 merged to `main`? | **NO** (3 commits ahead on PR branch) |
| `SmsModule` on deployed tree? | **NO** (`main` imports `SmsPersistenceModule` only) |
| C5.2 migration in deployed tree? | **NO** (`20260822040000_communication_center_c5_2_sms_webhook_processing_lease` absent) |
| `POST /webhooks/sentdm` reachable? | **404** (expected — route not deployed) |
| `POST /webhooks/whatsapp` reachable? | **401** (route exists on current `main`) |

---

## 2. Database schema (read-only)

### C5.1 (#1127) — deployed

| Object | Present |
|--------|---------|
| `sms_conversations` | YES |
| `sms_messages` | YES |
| `sms_webhook_events` | YES |
| `org_sms_configs` | YES |
| `sms_messages.first_dispatch_attempted_at` | YES |
| Applied migration | `20260821200000_communication_center_c5_sms_native` |

### C5.2 (#1134) — pending deploy

| Object | Present on prod DB |
|--------|-------------------|
| `sms_webhook_events.processing_claimed_at` | **NO** (expected until #1134 migration applied) |

### OrgSmsConfig aggregates (prod)

| Metric | Count |
|--------|------:|
| Total configured orgs | 0 |
| Active | 0 |
| Connected | 0 |

**No `OrgSmsConfig` rows exist in production database.**

---

## 3. C5.2 credential model (authoritative — from PR #1134 code)

| Setting | Authority | Required outbound | Required webhook | VPS presence (2026-08-22) |
|---------|-----------|:-----------------:|:--------------:|---------------------------|
| API credential | **ENV** `SENT_DM_API_KEY` or `SENT_DM_API_KEY_<ORG_UUID>` | YES | NO | **MISSING** (0 per-org keys) |
| API base URL | **ENV** `SENT_DM_API_BASE_URL` → config `sms.apiBaseUrl` | YES | NO | **DEFAULTED** (`https://api.sent.dm` when unset) |
| Request timeout | **ENV** `SENT_DM_REQUEST_TIMEOUT_MS` | YES | NO | **DEFAULTED** (30000 ms) |
| Sandbox default | **ENV** `SENT_DM_SANDBOX=true` → `sms.sandboxMode`; per-send body `sandbox` also supported | Optional | NO | **MISSING** (defaults false) |
| sent.dm account ID | **DB** `OrgSmsConfig.sentDmAccountId` | YES (readiness) | YES (`payload.account_id` binding) | **MISSING** (no rows) |
| Sender profile ID | **DB** `OrgSmsConfig.senderProfileId` → HTTP `x-profile-id` | YES | NO | **MISSING** |
| Webhook endpoint ID | **DB** `OrgSmsConfig.webhookEndpointId` → authoritative `X-Webhook-ID` tenant routing | NO | YES | **MISSING** |
| API key configured flag | **DB** `OrgSmsConfig.apiKeyConfigured` + ENV must resolve | YES | NO | N/A |
| Webhook signing secret flag | **DB** `OrgSmsConfig.webhookSigningSecretConfigured` + ENV must resolve | NO | YES | N/A |
| Webhook signing secret | **ENV** `SENT_DM_WEBHOOK_SIGNING_SECRET` or `SENT_DM_WEBHOOK_SIGNING_SECRET_<ORG_UUID>` | NO | YES | **MISSING** (0 per-org keys) |
| SMS runtime gate | **ENV** `COMMUNICATION_CENTER_SMS_ENABLED=true` | YES | YES (`SmsWebhookProcessorService`) | **MISSING** |
| SMS canonical projection | **ENV** `COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED=true` OR global `COMMUNICATION_CENTER_PROJECTION_ENABLED=true` | For `MESSAGE_*` events | For `MESSAGE_*` events | **MISSING** |
| Provider idempotency key | **DERIVED** `sdm_{sha256(orgId:businessOperationId)}` | YES | NO | N/A (computed at runtime) |
| Webhook external event id | **DERIVED** `message_id` + `message_status` | NO | YES (dedupe) | N/A |

**Secret storage rule:** DB holds metadata flags and sent.dm UUIDs only — never raw API keys or signing secrets.

---

## 4. Feature flags (current VPS — not changed)

| Flag | Current on VPS | First-test target |
|------|----------------|-------------------|
| `COMMUNICATION_CENTER_SMS_ENABLED` | MISSING (off) | `true` (global gate; runtime still requires per-org `OrgSmsConfig`) |
| `COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED` | MISSING | `true` |
| `COMMUNICATION_CENTER_PROJECTION_ENABLED` | MISSING | `true` (optional global enable) |
| Automatic SMS producers | **None in codebase** | Must remain OFF |

SMS runtime is **globally gated** by `COMMUNICATION_CENTER_SMS_ENABLED` plus per-org `OrgSmsConfig` readiness — there is no separate per-org runtime env flag.

---

## 5. Test organization

| Candidate | Assessment |
|-----------|------------|
| `Voice Staging E2E (Internal)` | Exists in DB (`ACTIVE`, `RENTAL`). **No** `OrgSmsConfig`. **No** WhatsApp config. **No** memberships returned in read-only query. |

**Conclusion:** **TEST ORG REQUIRED** for SMS — either configure an existing internal org or create a dedicated staging org with `OrgSmsConfig` (out of scope for this preflight).

---

## 6. Auth / RBAC preflight (from #1134 code — not exercised)

| Item | Value |
|------|-------|
| Send endpoint | `POST /api/v1/organizations/:orgId/sms/messages` |
| Config endpoint | `GET /api/v1/organizations/:orgId/sms/config` |
| Auth | Standard SynqDrive session (Clerk bearer) + `OrgScopingGuard` |
| Permission | `@RequireCommunicationPermission('write')` → `communication.write` via `PermissionsGuard` |
| Idempotency | **Required** header `Idempotency-Key` (max 128 chars) → `businessOperationId` |
| Request DTO | `{ recipient, content, customerId?, bookingId?, vehicleId? }` — no public `actorType` / `sandbox` |
| Expected responses | `accepted`, `in_progress`, `idempotency_expired`, `already_terminal`, `blocked`, `idempotency_conflict` (409) |

**Test principal:** **MISSING** — no verified `communication.write` membership on a candidate SMS test org.

---

## 7. Public webhook URL (post-#1134)

| Item | Value |
|------|-------|
| Route (code) | `POST /webhooks/sentdm` → global prefix → **`POST /api/v1/webhooks/sentdm`** |
| Expected public URL | `https://app.synqdrive.eu/api/v1/webhooks/sentdm` |
| TLS | **OK** |
| Reverse proxy routing | **OK** (all paths proxy to backend :3001) |
| Current reachability | **404** until #1134 deployed |
| sent.dm must send | `X-Webhook-ID` = `OrgSmsConfig.webhookEndpointId`, signature headers, JSON body |

---

## 8. Raw body support (post-#1134)

| Check | Status |
|-------|--------|
| Nest bootstrap `rawBody: true` | **Present on deployed `main`** (`backend/src/main.ts`) |
| JSON/urlencoded `verify` captures `req.rawBody` | **Present** |
| sent.dm controller | **Strict** — requires `Buffer` `req.rawBody`; returns `400 MISSING_RAW_BODY` otherwise |
| Stripe / Resend / Voice / WhatsApp / DIMO | Existing patterns preserved; sent.dm is additive controller on #1134 |
| Risk to existing webhooks | **Low** — no change to existing webhook controllers on this preflight |

---

## 9. sent.dm provider configuration (required before live test)

From official sent.dm docs + C5.2 implementation:

1. **API key** — dashboard-generated; inject into VPS env (global or per-org).
2. **Sender profile** (`x-profile-id`) — store UUID in `OrgSmsConfig.senderProfileId`.
3. **Account ID** — store in `OrgSmsConfig.sentDmAccountId` (matches webhook `payload.account_id`).
4. **Webhook endpoint** — register in sent.dm pointing to `https://app.synqdrive.eu/api/v1/webhooks/sentdm`.
5. **Webhook signing secret** — configure in sent.dm; store in env; set `webhookSigningSecretConfigured=true`.
6. **Webhook endpoint UUID** — sent.dm assigns; store as `OrgSmsConfig.webhookEndpointId` (this is `X-Webhook-ID`).
7. **Event subscription** — delivery lifecycle events (`message.sent`, `message.delivered`, `message.failed`, inbound `message.received` as needed).
8. **Sandbox** — optional for first connectivity: `"sandbox": true` in request body OR `SENT_DM_SANDBOX=true` / adapter default (see §10).

**Not automated in this repo for production** — manual sent.dm dashboard + VPS env + DB row setup required.

---

## 10. Sandbox / billing (official sent.dm documentation)

| Question | Answer |
|----------|--------|
| Sandbox available? | **YES** — `"sandbox": true` JSON boolean in supported mutation bodies |
| Actual delivery? | **NO** — sandbox validates only; nothing queued/sent; `X-Sandbox: true` response header |
| Billable? | **NO** — docs state sandbox validates without incurring charges |
| Live send without sandbox? | **YES** — billable per usage-based pricing when sandbox is off |

**Note:** Sandbox does **not** exercise downstream delivery webhooks realistically. First SynqDrive E2E with real webhooks requires a **live** (non-sandbox) send with a controlled recipient — plan accordingly.

---

## 11. Test recipient

| Item | Status |
|------|--------|
| `SENT_DM_TEST_RECIPIENT` on VPS | **MISSING** |
| Dedicated controlled recipient configured | **REQUIRED** |

Do not use production customer numbers. Operator must provide/configure one dedicated test MSISDN before live validation.

---

## 12. Safe observability (for use **after** eventual send — not executed here)

### Backend logs (VPS)

```bash
# As root on VPS — do not pipe to public channels
sudo pm2 logs synqdrive --lines 200
```

SMS structured logs include `organizationId`, `messageId`, `providerMessageId`, `eventType` — **not** phone/body/secrets (per C5.2 PII boundary).

### Database (read-only verification queries)

```sql
-- Native outbound row (no content/phone columns selected)
SELECT id, status, provider_message_id, business_operation_id, accepted_at, delivered_at
FROM sms_messages
WHERE organization_id = '<TEST_ORG_UUID>'
ORDER BY created_at DESC LIMIT 5;

-- Canonical projection
SELECT id, event_type, occurred_at, idempotency_key
FROM communication_events
WHERE organization_id = '<TEST_ORG_UUID>' AND channel = 'SMS'
ORDER BY occurred_at DESC LIMIT 10;

-- Webhook dedupe / lease state (no payload stored)
SELECT external_event_id, event_type, processed_at, processing_error, processing_claimed_at
FROM sms_webhook_events
WHERE organization_id = '<TEST_ORG_UUID>'
ORDER BY created_at DESC LIMIT 10;
```

### SynqDrive E2E script (opt-in, post-deploy)

`backend/scripts/test/synqdrive-sms-runtime-e2e.integration.sh` with `SYNQDRIVE_SMS_E2E_VALIDATION=1` — requires auth token and test org/recipient supplied by operator.

### Provider connectivity smoke (direct sent.dm only — does **not** validate SynqDrive stack)

`backend/scripts/test/sentdm-sms-live.integration.sh` with `SENT_DM_LIVE_INTEGRATION=1`.

---

## 13. Deployment sequence (after #1134 merge — **do not run now**)

Adapted to actual VPS architecture (`cloud-agent-deploy.sh` → `vps-deploy-release.sh`):

1. Merge PR #1134 to `main`.
2. `git push origin main`.
3. `bash .cursor/scripts/cloud-agent-deploy.sh` (or manual SSH invoke of `vps-deploy-release.sh`).
4. Deploy script automatically:
   - Pre-deploy `pg_dump` backup to `/opt/synqdrive/shared/backups/`
   - Shallow clone `main` to `/opt/synqdrive/releases/<timestamp>_v4994`
   - Link `backend.env`, `frontend.env`, uploads
   - `npm ci`, `prisma generate`, **`prisma migrate deploy`** (applies C5.2 `processing_claimed_at`)
   - Backend + frontend build, boot check, PM2 restart
   - Health check `http://127.0.0.1:3001/api/v1/health`
5. Verify public health: `https://app.synqdrive.eu/api/v1/health`.
6. Verify webhook route exists (expect **400** `MISSING_RAW_BODY`, not **404**): `POST /api/v1/webhooks/sentdm`.
7. **Keep** `COMMUNICATION_CENTER_SMS_ENABLED` unset/false until credentials configured.
8. Add sent.dm secrets to `/opt/synqdrive/shared/backend.env` (never commit):
   - `SENT_DM_API_KEY` or `SENT_DM_API_KEY_<ORG_UUID>`
   - `SENT_DM_WEBHOOK_SIGNING_SECRET` or per-org variant
   - Optional: `SENT_DM_API_BASE_URL`, `SENT_DM_SANDBOX`, projection flags
9. `pm2 restart synqdrive --update-env` (after env edits only — **not done in this preflight**).
10. Insert/update `OrgSmsConfig` for test org (account, sender profile, webhook endpoint UUID, flags).
11. Configure sent.dm webhook URL + signing secret to match step 10.
12. Set `COMMUNICATION_CENTER_SMS_ENABLED=true` and projection flags; restart backend.
13. Confirm no automatic SMS producers (code has none).
14. Assign `communication.write` to operator test user on test org.
15. Execute **one** E2E send via authenticated API or `synqdrive-sms-runtime-e2e.integration.sh`.
16. Inspect native + canonical + webhook tables (§12).
17. Optionally disable `COMMUNICATION_CENTER_SMS_ENABLED` after test.

---

## 14. Rollback plan

| Action | Procedure |
|--------|-----------|
| Stop provider sends | Set `COMMUNICATION_CENTER_SMS_ENABLED=false`; `pm2 restart synqdrive --update-env` |
| Disable test org | `OrgSmsConfig.isActive=false` / `isConnected=false` |
| Preserve data | **Do not** delete `sms_*` or `communication_events` rows |
| Webhook events | Retained for audit/replay (`sms_webhook_events`) |
| C5.2 migration | **Additive** (`processing_claimed_at` nullable) — prefer forward-safe disable over DB rollback |
| Code rollback | Redeploy previous `main` release via standard VPS deploy (DB migration remains applied) |

---

## 15. GO / NO-GO matrix

| Gate | Status |
|------|--------|
| C5.2 code (PR #1134) | **READY** (draft; review-complete from implementation) |
| CI | **BLOCKED** — PR checks show `Typecheck` fail (2 workflows) and `Backend unit tests` fail (1 workflow); other jobs pass incl. migration tests |
| VPS deployment architecture | **READY** (standard release + PM2 + nginx verified) |
| C5.1 migration deployed | **YES** |
| C5.2 migration pending | **YES** (`processing_claimed_at` not on prod DB) |
| C5.2 runtime deployed | **NO** (commit `9fc26928` / `main`) |
| sent.dm API credential | **MISSING** |
| sent.dm sender/profile | **MISSING** (no `OrgSmsConfig`) |
| sent.dm account | **MISSING** |
| webhook signing | **MISSING** |
| webhook public route | **BLOCKED** (404 until #1134 deploy) |
| test org | **MISSING** (no `OrgSmsConfig`; staging org not SMS-ready) |
| communication.write test principal | **MISSING** |
| test recipient | **MISSING** |
| safe observability | **READY** (queries/logging patterns defined; PII boundaries in code) |

---

## 16. Stop conditions triggered

- #1134 **not deployed** — webhook route and `SmsModule` absent on VPS.
- **All sent.dm credentials missing** on VPS env.
- **Zero `OrgSmsConfig` rows** — no tenant wired for SMS.
- **No SMS-ready test org** or `communication.write` principal verified.
- **Test recipient not configured**.
- **CI not fully green** on PR #1134 (typecheck/unit failures).

---

## 17. Next action (operator)

1. Resolve PR #1134 CI failures (typecheck + unit tests).
2. Merge #1134 to `main` when approved.
3. Deploy to VPS per §13.
4. Provision sent.dm account, sender profile, API key, webhook endpoint + signing secret.
5. Create/configure internal test org `OrgSmsConfig` row (non-customer tenant).
6. Grant `communication.write` to operator test user.
7. Provide dedicated test recipient MSISDN.
8. Enable runtime + projection flags; execute **one** controlled E2E send.
9. Use §12 observability queries to verify native + canonical + webhook convergence.

---

## Document control

- **Changes:** This preflight report added under C5.2 live-validation preparation.
- **Architektur:** No architecture change — read-only operational assessment.
- **Secrets:** None stored in this document.
