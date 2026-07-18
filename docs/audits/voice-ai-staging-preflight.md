# Voice AI Staging Preflight (Prompt 9A)

**Generated:** 2026-07-18  
**Repository:** SYNQDRIVE-alpha  
**Scope:** Secure secret references, staging organisation, policy gates, read-only probes — **no number purchase, no agent deploy, no live calls.**

## Decision

| Field | Value |
|-------|-------|
| **Provisioning GO/NO-GO** | **NO-GO** |
| **Safe for secret wiring** | Yes (documented below) |
| **Safe for staging org bootstrap** | Yes (script ready; run after deploy) |
| **Safe for real Voice provisioning** | **No** — blockers remain |

## Staging organisation (masked)

| Attribute | Value |
|-----------|-------|
| Organisation ID | `org-vo…-e2e` |
| Short code | `VOICE-STAGING-E2E` |
| Display name | Voice Staging E2E (Internal) |
| Rollout reference | `rollout:STAGING` |
| Customer data | Synthetic only (`staging-synthetic-*`) |
| DB status (VPS prod host) | **Bootstrapped** (`org-vo…-e2e`, short code `VOICE-STAGING-E2E`) |

Bootstrap creates: DRAFT `VoiceAssistant` (telephony off), TRIAL `VoiceSubscription`, budget policy (500¢/month, 100¢/day, 300s max, concurrency 1, DE only), synthetic customer/vehicle/booking; disables org voice automations (`enabled=false`).

## Secret reference status (VPS `backend.env`)

Presence only — **no values recorded**.

| Reference | Presence | Scope | Rotation / revoke |
|-----------|----------|-------|-------------------|
| `ELEVENLABS_API_KEY` | present | ElevenLabs workspace API | Rotate in ElevenLabs console → sync `backend.env` |
| `ELEVENLABS_WEBHOOK_SECRET` | **absent** | Post-call HMAC | Rotate in ElevenLabs webhook settings |
| `VOICE_MCP_TOKEN_SECRET` | **absent** | MCP bearer JWT signing | Dedicated staging secret; rotate independently from `JWT_SECRET` |
| `TWILIO_ACCOUNT_SID` | present | Parent control-plane (IE1) | Twilio console → sync keys |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | present | REST SDK (IE1) | Rotate API key in Twilio |
| `TWILIO_AUTH_TOKEN` | present | Webhook signature validation | Twilio console; invalidates old signatures |
| `TWILIO_VOICE_WEBHOOK_BASE_URL` | present | Public webhook base | Must match deployed API host |
| `VOICE_STAGING_SUBACCOUNT_SECRET_REF` | absent (expected pre-provision) | Post-provision subaccount | Populate after subaccount step — `env-json://` ref only |

## Region / edge

| Setting | VPS value |
|---------|-----------|
| `TWILIO_REGION` | `ie1` |
| `TWILIO_EDGE` | `dublin` |
| Public webhook base | `https://app.synqdrive.eu` |

Credential scope: parent Twilio account keys on host; tenant subaccount ref **after** provisioning only.

## Staging policies

| Policy | Required for staging | VPS at audit |
|--------|---------------------|--------------|
| `VOICE_NATIVE_TWILIO_INTEGRATION` | `true` (global prep) | **unset** |
| `VOICE_MCP_GATEWAY` | `true` (global prep) | **unset** |
| `VOICE_AI_PROVISIONING_STAGING_ENABLED` | `true` | **unset** |
| `VOICE_WEBHOOK_INGESTION_ENABLED` | `true` | present |
| `VOICE_AI_SUBACCOUNTS` | `true` | **unset** |
| `VOICE_E2E_ORG_ID` | `org-voice-staging-e2e` | **unset** |
| `VOICE_E2E_ALLOW_LIVE_CALLS` | `false` | **unset** (defaults safe) |
| `VOICE_LEGACY_DIAGNOSTIC_CALLS` | `false` | **unset** (defaults safe) |
| Tenant rollout | `rollout:STAGING` | pending bootstrap |
| Outbound countries | DE only (budget policy) | pending bootstrap |
| Test E.164 allowlist | `VOICE_E2E_ALLOWLIST_E164` | **unset** |
| Monthly / daily budget | 500¢ / 100¢ | pending bootstrap |
| Max call duration | 300s | pending bootstrap |
| Concurrency | 1 | pending bootstrap |
| Production automations | disabled for staging org | pending bootstrap |

Template: `backend/.env.voice-staging.example`

## Preflight probes (no live call)

| Probe | Result | Detail |
|-------|--------|--------|
| Backend startup validation | warn | Missing staging-only secrets for current flags |
| Twilio IE1 auth (read-only) | pass | Parent credentials configured; region=ie1, edge=dublin |
| ElevenLabs auth (read-only) | pass | API key configured |
| MCP token mint/verify | skip | `VOICE_MCP_TOKEN_SECRET` absent |
| Replay / foreign-org rejection | n/a | Covered in unit tests when secret present |
| Webhook signature verification | pass | Unsigned POST → HTTP 401 (expected) |
| Public webhook reachability | pass | `GET /api/v1/health` → 200 |
| Queue / worker | skip | `REDIS_URL` not in audited env file |
| Database | pass | Connectivity OK |
| Staging org | pass | Bootstrapped with synthetic data |
| Provider health | pass | Twilio + ElevenLabs read-only checks OK |

Automated suite: `bash backend/scripts/ops/voice-staging-preflight.sh`  
Runtime JSON: `cd backend && npm run voice:staging:probes`

## Remaining blockers (NO-GO)

1. `ELEVENLABS_WEBHOOK_SECRET` not on host (required when webhook ingestion enabled).
2. `VOICE_MCP_TOKEN_SECRET` not on host (required when MCP gateway enabled).
3. Global staging flags unset: `VOICE_AI_PROVISIONING_STAGING_ENABLED`, `VOICE_NATIVE_TWILIO_INTEGRATION`, `VOICE_MCP_GATEWAY`, `VOICE_AI_SUBACCOUNTS`, `VOICE_E2E_ORG_ID`.
4. `VOICE_E2E_ALLOWLIST_E164` not configured for future manual canary.
5. `VOICE_STAGING_SUBACCOUNT_SECRET_REF` — expected absent until post-provision step.
6. Bootstrap + probe scripts deploy with next release (not on VPS at audit commit).

## Rotation and revoke (operations)

| Asset | Action |
|-------|--------|
| ElevenLabs API / webhook | Console rotate → update `backend.env` → PM2 restart → re-run probes |
| MCP token secret | Generate new secret → update host → invalidates outstanding MCP tokens |
| Twilio parent keys | Twilio console revoke old API key after new key synced |
| Twilio auth token | Rotate in console; update host; unsigned webhooks rejected until sync |
| Subaccount ref | Set only after provisioning; revoke via Twilio subaccount closure |

## Scripts and references

| Artifact | Purpose |
|----------|---------|
| `backend/scripts/ops/voice-staging-org-bootstrap.ts` | Idempotent staging org + synthetic data |
| `backend/scripts/ops/voice-staging-preflight-probes.ts` | Runtime probe JSON (no secret values) |
| `backend/src/modules/voice-assistant/staging/voice-staging-preflight.util.ts` | Secret/policy/GO-NO-GO evaluation |
| `backend/.env.voice-staging.example` | Staging policy template |
| `backend/scripts/ops/twilio-webhook-reachability.sh` | Unsigned webhook probe (401 = pass) |

## Explicit non-actions (Prompt 9A)

- No phone number purchased  
- No ElevenLabs agent created  
- No PSTN call started  

## Next steps toward GO

1. Merge and deploy this preflight commit to VPS.
2. Apply `backend/.env.voice-staging.example` keys via secure `backend.env` sync (secrets in Cursor Runtime Secrets / VPS only).
3. Run `VOICE_STAGING_BOOTSTRAP_ALLOW_PROD=1 npm run voice:staging:bootstrap -- --apply` on host.
4. Re-run `npm run voice:staging:probes` — expect GO when secrets + flags + org present and live calls remain `false`.
