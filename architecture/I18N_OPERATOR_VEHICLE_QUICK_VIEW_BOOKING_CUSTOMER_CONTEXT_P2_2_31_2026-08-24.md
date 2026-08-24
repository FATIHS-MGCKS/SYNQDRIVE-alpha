# P2.2.31 — Operator Vehicle Quick View Booking & Customer Context Localization

**Date:** 2026-08-24
**Baseline:** `3a5941862387b53b2d581287ce5edd4d68a291c9` (PR #1222 / P2.2.30)
**Pre-flight:** PR #1233 (verdict A)

## Scope (Booking & Customer Context only)

| Path | Role |
|------|------|
| `operator/components/OperatorVehicleQuickViewBookingContext.tsx` | Extracted booking/customer context card |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | Extended presentation adapter (booking helpers + locale datetime) |
| `operator/hooks/useOperatorVehicleQuickViewData.ts` | Removed hardcoded `label`; keeps `kind` machine value |
| `operator/components/OperatorVehicleQuickView.tsx` | Host wiring (booking block replaced) |
| `i18n/translations/operator.vehicleQuickView.booking.{en,de}.ts` | +6 canonical keys (8454→8460) |

## Locale flow

`useLanguage().locale` → `OperatorVehicleQuickViewBookingContext` → `operator-vehicle-quick-view-i18n.ts` for section title, kind label, and datetime formatting.

## Machine freeze

- `bookingContext.kind` (`pickup` | `return` | `active` | `reserved`) unchanged
- `bookingId`, `customerName`, `when`, `station`, `status` machine values unchanged
- Parent callbacks and `bookingContext?.bookingId` threading unchanged
- P227/P228/P229/P230 frozen slices untouched

## Guardrails

`P231_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Remaining Quick View residual

~7 scanner findings remain in `OperatorVehicleQuickView.tsx` (blockers, health, tire, damages, documents) — intentional; future QV slices.

## Tests

`operator-vehicle-quick-view-booking-context-localization.test.tsx` — EN/DE render, kind maps, locale switch, datetime formatting, adapter maps.

## Semantics

Presentation-only. Category E = 0.
