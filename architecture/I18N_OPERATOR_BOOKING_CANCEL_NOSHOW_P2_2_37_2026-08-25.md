# P2.2.37 — Operator Booking Cancel & No-Show Sheets Localization

**Date:** 2026-08-25  
**Campaign:** OPERATOR  
**Baseline:** `fe436fb7106f3c6f3a9efb2e46a2e4d1485862df`  
**Pre-flight:** PR #1261

## Scope

Presentation-only localization for:

- `OperatorBookingCancelSheet.tsx`
- `OperatorBookingNoShowSheet.tsx`
- `operatorBookingSheetShell.tsx` (close `aria-label` via `common.close`)
- `operator-booking-cancel-noshow-i18n.ts` adapter

## Locale flow

`useLanguage().locale` → `obcn()` / adapter helpers → `operator.bookings.cancelNoShow.*` keys with reuse of `bookings.customer`, `bookings.vehicle`, `bookings.period`, `bookings.detail.noShowReasonPlaceholder`, `common.cancel`, `common.close`.

## Machine semantics (frozen)

| Domain | Treatment |
|--------|-----------|
| `bookingId` | Raw — never translated |
| Customer/vehicle names | Dynamic — raw display |
| Status enum | Map via `bookingStatusLabel(status, locale)` |
| Cancel gate | `getBookingActionMatrix(detail).cancel` — predicate unchanged; reason map-only |
| No-show gate | `canOperatorMarkNoShow(detail)` — predicate unchanged; reason map-only |
| Freeform reason (no-show) | User input → API payload unchanged |
| Internal note (cancel) | Not sent to API — display only |
| Mutations | `api.bookings.cancel` / `markNoShow` — payloads unchanged |

## P237 enforce-clean

```text
operator/bookings/OperatorBookingCancelSheet.tsx
operator/bookings/OperatorBookingNoShowSheet.tsx
operator/bookings/operatorBookingSheetShell.tsx
operator/lib/operator-booking-cancel-noshow-i18n.ts
```

## Keys

+26 EN+DE (`8526` → `8552`), parity 100%, orphans 0.

## Tests

`operator-booking-cancel-noshow-localization.test.tsx` — EN/DE render, locale switch, mutation args, freeform preservation, enforce-clean guard.
