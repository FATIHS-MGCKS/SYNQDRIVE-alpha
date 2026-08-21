# Communication Center C3 — WhatsApp Projection Implementation Record

**Phase:** C3 (Meta WhatsApp → canonical Communication projection)  
**Date:** 2026-08-21  
**Branch:** `cursor/communication-center-c3-whatsapp-projection-40bb`  
**PR:** #1121  
**Depends on:** C1 persistence, C2 normalization (`CommunicationProjectionService`), C0.2 RBAC

---

## 1. Scope

C3 wires the **existing** Meta WhatsApp runtime into canonical Communication persistence as a **best-effort operational projection**:

- `MetaWhatsAppCommunicationAdapter` — normalizes persisted native WhatsApp facts
- `WhatsAppCommunicationProjectionIntegration` — feature flag, error isolation, calls `CommunicationProjectionService`
- Minimal attachment points in `WhatsAppWebhookService`, `WhatsAppService`, `WhatsAppAiRouterService`, `WhatsAppQuickActionsService`

**Not in scope:** Communication Center UI, dashboard, C6 resolution engine, historical backfill job (C3.2), C11 full handoff state machine, booking reminder dispatch projection (deferred — uses separate `dispatchMessage` path).

---

## 2. Existing WhatsApp runtime trace

| Step | Component | Function |
|------|-----------|----------|
| Ingress | `whatsapp-webhook.controller.ts` | `receive` → `WhatsAppWebhookService.receiveWebhook` |
| Dedupe | `whatsapp-webhook.service.ts` | `processEntryIdempotent` → `WhatsAppWebhookEvent` |
| Inbound | `whatsapp-webhook.service.ts` | `handleInboundMessage` → matcher, conversation upsert, `WhatsAppMessage.create` |
| Status | `whatsapp-webhook.service.ts` | `handleStatusUpdate` → outbound `WhatsAppMessage` lifecycle |
| Outbound human | `whatsapp.service.ts` | `sendMessage` → provider send → SENT/FAILED |
| Outbound AI | `whatsapp.service.ts` | `sendAiReply` → `sendMessage` (skip projection) → AI flags → **single** `projectOutboundAccepted` |
| Human review | `whatsapp-ai-router.service.ts` | `requestHumanReview` → `PENDING_HUMAN` → `HUMAN_REQUIRED` |
| AI human-required | `whatsapp-ai-router.service.ts` | `route()` transition `OPEN` → `PENDING_HUMAN` → `HUMAN_REQUIRED` |
| Close conversation | `whatsapp-quick-actions.service.ts` | `close_conversation` → `CLOSED` → `CONVERSATION_RESOLVED` |

Native tables remain authoritative for message content, wamid, delivery lifecycle, AI state.

---

## 3. Native authority boundary

| Concern | Authority |
|---------|-----------|
| Message body / media | `WhatsAppMessage.content` (native only) |
| Provider message ID (wamid) | `WhatsAppMessage.providerMessageId` |
| Native conversation key | `WhatsAppConversation.id` → canonical `nativeConversationId` |
| Webhook dedupe | `WhatsAppWebhookEvent.externalEventId` |
| Operator unread (native UI) | `WhatsAppConversation.unreadCount` (unchanged) |
| Canonical unread | `CommunicationConversation.unreadCount` via `unreadDelta` on inbound only |

---

## 4. Adapter design

**Location:** `backend/src/modules/communication/adapters/whatsapp/`

`MetaWhatsAppCommunicationAdapter` implements `MessagingProviderNormalizationPort` and typed helpers:

- `fromInbound`, `fromOutboundAccepted`, `fromOutboundFailed`, `fromStatusUpdate`, `fromHumanRequired`, `fromConversationResolved`

Inputs are **persisted** `WhatsAppConversation` + `WhatsAppMessage` (+ webhook external event id for lifecycle), never raw Meta JSON.

---

## 5. Event mapping table

| Native source | Canonical event | Provider | Direction | Idempotency source | Projection patch | Failure behavior |
|---------------|-----------------|----------|-----------|-------------------|------------------|------------------|
| Persisted inbound `WhatsAppMessage` | `MESSAGE_RECEIVED` | `META_WHATSAPP` | `INBOUND` | `WhatsAppWebhookEvent.externalEventId` (`msg:{wamid}`) | `unreadDelta: 1` only | Log + continue native path |
| Outbound `sendMessage` / `sendAiReply` SENT | `MESSAGE_SENT` | `META_WHATSAPP` | `OUTBOUND` | `wa-sent:{WhatsAppMessage.id}` | none | Log + continue |
| Outbound send FAILED (native) | `MESSAGE_FAILED` | `META_WHATSAPP` | `OUTBOUND` | `wa-failed:{WhatsAppMessage.id}` | `failureCode` metadata | Log + continue |
| Webhook status DELIVERED | `MESSAGE_DELIVERED` | `META_WHATSAPP` | `OUTBOUND` | `status:{wamid}:delivered:{metaTs}` | none | Log + continue |
| Webhook status READ | `MESSAGE_READ` | `META_WHATSAPP` | `OUTBOUND` | `status:{wamid}:read:{metaTs}` | none | Log + continue |
| Webhook status FAILED | `MESSAGE_FAILED` | `META_WHATSAPP` | `OUTBOUND` | `wa-failed:{WhatsAppMessage.id}` *(converges with sync)* | `failureCode` | Log + continue |
| Webhook status SENT | *(skipped)* | — | — | — | — | `MESSAGE_SENT` sourced from `sendMessage` only |
| `route()` / `requestHumanReview` → `PENDING_HUMAN` | `HUMAN_REQUIRED` | `META_WHATSAPP` | `INTERNAL` | `wa-human:{conversationId}` | `status: HUMAN_REQUIRED` | Log + continue |
| `close_conversation` → `CLOSED` | `CONVERSATION_RESOLVED` | `META_WHATSAPP` | `INTERNAL` | `wa-resolved:{conversationId}` | `status: RESOLVED` | Log + continue |

All keys hashed via C2 `buildCanonicalIdempotencyKey` (`cc1:{sha256}`).

---

## 6. Canonical status semantics (initial vs transition)

| `WhatsAppConversationStatus` | `CommunicationConversationStatus` | When applied |
|------------------------------|--------------------------------|--------------|
| `OPEN` | `AI_ACTIVE` | `envelope.initialStatus` on **first** inbound envelope create only |
| `PENDING_HUMAN` | `HUMAN_REQUIRED` | `envelope.initialStatus` on first inbound **or** explicit `HUMAN_REQUIRED` event |
| `CLOSED` | `RESOLVED` | explicit `CONVERSATION_RESOLVED` event only (quick action close) |

**Frozen rule (C3 pre-merge hardening):**

- `envelope.initialStatus` — used only when creating a new canonical envelope (inbound `fromInbound` with `includeInitialStatus: true`).
- `projection.status` — used only on deterministic transition events (`HUMAN_REQUIRED`, `CONVERSATION_RESOLVED`).
- Ordinary `MESSAGE_RECEIVED`, `MESSAGE_SENT`, `MESSAGE_DELIVERED`, `MESSAGE_READ`, and `MESSAGE_FAILED` events **must not** patch canonical status from the native conversation row.

This prevents regressing a stronger canonical state (e.g. `HUMAN_REQUIRED`) when native WhatsApp remains or returns to `OPEN`.

---

## 7. AI outbound single-projection semantics

`sendAiReply` flow:

1. `sendMessage(..., { skipCanonicalProjection: true })` — native send only
2. Apply AI-native metadata (`aiGenerated: true`, `aiSuggested` when suggestion-linked)
3. Fetch final persisted `WhatsAppMessage`
4. `projectOutboundAccepted` **exactly once** — with or without `WhatsAppAiSuggestion`

Actor type: `AI_AGENT` when `message.aiGenerated === true` (set before projection).

---

## 8. PENDING_HUMAN writers audit

| Path | File | Native write | Canonical projection |
|------|------|--------------|---------------------|
| Matcher: unknown phone / no customer | `whatsapp-conversation-matcher.service.ts` | Initial conversation `PENDING_HUMAN` | Deferred — first inbound uses `envelope.initialStatus: HUMAN_REQUIRED` |
| AI router `route()` when `humanRequired` | `whatsapp-ai-router.service.ts` | `OPEN` → `PENDING_HUMAN` | `projectHumanRequired` on transition only |
| `requestHumanReview` | `whatsapp-ai-router.service.ts` | → `PENDING_HUMAN` | `projectHumanRequired` |
| Quick action `human_review` | `whatsapp-quick-actions.service.ts` | via `requestHumanReview` | same as above |
| `linkCustomer` | `whatsapp-quick-actions.service.ts` | may clear `PENDING_HUMAN` → `OPEN` | No canonical reopen in C3 (C11) |

**C11 cleanup:** centralize handoff/reopen state machine; matcher initial `PENDING_HUMAN` could optionally emit explicit `HUMAN_REQUIRED` before first inbound.

---

## 9. Context reuse policy

Project only IDs already on `WhatsAppConversation`:

- `customerId`, `bookingId`, `vehicleId`, `assignedTo` → `assignedUserId`

No new phone matching, booking inference, or station resolution in C3. Unresolved fields remain null. C6 owns advanced resolution.

**AI agent reference:** not projected in C3 (no stable cross-module agent entity). `assignedAgentRef/Type` left unset.

---

## 10. Runtime attachment points

| Event | File | Hook |
|-------|------|------|
| Inbound message | `whatsapp-webhook.service.ts` | After `WhatsAppMessage.create` |
| Delivery/read/failed | `whatsapp-webhook.service.ts` | After status update (skip `SENT`) |
| Outbound sent/failed | `whatsapp.service.ts` | After native message final update |
| AI outbound | `whatsapp.service.ts` | `sendAiReply` after AI flags (single projection) |
| Simulation inbound | `whatsapp.service.ts` | After simulate message create |
| Human review / AI handoff | `whatsapp-ai-router.service.ts` | After `PENDING_HUMAN` transition |
| Close conversation | `whatsapp-quick-actions.service.ts` | After `CLOSED` transition |

Projection runs **outside** native DB transactions — failures cannot roll back WhatsApp persistence.

---

## 11. Failure-isolation strategy

```typescript
void integration.project*(...); // fire-and-forget
```

`WhatsAppCommunicationProjectionIntegration.projectSafely`:

- wraps **entire** public method (feature flag lookup, adapter normalization, projection call)
- catches all errors — public methods never reject for expected projection failures
- logs structured `whatsapp_canonical_projection_failed` with `errorCode` only (no `Error.message`, no body/phone/raw payload)
- never rethrows to webhook/send paths

Webhook HTTP response and Meta ack behavior unchanged.

---

## 12. Feature flag

| Env var | Effect |
|---------|--------|
| `COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED=true` | Enable WhatsApp canonical writes |
| `COMMUNICATION_CENTER_PROJECTION_ENABLED=true` | Global fallback enable |
| `COMMUNICATION_CENTER_PROJECTION_ORG_ALLOWLIST` | Optional comma-separated org IDs |

**Default:** OFF — native WhatsApp unchanged.

Config: `backend/src/config/communication-projection.config.ts`  
Resolver: `CommunicationProjectionFeatureService`

---

## 13. Idempotency

Priority:

1. `WhatsAppWebhookEvent.externalEventId` for webhook-scoped events (Meta parser: `msg:{wamid}`, `status:{wamid}:{status}:{metaTimestamp}`)
2. Stable native lifecycle ids (`wa-sent:{messageId}`, `wa-failed:{messageId}`, `wa-human:{conversationId}`, `wa-resolved:{conversationId}`)
3. C2 SHA-256 digest — never hash message body, phone, or customer PII

**Webhook replay:** Meta `externalEventId` uses provider message id + status + **Meta timestamp** (not process time). Duplicate webhook delivery produces identical ids.

**Failure dedupe:** Sync `sendMessage` FAILED and later Meta FAILED webhook both normalize to `providerEventId: wa-failed:{WhatsAppMessage.id}` → single canonical `MESSAGE_FAILED` via idempotency convergence.

---

## 14. Delivery/read ordering

Canonical layer tolerates out-of-order Meta status webhooks. C2 atomic `GREATEST` on `lastActivityAt` prevents regression. No strict lifecycle ordering enforced in C3.

---

## 15. Unread semantics

- Inbound `MESSAGE_RECEIVED` → `unreadDelta: 1` (canonical only)
- Delivery/read/failure → no unread change
- No `unreadCountAbsolute` in C3
- Native `WhatsAppConversation.unreadCount` unchanged

---

## 16. PII boundary

No message body, phone number, customer name, or raw Meta payload in canonical rows or metadata. Allowed failure metadata: sanitized `failureCode` / `handoffReasonCode` only. Projection failure logs: `errorCode` + safe identifiers only.

---

## 17. Tests

| Suite | Coverage |
|-------|----------|
| `meta-whatsapp-communication.adapter.spec.ts` | Adapter mapping, status safety, failure dedupe |
| `whatsapp-communication-projection.integration.spec.ts` | Flag + full safe boundary |
| `whatsapp-communication-projection.postgres.integration.spec.ts` | E2E replay + lifecycle |
| `whatsapp.service.canonical-projection.spec.ts` | AI/human outbound projection invariants |
| `communication-projection-feature.service.spec.ts` | Feature flag matrix |
| `meta-whatsapp-cloud.provider.spec.ts` | Webhook `externalEventId` replay stability |
| `whatsapp-ai-router.service.spec.ts` | `PENDING_HUMAN` → `HUMAN_REQUIRED` coverage |
| C1/C2 communication suites | Unchanged |

**PostgreSQL:** C2 (6) + C3 (2) integration tests with `DATABASE_URL`.

---

## 18. Backfill decision — **C3.2 required before C7**

C3 runtime projection handles **new events only**.

**C3.2 follow-up (separate PR)** should backfill:

- Open/recent `WhatsAppConversation` rows → canonical envelopes
- Limited recent operational events (e.g. last N messages per conversation)
- **Not** full historical message bodies or multi-year event duplication

C7 inbox development should not assume all historical WhatsApp threads exist canonically until C3.2 runs.

---

## 19. Deployment sequence

1. Merge C1/C2 schema + services (on `main`)
2. Deploy C3 with `COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED` **unset/false**
3. Verify native WhatsApp (send, webhook, AI) unchanged
4. Enable flag for pilot org via allowlist
5. Verify `CommunicationConversation` / `CommunicationEvent` rows
6. Enable globally
7. Monitor `whatsapp_canonical_projection_failed` logs
8. **Rollback:** set flag OFF — native WhatsApp unaffected, no provider reconnection

---

## 20. Rollback

Disable feature flag. No schema migration in C3. Native WhatsApp tables and behavior remain intact.

---

## 21. Known risks

1. Booking reminder `dispatchMessage` path not yet projecting canonical outbound events
2. `linkCustomer` clearing `PENDING_HUMAN` does not project canonical reopen (C11)
3. Matcher initial `PENDING_HUMAN` relies on first inbound `initialStatus` rather than explicit handoff event
4. No historical backfill — C7 may show empty canonical inbox for pre-C3 threads
5. Template sends without `providerMessageId` may delay lifecycle canonical events until wamid known

---

## 22. C4 readiness

**READY FOR C4** — Voice adapter can follow the same integration pattern (`CommunicationModule` export, channel adapter, feature flag, post-native hooks). C3 establishes the WhatsApp reference implementation.

---

## Changes / Architektur

- **Changes:** this document (C3 pre-merge hardening)
- **Architektur:** initial vs transition status semantics, AI single-projection, PENDING_HUMAN coverage, failure dedupe, safe logging — documented above; no Prisma schema change
