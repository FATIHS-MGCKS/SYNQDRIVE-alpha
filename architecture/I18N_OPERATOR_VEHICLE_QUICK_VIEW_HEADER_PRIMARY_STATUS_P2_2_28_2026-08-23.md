# P2.2.28 — Operator Vehicle Quick View Header & Primary Status Localization

**Date:** 2026-08-23
**Baseline:** `314f20aabcf91eab8fd0e4ac44a10428af857c20` (PR #1203 / P2.2.27)
**Pre-flight:** PR #1209 (verdict A)

## Scope (Header & Primary Status only)

| Path | Role |
|------|------|
| `operator/components/OperatorVehicleQuickViewHeader.tsx` | Extracted hero/header + primary status + release block |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | Extended presentation adapter (header maps + existing QV-G) |
| `operator/components/OperatorVehicleQuickView.tsx` | Host wiring (hero block replaced) |
| `i18n/translations/operator.vehicleQuickView.header.{en,de}.ts` | +11 canonical keys |

## Locale flow

`useLanguage().locale` → `OperatorVehicleQuickViewHeader` → `operator-vehicle-quick-view-i18n.ts` for primary status, release decision, rental health state, section chrome; reuses `dashboard.label.*`, `health.state.*`, `common.close`, `dashboard.fleet.cleaningPending`. Fleet display and unreliable callout receive active locale via `resolveOperatorVehicleQuickViewLocale`.

## Machine freeze

- `vehicle.id`, `vehicle.license`, `vehicle.model`, `vehicle.station` unchanged (dynamic data not translated)
- `snapshot.primaryStatus`, `snapshot.releaseDecision`, `snapshot.*Tone` machine values unchanged
- `health.overall_state` machine value unchanged
- `vehicle.cleaningStatus === 'Needs Cleaning'` machine predicate unchanged
- Status precedence and derivation in `deriveOperatorVehicleStatusSnapshot` unchanged
- Parent Quick View sections outside header block unchanged (QV-G frozen)

## Guardrails

`P228_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Remaining Quick View residual

~17 scanner findings remain in `OperatorVehicleQuickView.tsx` (quick actions, health, tire, footer) — intentional; future QV slices.

## Tests

`operator-vehicle-quick-view-header-localization.test.tsx` — EN/DE render, fixed-DE regression, locale switch, status style, callbacks, accessibility, cleaning chip.

## Semantics

Presentation-only. Category E = 0.
