# LDI-10D Phase 3C.1 — Comparison matrix

**Scope:** Baseline L3 vs video tacho only. All other algorithms require committed POSITION payload coordinates on identical seconds (blocked).

| Algorithm | vs independent tacho (validated) | Diagnostic on trip |
| --- | --- | --- |
| L3_BASELINE_PRODUCTION | MAE 2.303 vs tacho (validated witness) |
| L3_REPLAY_FROM_PINNED_POSITIONS | NOT_ASSESSABLE — no DIMO GPS grid in repo |
| ADAPTIVE_DT_LEG_MEAN | NOT_ASSESSABLE — no DIMO GPS grid in repo |
| MEDIAN_LEG_3S | NOT_ASSESSABLE — no DIMO GPS grid in repo |
| CAUSAL_EMA_LEGS | NOT_ASSESSABLE — no DIMO GPS grid in repo |
| MOTION_GATE_DISPLACEMENT | NOT_ASSESSABLE — no DIMO GPS grid in repo |
| NONCAUSAL_OFFLINE_CENTERED_MEAN | NOT_ASSESSABLE — no DIMO GPS grid in repo |

Non-baseline rows are **diagnostic / not proven accuracy improvements** until GPS replay is unblocked.
