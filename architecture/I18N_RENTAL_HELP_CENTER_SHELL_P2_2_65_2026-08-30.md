# P2.2.65 — Rental Help Center Shell Chrome i18n

**Date:** 2026-08-30  
**Baseline:** `abcc38958fe7d1431f60bd8c174b3f3726955cd3` (P2.2.64 merge)  
**Scope:** Shell chrome only — `HelpCenterView.tsx` host presentation

## Mount topology

```
help-center (rental/App.tsx)
└── HelpCenterView.tsx
    ├── Header (title, stats, intro, support CTA)
    ├── Search (placeholder, aria, results/no-results)
    ├── Quick navigation
    ├── SECTIONS accordion (static content — deferred P266+)
    └── Footer
```

## Locale flow

- `useLanguage().t` → `nav.helpCenter` (reuse) + `helpCenter.*` keys from `rental.helpCenter.{en,de}.ts`
- No adapter module (presentation-only inline `t()` calls)
- **Business fetches:** NONE
- **Mutation surface:** NONE (`onOpenSupport` navigation only)

## Identity / semantics preserved

- `SECTIONS` corpus unchanged (17 sections, 44 articles)
- Search: raw `searchTerm` state; client filter over static corpus
- Category/article IDs, slugs, ordering unchanged
- React keys: `sec.id`, `section.id`, `article.id` — no locale keys

## Guardrails

- P265 enforce-clean exact: `rental/components/HelpCenterView.tsx`
- Scanner flags JSX shell only; `SECTIONS` object literals remain content-deferred

## Tests

- `rental-help-center-shell-localization.test.tsx`

## Deferred

- P266+: `SECTIONS` static article/content corpus localization (~120+ keys)
