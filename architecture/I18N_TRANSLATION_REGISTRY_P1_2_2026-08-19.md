# I18N Translation Registry P1.2

**Date:** 2026-08-19

## Decision

SynqDrive translation ownership is explicit per locale. Partial locale dictionaries must not spread/inherit the English dictionary. Runtime English fallback is centralized in `translateKey()`, not dictionary source files.

## Dictionary contracts

| Type | Meaning | Locales |
|------|---------|---------|
| `CompleteTranslationDictionary` | Every `TranslationKey` present | `en`, `de` |
| `PartialTranslationDictionary` | Locale-owned keys only | `fr`, `nl`, `es`, `it`, `pl`, `cs` |
| Empty partial (fallback-only) | No owned product keys | `tr` |

`TranslationKey` remains derived from `frontend/src/i18n/translations/en.ts`.

## Translation registry

`TRANSLATION_LOCALE_REGISTRY` in `frontend/src/i18n/translation-registry.ts` complements `SUPPORTED_LOCALES` from `locales.ts`:

- locale code
- dictionary reference
- status: `complete` | `partial` | `fallback-only`
- `hasLocaleDictionary` / `usesEnglishFallback` flags

## Runtime lookup semantics

`translateKey(locale, key)`:

1. If key exists in locale-owned dictionary → `source: 'locale'`
2. Else if key exists in English → `source: 'fallback-en'` (deduplicated DEV warning)
3. Else → `source: 'missing-key'`, return key string (deduplicated DEV warning)

`useLanguage().translate()` exposes full diagnostics; `t()` returns text only.

## Legal document separation

`legal-documents-registry.ts` tracks legal localization independently:

- `en`, `de`: `legally-reviewed` with dedicated `legal-documents.*` modules merged into product dictionaries
- All other locales: `runtime-fallback` — must not be treated as legally localized

## Coverage guardrails

- `translation-coverage-baseline.json`: owned-key counts per locale (regression floor)
- `npm run i18n:check`: structural tests + coverage report
- Forbidden: `...en` spread in locale dictionary source files
- CI does not require full translation completeness until P3/P6

## Shared language selector

`frontend/src/i18n/components/LanguageSelector.tsx` derives options from `SUPPORTED_LOCALES` only. Used by Login (`login-menu`) and Rental TopBar (`topbar-pill`).

## Surface integration (structural)

- **Master:** `TopBar` consumes `useLanguage()` for `lang` / aria metadata
- **Operator:** `OperatorHeader` uses `formattingLocale` from shared provider
- **Rental shims:** `frontend/src/rental/i18n/*` remains re-export-only (36 consumers on `../i18n/` shim path; 156 on direct `../../i18n/`)

## Follow-up

- **P2:** Extract hardcoded Login/Master/Operator strings to semantic keys
- **P3:** Fill partial dictionaries; remove English fallback for completed locales
- **P6:** Strict completeness CI gate
