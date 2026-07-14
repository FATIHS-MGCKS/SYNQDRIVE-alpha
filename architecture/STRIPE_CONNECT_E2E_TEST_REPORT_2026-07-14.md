# Stripe Connect — Testmode End-to-End Test Report (2026-07-14)

**Prompt 4:** Full Stripe test-mode E2E of SynqDrive end-customer payments.  
**Release under test:** `20260714181422_v4994` (`361803f`) on `https://app.synqdrive.eu`  
**Mode:** Test only (`sk_test_`, `livemode=false`). No live customers, webhooks, refunds, or payouts.

---

## Executive verdict

**NOT READY FOR INTERNAL PILOT**

**Primary blocker:** Connect Express onboarding for the FMS test org could not be completed — `chargesEnabled=false`. Stripe Connect hosted onboarding is protected by CAPTCHA; automated and agent-browser completion failed. Without `chargesEnabled=true`, Steps 1–11 (booking → checkout → payment → webhook → refund → dispute) could not be executed.

---

## 1. Test environment

| Item | Status |
|------|--------|
| Host | `app.synqdrive.eu` (shared prod host, test Stripe keys only) |
| API health | `GET /api/v1/health` → 200 |
| PM2 `synqdrive` | online |
| Database | PostgreSQL `synqdrive`, 106 migrations applied |
| Stripe platform | `acct_1Tnz17…` — SynqDrive Sandbox, DE, EUR, test mode |
| Test org | F.S Mobility Service `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `paymentsEnabled` | Was `true` during prerequisite check; set `false` in Step 14 rollback simulation |
| Connect webhook | `POST /api/v1/webhooks/stripe-connect` reachable |
| Worker / reconciliation | Payment reconciliation scheduler present in deployed code; PM2 stable |

---

## 2. Connected account status

| Field | Value |
|-------|-------|
| DB row id | `6f8041ef-35ce-4c19-92bb-e34084d4dab4` |
| Stripe account | `acct_1TtB6x…` (Express, DE, V1) |
| `livemode` | `false` |
| `status` | `DISABLED` |
| `chargesEnabled` | **false** ❌ |
| `payoutsEnabled` | `false` |
| `detailsSubmitted` | `false` |
| `disabledReason` | `requirements.past_due` |
| Requirements due | business_type, mcc, external_account, representative fields, tos_acceptance |

**Onboarding attempts:** Account Links generated; hosted flow blocked by Stripe CAPTCHA before form access. Direct API field population denied for Express (`controller.requirement_collection=stripe`). No test connected account in Stripe list has `charges_enabled=true`.

---

## 3. Test booking and amounts

**Not executed** — blocked by `chargesEnabled=false`.

Planned test data (per spec):

| Item | Planned value |
|------|----------------|
| Rent (online) | 80 000 ct (800,00 EUR) |
| Deposit (pickup only) | 50 000 ct (500,00 EUR) |
| Payment intent | `payment_link` |
| Customer email | distinct test address (e.g. `synqdrive-e2e-test@…`) |
| Vehicle | FMS org AVAILABLE vehicle |

---

## 4–11. Payment flow steps (1–11)

All blocked at prerequisite gate. No `BookingPaymentRequest`, Checkout Session, PaymentIntent, or ledger rows created during this run.

| Step | Status |
|------|--------|
| 1 — Price / snapshot | Not executed |
| 2 — Booking confirm | Not executed |
| 3 — Checkout session | Not executed |
| 4 — Email | Not executed |
| 5 — Successful test payment | Not executed |
| 6 — Webhook + reconciliation | Not executed |
| 7 — Replay / out-of-order | Not executed (covered by unit/integration tests only) |
| 8 — Negative cases | Partially verified (see §13) |
| 9 — Partial refund | Not executed |
| 10 — Full refund | Not executed |
| 11 — Dispute | Not live-verified; service tests pass (see §15) |

---

## 12. Prerequisites verified

| Prerequisite | Result |
|--------------|--------|
| Frontend production build (`tsc -b && vite build`) | ✅ Green |
| Backend build (`nest build`) | ✅ Green |
| Prisma validate | ✅ Valid |
| Prisma migrations (VPS) | ✅ 106 applied, up to date |
| `audit-connect-payment-integrity.ts` | ✅ HIGH = 0 (2 MEDIUM legacy fake-PAID) |
| `audit-fake-paid-card-invoices.ts` | ✅ HIGH = 0 (2 MEDIUM legacy) |
| Test Connected Account present | ✅ Row exists |
| `chargesEnabled=true` | ❌ **BLOCKER** |
| Connect webhook reachable | ✅ Route live |
| `paymentsEnabled=true` (during prep) | ✅ Was enabled; disabled in rollback sim |

---

## 13. Negative cases (partial)

| Case | Result |
|------|--------|
| Invalid webhook signature (body + bad `stripe-signature`) | ✅ HTTP 400, signature verification failed |
| Empty POST (no body / no signature) | ⚠️ HTTP 500 — raw body guard throws (not E2E blocker) |
| `chargesEnabled=false` checkout | Not reached — onboarding incomplete |
| Declined card / 3DS / expired session / refunds | Not executed |
| Manipulated client amounts / cross-tenant | Not executed (server-side guards covered by 221 payment unit tests) |

---

## 14. Rollback simulation (Step 14)

Executed without deleting financial data:

1. `paymentsEnabled=false` for FMS org — ✅ applied
2. `organization_payment_accounts` row still readable — ✅
3. `stripe_connect_webhook_events` count unchanged (0) — ✅
4. `payment_transactions` / `booking_payment_requests` for org unchanged (0) — ✅
5. No open checkout session existed to process
6. Schema compatible with deployed release (106 migrations)

---

## 15. Dispute

Stripe test-mode live dispute trigger **not verified** (no successful charge).  
**Code coverage:** `stripe-connect-webhook.service.spec.ts` and processor tests include dispute event handling paths.

---

## 16. Audit results (post-E2E)

| Audit | HIGH | MEDIUM | Notes |
|-------|------|--------|-------|
| `audit-connect-payment-integrity.ts` | 0 | 2 | Legacy pre-payment-stack fake CARD invoice payments |
| `audit-fake-paid-card-invoices.ts` | 0 | 2 | Same legacy rows |

---

## 17. Build and test results

| Command | Result |
|---------|--------|
| `npm run prisma:validate` (backend) | ✅ Pass |
| `npm run build` (backend) | ✅ Pass |
| `npx jest --testPathPattern=src/modules/payments` | ✅ 31 suites, 221 tests pass |
| Payment integration specs (connect flow, reconciliation, webhook) | ✅ 14 tests pass |
| `npm test` (backend full) | ✅ 302 suites, 2547 tests pass |
| `npm run build` (frontend, includes `tsc -b`) | ✅ Pass |
| `npm test` (frontend) | ⚠️ 1 fail — `dashboardAttentionBuilder.test.ts` (unrelated to payments) |

---

## 18. Remaining risks

1. **Connect onboarding CAPTCHA** — blocks automated and agent E2E in test mode; requires human completion of Account Link flow with Stripe test tokens (DOB `1901-01-01`, SMS `000-000`, `address_full_match`, etc.).
2. **No real payment path verified** — webhook idempotency, fee refund math, and booking summary PAID transition unproven in production DB.
3. **Shared prod host** — test org on live VPS; strict org scoping and `paymentsEnabled` flag are critical.
4. **Legacy MEDIUM audit findings** — pre-stack CARD invoice rows without Stripe references (not introduced by this E2E).

---

## 19. Next actions (human)

1. Complete Express onboarding manually: generate Account Link → finish hosted flow → `POST …/payments/connect/refresh`.
2. Confirm `chargesEnabled=true`, `livemode=false` in DB and Stripe.
3. Re-run Prompt 4 E2E Steps 1–11 with test booking 800 EUR rent + 500 EUR deposit.
4. Re-enable `paymentsEnabled=true` for FMS org before pilot testing.

---

## Code references (unchanged this run)

- Direct Charge adapter: `backend/src/modules/payments/stripe/stripe-connect-v1.adapter.ts`
- Webhook ingress: `backend/src/modules/payments/stripe-connect-webhook.controller.ts`
- Audits: `backend/scripts/ops/audit-connect-payment-integrity.ts`, `audit-fake-paid-card-invoices.ts`
