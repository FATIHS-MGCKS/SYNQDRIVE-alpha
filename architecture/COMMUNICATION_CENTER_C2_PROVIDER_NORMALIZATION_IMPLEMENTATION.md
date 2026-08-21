# Communication Center C2 — Provider Normalization Implementation Record

**Phase:** C2 (Provider-neutral normalization foundation)  
**Date:** 2026-08-21  
**Branch:** `feature/communication-center-c2-provider-normalization`  
**Depends on:** C1 persistence (`architecture/COMMUNICATION_CENTER_C1_PERSISTENCE_IMPLEMENTATION.md`), C0.2 RBAC

**Note:** C0.1 governance artifacts are restored on `main` via separate PR **#1118** (see §13d). C2 follows merged C1 on `main` and C0.2/C1 implementation records.

---

## 1. Scope

C2 adds **internal contracts and projection orchestration only**:

- Provider-neutral normalized input types
- Validation, metadata allowlist, idempotency key factory
- Provider capability registry (V1)
- Normalization ports (interfaces — no concrete adapters)
- `CommunicationProjectionService` (transactional orchestrator)

**Not in scope:** HTTP controllers, webhooks, provider runtime wiring, frontend, unified inbox, human handoff policy, C6 resolution.

---

## 2. Current provider attachment points (pre-implementation trace)

### WhatsApp (Meta Cloud API)

| Concern | Location |
|---------|----------|
| Provider client | `backend/src/modules/whatsapp/providers/meta-whatsapp-cloud.provider.ts` — `MetaWhatsAppCloudProvider` |
| Provider facade | `backend/src/modules/whatsapp/providers/whatsapp-provider.service.ts` — `WhatsAppProviderService` |
| Inbound webhook | `whatsapp-webhook.controller.ts` → `WhatsAppWebhookService.receiveWebhook`, `processEntryIdempotent`, `handleInboundMessage`, `handleStatusUpdate` |
| Outbound send | `whatsapp.service.ts` — `sendMessage`, `sendAiReply`; `whatsapp-template.service.ts` |
| Delivery/read | `WhatsAppWebhookService.handleStatusUpdate`; provider `parseWebhook` status branch |
| Native conversation ID | `WhatsAppConversation.id` |
| Native message ID | `WhatsAppMessage.id`; provider ref `providerMessageId` (wamid) |
| Webhook dedupe | `WhatsAppWebhookEvent.externalEventId` |

**Future C3 attachment:** After native persistence in webhook/send handlers — normalize from `WhatsAppMessage` / status rows → `NormalizedCommunicationInput` → `CommunicationProjectionService`.

### Voice — Twilio

| Concern | Location |
|---------|----------|
| Webhooks | `twilio-webhook.controller.ts` → `TwilioWebhookService.handleInboundVoice`, `handleStatusCallback` |
| Call SID lifecycle | `ensureInboundConversation`, `applyStatusToConversation`; ingestion path `VoiceConversationLifecycleService.applyTwilioEvent` |
| Native conversation ID | `VoiceConversation.id` (not `CallSid`) |
| Provider event ID pattern | `{CallSid}:voice`, `{CallSid}:status:{CallStatus}` |
| Dedupe | `VoiceProviderWebhookEvent (TWILIO, externalEventId)` |

### Voice — ElevenLabs

| Concern | Location |
|---------|----------|
| Webhooks | `elevenlabs-webhook.controller.ts` → ingest via `VoiceWebhookIngestService.ingestElevenLabsEvent` |
| Lifecycle | `VoiceConversationLifecycleService.applyElevenLabsEvent` |
| Tool execution | `VoiceToolExecution` via MCP gateway / internal ingest |
| Native conversation ID | `VoiceConversation.id` |
| Provider refs | `elevenLabsConvId`, `providerConversationId` |

**Future C4 attachment:** Post-native lifecycle in `VoiceConversationLifecycleService` / webhook processor — map Twilio + ElevenLabs events into one canonical envelope keyed by `VoiceConversation.id`.

### Email — Resend

| Concern | Location |
|---------|----------|
| Send | `resend-email.provider.ts`, `booking-document-email.service.ts`, billing/payment senders |
| Webhook | `resend-webhook.controller.ts` → `ResendWebhookService.handle` → `OutboundEmailService.applyWebhookEvent` |
| Native row | `OutboundEmail.id` |
| Dedupe | `sendIdempotencyKey`, `OutboundEmailEvent.webhookIdempotencyKey` (Svix) |

**C2 decision:** Email V1 remains transactional — **no** `CommunicationConversation` projection. Normalization contract exists with `persist: false` validation path.

### SMS — sent.dm

**No runtime exists.** `CommunicationProviderIdentity.SENT_DM` and `CommunicationChannel.SMS` are schema-ready. C5 requires provider-doc verification and native SMS persistence decision.

---

## 3. Normalization pipeline

```
Provider/native authoritative event (unchanged in C2)
        ↓
Future provider adapter (C3/C4/C5) implements normalization port
        ↓
NormalizedCommunicationInput
        ↓
validateNormalizedCommunicationInput()
        ↓
CommunicationProjectionService.projectNormalizedInput()
        ↓
Prisma transaction:
  ensureConversationEnvelope → appendEventIdempotently → updateConversationProjection
        ↓
CommunicationConversation + CommunicationEvent (C1)
```

---

## 4. Normalized event contract

**`NormalizedCommunicationEvent`** — immutable facts:

- `eventType`, `occurredAt`, `idempotencyKey` (required)
- Optional: `direction`, `providerIdentity`, `providerEventId`, `providerMessageId`, `actorType`, `actorId`
- Optional allowlisted `metadata` only

**No** message body, transcript, recording URL, raw webhook JSON.

---

## 5. Projection patch contract

**`ConversationProjectionPatch`** — mutable envelope updates:

- Convergent: `status`, `context.*`, `unreadCountAbsolute`, `metadata`, `lastActivityAt` (monotonic max)
- Delta (new event only): `unreadDelta`
- Mutually exclusive: `unreadDelta` vs `unreadCountAbsolute`

Policy (which events set status/unread) is **not** defined in C2 — adapters in C3+ supply patches.

---

## 6. Provider ports

Under `backend/src/modules/communication/ports/`:

| Port | Purpose |
|------|---------|
| `MessagingProviderNormalizationPort` | Inbound/outbound/delivery/failure messaging |
| `TelephonyProviderNormalizationPort` | Twilio call lifecycle |
| `ConversationalVoiceProviderNormalizationPort` | ElevenLabs AI/tool/escalation |
| `EmailProviderNormalizationPort` | Resend lifecycle (conversation deferred) |

**No concrete adapter implementations in C2.**

---

## 7. Transport vs normalization boundary

| Transport (unchanged) | Normalization (C2) |
|----------------------|-------------------|
| API auth, signature verification | Canonical event classification |
| Outbound network calls | Idempotency key derivation |
| Provider request bodies | Metadata allowlist |
| Native table writes | Envelope + event projection |

---

## 8. Provider capability registry

`PROVIDER_CHANNEL_CAPABILITIES` in `communication-provider-capability.registry.ts`:

| Provider | V1 channels |
|----------|-------------|
| META_WHATSAPP | WHATSAPP |
| SENT_DM | SMS |
| TWILIO | VOICE |
| ELEVENLABS | VOICE |
| RESEND | EMAIL |

Validated when `event.providerIdentity` is set. Extensible for future capability expansion (not a global hard ban on cross-capability evolution).

---

## 9. Native conversation reference mapping

| Channel | `nativeConversationId` | Do NOT use as nativeConversationId |
|---------|------------------------|-------------------------------------|
| WHATSAPP | `WhatsAppConversation.id` | wamid, webhook entry id |
| VOICE | `VoiceConversation.id` | Twilio CallSid, ElevenLabs conv id |
| SMS | Future native SMS conversation row (C5) | sent.dm message id |
| EMAIL | **Deferred** — no Conversation V1 | OutboundEmail id |

Provider IDs belong on **events** (`providerEventId`, `providerMessageId`) and native tables.

---

## 10. Idempotency strategy

**`buildCanonicalIdempotencyKey()`** — centralized deterministic SHA-256 digest:

```
cc1:{sha256(JSON canonical payload v1)}
```

Payload includes: `organizationId`, `channel`, `providerIdentity`, `eventType`, `nativeConversationId`, `identityKind` (`evt`|`msg`|`state`), `identityValue`.

**Why digest instead of colon-delimited tuples:** Twilio `externalEventId` values may contain `:` (e.g. `CA1:status:ringing`). Keys are never parsed back — opaque digest only.

- Prefer `providerEventId` when present
- Else `providerMessageId` (eventType disambiguates delivered vs read)
- Else `providerLifecycleState`
- Max 512 chars (`cc1:` + 64 hex), no PII/content
- DB scoping: `@@unique([organizationId, idempotencyKey])`

Compound provider unique still subject to PostgreSQL NULL semantics (C1) — always set idempotency key for projection dedupe.

---

## 11. Metadata allowlist

`sanitizeCanonicalMetadata()` permits:

`durationSeconds`, `outcomeCode`, `intentCode`, `toolName`, `actionName`, `failureCode`, `handoffReasonCode`, `templateName`, `languageCode`, `providerLifecycleState`

Rejects content-like keys (`messageBody`, `transcript`, `payload`, etc.).

---

## 12. PII boundary

Normalization and projection **must not** persist communication content in canonical rows. Content remains in native channel tables; future read APIs resolve from authoritative sources.

---

## 13. Transaction strategy

`CommunicationProjectionService` wraps the full projection in **`prisma.$transaction`**:

1. `ensureConversationEnvelope` (createMany skipDuplicates + lookup; existing rows enriched later)
2. Merge effective context (`existing` + `envelope.initialContext` + `projection.context`)
3. Tenant-validate context diff
4. `appendEventIdempotently` with **effective context snapshot** (createMany skipDuplicates + lookup)
5. `updateConversationProjection` (status, metadata, context, absolute unread — **not** lastActivityAt)
6. `bumpLastActivityAt` (atomic PostgreSQL `GREATEST`)
7. `incrementUnreadCount` (atomic `{ increment: delta }`) **only when** `eventCreated === true`

On failure → mapped to `CommunicationNormalizationError`. Partial writes roll back together.

---

## 13a. Concurrency-safe unread semantics

`unreadDelta` must be a **positive integer**. Applied via `CommunicationConversationRepository.incrementUnreadCount()` using Prisma `{ increment: delta }` — not read-modify-write.

| Scenario | Behavior |
|----------|----------|
| Concurrent distinct new events | Each `eventCreated` path atomically increments — no lost updates |
| Replay (`eventCreated: false`) | `incrementUnreadCount` **not called** |
| Reset/read convergent ops | Use `unreadCountAbsolute` on projection patch |
| Negative delta | **Rejected** at validation — not supported in C2 |

DB `CHECK (unread_count >= 0)` remains the final guard.

### Absolute vs delta concurrency contract

| Field | Concurrency semantics |
|-------|----------------------|
| `unreadDelta` | Atomic `{ increment }` on `eventCreated === true` only — safe under concurrent distinct events |
| `unreadCountAbsolute` | **Not concurrency-safe** against concurrent `unreadDelta` in separate transactions. Validation rejects both in one input, but cross-operation races are undefined. Marked for serialized/convergent policy before production read-receipt use (C9/C11). C3 inbound messages use `unreadDelta` only. |

---

## 13a1. Atomic envelope race semantics

`ensureConversationEnvelope` uses Prisma `createMany({ skipDuplicates: true })` → PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` on `communication_conversations_org_channel_native`. Concurrent first events for the same native conversation:

- exactly one `CommunicationConversation` row
- both callers succeed (`created: true` for winner, `false` for loser)
- no transaction abort from unique-violation recovery

---

## 13a2. Atomic event replay semantics

`appendEventIdempotently` uses `createMany({ skipDuplicates: true })` → PostgreSQL `ON CONFLICT DO NOTHING` on `communication_events_org_idempotency_key`. Concurrent identical events:

- exactly one `CommunicationEvent` row
- both callers succeed (`created: true` / `false`)
- `unreadDelta` applied once (only when `created: true`)
- append-only — existing events never mutated

Replaces prior `create` + `P2002` catch + re-SELECT pattern that could abort interactive transactions in PostgreSQL.

---

## 13a3. Concurrent lastActivityAt guarantee

`bumpLastActivityAt` executes:

```sql
UPDATE communication_conversations
SET last_activity_at = GREATEST(last_activity_at, $candidate)
WHERE id = $id AND organization_id = $organizationId
```

Concurrent transactions with candidates 12:00 and 11:00 always converge to 12:00 regardless of commit order. Application-level read-max-write is not the concurrency guarantee.

---

## 13b. Context enrichment semantics

`envelope.initialContext` is **not CREATE-only**. For existing envelopes:

- `undefined` field → leave existing value unchanged
- non-null value → enrich/update via tenant-validated projection
- explicit `null` → clear field (documented adapter contract)

`projection.context` follows the same merge rules. Adapters may pass newly resolved IDs in either `initialContext` or `projection.context`.

---

## 13c. Event context snapshot semantics

Per normalization operation, **effective context** is computed before event append:

```
effective = merge(existing conversation, initialContext, projection.context)
```

`CommunicationEvent.customerId/bookingId/vehicleId` snapshot **effective context** at append time — not stale pre-enrichment conversation state. Conversation projection receives the same effective context diff in the same transaction.

---

## 13d. C0.1 artifact dependency

Frozen governance artifacts were not on `main` during initial C2 delivery. Restored via separate doc-only PR **#1118** (cherry-picked from commits `6211a1d4`, `42cebfda`). **C3 must not proceed until #1118 merges to `main`.**

---

## 14. Replay safety

| Field | On event replay (`eventCreated: false`) |
|-------|----------------------------------------|
| `unreadDelta` | **Not applied** (no atomic increment) |
| `unreadCountAbsolute`, `status`, context | Applied (convergent on replay; absolute unread not safe vs concurrent delta — see §13a) |
| `lastActivityAt` | Bumped via atomic `GREATEST` — never regresses |

Event append uses C1 idempotent create — returns existing row without mutation.

---

## 15. lastActivityAt ordering

`bumpLastActivityAt` applies `GREATEST(existing, candidate)` atomically at the database level. Delayed older events cannot move activity backwards even when their transaction commits after a newer event.

---

## 16. Voice multi-provider semantics

One `CommunicationConversation` per `(org, VOICE, VoiceConversation.id)` receives events from:

- `TWILIO` (call lifecycle)
- `ELEVENLABS` (AI intent/action/escalation)

Provider identity is **event-level** only. Tested in projection service spec.

---

## 17. Email V1 deferral

`validateNormalizedCommunicationInput` throws `EMAIL_CONVERSATION_DEFERRED` when `persist !== false` and channel is EMAIL.

`OutboundEmail` + Resend webhooks remain authoritative. Future threaded/inbound email may revisit Conversation projection.

---

## 18. sent.dm C5 prerequisites

Before C5 adapter:

- Verify sent.dm webhook schema, signature, message IDs, delivery events
- Decide native SMS conversation persistence model
- Extend capability registry only after provider-doc verification

C2 contracts (`SMS` + `SENT_DM`) are ready at normalization layer.

---

## 19. Tests

| Suite | Count | Coverage |
|-------|-------|----------|
| C1 suites (unchanged) | 29 | Persistence invariants |
| `communication-normalization.validation.spec.ts` | 9 | Validation matrix |
| `communication-idempotency.spec.ts` | 4 | Deterministic keys |
| `communication-metadata.spec.ts` | 3 | Allowlist/PII |
| `communication-provider-capability.registry.spec.ts` | 3 | V1 capabilities |
| `communication-projection.service.spec.ts` | 11 | Orchestration, replay, multi-provider, context enrichment, event snapshot |
| `communication-projection.postgres.integration.spec.ts` | 6 | PostgreSQL concurrency matrix A–F (requires `DATABASE_URL`) |
| `communication-context-merge.spec.ts` | 3 | Merge/clear semantics |
| `communication-event.repository.spec.ts` | 6 | Idempotent append via skipDuplicates |
| `communication-conversation.repository.spec.ts` | 10 | Envelope skipDuplicates, bumpLastActivityAt, incrementUnreadCount |

**Total: 69 unit (67 passed, 2 skipped postgres integration when `DATABASE_URL` unset) + 6 postgres integration when DB available** (`npm test -- --testPathPattern='modules/communication'`)

### PostgreSQL verification matrix

| Test | Scenario |
|------|----------|
| A | Concurrent identical events → one row, unread once |
| B | Concurrent first events same native conversation → one envelope, two events |
| C | Concurrent first inbound messages → unreadCount = 2 |
| D | Replay collision → unread increments once |
| E | Concurrent/sequential lastActivityAt 12:00 vs 11:00 → final 12:00 |
| F | Tenant validation failure → full transaction rollback |

---

## 20. Known risks

1. No full state machine enforcement for `CommunicationConversationStatus` transitions (deferred to C11/handoff)
2. Email normalization port exists but conversation projection intentionally blocked
3. SMS native conversation model undecided — C5 may require schema work
4. Projection orchestrator not yet called from any production path — integration risk deferred to C3+
5. Capability registry is V1 static map — must be updated deliberately when providers gain channels

---

## 21. C3 readiness

**READY FOR C3** — WhatsApp adapter can implement `MessagingProviderNormalizationPort`, map `WhatsAppConversation.id` → envelope, derive keys from webhook/message ids, call `CommunicationProjectionService`.

---

## 36. C3/C4/C5 handoff table

### Phase C3 — WhatsApp

| Item | Detail |
|------|--------|
| Native sources | `WhatsAppWebhookService.handleInboundMessage`, `handleStatusUpdate`; `WhatsAppService.sendMessage` outbound accept |
| Events to normalize | MESSAGE_RECEIVED, MESSAGE_SENT, MESSAGE_DELIVERED, MESSAGE_READ, MESSAGE_FAILED, HUMAN_REQUIRED (when native signals exist) |
| Adapter location | `backend/src/modules/communication/adapters/whatsapp/` (new in C3) |
| Attachment points | After native DB write in `whatsapp-webhook.service.ts`, `whatsapp.service.ts` — **behind feature flag** |

### Phase C4 — Voice

| Item | Detail |
|------|--------|
| Twilio sources | `VoiceWebhookIngestService.ingestTwilioEvent`, `VoiceConversationLifecycleService.applyTwilioEvent` |
| ElevenLabs sources | `ingestElevenLabsEvent`, `applyElevenLabsEvent`; MCP tool via `VoiceInternalEventIngestService` |
| Envelope mapping | `VoiceConversation.id` as `nativeConversationId` |
| Escalation repair | Human handoff native signals → normalize to HUMAN_REQUIRED / assignment patches in C11 |

### Phase C5 — SMS / sent.dm

| Item | Detail |
|------|--------|
| Contracts ready | `CommunicationChannel.SMS`, `SENT_DM`, messaging port, capability registry |
| Still required | sent.dm webhook verification, message ID shape, native SMS tables, inbound capability |
| Adapter location | `backend/src/modules/communication/adapters/sent-dm/` (future) |

---

## Module structure (C2 additions)

```
backend/src/modules/communication/
  communication-projection.service.ts
  normalization/
    communication-normalization.types.ts
    communication-normalization.validation.ts
    communication-normalization.errors.ts
    communication-idempotency.ts
    communication-metadata.ts
    communication-provider-capability.registry.ts
  ports/
    messaging-normalization.port.ts
    telephony-normalization.port.ts
    conversational-voice-normalization.port.ts
    email-normalization.port.ts
  *.spec.ts
```

---

## Changes / Architektur

- **Changes:** this document (`architecture/COMMUNICATION_CENTER_C2_PROVIDER_NORMALIZATION_IMPLEMENTATION.md`)
- **Architektur:** normalization pipeline and provider attachment points documented above; no Prisma schema change
