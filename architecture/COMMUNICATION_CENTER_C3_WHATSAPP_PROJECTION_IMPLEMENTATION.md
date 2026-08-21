# Communication Center C3 — WhatsApp Projection Implementation Record

**Phase:** C3 (Meta WhatsApp → canonical Communication projection)  
**Date:** 2026-08-21  
**Branch:** `feature/communication-center-c3-whatsapp-projection`  
**Depends on:** C1 persistence, C2 normalization (`CommunicationProjectionService`), C0.2 RBAC

---

## 1. Scope

C3 wires the **existing** Meta WhatsApp runtime into canonical Communication persistence as a **best-effort operational projection**:

- `MetaWhatsAppCommunicationAdapter` — normalizes persisted native WhatsApp facts
- `WhatsAppCommunicationProjectionIntegration` — feature flag, error isolation, calls `CommunicationProjectionService`
- Minimal attachment points in `WhatsAppWebhookService`, `WhatsAppService`, `WhatsAppAiRouterService`

**Not in scope:** Communication Center UI, dashboard, C6 resolution engine, historical backfill job (C3.2), AI router auto-handoff projection (deferred partial — see §7), booking reminder dispatch projection (deferred — uses separate `dispatchMessage` path).

---

## 2. Existing WhatsApp runtime trace

| Step | Component | Function |
|------|-----------|----------|
| Ingress | `whatsapp-webhook.controller.ts` | `receive` → `WhatsAppWebhookService.receiveWebhook` |
| Dedupe | `whatsapp-webhook.service.ts` | `processEntryIdempotent` → `WhatsAppWebhookEvent` |
| Inbound | `whatsapp-webhook.service.ts` | `handleInboundMessage` → matcher, conversation upsert, `WhatsAppMessage.create` |
| Status | `whatsapp-webhook.service.ts` | `handleStatusUpdate` → outbound `WhatsAppMessage` lifecycle |
| Outbound human | `whatsapp.service.ts` | `sendMessage` → provider send → SENT/FAILED |
| Outbound AI | `whatsapp.service.ts` | `sendAiReply` → `sendMessage` (skip duplicate projection) → AI flags → project once |
| Human review | `whatsapp-ai-router.service.ts` | `requestHumanReview` → `PENDING_HUMAN` |

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

- `fromInbound`, `fromOutboundAccepted`, `fromOutboundFailed`, `fromStatusUpdate`, `fromHumanRequired`

Inputs are **persisted** `WhatsAppConversation` + `WhatsAppMessage` (+ webhook external event id for lifecycle), never raw Meta JSON.

---

## 5. Event mapping table

| Native source | Canonical event | Provider | Direction | Idempotency source | Projection patch | Failure behavior |
|---------------|-----------------|----------|-----------|-------------------|------------------|------------------|
| Persisted inbound `WhatsAppMessage` | `MESSAGE_RECEIVED` | `META_WHATSAPP` | `INBOUND` | `WhatsAppWebhookEvent.externalEventId` (`msg:{wamid}`) | `unreadDelta: 1`, status from native | Log + continue native path |
| Outbound `sendMessage` / `sendAiReply` SENT | `MESSAGE_SENT` | `META_WHATSAPP` | `OUTBOUND` | `wa-sent:{WhatsAppMessage.id}` | none | Log + continue |
| Outbound send FAILED (native) | `MESSAGE_FAILED` | `META_WHATSAPP` | `OUTBOUND` | `wa-failed:{WhatsAppMessage.id}` | `failureCode` metadata | Log + continue |
| Webhook status DELIVERED | `MESSAGE_DELIVERED` | `META_WHATSAPP` | `OUTBOUND` | `status:{wamid}:delivered:{ts}` | none | Log + continue |
| Webhook status READ | `MESSAGE_READ` | `META_WHATSAPP` | `OUTBOUND` | `status:{wamid}:read:{ts}` | none | Log + continue |
| Webhook status FAILED | `MESSAGE_FAILED` | `META_WHATSAPP` | `OUTBOUND` | `status:{wamid}:failed:{ts}` | `failureCode` | Log + continue |
| Webhook status SENT | *(skipped)* | — | — | — | — | `MESSAGE_SENT` sourced from `sendMessage` only |
| `requestHumanReview` | `HUMAN_REQUIRED` | `META_WHATSAPP` | `INTERNAL` | `wa-human:{conversationId}:{ts}` | `status: HUMAN_REQUIRED` | Log + continue |

All keys hashed via C2 `buildCanonicalIdempotencyKey` (`cc1:{sha256}`).

---

## 6. Canonical status mapping

| `WhatsAppConversationStatus` | `CommunicationConversationStatus` |
|------------------------------|--------------------------------|
| `OPEN` | `AI_ACTIVE` |
| `PENDING_HUMAN` | `HUMAN_REQUIRED` |
| `CLOSED` | `RESOLVED` |

Applied via `envelope.initialStatus` and inbound `projection.status` when native status maps deterministically.

---

## 7. Context reuse policy

Project only IDs already on `WhatsAppConversation`:

- `customerId`, `bookingId`, `vehicleId`, `assignedTo` → `assignedUserId`

No new phone matching, booking inference, or station resolution in C3. Unresolved fields remain null. C6 owns advanced resolution.

**AI agent reference:** not projected in C3 (no stable cross-module agent entity). `assignedAgentRef/Type` left unset.

**Human handoff gap:** AI router `route()` may set native `PENDING_HUMAN` without a separate canonical `HUMAN_REQUIRED` event until C11. Manual `requestHumanReview` **does** project `HUMAN_REQUIRED`.

---

## 8. Runtime attachment points

| Event | File | Hook |
|-------|------|------|
| Inbound message | `whatsapp-webhook.service.ts` | After `WhatsAppMessage.create` |
| Delivery/read/failed | `whatsapp-webhook.service.ts` | After status update (skip `SENT`) |
| Outbound sent/failed | `whatsapp.service.ts` | After native message final update |
| AI outbound | `whatsapp.service.ts` | `sendAiReply` after AI flags (single projection) |
| Simulation inbound | `whatsapp.service.ts` | After simulate message create |
| Human review | `whatsapp-ai-router.service.ts` | After `requestHumanReview` status update |

Projection runs **outside** native DB transactions — failures cannot roll back WhatsApp persistence.

---

## 9. Failure-isolation strategy

```typescript
void integration.project*(...); // fire-and-forget
```

`WhatsAppCommunicationProjectionIntegration.projectSafely`:

- catches all errors
- logs structured `whatsapp_canonical_projection_failed` (no body/phone/raw payload)
- never rethrows to webhook/send paths

Webhook HTTP response and Meta ack behavior unchanged.

---

## 10. Feature flag

| Env var | Effect |
|---------|--------|
| `COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED=true` | Enable WhatsApp canonical writes |
| `COMMUNICATION_CENTER_PROJECTION_ENABLED=true` | Global fallback enable |
| `COMMUNICATION_CENTER_PROJECTION_ORG_ALLOWLIST` | Optional comma-separated org IDs |

**Default:** OFF — native WhatsApp unchanged.

Config: `backend/src/config/communication-projection.config.ts`  
Resolver: `CommunicationProjectionFeatureService`

---

## 11. Idempotency

Priority:

1. `WhatsAppWebhookEvent.externalEventId` for webhook-scoped events
2. Stable native lifecycle ids (`wa-sent:{messageId}`, `wa-failed:{messageId}`)
3. C2 SHA-256 digest — never hash message body, phone, or customer PII

---

## 12. Delivery/read ordering

Canonical layer tolerates out-of-order Meta status webhooks. C2 atomic `GREATEST` on `lastActivityAt` prevents regression. No strict lifecycle ordering enforced in C3.

---

## 13. Unread semantics

- Inbound `MESSAGE_RECEIVED` → `unreadDelta: 1` (canonical only)
- Delivery/read/failure → no unread change
- No `unreadCountAbsolute` in C3
- Native `WhatsAppConversation.unreadCount` unchanged

---

## 14. PII boundary

No message body, phone number, customer name, or raw Meta payload in canonical rows or metadata. Allowed failure metadata: sanitized `failureCode` / `handoffReasonCode` only.

---

## 15. Tests

| Suite | Count | Coverage |
|-------|-------|----------|
| `meta-whatsapp-communication.adapter.spec.ts` | 15 | Adapter mapping matrix |
| `whatsapp-communication-projection.integration.spec.ts` | 3 | Flag + failure isolation |
| `whatsapp-communication-projection.postgres.integration.spec.ts` | 2 | E2E replay + lifecycle |
| `whatsapp-webhook.service.spec.ts` | +1 | Projection hook after inbound |
| C1/C2 communication suites | 72+ | Unchanged |

**PostgreSQL:** 2 C3 integration tests (requires `DATABASE_URL`).

---

## 16. Backfill decision — **C3.2 required before C7**

C3 runtime projection handles **new events only**.

**C3.2 follow-up (separate PR)** should backfill:

- Open/recent `WhatsAppConversation` rows → canonical envelopes
- Limited recent operational events (e.g. last N messages per conversation)
- **Not** full historical message bodies or multi-year event duplication

C7 inbox development should not assume all historical WhatsApp threads exist canonically until C3.2 runs.

---

## 17. Deployment sequence

1. Merge C1/C2 schema + services (on `main`)
2. Deploy C3 with `COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED` **unset/false**
3. Verify native WhatsApp (send, webhook, AI) unchanged
4. Enable flag for pilot org via allowlist
5. Verify `CommunicationConversation` / `CommunicationEvent` rows
6. Enable globally
7. Monitor `whatsapp_canonical_projection_failed` logs
8. **Rollback:** set flag OFF — native WhatsApp unaffected, no provider reconnection

---

## 18. Rollback

Disable feature flag. No schema migration in C3. Native WhatsApp tables and behavior remain intact.

---

## 19. Known risks

1. Booking reminder `dispatchMessage` path not yet projecting canonical outbound events
2. AI router auto-`PENDING_HUMAN` without explicit canonical `HUMAN_REQUIRED` until C11
3. No historical backfill — C7 may show empty canonical inbox for pre-C3 threads
4. Template sends without `providerMessageId` may delay lifecycle canonical events until wamid known
5. Feature flag misconfiguration could silently skip projection (by design — safe default)

---

## 20. C4 readiness

**READY FOR C4** — Voice adapter can follow the same integration pattern (`CommunicationModule` export, channel adapter, feature flag, post-native hooks). C3 establishes the WhatsApp reference implementation.

---

## Changes / Architektur

- **Changes:** this document
- **Architektur:** WhatsApp → canonical projection data flow documented above; no Prisma schema change
