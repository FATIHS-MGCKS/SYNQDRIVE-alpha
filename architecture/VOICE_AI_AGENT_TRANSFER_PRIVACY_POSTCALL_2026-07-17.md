# Voice AI — Transfer, Privacy & Post-Call Configuration (2026-07-17)

| Field | Value |
|-------|-------|
| **Status** | **IMPLEMENTED (Prompt 5B)** |
| **Date** | 2026-07-17 |
| **Prerequisite** | Prompt 5A versioned deployments |
| **ADR** | `architecture/VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` |

---

## 1. Purpose

Extend canonical `CanonicalAgentConfig` with org-safe transfer, fallback, privacy/retention, and signed post-call webhook settings. Deployment readiness blocks activation when escalation or webhook prerequisites are missing.

No new webhook ingestion route in 5B — canonical webhook URL is derived server-side only.

---

## 2. Canonical extensions

### Transfer (`transfer`)

| Field | Notes |
|-------|-------|
| `rules[]` | Condition + org-bound target (`PHONE`, `STAFF_USER`, `STAFF_GROUP`, `STATION`) |
| `transferType` | `conference` (warm/default) or `blind` (native Twilio only) |
| `respectBusinessHours` | Per-rule business-hour gate |
| `maxWaitSeconds` | 5–600 seconds |
| `loopProtectionEnabled` | Prevents forwarding to inbound assistant numbers / duplicate targets |
| `maxTransferHops` | 1–5 |

Org-bound validation uses `Station`, `OrganizationMembership`, `OrganizationRole`, `VoiceAssistant.escalationPhone`, and `VoicePhoneNumber` digests.

### Fallback (`fallback`)

| Field | Notes |
|-------|-------|
| `recordCallback` | Offer callback capture on failed transfer |
| `createSupportCase` | Internal support-case intent (no auto task creation in 5B) |
| `standardAnnouncement` | Safe default caller message |
| `controlledEndCall` | Require explicit next steps before hangup |
| `avoidFalseSuccessStatus` | Prevent false success claims |

### Privacy (`privacyRetention`)

| Field | Default | Notes |
|-------|---------|-------|
| `recordAudio` | `false` | Explicit opt-in required |
| `retentionAudioDays` | `null` | Separate retention lanes |
| `retentionTranscriptDays` | `90` | |
| `retentionSummaryDays` | `90` | |
| `retentionProviderPayloadDays` | `30` | |
| `consentNoticeText` | `null` | Warning if missing |
| `masterAdminContentAccess` | `false` | Master admin has no default content access |

### Post-call (`postCall`)

| Field | Source |
|-------|--------|
| `version` | `VOICE_POST_CALL_CONFIG_VERSION` (currently `1`) |
| `webhookPath` | `/api/v1/webhooks/elevenlabs/post-call/:orgId` |
| `webhookUrl` (runtime only) | `TWILIO_VOICE_WEBHOOK_BASE_URL` or `APP_URL` + path |
| `signatureRequired` | `true` — requires `ELEVENLABS_WEBHOOK_SECRET` |
| `enableTranscript/Summary/Outcome/Analysis` | Separate toggles |
| `sendAudio` | Linked to `privacyRetention.recordAudio` |

Tenant APIs cannot submit `webhookUrl` or provider secrets.

---

## 3. Readiness (`GET .../agent-deployment/readiness`)

| Level | Check |
|-------|-------|
| Blocker | Mandatory escalation without resolvable org transfer target |
| Blocker | Missing public base URL for canonical webhook |
| Blocker | Missing `ELEVENLABS_WEBHOOK_SECRET` when signatures required |
| Blocker | Missing fallback announcement on deploy |
| Warning | Missing consent notice text |
| Warning | No retention windows configured |
| Warning | Audio recording enabled |

Deploy (`POST .../deploy`) re-runs readiness and rejects when blockers exist.

---

## 4. ElevenLabs alignment (read-only)

- Transfer types follow official `transfer_to_number` tool: `conference` (warm) and `blind` (native Twilio only).
- Post-call webhooks use HMAC `ElevenLabs-Signature` (`t=...,v0=...`) per ElevenLabs docs — secret stored server-side only.

---

## 5. Validation

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| Agent deployment unit tests | Pass |
