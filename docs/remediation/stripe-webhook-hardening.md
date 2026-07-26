# Master Admin Remediation — Phase 2B.3: Stripe Webhook Hardening

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** All SynqDrive Stripe webhook ingress paths (billing + Connect)

---

## 1. Executive summary

SynqDrive exposes two public Stripe webhook endpoints:

| Route | Module | Secret env |
|-------|--------|------------|
| `POST /api/v1/webhooks/stripe` | `modules/billing` | `STRIPE_WEBHOOK_SECRET` |
| `POST /api/v1/webhooks/stripe-connect` | `modules/payments` | `STRIPE_CONNECT_WEBHOOK_SECRET` |

Both paths now share a **canonical webhook security layer** (`stripe-webhook-security.util.ts`) that enforces:

- Configured webhook secrets (separate per route)
- Stripe SDK signature verification with configurable replay window
- SHA-256 payload hashing for tamper detection
- Terminal-state idempotency (deterministic skip)
- Failed-event retry (deterministic re-process on Stripe redelivery)
- Structured ingest logging

**Goal:** Every webhook delivery is verified, stored once, and processed exactly once per terminal outcome — with safe retries on transient failures.

---

## 2. Audit — before remediation

### 2.1 What already worked

| Control | Billing | Connect |
|---------|---------|---------|
| Public route (no JWT) | ✅ `auth.guard` allowlist | ✅ |
| Raw body for HMAC | ✅ `main.ts` `rawBody: true` | ✅ |
| Separate webhook secret | ✅ `STRIPE_WEBHOOK_SECRET` | ✅ `STRIPE_CONNECT_WEBHOOK_SECRET` |
| `stripe.webhooks.constructEvent` | ✅ | ✅ |
| DB store by `stripeEventId` (unique) | ✅ `stripe_webhook_events` | ✅ `stripe_connect_webhook_events` |
| Duplicate skip (processed) | ✅ PROCESSED only | ⚠️ skipped **all** existing rows |
| Retry on FAILED | ✅ | ❌ treated as duplicate |
| Payload hash stored | ✅ column exists | ✅ column exists |
| Payload hash enforced | ❌ | ❌ |
| Replay window config | ❌ SDK default only | ❌ |
| Terminal IGNORED skip | ❌ re-dispatched | ❌ |
| Processor failure → Stripe retry | ✅ billing throws | ❌ swallowed (HTTP 200) |
| Structured logging | partial | ✅ payment metrics |

### 2.2 Gaps fixed in 2B.3

1. **Connect FAILED events ignored** — Stripe redeliveries were skipped; reconciliation never retried.
2. **Billing IGNORED / UNRESOLVED_MAPPING re-processed** — non-deterministic duplicate dispatch.
3. **No payload hash conflict detection** — same `evt_*` with different body could overwrite silently.
4. **No explicit replay tolerance config** — relied on Stripe SDK default (300s) without env control.
5. **Connect processor swallowed errors** — HTTP 200 even when reconciliation failed.
6. **Controllers threw generic `Error`** for missing raw body instead of `400 Bad Request`.

---

## 3. Security controls (implemented)

### 3.1 Webhook secrets

- Billing and Connect use **different** signing secrets (Stripe Dashboard endpoints).
- Missing secret → `400 Bad Request` before processing.
- Secrets never logged; only event id / type / org in structured logs.

### 3.2 Signature verification

```typescript
constructVerifiedStripeEvent(stripe, rawBody, signature, webhookSecret, toleranceSeconds)
```

- Uses Stripe SDK `constructEvent` with explicit tolerance.
- Missing `stripe-signature` header → `400`.
- Invalid signature → `400` (Stripe will retry for 3 days).

**Env:** `STRIPE_WEBHOOK_TOLERANCE_SECONDS` (default `300`).

### 3.3 Replay protection

Stripe's signed timestamp is validated inside `constructEvent` within the tolerance window. This prevents acceptance of ancient replayed payloads without a valid recent signature.

### 3.4 Payload hashing

```typescript
payloadHash = sha256(rawBody)
```

Stored on ingest. On redelivery:

- Same `stripeEventId` + same hash → idempotent skip or retry (by status)
- Same `stripeEventId` + **different** hash → `400 STRIPE_WEBHOOK_PAYLOAD_HASH_MISMATCH` (tamper / misconfiguration)

### 3.5 Idempotency & terminal states

**Billing** (`StripeWebhookEventStatus`):

| Status | On redelivery |
|--------|---------------|
| `PROCESSED` | Skip (`skipped_processed`) |
| `IGNORED` | Skip (`skipped_terminal`) |
| `UNRESOLVED_MAPPING` | Skip (`skipped_terminal`) |
| `FAILED` | Retry dispatch, increment `retryCount` |
| `RECEIVED` | Retry (concurrent delivery race) |

**Connect** (`StripeConnectWebhookProcessingStatus`):

| Status | On redelivery |
|--------|---------------|
| `PROCESSED` | Skip (`skipped_duplicate`) |
| `IGNORED` | Skip (`skipped_terminal`) |
| `UNRESOLVED_ACCOUNT` | Skip (`skipped_terminal`) |
| `FAILED` | Update row + re-run reconciliation, increment `attempts` |
| `RECEIVED` | Retry (race) |

### 3.6 Retries

| Layer | Behavior |
|-------|----------|
| **Stripe → SynqDrive** | Non-2xx on processing failure triggers Stripe redelivery (up to 3 days) |
| **Billing ingest** | FAILED rows re-dispatch on redelivery; throws on handler error |
| **Connect ingest** | Processor rethrows after marking FAILED → HTTP 5xx → Stripe retry |
| **Internal worker** | `findPendingForReconciliation` picks RECEIVED/FAILED Connect events (`payment-connect-reconciliation.service`) |

### 3.7 Logging

Structured prefix: `STRIPE_WEBHOOK <CODE> key=value ...`

| Code | When |
|------|------|
| `BILLING_SKIP_TERMINAL` | Terminal billing event skipped |
| `BILLING_IGNORED_EVENT_TYPE` | Unsupported event type |
| `BILLING_PROCESSED` | Successful dispatch |
| `BILLING_PROCESS_FAILED` | Handler error |
| `BILLING_PAYLOAD_HASH_MISMATCH` | Tamper detected |
| `CONNECT_SKIP_TERMINAL` | Terminal connect event skipped |
| `CONNECT_PROCESS_FAILED` | Reconciliation error |
| `CONNECT_PAYLOAD_HASH_MISMATCH` | Tamper detected |
| `CONNECT_STORE_FAILED` | DB persist error |

Connect reconciliation retains existing `CONNECT_WEBHOOK_RECONCILED` payment logs.

---

## 4. Deterministic processing flow

### Billing (synchronous)

```
HTTP POST → verify signature → livemode check
  → resolve ingest action (create | skip_terminal | retry | conflict)
  → store RECEIVED (or skip)
  → dispatch handler (if supported type)
  → mark PROCESSED | IGNORED | UNRESOLVED_MAPPING | FAILED
  → return 200 | throw (FAILED → Stripe retry)
```

### Connect (store + inline reconcile)

```
HTTP POST → verify signature → livemode check
  → resolve ingest action
  → store / update row
  → if MVP type + resolved account → reconcile inline
  → mark PROCESSED | FAILED
  → return 200 | throw (FAILED → Stripe retry)
```

**Determinism guarantee:** Handlers operate on stored `safePayload` / `safeEventData` snapshots; terminal states never re-run business logic.

---

## 5. Database schema (unchanged)

| Table | Idempotency key | Hash column | Retry counter |
|-------|-----------------|-------------|---------------|
| `stripe_webhook_events` | `stripe_event_id` UNIQUE | `payload_hash` | `retry_count` |
| `stripe_connect_webhook_events` | `stripe_event_id` UNIQUE | `payload_hash` | `attempts` |

No migration required for 2B.3.

---

## 6. Configuration

```env
STRIPE_WEBHOOK_SECRET=whsec_...           # Billing endpoint
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...   # Connect endpoint
STRIPE_WEBHOOK_TOLERANCE_SECONDS=300      # Signature replay window
```

Production: create **separate** Dashboard webhook endpoints for test vs live; each with its own signing secret matching the active `STRIPE_SECRET_KEY` mode.

---

## 7. Files changed

| File | Change |
|------|--------|
| `backend/src/shared/stripe/stripe-webhook-security.util.ts` | **New** — shared security + idempotency |
| `backend/src/shared/stripe/stripe-webhook-security.util.spec.ts` | **New** — unit tests |
| `backend/src/config/stripe.config.ts` | `webhookToleranceSeconds` |
| `backend/src/modules/billing/stripe-webhook.service.ts` | Hardened ingest |
| `backend/src/modules/billing/stripe-webhook.controller.ts` | `BadRequestException` for missing raw body |
| `backend/src/modules/payments/stripe-connect-webhook.service.ts` | Hardened ingest + FAILED retry |
| `backend/src/modules/payments/stripe-connect-webhook.processor.ts` | Rethrow on reconcile failure |
| `backend/src/modules/payments/stripe-connect-webhook.controller.ts` | `BadRequestException` |
| `backend/src/modules/payments/repositories/stripe-connect-webhook-event.repository.ts` | Extended update fields |
| `backend/.env.example` | `STRIPE_WEBHOOK_TOLERANCE_SECONDS` |

---

## 8. Verification

```bash
cd backend
npx jest src/shared/stripe/stripe-webhook-security.util.spec.ts
npx jest src/modules/billing/stripe-webhook.service.spec.ts
```

Manual:

1. Send duplicate `evt_*` with valid signature → `duplicate: true`, no double billing mirror.
2. Replay FAILED event from Stripe Dashboard → row reprocessed, `retryCount` / `attempts` incremented.
3. Tamper body but keep event id → `400 PAYLOAD_HASH_MISMATCH`.

---

## 9. Related phases

- **2B.2** — Stripe test/live environment separation (livemode guards; separate PR #967)
- **2B.1** — Billing source of truth (webhook → mirror architecture)

**Changes / Architektur:** Updated in SynqDrive Master UI.
