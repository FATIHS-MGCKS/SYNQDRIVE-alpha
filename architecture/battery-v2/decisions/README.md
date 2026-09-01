# Battery V2 — Decisions Index

Append-only decision registry. Stable IDs in `graph/nodes.yaml`.

| ID | Title | Status | Merged | Supersedes / Related |
|----|-------|--------|--------|----------------------|
| `BAT-V2-DEC-1383-001` | Observation-independent LV Rest session opening | `VALIDATED` | PR #1383 (2026-08-28) | — |
| `BAT-V2-DEC-1393-001` | ICE opening vs measurement policy split | `VALIDATED` | PR #1393 (2026-08-28) | Refines opening authority pre-#1393 era |
| `BAT-V2-DEC-1445-001` | Stage 1 pipeline defect closure | `VALIDATED` | PR #1445 (2026-08-30) | Builds on #1383, #1393 |

## Validation semantics

- `VALIDATED` = code + focused tests / CI confirm implementation
- `PRODUCTION_VALIDATED` = post-change production evidence proves expected effect (none of the above decisions qualify at bootstrap time)
- Pre-change production observations (`BAT-V2-EVID-PROD-*`) support OBSERVATION/WHY, not post-fix validation

## Decision record format

Each decision node in `graph/nodes.yaml` includes:

- `decision_status`
- `epistemic_status`
- `summary`
- `evidence` references
- `open_questions` / `non_effects` where known

## Supersession rules

When a decision is superseded:

1. Set `decision_status: SUPERSEDED` on old node
2. Add edge `superseded_by` → new `BAT-V2-DEC-*`
3. Keep old node and ledger entry — **do not delete**

No superseded decisions recorded in bootstrap beyond policy refinement notes in #1393.
