# P2.2.46 — Operator Task Card Row Implementation

**Date:** 2026-08-26
**Baseline:** `664196a6dcdf56f2f2dd0c68867a1222903b1d3b`
**Pre-flight:** PR #1305 (verdict B — split; Task Card rows selected)
**Branch:** `cursor/p2246-operator-task-card-row-i18n-3c10`

## Scope

| Path | Role |
|------|------|
| `frontend/src/operator/tasks/OperatorTaskCard.tsx` | Task card row presentation |
| `frontend/src/operator/tasks/operatorTaskCard.utils.ts` | Card model + action plan (presentation strings removed) |
| `frontend/src/operator/tasks/OperatorTaskCardConnected.tsx` | Thin connected wrapper (no literal changes) |
| `frontend/src/operator/lib/operator-task-card-i18n.ts` | Presentation adapter |
| `frontend/src/i18n/translations/operator.task.card.{en,de}.ts` | +27 EN+DE keys |

## Canonical component

**ONE** production Task Card row: `OperatorTaskCard` mounted via `OperatorTaskCardConnected` from:

- `OperatorTodayTaskFeed` (Today buckets)
- `OperatorTasksView` task list (row only; Tasks tab chrome deferred to P2.2.47)

## Frozen (unchanged)

- Task IDs, React keys, row order, callbacks, routes/sheets
- Priority/category/status machine values, tone/icon, filter/sort semantics
- Due timestamp, overdue predicate, timezone, relative-time math
- Dynamic: task title, description, assignee name, vehicle/customer/booking labels
- P245 Today chrome, P247 Tasks tab chrome (filters/search/header)
- P216–P245 frozen surfaces

## Key reuse

| Concept | Strategy |
|---------|----------|
| Status labels | **SEMANTIC REUSE** `tasks.filter.status.*` via `taskDetailStatusLabel` |
| Primary actions (start/resume/waiting/comment) | **SEMANTIC REUSE** `tasks.detail.actions.*` |
| Timing (due/active-from) | **SEMANTIC REUSE** `tasks.detail.timing.*` + `formatTaskDetailDueCompact` |
| Overdue chip | **EXACT REUSE** `status.overdue` |
| Auto-resolved | **EXACT REUSE** `tasks.detail.summary.autoResolved` |
| Unassigned assignee | **EXACT REUSE** `tasks.display.unassigned` |
| Checklist blocker | **SEMANTIC REUSE** `tasks.detail.validation.blockedByChecklist` |
| Card chrome (aria, assignee prefix, type actions, disabled reasons) | **NEW** `operator.task.card.*` |

## Metrics

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 8667 | **8694** |
| DE | 8667 | **8694** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P246 enforce-clean | — | **0** |
| P245–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | 428 | **435** |
| Shim | 29 | **29** |

## Adapter classification

`operator-task-card-i18n.ts` — **CANONICAL** (A/B/C/D only; no E–N exports).

## Semantics

Presentation-only. Category E = 0. Fixed-locale debt in card scope = 0.

---

*Implementation artifact. Ready for independent re-audit.*
