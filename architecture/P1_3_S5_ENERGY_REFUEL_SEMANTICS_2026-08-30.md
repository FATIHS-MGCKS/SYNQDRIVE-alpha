# P1.3-S5 — Energy Event Semantics: Detection Window vs Refuel Fuel-Level Rise

**Date:** 2026-08-30  
**Status:** Implemented (additive; backward compatible)

---

## 1. Canonical duration semantics

| Field | Semantics | Applies to |
|-------|-----------|------------|
| `startTime` / `endTime` | Provider/source detection envelope boundaries | REFUEL + RECHARGE |
| `durationSeconds` | Provider/source detection envelope duration | REFUEL + RECHARGE |

**Unchanged:** `durationSeconds` remains the DIMO detector envelope. Historical rows stay valid.

---

## 2. REFUEL-specific observation semantics

| Field | Semantics |
|-------|-----------|
| `fuelLevelRiseStart` | First telemetry sample in the material fuel-level increase (nullable) |
| `fuelLevelRiseEnd` | Last sample of the material increase before plateau (nullable) |
| `fuelLevelRiseDurationSeconds` | Observed fuel-level-rise duration; **not** pump/nozzle duration |

Derived at persist time from `DimoSegmentsService.fetchFuelLevelSamples()` + `deriveRefuelFuelLevelRise()`.

---

## 3. RECHARGE semantics

RECHARGE events do **not** populate fuel-rise fields. `durationSeconds` continues to represent the charging session/detection envelope (often ≥15 min by design).

---

## 4. Fuel-rise derivation

Module: `backend/src/modules/vehicle-intelligence/energy-events/refuel-fuel-rise.ts`

- Input: 30 s fuel-level samples inside detection window
- Thresholds: ≥3 samples, ≥2 % material delta, 10 % bracket fraction, ≥30 s rise duration
- Tolerates one-sample regressions ≤1 %
- Returns nulls when evidence insufficient (conservative)

---

## 5. Nullability

| Case | `fuelLevelRise*` fields |
|------|-------------------------|
| REFUEL + sufficient telemetry | Populated |
| REFUEL + sparse/noisy/missing | `null` |
| RECHARGE | Always `null` |

---

## 6. Deduplication lifecycle

Module: `refuel-sibling-reconciliation.ts`

On each detection run, after canonical REFUEL upsert:

- Find overlapping REFUEL siblings (same token, compatible fuel transition)
- If canonical has **longer** `durationSeconds` and sibling is contained/overlapping → delete sibling
- Idempotent; does not touch unrelated refuels

Fixes KS MX 2024 Aug-28 stale 685 s row when 4818 s canonical is processed.

---

## 7. Historical compatibility

- No automatic rewrite of `durationSeconds` on existing rows
- Backfill candidates (fuel-rise derivation + sibling reconciliation) documented separately:
  `architecture/P1_3_ENERGY_REFUEL_HISTORICAL_BACKFILL_CANDIDATES_2026-08-30.md`

---

## 8. Migration / rollback

Migration: `20260830140000_vehicle_energy_event_fuel_level_rise` (nullable columns only).

Rollback: drop three columns; UI falls back to omitting rise duration (no envelope-as-pump label).

---

## API / UI

- `EnergyEventDto` exposes additive fields; `durationSeconds` unchanged
- `TripTimelineEnergyCard`: REFUEL shows signal-change minutes + detection window label; RECHARGE unchanged

---

## Observability

Prometheus counters:

- `synqdrive_energy_refuel_detected_total`
- `synqdrive_energy_refuel_fuel_rise_derived_total`
- `synqdrive_energy_refuel_fuel_rise_unavailable_total`
- `synqdrive_energy_refuel_sibling_reconciled_total`

Structured logs: `energy.refuel.fuel_rise_derived`, `energy.refuel.fuel_rise_unavailable`, `energy.refuel.sibling_reconciled`
