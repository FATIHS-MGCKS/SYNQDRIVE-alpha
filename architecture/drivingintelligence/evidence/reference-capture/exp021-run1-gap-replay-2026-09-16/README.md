# EXP-021 — Run 1 Targeted Historical Gap Replay Evidence Freeze

**Frozen at:** 2026-09-16  
**Evidence class:** Post-hoc read-only DIMO historical replay diagnostic  
**Separate from:** Primary Run 1 physical evidence freeze

## Authority flags

| Flag | Value |
|------|-------|
| `POST_HOC_DIAGNOSTIC_EVIDENCE` | **YES** |
| `PRIMARY_RUN1_EVIDENCE` | **NO** |
| `RUN1_METRICS_REWRITTEN` | **NO** |
| `CADENCE_SELECTION_AUTHORITY` | **NO** |
| `RUNTIME_SEMANTICS_CHANGED` | **NO** |
| `PRODUCTION_CHANGED` | **NO** |

## Run 1 identity (unchanged primary authority)

| Field | Value |
|-------|-------|
| `SESSION_ID` | `cd33ad31-c46d-4d9c-a9ee-676e7d2acdca` |
| `ORIGINAL_RUNTIME_SHA` | `bd3fd78060034f628892d1b9da9cf6991e65606b` |
| `PRIMARY_FREEZE_SHA256` | `99a1aa5205406071e2b23a96ee731b15a18e13dc0784c00748f212cf353b6d5c` |
| `PLAN` | `candidate_short_ab_90_60` |
| `T0` | `2026-09-15T11:39:01.000Z` |

Primary evidence path: `architecture/drivingintelligence/evidence/reference-capture/EXP_021_KS_MX_2024_PHYSICAL_90_60_2026-09-15.json`

## Diagnostic scope

Read-only replay of five objectively anomalous Run 1 windows using original Run 1 query semantics (`buildBroadReferenceHistoricalSignalsQuery`, `signals(tokenId, from, to, interval: "1s")`, `field(agg: AVG)`), followed by positive-control closure validating the replay mechanism.

**This package does not modify, backfill, or reclassify Run 1 slot outcomes.**

## Run 1 slot outcomes (preserved)

| Phase | Slot success |
|-------|--------------|
| 90s | **7/7** |
| 60s | **9/10** |

The replay does **not** convert 60s to 10/10.

## Gap replay summary

| Metric | Value |
|--------|-------|
| `EXACT_REPLAY_REQUESTS` | 5 |
| `NARROW_GAP_REQUESTS` | 1 |
| `GAP_REPLAY_EXPERIMENT_VALID` | **YES** |
| `PERSISTENT_EMPTY_WINDOW_SUPPORTED` | **YES** |
| `TOTAL_PERSISTENT_EMPTY_WINDOWS` | **5** |
| `TOTAL_OBJECTIVELY_IDENTIFIED_MISSING_BUCKET_TIMESTAMPS` | **0** |
| `TOTAL_STILL_MISSING_BUCKETS` | **NOT_DERIVABLE** |

## Refined gap taxonomy

| gapId | Refined class |
|-------|---------------|
| `GAP-60S-SLOT1-TRANSITION-HF` | `TRANSITION_WINDOW_PERSISTENT_EMPTY` |
| `GAP-SP-60-T0-30S-SETTLEMENT` | `SETTLEMENT_EARLY_AGE_ZERO` |
| `GAP-SP-90-T16-30S-SETTLEMENT` | `SETTLEMENT_EARLY_AGE_ZERO` |
| `GAP-SP-60-T17-30S-SETTLEMENT` | `STRUCTURAL_TERMINAL_TAIL` |
| `GAP-SP-60-T18-30S-SETTLEMENT` | `STRUCTURAL_TERMINAL_TAIL` |

**Distinction:** `PERSISTENT_EMPTY_WINDOW` (replay returns zero for full window) is separate from `OBJECTIVELY_MISSING_BUCKET_TIMESTAMP` (specific bucket holes inside populated windows — not derivable from frozen evidence).

## Positive-control closure

| Control | Original | Replay | Valid |
|---------|----------|--------|-------|
| `PC-HF60-NATIVE-SLOT2` | 10 | 10 | YES |
| `PC-HF90-NATIVE-SLOT4` | 6 | 6 | YES |
| `PC-SETTLE-90-T0-30S` | 60 | 18 | YES |
| `PC-SETTLE-60-T1-30S` | 60 | 6 | YES |

Settlement controls: original count is `rawRowCount`; replay count is speed-bucket count. Non-zero replay confirms mechanism validity.

## Scientific interpretation (diagnostic only)

- Replay mechanism is valid: known-good HF 60s, HF 90s, and settlement windows return historical data at replay time.
- Targeted gap windows remain empty at replay time.
- No evidence of late maturation filling the transition HF gap.
- 60s transition failure remains transition-owned (`TRANSITION_BOUNDARY`, `cadenceIntrinsic=NO`), not demonstrated cadence-intrinsic failure.
- Native 60s PHASE_NATIVE success (8/8 provider requests) remains separate evidence.

| Field | Value |
|-------|-------|
| `TRANSITION_60S_PERSISTENT_EMPTY_SUPPORTED` | **YES** |
| `LATE_MATURATION_HYPOTHESIS` | **WEAKENED** |
| `INTRINSIC_60S_FAILURE_HYPOTHESIS_RESULT` | **WEAKENS_INTRINSIC_60S_FAILURE_HYPOTHESIS** |
| `OVERALL_DIRECTIONAL_SIGNAL` | **LEAN_60** |
| `SUFFICIENT_FOR_CADENCE_RECOMMENDATION` | **NO** |
| `RECOMMENDED_CADENCE_MS` | **NONE** |
| `PRODUCTION_CADENCE_CHANGE_AUTHORIZED` | **NO** |

## Artifact index

| File | Role |
|------|------|
| `gap-registry.json` | Five objective gaps with refined taxonomy |
| `exact-replay-results.json` | Present-day DIMO exact-window replay captures |
| `narrow-gap-results.json` | Transition boundary narrow probe |
| `positive-controls.json` | Positive-control selection + closure authority |
| `comparison.json` | Gap replay comparison + aggregate metrics |
| `human-readable-report.md` | Human-readable summary |
| `SHA256SUMS` | Deterministic artifact hashes |

## Source provenance

Diagnostic execution: read-only VPS probe 2026-09-16. Source temp directory: `/tmp/exp021-gap-replay-20260916T0815Z/`. Original temporary result files were copied without mutation.
