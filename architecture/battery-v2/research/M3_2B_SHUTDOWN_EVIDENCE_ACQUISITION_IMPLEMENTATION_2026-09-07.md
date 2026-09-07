# M3.2B — Shadow Shutdown Evidence Acquisition Implementation

**Implementation date:** `2026-09-07`  
**Scope:** Shadow-only observability layer — **no authoritative battery state**  
**Feature flag:** `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED` (default **false**)

---

## Why this layer exists

M3.2A proved:

- `SNAPSHOT_FIELDS_ATOMIC=NO` — LV provider timestamp ≠ motion/trip state at persist time
- `CONFIRMED_POST_ENGINE_OFF_PRE_SLEEP_SAMPLE_EXISTS=NO` with current binding
- Passive trip accumulation alone is insufficient (`PASSIVE_WAITING_FOR_MORE_TRIPS_SUFFICIENT=NO`)

M3.2B captures **per-field timestamp provenance** and **pessimistic shadow classification** so production can measure whether state-verifiable shutdown evidence is observable before any hybrid health model implementation (M3.2C).

---

## Phase 0 — Architecture map (pre-implementation)

| Signal / context | Current production source |
|------------------|---------------------------|
| `CURRENT_LV_TIMESTAMP_SOURCE` | DIMO `lowVoltageBatteryCurrentVoltage.timestamp` → `BatteryObservationSnapshotContext.lvBatteryObservedAt` → `battery_measurements.observedAt` |
| `CURRENT_SPEED_STATE_SOURCE` | `vehicle_latest_states.speedKmh` read at LIVE_VOLTAGE persist (`buildRestTargetContext`) |
| `CURRENT_IGNITION_STATE_SOURCE` | `vehicle_latest_states.isIgnitionOn` at persist |
| `CURRENT_ENGINE_STATE_SOURCE` | Derived from `vehicle_latest_states.engineLoad > 5` at persist |
| `CURRENT_TRIP_STATE_SOURCE` | `vehicle_trip_detection_states.activeTripId != null` at persist |
| `CURRENT_CONTEXT_FIELDS_ATOMIC` | **NO** |

**Key files:**

| Layer | Path |
|-------|------|
| DIMO poll | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Snapshot classify | `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-observation.producer.ts` |
| LIVE_VOLTAGE persist | `backend/src/modules/vehicle-intelligence/battery-health/lv-live-voltage/lv-live-voltage-ingestion.service.ts` |
| Observation ingest | `backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-snapshot-ingestion.service.ts` |
| Trip finalize | `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts` |
| REST context (authoritative) | unchanged — `battery-rest-target-evaluation.ts` |

---

## What M3.2B captures

### `BatteryShutdownEvidenceObservation`

Shadow row per real observation within **T−10m … T+15m** of a completed ICE trip end.

- Per-field values + `*ObservedAt` + `*TimestampSource`
- `relativeToTripEndMs`
- `stateTimestampSkewMs`, `maxFieldTimestampSkewMs`
- `evidenceClass`, `confidenceClass`, `stateCompleteness`, `stateAlignmentClass`
- Idempotent via `idempotencyKey`

### `BatteryTripShutdownContext`

Immutable snapshot at trip finalization with per-field `ageMsAtTripEnd` and explicit `atomicClaim: false`.

---

## What M3.2B explicitly does NOT do

- Change Battery Health scores
- Create assessments or publications
- Reclassify REST_60M / REST_6H measurements
- Weaken REST quality rules
- Set `PRODUCTION_VALIDATED=YES`
- Backfill historical rows
- Introduce absolute SOH estimation

```
SHADOW_EVIDENCE_CAN_AFFECT_AUTHORITATIVE_BATTERY_STATE=NO
```

---

## Evidence classes (shadow only)

`ACTIVE_ALTERNATOR`, `ACTIVE_NON_CHARGING`, `SHUTDOWN_TRANSITION`, `POST_ENGINE_OFF_PRE_SLEEP`, `UNKNOWN_STATE`, `STALE_OR_SKEWED_STATE`

`POST_ENGINE_OFF_PRE_SLEEP` requires strict contract (trip finalized, eng/ign off, speed at rest, non-charging, aligned timestamps, near trip end). Documented constants in `shutdown-evidence.constants.ts`.

---

## Integration points

| Hook | Service | When |
|------|---------|------|
| Observation classify | `ShutdownEvidenceCaptureService.captureFromObservationClassify` | After LIVE_VOLTAGE persist attempt; errors isolated |
| Trip finalize | `ShutdownEvidenceTripContextService.captureAtTripFinalization` | After REST session open enqueue; `@Optional()` |

Both gated by `isBatteryV2ShutdownEvidenceShadowEnabled()`.

---

## Rollout plan

| Phase | Action |
|-------|--------|
| A | Merge code with flag **false** |
| B | Deploy with flag **false** — verify no regression |
| C | Enable `BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED=true` on production |
| D | Collect natural shutdown observations |
| E | Forensic evaluation: confirmed samples, skew, completeness, coverage |
| F | Decide M3.2C hybrid implementation |

```
M3_2C_ALLOWED_BEFORE_NATURAL_SHADOW_EVIDENCE=NO
```

---

## Machine-readable block

```
BATTERY_V2_M3_2B_SHUTDOWN_EVIDENCE_ACQUISITION=COMPLETE

CURRENT_CONTEXT_FIELDS_ATOMIC=NO

SHADOW_EVIDENCE_MODEL_CREATED=YES
TRIP_SHUTDOWN_CONTEXT_CREATED=YES

PER_FIELD_TIMESTAMP_PROVENANCE=YES
STATE_TIMESTAMP_SKEW_MEASURED=YES

EVIDENCE_CLASSES_IMPLEMENTED=YES
CONFIDENCE_CLASSES_IMPLEMENTED=YES

SHADOW_FEATURE_FLAG=BATTERY_V2_SHUTDOWN_EVIDENCE_SHADOW_ENABLED
SHADOW_FEATURE_DEFAULT=false

IDEMPOTENCY_PROVEN=YES
MULTI_REPLICA_SAFE=YES

SHADOW_EVIDENCE_CAN_AFFECT_AUTHORITATIVE_BATTERY_STATE=NO

REST_60M_BEHAVIOR_CHANGED=NO
REST_6H_BEHAVIOR_CHANGED=NO
ASSESSMENT_BEHAVIOR_CHANGED=NO
PUBLICATION_BEHAVIOR_CHANGED=NO
HEALTH_SCORE_BEHAVIOR_CHANGED=NO

MIGRATION_ADDITIVE=YES
BACKFILL_PERFORMED=NO

TESTS=PASS (6 suites / 17 tests shutdown-evidence)
GRAPH_VALIDATOR=PASS
TYPECHECK=PASS

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY

M3_2C_ALLOWED_BEFORE_NATURAL_SHADOW_EVIDENCE=NO

PRODUCTION_CHANGED=NO
```
