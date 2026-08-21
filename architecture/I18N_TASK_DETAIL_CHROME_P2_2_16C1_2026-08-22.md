# I18N — Task Detail Chrome (P2.2.16C.1)

## Locale flow

```
useLanguage().locale
  → buildTaskDetailViewModel({ locale })
    → task-detail-presentation-i18n (tdp, datetime, linked labels)
    → taskDetailChecklist.utils (locale-threaded progress/blocker labels)
  → TaskDetailBody / TaskDetailShell / sections
    → useLanguage().t('tasks.detail.*')
```

Three canonical hosts (`GlobalTaskDetailPanel`, `VehicleTaskDetailDrawer`, `OperatorTaskDetail`) already thread locale from B.2; C.1 localizes chrome they render.

## Presentation adapter

`lib/tasks/task-detail-presentation-i18n.ts`

- `tdp(locale, key)` — canonical translation lookup
- `taskDetailLinkedObjectTypeLabel` — machine `type` → `tasks.detail.linked.*`
- `taskDetailStatusLabel` / `taskDetailPriorityLabel` / `taskDetailTypeLabel` — delegate to `service-task-presentation-i18n`
- `formatTaskDetailDateTime` / `formatTaskDetailDate` / `formatTaskDetailDueCompact` — `getFormattingLocale`

## Enforce-clean boundary

`P216C1_ENFORCE_CLEAN_EXACT` — 8 production paths (see implementation audit doc). No broad `tasks/**` prefix.

## Guardrails

- `i18n-hardcoded-scan.mjs` — P216C1 phase tagging
- `hardcoded-copy-guard.test.ts` — P216C1 inventory scope + blind-spot source guards
- `task-detail-chrome-localization.test.tsx` — runtime EN/DE + locale switch

## C.2 boundary

Action semantics, completion dialogs, and mutation flows remain on German/legacy paths until P2.2.16C.2.
