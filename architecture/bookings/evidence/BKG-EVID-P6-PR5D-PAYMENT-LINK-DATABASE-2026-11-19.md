# P6-PR5D — Database-backed wizard payment_link + BookingPaymentRequest

**Date:** 2026-11-19 (Europe/Berlin)  
**Epistemic:** CONFIRMED (unit compile) / PENDING (disposable Postgres CI 22/22) / NOT_CLAIMED (Production)

## Scope

HTTP wizard confirm with `paymentIntent=payment_link` on disposable PostgreSQL. Real persistence for:

- `BookingWizardPaymentFlowService`
- `BookingPaymentRequestService`
- `BookingPaymentRequestRepository`
- `PaymentStatusService`

**External boundary (mocked only):** `StripeCheckoutService.createCheckoutSessionForPaymentRequest`  
**Email boundary (mocked):** `PaymentEmailEnqueueService` — no real delivery asserted.

## Certification tiers

| Tier | Claim |
|------|-------|
| **PAYMENT_REQUEST_DATABASE_VERIFIED** | **YES (when CI 22/22)** — one `BookingPaymentRequest` row per confirmed `payment_link` booking; org/booking/invoice/customer alignment |
| **PAYMENT_REQUEST_IDEMPOTENCY_VERIFIED** | **YES (when CI green)** — duplicate HTTP confirm does not duplicate booking, invoice, or payment request; Stripe mock call count unchanged on replay |
| **CONNECT_READINESS_GATE_VERIFIED** | **YES (when CI green)** — confirm blocked when Connect not ACTIVE/`chargesEnabled`; checkout-context reports `CONNECT_ACCOUNT_NOT_READY` |
| **STRIPE_FAILURE_PERSISTENCE_VERIFIED** | **YES (when CI green)** — booking `CONFIRMED`, payment request persisted, checkout partial failure surfaced; invoice not `PAID` |
| **INVOICE_UNPAID_INVARIANT_VERIFIED** | **YES (when CI green)** — `OrgInvoice` remains not `PAID` after `payment_link` confirm |
| **ELIGIBILITY_DATABASE_E2E_VERIFIED** | **NOT_VERIFIED** — inherits P6-PR5C bounded eligibility stubs (see PR5C evidence) |
| **FULL_RENTAL_LIFECYCLE_DATABASE_E2E_VERIFIED** | **NOT_CLAIMED** |

### Explicit non-claims

- **REAL_STRIPE_CAPTURE_VERIFIED**
- **PAYMENT_SETTLEMENT_VERIFIED**
- **STRIPE_WEBHOOK_VERIFIED**
- **ASYNC_EMAIL_DELIVERY_VERIFIED**
- **PRODUCTION_VALIDATED**

## Fixtures (disposable Postgres)

| Requirement | Seed |
|-------------|------|
| Payments enabled | `organization.paymentsEnabled = true` (`seedP6Pr5dPaymentsReady`) |
| ACTIVE Connect | `organization_payment_accounts` ACTIVE, `chargesEnabled=true`, test `stripeConnectedAccountId` |
| Payable amount | P6-PR5C pricing quote + wizard draft → `booking_price_snapshot` + line items |
| Customer email | P6-PR5C customer seed |
| Eligibility | P6-PR5C harness stubs (verification, customer, rental rules, rental health) |

Negative Connect: `seedP6Pr5dPaymentsEnabledConnectNotReady` — payments on, account PENDING / no charges (no bypass).

## Production correction (minimal)

`BookingsController.confirmWizardDraft` forwards `platformRole` / `membershipRole` into `BookingWizardDraftService.confirmDraft` so `PaymentsAccessService.assertPaymentPermission` honors `MASTER_ADMIN` for real `createRentalPaymentRequest` (no permission bypass in tests).

## HTTP spec

`backend/src/modules/bookings/rental-booking-wizard-payment-link.http.postgres.integration.spec.ts` (5 cases)

## CI

| Item | Value |
|------|-------|
| Script | `backend/scripts/test/rental-booking-lifecycle-postgres-ci.sh` |
| Pattern | + `rental-booking-wizard-payment-link.http.postgres` |
| Expected total | **22** (4 + 7 + 6 + 5) |

## Validation

```bash
cd backend && npm run build
cd backend && npm run test:bookings:p6-pr5b:postgres:ci
bash architecture/bookings/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
git diff --check
```