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
  pipelineAvailability: 'ready' | 'partial' | 'unavailable' | null
  generatedAt: string
  healthEvidenceAt: string | null
  anyModuleDataStale: boolean | null
  source: 'p0.2_projection'
}
```

`healthEvaluation.condition` is sourced **only** from Rental Health `overall_state` via projection evidence (`healthConditionState`). Legacy `Vehicle.healthStatus` is **not** used on the P0.4 path.

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

Executed read-only on VPS (PR branch clone + production `backend.env`, **no deploy / no PM2 / no mutations**):

```bash
sudo SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
  npx ts-node -r tsconfig-paths/register scripts/ops/shadow-fleet-health-evaluation-readonly.ts \
  --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --license-plate="WOB L 7503" --license-plate="WOB L 9755" --license-plate="HMÜ C 215"
```

| Vehicle | Legacy | condition | evaluability | pipeline | stale | P0.4 label |
|---------|--------|-----------|--------------|----------|-------|------------|
| WOB L 7503 | Good Health | good | NOT_EVALUABLE | *(live)* | true | **Nicht bewertbar** |
| WOB L 9755 | Good Health | warning | NOT_EVALUABLE | *(live)* | true | **Nicht bewertbar** |
| HMÜ C 215 | Good Health | unknown | PARTIALLY_EVALUABLE | *(live)* | true | **Eingeschränkt bewertbar** |

All three: `wouldShowEvaluableGood: false`. Legacy would have shown **Gut**.

## N. Known limitations

- Vehicle Detail header still uses legacy health path (future consumer migration)
- Dashboard `CompactFleetDrawerVehicleRow` not migrated in P0.4
- Fleet filters do not yet distinguish evaluable vs stale health counts

## O. Final verdict

**P0.4 FLEET HEALTH EVALUABILITY:** PASS  
**P0.4 CONSUMER MIGRATION:** READY  
**VEHICLE DETAIL HEALTH MIGRATION:** NOT READY (documented future work)  
**PRODUCTION PROCESSING GATE:** CONDITIONAL (unchanged)

---

## Final Gate — Health Applicability & Production Verification

### Authority chain (production path)

```
RentalHealthSummaryService.getFleetRowsBatch()
  → VehicleHealth (overall_state, availability, modules[*].data_stale)
  → healthEvidenceFromVehicleHealth()  [health-evidence.adapter.ts]
  → HealthEvidenceSnapshot
  → deriveHealthEvaluability() / deriveHealthEvaluabilityFromHealthDomain()  [vehicle-operational-projection.builder.ts]
  → VehicleOperationalProjection
  → toFleetHealthEvaluationDto()  [fleet-health-evaluation.dto.ts]
  → VehiclesService.getFleetMapData()
  → mapFleetHealthPresentation()  [frontend, healthEvaluationBadge only]
```

### Module applicability (Rental Health V1)

| Representation | Meaning |
|----------------|---------|
| `state: 'n_a'` | **NOT_APPLICABLE** — structurally not applicable (e.g. module not fitted) |
| `state: 'unknown'` + `data_stale: true` | **APPLICABLE_BUT_STALE** or missing/stale evidence |
| `state: 'unknown'` + fresh timestamp | **APPLICABLE_BUT_MISSING** data |
| `pipeline_availability: 'unavailable'` (per module) | **PROVIDER_UNAVAILABLE** / loader failure |
| `pipeline_availability: 'not_applicable'` | module `n_a` — excluded from aggregate |

Aggregate `availability`: `ready` | `partial` | `unavailable` via `computeRentalHealthAvailability()`.

### `telemetryDependentModulesEvaluated` semantics

**Exact definition** (`health-evidence.adapter.ts`):

```typescript
RENTAL_HEALTH_MODULE_KEYS.some(
  key => TELEMETRY_DEPENDENT.has(key) &&
         modules[key]?.state !== undefined &&
         modules[key]?.state !== 'n_a'
)
```

| Value | Meaning |
|-------|---------|
| `true` | At least one telemetry-dependent module (battery, tires, brakes, error_codes, vehicle_alerts) is **applicable** (`state !== n_a`) |
| `false` | **All** telemetry-dependent modules are `n_a` **OR** absent — interpreted as "telemetry-dependent evaluation not in scope" |

**Not overloaded as:** "modules apply but could not be evaluated" — that case typically has `state: unknown` (applicable) → `true`.

**Connectivity limiter:** when `false`, offline telemetry does **not** downgrade evaluability (see P0.2 builder spec). When `true` + offline, may downgrade one step.

### `anyModuleDataStale` semantics

**Exact definition:** `RENTAL_HEALTH_MODULE_KEYS.some(key => modules[key]?.data_stale === true)`

- **All module keys participate** in the scan (including `n_a` modules if they carry `data_stale: true`).
- `n_a` does **not** automatically set `data_stale`; staleness is per-module from evaluators (`RENTAL_HEALTH_STALE_MS` = 48h for timestamp-based checks).
- Missing data → usually `unknown` + `data_stale: true`, which **does** set the flag.
- Provider unavailable → module `pipeline_available: false` → contributes to `availability: unavailable/partial`; may also set `data_stale: true`.
- **One stale module → true** for the whole vehicle.
- Stale historical `overall_state: good` **can remain** `condition=good` while evaluability becomes `NOT_EVALUABLE` / `PARTIALLY_EVALUABLE` — P0.4 blocks **Gut** presentation.

### `pipelineAvailability` semantics

From Rental Health `availability` (passthrough):

| Value | Meaning |
|-------|---------|
| `ready` | All applicable modules have `pipeline_availability: available` |
| `partial` | Mix of available and unavailable applicable modules |
| `unavailable` | No applicable module has available pipeline (or all `not_applicable`) |

Evaluability mapping (`deriveHealthEvaluabilityFromHealthDomain`):

- `unavailable` → `NOT_EVALUABLE`
- `partial` → `PARTIALLY_EVALUABLE` (unless stale forces `NOT_EVALUABLE`)
- `ready` + fresh → `EVALUABLE`

### Health evaluability truth table (P0.2)

| Case | Evaluability |
|------|--------------|
| H1 Applicable modules current, pipeline ready | EVALUABLE |
| H2 Some applicable stale/missing, pipeline ready | PARTIALLY_EVALUABLE |
| H2b Stale + pipeline partial/unavailable | NOT_EVALUABLE |
| H3 All evidence unavailable/stale | NOT_EVALUABLE |
| H4 No health row / no `generatedAt` | UNKNOWN |
| H5 Module `n_a` only | Does not reduce domain evaluability |
| H6 Provider unsupported optional signal | `n_a` — neutral |
| H7 Connectivity healthy + health absent | UNKNOWN |
| H8 Connectivity offline + stale telemetry-dependent | Downgrade (max one step) |
| H9 condition CRITICAL + current ready evidence | EVALUABLE + CRITICAL |
| H10 Historical GOOD + stale/unavailable | NOT plain Gut (NOT_EVALUABLE / PARTIALLY) |

### B9 correction

**YES** — original B9 used `telemetryDependentModulesEvaluated: false` on a synthetic snapshot, which does **not** prove hardware non-applicability. Replaced with canonical `VehicleHealth` fixture where all telemetry modules are `n_a` and service/complaints are `good` (`iceTelemetryModulesNotApplicableHealth()`).

### Cache / freshness interaction

| Cache | TTL | Stale semantics |
|-------|-----|-----------------|
| Rental Health Redis | **45s** | `cache_stale: true` after **30s** soft threshold (meta only; does not auto-set `data_stale`) |
| Fleet-map Redis | **5s** | Full DTO including `healthEvaluation`; projection recomputed on miss |

**Can cache mask stale Health?** **YES**, bounded:

- Max ~**5s** fleet-map window where prior `healthEvaluation` may persist.
- Max ~**45s** rental health Redis window; evaluability still derived from embedded module `data_stale` + `generated_at` inside cached payload — a cached GOOD with `anyModuleDataStale: true` still yields **Nicht bewertbar**.

### Legacy → P0.4 delta (production)

| Vehicle | Legacy label | P0.4 label |
|---------|--------------|------------|
| WOB L 7503 | Gut | Nicht bewertbar |
| WOB L 9755 | Gut (legacy) / warning (canonical) | Nicht bewertbar |
| HMÜ C 215 | Gut | Eingeschränkt bewertbar |

### Final merge verdict

**PR #1277 MERGE READY:** YES (pending CI green)  
**Production mutations:** NONE
