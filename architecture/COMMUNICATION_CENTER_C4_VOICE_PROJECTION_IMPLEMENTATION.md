# Communication Center C4 — Voice Projection Implementation Record

**Phase:** C4 (Twilio + ElevenLabs Voice → canonical Communication projection)  
**Date:** 2026-08-21  
**Branch:** `feature/communication-center-c4-voice-projection`  
**Depends on:** C1 persistence, C2 normalization, C3 WhatsApp projection patterns, C0.2 RBAC

---

## 1. Scope

C4 wires the **existing** Voice runtime (Twilio telephony + ElevenLabs conversational AI + native `VoiceConversation`) into canonical Communication persistence as a **best-effort operational projection**:

- `TwilioVoiceCommunicationAdapter` — telephony lifecycle normalization
- `ElevenLabsVoiceCommunicationAdapter` — tool actions, call end, escalation, resolution (no fabricated AI intent)
- `VoiceCommunicationProjectionIntegration` — feature flag, dispatch, failure isolation
- Minimal attachment points in webhook processing, outbound orchestration, MCP tool orchestrator

**Not in scope:** Communication Center UI, dashboard, C5, C6 context resolver, C11 full handoff state machine, historical backfill (C4.2), SMS, sent.dm, Prisma schema changes, transcript/recording duplication.

---

## 2. Current Voice runtime trace

| Layer | Component | Role |
|-------|-----------|------|
| Ingress (Twilio) | `twilio-webhook.controller.ts` | Signature verify → `TwilioWebhookService` / unified ingest |
| Ingress (ElevenLabs) | `elevenlabs-webhook.controller.ts` | Signature verify → unified ingest |
| Ingest | `VoiceWebhookIngestService` | Dedupe → `VoiceProviderWebhookEvent` → BullMQ |
| Process | `VoiceWebhookProcessingService` | Correlation → `VoiceConversationLifecycleService.applyWebhookEvent` → **C4 projection hook** |
| Native authority | `VoiceConversation` (Prisma) | Lifecycle, outcome, transcript, escalation, metadata context |
| Tool audit | `VoiceToolExecution` | MCP tool lifecycle (RUNNING/SUCCEEDED/FAILED) |
| Outbound | `VoiceCallOrchestrationService` | **Real** outbound only: after `elevenLabs.startOutboundCall` succeeds → **C4 CALL_STARTED** (dry-run: zero projection) |
| Escalation (repair) | `VoiceMcpActionOrchestratorService` | `create_callback_request` → native escalation fields → **C4 HUMAN_REQUIRED** |

Provider identifiers (`twilioCallSid`, `elevenLabsConvId`) remain on native `VoiceConversation` and webhook events only — never as canonical `nativeConversationId`.

---

## 3. Twilio lifecycle

| Twilio status (native) | Canonical event | Source of truth |
|------------------------|-----------------|-----------------|
| Inbound webhook (`twilio.voice.inbound`) | `CALL_STARTED` (+ `initialStatus`) | Processed webhook after lifecycle persist |
| `initiated` / `ringing` / `queued` | *(skipped — sub-states of same milestone)* | — |
| `in-progress` / `answered` | `CALL_CONNECTED` | Processed webhook |
| `busy` / `no-answer` / `failed` / `canceled` | `CALL_FAILED` | Processed webhook |
| `completed` (ElevenLabs path) | *(skipped — ElevenLabs post-call owns CALL_ENDED)* | — |
| `completed` (legacy TwiML metadata) | `CALL_ENDED` | Processed webhook |
| Outbound provider acceptance | `CALL_STARTED` | `VoiceCallOrchestrationService` after `startOutboundCall` + native persist |
| Outbound dry-run | *(none)* | Dry-run creates native record only; **no canonical telephony events** |

Twilio transfer events do **not** emit duplicate `HUMAN_REQUIRED`; telephony transfer remains operational call lifecycle only.

---

## 4. ElevenLabs lifecycle

| Native source | Canonical event | Source of truth |
|---------------|-----------------|-----------------|
| `elevenlabs.conversation` active/in_progress | *(none in C4)* | **Deferred** — session active ≠ intent detected |
| `elevenlabs.post_call` | `CALL_ENDED` | Processed webhook (authoritative for native AI path) |
| Post-call + `outcome=RESOLVED` | `CONVERSATION_RESOLVED` | Processed webhook |
| `VoiceToolExecution` RUNNING | `AI_ACTION_STARTED` | MCP orchestrator after native persist |
| `VoiceToolExecution` SUCCEEDED | `AI_ACTION_COMPLETED` | MCP orchestrator |
| `VoiceToolExecution` FAILED | `AI_ACTION_FAILED` | MCP orchestrator |
| MCP webhook replay (`MCP_TOOL_EXECUTION`) | `AI_ACTION_*` | Processed webhook (synthetic execution from payload) |
| Escalation transition | `HUMAN_REQUIRED` | MCP orchestrator (`create_callback_request`) |

Transcript chunks are **not** projected. Full transcript remains on `VoiceConversation.transcript`.

---

## 5. Native Voice authority

| Concern | Authority |
|---------|-----------|
| Conversation identity | `VoiceConversation.id` → canonical `nativeConversationId` |
| Call SID / EL session ID | Native columns + webhook correlation only |
| Transcript / summary | `VoiceConversation` native fields |
| Recording URLs | Native metadata (unchanged; not projected) |
| Tool input/output | `VoiceToolExecution.redactedInput/Output` (not projected) |
| Outcome / escalation | `VoiceConversation.outcome`, `escalationReason`, `lifecycleState` |
| Operational context | `VoiceConversation.metadata` JSON (`customerId`, `bookingId`, etc.) |

---

## 6. Multi-provider canonical model

One `CommunicationConversation` per `VoiceConversation.id`:

- `channel = VOICE`
- `nativeConversationId = VoiceConversation.id`
- Events may carry `providerIdentity = TWILIO` or `ELEVENLABS` on the same envelope
- No provider-specific fields on `CommunicationConversation`

---

## 7. Twilio event mapping table

| Native source | Canonical event | Provider | Direction | Idempotency | Status patch | Metadata | Failure |
|---------------|-----------------|----------|-----------|-------------|--------------|----------|---------|
| Inbound accept | `CALL_STARTED` | TWILIO | INBOUND/OUTBOUND | `externalEventId` | `envelope.initialStatus` once | `providerLifecycleState` | Log + continue |
| initiated/ringing/queued | *(skipped)* | — | — | — | — | — | — |
| in-progress | `CALL_CONNECTED` | TWILIO | native direction | `externalEventId` | none | `providerLifecycleState` | Log + continue |
| busy/no-answer/failed/canceled | `CALL_FAILED` | TWILIO | native direction | `externalEventId` | none | `failureCode`, `outcomeCode`, `providerLifecycleState` | Log + continue |
| completed (legacy TwiML) | `CALL_ENDED` | TWILIO | native direction | `externalEventId` | none | `durationSeconds`, `outcomeCode` | Log + continue |
| Outbound live (post provider accept) | `CALL_STARTED` | TWILIO | OUTBOUND | `outbound:{id}:started` | `initialStatus` | `providerLifecycleState` | Log + continue |
| Outbound dry-run | *(none)* | — | — | — | — | — | — |

---

## 8. ElevenLabs event mapping table

| Native source | Canonical event | Provider | Direction | Idempotency | Status patch | Metadata | Failure |
|---------------|-----------------|----------|-----------|-------------|--------------|----------|---------|
| AI session active | *(deferred — no truthful native intent signal in C4)* | — | — | — | — | — | — |
| Post-call finalize | `CALL_ENDED` | ELEVENLABS | native direction | `{externalEventId}:ended` | none | `durationSeconds`, `outcomeCode` | Log + continue |
| Resolved outcome | `CONVERSATION_RESOLVED` | ELEVENLABS | native direction | `{externalEventId}:resolved` | `RESOLVED` | `outcomeCode` | Log + continue |
| Escalation transition | `HUMAN_REQUIRED` | ELEVENLABS | INTERNAL | `voice-human:{id}:{updatedAt}` | `HUMAN_REQUIRED` | `handoffReasonCode` | Log + continue |
| Tool start | `AI_ACTION_STARTED` | ELEVENLABS | INTERNAL | `voice-tool:{execId}:ai_action_started` | none | `toolName`, `actionName` | Log + continue |
| Tool success | `AI_ACTION_COMPLETED` | ELEVENLABS | INTERNAL | `voice-tool:{execId}:ai_action_completed` | none | `toolName`, `actionName` | Log + continue |
| Tool failure | `AI_ACTION_FAILED` | ELEVENLABS | INTERNAL | `voice-tool:{execId}:ai_action_failed` | none | `toolName`, `failureCode` | Log + continue |

---

## 9. Initial status semantics

`envelope.initialStatus` is set **only** on first inbound `CALL_STARTED` (and outbound create), via `mapVoiceInitialStatus`:

| Native signal | `initialStatus` |
|---------------|-----------------|
| TRANSFERRING / outcome ESCALATED | `HUMAN_REQUIRED` |
| FINALIZED + RESOLVED | `RESOLVED` |
| FAILED lifecycle/outcome | `FAILED` |
| Default AI-active session | `AI_ACTIVE` |

Ordinary lifecycle events (`CALL_CONNECTED`, etc.) do **not** patch canonical status. Explicit patches: `HUMAN_REQUIRED`, `CONVERSATION_RESOLVED` only. `AI_INTENT_DETECTED` is **not** emitted in C4 (no truthful native intent source).

---

## 10. Escalation audit

| Item | Classification |
|------|----------------|
| `escalationReason` column | **UNUSED** before C4 (no writers) |
| `ESCALATED` outcome | **UNUSED** before C4 |
| `TRANSFERRING` lifecycle | **UNUSED** — not set by callback request (not a live transfer) |
| ElevenLabs agent escalation webhook | **DEFER TO C11** (no deterministic native transition yet) |
| `create_callback_request` MCP tool | Creates **staff callback task** (`CUSTOMER_FOLLOWUP`) — human follow-up later, not live PSTN transfer |
| Twilio transfer | **DEFER TO C11** for `HUMAN_ACTIVE`; no duplicate `HUMAN_REQUIRED` in C4 |

---

## 11. Escalation repair

**Product evidence:** `VoiceMcpWriteToolsService.createCallbackRequest` creates a `CUSTOMER_FOLLOWUP` task via `tasksService.createManualTask` with `source: 'VOICE_CALLBACK'`. It does **not** initiate a live telephony transfer.

**Source of truth for `HUMAN_REQUIRED`:** MCP `create_callback_request` success (AI-side human follow-up decision), not Twilio transfer webhooks.

On successful `create_callback_request` (tenant-scoped `updateMany` where `{ id, organizationId }`, `count === 1`):

```text
escalationReason = 'CALLBACK_REQUESTED'
outcome = ESCALATED
(lifecycleState unchanged — call may remain AI_ACTIVE)
→ projectEscalationTransition (idempotent per updatedAt)
```

Idempotency key: `voice-human:{voiceConversationId}:{updatedAt.toISOString()}`

Replay of same native transition → one canonical event. Later distinct transition (new `updatedAt`) → new `HUMAN_REQUIRED` allowed.

`projectEscalationTransition` skips if `priorEscalationReason` already set (prevents duplicate on same logical escalation replay).

---

## 11b. Call end / resolution source of truth

| Path | Native | Canonical |
|------|--------|-----------|
| ElevenLabs-managed call | Twilio `completed` sets native `status=COMPLETED` + `endedAt` but **not** canonical `CALL_ENDED` | `elevenlabs.post_call` → `CALL_ENDED` (+ `CONVERSATION_RESOLVED` when `outcome=RESOLVED`) |
| Legacy TwiML | Twilio `completed` finalizes natively | Twilio `completed` → `CALL_ENDED` |

**Gap (documented, not redesigned in C4):** If Twilio reports `completed` but `elevenlabs.post_call` never arrives, native row may show completed while canonical timeline lacks `CALL_ENDED`. No duplicate `CALL_ENDED` is emitted from Twilio on the ElevenLabs path. Future C11/reconciliation may address orphan finalization.

---

## 12. Outcome audit

| Outcome enum | Pre-C4 behavior |
|--------------|-----------------|
| `PENDING` | Default until post-call or failure |
| `RESOLVED` | Set by ElevenLabs post-call lifecycle |
| `FAILED` | Set on telephony/AI failure paths |
| `ABANDONED` | Native lifecycle (unchanged) |
| `ESCALATED` | **Never written** before C4 repair |

Twilio `completed` on ElevenLabs path intentionally leaves `outcome=PENDING` until `elevenlabs.post_call` — canonical `CALL_ENDED` follows ElevenLabs post-call, not Twilio completed.

---

## 13. Outcome repair

C4 writes `outcome=ESCALATED` on `create_callback_request` only. No new enum values. No migration required.

Canonical `CONVERSATION_RESOLVED` emitted only when native `outcome=RESOLVED` at post-call projection time.

Canonical `FAILED` initial status only when native lifecycle/outcome already indicates failure at envelope creation.

---

## 14. Tool execution projection

Projected from authoritative `VoiceToolExecution` records after native persist in `VoiceMcpActionOrchestratorService`.

Metadata allowlist: `toolName`, `actionName`, `failureCode`, `outcomeCode` — no input/output/PII.

MCP webhook `MCP_TOOL_EXECUTION` events converge on the **same** idempotency key as orchestrator path via shared `buildVoiceToolProviderEventId(executionId, eventType)`.

Orchestrator + webhook replay of the same `VoiceToolExecution` → exactly one `AI_ACTION_COMPLETED` or `AI_ACTION_FAILED`.

---

## 15. Context reuse

From `VoiceConversation.metadata` via `readVoiceConversationContext`:

- `customerId`, `bookingId`, `vehicleId`, `stationId`
- No phone-number resolution
- No inference across multiple bookings
- `assignedUserId` null unless native field added later (C6)

---

## 16. Actor / direction semantics

| Event source | `actorType` | `direction` |
|--------------|-------------|-------------|
| Twilio lifecycle | `SYSTEM` | `INBOUND` / `OUTBOUND` from `VoiceConversation.direction` |
| ElevenLabs AI intent/tools | `AI_AGENT` | `INTERNAL` for AI ops; call end uses native direction |
| Human escalation | `AI_AGENT` | `INTERNAL` |

No fabricated human assignee identity.

---

## 17. Idempotency

All keys via C2 `buildCanonicalIdempotencyKey` (`cc1:{sha256}`).

| Pattern | Key material |
|---------|--------------|
| Twilio webhook | `VoiceProviderWebhookEvent.externalEventId` |
| ElevenLabs webhook | `externalEventId` (+ `:ended` / `:resolved` suffixes) |
| Human escalation | `voice-human:{id}:{updatedAt}` |
| Tool execution | `voice-tool:{executionId}:{eventType}` |
| Outbound start | `outbound:{conversationId}:started` |

---

## 18. Failure isolation

`VoiceCommunicationProjectionIntegration.projectSafely`:

- Catches normalization + projection errors
- Logs `voice_canonical_projection_failed` with: `organizationId`, `nativeConversationId`, **`providerIdentity` (actual provider per event)**, `providerEventId`, `eventType`, `errorCode`
- Never logs phone, transcript, prompt, raw payload, or unsanitized `Error.message`

Webhook processing calls projection with `void` + `.catch(() => undefined)` **after** `markProcessed` — native ack path unchanged.

Outbound orchestration: projection failure cannot block or retry `startOutboundCall`.

---

## 19. Feature flag

| Env | Purpose |
|-----|---------|
| `COMMUNICATION_CENTER_VOICE_PROJECTION_ENABLED` | Voice-specific gate |
| `COMMUNICATION_CENTER_PROJECTION_ENABLED` | Global fallback |
| Org allowlist | Same convention as C3 (`COMMUNICATION_CENTER_PROJECTION_ORG_ALLOWLIST`) |

**Default: OFF.** OFF → zero canonical writes; Voice runtime unchanged.

Config: `backend/src/config/communication-projection.config.ts`  
Service: `CommunicationProjectionFeatureService.isVoiceProjectionEnabled()`

---

## 20. PII / transcript / recording boundary

| Data | Canonical? |
|------|------------|
| Transcript text | **No** — native `VoiceConversation.transcript` |
| Recording URL/content | **No** |
| Phone numbers | **No** |
| Tool input/output | **No** |
| Raw webhook payload | **No** |
| `handoffReasonCode` | Bounded sanitized code only |

---

## 21. Tests

| Suite | Coverage |
|-------|----------|
| `twilio-voice-communication.adapter.spec.ts` | nativeConversationId, direction, status safety, HUMAN_REQUIRED occurrence keys |
| `voice-communication-projection.integration.spec.ts` | flag OFF, normalization swallow, provider-specific failure logs, CALL_STARTED dedupe, no fabricated AI intent |
| `voice-communication-projection.postgres.integration.spec.ts` | **7 tests** on `synqdrive_comm_c1_mig`: multi-provider convergence, HUMAN_REQUIRED replay + distinct occurrence, tool dual-source dedupe, cross-org escalation guard, dry-run zero events, orchestrator tenant isolation |
| `voice-call-orchestration.spec.ts` | dry-run no projection, live outbound one CALL_STARTED, projection failure isolation, provider failure no CALL_STARTED |
| `voice-webhook-ingestion.pipeline.spec.ts` | native persist succeeds when projection throws |
| `voice-mcp-write-actions.spec.ts` | tenant-scoped `updateMany` on callback escalation |

**PostgreSQL run (pre-merge):** `DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5432/synqdrive_comm_c1_mig` → **7/7 passed**.

---

## 22. Backfill decision

**C4 runtime only** — new Voice events after flag enable.

**C4.2 backfill recommended** before C7/C9 read APIs:

- Recent/open `VoiceConversation` envelopes
- Limited lifecycle milestones (started/connected/ended/escalated)
- Current outcome/escalation state snapshot

Do **not** backfill transcript or per-turn spoken content.

---

## 23. Deployment

1. Merge C4 with `COMMUNICATION_CENTER_VOICE_PROJECTION_ENABLED=false`
2. Deploy — verify Twilio/ElevenLabs native behavior unchanged
3. Enable for pilot org via allowlist
4. Inspect `CommunicationConversation` / `CommunicationEvent` for VOICE channel
5. Verify multi-provider convergence on same `nativeConversationId`
6. Verify escalation `HUMAN_REQUIRED` + native `escalationReason`
7. Global enable
8. Rollback = flag OFF (no provider reconnection)

---

## 24. Rollback

Set `COMMUNICATION_CENTER_VOICE_PROJECTION_ENABLED=false` (or remove org from allowlist). Native Voice, Twilio, and ElevenLabs paths unaffected. Existing canonical rows remain read-only artifacts.

---

## 25. Known risks

1. ElevenLabs agent-initiated escalation (non-MCP) still lacks native transition → no canonical `HUMAN_REQUIRED` until C11
2. `AI_INTENT_DETECTED` deferred — no truthful native intent classifier in current Voice runtime (C11 AI Activity)
3. Orphan finalization if Twilio `completed` without `elevenlabs.post_call` — canonical timeline may lack `CALL_ENDED`
4. Historical Voice conversations invisible to Communication Center until C4.2 backfill
5. Out-of-order Twilio/ElevenLabs events rely on `occurredAt`, not pipeline ordering

---

## 26. C5 readiness

**READY FOR C5** — Voice canonical projection runtime, adapters, and failure isolation are in place behind a flag. C5 may add the next channel or cross-channel aggregation assuming C4.2 backfill is scheduled before C7 read surfaces.

---

## Attachment point summary

| Provider | Attachment |
|----------|------------|
| **Twilio** | `VoiceWebhookProcessingService.processEventId` → `projectFromProcessedWebhook` (after lifecycle + markProcessed) |
| **Twilio outbound** | `VoiceCallOrchestrationService.projectOutboundCallStarted` |
| **ElevenLabs** | Same webhook processing hook (`elevenlabs.conversation`, `elevenlabs.post_call`) |
| **ElevenLabs tools** | `VoiceMcpActionOrchestratorService` after `executions.complete` |
| **Escalation** | `VoiceMcpActionOrchestratorService` on `create_callback_request` |

## Schema change required

**NO** — existing `VoiceConversationOutcome`, `VoiceConversationLifecycleState`, and `escalationReason` fields are sufficient; C4 wires existing columns only.
