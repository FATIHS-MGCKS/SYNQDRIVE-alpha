# Voice AI — Native ElevenLabs-Twilio Call Orchestration (2026-07-17)

| Field | Value |
|-------|-------|
| **Status** | **IMPLEMENTED (Prompt 7B)** |
| **Date** | 2026-07-17 |
| **Prerequisite** | Webhook ingestion (7A), MCP gateway (6A/6B), EL import provisioning |
| **ADR** | `architecture/VOICE_AI_PRODUCTION_ARCHITECTURE_ADR_2026-07-17.md` Phase 3B |

---

## 1. Purpose

Replace productive `LEGACY_TWIML_SAY` placeholder telephony with native ElevenLabs-Twilio orchestration while keeping explicit diagnostic fallback and staging-only live provider calls.

---

## 2. Inbound

| Step | Behavior |
|------|----------|
| Readiness | `GET .../voice-assistant/calls/inbound-readiness` — phone `ASSIGNED` in EL, active deployment, MCP URL when flagged |
| PSTN routing | Imported Twilio numbers route via ElevenLabs (SynqDrive Twilio voice webhook = misconfiguration fallback message) |
| Conversation | Created/correlated from provider events (7A pipeline), not legacy TwiML metadata |
| Suspended assistant | Safe fallback TwiML (`assistant_fallback` route) |
| Legacy diagnostic | `VOICE_LEGACY_DIAGNOSTIC_CALLS=true` only — separate from productive AI metrics |

---

## 3. Outbound

| Step | Behavior |
|------|----------|
| API | `POST .../voice-assistant/calls/outbound` — `{ to, idempotencyKey, customerId?, bookingId? }` |
| Policy | Subscription ACTIVE, budget hard-stop, country allowlist, emergency blocklist |
| Caller ID | Resolved from org `VoicePhoneNumber` — **never** from client body |
| Provider | `ElevenLabsProviderAdapter.startOutboundCall` → `/convai/twilio/outbound-call` |
| Staging gate | Live provider call requires `VOICE_AI_PROVISIONING_STAGING_ENABLED=true`; otherwise dry-run conversation row |
| Idempotency | `metadata.outboundIdempotencyKey` per org |
| MCP | Short-lived token issued on live outbound start when `VOICE_MCP_GATEWAY` enabled |

Legacy `POST .../twilio/outbound-call` — admin-only, `VOICE_LEGACY_DIAGNOSTIC_CALLS` + staging, blocked when native integration enabled.

---

## 4. Feature flags

| Flag | Default | Role |
|------|---------|------|
| `VOICE_NATIVE_TWILIO_INTEGRATION` | `false` | Alias: `VOICE_AI_NATIVE_TELEPHONY` |
| `VOICE_MCP_GATEWAY` | `false` | Alias: `VOICE_AI_MCP_GATEWAY_ENABLED` |
| `VOICE_LEGACY_DIAGNOSTIC_CALLS` | `false` | Explicit Twilio Say diagnostic only |
| `VOICE_AI_PROVISIONING_STAGING_ENABLED` | `false` | Live EL/Twilio provider mutations |

---

## 5. Lifecycle

- Native conversations use `buildElevenLabsConversationMetadata` / `ELEVENLABS_NATIVE_TWILIO`
- Twilio terminal status does **not** set `RESOLVED` on native rows — post-call authority only
- `FAILED` / `ABANDONED` for no-answer, busy, failed; `FINALIZED` via post-call processing

---

## 6. Module

`backend/src/modules/voice-call-orchestration/`

- `VoiceCallOrchestrationService` — inbound route resolution, outbound orchestration, MCP bind
- `VoiceCallPolicyService` — entitlement, budget, destination controls
- `TwilioVoiceBridgeService` — delegates to orchestration (no productive Say by default)

Agent deploy pushes MCP gateway URL via `updateToolsConfiguration` when `VOICE_MCP_GATEWAY` enabled.

---

## 7. Not in scope

- Uncontrolled production call start (staging flag required)
- Billing finalization
- Operator UI wizard (ADR 7B UI track)
