# M3.1 Stage-2 — KS MX 2024 REST_6H Final Maturity + Signal Observability Verdict

**Probe timestamp:** `2026-09-07T03:47:28Z`  
**Session:** `82324f65-0b09-4312-a26f-6bc893d85fb5`  
**Vehicle:** KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)  
**Eligibility:** past `latest_permitted_evaluation_at` (`2026-09-07T03:30:44Z`) — **FINAL maturity decision authorized**

---

## Step 1 — Final REST_6H target state

| Field | Value |
|-------|-------|
| `TARGET_ID` | `battery-rest:a60c0749-…:1788724844000:6h` |
| `TARGET_STATE` | **COMPLETED** |
| `TARGET_DUE_AT` | `2026-09-07T02:00:44.000Z` |
| `TARGET_COMPLETED_AT` | **`2026-09-07T03:17:34.741Z`** |
| `ATTEMPT_COUNT` | N/A in metadata |
| `FIRST_ATTEMPT_AT` | N/A (single terminal attempt recorded) |
| `LAST_ATTEMPT_AT` | `2026-09-07T03:17:34.687Z` |
| `BULLMQ_STATE` | completed (`battery-v2_87da1831…`) |
| `FAILED_REASON` | N/A |

Target terminal within contract (completed before retry deadline `03:30:44Z`). No pipeline defect.

---

## Step 2 — Final telemetry timeline

### LV observations (`2026-09-06T20:00:44Z` → completion)

| observed_at | id | voltage | notes |
|-------------|-----|---------|-------|
| `20:00:44` | `682269b9` | 12.15V | Trip-end anchor; VALID LIVE_VOLTAGE; only post-trip LV |

**Zero** additional LIVE_VOLTAGE rows through REST_6H completion.

| Metric | Value |
|--------|-------|
| `LV_OBSERVATIONS_AFTER_TRIP_END` | **1** (inclusive at anchor) |
| `LV_OBSERVATIONS_DURING_REST_60M_WINDOW` | **0** |
| `LV_OBSERVATIONS_BETWEEN_60M_AND_6H` | **0** |
| `LV_OBSERVATIONS_DURING_REST_6H_WINDOW` | **0** `[01:30:44, 03:00:44]` |
| `LATEST_LV_OBSERVATION_AT` | **`2026-09-06T20:00:44Z`** |
| `TOTAL_TELEMETRY_SILENCE_DURATION` | **~7h 17m** (trip end → REST_6H complete); **~7h 47m** at probe |

### Final vehicle state

| Field | Value |
|-------|-------|
| `SESSION_STILL_RESTING` | **YES** (`lvRestWindowState=RESTING`) |
| `WAKE_AFTER_RESTING` | **NO** |
| `NEW_TRIP_STARTED` | **NO** (no trips since anchor) |
| `LATEST_TELEMETRY_AT` | **`2026-09-06T20:00:44Z`** (DIMO `lastSeen` frozen) |

---

## Step 3 — REST_6H measurement

| Field | Value |
|-------|-------|
| `MEASUREMENT_ID` | `559573ed-186b-4234-919c-2791bbdaf9d3` |
| `MEASUREMENT_CREATED_AT` | `2026-09-07T03:17:34.733Z` |
| `MEASUREMENT_OBSERVED_AT` | **`2026-09-06T19:48:41Z`** (pre-anchor) |
| `MEASUREMENT_VALUE` | **14.743V** |
| `MEASUREMENT_QUALITY` | **CONTAMINATED_BY_WAKE** |
| `MEASUREMENT_QUALITY_REASON` | `contaminated_by_wake` / `selectionMethod=historical_provider_observation` |
| `SOURCE_OBSERVATION_ID` | `274bbe23-fd9d-4535-8e8f-4a106100e29f` |

**Why non-VALID:** Zero in-window LIVE_VOLTAGE candidates. After retry grace, policy persisted nearest historical contaminated candidate (pre-trip alternator-era: ignition on, engine running, LV charging, ~14.7V). Assessment handoff **POLICY_SKIPPED** @ `03:22:34Z` (expected).

**Classification:** **`NATURAL_CONTAMINATED`**

---

## Step 4 — E2E chain

Not applicable (no VALID REST).

```
NATURAL_VALID_REST_6H_FOUND=NO
NATURAL_ASSESSMENT_CHAIN_FOUND=NO
NATURAL_PUBLICATION_CHAIN_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO
```

Post-T0 fleet REST: **0 VALID**, 13 CONTAMINATED (6 WAKE, 7 ACTIVE_TRIP).

---

## Step 5 — Signal observability final verdict

Completed natural REST_6H lifecycle + REST_60M + fleet parked gaps confirm:

| Field | Value |
|-------|-------|
| `REST_LV_SIGNAL_BEHAVIOR` | **WAKE_ONLY** |
| `REST_SIGNAL_AVAILABILITY_LIMITATION_PROVEN` | **YES** |
| `CURRENT_E2E_GATE_OBSERVABILITY` | **NOT_OBSERVABLE_WITH_CURRENT_SIGNAL** |

Control plane, scheduler, target lifecycle, evaluation, and quality policy operated correctly. **Not a Battery V2 pipeline defect.**

---

## Step 6 — CONTAMINATED_BY_WAKE semantics

Deployed code (`lv-rest-measurement-quality.ts`):

`CONTAMINATED_BY_WAKE` applies when observation voltage exceeds wake threshold **and** (`ignitionOn` OR `engineRunning` OR `hasActiveTrip`), **or** candidate is in wake-flank set. It classifies **observation quality**, not **session wake events**.

For KS MX REST_60M/REST_6H:

- Vehicle **did not wake** during rest (`WAKE_AFTER_RESTING=NO`)
- Post-grace fallback selected **pre-anchor alternator-era** LIVE_VOLTAGE (`19:48–19:49`, 14.7–14.8V, ignition/engine on)
- Quality label = `CONTAMINATED_BY_WAKE` because **source observation** is wake/alternator contaminated — **not** because rest session experienced a wake

```
CONTAMINATED_BY_WAKE_SEMANTICS=OBSERVATION_CONTAMINATION_NOT_SESSION_WAKE
QUALITY_REASON_NAME_ACCURATE=NO
```

**Design/observability debt:** enum name and German label (*Ruhemessung durch Aufwachen kontaminiert*) imply session wake; post-grace historical fallback on pre-rest driving observations is semantically misleading in ops forensics.

---

## Step 7 — M3.1 decision (Case B)

No natural VALID REST on completed KS MX lifecycle. Pipeline invariants pass. Blocker is DIMO wake-only LV during sleep.

```
PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY
NEXT_ACTION=BATTERY_V2_SIGNAL_OBSERVABILITY_ARCHITECTURE_REVIEW
```

Do **not** claim `PRODUCTION_VALIDATED=YES`. Do **not** recommend arbitrary future trip/time waits.

---

## Step 8 — Safety delta

| Check | Result |
|-------|--------|
| `NEW_FAILURE_CLASSES` | none |
| `NEW_LOGICAL_DUPLICATES` | 0 |
| `IDEMPOTENCY_VIOLATIONS` | 0 |
| `RESERVATION_LEAK` | NO |
| `RECONCILIATION_STORM` | NO |
| `PM2_HEALTH` | PASS |
| `SCHEDULER_HEALTH` | PASS |
| `SCHEDULER_LEADERS` | 1 (inferred) |

---

## Machine-readable block

```
BATTERY_V2_KS_MX_2024_REST6H_FINAL=COMPLETE
SESSION_ID=82324f65
PROBE_UTC=2026-09-07T03:47:28Z

REST_6H_TARGET_STATE=COMPLETED
REST_6H_TARGET_COMPLETED_AT=2026-09-07T03:17:34.741Z
REST_6H_MEASUREMENT_RESULT=NATURAL_CONTAMINATED

LV_OBSERVATIONS_AFTER_TRIP_END=1
LV_OBSERVATIONS_DURING_REST_60M_WINDOW=0
LV_OBSERVATIONS_BETWEEN_60M_AND_6H=0
LV_OBSERVATIONS_DURING_REST_6H_WINDOW=0
LATEST_LV_OBSERVATION_AT=2026-09-06T20:00:44Z
TOTAL_TELEMETRY_SILENCE_DURATION=7h17m

SESSION_STILL_RESTING=YES
WAKE_AFTER_RESTING=NO
NEW_TRIP_STARTED=NO

REST_LV_SIGNAL_BEHAVIOR=WAKE_ONLY
REST_SIGNAL_AVAILABILITY_LIMITATION_PROVEN=YES
CURRENT_E2E_GATE_OBSERVABILITY=NOT_OBSERVABLE_WITH_CURRENT_SIGNAL

CONTAMINATED_BY_WAKE_SEMANTICS=OBSERVATION_CONTAMINATION_NOT_SESSION_WAKE
QUALITY_REASON_NAME_ACCURATE=NO

NATURAL_VALID_REST_6H_FOUND=NO
NATURAL_ASSESSMENT_CHAIN_FOUND=NO
NATURAL_PUBLICATION_CHAIN_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO

NEW_FAILURE_CLASSES=none
NEW_LOGICAL_DUPLICATES=0
IDEMPOTENCY_VIOLATIONS=0
RESERVATION_LEAK=NO
RECONCILIATION_STORM=NO

PM2_HEALTH=PASS
SCHEDULER_HEALTH=PASS
SCHEDULER_LEADERS=1

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY
NEXT_ACTION=BATTERY_V2_SIGNAL_OBSERVABILITY_ARCHITECTURE_REVIEW

PRODUCTION_CHANGED=NO
```
