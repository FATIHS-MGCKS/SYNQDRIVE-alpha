# Stripe Connect — Testmode End-to-End Test Report (2026-07-14, Re-run)

**Prompt 4:** Full Stripe test-mode E2E of SynqDrive end-customer payments after Connect onboarding completion.  
**Host:** `https://app.synqdrive.eu` (hot-patched `main` @ `6d3a945` + VPS patches)  
**Mode:** Test only (`sk_test_`, `livemode=false`).

---

## Executive verdict

**READY FOR INTERNAL PILOT (testmode)** — with one ops follow-up

End-to-end payment, webhook reconciliation, idempotency, partial/full refund, and rollback simulation succeeded for FMS org after Connect onboarding was completed manually. Two production blockers were found and fixed during this run (webhook raw body, refund API params). Audit reports **HIGH=1** from **legacy** unresolved Connect webhook rows (pre-onboarding account attempts), not from the successful E2E payment path.

---

## 1. Test environment

| Item | Status |
|------|--------|
| API health | `GET /api/v1/health` → 200 |
| PM2 `synqdrive` | online |
| Test org | F.S Mobility Service `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Connected account | `acct_1TtCNf3ZTEq6a95J` — Express, DE, test, **ACTIVE** |
| `chargesEnabled` / `payoutsEnabled` | **true** / **true** |
| `paymentsEnabled` | `true` (rollback sim toggled false → true) |
| Connect webhook | `POST /api/v1/webhooks/stripe-connect` — **fixed** (raw body) |
| Platform Stripe | SynqDrive Sandbox `acct_1Tnz17…`, test mode |

---

## 2. Blockers found and fixed

| # | Issue | Impact | Fix |
|---|--------|--------|-----|
| 1 | `useBodyParser('json')` overwrote Nest `rawBody` capture | All Connect webhooks returned **HTTP 500** (`Stripe Connect webhook requires raw request body`); Stripe stopped retrying | `main.ts`: `verify` callback preserves `req.rawBody` |
| 2 | `createRefund` sent both `charge` and `payment_intent` to Stripe | Refunds failed with 422 | `stripe-connect-v1.adapter.ts`: prefer `payment_intent` only |
| 3 | Invoice validation subtracted deposit from rental-only invoice totals | Payment request creation failed | `booking-payment-invoice.validation.ts` (already patched) |

**Ops note:** Events that failed delivery before the raw-body fix (`pending_webhooks=0`) were **not** auto-replayed by Stripe. Use `scripts/ops/stripe-connect-e2e-replay-webhook.ts` or Stripe Dashboard “Resend” for those events.

---

## 3. Test booking and amounts

| Item | Value |
|------|--------|
| Booking | `2c4cc4cd-2076-4650-a146-92d8c2e8ca56` |
| Vehicle | KS FH 660E `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| Dates | 2026-10-01 → 2026-10-06 (5 days) |
| Online rent (commissionable) | **79 998 ct** (~800,00 EUR; VAT rounding) |
| Deposit (pickup only) | **50 000 ct** (500,00 EUR) — excluded from payment request |
| Payment intent | `payment_link` |
| Payment request | `40451bd5-d102-44cd-853e-e5aed4490aab` |
| Checkout session | `cs_test_a11s8Vx5OxfUMdkxyIrLv1ojb9UxPCbjxYIEgIDYdquSN0Sur41qd0rrWL` |
| Application fee | 2 000 ct (on 79 998 ct rent) |

---

## 4. Step results

| Step | Result |
|------|--------|
| 1 — Price / snapshot | ✅ Rent 79 998 ct commissionable, deposit 50 000 ct separate |
| 2 — Booking confirm (`payment_link`) | ✅ CONFIRMED, invoice ISSUED |
| 3 — Checkout session | ✅ CHECKOUT_READY, session created on connected account |
| 4 — Email | ⚠️ Not re-verified in this run (`sendEmail` off in recovery scripts) |
| 5 — Test payment | ✅ `pi_3TtEod3ZTEq6a95J0Sozl6Wg` succeeded (`tok_visa` / 4242-equivalent) |
| 6 — Webhook + reconciliation | ✅ `payment_intent.succeeded` ingested → PR **PAID**, invoice **PAID**, ledger CHARGE + APPLICATION_FEE |
| 7 — Replay / idempotency | ✅ Duplicate replay → `skipped_duplicate` |
| 8 — Negative: bad signature | ✅ HTTP 400 |
| 9 — Partial refund | ✅ 20 000 ct → PARTIALLY_REFUNDED |
| 10 — Full refund | ✅ 59 998 ct → **REFUNDED** |
| 11 — Dispute | ⏭️ Not live-tested (unit tests pass) |
| 12 — Audits | ⚠️ HIGH=1 legacy unresolved webhooks; MEDIUM=2 legacy fake-PAID candidates |
| 13 — Build / tests | ✅ `nest build`, 302 Jest suites green |
| 14 — Rollback sim | ✅ `paymentsEnabled=false` then restored `true` |

---

## 5. Ledger snapshot (canonical E2E payment)

After `evt_3TtEod3ZTEq6a95J0UQDwrzW` reconciliation:

- `BookingPaymentRequest.status` = PAID → PARTIALLY_REFUNDED → REFUNDED
- `Booking.paymentStatus` = PAID → REFUNDED
- `OrgInvoice.status` = PAID → adjusted by refunds
- `PaymentTransaction`: CHARGE:SUCCEEDED, APPLICATION_FEE:SUCCEEDED, REFUND rows
- `stripe_connect_webhook_events`: PROCESSED for replayed success event

---

## 6. Prerequisites

| Prerequisite | Result |
|--------------|--------|
| Frontend build | ✅ (not re-run this session; prior green) |
| Backend build | ✅ |
| Prisma validate | ✅ |
| `chargesEnabled=true` | ✅ |
| Connect webhook ingest | ✅ (after raw-body fix) |
| Unit/integration tests | ✅ 2548 passed |

---

## 7. Residual ops / pilot caveats

1. **Purge or resolve 17 `UNRESOLVED_ACCOUNT` webhook rows** from pre-onboarding Connect attempts (audit HIGH).
2. **Resend failed Stripe webhook deliveries** from before 2026-07-14 ~22:24 UTC if any payments occurred during that window.
3. **Browser Checkout UI** not automated (Stripe hosted page / agent browser limits); API `tok_visa` confirm used for payment step.
4. **Email outbox** not asserted in this re-run.

---

## 8. Files changed (this re-run)

- `backend/src/main.ts` — raw body capture for webhooks
- `backend/src/modules/payments/stripe/stripe-connect-v1.adapter.ts` — refund params
- `backend/src/modules/payments/booking-payment-invoice.validation.ts` — deposit alignment
- `backend/scripts/ops/stripe-connect-e2e-*.ts` — E2E ops tooling

---

**Report author:** Cursor Cloud Agent (Prompt 4 re-run)  
**Date:** 2026-07-14
