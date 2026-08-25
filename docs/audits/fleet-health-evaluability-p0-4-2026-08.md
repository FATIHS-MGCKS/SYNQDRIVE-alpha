# P0.4 — Fleet Health Evaluability Consumer Migration

**Date:** 2026-08-25  
**Status:** Implemented (draft PR)  
**Baseline:** P0.3 merged (#1275), P0.2 projection (#1273), P0.1 connectivity (#1263–#1269)

## A. Legacy Health source

| Layer | Source | Classification |
|-------|--------|----------------|
| Fleet-map API | `Vehicle.healthStatus` column → `RENTAL_HEALTH_MAP` → string `Good Health` / `Warning` / `Critical` | LEGACY FALLBACK |
| Fleet list health badge | `resolveHealthDisplay()` in `fleetVehicleDisplay.ts` | FRONTEND DERIVATION |
| Rental Health V1 map | `useFleetHealthMap` → `VehicleHealthResponse.overall_state` | CANONICAL HEALTH CONDITION (when loaded) |
| Critical bug (pre-P0.4) | `else if (v.healthStatus) { status = 'good' }` without evaluability | LEGACY FALLBACK → false **Gut** |

Fleet-map HUD does **not** show Health badge (availability only).

## B. Canonical Health authority

- **Condition:** Rental Health V1 `overall_state` (`good` | `warning` | `critical` | `unknown` | `n_a`)
- **Mapped in P0.2:** `HealthEvidenceSnapshot.conditionState` via `healthEvidenceFromVehicleHealth()`
- **Exposed on Fleet DTO:** `healthEvaluation.condition` (passthrough from projection evidence)

## C. Condition vs evaluability

| Domain | Field | Question |
|--------|-------|----------|
| Health condition | `condition` / `overall_state` | How severe is the assessed state? |
| Health evaluability | P0.2 `healthEvaluability` | Can we trust presenting that condition now? |

**Invariant:** `condition=good` + `evaluability≠EVALUABLE` must **not** display **Gut**.

## D. Health evidence / freshness

From `HealthEvidenceSnapshot`:

- `generatedAt` — last successful health evaluation timestamp
- `pipelineAvailability` — `ready` | `partial` | `unavailable`
- `anyModuleDataStale` — any module `data_stale === true`
- `telemetryDependentModulesEvaluated` — battery/tires/brakes/DTC in scope

P0.2 `deriveHealthEvaluability()` applies connectivity limiter (downgrade only).

## E. Cache semantics

- Rental Health: Redis cache-aside in `RentalHealthSummaryService`
- Fleet-map: 30s Redis cache on full `FleetMapVehicleDto[]`
- Stale cached GOOD + `NOT_EVALUABLE` → P0.4 presentation shows **Nicht bewertbar**, not Gut
- Projection batch failure → `healthEvaluation` UNKNOWN fallback (request-scoped `generatedAt`)

## F. Hardware applicability

`telemetryDependentModulesEvaluated` is false when only non-telemetry modules apply (e.g. ICE without evaluated battery). Missing EV battery on ICE does not alone force `NOT_EVALUABLE`.

## G. P0.2 integration

Single `getVehicleProjections()` call in `getFleetMapData()` produces:

- `operationalAvailability` (P0.3)
- `healthEvaluation` (P0.4)

No second projection batch. No per-vehicle health service N+1.

## H. Fleet DTO migration

```typescript
healthEvaluation: {
  condition: 'good' | 'warning' | 'critical' | 'unknown'
  evaluability: 'EVALUABLE' | 'PARTIALLY_EVALUABLE' | 'NOT_EVALUABLE' | 'UNKNOWN'
  generatedAt: string
  healthEvidenceAt: string | null
  anyModuleDataStale: boolean | null
  source: 'p0.2_projection'
}
```

## I. Presentation matrix

| Evaluability | Condition | DE label |
|--------------|-----------|----------|
| EVALUABLE | good | Gut |
| EVALUABLE | warning | Auffällig |
| EVALUABLE | critical | Kritisch |
| PARTIALLY_EVALUABLE | * | Eingeschränkt bewertbar |
| NOT_EVALUABLE | * | Nicht bewertbar |
| UNKNOWN | * | Status unbekannt |

Mapper: `mapFleetHealthPresentation()` — presentation only, no domain logic.

## J. Desktop / mobile

- **Desktop + mobile Fleet row:** `FleetOperatorRow` with `healthEvaluationBadge: true`
- **Map HUD:** unchanged (no Health badge)
- **Dashboard drawer:** not migrated (uses legacy `resolveFleetVehicleDisplayState` without flag)

## K. Failure fallback

Missing projection / loader failure → `evaluability: UNKNOWN`, `condition: unknown` → **Status unbekannt**. Never Gut.

## L. Filters / KPIs

Fleet Command tab filters and KPI counts remain **business-scoped** (unchanged from P0.3).

## M. Production reference results

Run read-only:

```bash
cd backend
SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
npx ts-node -r tsconfig-paths/register scripts/ops/shadow-fleet-health-evaluation-readonly.ts \
  --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --license-plate="WOB L 7503" --license-plate="WOB L 9755" --license-plate="HMÜ C 215"
```

*(Results recorded in PR / agent final report after VPS run.)*

## N. Known limitations

- Vehicle Detail header still uses legacy health path (future consumer migration)
- Dashboard `CompactFleetDrawerVehicleRow` not migrated in P0.4
- Fleet filters do not yet distinguish evaluable vs stale health counts

## O. Final verdict

**P0.4 FLEET HEALTH EVALUABILITY:** PASS (pending CI + production read-only confirmation)  
**P0.4 CONSUMER MIGRATION:** READY  
**VEHICLE DETAIL HEALTH MIGRATION:** NOT READY (documented future work)  
**PRODUCTION PROCESSING GATE:** CONDITIONAL (unchanged)
