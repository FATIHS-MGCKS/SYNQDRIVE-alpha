# Auswertungen — Data Quality Admin Panel (Prompt 29/54)

## Overview

Role-dependent data quality and diagnostics within **Auswertungen** (`FinancialInsightsView`).

| Audience | UI |
|----------|-----|
| **ORG_ADMIN / MASTER_ADMIN** | Full `EvaluationsDataQualityAdminPanel` |
| **Standard users** | `EvaluationsDataQualityUserHint` — short, non-technical status line |

## Admin panel fields (per source)

| Field | Source |
|-------|--------|
| Data source | `EvaluationsDataSourceQualityAssessment.sourceKey` + i18n label |
| Connection status | `integrationConnected` → connected / not_connected / degraded |
| Freshness | Lineage metric `freshness.state` when available |
| Coverage | `coveragePercent` |
| Error rate (est.) | Derived from coverage gap + known error severities — **not** raw logs |
| Last successful import | Lineage `lastSuccessfulImportAt` or `lastSuccessfulUpdateAt` |
| Last failed job | Lineage `adminDiagnostics.backgroundJobName` only when `issueKind === technical_error` |
| Affected metrics | `affectedMetrics[]` |
| Excluded records | Sum of lineage `excludedRecordCount` + exclusion reasons |
| Recommended action | `recommendedRemediation[0]` |
| Drill-down link | Mapped remediation target (see below) |

## Issue kind distinction

| Kind | Meaning | User-facing label |
|------|---------|-------------------|
| `missing_integration` | `NOT_CONNECTED` — setup required | Integration not set up |
| `technical_error` | Loader/job failure | Technical error |
| `data_gap` | `MISSING` / `LIMITED` / `STALE` | Data gaps |
| `ok` | Healthy | Healthy |

No stack traces, credentials, or cross-tenant data in the UI.

## Remediation drill-downs

| Target | Navigation |
|--------|------------|
| `integrations-hub` | Settings → Data Authorization |
| `data-authorization` | Settings → Data Authorization |
| `fleet` | Fleet → Connectivity tab |
| `invoices` | Finance → Invoices |
| `bookings` | Bookings |
| `damages` | Damages |
| `tasks` | Task Management |

Implemented in `evaluations-data-quality-navigation.ts`.

## Data flow

```
GET …/evaluations/analytics/summary
  → dataQuality (EvaluationsDataQualityDomainSummary)
  → lineage (ADMIN audience for ORG_ADMIN)
       ↓
buildAdminSourceRows() — shared/evaluations-insights/evaluations-data-quality-panel.ts
       ↓
EvaluationsDataQualityAdminPanel / EvaluationsDataQualitySourceCard
```

## Components

| File | Role |
|------|------|
| `EvaluationsDataQualityAdminPanel.tsx` | Collapsible admin section |
| `EvaluationsDataQualitySourceCard.tsx` | Per-source diagnostic card |
| `EvaluationsDataQualityStateBadge.tsx` | DQ state chip |
| `EvaluationsDataQualityUserHint.tsx` | Reduced standard-user banner |
| `evaluations-data-quality-navigation.ts` | View/settings navigation |

## i18n

Keys under `evaluations.dataQuality.*` in `en.ts` and `de.ts`. Other locales fall back to English via `LanguageContext`.

## Accessibility

- Section `aria-labelledby`, source cards `aria-labelledby`
- Expand/collapse `aria-expanded` / `aria-controls`
- User hint `role="status"`
- Source list `role="list"`

## Responsive layout

- Admin source grid: 1 col mobile → 2 col `md` → 3 col `xl`
- Source card fields: 1 col when `compact`, 2–3 cols on larger screens

## Tests

```bash
cd backend && npm run test:insights:analytics  # includes evaluations-data-quality-panel.shared.spec.ts
cd frontend && npx vitest run \
  src/rental/components/evaluations/EvaluationsDataQualityPanel.test.tsx \
  src/rental/lib/evaluations-data-quality-navigation.test.ts
```

Covers: role gating, empty state, partial user hint, navigation targets, missing integration vs technical error.

## Visual reference

Admin panel structure:

```
┌─ Datenqualität & Diagnose ──────────────── [Gut] [Refresh] [Hide] ┐
│ ┌─ Rechnungsdaten ─┐ ┌─ Buchungsdaten ─┐ ┌─ Telemetrie ────────┐ │
│ │ Verbunden        │ │ …               │ │ Nicht verbunden     │ │
│ │ Abdeckung 100%   │ │                 │ │ Integration fehlt   │ │
│ │ [Rechnungen →]   │ │                 │ │ [Datenfreigaben →]  │ │
│ └──────────────────┘ └─────────────────┘ └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

Standard user sees only a single-line hint below the cockpit when data is partial/stale/unavailable.
