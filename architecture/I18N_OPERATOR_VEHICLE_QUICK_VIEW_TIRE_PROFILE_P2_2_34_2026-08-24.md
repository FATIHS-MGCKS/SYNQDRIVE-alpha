# P2.2.34 — Operator Vehicle Quick View Tire Profile i18n Architecture

**Date:** 2026-08-24
**Baseline:** `5650bb01c4b6f850046fc51817058f6d41fb4997`

## Scope

Extracted `OperatorVehicleQuickViewTireProfile.tsx` from inline parent markup (lines 177–228).

## Data flow

```
useOperatorVehicleQuickViewData.tireSummary / tireLoading
  → OperatorVehicleQuickView (wiring + onMeasure callback)
  → OperatorVehicleQuickViewTireProfile
  → operator-vehicle-quick-view-i18n.ts
  → tire-health-detail-ui.ts (locale-threaded status/tread/remaining)
  → localized UI
```

## Freeze contract

- Machine `displayMode` / `measurementState` unchanged in data
- Tread mm, position codes (e.g. FL), pressure semantics unchanged
- P226 tire measure workflow untouched
- Blockers/Documents sections untouched
- `onMeasure` → `openSheet({ type: 'tire-measure', ... })` frozen

## Enforce-clean boundary

```
operator/components/OperatorVehicleQuickViewTireProfile.tsx
operator/lib/operator-vehicle-quick-view-i18n.ts
```

## Keys

+14 under `operator.vehicleQuickView.tire.*` (8475 → 8489)

## Main drift isolation

Implementation branches from `5650bb01` only. `origin/main` has HIGH drift on QV parent (monolithic revert) — not absorbed.
