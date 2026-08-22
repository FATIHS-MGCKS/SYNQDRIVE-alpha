# P2.2.16C.2A — Shared Task Workflow Core Localization

**Date:** 2026-08-22
**Baseline:** `2f47b6a01e27afe171c8a5936a76b0762c4e46da` (post-P2.2.16C.1)
**Branch:** `cursor/p2216c2a-task-workflow-core-i18n-3c10`
**Verdict:** Implementation complete — ready for independent re-audit

## Scope (C.2A enforce-clean — 9 paths)

| Path | Role |
|------|------|
| `lib/tasks/taskDetailActions.utils.ts` | Action plan + completion summary view-model |
| `lib/tasks/taskDetailCompletion.utils.ts` | Completion control model (blocker locale threading) |
| `lib/tasks/taskCompleteForm.utils.ts` | Complete form model + validation messages |
| `lib/tasks/taskResolution.utils.ts` | Resolution code options (machine code → label) |
| `lib/tasks/hooks/useTaskDetailActions.ts` | Workflow mutation hook + success/error toasts |
| `lib/tasks/components/TaskDetailActionBar.tsx` | Action bar presentation |
| `lib/tasks/components/TaskDetailActionsHost.tsx` | Host wiring (locale-threaded plan + cancel dialog) |
| `lib/tasks/components/TaskDetailCompleteDialog.tsx` | Completion dialog presentation |
| `lib/tasks/components/TaskDetailCompletionSummary.tsx` | Terminal completion summary presentation |

**Adapter (not in enforce-clean boundary):** `lib/tasks/task-detail-actions-presentation-i18n.ts`

**Deferred to P2.2.16C.2B:** `VehicleTaskDetailDrawer`, `OperatorTaskDetail` host residual copy

## Core actions preserved (machine IDs unchanged)

`start`, `resume`, `moveToWaiting`, `complete`, `comment`, `cancel` — no reopen/delete/archive invented.

## Architecture

- Stable `TaskDetailActionKind` → `TranslationKey` → localized label
- `buildChecklistBlockerLabel(locale, titles)` threaded via `buildTaskCompletionControlModel(detail, locale)` — no implicit German fallback in production path
- Resolution codes: machine `value` unchanged; `taskDetailResolutionCodeLabel(locale, code)` for display
- Validation rules frozen; only message copy localized
- `disabledReason` from API left as provider text (not machine-translated)

## Dictionary

- Baseline: 7834 EN / 7834 DE
- After C.2A: 7894 EN / 7894 DE (+60, 100% parity)
- New namespaces: `tasks.detail.actions.*`, `tasks.detail.completion.*`, `tasks.detail.cancel.*`, `tasks.detail.summary.*`, `tasks.detail.validation.*`, `tasks.detail.toast.*`, `tasks.resolution.code.*`
- Reused: `tasks.detail.checklist.overrideManager`, `common.cancel`

## Scanner / debt

- P216C2A enforce-clean: **0** findings (9 paths)
- P216A / P216B1 / P216B2 / P216C1: **0** (regression verified)
- Global enforce-clean remaining: **2** (baseline `VehiclePickerStep` — unrelated)

## Tests

- `task-detail-actions-localization.test.tsx` — EN/DE action labels, blocker locale, completion dialog, payload freeze, runtime locale switch, action matrix
- Updated utils/component tests with explicit `locale` param
- `hardcoded-copy-guard.test.ts` — P216C2A scope + blind-spot guards

## Category E / business semantics

**0** — presentation-only changes; action IDs, callbacks, payloads, permissions, and workflow state unchanged.
