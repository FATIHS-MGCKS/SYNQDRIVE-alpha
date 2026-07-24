# Booking Post-Remediation Audit — Architecture Note

Date: 2026-07-24 (updated after Go remediation)  
Prompt: 34/34 + follow-up remediation

## Audit outcome

**CONDITIONAL GO** after remediation branch `cursor/booking-production-go-6eff` — see `docs/audits/booking-post-remediation-production-readiness-2026-07.md`.

## Remediation applied (V4.9.801)

1. **Concurrency** — `pg_advisory_xact_lock` per org+vehicle inside create/update transactions before overlap check.
2. **IAM** — `@RequirePermission('bookings', read|write|manage)` on `BookingsController` + rental-contract routes.
3. **Privacy** — `redactHandoverProtocolForList` on `findTodaysPickups` / `findTodaysReturns`.
4. **Input boundary** — `CreateBookingDto` / `UpdateBookingDto` + `booking-input.sanitizer.ts`.
5. **Lifecycle** — `resolvePatchStatusTransition`, `resolveCancelTransition`, `resolveNoShowTransition` wired in `BookingsService`.
6. **Frontend** — planner pagination truncation banner, i18n, calendar month nav, mobile agenda fallback.

## Remaining risks (P2 / staging)

- No PostgreSQL exclusion constraint (advisory lock reduces race; staging parallel-create test still required).
- Invoice bootstrap compensating delete remains non-atomic saga.

## Verified strengths

- `BookingEligibilityGatekeeper` + enforcement on create/update/confirm/pickup.
- `BookingPickupGateService` legal delivery evidence checks.
- `PricingQuoteService.markConsumed` atomic single-winner.
- Business audit outbox with idempotency keys for eligibility events.

## Re-audit trigger

Full test matrix + staging smoke before production deploy on consolidated `main`.
