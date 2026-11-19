# P6-PR5 — Rental booking workflow certification

**Date:** 2026-11-19 (Europe/Berlin)  
**Epistemic:** CONFIRMED (repository Jest) / UNKNOWN (disposable Postgres E2E) / NOT_CLAIMED (Production)

## Workflow coverage matrix

| Step | Contract | Primary evidence | Certification layer |
|------|----------|------------------|---------------------|
| 1 Wizard draft | `BookingWizardDraftService` | `booking-wizard-draft.service.spec.ts` | `rental-booking-workflow-certification.spec.ts` |
| 2 Pricing / eligibility | Gatekeeper + enforcement | `booking-eligibility-*.spec.ts`, `booking-wizard-eligibility-e2e-flow.spec.ts` | Harness confirm + fingerprint |
| 3 Wizard confirm | FSM → CONFIRMED | `booking-wizard-eligibility-e2e-flow.spec.ts` | Harness |
| 4 Payment intent / link | No live Stripe | `booking-wizard-payment-flow.service.spec.ts` | Harness |
| 5 Invoice consistency | `syncOnBookingConfirmed` | `booking-invoice-bootstrap.behavior.spec.ts` | Wizard harness mock |
| 6 Document prerequisites | Pickup gate + bundle | `booking-pickup-gate.integration.spec.ts` | Negative harness |
| 7 Pickup gate | `assertPickupAllowed` | `booking-pickup-gate.integration.spec.ts` | Handover harness |
| 8 Pickup handover | CONFIRMED → ACTIVE | `bookings-handover.service.spec.ts` | Harness |
| 9 Booking ACTIVE | Status + vehicle RENTED | `bookings-handover.service.spec.ts` | Harness |
| 10 Return handover | ACTIVE → COMPLETED | `bookings-handover.service.spec.ts` | Harness |
| 11 Booking COMPLETED | Workflow `booking.completed` | `bookings-handover.service.spec.ts` | Harness |
| 12 RDA recompute | Assessment + trigger | `rental-driving-analysis.recompute.spec.ts` | **Remediation:** return handover now enqueues `BOOKING_COMPLETED` (parity with `BookingsService.update`) |

## Negative cases (mapped)

| Case | Evidence |
|------|----------|
| Missing ACTIVE RENTAL | `rental-product-license.http-security.integration.spec.ts` (P6-PR4A) |
| Cross-org | Handover + HTTP license specs |
| RBAC insufficient | HTTP license + permission guards |
| Eligibility failure | `booking-wizard-eligibility-e2e-flow.spec.ts` |
| Missing pickup documents | `booking-pickup-gate.integration.spec.ts` + certification negative |
| Repeated wizard confirm | `booking-wizard-eligibility-e2e-flow.spec.ts` (idempotent) |
| Repeated pickup | `bookings-handover.service.spec.ts` |
| Payment request failure | `booking-wizard-payment-flow.service.spec.ts` + certification |
| Invoice not falsely PAID | Payment flow harness (no PAID in result) |
| RDA pending / inadmissible | `rental-driving-analysis.recompute.spec.ts`, TDI quality specs |

## Confirmed defect remediated (Phase 4)

**Gap:** Return handover transitioned booking to `COMPLETED` but did not enqueue rental driving analysis recompute (unlike `BookingsService.update`).

**Fix:** `BookingsHandoverService` — fire-and-forget `RentalDrivingAnalysisRecomputeTriggerService.enqueueForBooking` with `BOOKING_COMPLETED` after successful return handover.

## Certification verdict

| Layer | Verdict |
|-------|---------|
| UNIT_VERIFIED | Yes — step module specs + P6-PR5 harness (7 tests) |
| INTEGRATION_VERIFIED | Partial — in-memory service harness; pickup gate integration; task pipeline; no full Nest HTTP wizard→return |
| E2E_VERIFIED | **BLOCKED** — no disposable-Postgres booking lifecycle E2E in CI |
| PRODUCTION_VALIDATED | **NOT_CLAIMED** |
| Real payment capture | **NOT_CLAIMED** (mocked Stripe) |
| Async DI analysis completion | **NOT_CLAIMED** (job enqueue only) |

## Validation commands

```bash
cd backend && npm test -- --testPathPatterns=rental-booking-workflow-certification
cd backend && npm test -- --testPathPatterns='booking-wizard-eligibility-e2e-flow|bookings-handover.service|booking-pickup-gate.integration|rental-driving-analysis.recompute'
```