# EXP-021 — KS MS 661 Physical Run Forensic Report (PR #1598 post-deploy)

**Date:** 2026-09-10 (forensic closeout after scheduled +600 maturation)  
**Production SHA:** `2f1b4f53d418448be5e9dc087393fabf46faf4c1` (PR #1598 merge)  
**Vehicle:** KS MS 661 · token **187361** · `c10351f8-b6a2-4258-947f-631aeaa6d359`  
**RC session:** `945edc40-3002-4b87-83f6-a55d8cf66ffb`  
**Settlement experiment:** `exp-021-945edc40-e7850aa0`  
**Orchestrator log:** `/opt/synqdrive/shared/reference-evidence/exp-021-autonomous-orchestrator.jsonl`  
**Classification:** **PARTIAL SUCCESS / DEGRADED** — canonical T0 + 3/4 cadence phases + maturation for scheduled probes; phase **10s not reached**; physical end **PROVISIONAL**; canonical WHOLE_TRIP **not bound**

---

## Epistemic legend

| Label | Meaning |
|-------|---------|
| **CONFIRMED** | Durable production DB and/or orchestrator log evidence |
| **INFERRED** | Derived from multiple confirmed signals |
| **UNKNOWN** | Not evidenced |
| **CONTRADICTED** | Evidence conflicts with expectation |

---

## 1 — Run identity (CONFIRMED)

| Field | Value |
|-------|-------|
| `EXP021_RUN_FOUND` | YES |
| `VEHICLE_PLATE` | KS MS 661 |
| `VEHICLE_ID` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `TOKEN_ID` | 187361 |
| `RC_SESSION_ID` | `945edc40-3002-4b87-83f6-a55d8cf66ffb` |
| `SETTLEMENT_EXPERIMENT_ID` | `exp-021-945edc40-e7850aa0` |
| `CALIBRATION_SERIES_ID` | `c8b9cd3e-3cb9-40c2-a8f2-dd2a6ba26741` |
| Identity re-resolution | Unambiguous; matches pre-drive expected IDs |

---

## 2 — T0 proof (CONFIRMED)

| Field | Value |
|-------|-------|
| `T0_DETECTED` | YES |
| `T0_DURABLY_PERSISTED` | YES |
| `FIRST_QUALIFYING_MOVEMENT_AT` | `2026-09-10T19:41:19.000Z` |
| `T0_PROVIDER_MOVEMENT` | speed 38 km/h; provider timestamp `2026-09-10T19:42:35Z` |
| `T0_SERVER_OBSERVED_AT` | `2026-09-10T19:42:47.319Z` (`PHYSICAL_DRIVE_START_DETECTED`) |
| `T0_START_CONFIRMED_AT` | `2026-09-10T19:42:47.304Z` |
| `CANONICAL_T0` | `2026-09-10T19:41:19.000Z` |
| `SECOND_T0_CREATED` | NO |
| `DUPLICATE_60_FATAL_OCCURRED` | NO |
| `PHYSICAL_PHASE60_REANCHORED_AT_T0` | YES (`EFFECTIVE_AT` = canonical T0) |
| `SEALED_PRE_ROLL_PHASE_ID` | null (no PRE_ROLL calibration phase sealed; recording pre-roll only) |
| `PRE_ROLL_AND_PHYSICAL_T0_DISTINCT` | YES (no pre-T0 settlement schedules; T0 from movement) |

**Notes:** T0 latency 88.3s from first qualifying movement to server confirmation — movement evidence fresh at detection (`SPEED_AGE_MS` 12304). No synthetic earlier T0.

---

## 3 — Physical interval (CONFIRMED / INFERRED)

| Field | Value | Epistemic |
|-------|-------|-----------|
| Recording started | `2026-09-10T19:36:42.026Z` | CONFIRMED |
| Canonical T0 | `2026-09-10T19:41:19.000Z` | CONFIRMED |
| Provisional physical end candidate | `2026-09-10T20:01:15.000Z` (`pdi-1789070475000`) | CONFIRMED |
| `PHYSICAL_DRIVE_END_CONFIRMED` | NO (orchestrator `endCandidateStatus=PROVISIONAL` at closeout) | CONFIRMED |
| `PHYSICAL_DURATION_SECONDS` (T0 → provisional end) | **1196** (~19m 56s) | INFERRED |
| Session status at closeout | `RECORDING` | CONFIRMED |
| Orchestrator survived | YES (still running post-drive) | CONFIRMED |

Early false end candidates at `19:45:18` and `19:46:35` were **INVALIDATED** (`movement_resumed_after_end_candidate`).

---

## 4 — Phase execution (CONFIRMED)

**Order achieved:** `60 → 30 → 20` (phase **10 not reached**)

| Phase | Provenance | Effective | Ended | Wall (s) | Valid movement (s) | Req | Success | Zero | Unique buckets | Median Δt | P90 Δt | Max gap (ms) | Req/min (movement) |
|-------|------------|-----------|-------|----------|-------------------|-----|---------|------|----------------|-----------|--------|--------------|-------------------|
| 60s | PHYSICAL_T0 | 19:41:19 | 19:50:58 | 580 | 314 | 7 | 7 | 0 | 53 | 4000 | 20000 | 22462 | 1.34 |
| 30s | PHYSICAL_TRANSITION | 19:50:58 | 19:57:06 | 368 | 315 | 9 | 9 | 0 | 31 | 7000 | 19000 | 29056 | 1.71 |
| 20s | PHYSICAL_TRANSITION | 19:57:06 | — (never formally ended) | ≥248 | UNKNOWN | 11† | 9† | 0† | 45† | UNKNOWN | UNKNOWN | 18000† | UNKNOWN |

†Phase 20 from `completedPhaseSummaries` (only 60/30 sealed); active phase still 20s at orchestrator closeout with post-park zero-result pollution in live counters.

| Flag | Value |
|------|-------|
| `ALL_FOUR_PHYSICAL_PHASES_COMPLETED` | **NO** |
| `PHASE_60_COMPLETED` | YES |
| `PHASE_30_COMPLETED` | YES |
| `PHASE_20_COMPLETED` | NO (interrupted by drive end / stale telemetry) |
| `PHASE_10_COMPLETED` | NO |

---

## 5 — Settlement FIXED_INTERVAL (CONFIRMED)

| Metric | Value |
|--------|-------|
| `FIXED_SCHEDULES_EXPECTED` (full 4-phase design) | 48 |
| `FIXED_SCHEDULES_SCHEDULED` | 36 (phases 60/30/20 only) |
| `FIXED_OBSERVATIONS_COMPLETED` | 36 |
| `FIXED_OBSERVATIONS_FAILED` | 0 |
| `FIXED_OBSERVATIONS_MISSING` | 12 (phase 10 never activated) |
| `ACTUAL_QUERY_AGE_RECORDED` | YES |
| `SCHEDULE_DRIFT_RECORDED` | YES (typical drift 22–127 ms on executed probes) |
| Zero-result observations | 1 (`SP-20-A` +30s) |

All scheduled FIXED probes through **+600s** for phases 60/30/20 reached `COMPLETED` terminal state before forensic closeout (`pending=0`).

---

## 6 — PDI (CONFIRMED)

**Authoritative candidate:** `pdi-1789070475000` @ boundary `2026-09-10T20:01:15.000Z`

| Age | Actual age (ms) | Drift (ms) | Rows | Status |
|-----|-----------------|------------|------|--------|
| +30s | 30051 | 51 | 1189 | SUCCESS |
| +60s | 60105 | 105 | 1189 | SUCCESS |
| +120s | 120096 | 96 | 1189 | SUCCESS |
| +180s | 180073 | 73 | 1189 | SUCCESS |
| +300s | 300101 | 101 | 1189 | SUCCESS |
| +600s | 600030 | 30 | 1189 | SUCCESS |

| Metric | Value |
|--------|-------|
| `PDI_SCHEDULES_EXPECTED` (single end) | 6 |
| `PDI_OBSERVATIONS_COMPLETED` (authoritative candidate) | 6 |
| Experiment total PDI schedules | 18 (3 candidates × 6 ages) |
| Skipped (invalidated candidates) | 9 |

PDI +600 for authoritative candidate executed `2026-09-10T20:11:15.799Z` — **terminal before report**.

---

## 7 — WHOLE_TRIP (CONFIRMED unavailable)

| Field | Value |
|-------|-------|
| `VEHICLE_TRIP_ID` (drive) | `2bdc6e71-3822-4c9e-bda3-b46c681e6844` |
| `TRIP_START` | `2026-09-10T19:36:00.000Z` |
| `TRIP_END` | `2026-09-10T20:02:05.213Z` |
| `TRIP_STATUS` | **ONGOING** (not COMPLETED) |
| `CANONICAL_WHOLE_TRIP_BOUND` | NO (`vehicleTripId` null on experiment) |
| `WHOLE_TRIP_OBSERVATIONS_EXPECTED` | 6 |
| `WHOLE_TRIP_OBSERVATIONS_COMPLETED` | 0 (canonical) |

**Note:** Prisma `WHOLE_TRIP` probeType rows with `PDI-*` ids are PDI shadow channel rows, not canonical post-trip WHOLE_TRIP binding.

---

## 8 — Trip FSM cross-check (CONFIRMED)

| Boundary | Timestamp | Δ from T0 (s) | Δ from provisional physical end (s) |
|----------|-----------|---------------|-------------------------------------|
| Trip FSM start | 19:36:00 | −319 (before T0) | — |
| Canonical T0 | 19:41:19 | 0 | — |
| Provisional physical end | 20:01:15 | +1196 | 0 |
| Trip FSM endTime (ONGOING) | 20:02:05 | +1246 | +50 |

Trip FSM `POSSIBLE_END` at closeout; RC did not mutate FSM.

---

## 9 — Gap / maturation (INFERRED from summaries + settlement hashes)

**Cadence-phase native gaps (CONFIRMED summaries):**
- 60s: max 22.5s; 30s: max 29.1s; 20s (partial): max 18s in active counters

**Settlement maturation example `SP-60-A`:** bucket row count stable at 60 across +30…+600; response hashes change each age → **VALUE_REVISION / maturation** class, not query failure.

**PDI authoritative candidate:** row count stable 1189 from +30 through +600 → early completeness at first post-end probe.

**Gaps persisting at +600:** UNKNOWN without bucket-level gap ledger export (not in closeout scope); cadence native gaps do not automatically imply settlement gaps.

---

## 10 — EXP-019 / EXP-020 comparison (INFERRED)

| Hypothesis | This run |
|------------|----------|
| Reverse order 60→30→20→10 reduces order confound vs EXP-019 | **Partially testable** — only 60→30→20 achieved |
| Settlement timing vs poll cadence independence | **Supported** — PDI maturation complete with stable row counts independent of 20s poll zeros post-park |
| 20s promising at N=1 | **Not confirmed** — phase 20 not operationally completed |
| No cadence winner | **Still holds** |

Normalized: phase 60 had lowest req/min (~0.72 clean req/min on 7 native requests / 9.7 min movement); phase 30 ~1.47 req/min; phase 20 polluted by post-stop zeros.

---

## 11 — Anomalies / defects

1. **Phase 10 never started** — drive ended during phase 20s (CONFIRMED).
2. **Stale DIMO speed after 20:01:15** — orchestrator `motionState=UNKNOWN`, blocked final end confirmation (CONFIRMED).
3. **Session remains RECORDING** at forensic closeout (CONFIRMED).
4. **Two early PDI candidates invalidated** — expected behavior (CONFIRMED).
5. **No sealed PRE_ROLL calibration phase** — pre-T0 settlement correctly zero (CONFIRMED).

---

## 12 — Scientific validity flags

| Flag | Value |
|------|-------|
| `ORCHESTRATOR_SURVIVED_FULL_PHYSICAL_RUN` | YES |
| `RC_SURVIVED_FULL_PHYSICAL_RUN` | YES (still RECORDING) |
| `UNEXPECTED_FATAL_ERROR` | NO |
| `EXPERIMENT_DEGRADED` | YES (incomplete cadence + provisional end) |
| `EXP021_VALID_FOR_CADENCE_ANALYSIS` | PARTIAL (3/4 phases) |
| `EXP021_VALID_FOR_SETTLEMENT_ANALYSIS` | YES (scheduled probes + PDI +600) |
| `EXP021_VALID_FOR_GAP_ANALYSIS` | PARTIAL |
| `EXPERIMENT_VALID_FOR_FINAL_ANALYSIS` | PARTIAL |

---

## 13 — Production policy (CONFIRMED unchanged)

`PRODUCTION_HF_FLEET_POLICY_CHANGED` = NO  
`PRODUCTION_SCORE_CHANGED` = NO  
`PRODUCTION_DETECTORS_CHANGED` = NO  
`PRODUCTION_TIRE_BRAKE_CHANGED` = NO  
`TRIP_FSM_UNRELATED_BEHAVIOR_CHANGED` = NO

---

## 14 — What EXP-021 proves on this run

**CONFIRMED:**
- PR #1598 T0 durability path works in production physical drive (persist → reanchor phase 60, no duplicate 60→60 fatal).
- Settlement shadow executes with actual query age and drift through +600 for all **scheduled** fixed-interval and authoritative PDI probes.
- False end candidates are invalidated without destroying the run.

**UNKNOWN / needs follow-up:**
- Optimal cadence conclusion (phase 10 missing).
- Canonical WHOLE_TRIP maturation (trip still ONGOING).
- Full gap persistence matrix at bucket level.

**Recommendation:** Treat as **valid settlement-timing + T0 hardening validation**; schedule **completion run** for phase 10s and canonical WHOLE_TRIP after Trip FSM COMPLETED, without changing production HF fleet policy.
