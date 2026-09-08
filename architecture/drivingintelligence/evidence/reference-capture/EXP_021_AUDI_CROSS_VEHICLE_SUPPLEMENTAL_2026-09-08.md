# EXP-021 — Audi Cross-Vehicle Supplemental Run (Pre-Drive Re-Arm)

**Date:** 2026-09-08 (evening UTC)  
**Type:** Cross-vehicle supplemental settlement-shadow + cadence evidence  
**Status:** **PRE-ARMED — NOT DRIVING** (telemetry stale; awaiting operator wake + `START EXP-021 NOW`)

---

## Scientific classification

```
EXP021_CROSS_VEHICLE_SUPPLEMENTAL = YES
VEHICLE = KS MS 661 (Audi A4 2016)
VEHICLE_CONFOUND_PRESENT = YES
```

| Run | Vehicle | Cadence order | Role |
|-----|---------|---------------|------|
| EXP-019 | KS MX 2024 | 10s → 20s → 30s → 60s | Same-vehicle counterbalance baseline |
| **EXP-021 (tonight)** | **KS MS 661** | **60s → 30s → 20s → 10s** | **Cross-vehicle supplemental** |

This run **must not** be treated as a clean same-vehicle counterbalance against EXP-019.

**May inform:** provider settlement/maturation, cadence feasibility, cross-vehicle reproducibility, OEM sparsity, 1s bucket availability, whole-trip shadow behavior.

**Must not alone establish:** cadence winner vs EXP-019, order effect independent of vehicle, same-vehicle counterbalance conclusion.

---

## 1 — Production / deploy gate

| Field | Value |
|-------|-------|
| `CURRENT_MAIN_SHA` | `73eac501447cab9bffd09e65a0c27951ceaa2f0c` |
| `PRODUCTION_SHA` | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| `PR_1570_INCLUDED` | **YES** (`7b9a78571` ancestor of production) |
| `PRODUCTION_REPLICAS_HEALTHY` | **YES** (3001 + 3002 ok) |
| `DATABASE_HEALTHY` | **YES** |
| `REDIS_HEALTHY` | **YES** |
| `BULLMQ_HEALTHY` | **YES** |
| `REFERENCE_CAPTURE_ENABLED_EFFECTIVE` | **true** |
| `REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED_EFFECTIVE` | **true** |

Hardened settlement-shadow code verified on production (`buildProspectiveProbeBForPhase`, `syncProspectiveProbesForActivePhase`).

---

## 2 — Vehicle resolution (production authority)

| Field | Value |
|-------|-------|
| `PLATE` | KS MS 661 |
| `MAKE` | Audi |
| `MODEL` | A4 |
| `YEAR` | 2016 |
| `ORGANIZATION_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `VEHICLE_ID` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `TOKEN_ID` | **187361** |
| `DIMO_VEHICLE_ID` | `b41a6acf-d693-47cd-b5ce-07c55bbdd526` (externalId `187361`) |
| `DIMO_INTEGRATION_STATUS` | **CONNECTED** |
| `VEHICLE_ID_RESOLVED` | **YES** |
| `TOKEN_ID_RESOLVED` | **YES** |
| `DIMO_INTEGRATION_CONNECTED` | **YES** |
| `PLATE_MATCH` | **YES** |

---

## 3 — KS MX 2024 session handling

Morning unstarted KS MX session **not reused**:

| Field | Value |
|-------|-------|
| Session ID | `fb553442-df76-4f57-92ae-fdbfc8f6760f` |
| Vehicle | KS MX 2024 (`a60c0749-…`) |
| Status | **READY** (unstarted) |
| `KS_MX_OLD_SESSION_STARTED` | **NO** |
| `KS_MX_OLD_SESSION_HANDLING` | **LEFT_READY_UNSTARTED** — per-vehicle blocking policy; no conflict with Audi |

---

## 4 — Fresh-trip gate (Audi)

| Field | Value |
|-------|-------|
| `AUDI_ACTIVE_TRIP_ID` | **NONE** |
| `AUDI_PREVIOUS_TRIP_COMPLETED` | **YES** (`46e52788-…`, `tripStatus=COMPLETED`, end `2026-09-08T09:21:04.720Z`) |
| `AUDI_TRIP_FSM_RESTING` | **YES** (`VehicleTripDetectionState.state=RESTING`, `activeTripId=null`) |
| `AUDI_FRESH_TRIP_BOUNDARY_READY` | **YES** |

---

## 5 — Live DIMO telemetry (blocking)

Qualified at `2026-09-08T19:08:05Z` via live DIMO `signalsLatest` (not DB `online` flag):

| Field | Value |
|-------|-------|
| `WALL_CLOCK_NOW_UTC` | `2026-09-08T19:08:05.447Z` |
| `LATEST_PROVIDER_TIMESTAMP` | `2026-09-08T09:20:24Z` |
| `LATEST_INGEST_TIMESTAMP` | `2026-09-08T19:08:07.555Z` |
| `TELEMETRY_PROVIDER_AGE_SECONDS` | **35264** (~9.8 h) |
| `TELEMETRY_INGEST_AGE_SECONDS` | 0 |
| `LIVE_TELEMETRY_READY` | **NO** |
| `VEHICLE_WAKE_REQUIRED` | **YES** |

Vehicle appears asleep/parked since ~09:20 UTC. Operator must start/wake Audi and re-qualify before `START EXP-021 NOW`.

---

## 6 — Vehicle-specific signal preflight (Audi)

Preflight at PRE-ARM (`2026-09-08T19:13:17Z`): **30** broad observation fields, `ICE_GASOLINE`, manifest `1.1.0`.

| Signal | Canonical | Available (DIMO) | Historical | Notes |
|--------|-----------|------------------|------------|-------|
| speed | CAN_VEHICLE_SPEED | **YES** | YES | `OBSERVED_NON_NULL` at preflight |
| RPM | CAN_ENGINE_RPM | **YES** | YES | `powertrainCombustionEngineSpeed` |
| TPS | CAN_ENGINE_TPS | **YES** | YES | `powertrainCombustionEngineTPS` |
| engine load | CAN_ENGINE_LOAD | **YES** | YES | `obdEngineLoad` |
| throttle | CAN_ENGINE_THROTTLE_POSITION | **YES** | YES | `obdThrottlePosition` |
| gear | — | **NO** | NO | Not in Audi `availableSignals` |
| longitudinal accel | — | **NO** | NO | Not in manifest/Audi surface |

EV-specific signals (traction battery, tire pressure) correctly **NO** on ICE Audi.

---

## 7 — Clean state

| Field | Value |
|-------|-------|
| `ACTIVE_RECORDING_RC_SESSIONS` | **0** |
| `ACTIVE_CALIBRATION_SERIES` | **0** |
| `ACTIVE_SETTLEMENT_EXPERIMENTS` | **0** |
| `SETTLEMENT_QUEUE_WAITING` | 0 |
| `SETTLEMENT_QUEUE_ACTIVE` | 0 |
| `SETTLEMENT_QUEUE_DELAYED` | 0 |

Two READY sessions exist (KS MX + Audi) — both unstarted, different vehicles.

---

## 8 — Audi Reference Capture session

| Field | Value |
|-------|-------|
| `SESSION_ID` | `619284b3-5ef8-4635-ae31-56475694f655` |
| `SESSION_VEHICLE_ID` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `SESSION_TOKEN_ID` | **187361** |
| `SESSION_STATUS` | **READY** |
| `PREARM_READY` | **YES** |
| `startRecording` called | **NO** |

---

## 9 — Settlement integrity (deployed hardened runtime)

| Gate | Value |
|------|-------|
| `SETTLEMENT_TIMING_INTEGRITY_PASS` | **YES** |
| `WHOLE_TRIP_SHADOW_END_RACE_SAFE` | **YES** |
| `ALL_8_FIXED_PROBES_DEFINED` | **YES** |
| `ALL_48_FIXED_OBSERVATIONS_SCHEDULABLE` | **YES** |

Cadence tonight: **60 → 30 → 20 → 10**  
Settlement ages: **+30/+60/+120/+180/+300/+600** s

---

## 10 — Human go gate

```
EXP021_AUDI_PREFLIGHT_PASS = NO
READY_TO_DRIVE = NO
```

**Blocker:** `LIVE_TELEMETRY_READY = NO` (`VEHICLE_WAKE_REQUIRED = YES`)

**Before `START EXP-021 NOW`:** re-qualify live DIMO telemetry (<600s provider age), confirm Trip FSM still RESTING, confirm session READY.

---

## Policy unchanged

```
PRODUCTION_HF_PATH_CHANGED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_CHANGED = NO
TRIP_FSM_CHANGED = NO
```
