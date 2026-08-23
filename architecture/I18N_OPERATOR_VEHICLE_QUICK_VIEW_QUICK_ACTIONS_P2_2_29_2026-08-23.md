# P2.2.29 — Operator Vehicle Quick View Quick Actions Localization

**Date:** 2026-08-23
**Baseline:** `59e3395eafff6de2e9d4301f1e806a24a35c9a31` (PR #1211 / P2.2.28)
**Pre-flight:** PR #1215 (verdict A)

## Scope (Quick Actions only)

| Path | Role |
|------|------|
| `operator/components/OperatorVehicleQuickViewQuickActions.tsx` | Extracted pickup/return/booking-create CTA grid |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | Extended presentation adapter (quickActions helpers) |
| `operator/components/OperatorVehicleQuickView.tsx` | Host wiring (quick actions block replaced) |
| `i18n/translations/operator.vehicleQuickView.quickActions.{en,de}.ts` | +1 canonical key (reuses `vehicle.bookings.startPickup` / `startReturn`) |

## Locale flow

`useLanguage().locale` → `OperatorVehicleQuickViewQuickActions` → `operator-vehicle-quick-view-i18n.ts` for CTA labels; gate reason suffixes continue via `resolveHandoverGateReason(locale, gate)`.

## Machine freeze

- `openHandover({ kind: 'PICKUP' \| 'RETURN', bookingId, booking })` unchanged
- `openSheet({ type: 'booking-create', prefillVehicleId })` unchanged
- `pickupItem` / `returnItem` visibility predicates unchanged
- `gate.allowed` disabled predicates unchanged
- Customer names and vehicle label subtitles unchanged (dynamic data not translated)
- P227 QV-G and P228 header surfaces frozen

## Guardrails

`P229_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Remaining Quick View residual

~16 scanner findings remain in `OperatorVehicleQuickView.tsx` (booking context, health, tire, footer) — intentional; future QV slices.

## Tests

`operator-vehicle-quick-view-quick-actions-localization.test.tsx` — EN/DE render, order, locale switch, callbacks, disabled state, adapter maps.

## Semantics

Presentation-only. Category E = 0.
