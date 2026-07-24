# Booking Post-Remediation Audit — Architecture Note

Date: 2026-07-24  
Prompt: 34/34

## Audit outcome

**NO-GO** for production — see `docs/audits/booking-post-remediation-production-readiness-2026-07.md`.

## Critical architecture gaps (P0)

1. **Double-booking race** — overlap check outside transaction; no DB exclusion constraint.
2. **IAM** — `BookingsController` CRUD/handover lacks `bookings.read/write/manage` decorators.
3. **Privacy** — `findTodaysPickups` / `findTodaysReturns` return full signature data URLs (list redaction only on paginated `findAll`).
4. **Input boundary** — HTTP bodies typed as `Prisma.BookingCreateInput` / `BookingUpdateInput`.

## Runtime enforcement gap

`booking-lifecycle-status.matrix.ts` documents transitions but is **not imported** by `BookingsService` — PATCH/cancel can bypass intended state machine.

## Verified strengths

- `BookingEligibilityGatekeeper` + enforcement on create/update/confirm/pickup.
- `BookingPickupGateService` legal delivery evidence checks.
- `PricingQuoteService.markConsumed` atomic single-winner.
- Business audit outbox with idempotency keys for eligibility events.

## Re-audit trigger

Re-run audit after P0 remediation on consolidated `main` tip.
