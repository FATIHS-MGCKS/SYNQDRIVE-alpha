# Voice AI — Unified Webhook Ingestion & Event Correlation (2026-07-17)

| Field | Value |
|-------|-------|
| **Status** | **IMPLEMENTED (Prompt 7A)** |
| **Date** | 2026-07-17 |
| **Migration** | `20260717230000_voice_webhook_ingestion_correlation` |
| **Prerequisite** | MCP gateway (6A/6B), `VoiceProviderWebhookEvent` (2B) |
| **ADR** | `architecture/VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` Phase 5/7 |

---

## 1. Purpose

Canonical, tenant-safe ingestion for Twilio call status, ElevenLabs post-call/conversation webhooks, MCP tool execution events, and internal conversation lifecycle events. Fast HTTP ack, async BullMQ processing, idempotent persistence, correlation keys, and monotonic lifecycle state machine.

---

## 2. Ingress routes

| Source | Route / trigger | Auth |
|--------|-----------------|------|
| Twilio voice/status | Existing `/api/v1/webhooks/twilio/*` | `X-Twilio-Signature` + public URL behind proxy |
| ElevenLabs post-call | `POST /api/v1/webhooks/elevenlabs/post-call/:orgId` | `ElevenLabs-Signature` HMAC |
| ElevenLabs conversation | `POST /api/v1/webhooks/elevenlabs/conversation/:orgId` | Same |
| MCP tool execution | Internal via `VoiceInternalEventIngestService` | Org-scoped service call |
| Internal conversation | Internal lifecycle helper | Org-scoped service call |

Legacy `TwilioWebhookEvent` writes remain additive during canary.

---

## 3. Persistence (`VoiceProviderWebhookEvent`)

Extended with correlation FKs and processing metadata:

- `voiceConversationId`, `twilioCallSid`, `elevenLabsConversationId`, `agentDeploymentId`, `phoneNumberId`
- `customerId` / `bookingId` only after secure tool-audit correlation
- `status`: `RECEIVED` → `QUEUED` → `PROCESSED` | `FAILED` | `DEAD_LETTER`
- `errorClass`, `retryCount`, `payloadHash`, `redactedPayload`
- Unique: `@@unique([provider, externalEventId])`

---

## 4. Queue

- Queue: `voice.webhook.process` (BullMQ)
- Producer: `VoiceWebhookQueueProducer` — deterministic `jobId` per event
- Processor: `VoiceWebhookProcessor` in `WorkersModule`
- Retry: exponential backoff, max 5 attempts → `DEAD_LETTER`
- Replay: `POST /organizations/:orgId/voice-assistant/webhook-events/:eventId/replay` (ORG_ADMIN+)

---

## 5. Lifecycle state machine

`VoiceConversation.lifecycleState` (separate from `status` / `outcome`):

```
CREATED → QUEUED → INITIATED → RINGING → CONNECTED → AI_ACTIVE → TRANSFERRING
  → COMPLETED → PROCESSING → FINALIZED
Terminal: FAILED, CANCELLED
```

Resolver: `VoiceConversationLifecycleService` — monotonic transitions only; Twilio status cannot regress AI_ACTIVE; post-call authority for transcript/summary/finalized.

---

## 6. Security

- Invalid signatures → `401` (no success body)
- Payload cap: 256 KiB
- PII redaction before persistence
- Cross-tenant correlation rejected (`TENANT_MISMATCH`)
- Feature flag: `VOICE_WEBHOOK_INGESTION_ENABLED` (default on; set `false` to disable)

---

## 7. Module layout

`backend/src/modules/voice-webhook-ingestion/`

| Service | Role |
|---------|------|
| `VoiceWebhookIngestService` | Persist + enqueue |
| `VoiceWebhookProcessingService` | Async lifecycle apply |
| `VoiceWebhookCorrelationService` | Resolve org/conversation keys |
| `VoiceConversationLifecycleService` | State machine |
| `VoiceWebhookReplayService` | Privileged replay |
| `VoiceInternalEventIngestService` | MCP + internal events |

---

## 8. Not in scope (7A)

- Live PSTN bridge
- Billing finalization
- Operator UI for webhook diagnostics

---

## 9. Rollback / production gating

- Revert migration `20260717230000_voice_webhook_ingestion_correlation`; set `VOICE_WEBHOOK_INGESTION_ENABLED=false`.
- **Production default (2026-07-18):** ingestion is **off** unless `VOICE_WEBHOOK_INGESTION_ENABLED=true` **and** `ELEVENLABS_WEBHOOK_SECRET` + `TWILIO_AUTH_TOKEN` are configured (`VoiceSecretsStartupService`).
