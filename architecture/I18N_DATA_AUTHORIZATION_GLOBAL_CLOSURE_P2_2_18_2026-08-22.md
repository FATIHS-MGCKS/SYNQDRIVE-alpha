# I18N — Data Authorization Global Closure (P2.2.18)

**Date:** 2026-08-22  
**Baseline:** `6e578fd9527a496a3e10a212e3ce5d735444a17a` (P2.2.17 merge)  
**Status:** Implementation complete — global enforce-clean closure

## Objective

Close the final active global i18n enforce-clean debt in `DataAuthorizationTab.tsx` without altering authorization, consent, permission, or API semantics.

## Architecture

```
useLanguage().{t, locale}
        │
        ▼
DataAuthorizationTab.tsx
  ├── KPI cards (settings.dataAuth.kpi.*)
  ├── Table headers (settings.dataAuth.table.* + common.status)
  ├── Filter summary (settings.dataAuth.filters.summary)
  ├── Reset filters (tasks.filter.resetFilters)
  ├── Category chip (common.all)
  └── Empty states (settings.dataAuth.empty.* + dashboard.drilldown.noMatches)

data-authorization.constants.ts + settings-i18n.ts  [unchanged]
  └── filter option labels (already localized)
```

## Presentation vs machine separation

| Layer | Examples | Localized? |
|-------|----------|------------|
| Machine | `ACTIVE`, `PENDING`, `HIGH`, `all`, `auth.id` | No |
| Dynamic data | `auth.title`, `processorName`, DIMO labels | No |
| Chrome | KPI labels, table headers, empty copy | Yes |

## Enforce-clean boundary

`P218_ENFORCE_CLEAN_EXACT`:

- `rental/components/settings/data-authorization/DataAuthorizationTab.tsx`

## Dictionary delta

7908 → 7925 EN/DE (+17 keys). Parity 100%. No orphans.

## Regression freeze

- P217 = 0
- P216A/B1/B2/C1/C2A/C2B = 0
- Shim inventory = 29
- Category E = 0

## Global closure

After P2.2.18: `npm run i18n:check` PASS — **GLOBAL I18N ENFORCE-CLEAN CLOSURE = COMPLETE**
