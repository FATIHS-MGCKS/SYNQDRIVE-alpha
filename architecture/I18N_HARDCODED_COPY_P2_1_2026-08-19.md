# I18N Hardcoded Copy P2.1

**Date:** 2026-08-19

## Decision

P2.1 establishes a machine-readable hardcoded-copy inventory and fully migrates Login + global shell surfaces to canonical `TranslationKey` lookups.

Rental, Master, and Operator feature screens remain debt for P2.2/P2.3.

## Hardcoded copy scanner

- Script: `frontend/scripts/i18n-hardcoded-scan.mjs`
- Output: `frontend/src/i18n/hardcoded-copy-inventory.json`
- Surfaces: `LOGIN`, `SHELL`, `RENTAL`, `MASTER`, `OPERATOR`, `SHARED`
- Categories: `TEXT`, `ARIA`, `PLACEHOLDER`, `TITLE`, `LABEL`, `FORMAT_LOCALE`, etc.
- Deduplication by surface + category + normalized sample text

## P2.1 migrated surfaces

| Surface | Status |
|---------|--------|
| Login (`LoginPage.tsx`) | Fully canonical `useLanguage().t()` |
| Language selector | Canonical `languageSelector.*` keys |
| Verification done page | Canonical `verification.done.*` keys |
| App error boundary defaults | Canonical `shell.errorBoundary.*` keys |

Removed: `frontend/src/pages/login-copy.ts`

## Auth error mapping

`frontend/src/i18n/auth-error-i18n.ts` maps known backend auth messages (e.g. `Invalid credentials`, `Account is inactive`, MFA failures) to `auth.error.*` keys with localized fallback for unknown errors.

## Coverage baseline v2

`translation-coverage-baseline.json` version 2:

- `baselineCanonicalKeyCount`: floor from P1.2 (3525)
- `canonicalKeyCount`: current total (grows during P2)
- **Regression rule:** owned translation counts must not decrease; canonical growth is allowed
- Partial locale coverage % may decrease as new EN/DE-only keys land — expected until P3

## Guardrails

`npm run i18n:check` runs:

1. Hardcoded scan refresh
2. Structural + registry tests
3. Coverage report
4. Enforce-clean surface guard (`enforceCleanRemaining === 0`)

## Follow-up

- **P2.2:** Rental hardcoded string extraction
- **P2.3:** Master/Operator extraction
- **P3:** Translate new keys into fr/pl/cs/nl/es/it/tr
