# P2.2.47 — Operator Tasks Tab Chrome Implementation

**Date:** 2026-08-26
**Baseline:** `579ddcbbf0de2339eea99aab39281aeca26c8a6c`
**Pre-flight:** PR #1310 (verdict A — GO)
**Branch:** `cursor/p2247-operator-tasks-tab-chrome-i18n-3c10`

## Scope

| Path | Role |
|------|------|
| `frontend/src/operator/views/OperatorTasksView.tsx` | Tasks tab host chrome |
| `frontend/src/operator/lib/operator-tasks-tab-i18n.ts` | Presentation adapter |
| `frontend/src/i18n/translations/operator.tasks.tab.{en,de}.ts` | +9 EN+DE keys |

## Runtime path

`OperatorShell` (`activeTab: 'tasks'`) → `OperatorTasksView` → summary/filter chrome → `OperatorTaskCardConnected` (P246 frozen).

## Frozen (unchanged)

- Filter machine IDs (`today`, `overdue`, `vehicle`, `booking`, priority values)
- `filterOperatorTasks` / `sortOperatorTasks` predicates and order
- Task IDs, React keys (`task.id`), callbacks, routes/sheets
- P246 Task Card row internals
- No search UI in this tab

## Key reuse

| Concept | Strategy |
|---------|----------|
| Summary open/today/overdue | **EXACT REUSE** `tasks.filter.status.OPEN`, `common.today`, `status.overdue` |
| Filter chips today/overdue/vehicle/booking | **EXACT/SEMANTIC REUSE** `common.today`, `status.overdue`, `tasks.filter.vehicleLabel`, `tasks.filter.bookingLabel` |
| Priority row | **EXACT REUSE** `tasks.filter.priorityLabel`, `tasks.filter.priority.*` |
| Empty title | **EXACT REUSE** `tasks.empty.open.title` |
| Remove/close/FAB/create | **EXACT REUSE** `common.remove`, `common.close`, `tasks.createTaskButton`, `tasks.newTask` |
| Tab chrome (title, scope, empty desc, placeholder, back) | **NEW** `operator.tasks.tab.*` (9 keys) |

## Metrics (expected)

| Metric | Baseline | Final |
|--------|----------|-------|
| EN | 8694 | **8703** |
| DE | 8694 | **8703** |
| Parity | 100% | **100%** |
| Orphans | 0 | **0** |
| P247 enforce-clean | — | **0** |
| P246–P216 | 0 | **0** |
| Global enforce-clean | 0 | **0** |
| i18n suite | 435 | **436** |
| Shim | 29 | **29** |

## Adapter classification

`operator-tasks-tab-i18n.ts` — **CANONICAL** (A/B/C only; no E–O exports).

## Semantics

Presentation-only. Category E = 0. Fixed-locale debt in Tasks tab chrome scope = 0.

---

*Implementation artifact. Ready for independent re-audit.*
