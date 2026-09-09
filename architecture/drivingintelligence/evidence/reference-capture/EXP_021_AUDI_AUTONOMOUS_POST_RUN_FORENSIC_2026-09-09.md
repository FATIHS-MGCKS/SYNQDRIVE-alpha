# EXP-021 — Audi KS MS 661 Autonomous Post-Run Forensic Closeout

**Date:** 2026-09-09 (post +600s settlement maturation window)  
**Vehicle:** KS MS 661 · Audi A4 2016 · token **187361** · `c10351f8-b6a2-4258-947f-631aeaa6d359`  
**Session:** `0aa0dd4f-6436-43d1-ae51-e23eaf947927`  
**R12 production SHA:** `157b3c72226869e4e35d1a9398b78cab50d3fa54` (PR #1592)  
**Orchestrator log:** `/opt/synqdrive/shared/reference-evidence/exp-021-autonomous-orchestrator.jsonl`  
**Status:** **DEGRADED** — settlement-shadow experiment **not executed**; cadence phases **not activated**

> No new Reference Capture session started. No Trip FSM / VehicleTrip manual mutation. No observations fabricated. PR #1582 updated; PR #1592 deploy evidence kept separate.

---

## Scientific classification

```
EXP021_CROSS_VEHICLE_SUPPLEMENTAL = YES
VEHICLE_CONFOUND_PRESENT = YES
AUTONOMOUS_ORCHESTRATOR_EXECUTED = YES (partial)
SETTLEMENT_SHADOW_EXPERIMENT_EXECUTED = NO
CADENCE_PHASE_EXPERIMENT_EXECUTED = NO
```

---

## 1 — Autonomous orchestrator log

### Canonical timestamps (second orchestrator instance — authoritative)

| Field | UTC timestamp |
|-------|---------------|
| `ORCHESTRATOR_STARTED_AT` | `2026-09-09T19:35:18.717Z` |
| `DEPLOY_CONVERGED_AT` | `2026-09-09T19:35:21.157Z` |
| `RC_SESSION_CREATED_AT` | `2026-09-09T19:35:22.644Z` |
| `NEW_SESSION_READY` | `2026-09-09T19:35:23.415Z` |
| `START_RECORDING_AT` | `2026-09-09T19:37:14.296Z` (`session.startedAt`) |
| `AUTO_START_RECORDING_CALLED` | `2026-09-09T19:37:16.336Z` |
| `PHYSICAL_DRIVE_DETECTED_AT` | **not logged by orchestrator** — RC speed authority: `2026-09-09T19:42:04.339Z` (first speed >5 km/h) |
| `PHASE_60_EFFECTIVE_AT` | **null** — phase activation never succeeded |
| `PHASE_30_EFFECTIVE_AT` | **null** |
| `PHASE_20_EFFECTIVE_AT` | **null** |
| `PHASE_10_EFFECTIVE_AT` | **null** |
| `PHYSICAL_DRIVE_END_DETECTED_AT` | **not logged by orchestrator** — RC speed authority: `2026-09-09T19:57:19.396Z` (last speed >5 km/h) |
| `STOP_RECORDING_AT` | **null** |
| `RC_SESSION_COMPLETED_AT` | **null** |

### Orchestrator flags

| Field | Value |
|-------|-------|
| `AUTONOMOUS_ORCHESTRATOR_EXECUTED` | **YES** |
| `AUTO_START_RECORDING_CALLED` | **YES** |
| `PHYSICAL_DRIVE_START_DETECTED` | **NO** (orchestrator did not emit event; RC-derived movement window exists) |
| `AUTO_STOP_RECORDING_CALLED` | **NO** |
| `RC_SESSION_COMPLETED` | **NO** — session still `RECORDING` at forensic closeout |

### Session identifiers

| Field | Value |
|-------|-------|
| `SESSION_ID` | `0aa0dd4f-6436-43d1-ae51-e23eaf947927` |
| `CALIBRATION_SERIES_ID` | **null** (`acquisitionStateJson.hfCalibrationSeries = null`) |

### Fatal events (orchestrator log)

| At (UTC) | Event | Detail |
|----------|-------|--------|
| `19:37:15.921Z` | `ORCHESTRATOR_FATAL` | `competing RECORDING session exists` (race with parallel instance; recording still started) |
| `19:44:08.829Z` | `ORCHESTRATOR_FATAL` | `HF calibration phase activation requires effective V2 policy for selected token` |

**Root cause (cadence/settlement channel):** Production env `HF_RECOVERY_POLICY_V2_ENABLED=false`, `HF_RECOVERY_POLICY_V2_CANARY_ONLY=true`, and `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS` **empty/absent**. Token **187361** (Audi) resolves to **LEGACY** HF policy. `assertHfCalibrationPhaseActivationAllowed` requires effective **V2** — phase 60s activation blocked. Mercedes EXP-019 token **187336** was the prior canary target in tests; Audi was never allowlisted before autonomous run.

---

## 2 — Deploy / run ordering

| Field | Value |
|-------|-------|
| `R12_PRODUCTION_SHA` | `157b3c72226869e4e35d1a9398b78cab50d3fa54` |
| `DEPLOY_FINISHED_BEFORE_RC_START` | **YES** (deploy `19:35:21` < session create `19:35:22`) |
| `BOTH_REPLICAS_CONVERGED_BEFORE_RC_START` | **YES** (replica 3001 + 3002 healthy, same SHA) |

**Movement vs deploy:**

- Intended physical-drive segment (`bd55f98d-…`) start `19:41:56` — **after** deploy convergence ✓
- Pre-existing wake trip (`e62c964d-…`) start `19:09:00` — **before** deploy convergence (separate confound; does not invalidate deploy gate for RC start)

---

## 3 — Pre-existing VehicleTrip confound

| Field | Value |
|-------|-------|
| `PREEXISTING_TRIP_ID` | `e62c964d-c020-4245-a191-67ae2e0fbdf3` |
| `PREEXISTING_TRIP_START` | `2026-09-09T19:09:00.000Z` |
| `PREEXISTING_TRIP_STATUS_AT_RC_START` | **ONGOING** (`ACTIVE_TRIP` in FSM at `19:35:22`) |
| `PREEXISTING_TRIP_END` | `2026-09-09T19:37:07.118Z` (R12 mid-trip gap split) |
| `PREEXISTING_TRIP_OVERLAPS_PHYSICAL_RUN` | **YES** (same evening activity chain; split into `bd55f98d-…` at `19:41:56`) |

### Whole-trip shadow confound assessment

| Question | Answer |
|----------|--------|
| Trip started before Reference Capture? | **YES** (`e62c964d` @ 19:09) |
| Trip started before physical movement (intended segment)? | **YES** (wake segment precedes `bd55f98d`) |
| Trip started before deploy convergence? | **YES** |
| `WHOLE_TRIP_PRE_ROLL_CONFOUND_PRESENT` | **YES** |

**Interpretation:** Whole-trip settlement shadow would bind to a trip boundary contaminated by pre-RC wake/park activity and R12 mid-trip gap split. This confound affects **whole-trip channel only** — it does **not** automatically invalidate fixed 60s settlement probes (which were never scheduled).

---

## 4 — Cadence phase audit

**Expected order:** 60s → 30s → 20s → 10s

| Phase | requestedAt | effectiveAt | endedAt | duration | requestCount | requestRatePerMinute | successfulRequests | zeroResultRequests | errors | uniqueBuckets | speedGapFraction10s | speedGapFraction20s | speedGapFraction60s | maxSpeedGap |
|-------|-------------|-------------|---------|----------|--------------|----------------------|--------------------|--------------------|--------|---------------|---------------------|---------------------|---------------------|-------------|
| 60s | — | — | — | — | — | — | — | — | **blocked** | — | — | — | — | — |
| 30s | — | — | — | — | — | — | — | — | **not reached** | — | — | — | — | — |
| 20s | — | — | — | — | — | — | — | — | **not reached** | — | — | — | — | — |
| 10s | — | — | — | — | — | — | — | — | **not reached** | — | — | — | — | — |

| Field | Value |
|-------|-------|
| `PHASE_60_VALID` | **NO** |
| `PHASE_30_VALID` | **NO** |
| `PHASE_20_VALID` | **NO** |
| `PHASE_10_VALID` | **NO** |
| `ALL_FOUR_PHASES_COMPLETED` | **NO** |

**What ran instead:** Default HF block-polling (LEGACY) — `cycleCount` 571 at closeout, ~10s runner cadence, no `hfCalibrationSeries`.

---

## 5 — Fixed settlement probes

| Field | Value |
|-------|-------|
| `FIXED_PROBES_EXPECTED` | 8 |
| `FIXED_PROBES_FOUND` | **0** |
| `FIXED_OBSERVATIONS_EXPECTED` | 48 |
| `FIXED_OBSERVATIONS_COMPLETED` | **0** |
| Settlement experiment rows | **0** (`reference_capture_settlement_shadow_experiments`) |
| Schedule rows | **0** |
| Shadow observation rows | **0** |

### Per-age validity (A/B probes)

| Age | A probe | B probe |
|-----|---------|---------|
| +30s | **INVALID** | **INVALID** |
| +60s | **INVALID** | **INVALID** |
| +120s | **INVALID** | **INVALID** |
| +180s | **INVALID** | **INVALID** |
| +300s | **INVALID** | **INVALID** |
| +600s | **INVALID** | **INVALID** |

**Reason:** No calibration series → no phase completion → no `syncProspectiveProbesForActivePhase` → no schedules materialized. HF V2 policy blocker prevented phase 60 activation at `19:44:08`. No canonical retry path applies (no valid persisted schedule pending).

---

## 6 — Bucket maturation curves (C30–C600)

**NOT ASSESSABLE** — zero settlement-shadow observations. No `sourceIntervalStart/End` × age matrix exists for Audi.

| Curve | Status |
|-------|--------|
| C30, C60, C120, C180, C300, C600 | **NO DATA** |
| `EARLIEST_AGE_WITH_NO_MEANINGFUL_LATER_GAIN` | **UNKNOWN** |

**Supplemental live-capture note (not settlement-shadow):** Default LEGACY polling produced 649 speed `SIGNAL_POINT` rows during RECORDING. This is **not** equivalent to fixed-age historical settlement probes and must not be used as C(age) maturation evidence.

---

## 7 — Gap evolution (+30 → +600)

**NOT ASSESSABLE** for settlement-age progression — no shadow observations at multiple ages.

### Live RC speed gaps (default polling, movement window ~19:42–19:57 UTC)

| Metric | Value |
|--------|-------|
| Speed observations | 649 |
| Gaps ≥10s | 25 |
| Gaps ≥20s | 11 |
| Gaps ≥60s | 5 |
| Max gap | **125.76s** (`19:39:52` → `19:41:57`) |

**Top persistent-scale gaps during session:**

| From | To | Gap (s) | Classification |
|------|-----|---------|----------------|
| 19:39:52 | 19:41:57 | 125.76 | **C** — persists in live capture (settlement-age untested) |
| 19:54:49 | 19:56:40 | 111.00 | **C** |
| 19:38:04 | 19:39:51 | 107.35 | **C** (pre-movement / stationary) |
| 19:47:22 | 19:49:05 | 103.14 | **C** |
| 19:49:23 | 19:50:54 | 91.48 | **C** |

| Field | Value |
|-------|-------|
| `PERSISTENT_GAPS_AT_600S` | **NOT TESTED** (no +600s shadow queries) |
| `GAPS_THAT_DISAPPEAR_WITH_SETTLEMENT` | **NOT TESTED** |
| Live gaps ≥60s during drive | **5 observed** — supports upstream sparsity **in live channel**; settlement-delay hypothesis **not adjudicated** on Audi |

---

## 8 — Whole-trip shadow

| Field | Value |
|-------|-------|
| `VEHICLE_TRIP_ID` (intended physical segment) | `bd55f98d-2ac6-4fcf-99fa-c92be9593b7c` |
| `VEHICLE_TRIP_START` | `2026-09-09T19:41:56.427Z` |
| `VEHICLE_TRIP_END` | `2026-09-09T19:58:03.674Z` |
| `VEHICLE_TRIP_STATUS` | **ONGOING** (endTime set; FSM `POSSIBLE_END`) |
| `WHOLE_TRIP_EXPECTED` | 6 |
| `WHOLE_TRIP_COMPLETED` | **0** |
| `WHOLE_TRIP_SETTLEMENT_TIMING_VALID` | **NO** (no experiment) |
| `WHOLE_TRIP_PRE_ROLL_CONFOUND_PRESENT` | **YES** |

No whole-trip shadow schedules created. Pre-roll confound from `e62c964d` wake segment and R12 gap split would contaminate binding even if experiment had run.

---

## 9 — Trip FSM R12 natural-run correlation

Audited separately from settlement channels (no mixing).

| Field | Value |
|-------|-------|
| `R12_TRIP_START_DETECTED` | **YES** — `e62c964d` @ `19:09:00` (DIMO segment + ignition wake) |
| `R12_TRIP_START_AT` | `2026-09-09T19:09:00.000Z` |
| `R12_PHYSICAL_END_CANDIDATE_AT` | `2026-09-09T19:57:27.000Z` (provider stationary VLS) |
| `R12_POSSIBLE_END_AT` | `2026-09-09T19:57:27.000Z` |
| `R12_COMPLETED_AT` | **null** — `bd55f98d` still `ONGOING` at closeout |
| `R12_RESTING_AT` | **null** — FSM `POSSIBLE_END`, hard_timeout_fallback checks return RESTING but FSM not terminalized |

### R12 mid-trip gap split (natural behavior)

| Field | Value |
|-------|-------|
| Split parent | `e62c964d-c020-4245-a191-67ae2e0fbdf3` |
| Split child | `bd55f98d-2ac6-4fcf-99fa-c92be9593b7c` |
| Split gap | 289,309 ms (~4.8 min) |
| Split reason | `live_mid_trip_gap_split` |
| Split at | `19:37:07` / child start `19:41:56` |

**Pre-existing trip handling:** R12 kept `e62c964d` ONGOING through RC pre-arm and recording start; completed it via gap-split at `19:37:07` when telemetry gap exceeded threshold; spawned `bd55f98d` for resumed movement at `19:41:56`.

| Field | Value |
|-------|-------|
| `TRIP_FSM_REGULAR_COMPLETION` | **FAIL** — physical segment not terminalized to `COMPLETED`; stuck `POSSIBLE_END` |

Cross-reference: PR #1592 Trip FSM R12 deploy evidence (deploy SHA converged before RC; natural-run behavior observed on this drive).

---

## 10 — Mercedes vs Audi same-hardware comparison

Both vehicles: **DIMO LTE_R1** hardware profile.

| Dimension | EXP-019 Mercedes (KS MX 2024, token 187336) | EXP-021 Audi (KS MS 661, token 187361) |
|-----------|---------------------------------------------|----------------------------------------|
| Settlement shadow maturation | Executed (48 fixed obs design) | **NOT executed** |
| P50 first-observation age | **~27s** (EXP-020 on EXP-019 drive) | **UNKNOWN** (no shadow probes) |
| Live gap density | Material gaps in video GT windows | 25 gaps ≥10s, 5 ≥60s, max 125.76s in live RC |
| HF V2 policy | In canary allowlist (test config 187336) | **Not in canary** — LEGACY only |
| Cadence phases | 10→20→30→60 completed | **None** |
| 1s bucket density | ~2s median physical (RD003 class) | Not measured at settlement authority |

| Field | Value |
|-------|-------|
| `SAME_HARDWARE_CROSS_VEHICLE_PATTERN_REPLICATED` | **PARTIAL** — live gap sparsity consistent with Mercedes experience; settlement maturation curve **not replicated** on Audi due to HF V2 policy blocker |

---

## 11 — Decision readiness

| Question | Result |
|----------|--------|
| `SETTLEMENT_DELAY_HYPOTHESIS` | **INCONCLUSIVE** (Audi) — no prospective shadow ages executed |
| `UPSTREAM_SAMPLING_SPARSITY_HYPOTHESIS` | **WEAKENED as sole cause** on live Audi channel (5 gaps ≥60s persist without settlement test); **INCONCLUSIVE** for settlement-delay vs sparsity split |
| `QUERY_WINDOW_GEOMETRY_AS_PRIMARY_CAUSE` | **REJECTED** (unchanged from EXP-020) |
| `BEST_SUPPORTED_HISTORICAL_QUERY_AGE` | **UNKNOWN** for Audi; Mercedes prior art **~27s P50** (EXP-020, not revalidated cross-vehicle) |
| `ONE_DELAYED_WHOLE_TRIP_QUERY` | **UNKNOWN** |
| `TWO_STAGE_QUERY` (initial + retry) | **UNKNOWN** — insufficient Audi settlement evidence |
| `PRODUCTION_POLICY_CHANGE_AUTHORIZED` | **NO** |

---

## 12 — Run classification (independent channels)

| Channel | Validity | Rationale |
|---------|----------|-----------|
| `RC_CAPTURE_VALIDITY` | **PARTIAL** | Recording started; 5,606 obs; default LEGACY polling; no stop/complete |
| `CADENCE_CHANNEL_VALIDITY` | **INVALID** | HF V2 policy blocker; zero phases |
| `FIXED_SETTLEMENT_CHANNEL_VALIDITY` | **INVALID** | 0/48 observations |
| `WHOLE_TRIP_CHANNEL_VALIDITY` | **INVALID** | 0/6 observations; pre-roll confound |
| `R12_TRIP_FSM_OBSERVATION_VALIDITY` | **PARTIAL** | Natural R12 run observable; gap split + POSSIBLE_END stall |
| `OVERALL_EXP021_AUDI_RESULT` | **DEGRADED** | Physical drive occurred; settlement experiment not executed |

---

## 13 — Operational anomalies (not repaired)

1. Session `0aa0dd4f-…` remains **`RECORDING`** — orchestrator fatal before `stopRecording`; default HF cycles continue polling stale watermark (`hfWatermarkAt` frozen ~19:57:26).
2. No manual session abort performed per mission constraints.
3. Re-run requires: add token **187361** to `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS` (or enable V2 globally for experiment), abort stuck session via canonical recover script, new pre-arm.

---

## Policy unchanged

```
PRODUCTION_HF_PATH_CHANGED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_CHANGED = NO
TRIP_FSM_CHANGED = NO
ATE_CHANGED = NO
PRODUCTION_POLICY_CHANGE_AUTHORIZED = NO
```

---

## Cross-references

- Prior attempts: `EXP_021_AUDI_CROSS_VEHICLE_SUPPLEMENTAL_2026-09-08.md`
- Settlement design: `EXP_021_SETTLEMENT_SHADOW_EXPERIMENT_DESIGN_2026-09-07.md`
- Mercedes baseline: EXP-019 + EXP-020 (`EXP_020_RETROSPECTIVE_WINDOW_POST_TRIP_MATRIX_2026-09-07.md`)
- R12 deploy: PR #1592 (separate evidence)
- Draft PR: #1582
