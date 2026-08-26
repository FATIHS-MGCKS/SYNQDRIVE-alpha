# I18N — Operator Tasks Tab Chrome (P2.2.47)

**Version:** V4.9.974
**Date:** 2026-08-26
**Baseline:** `579ddcbbf0de2339eea99aab39281aeca26c8a6c`

## Overview

Localized host-owned Operator Tasks tab chrome: list title, scope toggle, summary row, filter/priority chips, booking banner, empty state, detail placeholder, back link, and create FAB via `operator-tasks-tab-i18n.ts`.

## Locale flow

`useLanguage().locale` → `operator-tasks-tab-i18n.ts` (`ott`, filter/summary/priority helpers); reuses `tasks.*`, `common.*`, `status.overdue`.

## Machine values (frozen)

- Filter chip IDs: `today`, `overdue`, `vehicle`, `booking`
- Priority values: `all`, `CRITICAL`, `HIGH`, `NORMAL`, `LOW`
- Scope: `mine` | `all`
- `filterOperatorTasks`, `sortOperatorTasks`, API filter builders unchanged
- React keys (`task.id`, `chip`, `p`), callbacks, routes/sheets unchanged

## Dynamic (not translated)

Task titles, vehicle labels from fleet data, booking references.

## Excluded

- `OperatorTaskCard.tsx` and P246 Task Card adapter (frozen)
- `OperatorTaskDetail` (out of scope)
- Task create/edit sheet internals
- P245 Today tab chrome

## Guardrails

P2.2.47 enforce-clean exact (2 paths) — 0 findings.

## Tests

`operator-tasks-tab-localization.test.tsx` (6 tests).

## Semantics

Presentation-only; Category E = 0.
