# M3.3 B1.2R — Targeted WOB L 7503 natural shutdown forensics (read-only)

**Vehicle:** WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`, ICE LTE_R1)  
**Immutable T0:** `M3_3_B1_T0=2026-09-21T18:08:19Z`  
**Known real-world event (operator):** drive then park ~**2026-09-21T18:48Z–18:58Z** UTC (~20:48–20:58 CEST)  
**Forensics captured (UTC):** `2026-09-21T19:22:04Z`  
**Runtime SHA:** `105f2c5ff28f74c0f8bc83655da94ab98749ce0d`  
**Mode:** Read-only — no production mutation.

## 1 — Exact trip

| Field | Value |
|-------|-------|
| `VEHICLE_ID` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `TRIP_ID` | **`db0039e8-748f-456c-ba4c-2d89854fc851`** |
| `TRIP_STARTED_AT` | `2026-09-21T18:39:58.514Z` |
| `TRIP_ENDED_AT` | `2026-09-21T18:47:47.634Z` (Trip FSM **COMPLETED** ~10–11 min before operator park window end) |
| `TRIP_STATUS` | **`COMPLETED`** (enum: `ONGOING` \| `COMPLETED` \| `CANCELLED` — no `RESTING`) |
| Trip FSM vs physical park | FSM end **≠** operator park time; do not equate. |
| `active_trip_id` at audit | **null** (`last_activity_at` = trip end) |

Prior post-T0 trip same day: `70b15202-…` ended `18:33:58Z`.

## 2 — Raw telemetry timeline (`18:40Z` → audit)

Provider-time ordered **VALID** `LIVE_VOLTAGE` rows (complete set in DB for this window — **6** rows, no collapse):

| PROVIDER_AT (UTC) | INGESTED_AT | VOLTAGE | ENGINE_RUNNING | IGNITION | SPEED_KMH | RPM | LV_CH | HV_CH | OUTCOME |
|-------------------|-------------|---------|----------------|----------|-----------|-----|-------|-------|---------|
| 18:41:01 | 18:41:07.998 | 14.069 | **true** | true | 21 | — | true | false | NEW_OBSERVATION |
| 18:41:52 | 18:42:07.914 | 14.023 | false | true | 25 | — | true | false | NEW_OBSERVATION |
| 18:42:52 | 18:43:08.027 | 14.064 | false | true | 51 | — | true | false | NEW_OBSERVATION |
| 18:43:41 | 18:44:07.937 | 14.037 | false | true | 11 | — | true | false | NEW_OBSERVATION |
| 18:45:32 | 18:46:07.954 | 14.089 | **true** | true | 18 | — | true | false | NEW_OBSERVATION |
| 18:47:56 | 18:48:08.002 | 14.126 | **true** | **false** | 0 | — | **true** | false | NEW_OBSERVATION |

**After `18:47:56Z`:** **0** additional VALID LIVE_VOLTAGE rows through `19:22Z` (including operator park window and >30 min post-trip).

`vehicle_latest_states`: speed 0, ignition off, online false, `source_timestamp` **`18:47:56Z`** (same as last LV; `provider_fetched_at` refreshed later without new LV measurement).

## 3 — Physical shutdown semantics

| Field | Value |
|-------|-------|
| `PHYSICAL_SHUTDOWN_CANDIDATE_FOUND` | **NO** (strict trustworthy candidate) |
| `PHYSICAL_SHUTDOWN_PROVIDER_AT` | **N/A** |
| `ENGINE_RUNNING_AT_SHUTDOWN` | Last LV: **`true`** @ `18:47:56Z` |
| `IGNITION_AT_SHUTDOWN` | **`false`** @ `18:47:56Z` |
| `SPEED_AT_SHUTDOWN` | **0** |
| `RPM_AT_SHUTDOWN` | not present in LV context |
| `SHUTDOWN_EVIDENCE_TRUSTWORTHY` | **NO** |

**Reason:** No provider-qualified row satisfies parked engine-off triple (`engineRunning=false`, `ignitionOff`, speed at rest) without **LV charging contamination**. Last sample still has **`engineRunning=true`** and **`isLvCharging=true`** — not a trustworthy engine-off transition. Post-park period has **no new LV** to observe shutdown or rest ladder.

Strict SQL filter (post-T0): **0** rows.

## 4 — Generalized evidence around shutdown

Window: no physical shutdown anchor → used trip-end neighborhood **`18:37Z–18:58Z`** evidence on WOB.

| EVIDENCE_ID (last in window) | CLASS @ 18:47:56 LV |
|------------------------------|---------------------|
| `0f67acaa-…` | **`CHARGING_CONTAMINATED`** |

`GENERALIZED_ENGINE_OFF_TRANSITION_FOUND=**NO**`

**Rejection for targeted acceptance (last LV @ 18:47:56):** **`CHARGING_CONTAMINATED`** + **`ENGINE_STATE_NOT_TRANSITION`** (LV context `engineRunning=true`) + **`IGNITION_STILL_ON`** N/A (ignition false but engine true) — primary: **not trustworthy shutdown semantics**, not silent drop.

All 7 generalized rows `18:40+` have explicit classes; **`NO_SILENT_ENGINE_OFF_DROP=YES`**.

## 5 — Critical acceptance rule (B1.2R)

Operator-confirmed park **does not** override provider LV semantics.

| Condition | Result |
|-----------|--------|
| Trustworthy raw shutdown + no `ENGINE_OFF_TRANSITION` | would be **`ENGINE_OFF_GATE=FAIL`** |
| **Actual:** raw telemetry **without** trustworthy shutdown | **`ENGINE_OFF_GATE=PENDING_SIGNAL_OBSERVABILITY`** |

**Not** a proven classifier defect for this event — **signal gap** (no post-park LV; last LV not engine-off).

## 6 — Rest session

| Field | Value |
|-------|-------|
| `REST_SESSION_OPENED` | **NO** |
| `REST_SESSION_GATE` | **PENDING** (no ENGINE_OFF) |

## 7 — First parked post-anchor LV

| Field | Value |
|-------|-------|
| `PARKED_OBSERVATION_FOUND` | **NO** |
| `PARKED_REST_GATE` | **`PENDING_NATURAL_LV`** |

No LV after `18:47:56Z` — expected post-park observations absent.

## 8 — Trip association

**N/A** (no rest session). `RAW_EVIDENCE_TIMESTAMP_MUTATED=NO`.

## 9 — Safety (post-T0, global)

| Field | Value |
|-------|-------|
| `DUPLICATE_SOURCE_MEASUREMENT_ROWS` | **0** |
| `DUPLICATE_EVIDENCE_ROWS` | **0** |
| `MULTIPLE_ACTIVE_SESSION_VEHICLES` | **0** |
| `ACTIVE_SESSION_CONSTRAINT_ERRORS` | **0** |

## 10 — Hard safety

Unchanged: cadence REST_WAKE off; **0** REST_WAKE / REST_STABLE post-T0 on WOB.

## 11 — Targeted verdict

| Gate | Result |
|------|--------|
| `RAW_SHUTDOWN_SIGNAL_GATE` | **PENDING_SIGNAL_OBSERVABILITY** |
| `ENGINE_OFF_GATE` | **PENDING_SIGNAL_OBSERVABILITY** |
| `REST_SESSION_GATE` | **PENDING** |
| `PARKED_REST_GATE` | **PENDING_NATURAL_LV** |
| `TRIP_ASSOCIATION_GATE` | **PENDING** |
| `PROVENANCE_GATE` | **PASS** |
| `MULTI_REPLICA_SAFETY_GATE` | **PASS** |

Artifact log: `/opt/cursor/artifacts/m3_3_b1_2r_wob_forensics.log`

---

## Final machine block

```
M3_3_B1_2R_RESULT=B1_2R_SIGNAL_OBSERVABILITY_NO_TRUSTWORTHY_SHUTDOWN_LV

VEHICLE=WOB L 7503

TRIP_ID=db0039e8-748f-456c-ba4c-2d89854fc851
TRIP_STARTED_AT=2026-09-21T18:39:58.514Z
TRIP_ENDED_AT=2026-09-21T18:47:47.634Z
TRIP_STATUS=COMPLETED

PHYSICAL_SHUTDOWN_CANDIDATE_FOUND=NO
PHYSICAL_SHUTDOWN_PROVIDER_AT=N/A
SHUTDOWN_EVIDENCE_TRUSTWORTHY=NO

GENERALIZED_ENGINE_OFF_TRANSITION_FOUND=NO
ENGINE_OFF_OBSERVATION_ID=
ENGINE_OFF_REJECTION_REASON=CHARGING_CONTAMINATED,ENGINE_STATE_NOT_TRANSITION,NO_ELIGIBLE_LV_AT_SHUTDOWN_POST_PARK

REST_SESSION_OPENED=NO
REST_SESSION_ID=
REST_SESSION_STATUS=
REST_SESSION_ANCHOR_AT=
ANCHOR_OBSERVATION_LINKED_TO_SESSION=N/A
ANCHOR_ACTUAL_REST_AGE_MS=N/A

PARKED_OBSERVATION_FOUND=NO
PARKED_EVIDENCE_CLASS=
ACTUAL_REST_AGE_MS=
NOMINAL_REST_INTERVAL_INDEX=

TRIP_ASSOCIATION_RESULT=N/A
RAW_EVIDENCE_TIMESTAMP_MUTATED=NO

DUPLICATE_SOURCE_MEASUREMENT_ROWS=0
DUPLICATE_EVIDENCE_ROWS=0
MULTIPLE_ACTIVE_SESSION_VEHICLES=0
ACTIVE_SESSION_CONSTRAINT_ERRORS=0

REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false
CADENCE_BASED_REST_WAKE_PROMOTION_OCCURRED=NO
REST_STABLE_PROMOTION_OCCURRED=NO

RAW_SHUTDOWN_SIGNAL_GATE=PENDING_SIGNAL_OBSERVABILITY
ENGINE_OFF_GATE=PENDING_SIGNAL_OBSERVABILITY
REST_SESSION_GATE=PENDING
PARKED_REST_GATE=PENDING_NATURAL_LV
TRIP_ASSOCIATION_GATE=PENDING
PROVENANCE_GATE=PASS
MULTI_REPLICA_SAFETY_GATE=PASS

AUTHORITATIVE_BATTERY_BEHAVIOR_CHANGED=NO
PRODUCTION_CHANGED=NO

M3_3C_ALLOWED=NO
NEXT_ACTION=CONTINUE_NATURAL_SHADOW_OBSERVATION_AWAIT_POST_PARK_LIVE_VOLTAGE
```
