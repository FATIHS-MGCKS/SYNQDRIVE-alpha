# P2.2.30 — Operator Vehicle Quick View Tool & Footer Actions Localization

**Date:** 2026-08-23
**Baseline:** `8498f0442712c326ceffba9b8d46cc0932bd364d` (PR #1216 / P2.2.29)
**Pre-flight:** PR #1221 (verdict A)

## Scope (Tool & Footer Actions only)

| Path | Role |
|------|------|
| `operator/components/OperatorVehicleQuickViewToolActions.tsx` | Extracted footer tool action grid (4 actions) |
| `operator/lib/operator-vehicle-quick-view-i18n.ts` | Extended presentation adapter (toolActions helpers) |
| `operator/components/OperatorVehicleQuickView.tsx` | Host wiring (tool block replaced; callbacks remain in parent) |
| `i18n/translations/operator.vehicleQuickView.toolActions.{en,de}.ts` | +8 canonical keys (8446→8454) |

## Locale flow

`useLanguage().locale` → `OperatorVehicleQuickViewToolActions` → `operator-vehicle-quick-view-i18n.ts` for title/subtitle labels per action.

## Machine freeze

- `openDamageCapture({ vehicleId, vehicleName, plate, bookingId?, skipVehicleConfirm: true })` unchanged
- `openSheet({ type: 'ai-upload', ... })` unchanged
- `openSheet({ type: 'tire-measure', ... })` unchanged
- `openSheet({ type: 'task-create', ... })` unchanged
- Action order: damage-capture → ai-upload → tire-measure → task-create (4 actions, always visible)
- `highlight` styling on damage-capture action only
- P227/P228/P229 frozen slices untouched

## Guardrails

`P230_ENFORCE_CLEAN_EXACT` (2 paths) — 0 findings.

## Remaining Quick View residual

~8 scanner findings remain in `OperatorVehicleQuickView.tsx` (booking context, health, tire, damages, documents) — intentional; future QV slices.

## Tests

`operator-vehicle-quick-view-tool-actions-localization.test.tsx` — EN/DE render, order, locale switch, callbacks, highlight, adapter maps.

## Semantics

Presentation-only. Category E = 0.
