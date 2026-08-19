# I18N Production Hardening P0.1 — Governance & Baseline

**Date:** 2026-08-18

## Summary

Established the canonical SynqDrive 9-locale product contract and P0 structural guardrails without migrating translation dictionaries or surfaces.

## Canonical contract

- `frontend/src/i18n/locales.ts` — official locales: `de`, `en`, `pl`, `fr`, `cs`, `nl`, `es`, `tr`, `it`
- BCP-47 formatting tags (e.g. `de-DE`, `tr-TR`)
- `RUNTIME_TRANSLATION_LOCALE_CODES` — 8 locales wired in rental `LanguageContext` (excludes `tr` until P3)

## Governance

- `.cursor/rules/i18n.mdc` — mandatory always-apply agent rule
- `AGENTS.md` — concise i18n section
- `docs/audits/i18n-production-hardening-baseline-2026-08.md` — full baseline audit

## Guardrails

- `npm run i18n:check` — structural locale registry + runtime dictionary presence tests
- Strict translation-key completeness explicitly deferred to P3/P6

## Runtime changes (low risk)

- `LanguageContext` uses `resolveRuntimeTranslationLocale()` for browser detection
- `TopBar` language list derived from canonical registry (runtime subset)
- Turkish **not** added to runtime selector/dictionary (no fake `...en` placeholder)

## Follow-up

- P1: hoist shared `LanguageProvider`, integrate Login/Master/Operator
- P3: Turkish dictionary + remove `...en` inheritance
