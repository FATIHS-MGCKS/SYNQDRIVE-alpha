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

## Package hash authority

`EVIDENCE_PACKAGE_SHA256` = SHA256(exact bytes of `SHA256SUMS`)

Verify: `sha256sum -c SHA256SUMS` (all entries must PASS)

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
| `TOTAL_DIAGNOSTIC_ZERO_WINDOWS` | **5** |
| `TRANSITION_HF_PERSISTENT_EMPTY_WINDOWS` | **1** |
| `SETTLEMENT_EARLY_AGE_ZERO_WINDOWS` | **2** |
| `STRUCTURAL_TERMINAL_TAIL_WINDOWS` | **2** |
| `TOTAL_OBJECTIVELY_IDENTIFIED_MISSING_BUCKET_TIMESTAMPS` | **0** |
| `TOTAL_STILL_MISSING_BUCKETS` | **NOT_DERIVABLE** |

**Note:** The five diagnostic zero windows belong to distinct semantic classes. Do not aggregate them as equivalent persistent-empty failures.

## Refined gap taxonomy

| gapId | Refined class | Recoverability |
|-------|---------------|----------------|
| `GAP-60S-SLOT1-TRANSITION-HF` | `TRANSITION_WINDOW_PERSISTENT_EMPTY` | `NOT_DEMONSTRATED` |
| `GAP-SP-60-T0-30S-SETTLEMENT` | `SETTLEMENT_EARLY_AGE_ZERO` | `LATER_IN_RUN_DATA_OBSERVED` |
| `GAP-SP-90-T16-30S-SETTLEMENT` | `SETTLEMENT_EARLY_AGE_ZERO` | `LATER_IN_RUN_DATA_OBSERVED` |
| `GAP-SP-60-T17-30S-SETTLEMENT` | `STRUCTURAL_TERMINAL_TAIL` | `NOT_APPLICABLE_STRUCTURAL` |
| `GAP-SP-60-T18-30S-SETTLEMENT` | `STRUCTURAL_TERMINAL_TAIL` | `NOT_APPLICABLE_STRUCTURAL` |

**Distinctions:**

- `TRANSITION_WINDOW_PERSISTENT_EMPTY` — zero at Run 1 and again at present-day exact replay; not demonstrated recoverable.
- `SETTLEMENT_EARLY_AGE_ZERO` — zero at 30s scheduled age but same query window succeeded at later ages during Run 1 (`EARLY_AGE_ZERO_WITH_LATER_IN_RUN_SUCCESS`); not persistent empty.
- `STRUCTURAL_TERMINAL_TAIL` — session geometry; not a recoverable missing-data gap.
- `OBJECTIVELY_MISSING_BUCKET_TIMESTAMP` — specific bucket holes inside populated windows; not derivable from frozen evidence.

## Settlement maturation evidence

See `settlement-maturation.json` for per-age authority from immutable primary Run 1 evidence.

| Probe | First non-zero age | Success ages (ms) |
|-------|-------------------|-------------------|
| `SP-60-T0` | 60000 | 60000, 120000, 180000, 300000, 600000 |
| `SP-90-T16` | 60000 | 60000, 120000, 180000, 300000, 600000 |

`SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED=YES` — descriptive evidence only; does not generalize timing to all future gaps.

## Positive-control closure

### HF controls (count-comparable)

| Control | Original | Replay | Valid |
|---------|----------|--------|-------|
| `PC-HF60-NATIVE-SLOT2` | 10 | 10 | YES |
| `PC-HF90-NATIVE-SLOT4` | 6 | 6 | YES |

### Settlement controls (query-path availability only)

| Control | Original (rawRowCount) | Replay (speed buckets) | Valid |
|---------|---------------------|------------------------|-------|
| `PC-SETTLE-90-T0-30S` | 60 | 18 | YES |
| `PC-SETTLE-60-T1-30S` | 60 | 6 | YES |

`SETTLEMENT_QUERY_PATH_POSITIVE_CONTROL_VALID=YES`  
`SETTLEMENT_CONTROL_COUNT_COMPARABLE=NO` — original and replay counts are different metrics; non-zero replay confirms query-path availability, not quantitative reproduction.

## Scientific interpretation (diagnostic only)

### Maturation hypothesis (split by class)

| Class | Authority |
|-------|-----------|
| HF transition window | `TRANSITION_HF_LATE_MATURATION_HYPOTHESIS=WEAKENED` — original zero, exact replay zero, 1s narrow replay zero; HF60/HF90 controls reproduce |
| Settlement early-age windows | `SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED=YES` — same query windows zero at 30s, non-zero at later ages during Run 1 |

Do not combine these into one global maturation verdict.

### Persistent empty scope

`TRANSITION_HF_PERSISTENT_EMPTY_SUPPORTED=YES` — transition HF window only.

Settlement early-age windows: `EARLY_AGE_ZERO_WITH_LATER_IN_RUN_SUCCESS`, not persistent empty.

### Intrinsic 60s inference (combined evidence)

`INTRINSIC_60S_FAILURE_HYPOTHESIS_RESULT=WEAKENS_INTRINSIC_60S_FAILURE_HYPOTHESIS`

Inference from combined evidence, not replay-zero alone:

- Failed request window classified `TRANSITION_WINDOW`
- Gap owner `TRANSITION_BOUNDARY`; `cadenceIntrinsic=false`
- Native 60s `PHASE_NATIVE` provider requests succeeded 8/8
- HF60 positive-control replay succeeds 10/10
- Transition exact replay remains zero
- Transition narrow replay remains zero

| Field | Value |
|-------|-------|
| `OVERALL_DIRECTIONAL_SIGNAL` | **LEAN_60** |
| `SUFFICIENT_FOR_CADENCE_RECOMMENDATION` | **NO** |
| `RECOMMENDED_CADENCE_MS` | **NONE** |
| `PRODUCTION_CADENCE_CHANGE_AUTHORIZED` | **NO** |

## Artifact index

| File | Role |
|------|------|
| `gap-registry.json` | Five objective gaps with refined taxonomy and recoverability |
| `exact-replay-results.json` | Present-day DIMO exact-window replay captures |
| `narrow-gap-results.json` | Transition boundary narrow probe |
| `positive-controls.json` | Positive-control selection + closure authority |
| `settlement-maturation.json` | Per-age settlement maturation authority from primary Run 1 |
| `comparison.json` | Gap replay comparison + refined aggregate metrics |
| `human-readable-report.md` | Human-readable summary |
| `SHA256SUMS` | Deterministic artifact hashes |

## Source provenance

Diagnostic execution: read-only VPS probe 2026-09-16. Source temp directory: `/tmp/exp021-gap-replay-20260916T0815Z/`. Original temporary result files were copied without mutation.
