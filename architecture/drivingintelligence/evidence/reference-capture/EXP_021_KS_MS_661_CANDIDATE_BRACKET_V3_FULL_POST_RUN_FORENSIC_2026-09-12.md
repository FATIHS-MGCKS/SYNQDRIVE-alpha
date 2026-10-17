# EXP-021 KS MS 661 — CANDIDATE_BRACKET_V3 full post-run forensic (2026-09-12)

Production SHA: `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50`

## Executive summary

Today's V3 physical run is **scientifically valuable and must be preserved**, but **cannot support a final 120/90/60 production cadence decision** because 90s and 60s native HF evidence was severely under-sampled by the same durable-plan defect that truncated settlement geometry.

**120s is the only phase with complete native and settlement coverage.** It demonstrates viable 1 Hz native bucket density (~5.6 buckets/min, P50 Δt 5 s) across a full 10-minute wall phase with 5/5 deterministic slots executed.

**90s and 60s bucket deficits are caused by missing request slots (code defect A), not provider sparsity alone.** Slot ledgers were initialized for 5-minute nominal duration (UPPER_BOUND_V2 fallback) instead of V3 10-minute duration.

---

## 1. Run identity

| Field | Value |
|-------|-------|
| RC_SESSION_ID | `6720ad68-f80e-452e-8356-2f11d9fb2205` |
| CALIBRATION_SERIES_ID | `07ad7f7b-b953-4c75-8405-ab099a69dfa4` |
| SETTLEMENT_EXPERIMENT_ID | `exp-021-6720ad68-b25b9f5f` |
| planId | `candidate_bracket_v3` |
| PHYSICAL_T0 | `2026-09-12T04:36:36.000Z` |
| PHYSICAL_END | `2026-09-12T05:06:59.000Z` |

| Flag | Value |
|------|-------|
| ALL_THREE_PHASES_REACHED | YES |
| ALL_THREE_PHASES_SEALED | YES |
| ALL_THREE_PHASES_WITH_REAL_MOVEMENT | YES (>60 s valid movement each) |

---

## 2. Request-slot audit (critical)

Expected V3 slots: 120=5, 90=7, 60=10, total=22.

| Phase | Expected | Persisted | Issued | Success | Failure | Skipped |
|-------|----------|-----------|--------|---------|---------|---------|
| 120s | 5 | 5 | 5 | 5 | 0 | 0 |
| 90s | 7 | **4** | 4 | 4 | 0 | 0 |
| 60s | 10 | **5** | 5 | 4 | 1 | 0 |

| Metric | Value |
|--------|-------|
| TOTAL_ISSUED_SLOTS | 14 |
| TOTAL_SUCCESSFUL_SLOTS | 13 |
| SILENTLY_LOST_SLOTS | **8** (3×90s + 5×60s never created in ledger) |
| UNSLOTTED_HF_REQUESTS | 0 (all provenance attributable to phase) |
| DUPLICATE_SLOT_EXECUTIONS | 0 confirmed (transition-window requests at phase boundaries are separate) |

**Classification: CODE_DEFECT** — `buildInitialPhaseCounters()` calls `resolveNominalPhaseDurationMs(cadenceMs)` without plan, yielding 300 s nominal for 90s/60s.

### Per-slot ledger (120s — complete)

| slot | scheduledAt | issuedAt | status | buckets |
|------|-------------|----------|--------|---------|
| 0 | 04:36:36Z | 04:37:37Z | SUCCESS | 4 |
| 1 | 04:38:36Z | 04:38:40Z | SUCCESS | 13 |
| 2 | 04:40:36Z | 04:40:36Z | SUCCESS | 16 |
| 3 | 04:42:36Z | 04:42:39Z | SUCCESS | 16 |
| 4 | 04:44:36Z | 04:44:40Z | SUCCESS | 8 |

### 90s — only 4 slots exist (slots 0–3)

Slots 0–1 executed as TRANSITION_WINDOW requests (14 + 13 buckets). Slots 2–3 are PHASE_NATIVE (5 + 5 buckets). **No slots 4–6 were ever created** (missing 270s–540s offsets).

### 60s — only 5 slots exist (slots 0–4)

Slot 4 FAILURE (ZERO_RESULT at 05:01:03Z). **Slots 5–9 never created.**

---

## 3. Why 90/60 have few native buckets

| Phase | Native buckets | Root cause |
|-------|----------------|------------|
| 120s | 57 | 5/5 slots, full 10 min PHASE_NATIVE coverage |
| 90s | 10 | **A) missing slots** — 4/7 ledger; only 2 PHASE_NATIVE requests |
| 60s | 5 | **A) missing slots** — 5/10 ledger; only 2 PHASE_NATIVE successes |

Not caused by: duplicate dedup (0 duplicates), persistence defect (evidence durable), or sparse provider yield alone (successful requests returned 5 and 2.5 buckets/request respectively — reasonable when issued).

**LOW_90_60_BUCKET_ROOT_CAUSE = A_FEWER_MISSING_REQUESTS_WRONG_PLAN_SLOT_INITIALIZATION**

---

## 4. Native bucket forensics

### 120s

| Metric | Value |
|--------|-------|
| NATIVE_BUCKET_COUNT | 57 |
| BUCKETS_PER_MIN | 5.58 |
| P50 Δt | 5000 ms |
| P75 Δt | 6000 ms |
| P90 Δt | 20000 ms |
| P95 Δt | 21000 ms |
| P99 Δt | 21102 ms |
| MAX Δt | 21102 ms |
| Gaps ≥10s | 17 |
| Gaps ≥20s | 7 |
| Gaps ≥30s | 0 |
| Longest gap | 21.1 s |
| Temporal continuity proxy | 0.515 |
| Unreconstructable duration | 296.9 s |

Top gap: `04:40:15.749Z → 04:40:36.851Z` (21.1 s) — between HF request boundaries.

### 90s

| Metric | Value |
|--------|-------|
| NATIVE_BUCKET_COUNT | 10 |
| BUCKETS_PER_MIN | 0.98 |
| P50 Δt | 19000 ms |
| P75 Δt | 21000 ms |
| P90 Δt | 66000 ms |
| P95 Δt | 66000 ms |
| P99 Δt | 66000 ms |
| MAX Δt | 66000 ms |
| Gaps ≥10s | 7 |
| Gaps ≥20s | 3 |
| Gaps ≥30s | 1 |
| Longest gap | 66.0 s |
| Temporal continuity proxy | 0.712 |
| Unreconstructable duration | 176.3 s |

Top gap: `04:48:17.398Z → 04:49:23.398Z` (66 s) — **uncovered by settlement** (first half).

### 60s

| Metric | Value |
|--------|-------|
| NATIVE_BUCKET_COUNT | 5 |
| BUCKETS_PER_MIN | 0.49 |
| P50 Δt | 18901 ms |
| P75 Δt | 21000 ms |
| P90 Δt | 21000 ms |
| P95 Δt | 21000 ms |
| P99 Δt | 21000 ms |
| MAX Δt | 21000 ms |
| Gaps ≥10s | 4 |
| Gaps ≥20s | 2 |
| Gaps ≥30s | 0 |
| Longest gap | 21.0 s |
| Temporal continuity proxy | 0.871 |
| Unreconstructable duration | 78.9 s |

---

## 5. Settlement (actual geometry only)

| Phase | Windows | Coverage | Gaps ≥10s | Assessable | Assessability |
|-------|---------|----------|-----------|------------|---------------|
| 120s | 19/19 | 100% | 17 | 17 | 100% |
| 90s | 9/19 | 49.9% | 7 | 6 | 85.7% |
| 60s | 9/19 | 50.0% | 4 | 4 | 100% |

Assessable gaps: all observed **SETTLEMENT_PRESENT_LATER** within existing windows; **ABSENT_THROUGH_600 = 0** for assessable set.

Value maturation: **no identity additions or value revisions** detected on successful FIXED_INTERVAL probes.

ZERO_RESULT (valid provider): SP-60-T5 @+30s; SP-60-T6 @+30/+60/+120s.

---

## 6. Reconstruction quality

Map-matching adapter not wired in read-only analyzer. Trip route artifact: `FILTERED`, 300 source points, 103 filtered, processed `2026-09-12T06:44:07Z`.

| Phase | Continuity proxy | Unreconstructable segments | Duration |
|-------|------------------|---------------------------|----------|
| 120s | 0.515 | 17 | 296.9 s |
| 90s | 0.712 | 7 | 176.3 s |
| 60s | 0.871 | 4 | 78.9 s |

Higher 90/60 continuity scores reflect **sparse sampling** (fewer detected gaps), not superior route reconstruction.

---

## 7. Cadence interpretation

| Question | Answer |
|----------|--------|
| A) Native evidence favors? | **120s** — only phase with complete slot execution and dense native buckets |
| B) Cadence vs execution? | **Execution defect dominates** for 90/60; not a fair cadence test |
| C) 90 improved over 120? | **Cannot conclude** — 90 severely under-requested |
| D) 60 improved over 90? | **Cannot conclude** — both under-requested |
| E) Dominated candidate? | **60s dominated on evidence completeness**; 120s leads on available data |

---

## 8. Trip FSM (secondary)

| Field | Value |
|-------|-------|
| TRIP_ID | `a05fa903-9ea7-4f20-8281-5cf185233c1a` |
| FINAL_STATE | COMPLETED |
| COMPLETED_AT | `2026-09-12T05:11:03.493Z` |
| END_VALIDATION_EXECUTED | not recorded on detection state row |
| TRIP_FSM_1603_PHYSICAL_ACCEPTANCE | **PASS** (trip reached COMPLETED naturally after RC session) |

---

## 9. Correction design (not implemented)

1. Pass durable `plan` to `resolveNominalPhaseDurationMs()` at all call sites (settlement shadow + HF slot init).
2. Persist `planId` / `planVersion` on calibration series and settlement experiment at arm time.
3. Recovery must reconstruct plan from durable state, not `process.env` alone.
4. Do **not** set V3 globally in PM2; do **not** change UPPER_BOUND_V2 default semantics.

**CORRECTION_PR_REQUIRED = YES**

---

## 10. Next experiment

**ANOTHER_PHYSICAL_RUN_NEEDED = YES** (after correction PR)

**Minimum remaining experiment:** corrected-code **90 vs 60 short A/B** (two 10-minute wall phases) — not another full 30-minute three-way drive unless 90/60 remain tied after fix.

**READY_TO_CHOOSE_PRODUCTION_CADENCE = NO**

**TOP_TWO_CANDIDATES:** 120s (provisional leader), 90s vs 60s (unresolved)
