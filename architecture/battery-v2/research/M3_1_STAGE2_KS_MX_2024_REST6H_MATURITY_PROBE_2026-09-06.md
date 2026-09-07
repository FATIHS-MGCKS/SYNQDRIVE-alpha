# M3.1 Stage-2 — KS MX 2024 REST_6H Maturity + Telemetry Availability Probe

**Probe timestamp:** `2026-09-06T22:14:14Z`  
**Prior REST_60M maturity probe:** `2026-09-06T21:53:34Z`  
**Session:** `82324f65-0b09-4312-a26f-6bc893d85fb5`  
**Vehicle:** KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)

## Step 0 — Eligibility gate

| Field | Value |
|-------|-------|
| `CURRENT_UTC` | **`2026-09-06T22:14:14Z`** |
| `REST_6H_DUE_AT` | `2026-09-07T02:00:44Z` |
| Eligible for maturity decision? | **NO** — current UTC is **3h 46m before** due_at |

**REST_6H timing contract (deployed code):**

| Field | Value (UTC) |
|-------|-------------|
| `anchor_at` | `2026-09-06T20:00:44Z` |
| `due_at` | `2026-09-07T02:00:44Z` |
| `quality_window_start` | `2026-09-07T01:30:44Z` (due − 30m) |
| `quality_window_end` | `2026-09-07T03:00:44Z` (due + 30m) |
| `latest_permitted_evaluation_at` | `2026-09-07T03:30:44Z` (window_end + 30m retry grace) |
| `retry_deadline` | `2026-09-07T03:30:44Z` |

**Next meaningful recheck:**

| Milestone | UTC |
|-----------|-----|
| First evaluation attempt (target due) | `2026-09-07T02:00:44Z` |
| Quality window opens | `2026-09-07T01:30:44Z` |
| Full maturity (post retry grace) | **`2026-09-07T03:30:44Z`** |

> **Stop rule applied:** Steps 4–6 REST_6H measurement/E2E verdict deferred until after `latest_permitted_evaluation_at`. Telemetry forensic (Steps 2–3, 7) completed now because REST_60M already demonstrated the signal pattern and fleet corroboration is available.

---

## Step 1 — REST_6H target state @ probe

| Field | Value |
|-------|-------|
| `REST_6H_TARGET_ID` | `battery-rest:a60c0749-…:1788724844000:6h` |
| `TARGET_STATE` | **ENQUEUED** |
| `TARGET_CREATED_AT` | `2026-09-06T20:22:30.057Z` |
| `TARGET_DUE_AT` | `2026-09-07T02:00:44.000Z` |
| `QUALITY_WINDOW_START` | `2026-09-07T01:30:44Z` |
| `QUALITY_WINDOW_END` | `2026-09-07T03:00:44Z` |
| `LATEST_PERMITTED_EVALUATION_AT` | `2026-09-07T03:30:44Z` |
| `ATTEMPT_COUNT` | N/A (not yet due) |
| `LAST_ATTEMPT_AT` | N/A |
| `NEXT_RETRY_AT` | N/A |
| `BULLMQ_JOB_ID` | `battery-v2_87da1831323d5db6657822e7f81f219e8cedd6b5` |
| `BULLMQ_STATE` | delayed (scheduled for due_at) |
| `FAILED_REASON` | N/A |

Session FSM: `lvRestWindowState=RESTING`, `confirmedRestingAt=2026-09-06T20:00:44Z`. Trip detection: **RESTING** since `20:22:29Z`.

---

## Step 2 — Telemetry timeline since trip end

### Usable LIVE_VOLTAGE observations (`2026-09-06T20:00:44Z` → probe)

| observed_at (UTC) | signal | voltage | activity | trip | charging | provider_ts | ingested_at |
|-------------------|--------|---------|----------|------|----------|-------------|-------------|
| `20:00:44` | LIVE_VOLTAGE (`682269b9`) | **12.15V** | speed 0, ignition off | trip-ending | no | `20:00:44` | `20:01:00` |

**No additional LIVE_VOLTAGE rows** with `observed_at > 20:00:44` through probe time.

Pre-anchor driving-era observations (alternator ~14.8V, `19:49–19:58`) exist but are outside post-trip rest analysis window.

### Counts

| Metric | Value |
|--------|-------|
| `LV_OBSERVATIONS_AFTER_TRIP_END` | **1** (inclusive at anchor; **0** strictly after anchor) |
| `LV_OBSERVATIONS_DURING_REST_60M_WINDOW` | **0** `[20:45:44, 21:15:44]` |
| `LV_OBSERVATIONS_BETWEEN_60M_AND_6H` | **0** `(21:15:44, 01:30:44)` |
| `LV_OBSERVATIONS_DURING_REST_6H_WINDOW` | **0** (window not yet open) |
| `LATEST_LV_OBSERVATION_AT` | **`2026-09-06T20:00:44Z`** |
| `TELEMETRY_SILENCE_DURATION` | **~2h 13m** (and growing until provider wake or poll returns new LV) |

`vehicle_latest_states`: `last_seen_at=20:00:44`, `lv_battery_voltage=12.15`, `speed_kmh=0`, `online=false`. Provider raw payload `lastSeen=2026-09-06T20:00:44Z` — DIMO signal frozen at trip end.

---

## Step 3 — Telemetry-sleep behavior

### Pattern (KS MX + fleet corroboration)

| Phase | KS MX 2024 | Fleet (6 DIMO vehicles, post-T0 sessions) |
|-------|------------|-------------------------------------------|
| Trip active | Continuous LV ~60s cadence (14.8V alternator) | HMÜ C 215, KS MS 661: dense LV while driving |
| Trip ends → RESTING | **Single anchor LV @ trip end; then silence** | All post-T0 REST/CANDIDATE sessions: **0 LV in REST_60M quality window** |
| Hours parked | `last_seen_at` frozen; no new LV | HMÜ 6.1h, KS MS 6.4h, KS MX 2.2h, WOB 2.6h silence at probe |

Deployed architecture: snapshot polling continues (`LONG_IDLE` tier ~30min) but **provider returns no new `lowVoltageBatteryCurrentVoltage` timestamps while vehicle sleeps** — not a SynqDrive ingestion skip (trip-end snapshot was persisted normally).

**Classification:** `REST_LV_SIGNAL_BEHAVIOR=**WAKE_ONLY**` (DIMO LV emissions correlate with trip/wake activity; absent during deep sleep)

| Question | Answer |
|----------|--------|
| `CAN_VALID_REST_60M_NORMALLY_BE_OBTAINED_WITHOUT_A_WAKE` | **NO** (current DIMO fleet; 0 post-T0 VALID REST; KS MX + all resting sessions show 0 in-window LV) |
| `CAN_VALID_REST_6H_NORMALLY_BE_OBTAINED_WITHOUT_A_WAKE` | **NO** (same signal; 6h sleep extends silence beyond any quality window unless wake injects LV) |

Post-T0 REST measurements fleet-wide: **0 VALID**, **9 CONTAMINATED** (all policy-expected contamination paths).

---

## Step 4 — REST_6H measurement outcome

**Deferred** — target not yet due. At probe:

```
REST_6H_MEASUREMENT_RESULT=NO_MEASUREMENT_YET
NATURAL_VALID_REST_6H_FOUND=NO
```

REST_60M outcome (completed): `NATURAL_CONTAMINATED` / `CONTAMINATED_BY_WAKE` — telemetry gap in quality window, policy-correct.

---

## Step 5 — E2E chain

Not applicable until REST_6H evaluates. REST_60M contaminated → handoff `POLICY_SKIPPED` @ `21:58:29Z` (expected).

```
NATURAL_ASSESSMENT_CHAIN_FOUND=NO
NATURAL_PUBLICATION_CHAIN_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO
```

---

## Step 6 — Signal availability limitation

| Criterion | Met? |
|-----------|------|
| Session lifecycle correct | YES (RESTING, not invalidated) |
| Target lifecycle correct | YES (REST_6H ENQUEUED; REST_60M COMPLETED per policy) |
| Scheduler/reconciliation correct | YES |
| Vehicle genuinely resting | YES (trip detection RESTING, speed 0, no new trip) |
| No valid observation (LV silent) | YES |

```
REST_SIGNAL_AVAILABILITY_LIMITATION_PROVEN=YES
CURRENT_E2E_GATE_OBSERVABILITY=NOT_OBSERVABLE_WITH_CURRENT_SIGNAL
```

The M3.1 gate *"natural VALID REST → assessment → publication"* requires an in-window LIVE_VOLTAGE candidate. With DIMO **wake-only** LV during sleep, a vehicle that parks cleanly and stays asleep through REST_60M/REST_6H quality windows **cannot** produce VALID REST evidence without a wake event during the window — even though the pipeline, scheduler, and quality policy behave correctly.

**Gate not weakened.** Analysis-only finding for architecture review.

---

## Step 7 — First-post-rest sample cleanliness

Observed ordering for KS MX trip end:

1. Trip ends `20:00:44` → anchor LV **12.15V** (plausible rest, engine off) — **clean**
2. Quality policy excludes this from REST_60M window `[20:45:44, 21:15:44]` by design (window centered on due_at, not anchor)
3. No subsequent LV until wake (none observed)

On hypothetical wake (fleet pattern from HMÜ/KS MS driving bursts):

1. Wake / ignition → alternator LV ~14.8V within seconds
2. Clean rest voltage window before alternator: **not observed** in fleet post-T0 data

```
FIRST_POST_REST_SAMPLE_CAN_BE_CLEAN=UNKNOWN
```

Trip-end anchor sample **is** clean but **policy-ineligible** for REST target quality windows. Wake path likely contaminated before measurable rest interval.

---

## Step 8 — Minimal safety delta (since REST_60M maturity probe)

| Check | Result |
|-------|--------|
| `NEW_FAILURE_CLASSES` | none |
| `NEW_LOGICAL_DUPLICATES` | 0 |
| `IDEMPOTENCY_VIOLATIONS` | 0 |
| `RESERVATION_LEAK` | NO |
| `RECONCILIATION_STORM` | NO |
| `PM2_HEALTH` | PASS (synqdrive + synqdrive-b online) |
| `SCHEDULER_HEALTH` | PASS |
| `SCHEDULER_LEADERS` | 1 (inferred; reconciliation ticks active) |

---

## Step 9 — M3.1 decision

REST_6H maturity **not yet evaluable**. REST_60M + fleet telemetry prove signal limitation.

```
PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY
```

Re-probe REST_6H outcome after **`2026-09-07T03:30:44Z`**.

> **Final maturity (`2026-09-07T03:47:28Z`):** REST_6H **COMPLETED** @ `03:17:34Z` with **NATURAL_CONTAMINATED**; 0 LV in window; Case B signal observability blocker confirmed. See `M3_1_STAGE2_KS_MX_2024_REST6H_FINAL_MATURITY_2026-09-07.md`.

---

## Machine-readable block

```
BATTERY_V2_KS_MX_2024_REST6H_MATURITY_PROBE=COMPLETE
PROBE_ELIGIBILITY=PRE_DUE
CURRENT_UTC=2026-09-06T22:14:14Z
SESSION_ID=82324f65
REST_6H_DUE_AT=2026-09-07T02:00:44Z
NEXT_MEANINGFUL_RECHECK_AT=2026-09-07T03:30:44Z

REST_6H_TARGET_STATE=ENQUEUED
REST_6H_MEASUREMENT_RESULT=NO_MEASUREMENT_YET

LV_OBSERVATIONS_AFTER_TRIP_END=1
LV_OBSERVATIONS_DURING_REST_60M_WINDOW=0
LV_OBSERVATIONS_BETWEEN_60M_AND_6H=0
LV_OBSERVATIONS_DURING_REST_6H_WINDOW=0
LATEST_LV_OBSERVATION_AT=2026-09-06T20:00:44Z
TELEMETRY_SILENCE_DURATION=2h13m

REST_LV_SIGNAL_BEHAVIOR=WAKE_ONLY
CAN_VALID_REST_60M_NORMALLY_BE_OBTAINED_WITHOUT_A_WAKE=NO
CAN_VALID_REST_6H_NORMALLY_BE_OBTAINED_WITHOUT_A_WAKE=NO

NATURAL_VALID_REST_6H_FOUND=NO
NATURAL_ASSESSMENT_CHAIN_FOUND=NO
NATURAL_PUBLICATION_CHAIN_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO

REST_SIGNAL_AVAILABILITY_LIMITATION_PROVEN=YES
CURRENT_E2E_GATE_OBSERVABILITY=NOT_OBSERVABLE_WITH_CURRENT_SIGNAL
FIRST_POST_REST_SAMPLE_CAN_BE_CLEAN=UNKNOWN

NEW_FAILURE_CLASSES=none
NEW_LOGICAL_DUPLICATES=0
IDEMPOTENCY_VIOLATIONS=0
RESERVATION_LEAK=NO
RECONCILIATION_STORM=NO

PM2_HEALTH=PASS
SCHEDULER_HEALTH=PASS

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE
M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY
PRODUCTION_CHANGED=NO
```
