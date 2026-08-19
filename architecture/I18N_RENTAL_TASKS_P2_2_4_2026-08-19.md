# I18N Rental Tasks — P2.2.4 (2026-08-19)

## Scope

P2.2.4 extracts user-facing copy from Rental **Tasks** presentation layers into canonical platform i18n (`frontend/src/i18n`). Localization/presentation only — task domain logic, API contracts, DIMO/service-center integrations, workflow automation, and entity-task sections outside scope are unchanged.

### In scope

- `rental/components/TasksView.tsx`
- `rental/components/tasks/**` (presentation components + tests)
- `rental/lib/task-list.utils.ts`, `tasks-page.utils.ts`, `task-create.utils.ts`, `task-display.utils.ts`, `task-create-form.utils.ts`, `taskBulkActions.utils.ts`
- `rental/components/tasks-settings/tasks-i18n.ts` (`tt`, `tasksFormattingLocaleOrDefault`, label helpers)

### Out of scope

- `workflow-automation/**`, `service-center/**`
- `damages/CreateRepairTaskDialog`, `EntityTasksSection`, `VendorOperationalTasks`
- `service-task-semantics.ts`

## Pattern

- **React:** `useLanguage()` → `t(key)`, `locale`, `formattingLocale`
- **Non-React builders:** `tt(locale, key)` from `tasks-i18n.ts`
- **Date/number formatting:** `formattingLocale` parameter (removed hardcoded `de-DE` in `fmtTaskDate`)
- **Internal enums:** `OPEN`, `IN_PROGRESS`, etc. unchanged; presentation via translation keys only
- **Reuse:** `common.back`, `common.save`, `common.cancel`, `tasks.title`, etc. where semantically identical

## Enforce-clean boundary (P24)

Scanner config in `frontend/scripts/i18n-hardcoded-scan.mjs`:

- Exact: `rental/components/TasksView.tsx`
- Prefixes: `rental/components/tasks/**`, `rental/lib/task-*.utils.ts`

**P2.2.4 enforce-clean findings: 0**

## Keys

~350+ new `tasks.*` keys in `en.ts` and `de.ts` under:

- `tasks.pageHeader.*`, `tasks.view.*`, `tasks.kpi.*`
- `tasks.filter.*`, `tasks.bulk.*`, `tasks.form.*`
- `tasks.display.*`, `tasks.card.*`, `tasks.empty.*`
- `tasks.validation.*`, `tasks.completionMode.*`, `tasks.vendor.*`, `tasks.actionCenter.*`

Legacy keys (`tasks.title`, `tasks.searchPlaceholder`, etc.) preserved.

## Tests

Component tests use `@vitest-environment happy-dom`, `LanguageProvider`, and `LOCALE_STORAGE_KEY` for German locale assertions via `translateKey('de', key)`.
