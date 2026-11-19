# P6-PR5C — Database-backed rental booking wizard HTTP E2E

**Date:** 2026-11-19 (Europe/Berlin)  
**Epistemic:** CONFIRMED (TypeScript compile) / PENDING (disposable Postgres CI on merge) / NOT_CLAIMED (Production)

## Relationship to P6-PR5B

P6-PR5B **handover** certification (`DATABASE_HANDOVER_E2E_VERIFIED`) remains unchanged. P6-PR5C adds wizard/pricing/eligibility/confirm/payment-intent HTTP coverage on the **same** disposable Postgres gate (`RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1`).

## Certification tiers (honest)

| Tier | Claim |
|------|-------|
| **WIZARD_DATABASE_E2E_VERIFIED** | **YES (when CI 16/16 green)** — HTTP `POST .../bookings/wizard-draft`; Prisma `PENDING` + quote consumption |
| **ELIGIBILITY_DATABASE_E2E_VERIFIED** | **YES (when CI green)** — HTTP eligibility-preview + fingerprint semantics |
| **CONFIRMATION_DATABASE_E2E_VERIFIED** | **YES (when CI green)** — HTTP confirm; Prisma `CONFIRMED`; idempotent duplicate confirm |
| **PAYMENT_REQUEST_DATABASE_VERIFIED** | **PARTIAL** — `pay_on_pickup` path verified; **no** durable payment request without Connect fixtures |
| **INVOICE_UNPAID_INVARIANT_VERIFIED** | **YES (when CI green)** — confirm does not mark `OrgInvoice` `PAID` |
| **HANDOVER_DATABASE_E2E_VERIFIED** | **Unchanged** — P6-PR5B suite (`rental-booking-lifecycle.http.postgres.integration.spec.ts`) |

### Explicit non-claims

- **REAL_STRIPE_CAPTURE_VERIFIED** — `StripeCheckoutService` mocked at checkout boundary  
- **ASYNC_DOCUMENT_WORKER_VERIFIED** — bundle generation dispatcher mocked; no Bull worker  
- **REDIS_QUEUE_DURABILITY_VERIFIED** — not exercised  
- **PRODUCTION_VALIDATED** — disposable DB only  

## HTTP workflow (P6-PR5C spec)

| Step | Route | Persistence assert |
|------|-------|-------------------|
| Pricing | `POST .../pricing/simulate` | simulation fields + quote row (service-level quote for wizard body) |
| Wizard draft | `POST .../bookings/wizard-draft` | `booking.status=PENDING`; `pricing_quote.consumed_by_booking_id` |
| Checkout | `GET .../checkout-context` | totals align with snapshot |
| Eligibility | `GET .../eligibility-preview` | fingerprint returned |
| Confirm | `POST .../confirm` | `CONFIRMED`; invoice not `PAID`; duplicate confirm idempotent |

## Test harness notes

| Boundary | Treatment |
|----------|-----------|
| Auth | `x-test-user` JSON + `TestAuthGuard`; `MASTER_ADMIN` bypasses permission matrix |
| Rental health | `RentalHealthService.isRentalBlocked` mocked **open** (vehicle readiness gate) |
| RDA / tasks / email | No-op mocks |
| Document bundle | `generateInitialBundle` mocked (persistence focus: booking, quote, invoice) |
| Stripe | `P6_PR5C_STRIPE_CHECKOUT_BOUNDARY_MOCK` |

## CI

| Item | Value |
|------|-------|
| Script | `backend/scripts/test/rental-booking-lifecycle-postgres-ci.sh` |
| Workflow | `.github/workflows/p6-pr5b-rental-booking-postgres-ci.yml` (extended patterns) |
| Jest patterns | preflight + lifecycle + `rental-booking-wizard.http.postgres` |
| Expected | **16 passed** (4 + 7 + 5) |

## Validation commands

```bash
cd backend && npm run build
cd backend && npm run test:bookings:p6-pr5b:postgres:ci
bash architecture/scripts/validate-module-registry.sh
bash architecture/bookings/scripts/validate-graph.sh
git diff --check
```