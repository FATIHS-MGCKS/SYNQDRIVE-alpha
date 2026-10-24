# Tire DS4 shadow input — data contract (P2 hardened)

**Table:** `tire_ds4_motion_shadow_input_v1`  
**Adapter version:** `tire-ds4-shadow-input-v1.0.1` (`TIRE_DS4_SHADOW_ADAPTER_VERSION`)  
**Queue:** `dimo.tire.ds4-shadow` (BullMQ, `TIRE_DS4_SHADOW_JOB_NAME=tire.ds4-shadow.materialize`)  
**Feature flag:** `TIRE_DS4_SHADOW_ENABLED` (default **false**)

## Identity & idempotency

Unique key: `(tire_trip_usage_ledger_id, di_v0_motion_core_shadow_run_id, adapter_version)`.

Rows are **insert-only** for a given triple: if a row exists and `content_fingerprint` differs, the adapter returns `evidence_immutable_conflict` and does **not** update the stored evidence.

| Column | Semantics |
|--------|-----------|
| `organization_id`, `vehicle_id`, `trip_id`, `tire_setup_id` | Tenant + attribution (must match ledger row) |
| `tire_trip_usage_ledger_id` | Productive trip-usage ledger FK (`ON DELETE RESTRICT` — shadow evidence retained for audit) |
| `di_v0_motion_core_shadow_run_id` | DS4 run consumed (`readForTrip.runId`), or a **terminal sentinel** (see below) |
| `combined_input_identity`, `pinned_snapshot_hash`, `content_fingerprint` | DS4 input/run binding |
| `shadow_bundle_version`, `speed_authority`, `events_algorithm_version` | DS4 contract slice |
| `adapter_version` | Tire adapter semver (independent of DS4 bundle) |
| `source` | Always `DS4` for load rows; terminal markers use neutral payload |
| `event_quality_coverage` | `NONE` \| `PARTIAL` — manoeuvre event quality only (never `FULL`) |
| `temporal_coverage` | `UNVERIFIED` \| `NONE` — temporal trip coverage; default `UNVERIFIED` until proven |
| `ds4_read_status` | Persist-time read outcome (`SUCCEEDED`, `SUCCEEDED_EMPTY`, `NOT_AVAILABLE`, `RETRY_EXHAUSTED`, …) |
| `input_payload` | JSON schema **2** — see below |

### Terminal sentinel run ids

Not DS4 runs; materialized once per ledger + adapter to stop catch-up / retry loops:

- `00000000-0000-4000-a000-000000000001` — retry exhausted  
- `00000000-0000-4000-a000-000000000002` — DS4 not available for trip  

## `input_payload` (schemaVersion `2`)

Neutral when no OK/DEGRADED manoeuvre counts exist (`neutral: true`). **No wear weights, intensity scores, or ordinal Δv buckets as acceleration intensity.**

Per channel (`acceleration`, `deceleration`):

- Quality counts: `okCount`, `degradedCount`, `limitedCount`, `excludedArtefactCount`, `excludedOtherQualityCount`
- `okDurationS` (OK events only, label-derived duration)
- `okDeltaKmhAbsSum` (OK events only — sum of \|Δv\| in km/h, not a wear factor)

Metadata: `eventQualityCoverage`, `temporalCoverage`, `limitations`, `newerFailedRunId`, `newerFailedRunStatus`.

## Processing semantics

1. Ledger **CREATED/UPDATED** → enqueue only (no `readForTrip` in finalization transaction); enqueue failures are logged and never reject finalization.
2. Processor calls org-scoped `DiV0MotionCoreShadowTripMapReadService.readForTrip`.
3. `PENDING` / missing identity / missing run row → delayed requeue until `TIRE_DS4_SHADOW_MAX_ATTEMPTS`, then **retry_exhausted** terminal marker.
4. `NOT_AVAILABLE` → **ds4_not_available** terminal marker (no periodic re-enqueue for that ledger).
5. `SUCCEEDED` / `SUCCEEDED_EMPTY` → immutable insert for `runId`.
6. **Replay:** a newer succeeded DS4 run for the same trip yields a **new** row (new `di_v0_motion_core_shadow_run_id`); catch-up SQL selects ledgers whose latest succeeded run is not yet materialized.

Catch-up scheduler enqueues only `findCatchupCandidates` rows (latest succeeded DS4 run not materialized, no terminal marker). Trips with no succeeded DS4 run are **not** catch-up candidates (avoids endless polling).

## Non-effects (by contract)

- No reads from this table in `TireHealthService`, snapshots, alerts, `TireHealthSummary`, or rental gate.
- No changes to DS4 algorithms, trip FSM, or Tire Wear Model V2.
