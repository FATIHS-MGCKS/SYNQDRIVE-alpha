# P6-PR5C — Database-backed rental booking wizard HTTP E2E

**Date:** 2026-11-19 (Europe/Berlin)
**Last updated:** 2026-11-19 (eligibility certification honesty remediation)
**Epistemic:** CONFIRMED (TypeScript compile) / CONFIRMED (disposable Postgres CI 17/17 on branch) / NOT_CLAIMED (Production)

## Relationship to P6-PR5B

P6-PR5B **handover** certification (`DATABASE_HANDOVER_E2E_VERIFIED`) remains unchanged. P6-PR5C adds wizard/pricing/checkout/confirm/payment-intent HTTP coverage on the **same** disposable Postgres gate (`RENTAL_BOOKING_LIFECYCLE_POSTGRES_INTEGRATION=1`).

## Certification tiers (honest)

| Tier | Claim |
|------|-------|
| **WIZARD_DATABASE_E2E_VERIFIED** | **YES (CI 17/17)** — HTTP `POST .../bookings/wizard-draft`; Prisma `PENDING` + quote consumption; checkout-context |
| **ELIGIBILITY_DATABASE_E2E_VERIFIED** | **NOT_VERIFIED** — real `BookingEligibilityGatekeeperService.evaluate()` runs, but **customer policy**, **verification policy/Didit**, and **rental effective rules** use documented P6 stubs (see boundaries below). Not production-equivalent eligibility enforcement. |
| **CONFIRMATION_DATABASE_E2E_VERIFIED** | **PARTIAL_MOCKED_ELIGIBILITY** — HTTP confirm → `CONFIRMED`, fingerprint `RULES_CHANGED` / `NOT_ELIGIBLE` semantics, idempotent confirm, and `eligibilityPreviewFingerprint` forwarded into `BookingsService.update` under bounded eligibility mocks. |
| **PAYMENT_REQUEST_DATABASE_VERIFIED** | **PARTIAL** — `pay_on_pickup` path verified; **no** durable payment request without Connect fixtures |
| **INVOICE_UNPAID_INVARIANT_VERIFIED** | **YES (CI 17/17)** — confirm does not mark `OrgInvoice` `PAID` |
| **HANDOVER_DATABASE_E2E_VERIFIED** | **Unchanged** — P6-PR5B suite (`rental-booking-lifecycle.http.postgres.integration.spec.ts`) |
| **FULL_RENTAL_LIFECYCLE_DATABASE_E2E_VERIFIED** | **NOT_CLAIMED** — wizard subset only; no payment_link persistence; handover remains separate certification |

### Explicit non-claims

- **REAL_STRIPE_CAPTURE_VERIFIED** — `StripeCheckoutService` mocked at checkout boundary
- **ASYNC_DOCUMENT_WORKER_VERIFIED** — bundle generation dispatcher mocked; no Bull worker
- **REDIS_QUEUE_DURABILITY_VERIFIED** — not exercised
- **PRODUCTION_VALIDATED** — disposable DB only
- **PRODUCTION_EQUIVALENT_RENTAL_RULES_VERIFIED** — `createP6Pr5cRentalEffectiveRulesStub()` bypasses DB-backed rule revisions and vehicle overrides

## F1 — Gatekeeper authority (2026-11-19 remediation)

| Item | Finding |
|------|---------|
| **Prior anti-pattern** | Test harness intercepted `evaluate()` and synthesized `ELIGIBLE` / `NOT_ELIGIBLE` when status was `TECHNICAL_ERROR` or evaluation threw |
| **Root cause (customer)** | `CustomerEligibilityService` mock returned a **legacy flat object** without `stages`, causing `mapCustomerEligibilityToGateReasons` to throw → **`TECHNICAL_ERROR`**. Prior spy masked this. |
| **Root cause (rental)** | Full `BookingRentalEligibilityService.check()` against disposable Postgres still yields rental-domain **`TECHNICAL_ERROR`** (customer fact-trust / document graph not production-complete in CI DB). Harness keeps **mocked** rental check returning stub `effectiveRules`. |
| **F1 verdict** | **REAL_GATEKEEPER_WITH_DOCUMENTED_STUB_BOUNDARIES** — interception removed; gatekeeper assembly is real; domain inputs remain bounded stubs. **Does not satisfy** `ELIGIBILITY_DATABASE_E2E_VERIFIED`. |
| **NOT_ELIGIBLE path** | Seeded `customer_verification_check` `REJECTED` rows → stub verification reader → real gatekeeper → HTTP `409` `NOT_ELIGIBLE` |
| **Stale fingerprint path** | Eligible preview + wrong fingerprint → HTTP `409` `RULES_CHANGED` (enforcement fingerprint compare; not synthetic override) |

## Test harness boundaries

| Boundary | Treatment |
|----------|-----------|
| Auth | `x-test-user` JSON + `TestAuthGuard`; `MASTER_ADMIN` bypasses permission matrix |
| Rental health | `RentalHealthService.isRentalBlocked` mocked **open** (vehicle readiness gate) |
| RDA / tasks / email | No-op mocks |
| Document bundle | `generateInitialBundle` mocked (persistence focus: booking, quote, invoice) |
| Stripe | `P6_PR5C_STRIPE_CHECKOUT_BOUNDARY_MOCK` |
| **Customer eligibility** | `createP6Pr5cCustomerEligibilityStub()` — permissive `assembleCustomerEligibilityResult` ( **not** full `CustomerEligibilityService` / invoices / fines / policy DB) |
| **Customer verification** | `resolveP6Pr5cVerificationEligibility()` — reads seeded `customer_verification_check` rows (not full Didit/policy stack) |
| **Rental effective rules** | `createP6Pr5cRentalEffectiveRulesStub()` — static org layer; **no** `vehicle_rental_requirement_overrides` / revision DB |
| **Rental rules eligibility** | `BookingRentalEligibilityService.check` mocked **ELIGIBLE** with stub `effectiveRules` shape (real service hits disposable-Postgres fact-trust/schema gaps → gatekeeper `TECHNICAL_ERROR`) |

## F3 — Rental rules stub bypass list

`p6-pr5c-rental-rules.stub.ts` does **not** exercise:

- Published rental rule revisions from Postgres
- Per-vehicle override columns (e.g. `foreignTravelPolicy` on overrides table)
- Category / vehicle rule layers from DB
- Manual approval flags from live org configuration

It supplies a fixed permissive org layer (age 18, deposit 50_000 EUR, foreign travel allowed, no credit card required) for deposit + rental eligibility math only.

## F4 — Wizard confirm fingerprint forwarding

`BookingWizardDraftService.confirmDraft` passes `eligibilityPreviewFingerprint` into `BookingsService.update` options so committed bookings satisfy fail-closed fingerprint enforcement after wizard marker removal.

Regression: `booking-wizard-draft.service.spec.ts` (confirm forwards fingerprint; stale fingerprint blocks before update).

## HTTP workflow (P6-PR5C spec)

| Step | Route | Persistence assert |
|------|-------|-------------------|
| Pricing | `POST .../pricing/simulate` | simulation fields + quote row |
| Wizard draft | `POST .../bookings/wizard-draft` | `booking.status=PENDING`; `pricing_quote.consumed_by_booking_id` |
| Checkout | `GET .../checkout-context` | totals align with snapshot |
| Eligibility | `GET .../eligibility-preview` | fingerprint from **real** gatekeeper assembly (stubbed domains) |
| Confirm | `POST .../confirm` | `CONFIRMED`; invoice not `PAID`; duplicate confirm idempotent |

## CI

| Item | Value |
|------|-------|
| Script | `backend/scripts/test/rental-booking-lifecycle-postgres-ci.sh` |
| Workflow | `.github/workflows/p6-pr5b-rental-booking-postgres-ci.yml` |
| Jest patterns | preflight + lifecycle + `rental-booking-wizard.http.postgres` |
| Expected | **17 passed** (4 + 7 + 6) |
| CI logs | **No** full `DATABASE_URL` echo (host + DB name only) |

## Validation commands

```bash
cd backend && npm run build
cd backend && npm test -- booking-wizard-draft.service.spec.ts
cd backend && npm run test:bookings:p6-pr5b:postgres:ci
bash architecture/scripts/validate-module-registry.sh
bash architecture/bookings/scripts/validate-graph.sh
git diff --check
```