# M3.3C C2 — Charge opportunity source contract (raw context)

**Date:** 2026-09-23  
**Mode:** C2.0 forensics + C2.1 read-only reader / pure raw-feature policy  
**Prior:** `M3_3_C0_RETENTION_CHARGE_OPPORTUNITY_PREFLIGHT_2026-09-22.md`, `M3_3_C1_REST_SESSION_FEATURE_FOUNDATION_2026-09-22.md`

## Classifier reachability (unchanged in C2)

```
DRIVING_CHARGING_REACHABLE_BY_CURRENT_CLASSIFIER=NO
C2_CAN_RELY_ON_DRIVING_CHARGING_CLASS=NO
M3_3A_CLASSIFIER_REACHABILITY_FOLLOWUP_REQUIRED=YES
M3_3A_CLASSIFIER_REACHABILITY_BLOCKS_C2=NO
```

**Reason:** `generalized-evidence-classification.policy.ts` evaluates `isChargingContextFromFields()` **before** the branch that would assign `DRIVING_CHARGING`. Any of:

- `voltage >= 13.25 V`
- `isLvCharging === true`
- `isHvCharging === true`

returns `CHARGING_CONTAMINATED` first. Alternator band uses `13.8 V` (subset of `13.25`). Active trip + movement can return `ACTIVE_VEHICLE_CONTAMINATED` even earlier.

**C2 does not modify classifier semantics.**

## C0 source-contract correction

C0 proposed `driving_charging_observation_count` = GE `DRIVING_CHARGING` count. That is **invalid** under current ordering.

C2.1 primary charge evidence:

| Field | Authority |
|-------|-----------|
| `qualifiedLvObservationCount` | Provider-field LV time + plausible voltage in charge window |
| `alternatorBandLvSampleCount` | Same + `voltage >= SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V` (13.8) |
| `engineRunningTrueProviderSnapshotObservationCount` | `engineRunning` + `stateTimestampSource === PROVIDER_SNAPSHOT_TIMESTAMP` |
| `runningAlternatorAlignedObservationCount` / `runningAlternatorPartialObservationCount` | Combined raw evidence with alignment class |
| `classifierDrivingChargingObservationCount` | **Diagnostic only** — `evidenceClass === DRIVING_CHARGING` |

```
C0_CHARGE_SOURCE_CONTRACT_CORRECTED=YES
```

## Timestamp authority (C2 v1)

```
CHARGE_VOLTAGE_TIME_AUTHORITY=PROVIDER_FIELD_TIMESTAMP
CHARGE_STATE_TIME_AUTHORITY=PROVIDER_SNAPSHOT_TIMESTAMP (engine-running counts only)
VLS_PROVIDER_FETCHED_AT_STATE_TIME_AUTHORITY=NO
INGEST_WALL_CLOCK_STATE_TIME_AUTHORITY=NO
TRIP_FSM_CANONICAL_STATE_TIME_AUTHORITY=NO
INGEST_WALL_CLOCK_ALLOWED_FOR_CHARGE_DURATION=NO
```

Voltage qualification: `providerTimestampSource === PROVIDER_FIELD_TIMESTAMP` and `voltageObservedAt != null` inside `[chargeContextStartAt, anchorAt)`.

State qualification for engine-running counts: `stateTimestampSource === PROVIDER_SNAPSHOT_TIMESTAMP` and `stateObservedAt` in window.

## Charge context window

Hierarchy: `confirmedTripId` → `candidateTripId` (only if confirmed null) → **NONE**.

Valid linked trip requires: same vehicle, `COMPLETED`, start/end present, `startTime < anchorAt`, `|endTime − anchorAt| <= TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS` (120s).

```
UNLINKED_CHARGE_CONTEXT_POLICY=NO_INFERRED_TRIP_WINDOW
```

Invalid linked trip → `windowSource=NONE` with bounded reasons — **no** fallback to nearby trips or 24h lookback.

## Deferred v1 features (explicit null)

```
ENGINE_RUNNING_COVERAGE_V1=DEFERRED_NO_BRIDGE_POLICY
LV_VOLTAGE_TIME_PROXY_V1=DEFERRED_NO_BRIDGE_POLICY
engineRunningObservedCoverageMs=null
lvVoltageTimeProxyVms=null
lvVoltageTimeProxyCoveredMs=null
```

## Classification

```
CHARGE_OPPORTUNITY_THRESHOLD_STATUS=NOT_PRODUCTION_CALIBRATED
C2_CLASSIFICATION_OUTPUT_DEFAULT=UNKNOWN
```

C2.1 returns `chargeOpportunityClass=UNKNOWN` always.

## Temperature

```
GE_TEMPERATURE_CURRENTLY_POPULATED=NO
GE_TEMPERATURE_USED_AS_PROVIDER_QUALIFIED_V1=NO
```

`GeneralizedEvidenceCaptureService` does not persist GE `temperatureC` / `temperatureObservedAt` today. C2 v1 uses `VehicleTrip.outsideTemperatureStartC` with `temperatureSource=TRIP_EXTERIOR` when finite.

## Implementation (C2.1)

| Component | Path |
|-----------|------|
| Raw policy version | `M3_3C_C2_V1` |
| Window policy | `charge-opportunity-window.policy.ts` |
| Raw features policy | `rest-session-charge-opportunity.policy.ts` |
| Read-only reader | `rest-session-charge-context.reader.ts` |

```
LIVE_C2_CALCULATION_HOOKS=0
BatteryRestSessionFeature writes=0 (C3)
```

## Production forensics reference (C2.0)

- Production SHA `2b0ef15f`; C1 migration **not** applied (expected).
- `DRIVING_CHARGING` production count **0**; raw alternator/LV running evidence **YES**.
- 7/8 rest sessions unlinked; no safe inferred trip window.
