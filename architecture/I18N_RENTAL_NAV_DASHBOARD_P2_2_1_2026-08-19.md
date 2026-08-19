# I18N Rental Navigation & Dashboard — P2.2.1 (2026-08-19)

## Scope

P2.2.1 extracts user-facing copy from Rental application chrome and the main Dashboard into canonical platform i18n (`frontend/src/i18n`).

### Enforce-clean surfaces

- `frontend/src/rental/components/TopBar.tsx`
- `frontend/src/rental/components/Sidebar.tsx`
- `frontend/src/rental/components/DashboardView.tsx`
- `frontend/src/rental/components/dashboard/**` (dashboard-only tree)

### Out of scope

Vehicle detail, bookings, customers, settings internals, master/operator surfaces.

## Runtime helpers

- `frontend/src/rental/components/dashboard/dashboard-i18n.ts`
  - `dt(locale, key, vars?)` — non-React dashboard builders
  - `dashboardFormattingLocale(locale)` — BCP-47 formatting via `getFormattingLocale`

React surfaces prefer `useLanguage().t()`; view-model consumers use `vm.locale` + `vm.t`.

## Key namespaces

Reused where semantically identical: `nav.*`, `topbar.*`, `category.*`, `notification.*`, `common.*`, `dashboard.*`, `vehicle.status.*`.

New P2.2.1 keys are EN+DE complete only; partial locales fall back to English explicitly.

## Guardrails

`frontend/scripts/i18n-hardcoded-scan.mjs` marks P2.2.1 paths as `enforce-clean` (severity). Inventory version 2 includes `byRentalModule` aggregation.

## Formatting debt (documented)

- `dashboardKpiFormat.ts` EUR convention uses `getFormattingLocale('de')` by product rule.
- `activeRentalDrawer.utils.ts` migrated to `dashboardFormattingLocale`.
- Repository-wide `de-DE`/`en-US` outside dashboard scope remains P4 debt.

## Pluralization debt (documented)

- `topbar.resultCountOne` / `topbar.resultCountMany` — no ICU yet.
- Similar count patterns under `dashboard.count.*`.

## Next phase (P2.2.2)

Recommended: Rental bookings list/detail chrome, customers list, fleet hub shell — not dashboard drilldown targets.
