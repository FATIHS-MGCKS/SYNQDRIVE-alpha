# M3.3 B1.2 — First natural shutdown + rest session acceptance (read-only)

**Immutable T0:** `M3_3_B1_T0=2026-09-21T18:08:19Z`  
**Forensics captured (UTC):** `2026-09-21T18:47:32Z`  
**Runtime SHA:** `105f2c5ff28f74c0f8bc83655da94ab98749ce0d`  
**Mode:** Read-only — no deploy, restart, env/DB/DIMO mutation; T0 unchanged.  
**Prior:** `M3_3_B1_1_NATURAL_SHADOW_EVIDENCE_VALIDATION_2026-09-21.md`

## 1 — Runtime precheck

| Check | Result |
|-------|--------|
| `PRODUCTION_SHA` | `105f2c5ff28f74c0f8bc83655da94ab98749ce0d` |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | same release tree |
| `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` | **true** (shared env) |
| External health | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** (unchanged; no split-brain signal) |
| `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED` | **false** |
| `REST_STABLE_PROMOTION_ALLOWED` | **NO** |

Precheck **PASS** — not `ABORTED_RUNTIME_STATE`.

## 2 — Post-T0 shutdown search (ICE LTE_R1)

Cohort emitting post-T0 shadow traffic: **1** ICE LTE_R1 vehicle (`19fedd4b-…`, WOB L 7503).

| Field | Value |
|-------|-------|
| `POST_T0_TRIPS_WITH_SHUTDOWN_CONTEXT` | **2** trips with `start_time >= T0` on that vehicle; **active trip** still open at audit (`active_trip_id` present) — no completed drive→park→engine-off chain yet |
| `RAW_SHUTDOWN_CANDIDATES` | **15** VALID `LIVE_VOLTAGE` rows with `context.engineRunning = false` and **provider_timestamp** set (field-level hint only) |
| `GENERALIZED_ENGINE_OFF_TRANSITIONS` | **0** |

**Important:** Raw `engineRunning=false` on LTE_R1 **does not** imply trustworthy shutdown while **ignition on** and/or **speed above rest** and/or **active trip** — policy correctly routes to contamination/driving classes (see §3).

Representative candidate pattern (all 15 rows follow the same contamination logic):

| Field | Example (first / typical) |
|-------|---------------------------|
| `VEHICLE` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `TRIP_ID` | shadow rows carry ongoing trip when active (not shutdown-complete) |
| `LAST_DRIVING_PROVIDER_AT` | `2026-09-21T18:45:32Z` (engine-on LV still arriving post-T0) |
| `ENGINE_OFF_PROVIDER_AT` | N/A — no qualified engine-off **transition** observation |
| `LV_PROVIDER_AT` | e.g. `18:15:36Z` … `18:43:41Z` on contaminated samples |
| `SPEED` | **17–70 km/h** on most `engineRunning=false` rows |
| `IGNITION` | **true** on all 15 |
| `ENGINE_RUNNING` | false (LV context) |
| `PROVIDER_TIMESTAMP_SOURCE` | `PROVIDER_FIELD_TIMESTAMP` |

First post-T0 row (`18:12:04Z`, speed **0**, ignition **true**, engine **false**) classified **`DRIVING_NON_CHARGING`** — not a rest anchor.

## 3 — ENGINE_OFF classification

| Field | Value |
|-------|-------|
| `ENGINE_OFF_TRANSITION_OBSERVED` | **NO** |
| `ENGINE_OFF_GATE` | **`PENDING_NATURAL_EVENT`** |

**No trustworthy natural shutdown candidate** — rest-session acceptance **not evaluated as FAIL**.

Classification outcomes for raw `engineRunning=false` LV (explicit, not silent):

| Stored class | Count (of 15) | Policy reason (code-aligned) |
|--------------|----------------:|--------------------------------|
| `CHARGING_CONTAMINATED` | 6 | `isChargingContextFromFields` / alternator charging path while nominally engine-off in LV context |
| `ACTIVE_VEHICLE_CONTAMINATED` | 8 | `activeTrip === true` && speed **not** at rest (`ACTIVE_CONTAMINATION`) |
| `DRIVING_NON_CHARGING` | 1 | Driving semantics: ignition on / not parked engine-off triple (`ENGINE_STATE` / `SPEED_STATE` via driving branch) |

| Required | Value |
|----------|-------|
| `NO_SILENT_ENGINE_OFF_DROP` | **YES** — **34** post-T0 generalized rows; **0** uncaptured VALID LV |

No row met parked engine-off gate: `ignitionOn === false && engineRunning === false && isSpeedKnownAtRest(speed)`.

## 4 — Rest session opening

| Field | Value |
|-------|-------|
| `REST_SESSION_OPENED_OBSERVED` | **NO** |
| Post-T0 `battery_rest_sessions` | **0** |
| `REST_SESSION_GATE` | **PENDING** |

Anchor fields **N/A**.

## 5 — Session / temporal consistency

No session opened — anchor provenance **not exercised**.

| Field | Value |
|-------|-------|
| `ANCHOR_TIME_PROVENANCE` | **N/A** |
| `ANCHOR_TIMESTAMP_CONFLATION_FOUND` | **NO** (no anchor) |

## 6 — Multi-replica safety

| Field | Value |
|-------|-------|
| `DUPLICATE_EVIDENCE_ROWS` | **0** |
| `DUPLICATE_SOURCE_MEASUREMENT_ROWS` | **0** |
| `MULTIPLE_ACTIVE_SESSION_VEHICLES` | **0** |
| `ACTIVE_SESSION_CONSTRAINT_ERRORS` | **0** |
| `MULTI_REPLICA_SAFETY_GATE` | **PASS** |

## 7 — Trip association

No rest session — association **not applicable**.

| Field | Value |
|-------|-------|
| `TRIP_ASSOCIATION_RESULT` | **N/A** |
| `TRIP_ASSOCIATION_GATE` | **PENDING** |
| `LATE_ASSOCIATION_REQUIRED` | N/A |
| `LATE_ASSOCIATION_COMPLETED` | N/A |
| `RAW_EVIDENCE_TIMESTAMP_MUTATED` | **NO** |

## 8 — First post-anchor parked observation

| Field | Value |
|-------|-------|
| `PARKED_REST_CANDIDATE_OBSERVED` | **NO** |
| `PARKED_REST_GATE` | **PENDING_NATURAL_EVENT** |

## 9 — R1 ladder (independent)

| Field | Value |
|-------|-------|
| `R1_LADDER_OBSERVATION_OBSERVED` | **NO** |
| `R1_LADDER_GATE` | **PENDING** |

## 10 — Hard safety

| Field | Value |
|-------|-------|
| `REST_WAKE_VOLTAGE` post-T0 | **0** |
| `REST_STABLE_VOLTAGE` post-T0 | **0** |
| `CADENCE_BASED_REST_WAKE_PROMOTION_OCCURRED` | **NO** |
| `REST_STABLE_PROMOTION_OCCURRED` | **NO** |
| `R1_WAKE_LOAD_ORDER_KNOWN` | **NO** |

## 11 — Independent gates

| Gate | Result |
|------|--------|
| `ENGINE_OFF_GATE` | **PENDING** |
| `REST_SESSION_GATE` | **PENDING** |
| `TRIP_ASSOCIATION_GATE` | **PENDING** |
| `PARKED_REST_GATE` | **PENDING** |
| `R1_LADDER_GATE` | **PENDING** |
| `MULTI_REPLICA_SAFETY_GATE` | **PASS** |
| `PROVENANCE_GATE` | **PASS** (capture + explicit classification; no silent drops) |

## 12 — Interpretation

Post-B1 traffic on WOB is **ongoing ICE driving** with **LTE_R1 `engineRunning=false` while moving** (ignition on, non-zero speed). That matches known signal-observability constraints — **not** a natural shutdown acceptance sample. The shadow path is **working as designed** by refusing to mint `ENGINE_OFF_TRANSITION` or rest sessions from contaminated kinematics.

| Field | Value |
|-------|-------|
| `M3_3C_ALLOWED` | **NO** |
| `NEXT_ACTION` | Superseded for acceptance wording by **B1.2W** — see [`M3_3_B1_2W_PROVIDER_GAP_STATE_MACHINE_2026-09-21.md`](M3_3_B1_2W_PROVIDER_GAP_STATE_MACHINE_2026-09-21.md) §12. **Do not** require every physical shutdown to resolve authoritatively; **do** require explicit gap state after implementation. |

## 13 — B1 acceptance contract (revised @ B1.2W)

This document’s read-only forensics (**`B1_2_PENDING_NATURAL_TRUSTWORTHY_SHUTDOWN`**) remains valid historical evidence. **Normative B1 acceptance** after B1.2W:

- **SAFETY:** no fabricated ENGINE_OFF / RestSession / rest age; gap ≠ shutdown; stale replay ≠ new evidence.
- **STATE-MACHINE LIVENESS:** provider freeze → **`PROVIDER_OBSERVABILITY_GAP`** (post-implementation).
- **RESOLUTION:** GAP→OFF @ **T4** only; GAP→RUNNING → **`RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF`** without historical rest.
- **NOT REQUIRED:** every physical shutdown → authoritative rest (provider OFF delivery not guaranteed).

Full specification: `M3_3_B1_2W_PROVIDER_GAP_STATE_MACHINE_2026-09-21.md`.

Evidence log: `/opt/cursor/artifacts/m3_3_b1_2_production_forensics.log`

---

## Final machine block

```
M3_3_B1_2_RESULT=B1_2_PENDING_NATURAL_TRUSTWORTHY_SHUTDOWN

M3_3_B1_T0=2026-09-21T18:08:19Z

POST_T0_TRIPS_WITH_SHUTDOWN_CONTEXT=2
RAW_SHUTDOWN_CANDIDATES=15
GENERALIZED_ENGINE_OFF_TRANSITIONS=0

ENGINE_OFF_TRANSITION_OBSERVED=NO
ENGINE_OFF_OBSERVATION_ID=

REST_SESSION_OPENED_OBSERVED=NO
REST_SESSION_ID=
REST_SESSION_STATUS=

ANCHOR_OBSERVATION_LINKED_TO_SESSION=N/A
ANCHOR_ACTUAL_REST_AGE_MS=N/A
ANCHOR_TIME_PROVENANCE=N/A
ANCHOR_TIMESTAMP_CONFLATION_FOUND=NO

TRIP_ASSOCIATION_RESULT=N/A
RAW_EVIDENCE_TIMESTAMP_MUTATED=NO

PARKED_REST_CANDIDATE_OBSERVED=NO
ACTUAL_REST_AGE_MS=
NOMINAL_REST_INTERVAL_INDEX=

R1_LADDER_OBSERVATION_OBSERVED=NO

DUPLICATE_EVIDENCE_ROWS=0
DUPLICATE_SOURCE_MEASUREMENT_ROWS=0
MULTIPLE_ACTIVE_SESSION_VEHICLES=0
ACTIVE_SESSION_CONSTRAINT_ERRORS=0

REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false
CADENCE_BASED_REST_WAKE_PROMOTION_OCCURRED=NO
REST_STABLE_PROMOTION_OCCURRED=NO
R1_WAKE_LOAD_ORDER_KNOWN=NO

ENGINE_OFF_GATE=PENDING
REST_SESSION_GATE=PENDING
TRIP_ASSOCIATION_GATE=PENDING
PARKED_REST_GATE=PENDING
R1_LADDER_GATE=PENDING
PROVENANCE_GATE=PASS
MULTI_REPLICA_SAFETY_GATE=PASS

NO_SILENT_ENGINE_OFF_DROP=YES

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
PRODUCTION_CHANGED=NO

M3_3C_ALLOWED=NO
NEXT_ACTION=SEE_M3_3_B1_2W_PROVIDER_GAP_IMPLEMENTATION_WORKSTREAM
B1_ACCEPTANCE_REVISED=B1_2W_SECTION_12
```
