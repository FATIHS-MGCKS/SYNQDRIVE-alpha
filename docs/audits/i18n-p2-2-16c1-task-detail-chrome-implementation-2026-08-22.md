# P2.2.16C.1 — Task Detail Chrome & View-Model Presentation

**Date:** 2026-08-22
**Baseline:** `3d0dc9067efcbcb2f56e17317ddebc4c39dcb0f1` (post-P2.2.16B.2)
**Branch:** `cursor/p2216c1-task-detail-chrome-i18n-3c10`
**Verdict:** Implementation complete — ready for independent re-audit

## Scope (C.1 enforce-clean — 8 paths)

| Path | Role |
|------|------|
| `lib/tasks/taskDetailView.utils.ts` | View-model builder — presentation labels via adapter |
| `lib/tasks/taskDetailChecklist.utils.ts` | Checklist presentation model |
| `lib/tasks/components/TaskDetailBody.tsx` | Shared detail chrome sections |
| `lib/tasks/components/TaskDetailShell.tsx` | Drawer/inline shell chrome |
| `lib/tasks/components/TaskDetailNotesActivitySection.tsx` | Notes/activity chrome |
| `lib/tasks/components/TaskDetailChecklistSection.tsx` | Checklist section chrome |
| `rental/lib/task-detail.utils.ts` | Locale-aware date formatter delegation |
| `operator/components/OperatorTaskSheet.tsx` | Operator sheet shell chrome |

**Adapter (not in enforce-clean boundary):** `lib/tasks/task-detail-presentation-i18n.ts`

**Optional host touch:** `rental/components/tasks/VehicleTaskDetailDrawer.tsx` — meta date rows thread `locale`.

## Deferred to P2.2.16C.2

- Workflow actions, completion/cancel dialogs, assignment mutation flows
- `taskDetailActions.utils.ts`, `taskCompleteForm.utils.ts`, action bar/host components

## Architecture

- Machine values (status, priority, type, source, IDs, timestamps) unchanged
- Presentation: `task-detail-presentation-i18n.ts` (`tdp`, linked-object keys, datetime helpers)
- Reuses `service-task-presentation-i18n` for status/priority/type
- Reuses existing `tasks.detail.*`, `tasks.filter.*`, `tasks.type.*`, `common.close`

## Dictionary

- Baseline: 7773 EN / 7773 DE
- After C.1: 7834 EN / 7834 DE (+61, 100% parity)
- New keys: `tasks.detail.drawerTitle`, `tasks.detail.section.*`, `tasks.detail.linked.*`, `tasks.detail.technical.*`, `tasks.detail.timing.*`, `tasks.detail.notes.*`, `tasks.detail.activity.*`, `tasks.detail.checklist.*`, `tasks.sheet.orgNotLoaded`

## Scanner / debt

- P216C1 enforce-clean: **0** findings (8 paths)
- Global enforce-clean remaining: **2** (baseline `VehiclePickerStep` — unrelated, not fixed in C.1)
- Hidden utils literals in C.1 scope: remediated via presentation adapter

## Tests

- `task-detail-chrome-localization.test.tsx` — EN/DE view-model, body render, locale switch, timeline regression, P216C1 guard
- Updated component/utils tests with `LanguageProvider`
- B.2 timeline locale threading tests unchanged (pass)

## Category E / business semantics

**0** — presentation-only changes; no workflow/API/persistence modifications.
