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
- Fleet-map: **5s** Redis cache on full `FleetMapVehicleDto[]`
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
| WOB L 7503 | Good Health | good | NOT_EVALUABLE | ready | true | **Nicht bewertbar** |
| WOB L 9755 | Good Health | warning | NOT_EVALUABLE | ready | true | **Nicht bewertbar** |
| HMÜ C 215 | Good Health | unknown | PARTIALLY_EVALUABLE | ready | true | **Eingeschränkt bewertbar** |

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

---

## Post-DIMO-Backfill Re-Evaluation (2026-08-25)

### Context

| Item | SHA / state |
|------|-------------|
| **Current main** | `84486fc219bb4a3b48d13db11302ad2025b29c72` |
| **Original #1277 head** | `41a6df7c1ba1f2f373845ae0b7f14bbe915a7874` |
| **Rebased #1277 head** | `3c8599b16134e8832d97c883930607b455637695` |
| **Rebase strategy** | `git rebase origin/main` — **0 conflicts** |
| **DIMO provider-link blocker** | **CLOSED** (#1281 + #1290 + backfill audit `84486fc2`) |
| **Provider-link code in #1277 diff** | **NO** (expected) |

Rebase brought in #1281 provider-link normalization, #1290 provider-specific DIMO FK schema, and post-backfill audit commits. No stale pre-provider-fix logic reintroduced; `vehicles.service.ts` diff is limited to P0.4 `healthEvaluation` wiring on the existing single `getVehicleProjections()` batch.

### Rebase conflict resolution

| Metric | Value |
|--------|-------|
| Conflicts | **0** |
| Stale changes dropped | **None required** — clean rebase |
| Files changed vs main | 29 (all P0.4 REQUIRED / TEST / DOC) |

### All-six Production read-only shadow (post-DIMO)

Executed on VPS with PR branch clone (`3c8599b1`) + production `backend.env`. **No deploy, no PM2, no mutations.**

```bash
sudo SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
  npx ts-node -r tsconfig-paths/register scripts/ops/shadow-fleet-health-evaluation-readonly.ts \
  --organization-id=faa710c9-6d91-4079-a7d5-91fdccdec14a \
  --license-plate="HMÜ C 215" --license-plate="KS FH 660E" --license-plate="KS MS 661" \
  --license-plate="KS MX 2024" --license-plate="WOB L 7503" --license-plate="WOB L 9755"
```

Connectivity columns from post-backfill Production P0.1/P0.2 baseline (read-only, verified same session).

| Vehicle | ProviderLink | Telemetry | Operational (P0.3) | condition | evaluability | pipeline | stale | P0.4 DE label | Legacy | Changed? | Safe? |
|---------|--------------|-----------|-------------------|-----------|--------------|----------|-------|---------------|--------|----------|-------|
| HMÜ C 215 | ACTIVE | standby | **AVAILABLE** | unknown | PARTIALLY_EVALUABLE | ready | true | **Eingeschränkt bewertbar** | Gut | YES | YES |
| KS FH 660E | REAUTH_REQUIRED | standby | NEEDS_VERIFICATION | warning | PARTIALLY_EVALUABLE | ready | true | **Eingeschränkt bewertbar** | Gut | YES | YES |
| KS MS 661 | REAUTH_REQUIRED | standby | NEEDS_VERIFICATION | warning | PARTIALLY_EVALUABLE | ready | true | **Eingeschränkt bewertbar** | Gut | YES | YES |
| KS MX 2024 | REAUTH_REQUIRED | standby | NEEDS_VERIFICATION | warning | PARTIALLY_EVALUABLE | ready | true | **Eingeschränkt bewertbar** | Gut | YES | YES |
| WOB L 7503 | ACTIVE | offline | NEEDS_VERIFICATION | good | NOT_EVALUABLE | ready | true | **Nicht bewertbar** | Gut | YES | YES |
| WOB L 9755 | ACTIVE | offline | NEEDS_VERIFICATION | warning | NOT_EVALUABLE | ready | true | **Nicht bewertbar** | Gut | YES | YES |

**All six:** `wouldShowEvaluableGood: false`. No stale/non-evaluable vehicle shows plain **Gut**.

### HMÜ C 215 — updated acceptance (post-DIMO)

| Field | Value |
|-------|-------|
| Provider | ACTIVE |
| Telemetry | standby (PLUGGED_INFERRED) |
| operationalAvailability | **AVAILABLE** (unchanged P0.3) |
| condition | `unknown` |
| evaluability | `PARTIALLY_EVALUABLE` |
| pipeline | `ready` |
| anyModuleDataStale | `true` |
| P0.4 label | **Eingeschränkt bewertbar** |
| Decisive reason | Health evidence has stale module data (`anyModuleDataStale: true`) with `condition: unknown` despite healthy provider link. Provider ACTIVE does **not** imply Gut. |

Result may legitimately differ from pre-DIMO run; outcome is traceable to Health evidence, not missing provider mapping.

### WOB L 7503 / WOB L 9755

Conservative presentation preserved. Historical `condition: good` (7503) blocked from **Gut** by `NOT_EVALUABLE` + stale evidence. Offline telemetry + NEEDS_VERIFICATION operational state does not override evaluability gate.

### KS MS 661 / KS FH 660E / KS MX 2024 (auth cases)

`REAUTH_REQUIRED` provider state does **not** fabricate Health severity. Canonical `condition: warning` exists in evidence but `PARTIALLY_EVALUABLE` gates presentation to **Eingeschränkt bewertbar**, not **Auffällig**. Authorization failure limits confidence; it does not invent critical/warning Fleet badge when not EVALUABLE.

### P0.3 regression

| Vehicle | Expected | Shadow result |
|---------|----------|---------------|
| HMÜ C 215 | AVAILABLE | **AVAILABLE** PASS |
| WOB L 7503 | NEEDS_VERIFICATION | **NEEDS_VERIFICATION** PASS |
| WOB L 9755 | NEEDS_VERIFICATION | **NEEDS_VERIFICATION** PASS |
| KS MS 661 | NEEDS_VERIFICATION | **NEEDS_VERIFICATION** PASS |

P0.4 does not mutate P0.3 values.

### Test matrix (re-run on rebased head)

| Suite | Result |
|-------|--------|
| A1–A8 (health-evidence-applicability) | **8/8 PASS** |
| B1–B9 (fleet-health-evaluation.fleet-map) | **9/9 PASS** |
| F1–F10 (presentation + display) | **10/10 PASS** |
| P0.3 fleet-operational-availability.fleet-map | **7/7 PASS** |
| Backend typecheck / build | **PASS** |
| Frontend typecheck / build | **PASS** |

### CI (rebased push `3c8599b1`)

| Workflow | Gate | Notes |
|----------|------|-------|
| Vehicle Detail — Production Readiness CI | **PASS** (CI gate all critical jobs) | Lint, typecheck, tests, build, E2E |
| Legal Documents — Production Readiness CI | Lint **FAIL** | **Unrelated:** `prefer-const` in `vehicles.service.register-from-dimo.spec.ts` from main (#1290); **not in #1277 diff** |

### Scope boundaries (unchanged)

- Fleet list/mobile: P0.4 enabled (`FleetOperatorRow` + `healthEvaluationBadge: true`)
- Fleet map HUD: no Health badge
- Dashboard drawer (`CompactFleetDrawerVehicleRow`): legacy path — **not migrated**
- Vehicle Detail Health: **OUT OF SCOPE**

### Cache semantics (confirmed on rebased main)

| Cache | TTL |
|-------|-----|
| Rental Health Redis | **45s** (`RENTAL_HEALTH_SUMMARY_CACHE_TTL_SECONDS`) |
| Fleet-map Redis | **5s** (`FLEET_MAP_CACHE_TTL_SECONDS`) |

Bounded delay only; cannot permanently preserve legacy Gut when evaluability is not EVALUABLE.

### N+1 / batch

`getFleetMapData()` → single `getVehicleProjections()` batch → both `operationalAvailability` and `healthEvaluation`. B8 test confirms one batch call, no per-vehicle projection.

### Production Connectivity Processing Gate

**CONDITIONAL** (unchanged; post-cutover unplug test not performed here).

### Final merge verdict (post-DIMO)

| Gate | Result |
|------|--------|
| P0.4 Health domain contract | **PASS** |
| P0.4 Fleet consumer | **PASS** |
| Post-DIMO Production acceptance | **PASS** |
| P0.3 regression | **PASS** |
| Provider-link regression | **PASS** (untouched) |
| Production mutations | **NONE** |
| **PR #1277 MERGE READY** | **YES** |

**Note:** One unrelated pre-main lint failure in Legal Documents workflow (`register-from-dimo.spec.ts` prefer-const). Vehicle Detail CI gate is green. Does not block P0.4 merge readiness; fix separately on main if full dual-workflow green is required.
