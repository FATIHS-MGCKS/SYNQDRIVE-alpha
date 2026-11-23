# UX-009 — High-traffic i18n on UX-004 screens

**Date (CET):** 2026-11-23  
**Scope:** Rental bookings planner load error; Operator Today high-traffic chrome (empty/error/stale/buckets/nav).  
**Runtime:** canonical `frontend/src/i18n/LanguageContext.tsx` — no new providers, no backend changes.

## Rental (RENTUX)

| Area | Before | After |
|------|--------|-------|
| `BookingsView` API list failure | Hardcoded DE `Buchungen konnten nicht geladen werden.` | `t('bookings.planner.loadError')` |
| UX-004 states | `BookingsPage` shared patterns | Unchanged (cache, retry, empty dataset vs filter) |

**Keys:** new `bookings.planner.loadError` in all 9 locale dictionaries (canonical `en` + `de` inline; `pl`–`tr` partial modules).

## Operator (OPUX)

| Area | Before | After |
|------|--------|-------|
| `OperatorTodayView` | Hardcoded German UI chrome | `useLanguage()` + `operator.today.*` keys |
| `OperatorTodayTaskFeed` bucket labels/errors | Hardcoded DE section titles | `getOperatorTodayBucketSections(..., t)` |
| Locale formatting | `useOperatorToday('de')` | `useOperatorToday(formattingLocale)` from `LanguageContext` |
| Server alerts | `alert.title` / `alert.message` | Unchanged (user content) |

**Keys:** existing `operator.today.en` / `operator.today.de` modules wired; added `operator.today.{pl,fr,cs,nl,es,it,tr}` + `operator.today.bucket.today.title`.

## Validation (repository)

- `BookingsPage.ui.test.tsx` — pass  
- `OperatorTodayTaskFeed.test.tsx` — pass (DE mock via `translateKey`)  
- `operatorTodayView.utils.test.ts` — pass  
- `npm run i18n:check:ci` — pass  
- `npm run build` (tsc -b + vite) — pass  
- FEUX / RENTUX / OPUX graph validators — pass after OPUX epistemic label update  
- Internationalization `validate-graph.sh` — pass  
- `i18n:pr-gate:test` — **partial:** git-fixture cases skip/fail without PR merge-base context in agent VM (not a product regression)

## Verdict

**UX-009 → DONE** for Integration-2 targeted remediation on UX-004 surfaces. Next backlog item: **UX-010**.