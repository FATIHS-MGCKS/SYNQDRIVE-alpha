# Communication Center C5 — SMS / sent.dm Implementation Record

**Phase:** C5 (SMS foundation + sent.dm runtime)  
**Date:** 2026-08-21  
**Branch:** `feature/communication-center-c5-sms-sentdm`  
**Depends on:** C1 persistence, C2 normalization, C0.2 RBAC, canonical contract V1

---

## 1. Scope

C5 introduces SMS as a canonical Communication Center channel with **sent.dm** as the first provider.

**In scope**

- Native SMS persistence (`SmsConversation`, `SmsMessage`, `SmsWebhookEvent`, `OrgSmsConfig`)
- Provider port + sent.dm HTTP adapter (`POST /v3/messages`)
- Outbound send path (RBAC-gated, feature-flagged)
- Webhook verification + lifecycle normalization
- Canonical projection (`MESSAGE_SENT`, `MESSAGE_DELIVERED`, `MESSAGE_FAILED`, `MESSAGE_RECEIVED`)
- PostgreSQL integration tests

**Out of scope**

- Communication Center UI
- Automatic business notification producers
- Resend / WhatsApp / Voice changes
- Bulk SMS, templates UI, marketing campaigns

---

## 2. Pre-existing SMS audit

| Area | Classification | Evidence |
|------|----------------|----------|
| sent.dm runtime | **NONE** | Zero prior adapter/webhook code |
| SMS send path | **NONE** | No `SmsService` before C5 |
| Workflow SMS flags | **PARTIAL** | `channelSmsEnabled` / `killSwitchSms` exist but no provider wiring |
| Notification SMS channel enum | **UNUSED** | `NotificationDeliveryChannel.SMS` without runtime producer |
| Canonical enums | **PRODUCTION-ready** | `CommunicationChannel.SMS`, `CommunicationProviderIdentity.SENT_DM` from C1 |
| Resend email | **PRODUCTION** | Unchanged |

---

## 3. sent.dm provider contract (verified)

| Item | Value |
|------|-------|
| Send endpoint | `POST https://api.sent.dm/v3/messages` |
| Auth | `x-api-key` header (UUID) |
| Idempotency | `Idempotency-Key` header (1–255 chars, cached 24h) |
| Request | `{ to: string[], text: string, channel: ["sms"], sandbox?: boolean }` |
| Success | `202 Accepted`; `data.recipients[0].message_id`, `status` (e.g. `QUEUED`) |
| Webhook headers | `x-webhook-id`, `x-webhook-timestamp`, `x-webhook-signature`, `x-webhook-event-type` |
| Signature | HMAC-SHA256 over `{webhookId}.{timestamp}.{rawBody}`; secret `whsec_` + base64 key |
| Dedupe key | `message_id` + `message_status` (not `x-webhook-id`) |
| Lifecycle events used | `message.delivered`, `message.failed`, `message.received` |
| Ignored for canonical duplicates | `message.queued`, `message.routed`, `message.sent` (after API accept) |

Secrets: `SENT_DM_API_KEY`, `SENT_DM_API_KEY_<ORG_ID>`, `SENT_DM_WEBHOOK_SIGNING_SECRET`, `SENT_DM_WEBHOOK_SIGNING_SECRET_<ORG_ID>`.

---

## 4. SMS authority / persistence decision

**Option A — native authoritative tables (implemented).**

Rationale (aligned with canonical contract §13):

- Matches WhatsApp/Voice native-first pattern
- Stores message body + delivery state outside canonical metadata
- Enables pre-provider idempotency (`businessOperationId` unique per org)
- Enables webhook correlation via `providerMessageId`
- Canonical `CommunicationConversation` / `CommunicationEvent` remain projection-only

Migration: `20260821200000_communication_center_c5_sms_native` (planned in canonical contract C5).

---

## 5. Conversation identity

- **Native thread key:** `(organizationId, contactPhoneNormalized)` on `SmsConversation`
- **Canonical `nativeConversationId`:** `SmsConversation.id` (UUID)
- **Not used:** raw phone in `externalEventId`, canonical metadata, or idempotency keys
- **Outbound vs inbound:** same thread per customer phone per org (canonical contract §13)

---

## 6. Provider port

`SmsProviderPort.sendMessage({ organizationId, recipientE164, body, idempotencyKey, ... })`  
→ `{ providerMessageId, providerStatus, acceptedAt }`

Implementation: `SentDmSmsAdapter` (fetch-based, mockable in tests).

---

## 7. Outbound lifecycle

1. RBAC + `COMMUNICATION_CENTER_SMS_ENABLED`
2. Validate + normalize phone (reuse `whatsapp-phone.util`)
3. Ensure `SmsConversation`
4. Insert `SmsMessage` `PENDING` with unique `businessOperationId`
5. Claim dispatch (`providerStatus=DISPATCHING`) for concurrency safety
6. Call sent.dm once with `Idempotency-Key = businessOperationId`
7. Persist `providerMessageId` + `QUEUED`
8. Project canonical `MESSAGE_SENT` (accepted only)

Provider rejection before accept: **no** `MESSAGE_SENT`.

---

## 8. Delivery lifecycle

| sent.dm fact | Native update | Canonical event |
|--------------|---------------|-----------------|
| API 202 QUEUED | `SmsMessage.QUEUED` | `MESSAGE_SENT` |
| `message.delivered` | `DELIVERED` | `MESSAGE_DELIVERED` |
| `message.failed` | `FAILED` | `MESSAGE_FAILED` |
| `message.received` | inbound row | `MESSAGE_RECEIVED` |

Webhook ACK: HTTP 200 after native + idempotent webhook row processed; projection failure logged without unsafe provider retries.

---

## 9. Inbound capability

**INBOUND SUPPORTED** when `message.received` webhook resolves tenant via `webhookEndpointId` (`OrgSmsConfig`) and creates native inbound `SmsMessage`.

---

## 10. Canonical event mapping table

| sent.dm / native fact | Canonical event | Direction | providerEventId | providerMessageId | Safe metadata | Idempotency identity |
|-----------------------|-----------------|----------|-----------------|-------------------|---------------|----------------------|
| API accept QUEUED | MESSAGE_SENT | OUTBOUND | `sms-sent:{nativeMessageId}` | sent.dm message_id | `providerLifecycleState` | canonical hash |
| message.delivered | MESSAGE_DELIVERED | OUTBOUND | `{message_id}:DELIVERED` | message_id | `providerLifecycleState` | canonical hash |
| message.failed | MESSAGE_FAILED | OUTBOUND | `{message_id}:FAILED` | message_id | `failureCode` | canonical hash |
| message.received | MESSAGE_RECEIVED | INBOUND | `{message_id}:RECEIVED` | message_id | none | canonical hash |

---

## 11. Actor semantics

Outbound `senderType`: `system` | `user` | `ai_agent` → canonical `CommunicationActorType`.

---

## 12. Idempotency

| Key | Purpose |
|-----|---------|
| `businessOperationId` | SynqDrive operation identity; unique per org; sent.dm `Idempotency-Key` |
| `providerMessageId` | Provider message correlation |
| `externalEventId` | `{providerMessageId}:{message_status}` webhook dedupe |
| `idempotencyKey` | Canonical projection SHA-256 digest (C1/C3 pattern) |

Replay of same business operation: returns existing native row; **no second provider call**.

---

## 13. Concurrency

`claimProviderDispatch` uses conditional `updateMany` (`PENDING` + `providerMessageId IS NULL`) before provider invocation. Loser awaits provider acceptance.

---

## 14. Provider correlation

All lifecycle events correlate via `providerMessageId`. Webhook cross-org attempts blocked when message org ≠ resolved org config.

---

## 15. Multi-tenancy

- Outbound uses org-scoped `OrgSmsConfig` + per-org API key env pattern
- Webhook resolves org via `webhookEndpointId` and/or existing `SmsMessage`
- Canonical queries always include `organizationId`

---

## 16. PII / content boundary

- Phone + body stored **native only** (`SmsConversation`, `SmsMessage`)
- Canonical metadata allowlist enforced (no phone/body)
- No raw webhook payload column on `SmsWebhookEvent`
- Structured logs exclude recipient/body/signatures

---

## 17. Webhook verification

HMAC-SHA256 per sent.dm docs; 5-minute timestamp skew window; invalid signature → 401.

---

## 18. Failure isolation

| Case | Behavior |
|------|----------|
| A. Provider reject before accept | No `MESSAGE_SENT`; caller error |
| B. Delivery failure webhook | `MESSAGE_FAILED` |
| C. Provider infra error | Exception; native `FAILED` if reject |
| D. Canonical projection error | Logged; no resend on retry |

---

## 19. Feature / config semantics

| Flag | Effect |
|------|--------|
| `COMMUNICATION_CENTER_SMS_ENABLED` | Billable outbound send |
| `COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED` | Canonical SMS projection only |
| `COMMUNICATION_CENTER_PROJECTION_ENABLED` | Enables SMS projection among global projection flags |

Projection flags **never** enable provider send.

---

## 20. Resend separation

**UNCHANGED.** Email remains Resend-only.

---

## 21. Tests

| Suite | Count |
|-------|-------|
| SMS postgres integration | **9/9** |
| sent.dm signature unit | 3 |
| SMS adapter unit | 2 |
| C1/C2/C3/C4 regression (selected) | pass |

---

## 22. Deployment

1. Merge + deploy with `COMMUNICATION_CENTER_SMS_ENABLED=false`
2. Configure sent.dm secrets per org in staging
3. Enable projection allowlist for pilot org
4. Test send + webhook delivery + replay
5. Connect business producers only under explicit product policy

---

## 23. Rollback

Disable `COMMUNICATION_CENTER_SMS_ENABLED`. Native/canonical tables are additive; no business producers wired in C5.

---

## 24. Known risks

1. Per-org sent.dm credential management still env-based (Integrations Hub UI deferred)
2. Inbound tenant resolution depends on `webhookEndpointId` configuration
3. Free-form SMS may be BLOCKED by sent.dm account rules (provider returns 202 + blocked lifecycle)
4. `DISPATCHING` lock is application-level (not DB enum) — operational convention only

---

## 25. C6/C7 readiness

**READY** for context resolver (C6) and read APIs (C7) to consume canonical SMS envelopes once enabled.

---

## Changes / Architektur

- **Changes:** updated via this record (in-repo `architecture/`)
- **Architektur:** SMS native + sent.dm adapter flow documented above; no Resend/WhatsApp/Voice architecture changes
