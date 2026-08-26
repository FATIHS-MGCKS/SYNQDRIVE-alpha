# P2.2.48 — Operator Entry & Access Shell i18n Architecture

**Date:** 2026-08-26
**Baseline:** `35fba3159322b6f82a5d29afa77ad74986628efd` (P2.2.47 merge)
**Pre-flight:** PR #1316

## Scope

Presentation-only localization of Operator entry and access gate chrome:

- `OperatorEntryModal`, `OperatorEntryButton`, `OperatorDesktopOnlyNotice`
- `OperatorLinkCard`, `OperatorAccessDeniedScreen`, `OperatorAccessLoadingScreen`
- `OperatorAccessGuard` (host-owned error chrome only)
- `operatorAccess.ts` (denial presentation removed — lives in adapter)

## Locale flow

```
useLanguage().locale
  → operator-entry-access-i18n.ts (oea helpers)
  → operator.entry.access.* keys (+ common.close, common.retry reuse)
```

## Machine values (frozen)

| Value | Use |
|-------|-----|
| `OperatorAccessDenialReason` | Maps to `operator.entry.access.denial.*` keys only |
| `/login`, `/rental`, `/operator` | Route paths unchanged |
| `evaluateOperatorAccess` predicates | Unchanged |
| `profileError` (API) | Raw dynamic text in `ErrorState` |

## Guardrails

`P248_ENFORCE_CLEAN_EXACT` — 9 paths, 0 scanner findings required.

## Tests

`operator-entry-access-localization.test.tsx` — EN/DE, same-mount locale switch, denial reason preservation, auth evaluation freeze.

## Semantics

Category E = 0. No auth, authorization, routing, session, or permission semantic changes.
