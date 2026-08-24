# P2.2.32 — Operator Vehicle Quick View Rental Health Modules Localization

**Date:** 2026-08-24
**Baseline:** `73cfb5a40db747ca2650a2f9221341e2778ef600` (PR #1234 / P2.2.31)
**Pre-flight:** PR #1237 (verdict A)

## Scope (Rental Health Modules only)

| Path | Role |
|------|------|
| `operator/components/OperatorVehicleQuickViewRentalHealth.tsx` | Extracted rental health modules card |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | Extended presentation adapter (module labels, state chips, empty/no-data/stale) |
| `operator/components/OperatorVehicleQuickView.tsx` | Host wiring (rental health block replaced) |
| `i18n/translations/operator.vehicleQuickView.health.{en,de}.ts` | +12 canonical keys (8460→8472) |

## Locale flow

`useLanguage().locale` → `OperatorVehicleQuickViewRentalHealth` → `operator-vehicle-quick-view-i18n.ts` for section title, module labels, state chips (`health.state.*` reuse), empty/no-data/reason fallback, stale suffix.

## Module inventory (7 modules, frozen order)

| Identity | Section/title | Machine state source | Actions |
|----------|---------------|----------------------|---------|
| `battery` | Rental Health / module row | `modules.battery.state` | none |
| `tires` | Rental Health / module row | `modules.tires.state` | none |
| `brakes` | Rental Health / module row | `modules.brakes.state` | none |
| `error_codes` | Rental Health / module row | `modules.error_codes.state` | none |
| `service_compliance` | Rental Health / module row | `modules.service_compliance.state` | none |
| `complaints` | Rental Health / module row | `modules.complaints.state` | none |
| `vehicle_alerts` | Rental Health / module row | `modules.vehicle_alerts.state` | none |

## Machine freeze

- Module identities, order, count unchanged
- `RentalHealthState` codes unchanged (`good`, `warning`, `critical`, `unknown`, `n_a`)
- `moduleTone`, thresholds, readiness, derivation in `operatorVehicleQuickView.utils.ts` untouched
- Dynamic `module.reason` values not translated
- P227–P231 frozen slices untouched; Blockers section untouched

## Health state reuse (`health.state.*`)

| Machine state | Key | Classification |
|---------------|-----|----------------|
| `good` | `health.state.good` | EXACT |
| `warning` | `health.state.warning` | EXACT |
| `critical` | `health.state.critical` | EXACT |
| `unknown` | `health.state.unknown` | EXACT |
| `n_a` | `health.state.na` | EXACT |

## Guardrails

`P232_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Remaining Quick View residual

Blockers, damages, tire profile, documents sections remain in parent — intentional; future QV slices.

## Tests

`operator-vehicle-quick-view-rental-health-modules-localization.test.tsx` — EN/DE render, module order, state maps, locale switch, visibility, leakage guards.

## Semantics

Presentation-only. Category E = 0.
