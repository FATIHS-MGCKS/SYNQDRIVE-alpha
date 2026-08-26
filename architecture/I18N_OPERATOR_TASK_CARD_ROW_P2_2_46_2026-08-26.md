# I18N — Operator Task Card Row (P2.2.46)

**Version:** V4.9.973
**Date:** 2026-08-26
**Baseline:** `664196a6dcdf56f2f2dd0c68867a1222903b1d3b`

## Overview

Localized host-owned Operator Task Card row chrome: open aria-label, object-unavailable copy, assignee prefix/fallback, checklist labels, type-specific secondary actions, and disabled-reason tooltips via `operator-task-card-i18n.ts`.

## Locale flow

`useLanguage().locale` → `operator-task-card-i18n.ts` (`otc`, status/timing/action helpers); reuses `tasks.*`, `status.overdue`, and shared task-detail presentation adapters.

## Machine values (frozen)

- `ApiTask.status`, `priority`, `type`, `isOverdue`, `completionMode`
- `assignedUserId` / `assignedUserName` predicates
- `dueDate` / `activatesAt` comparison and overdue derivation
- Action availability predicates in `operatorTaskCard.utils.ts`
- React keys (`task.id`), row order, callbacks unchanged

## Dynamic (not translated)

Task title, description, assignee name, vehicle plate, booking reference, linked-object labels.

## Excluded

- `OperatorTasksView.tsx` Tasks tab chrome (P2.2.47)
- P245 Today tab chrome
- P216–P245 frozen surfaces

## Guardrails

P2.2.46 enforce-clean exact (4 paths) — 0 findings.

## Tests

`operator-task-card-localization.test.tsx` (6 tests); `OperatorTaskCard.test.tsx` updated for locale provider.

## Semantics

Presentation-only; Category E = 0.
