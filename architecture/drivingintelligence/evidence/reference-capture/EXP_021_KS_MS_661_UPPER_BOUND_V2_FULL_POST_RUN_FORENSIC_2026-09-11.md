# EXP-021 KS MS 661 — UPPER_BOUND_V2 full post-run forensic (2026-09-11)

**CURRENT_RUN_EVIDENCE_FROZEN = YES**

| Field | Value |
|-------|-------|
| Production SHA | `adef555430eee7d53e0b3e90c4154ec5fdcd18ad` |
| Vehicle | KS MS 661 (`c10351f8-b6a2-4258-947f-631aeaa6d359`, token `187361`) |
| RC session | `d633da9d-e32c-461c-8a27-8c0c6bfff209` |
| Calibration series | `6b45b3c9-6601-4a23-aadc-7df8d36344a1` |
| Settlement experiment | `exp-021-d633da9d-37dfdb23` (`c99b7959-1511-4bb9-9f13-12ea75eb2821`) |
| Orchestrator run | `exp021-1789155698492` |
| ORCHESTRATOR_START | `2026-09-11T19:41:38Z` |
| **PHYSICAL_T0** | `2026-09-11T19:42:19.000Z` (first qualifying movement; persisted `2026-09-11T19:44:54.597Z`) |
| **PHYSICAL_END** | `2026-09-11T20:05:08.000Z` (PDI `pdi-1789157108000`, confirmed `2026-09-11T20:07:34.929Z`) |
| **PHYSICAL_DURATION** | **1369 s** (~22.8 min) |
| POST_RUN_SETTLEMENT_MATURE | **YES** (all mandatory +600 schedules terminal: 59 COMPLETED + 3 SKIPPED PDI; 0 PENDING) |

Machine-readable audit: `EXP_021_KS_MS_661_UPPER_BOUND_V2_FULL_POST_RUN_AUDIT_2026-09-11.json`

Prior frozen runs preserved separately (`26a8554c…`, `945edc40…` partial UPPER_BOUND_V2, EXP-019).

---

## 0. Settlement maturation gate

- **372** settlement schedules created (62 nominal windows × 6 ages design; **57** FIXED_INTERVAL probe families materialized for partial run)
- **357** schedules **COMPLETED** with observations; **15** **SKIPPED** (invalidated PDI probe families)
- **0** PENDING / ACTIVE / DELAYED mandatory +600 observations at audit time (`2026-09-11T20:33Z`)
- **POST_RUN_SETTLEMENT_MATURE = YES**

---

## 1. Physical run completeness

| Phase | Start (UTC) | End (UTC) | Wall (s) | Valid movement (orchestrator) | HF requests | Status (summary) | Scientific validity |
|-------|-------------|-----------|----------|--------------------------------|-------------|------------------|---------------------|
| **180s** | 19:42:19 | 19:57:25.857 | 906.9 | **666 s** (orchestrator) / **0 s** (summary ⚠) | **5/5** SUCCESS | DEGRADED_LOW_MOVEMENT | **Valid movement occurred**; summary contradicts orchestrator |
| **120s** | 19:57:25.857 | 20:07:32.719 | 606.9 | **301 s** | **3/5** SUCCESS | DEGRADED_INSUFFICIENT_REQUESTS | Partial — early physical end truncated slots |
| **60s** | 20:07:32.719 | 20:05:08.000 | **−144.7** ⚠ | 0 | **0/5** | DEGRADED_INSUFFICIENT_REQUESTS | **Invalid** — negative wall; terminalization artifact |
| **30s CONTROL** | — | — | — | — | **0/6** | NOT_REACHED | **Invalid** |

| Gate | Result |
|------|--------|
| ALL_FOUR_PHASES_REACHED | **NO** (180, 120, 60 shell only; 30 never entered) |
| ALL_FOUR_PHASES_SEALED | **NO** |
| ALL_FOUR_PHASES_WITH_VALID_MOVEMENT | **NO** (60/30 absent; 180 summary wrongly reports 0 movement) |
| EXP021_RUN_COMPLETENESS (orchestrator) | **PARTIAL** |

**Operator timing:** Driving continued to ~20:15 local report vs canonical PHYSICAL_END 20:05:08 — ~10 min discrepancy vs operator recall; durable PDI authority used.

---

## 2. Deterministic HF request slots

**Slot ledger (`exp021RequestSlots`) not persisted in `completedPhases` or final acquisition state** — forensic slot rows unavailable post-terminalization.

| Metric | Value | Source |
|--------|------:|--------|
| EXPECTED_REQUEST_SLOTS | **21** | Plan |
| ISSUED (providerRequestCount) | **8** | Phase summaries (5+3+0) |
| SUCCESSFUL | **8** | providerSuccessCount |
| ZERO_RESULT | **0** | summaries |
| FAILED | **0** | summaries |
| SKIPPED (never due before early end) | **13** | 21−8 |
| UNSLOTTED_HF_REQUESTS | **0** | No evidence of off-slot requests |
| DUPLICATE_SLOT_EXECUTIONS | **0** | No duplicate evidence |
| SILENTLY_LOST_SLOTS | **0** (unprovable without ledger) | **INSTRUMENTATION_DEFECT** — ledger not frozen |

Per-phase issued: 180=5, 120=3, 60=0, 30=0.

---

## 3. Native temporal evidence

| Phase | Native buckets | P50 Δt | P95 Δt | Max Δt | gaps ≥10s | gaps ≥20s | gaps ≥30s | gaps ≥60s | buckets/min |
|-------|---------------:|-------:|-------:|-------:|----------:|----------:|----------:|----------:|------------:|
| **180s** | 60 | 4000 ms | 25802 ms | **90000 ms** | 21 | 7 | 2 | 2 | 3.97 |
| **120s** | 49 | 3000 ms | 21000 ms | **21000 ms** | 16 | 7 | 0 | 0 | 4.84 |
| **60s** | 0 | — | — | — | 0 | 0 | 0 | 0 | — |
| **30s** | 0 | — | — | — | 0 | 0 | 0 | 0 | — |

**180s largest gaps:** 90 s, 84 s, 25.8 s, then 21 s cluster.

Compare prior partial UPPER_BOUND_V2 (`26a8554c`): 180 max ~39 s, 120 max ~32.6 s — this run's **180s max gap is worse (90 s)** despite full 5/5 HF slots.

Compare EXP-019: no 80–170 s scale gaps in 120s phase here; **180s phase did exhibit 84–90 s native gaps**.

---

## 4. Settlement geometry

| Metric | Value |
|--------|------:|
| EXPECTED_SETTLEMENT_SOURCE_WINDOWS (nominal full plan) | 62 |
| CREATED_SETTLEMENT_SOURCE_WINDOWS | **57** |
| EXPECTED_SETTLEMENT_OBSERVATIONS (nominal max) | 372 |
| CREATED schedules | **372** |
| COMPLETED observations | **357** |
| SKIPPED (PDI-invalidated) | **15** |
| ZERO_RESULT observations | **0** |
| FAILED observations | **0** |
| MISSING (non-terminal) | **0** |

FULL_PHASE_OVERLAPPING_60S_WINDOWS_30S_STEP geometry executed for materialized phases. Partial run → fewer than 62 source-window families.

---

## 5. Gap → settlement assessability

| Metric | Global |
|--------|-------:|
| NATIVE_GAPS_GE_10S_TOTAL | **37** |
| ASSESSABLE_GAPS | **35** |
| NOT_ASSESSABLE_GAPS | **2** |
| **GAP_ASSESSABILITY_PCT** | **94.6%** |
| NATIVE_ABSENT_IDENTITIES_TOTAL | 722 |
| SETTLEMENT_PRESENT_LATER | **0** |
| SETTLEMENT_ABSENT_THROUGH_600 | **550** |
| NOT_ASSESSABLE_IDENTITIES | 172 |

Per phase assessability: 180s **90.5%** (19/21), 120s **100%** (16/16).

**No native gap interior identities recovered by +600** in assessable windows.

---

## 6. Bucket identity & value maturation

| Metric | Value |
|--------|-------|
| BUCKET_STRUCTURE_STABLE_FROM_AGE | **+30** (all successful FIXED_INTERVAL probes) |
| BUCKETS_ADDED_AFTER_30 | 10 probes |
| BUCKETS_ADDED_AFTER_60 | 5 probes |
| BUCKETS_ADDED_AFTER_120+ | 0 |
| VALUE_REVISED_BUCKETS_TOTAL | **51** |
| VALUE_REVISED_AT_60 | 13 |
| VALUE_REVISED_AT_120 | 5 |
| VALUES_STABLE_FROM_AGE | **NOT +30** — revisions through +600 on subset of probes |

Value revisions from `bucketValueSnapshots` / `valueContentHash` — not `responseHash`.

---

## 7. Terminalization

| Surface | State |
|---------|-------|
| RC_FINAL_STATE | **COMPLETED** (`stoppedAt` 20:07:35Z) |
| CALIBRATION_FINAL_STATE | **SERIES_CLOSED** (`terminalFinalizationAt` set; 3 phase summaries) |
| SETTLEMENT_FINAL_STATE | **ACTIVE** (orphaned — not transitioned to terminal) ⚠ |

---

## 8. Defect classification

### CODE_DEFECT
1. **Phase 60 negative wall duration** (−144.7 s) at terminalization — `phaseEndedAt` < `phaseStartedAt` in AUTO_STOP payload.
2. **Phase 180 `validMovementDurationMs=0`** in `completedPhaseSummaries` contradicts orchestrator **666064 ms** at PHASE_TRANSITION.
3. **Settlement experiment remains ACTIVE** after RC session COMPLETED.

### INSTRUMENTATION_DEFECT
1. **`exp021RequestSlots` ledger not persisted** to `completedPhases` — post-run per-slot forensic impossible.
2. **`hfQueryProvenanceRing` truncated** (15 records) — insufficient for full HF request replay.

### OPERATOR_CONDITION
1. **PHYSICAL_RUN_ENDED_EARLY** — 22.8 min vs 33 min nominal plan; 60s/30s phases never scientifically executed.
2. **T0 detection latency** 155.6 s (movement from 19:42:19, confirmation 19:44:54).

### PROVIDER_BEHAVIOR
1. **180s native 90 s gap** — provider emission / connectivity, not poll-slot scheduling.
2. **550 identities absent through +600** — observed absence in settlement windows; not labeled permanent DIMO loss.

### SCIENTIFIC_LIMITATION
1. Cannot compare 60s vs 30s cadence — phases not executed.
2. Cannot answer production cadence question from this run alone.

---

## 9. Comparison vs prior runs

| Run | 180 max gap | 120 max gap | HF slots | Settlement assessability |
|-----|------------|------------|----------|-------------------------|
| EXP-019 | 80–170 s | — | non-deterministic | low |
| Partial UBV2 `26a8554c` | ~39 s | ~32.6 s | degraded scheduling | ~9% (legacy geometry) |
| **This run `d633da9d`** | **90 s** | **21 s** | **8/21 issued** | **94.6%** (overlapping geometry) |

Independent evaluation first: **this run is scientifically incomplete** despite improved settlement assessability instrumentation.

---

## 10. Cadence science (partial)

| Question | Answer |
|----------|--------|
| A. Slower polling reduces native bucket density? | **Inconclusive** — 120s had slightly higher bucket/min (4.84 vs 3.97) with shorter max gap |
| B. Slower polling increases large gaps? | **180s had larger max gap (90s) than 120s (21s)** in this run |
| C. Faster polling improves settled completeness? | **No late recovery observed** at either cadence |
| D. Information unavailable at slower cadence? | **Unknown** — 60/30 not executed |
| E. Differences justify extra request load? | **Cannot conclude** |

**READY_TO_CHOOSE_PRODUCTION_CADENCE = NO**

**EXACTLY_WHAT_REMAINS_UNKNOWN:** 60s and 30s CONTROL phases; full 21-slot execution under complete 33-minute drive; whether 180s 90s gaps are cadence-causal or provider-local.

**CORRECTION_PR_REQUIRED = YES** (evidence frozen; PR not opened per operator instruction)

Proposed correction scope (no merge/deploy):
- Persist `exp021RequestSlots` into sealed phase records
- Fix movement duration persistence mismatch (180s summary)
- Fix phase-60 terminalization wall-clock ordering
- Terminalize settlement experiment on RC COMPLETED

---

## Trip FSM

**TRIP_FSM_SCOPE = EXCLUDED** — no Trip FSM inspection, repair, or evidence authority used.
