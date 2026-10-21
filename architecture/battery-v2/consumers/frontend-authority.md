# Battery V2 — Frontend Consumer Authority

**Mode:** Read-only trace (no frontend changes)

## Primary consumers

| Component | Path | API | Authority |
|-----------|------|-----|-----------|
| `useBatteryHealthQuery` | `frontend/src/rental/lib/battery-health-query/` | `battery-health-summary` / `detail` | **CANONICAL** |
| `useHealthTabBatteryData` | `frontend/src/rental/hooks/useHealthTabBatteryData.ts` | detail variant | **CANONICAL** |
| `HealthErrorsView` | `frontend/src/rental/components/HealthErrorsView.tsx` | via hooks | **CANONICAL** VM |
| `BatteryLvSummaryCard` / `BatteryLvDetailContent` | `frontend/src/rental/components/battery/` | view-model only | **CANONICAL** fields |
| `BatteryHvSummaryCard` / `BatteryHvDetailContent` | same | HV slice of canonical DTO | **CANONICAL** |
| `buildBatteryLvSummaryVm` | `frontend/src/rental/lib/battery-lv-view-model.ts` | maps canonical LV | Explicit non-SOH terminology |
| `useVehicleHealthBoxData` | `vehicle-detail/useVehicleHealthBoxData.ts` | summary | **CANONICAL** |

## Rules (CONFIRMED)

- UI does **not** read `battery_features` or Prisma tables directly
- Live map voltage may overlay `batteryLatest.voltageV` from detail `currentState`
- Terminology: LV "estimated health" — not workshop SOH (`battery-lv-semantics.ts` aligned)

## Missing-data behavior

Handled in view-model builders from canonical `dataQuality` slices — trace per-field in `battery-lv-view-model.ts` / HV equivalents.

## Gaps

- Operator/master admin battery surfaces — **not fully mapped** in Phase 2
- AI health care summary battery section — uses canonical via backend aggregator (**INFERRED**)
