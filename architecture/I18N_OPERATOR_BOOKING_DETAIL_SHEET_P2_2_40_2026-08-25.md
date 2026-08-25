# I18N — Operator Booking Detail Sheet (P2.2.40)

**Date:** 2026-08-25
**Baseline:** `00a58f54970be4853b1adab61796ac7b3bd962b3`

## Locale flow

`useLanguage().locale` → `operator-booking-detail-i18n.ts` adapter (`obds`, section/action/gate helpers).

Reuses:

- `bookingStatusLabel(status, locale)` for status chips
- `resolveHandoverGateReason(locale, gate)` for pickup/return CTA tooltips
- P237 `operatorBookingCancelMatrixReasonLabel` / `operatorBookingNoShowGateReasonLabel` for manage-action gate tooltips
- `common.close`, `common.edit`, `bookings.customer`, cancel/no-show submit labels, `vehicle.bookings.startPickup` / `startReturn`

## Keys

+12 EN+DE `operator.bookings.detail.*` (8596→8608).

## Machine values (frozen)

- `bookingId`, `customerId`, `vehicleId` in callbacks and API loads
- Customer/vehicle/station display strings (never translated)
- Booking status machine enum
- Pickup/return gate predicates and handover sheet targets
- P238 document panel IDs, filenames, ordering
- P237/P236 sheet types and booking ID args

## Guardrails

P2.2.40 enforce-clean exact (2 paths) — 0 findings.

## Tests

`operator-booking-detail-localization.test.tsx`

## Semantics

Presentation-only; Category E=0.
