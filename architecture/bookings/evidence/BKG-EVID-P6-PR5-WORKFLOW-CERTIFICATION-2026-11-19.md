# P6-PR5 — Rental booking workflow certification

**Date:** 2026-11-19 (Europe/Berlin)  
**Epistemic:** CONFIRMED (repository Jest) / UNKNOWN (disposable Postgres E2E) / NOT_CLAIMED (Production)

## Certification tiers (F2 — independent review)

| Tier | What counts | P6-PR5 claim |
|------|-------------|--------------|
| **Isolated service / unit tests** | Single class, mocked deps | Yes — module `*.spec.ts` files |
| **In-memory contract harness** | `rental-booking-workflow-certification.spec.ts` — **separate `it` blocks**, not one persistent booking DB row | Yes — composes contracts only |
| **Integration tests** | Multi-service without full HTTP/DB (e.g. pickup gate matrix) | Partial — `booking-pickup-gate.integration.spec.ts` |
| **Full DB-backed E2E** | Disposable Postgres, Nest HTTP, real persistence chain | **BLOCKED** — not in this workstream |
| **Production validation** | Live tenant evidence | **NOT_CLAIMED** |

**Not verified by this PR:** durable queue processing after `enqueueForBooking` (Bull/Redis worker completion), live Stripe capture, async Driving Intelligence pipeline completion. A mocked or resolved `enqueueForBooking` invocation is **trigger scheduling intent only**, not `INTEGRATION_VERIFIED` queue semantics.

## Workflow coverage matrix

| Step | Contract | Primary evidence | P6-PR5 harness role |
|------|----------|------------------|-------------------|
| 1–3 Wizard / eligibility / confirm | Draft → CONFIRMED | `booking-wizard-eligibility-e2e-flow.spec.ts` | Separate harness `it` |
| 4–5 Payment / invoice | No PAID on intent | `booking-wizard-payment-flow.service.spec.ts` | Separate harness `it` |
| 6–7 Documents / pickup gate | Gate blocks | `booking-pickup-gate.integration.spec.ts` | Negative harness `it` |
| 8–11 Handover FSM | ACTIVE / COMPLETED | `bookings-handover.service.spec.ts` | Separate harness `it` (pickup then return harness instances) |
| 12 RDA assessment | `recomputeForBooking` output | **`rental-driving-analysis.recompute.spec.ts` (authoritative)** | **Not duplicated** — no placeholder step-12 test |
| 12 RDA trigger on return | `enqueueForBooking` call | **`bookings-handover.service.spec.ts`** (P6-PR5 review regression suite) | Harness asserts mock call on return only |

## RDA trigger semantics (F3)

After successful **RETURN** handover only:

- `enqueueForBooking({ reason: BOOKING_COMPLETED, … })` — fire-and-forget; `.catch` logs warn, **does not roll back** COMPLETED.
- **PICKUP** does not call this trigger.
- Failed / rolled-back RETURN, duplicate RETURN (`HANDOVER_ALREADY_EXISTS`), and pre-transaction rejects do not call it.
- `RentalDrivingAnalysisRecomputeTriggerService` may return `{ enqueued: false, reason: 'NO_ANCHOR_TRIP' | 'NO_ANALYSIS_RUN' | … }` without a queued job — **no retry system** in P6-PR5.

## Confirmed defect remediated (Phase 4)

**Gap:** Return handover set `COMPLETED` without scheduling RDA `BOOKING_COMPLETED` (unlike `BookingsService.update`).

**Fix:** `BookingsHandoverService` — post-success RETURN enqueue (same correlation id pattern as bookings update).

## Negative cases (mapped)

| Case | Evidence |
|------|----------|
| Missing ACTIVE RENTAL | `rental-product-license.http-security.integration.spec.ts` |
| Cross-org / RBAC | Handover + HTTP license specs |
| Eligibility failure | `booking-wizard-eligibility-e2e-flow.spec.ts` |
| Missing pickup documents | `booking-pickup-gate.integration.spec.ts` |
| Repeated confirm / pickup / return | Wizard e2e + handover specs |
| Payment request failure | `booking-wizard-payment-flow.service.spec.ts` |
| RDA inadmissible trips | `rental-driving-analysis.recompute.spec.ts` |

## Certification verdict

| Layer | Verdict |
|-------|---------|
| UNIT_VERIFIED | Yes |
| INTEGRATION_VERIFIED | Partial (harness + pickup gate; **not** single lifecycle E2E) |
| E2E_VERIFIED | **BLOCKED** |
| PRODUCTION_VALIDATED | **NOT_CLAIMED** |
| Queue / worker processing | **NOT_CLAIMED** |

## Validation commands

```bash
cd backend && npm test -- --testPathPatterns=rental-booking-workflow-certification
cd backend && npm test -- --testPathPatterns=bookings-handover.service
cd backend && npm test -- --testPathPatterns=rental-driving-analysis.recompute
```