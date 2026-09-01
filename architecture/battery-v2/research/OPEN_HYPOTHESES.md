# Battery V2 — Open Hypotheses

**Epistemic status:** Working hypotheses — not confirmed. Each hypothesis has a machine graph node (`type=hypothesis`).

| ID | Hypothesis | Epistemic status | Notes |
|----|------------|------------------|-------|
| `BAT-V2-HYP-RUNNING-ORPHAN-001` | Orphaned `RUNNING` metadata may need Bull liveness check | HISTORICAL | Phase 3 git: RUNNING never written; applies only if prod DB has unknown-source rows |
| `BAT-V2-HYP-POST-1445-SOAK-001` | #1445 fixes eliminate production REST stall class for natural trips under shadow | UNKNOWN | AWAITING post-change production soak evidence — no qualifying repo evidence found |
| `BAT-V2-HYP-BRIDGE-120S-001` | ±120s bridge fallback may mis-bind when multiple trips cluster | UNKNOWN | UNTESTED |

Add hypotheses with evidence links — do not promote to CONFIRMED without validation. Hypotheses are **not** decisions.
