# Tire DS4 shadow input — data contract (P2)

**Table:** `tire_ds4_motion_shadow_input_v1`  
**Adapter version:** `tire-ds4-shadow-input-v1.0.0` (`TIRE_DS4_SHADOW_ADAPTER_VERSION`)  
**Queue:** `dimo.tire.ds4-shadow` (BullMQ, `TIRE_DS4_SHADOW_JOB_NAME=tire.ds4-shadow.materialize`)  
**Feature flag:** `TIRE_DS4_SHADOW_ENABLED` (default **false**)

## Identity & idempotency

Unique key: `(tire_trip_usage_ledger_id, di_v0_motion_core_shadow_run_id, adapter_version)`.

| Column | Semantics |
|--------|-----------|
| `organization_id`, `vehicle_id`, `trip_id`, `tire_setup_id` | Tenant + attribution (must match ledger row) |
| `tire_trip_usage_ledger_id` | Productive trip-usage ledger FK |
| `di_v0_motion_core_shadow_run_id` | DS4 run consumed (`readForTrip.runId`) |
| `combined_input_identity`, `pinned_snapshot_hash`, `content_fingerprint` | DS4 input/run binding |
| `shadow_bundle_version`, `speed_authority`, `events_algorithm_version` | DS4 contract slice |
| `adapter_version` | Tire adapter semver (independent of DS4 bundle) |
| `source` | Always `DS4` |
| `coverage` | `NONE` \| `PARTIAL` \| `FULL` (admission-derived; not a wear score) |
| `ds4_read_status` | `SUCCEEDED` or `SUCCEEDED_EMPTY` at persist time |
| `input_payload` | JSON v1 — see below |

## `input_payload` (schemaVersion `1`)

Neutral when no OK/DEGRADED manoeuvre counts exist (`neutral: true`). No wear weights, factors, or V2 coupling.

Per channel (`acceleration`, `deceleration`):

- Quality counts: `okCount`, `degradedCount`, `limitedCount`, `excludedArtefactCount`, `excludedOtherQualityCount`
- `okDurationS` (OK events only, label-derived duration)
- `ordinalDeltaKmhBuckets` (`low` \| `medium` \| `high`) — **OK only**, counts only; never uses `peakAccel1sMps2`

Metadata: `intensityAdmissible` (bundle contains `EVENT_V0_3_PLAUS_V0_2`), `limitations`, `newerFailedRunId`, `newerFailedRunStatus`.

## Processing semantics

1. Ledger **CREATED/UPDATED** → enqueue only (no `readForTrip` in finalization transaction).
2. Processor calls org-scoped `DiV0MotionCoreShadowTripMapReadService.readForTrip`.
3. `PENDING` / `FAILED` (no succeeded run) → delayed requeue with exponential backoff until `TIRE_DS4_SHADOW_MAX_ATTEMPTS`.
4. `NOT_AVAILABLE` → no row (allowlist / coverage gap).
5. `SUCCEEDED` / `SUCCEEDED_EMPTY` → upsert shadow row.

Catch-up scheduler (`tire_ds4_shadow_catchup`) enqueues ledger rows missing a row for the current `adapter_version`.

## Non-effects (by contract)

- No reads from this table in `TireHealthService`, snapshots, alerts, `TireHealthSummary`, or rental gate.
- No changes to DS4 algorithms, trip FSM, or Tire Wear Model V2.
