# Communication Center C5.2 — sent.dm SMS Runtime

**Phase:** C5.2 (production send + webhook processing + canonical projection)
**Depends on:** C5.1 native persistence + webhook security (PR #1127)
**Date verified against sent.dm docs:** 2026-08-21
**Branch:** `feature/communication-center-c5-2-sentdm-runtime`

---

## 1. Scope

C5.2 adds billable/runtime sent.dm integration on top of C5.1:

- `SmsService.sendOutbound` orchestration
- `SentDmSmsAdapter` HTTP client
- `SmsWebhookController` + `SmsWebhookProcessorService`
- Canonical projection bridge via existing `SmsCommunicationProjectionIntegration`
- Manual authenticated send endpoint (`communication.write`)
- Credential-less CI with HTTP mocks + PostgreSQL

**Not in scope:** Communication Center UI, automated business SMS producers, bulk/campaign, templates UI.

---

## 2. C5.1 dependency

Reuses without duplication:

- `SmsMessageRepository` dispatch state machine (`firstDispatchAttemptedAt`, `DISPATCH_AMBIGUOUS`, `idempotency_expired`)
- `SmsWebhookSecurityService` fail-closed ingress (`X-Webhook-ID` authoritative)
- `SmsConversationRepository` tenant-validated ensure/enrich
- `SmsWebhookEventRepository` dedupe store
- Canonical adapter `SentDmSmsCommunicationAdapter`

---

## 3. Official sent.dm contract (verified 2026-08-21)

| Item | Value |
|------|--------|
| Base URL | `https://api.sent.dm` |
| API version | `v3` |
| Send endpoint | `POST /v3/messages` |
| Auth | `x-api-key` header |
| Sender profile | `x-profile-id` header (org API key) |
| Recipient | `to: string[]` (E.164) |
| SMS channel pin | `channel: ["sms"]` |
| Free-form body | `text` (exclusive with `template`) |
| Idempotency | `Idempotency-Key` header, 24h cache, pattern `^[a-zA-Z0-9_-]+$` |
| Success response | HTTP `202`, `data.recipients[].message_id`, `data.status` |
| Webhook signature | HMAC-SHA256 over `{webhookId}.{timestamp}.{rawBody}`, header `x-webhook-signature: v1,{base64}` |
| Webhook tenant header | `X-Webhook-ID` = webhook configuration UUID |
| Webhook dedupe | `message_id` + `message_status` (not `X-Webhook-ID`) |
| Inbound contact | `inbound_number` = remote sender; `outbound_number` = provisioned receiving number |

No C5.1 schema contradiction found.

---

## 4. Credential model

**DB (`OrgSmsConfig`):** metadata flags only (`apiKeyConfigured`, `webhookSigningSecretConfigured`, account/profile/endpoint IDs).
**Secrets (env):**

- `SENT_DM_API_KEY` or `SENT_DM_API_KEY_<ORG_ID>`
- `SENT_DM_WEBHOOK_SIGNING_SECRET` or `SENT_DM_WEBHOOK_SIGNING_SECRET_<ORG_ID>`

No raw secrets in Prisma fields.

---

## 5. Provider readiness contract

`SmsConfigService.evaluateReadiness()` — single gate for outbound:

- `COMMUNICATION_CENTER_SMS_ENABLED=true`
- `OrgSmsConfig` exists, `isConnected`, `isActive`
- `sentDmAccountId`, `senderProfileId`, `apiKeyConfigured`
- resolvable API key in env

Webhook path additionally requires `webhookEndpointId` + `webhookSigningSecretConfigured`.

---

## 6. Provider adapter

`SentDmSmsAdapter` (`backend/src/modules/sms/providers/sentdm-sms.adapter.ts`):

- Builds JSON request, applies timeout (default 30s)
- Classifies errors: `TERMINAL_REJECTION`, `RATE_LIMIT`, `TRANSIENT_5XX`, `NETWORK_TIMEOUT`, `AUTH_CONFIGURATION`, `MALFORMED_RESPONSE`
- Does not mutate native rows or canonical events

---

## 7. Outbound state machine

Uses C5.1 repository contract unchanged:

`PENDING → DISPATCHING → QUEUED → SENT → DELIVERED`
ambiguous: `DISPATCH_AMBIGUOUS` (retryable within `firstDispatchAttemptedAt + 24h`)

---

## 8. Idempotency key

```text
sdm_{sha256(organizationId + ":" + businessOperationId).hex.slice(0,60)}
```

Stable across retries; no phone/body/PII.

---

## 9. Crash recovery

Replay with same `businessOperationId` reuses same `SmsMessage` row and same sent.dm `Idempotency-Key` within 24h window anchored at `firstDispatchAttemptedAt`.

---

## 10. Provider error classification

| Class | Native action | Canonical |
|-------|---------------|-----------|
| Terminal 4xx | `recordTerminalProviderRejection` → FAILED | none for dispatch reject |
| Timeout / 5xx / 429 | `recordAmbiguousDispatchFailure` → DISPATCH_AMBIGUOUS | no MESSAGE_FAILED |

---

## 11–13. Webhook security / raw body / tenant routing

- Global Nest `rawBody: true` (`main.ts`)
- `SmsWebhookController` requires `req.rawBody` Buffer
- `SmsWebhookSecurityService.verifyIngress` before any mutation
- No cross-org fallback routing

---

## 14. Webhook idempotency

`externalEventId = buildSmsWebhookExternalEventId(message_id, message_status)`
`SmsWebhookEventRepository.beginProcessing` + `processedAt` reclaim for crash recovery.

---

## 15–17. Delivery / inbound / monotonic native state

`applyDeliveryStatusUpdateByProviderMessageId` with `shouldApplyNativeDeliveryTransition` — no downgrade from `DELIVERED`.

Inbound uses `inbound_number`, idempotent `createInboundMessage`, unread increment only on `created: true`.

---

## 18. Canonical mapping

| Native fact | Canonical event |
|-------------|-----------------|
| Outbound acceptance (QUEUED) | `MESSAGE_SENT` |
| Inbound message | `MESSAGE_RECEIVED` (`unreadDelta: 1`) |
| DELIVERED webhook | `MESSAGE_DELIVERED` |
| FAILED webhook | `MESSAGE_FAILED` |

Projection failures are logged; provider acceptance is not rolled back.

---

## 19. Actor / RBAC

`POST /organizations/:orgId/sms/messages` requires `communication.write`.
`Idempotency-Key` header required → `businessOperationId`.
Actor: authenticated user (`senderType: user`). No public `actorType` / `sandbox` DTO fields.

---

## 20. PII boundary

Logs include orgId, webhookEndpointId, providerMessageId, status — never phone/body/signature/secrets.

---

## 21. Feature flags

| Flag | Effect |
|------|--------|
| `COMMUNICATION_CENTER_SMS_ENABLED` | Runtime send + webhook processing |
| `COMMUNICATION_CENTER_SMS_PROJECTION_ENABLED` | Canonical writes only |

SMS enabled alone does not auto-send.

---

## 22. Credential-less CI

HTTP mock via jest `fetch` stub on `SentDmSmsAdapter`; signed webhook fixtures; disposable PostgreSQL.

---

## 23. Live provider test

**Provider connectivity smoke test** — `backend/scripts/test/sentdm-sms-live.integration.sh`
Opt-in via `SENT_DM_LIVE_INTEGRATION=1`. Exercises sent.dm `POST /v3/messages` directly only.
Does **not** validate SynqDrive `SmsController`, persistence, dispatch claim/idempotency, or canonical projection.

**SynqDrive runtime E2E validation** — `backend/scripts/test/synqdrive-sms-runtime-e2e.integration.sh`
Opt-in via `SYNQDRIVE_SMS_E2E_VALIDATION=1`. Authenticated call to deployed/staging
`POST /organizations/:orgId/sms/messages` with `communication.write`, explicit `Idempotency-Key`,
staging/test org, and dedicated test recipient. Verify `SmsMessage` → QUEUED, `CommunicationEvent` →
`MESSAGE_SENT`, then webhook → DELIVERED / `MESSAGE_DELIVERED`. No credentials/phone/body logged.
One SMS maximum per invocation. Never runs automatically.

---

## C5.2 pre-live hardening (PR #1134)

### Immutable request semantics (`businessOperationId`)

`Idempotency-Key` → `businessOperationId` identifies one immutable logical SMS operation.
Before replay/reclaim/provider invocation, SynqDrive compares the incoming request against the persisted
`SmsMessage` + `SmsConversation`:

| Condition | Result |
|-----------|--------|
| Same `businessOperationId` + same normalized recipient + same content | Valid replay |
| Same key + different recipient and/or content | HTTP **409** `idempotency_conflict` / `IDEMPOTENCY_CONFLICT`, **zero** provider calls |
| Context enrichment (`customerId` / `bookingId` / `vehicleId`) | Same-org enrich policy only; never mutates SMS payload |

Implementation: `detectSmsIdempotencyPayloadMismatch` in `sms-idempotency.ts`, enforced in `SmsService.sendOutbound` **before** `claimProviderDispatch`.

### Monotonic conversation activity

`recordOutboundActivity` / `recordInboundActivity` use PostgreSQL `GREATEST` atomically:

- `lastMessageAt = max(existing, occurredAt)`
- `lastCustomerMessageAt = max(existing, occurredAt)` (inbound)
- `lastMessagePreview` updates only when `occurredAt >= current lastMessageAt`
- `unreadCount` increments per newly-created distinct inbound message (replay does not increment)

### DB-authoritative delivery transitions

`applyDeliveryStatusUpdate` uses conditional `updateMany` with `eligibleCurrentStatusesForDeliveryTransition`.
Concurrent/out-of-order SENT + DELIVERED webhooks cannot downgrade DELIVERED → SENT. FAILED/BLOCKED terminal semantics preserved.

### Webhook processing ownership (bounded lease)

`SmsWebhookEvent.processingClaimedAt` records **local** processing-ownership time (C5.2 migration
`20260822040000_communication_center_c5_2_sms_webhook_processing_lease`). `processingError = in_progress`
alone is **not** a lease — it requires `processingClaimedAt` + `SMS_WEBHOOK_PROCESSING_LEASE_MS` (120s).

| State | Meaning |
|-------|---------|
| `processedAt != null` | Terminally processed |
| `in_progress` + recent `processingClaimedAt` | Active owner — peers get `held_by_peer` |
| `in_progress` + stale `processingClaimedAt` | Dead owner — atomically reclaimable |
| `processing_failed` / `unknown_provider_message` | Immediately reclaimable (no active lease) |

`tryClaimProcessing` uses conditional `updateMany` (no read→decide→unconditional-write race). Concurrent
stale reclaim: exactly one `claimed`, others `held_by_peer`.

`markProcessed` / `markProcessingError` / `markUnknownProviderMessage` clear `processingClaimedAt` and only
mutate rows where `processedAt IS NULL` — a late stale owner cannot corrupt a completed event.

**Partial-processing crash recovery:** retry re-attempts canonical projection (idempotent) when native state
already exists — e.g. DELIVERED without `processedAt`, inbound row without projection, canonical already
written before `markProcessed`. Converges to exactly one native/canonical side effect.

### Unknown `providerMessageId` policy (outbound delivery webhooks)

When a signed delivery webhook references a `providerMessageId` with no local `SmsMessage`:

- **Do not** mark `processedAt` (event stays retryable)
- Set `processingError = unknown_provider_message` for operator visibility
- **Do not** fabricate `SmsMessage` from delivery webhook alone
- Distinguishes truly stale provider events from crash-window uncorrelated acceptance (aligns with `DISPATCH_AMBIGUOUS` reconciliation)

### `acceptedAt` authority

sent.dm `202` responses include `meta.timestamp` (server response generation time).
`SentDmSmsAdapter` uses `meta.timestamp` when present (`acceptedAtSource: provider_meta_timestamp`).
When absent, falls back to local provider-response receipt time (`local_receipt_fallback`) — not claimed as provider-authored.

### Live test safety

- Runtime default OFF; staging/test org only
- No automatic business producers
- Explicit test recipient; one SMS per invocation
- No production customer numbers; no secrets/body/phone in logs
- Sandbox billability: verify against official sent.dm docs before assuming non-billable

---

## 24. Tests

- C5.1 dispatch + security postgres suites (preserved)
- C5.2 unit: adapter, idempotency key, status monotonicity
- C5.2 postgres: `sms-runtime.postgres.integration.spec.ts` + `sms-webhook-lease.postgres.integration.spec.ts`

---

## 25–27. Deployment / rollback / risks

Deploy with runtime flag off → configure test org → explicit manual send → verify webhooks → enable per org.

Rollback: disable flags/config; C5.1 persistence retained.

**Risks:** free-form SMS requires open conversation per sent.dm rules; org must configure sender profile + template strategy for cold outreach separately.

---

## 28. C6 readiness

Runtime + canonical projection hooks exist. C6 context resolver / read APIs not included — **NOT READY** for C6 until those phases land.

---

## Event mapping table (verified states)

| sent.dm fact | Native transition | Canonical | ACK |
|--------------|-------------------|-----------|-----|
| `POST /v3/messages` 202 | DISPATCHING → QUEUED | MESSAGE_SENT | n/a |
| `message.received` | inbound DELIVERED row | MESSAGE_RECEIVED | 200 |
| `message.sent` | QUEUED → SENT (monotonic) | — | 200 |
| `message.delivered` | → DELIVERED | MESSAGE_DELIVERED | 200 |
| `message.failed` | → FAILED | MESSAGE_FAILED | 200 |
| Replay same ext event id | no-op | no duplicate | 200 |

---

## Changes / Architektur

- **Changes:** C5.2 pre-live hardening + bounded webhook processing lease (`processingClaimedAt`)
- **Architektur:** SMS runtime hardening on C5.1 foundation; canonical projection contract unchanged
