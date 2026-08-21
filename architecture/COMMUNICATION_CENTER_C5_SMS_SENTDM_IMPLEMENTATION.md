# Communication Center C5.1 — SMS Native Persistence Foundation

**Phase:** C5.1 (schema + native persistence + webhook security foundation)  
**Follow-up:** C5.2 sent.dm production runtime (send + webhook processing)  
**Date:** 2026-08-21  
**Branch / PR:** `feature/communication-center-c5-sms-sentdm` → PR #1127 (reclassified)

---

## Phase boundary correction

Original C5 work introduced native SMS schema directly, violating the approved stop condition:

> if dedicated native SMS persistence is necessary → STOP → propose C5.1

**Finding:** Native persistence is **required** for:

- pre-provider `businessOperationId` idempotency
- `providerMessageId` lifecycle correlation
- inbound persistence
- webhook dedupe
- authoritative SMS body outside canonical `CommunicationEvent`
- provider dispatch crash recovery

**Split:**

| Phase | Scope |
|-------|--------|
| **C5.1** (this PR) | Prisma schema, repositories, dispatch state contract, webhook security gate, canonical adapter contracts, tests |
| **C5.2** (next PR) | sent.dm HTTP send adapter, RBAC send endpoint, webhook processor, canonical projection wiring at runtime |

PR #1127 is **reclassified as C5.1 only**. Runtime code removed from this PR.

---

## 1. Official sent.dm webhook-id semantics

**Verified (sent.dm docs — Events Reference + Building the Webhook Receiver):**

| Header | Official meaning |
|--------|------------------|
| `X-Webhook-ID` | **UUID of the webhook configuration** that produced the request (stable per registered endpoint) |
| Dedupe key | **`message_id` + `message_status`** in payload — **not** `X-Webhook-ID` |

`X-Webhook-ID` is **NOT** a per-delivery event ID. Tenant routing via unique `OrgSmsConfig.webhookEndpointId` is **correct**.

Additional tenant binding: `payload.account_id` (sent.dm account UUID) stored as `OrgSmsConfig.sentDmAccountId` (`@unique`).

---

## 2. Official inbound phone-field semantics

From sent.dm `message.received` payload:

| Field | Meaning |
|-------|---------|
| `inbound_number` | **Sender's phone number (the contact)** — remote party |
| `outbound_number` | **Your provisioned number** that received the message |

C5.1 documents `inbound_number` as the conversation contact key. C5.2 inbound handler must use `inbound_number`, not `outbound_number`.

---

## 3. Webhook missing-secret behavior (fail-closed)

`SmsWebhookSecurityService.verifyIngress`:

1. Requires signature headers
2. Resolves tenant **only** via authoritative `X-Webhook-ID` → `OrgSmsConfig.webhookEndpointId` (`findUnique`); unknown endpoint → `403`
3. Asserts payload `account_id` / `message_id` agree with the endpoint org (no cross-org fallback routing)
4. **Requires configured signing secret** — if missing → `403 Forbidden`
5. Verifies HMAC — invalid → `401 Unauthorized`
6. No native mutation occurs before verification (security service is read-only)

**No unsigned downgrade path.**

---

## 4. Schema (C5.1 migration)

`20260821200000_communication_center_c5_sms_native`

Models: `OrgSmsConfig`, `SmsConversation`, `SmsMessage`, `SmsWebhookEvent`

Hardening:

- `webhookEndpointId` `@unique`
- `sentDmAccountId` `@unique`
- `SmsMessageDeliveryStatus`: `DISPATCHING`, `DISPATCH_AMBIGUOUS`
- `dispatchAttemptedAt` for stale dispatch lease
- CHECK `unread_count >= 0`
- CHECK `direction IN ('incoming','outgoing')`
- CHECK `sender_type IN ('customer','user','system','ai_agent')`

---

## 5. Outbound crash recovery contract

| State | Meaning |
|-------|---------|
| `PENDING` | Durable row created; provider not yet claimed |
| `DISPATCHING` | Current dispatch lease (`dispatchAttemptedAt`) |
| `DISPATCH_AMBIGUOUS` | Retryable transport/unknown outcome — **not** terminal FAILED; reclaimable within idempotency window |
| `QUEUED` | Provider accepted; `providerMessageId` set |
| `FAILED` | Terminal provider rejection only |

Stale threshold: `SMS_DISPATCH_STALE_MS` (120s). After stale, `claimProviderDispatch` reclaims `DISPATCHING` lease.

**Idempotency window:** `SENT_DM_IDEMPOTENCY_WINDOW_MS` (24h).

- `firstDispatchAttemptedAt` = immutable sent.dm idempotency window anchor (set on first `PENDING` → `DISPATCHING` claim only)
- `dispatchAttemptedAt` = mutable current dispatch lease timestamp
- **Retries NEVER extend provider idempotency lifetime**
- `PENDING` without `firstDispatchAttemptedAt` may still be initially claimed regardless of `createdAt` age
- Reclaims require `firstDispatchAttemptedAt`; missing anchor on `DISPATCHING` / `DISPATCH_AMBIGUOUS` → `not_claimable` (reconciliation)
- Outside window: `claimProviderDispatch` returns `idempotency_expired` — no silent reset to `PENDING`, no duplicate outbound row
- Acceptance path: `DISPATCH_AMBIGUOUS` → reclaim → `DISPATCHING` → `recordProviderAcceptance` → `QUEUED`

---

## 6. Tenant context validation

`SmsConversationRepository` uses `CommunicationTenantContextValidation` for `customerId` / `bookingId` / `vehicleId` on create and enrich.

Safe enrichment: supplied same-org non-null context may fill previously null fields; undefined does not clear.

---

## 7. Native preview PII policy

`SmsConversation.lastMessagePreview` is **native-authoritative** operational preview (same pattern as WhatsApp). Canonical `CommunicationEvent` stores no body/preview.

---

## 8. Phone normalization

Reuses `whatsapp-phone.util` (Germany-biased leading `0` → `49`). Documented limitation: not globally country-aware yet; C5.2 may introduce tenant country policy.

---

## 9. C5.2 readiness

C5.2 will add:

- `SentDmSmsAdapter` HTTP client
- `SmsService.sendOutbound` using repositories + dispatch recovery
- `SmsWebhookProcessorService` (post-verification mutations + projection)
- RBAC controller (`communication.write`; actor from auth principal, not DTO)
- Remove public `sandbox` / `actorType` DTO controls

---

## Changes / Architektur

- **Changes:** C5.1 phase boundary + native SMS schema documented here
- **Architektur:** SMS native-first authority confirmed; sent.dm runtime deferred to C5.2
