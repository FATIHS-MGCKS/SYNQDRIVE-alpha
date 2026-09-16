# EXP-021 Run 1 — Targeted Historical Gap Replay + Positive-Control Closure

**Evidence freeze date:** 2026-09-16  
**Mode:** Read-only post-hoc diagnostic  
**Primary Run 1 evidence:** Unchanged

## Part 1 — Gap replay probe

Five objective gaps from Run 1 were replayed with original query semantics (runtime SHA `bd3fd780`).

| gapId | cadence | window | orig | replay | refined class | recoverability |
|-------|---------|--------|------|--------|---------------|----------------|
| GAP-60S-SLOT1-TRANSITION-HF | 60s | 11:49:04.650Z → 11:50:08.945Z | 0 | 0 | TRANSITION_WINDOW_PERSISTENT_EMPTY | NOT_DEMONSTRATED |
| GAP-SP-60-T0-30S-SETTLEMENT | 60s | 11:49:12Z → 11:50:12Z | 0 | 0 | SETTLEMENT_EARLY_AGE_ZERO | LATER_IN_RUN_DATA_OBSERVED |
| GAP-SP-90-T16-30S-SETTLEMENT | 90s | 11:47:01Z → 11:48:01Z | 0 | 0 | SETTLEMENT_EARLY_AGE_ZERO | LATER_IN_RUN_DATA_OBSERVED |
| GAP-SP-60-T17-30S-SETTLEMENT | 60s | 11:57:42Z → 11:58:42Z | 0 | 0 | STRUCTURAL_TERMINAL_TAIL | NOT_APPLICABLE_STRUCTURAL |
| GAP-SP-60-T18-30S-SETTLEMENT | 60s | 11:58:12Z → 11:59:12Z | 0 | 0 | STRUCTURAL_TERMINAL_TAIL | NOT_APPLICABLE_STRUCTURAL |

Narrow transition boundary probe (11:49:12.428Z–11:49:13.428Z): 0 buckets.

### Refined aggregate counts

| Metric | Value |
|--------|-------|
| `TOTAL_DIAGNOSTIC_ZERO_WINDOWS` | 5 |
| `TRANSITION_HF_PERSISTENT_EMPTY_WINDOWS` | 1 |
| `SETTLEMENT_EARLY_AGE_ZERO_WINDOWS` | 2 |
| `STRUCTURAL_TERMINAL_TAIL_WINDOWS` | 2 |

Do not count structural terminal-tail windows as recoverable missing-data gaps. Do not call settlement early-age zeros "persistent empty" — the same query windows succeeded at later ages during Run 1.

## Part 2 — Settlement maturation (from primary Run 1 authority)

| Probe | Zero at 30s | First non-zero age | Success ages (ms) |
|-------|-------------|-------------------|-------------------|
| SP-60-T0 | YES (rawRowCount=0) | 60000 | 60000, 120000, 180000, 300000, 600000 |
| SP-90-T16 | YES (rawRowCount=0) | 60000 | 60000, 120000, 180000, 300000, 600000 |

`SETTLEMENT_EARLY_AGE_MATURATION_OBSERVED=YES` — descriptive only; does not generalize.

## Part 3 — Positive-control closure

### HF controls (count-comparable)

| Control | Type | Original | Replay | Result |
|---------|------|----------|--------|--------|
| PC-HF60-NATIVE-SLOT2 | HF PHASE_NATIVE 60s | 10 | 10 | REPRODUCED |
| PC-HF90-NATIVE-SLOT4 | HF PHASE_NATIVE 90s | 6 | 6 | REPRODUCED |

### Settlement controls (query-path availability only)

| Control | Type | Original (rawRowCount) | Replay (speed buckets) | Result |
|---------|------|------------------------|------------------------|--------|
| PC-SETTLE-90-T0-30S | Settlement 90s @ 30s age | 60 | 18 | NONZERO_QUERY_PATH_VALIDATED |
| PC-SETTLE-60-T1-30S | Settlement 60s @ 30s age | 60 | 6 | NONZERO_QUERY_PATH_VALIDATED |

`SETTLEMENT_CONTROL_COUNT_COMPARABLE=NO` — counts are different metrics.

`GAP_REPLAY_EXPERIMENT_VALID=YES` — controls validate mechanism; gaps remain zero at replay.

## Part 4 — Interpretation

- Run 1 remains 90s=7/7, 60s=9/10. Not rewritten.
- Transition HF gap: `TRANSITION_HF_PERSISTENT_EMPTY_SUPPORTED=YES`; `TRANSITION_HF_LATE_MATURATION_HYPOTHESIS=WEAKENED`.
- Settlement early-age zeros: `EARLY_AGE_ZERO_WITH_LATER_IN_RUN_SUCCESS`; maturation observed at 60s+ ages during Run 1.
- Terminal-tail zeros: structural session geometry, not missing buckets.
- Intrinsic 60s inference from combined evidence (transition ownership, native 60s 8/8, HF60 control 10/10); replay-zero alone does not establish causality.
- `TOTAL_STILL_MISSING_BUCKETS=NOT_DERIVABLE` — no per-bucket timestamp holes identified in authority.
