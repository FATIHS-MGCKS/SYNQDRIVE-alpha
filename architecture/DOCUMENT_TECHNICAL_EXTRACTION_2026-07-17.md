# Document Technical Extraction (V4.9.608)

**Date:** 2026-07-17  
**Prompt:** 33/84 — TIRE / BRAKE / BATTERY schema + planner hardening

## Scope

| Module | Role |
|--------|------|
| `document-tire-extraction.rules.ts` | Position, tread, pressure, dimension, DOT, measurement date, unit readers + plausibility + apply gate |
| `document-brake-extraction.rules.ts` | Axle/position, pad/disc thickness, minimum spec, measurement date, workshop finding + plausibility + apply gate |
| `document-battery-extraction.rules.ts` | LV/HV scope, measurement type, voltage, capacity, SOH source, temperature context + plausibility + apply gate |
| `document-action-planner.technical-rules.ts` | TIRE/BRAKE/BATTERY action plan assessment |

## Canonical fields

### TIRE

| Field | Aliases | Notes |
|-------|---------|-------|
| `measurementDate` | `eventDate`, `serviceDate` | Required for apply |
| `treadDepthUnit` | — | Explicit `mm` required when tread present |
| `pressureUnit` | — | `bar` / `psi` / `kPa` when pressure present |
| `treadDepthMm.{fl,fr,rl,rr}` | flat dotted keys | Only stated positions apply |
| `pressureBar.{fl,fr,rl,rr}` | `pressure.*` | Optional per-position pressure |
| `tireSize` | `dimensionFront/Rear` | Dimension |
| `dot` | `dotByPosition`, `dotFront/Rear` | DOT |

### BRAKE

| Field | Aliases | Notes |
|-------|---------|-------|
| `measurementDate` | `eventDate`, `serviceDate` | Required for apply |
| `scopeCsv` | `scope`, `serviceScope` | Stated axles only — never invented |
| `padThicknessUnit` | `discThicknessUnit`, `thicknessUnit` | Explicit `mm` |
| `frontPadMm` / `rearPadMm` | `measured.*` | Belagstärke per stated axle |
| `frontDiscMm` / `rearDiscMm` | `frontRotorWidthMm` | Scheibendicke per stated axle |
| `minimumPadMm*` / `minimumDiscMm*` | `minimumPadMm` | Mindestmaß when stated |
| `workshopFinding` | `workshopReport`, `description` | Werkstattbefund |
| `serviceKind` | — | No `full_brake_service` default on apply |

### BATTERY

| Field | Aliases | Notes |
|-------|---------|-------|
| `measurementDate` | `eventDate`, `serviceDate` | Required for apply |
| `scope` | `batteryScope`, `targetScope` | `lv` / `hv` — no `lv` default |
| `recordKind` | `measurementType`, `serviceKind` | Messungsart |
| `sohPercent` | — | Apply only with confirmed `sohSource` |
| `sohSource` | inferred from `testResult` | Blocks LV inference as SOH |
| `capacityKwh` / `capacityAh` | `hvCapacityKwh`, `lvCapacityAh` | Kapazität |
| `temperatureContext` | `ambientTemperatureNote` | Temperaturkontext |
| `deviceOrWorkshop` | `testDevice`, `workshopName` | Gerät/Werkstatt |

## Rules

1. **Explicit units** — tread/pressure/brake thickness units must be confirmed before apply.
2. **No invented positions** — tire wheels and brake axles apply only when stated in extraction.
3. **Measurement date required** — values without `measurementDate`/`eventDate` cannot auto-apply.
4. **Brake defaults removed** — no `full_brake_service` or `new Date()` fallback in apply.
5. **Battery scope required** — no default `scope='lv'` or `observedAt=now` in apply path.
6. **SOH source gate** — LV voltage/resting evidence cannot be applied as confirmed SOH.
7. **Unknown battery type** — type-specific ranges skipped with WARNING only.

## Apply flow

```
applyTireReport
  → assessTireApplyGate
  → buildTireMeasurementApplyPayload
  → TireLifecycleService.recordMeasurement (stated positions only)

applyBrake
  → assessBrakeApplyGate
  → buildBrakeApplyPayload
  → BrakeLifecycleService.recordService + BrakeEvidenceService.recordMany

applyBattery
  → assessBatteryApplyGate
  → buildBatteryApplyPayload
  → BatteryEvidenceService.recordMany (+ optional LV snapshot)
```

## Tests

| Scenario | Fixture | Expected |
|----------|---------|----------|
| Complete tire report | `TIRE_COMPLETE` | `READY`, apply allowed |
| Partial positions | `TIRE_PARTIAL_POSITIONS` | only `fl`/`rr` apply |
| Missing measurement date | `TIRE_MISSING_DATE` | `ARCHIVE_ONLY` / blocked apply |
| Complete brake report | `BRAKE_COMPLETE` | `READY` |
| Front axle only | `BRAKE_FRONT_ONLY` | stated axle only |
| Missing brake date/unit | `BRAKE_MISSING_DATE`, `BRAKE_MISSING_UNIT` | blocked apply |
| HV SOH confirmed | `BATTERY_HV_SOH` | `READY`, SOH applied |
| LV SOH inferred | `BATTERY_LV_SOH_INFERRED` | `BLOCKED` |
| Missing battery scope/date | `BATTERY_MISSING_SCOPE`, `BATTERY_MISSING_DATE` | blocked apply |

Fixtures: `__fixtures__/document-tire-fixtures.ts`, `document-brake-fixtures.ts`, `document-battery-fixtures.ts`
