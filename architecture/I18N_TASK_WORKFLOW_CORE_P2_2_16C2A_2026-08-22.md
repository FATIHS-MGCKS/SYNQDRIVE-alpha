# I18N — Task Workflow Core (P2.2.16C.2A)

## Locale flow

```
useLanguage().locale
  → buildTaskDetailActionPlan(detail, locale)
    → task-detail-actions-presentation-i18n (action labels, toasts, validation)
    → buildTaskCompletionControlModel(detail, locale)
      → buildChecklistBlockerLabel(resolveTaskDetailPresentationLocale(locale), titles)
  → TaskDetailActionsHost
    → TaskDetailActionBar / TaskDetailCompleteDialog / TaskDetailCompletionSummary
    → useTaskDetailActions (locale-threaded success/error toasts)
```

## Presentation adapter

`lib/tasks/task-detail-actions-presentation-i18n.ts`

- `taskDetailActionLabel(locale, kind)` — `TaskDetailActionKind` → `tasks.detail.actions.*`
- `taskDetailResolutionCodeLabel(locale, code)` — machine code → `tasks.resolution.code.*`
- Completion summary, validation, and toast helpers under `tasks.detail.*`

Reuses `task-detail-presentation-i18n` for status labels and datetime formatting in host/summary paths.

## Enforce-clean boundary

`P216C2A_ENFORCE_CLEAN_EXACT` — 9 production paths (see implementation audit doc). No broad `tasks/**` prefix; C.2B host residuals excluded.

## Guardrails

- `i18n-hardcoded-scan.mjs` — P216C2A phase tagging
- `hardcoded-copy-guard.test.ts` — P216C2A inventory scope + blind-spot source guards (no `RESOLUTION_CODE_LABELS`, no hardcoded action labels, locale-threaded blocker path)
- `task-detail-actions-localization.test.tsx` — runtime EN/DE, completion flow semantics freeze, locale switch

## C.2B boundary

Host-specific assignment/residual copy in `VehicleTaskDetailDrawer` and `OperatorTaskDetail` deferred to P2.2.16C.2B.
