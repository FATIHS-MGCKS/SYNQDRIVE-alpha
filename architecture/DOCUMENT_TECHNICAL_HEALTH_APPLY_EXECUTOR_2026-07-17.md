# Document Technical Health Apply Executor (V4.9.616)

**Date:** 2026-07-17  
**Prompt:** 41/84 — Idempotent executors for TIRE, BRAKE, BATTERY

## Scope

| Module | Role |
|--------|------|
| `document-tire-extraction.rules.ts` | Gate + payload (units, positions, measurement date) |
| `document-brake-extraction.rules.ts` | Gate + payload (mm unit, axle scope, workshop finding) |
| `document-battery-extraction.rules.ts` | Gate + payload (scope, SOH source, LV/HV separation) |
| `document-action-planner.technical-rules.ts` | `APPLY_TIRE/BRAKE/BATTERY_MEASUREMENT` |
| `tire-lifecycle.service.ts` | Idempotent `applyMeasurementFromDocumentExtraction` |
| `brake-lifecycle.service.ts` | Transactional brake service event + evidence apply |
| `brake-evidence.service.ts` | `recordForDocumentExtraction` — one row per axle |
| `battery-health.service.ts` | Evidence + optional LV snapshot (no SOH override) |
| Prisma | `VehicleTireTreadMeasurement.documentExtractionId`, `BrakeEvidence` unique per extraction+axle |

## Rules

1. **Unified extraction anchor** — `documentExtractionId` on tire measurements and all technical evidence; legacy `linkedExtractionId` retained on tire events for audit compatibility.
2. **One evidence per intent** — brake: unique `(documentExtractionId, axle)`; battery: existing dedup tuple `(vehicleId, scope, valueType, sourceType, observedAt)`.
3. **Full provenance** — measurement type, units, provider `document_confirmed`, source types preserved on apply.
4. **No health score override** — LV snapshots keep `sohPercent: null`; canonical health remains in Battery V2 / brake health services.
5. **Domain validators** — existing apply gates (`assessTire/Brake/BatteryApplyGate`) run in executors before domain writes.
6. **Transactional brake path** — service event + lifecycle init + per-axle evidence in one domain method; partial retry completes missing evidence.
7. **Result entity IDs** — `tireMeasurement`, `serviceEvent`, `batteryEvidence` on action execution records.
8. **Legacy removal** — `applyTireReport` / `applyBrake` / `applyBattery` removed from apply service.

## Confirm / apply wiring

- `TIRE`, `BRAKE`, `BATTERY` route through `DocumentActionOrchestratorService`.

## Tests

- `tire-lifecycle-document-apply.spec.ts` — retry, race, documentExtractionId link
- `brake-lifecycle-document-apply.spec.ts` — retry, create, P2002 race
- `battery-document-apply.spec.ts` — retry, LV snapshot without SOH override, replacement event
- `executors/apply-technical-document-action.executor.spec.ts`
