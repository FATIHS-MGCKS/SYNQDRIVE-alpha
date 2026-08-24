# P2.2.36 — Operator Booking Form Sheet i18n Architecture

**Date:** 2026-08-24
**Baseline:** `177347f73fb15bfaa1a9ffff9523f51d97c24192`

## Scope

Localized `OperatorBookingFormSheet.tsx` create/edit booking sheet presentation via `operator-booking-form-i18n.ts`.

## Data flow

```
useLanguage().locale
  → OperatorBookingFormSheet
  → operator-booking-form-i18n.ts
  → operator.bookings.form.* + semantic reuse (bookings.edit.*, bookings.*, common.*)
  → localized UI
```

## Freeze contract

- Machine mode `create` / `edit` unchanged
- `bookingId`, `customerId`, `vehicleId`, station IDs unchanged in state/payload
- Status enum values `PENDING` / `CONFIRMED` unchanged; labels localized only
- `datetime-local` raw values and validation predicates unchanged
- `formatMoneyCents` presentation only; raw cents/currency unchanged
- Customer/vehicle/station names, booking number, notes, API errors remain raw dynamic data
- `buildBookingCreatePayload` / `OperatorBookingUpdatePayload` semantics unchanged
- `StationSelectFields` and `operatorBooking.utils.ts` error mapping out of scope

## Enforce-clean boundary

```
operator/bookings/OperatorBookingFormSheet.tsx
operator/lib/operator-booking-form-i18n.ts
```

## Keys

+35 `operator.bookings.form.*` EN/DE
Semantic reuse: `bookings.edit.title`, `bookings.edit.saveChanges`, `bookings.customer`, `bookings.vehicle`, `bookings.planner.pending`, `bookings.confirmed`, `common.search`, `common.status`
8491 → 8526

## Campaign

OPERATOR — P236 Booking Form Sheet complete; Detail Sheet deferred to P237.
