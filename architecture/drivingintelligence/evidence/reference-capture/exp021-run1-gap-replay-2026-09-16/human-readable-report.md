# EXP-021 Run 1 — Targeted Historical Gap Replay + Positive-Control Closure

**Evidence freeze date:** 2026-09-16  
**Mode:** Read-only post-hoc diagnostic  
**Primary Run 1 evidence:** Unchanged

## Part 1 — Gap replay probe

Five objective gaps from Run 1 were replayed with original query semantics (runtime SHA `bd3fd780`).

| gapId | cadence | window | orig | replay | refined class |
|-------|---------|--------|------|--------|---------------|
| GAP-60S-SLOT1-TRANSITION-HF | 60s | 11:49:04.650Z → 11:50:08.945Z | 0 | 0 | TRANSITION_WINDOW_PERSISTENT_EMPTY |
| GAP-SP-60-T0-30S-SETTLEMENT | 60s | 11:49:12Z → 11:50:12Z | 0 | 0 | SETTLEMENT_EARLY_AGE_ZERO |
| GAP-SP-90-T16-30S-SETTLEMENT | 90s | 11:47:01Z → 11:48:01Z | 0 | 0 | SETTLEMENT_EARLY_AGE_ZERO |
| GAP-SP-60-T17-30S-SETTLEMENT | 60s | 11:57:42Z → 11:58:42Z | 0 | 0 | STRUCTURAL_TERMINAL_TAIL |
| GAP-SP-60-T18-30S-SETTLEMENT | 60s | 11:58:12Z → 11:59:12Z | 0 | 0 | STRUCTURAL_TERMINAL_TAIL |

Narrow transition boundary probe (11:49:12.428Z–11:49:13.428Z): 0 buckets.

## Part 2 — Positive-control closure

| Control | Type | Original | Replay | Result |
|---------|------|----------|--------|--------|
| PC-HF60-NATIVE-SLOT2 | HF PHASE_NATIVE 60s | 10 | 10 | REPRODUCED |
| PC-HF90-NATIVE-SLOT4 | HF PHASE_NATIVE 90s | 6 | 6 | REPRODUCED |
| PC-SETTLE-90-T0-30S | Settlement 90s @ 30s age | 60 | 18 | REPRODUCED |
| PC-SETTLE-60-T1-30S | Settlement 60s @ 30s age | 60 | 6 | REPRODUCED |

`GAP_REPLAY_EXPERIMENT_VALID=YES` — controls reproduce; gaps remain empty.

## Part 3 — Interpretation

- Run 1 remains 90s=7/7, 60s=9/10. Not rewritten.
- Transition gap: persistent empty; not cadence-intrinsic.
- Settlement early-age zeros: same windows succeeded at later ages during Run 1.
- Terminal-tail zeros: structural session geometry, not missing buckets.
- `TOTAL_STILL_MISSING_BUCKETS=NOT_DERIVABLE` — no per-bucket timestamp holes identified in authority.
