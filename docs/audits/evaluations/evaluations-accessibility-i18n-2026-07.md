# Auswertungen — Accessibility & i18n Audit (2026-07)

**Prompt:** 35/54  
**Scope:** Restructured `EvaluationsPage` (filters, executive KPIs, SW cockpit, risk/cost charts, sections, export)  
**Date:** 2026-07-24  
**Locales:** German (`de`), English (`en`)

## Methodology

| Layer | Tool / approach |
|-------|-----------------|
| Static markup | Vitest SSR (`evaluations.a11y.ui.test.tsx`, existing component tests) |
| Keyboard | Playwright focus + ArrowLeft/ArrowRight on SW cockpit tabs; section collapse focus |
| Automated a11y | `@axe-core/playwright` on `[data-testid="evaluations-page"]` (critical/serious; `color-contrast` excluded — design tokens validated separately) |
| i18n | Key parity `en.ts` ↔ `de.ts`; bilingual E2E selectors (`/Zeitraum\|Period/i`) |
| Manual | Heading hierarchy review, chart `role="img"` + table fallback, no color-only severity |

No blanket WCAG conformance claim — findings below are evidence from the listed tools only.

## Accessibility — issues found & fixes

| Area | Finding | Fix |
|------|---------|-----|
| Page shell | Missing document landmark | `<main data-testid="evaluations-page">` on `EvaluationsPage` |
| Filter bar | Hardcoded German labels; no grouping | `<fieldset>` + `sr-only` `<legend>`; `aria-label` on each `<select>`; keyboard-focusable scroll (`tabIndex={0}`) |
| Sections | Collapse removed body from DOM (`aria-controls` broken) | Body kept in DOM with `hidden` attribute; `aria-label` collapse/expand |
| Sections | Small collapse control, weak focus | 44 px target + `focus-visible:ring-2` |
| SW cockpit | `role="toolbar"` misuse | `role="tablist"` / `tab` / `tabpanel` with stable IDs (`evaluations-a11y.ts`) |
| SW cockpit | No arrow-key navigation | `ArrowLeft` / `ArrowRight` between category tabs |
| SW finding cards | `aria-pressed` on navigational card | Removed; `aria-label` via `evaluations.a11y.findingCard` |
| Executive KPI strip | Missing list label; `t` not bound; scroll not keyboard-focusable | `role="list"` + `aria-label`; fixed `useLanguage`; `tabIndex={0}` on scroll strip |
| Executive KPI cards | Delta icons without SR text; drill link icon-only | `sr-only` delta direction; `aria-label` on drill-down link |
| Insight list | Raw severity enums (`CRITICAL`) | Localized `evaluations.insight.severity.*` badges |
| Metric refresh | English “Refreshing…” | `evaluations.metricValue.refreshing` + `role="status"` |
| Global filters | Raw `overallStatus` codes | `evaluations.overallStatus.*` |
| Data quality admin | Skipped heading level (`h2` inside section) | Nested title → `h3` |
| Risk matrix | `role="grid"` on decorative heatmap | Visual grid `aria-hidden`; semantic data in `<table>` with `sr-only` `<caption>` |
| Risk matrix table | Raw `LOW`/`MEDIUM`/`HIGH` confidence | `formatConfidence` → `evaluations.swCockpit.confidence.*` |
| Charts | Redundant `role="table"` | Removed from `EvaluationsChartDataTable` (native `<table>`) |
| Data quality admin | Crash on partial `knownErrors` in E2E mock | Hardened `buildAdminSourceRow` (`knownErrors ?? []`); complete `dataQuality` mock in E2E fixtures |
| Dimension filter | Unlabeled mode toggle | `role="tablist"` + tab IDs (`EVAL_DIM_TAB_*`) |

## i18n — issues found & fixes

| Area | Finding | Fix |
|------|---------|-----|
| Filter bar | Mixed DE UI strings in component | Full `evaluations.filters.*` key set (EN + DE) |
| Section toggle | German-only aria strings | `evaluations.section.collapseNamed` / `expandNamed` |
| Export filename | Hardcoded `auswertungen-…` | `evaluations.export.filename` |
| Chart table headers | English column labels in charts | `evaluations.viz.table.*` |
| Risk matrix a11y strings | English templates in chart | `evaluations.viz.riskMatrix.cellAria`, `pointTitle`, `axisScale` |
| Severity / status | Enum leakage in UI | `evaluations.insight.severity.*`, `evaluations.overallStatus.*` |
| E2E / responsive tests | German-only selectors | Bilingual regex selectors in `evaluations-responsive.spec.ts` |

### Translation key groups added (Prompt 35)

- `evaluations.filters.*` — period, station, risk category, insight status
- `evaluations.section.*` — collapse/expand (named)
- `evaluations.metricValue.refreshing`
- `evaluations.executiveKpi.stripLabel`, `drillDownAria`, `deltaUp` / `deltaDown` / `deltaFlat`
- `evaluations.overallStatus.*`
- `evaluations.insight.severity.*`
- `evaluations.export.filename`
- `evaluations.viz.table.*`
- `evaluations.viz.riskMatrix.colProbabilityShort`, `axisScale`, `cellAria`, `pointTitle`
- `evaluations.viz.dimensionComparison.filterLabel`
- `evaluations.a11y.findingCard`, `evaluations.a11y.swFindingsPanel`

Other locales (fr, nl, …) continue to fall back to English via `LanguageContext`.

## Automated tests

| Layer | File |
|-------|------|
| Vitest a11y markup | `frontend/src/rental/components/evaluations/evaluations.a11y.ui.test.tsx` |
| Vitest (updated) | `EvaluationsSwCockpit.test.tsx` (`tablist`), `EvaluationsRiskCostVizPanel.test.tsx` (`<table>`) |
| Playwright a11y | `frontend/e2e/evaluations-a11y.spec.ts` |
| Playwright responsive (bilingual) | `frontend/e2e/evaluations-responsive.spec.ts` |

**Recorded (2026-07-24):** `npm run build` ✅ · Vitest (evaluations.a11y + related) 14/14 ✅ · Playwright `evaluations-a11y.spec.ts` + `evaluations-responsive.spec.ts` (mobile-375 + desktop-1280): 19 passed, 5 skipped ✅

## Remaining limitations

1. **Recharts tooltips** — Desktop hover tooltips are not fully keyboard-equivalent; mobile/tablet use tabular alternatives.
2. **Color contrast on status chips** — Excluded from axe runs (`color-contrast`, `nested-interactive`); shared KPI/list patterns need periodic design QA.
3. **Section nav `aria-current`** — Scroll-spy active anchor not implemented (visual scroll only).
4. **Backend error strings** — Some `analytics.error` messages may still arrive in English from API.
5. **Non-DE/EN locales** — No dedicated translations for new keys; EN fallback applies.
6. **Risk matrix heatmap** — Deliberately `aria-hidden`; screen readers use the data table only.

## Files touched (summary)

- `EvaluationsPage.tsx`, `EvaluationsAnalyticsFilterBar.tsx`, `EvaluationsSection.tsx`
- `EvaluationsSwCockpit.tsx`, `EvaluationsSwFindingCard.tsx`, `EvaluationsExecutiveKpiStrip.tsx`, `EvaluationsExecutiveKpiCard.tsx`
- `EvaluationsInsightListCard.tsx`, `EvaluationsMetricValue.tsx`, `EvaluationsGlobalFiltersSection.tsx`
- `EvaluationsDataQualityAdminPanel.tsx`, `EvaluationsRiskCostVizPanel.tsx`
- Charts: `EvaluationsChartCard.tsx`, `EvaluationsChartDataTable.tsx`, `EvaluationsRiskMatrixChart.tsx`, `EvaluationsRiskCostCharts.tsx`
- `evaluations-a11y.ts`, `en.ts`, `de.ts`
- Tests: `evaluations.a11y.ui.test.tsx`, `evaluations-a11y.spec.ts`, responsive spec updates
