# Auswertungen — Mobile & Responsive Readiness Audit (2026-07)

**Prompt:** 34/54  
**Scope:** Restructured `EvaluationsPage` (9 sections, executive KPI strip, SW cockpit, risk/cost visualizations, finance drill-down)  
**Date:** 2026-07-24

## Tested viewports

| Viewport | Width × height | Playwright project |
|----------|----------------|-------------------|
| Narrow phone | 320 × 568 | `mobile-320` |
| iPhone-class | 375 × 812 | `mobile-375` |
| iPhone Pro | 390 × 844 | `mobile-390` |
| Large phone | 430 × 932 | `mobile-430` |
| Tablet portrait | 768 × 1024 | `tablet-768` |
| Tablet landscape | 1024 × 768 | `tablet-1024-landscape` |
| Standard desktop | 1280 × 800 | `desktop-1280` |
| Large desktop | 1920 × 1080 | `desktop-1920` |

Manual / automated checks: horizontal overflow, KPI truncation, filter usability, sticky nav, chart fallbacks, touch targets (≥ 44 px), safe-area padding, landscape tablet.

## Issues found & fixes

| Area | Issue | Fix |
|------|-------|-----|
| Page shell | Potential horizontal bleed on small screens | `EVALUATIONS_PAGE_SHELL_CLASS`: `overflow-x-hidden`, safe-area bottom padding |
| Section nav | Small tap targets, no safe-area top | Sticky nav with `env(safe-area-inset-top)`, 44 px anchor links, horizontal snap scroll |
| Global filters | Wrap pushed layout; selects too small | Horizontal scroll bar; `h-11` / `min-h-[44px]` selects; refresh button 44 px |
| KPI grids | `grid-cols-2` at 320 px clipped large EUR amounts | `grid-cols-1` → `min-[360px]:grid-cols-2` → `lg:grid-cols-4` |
| KPI values | Fixed 21–22 px overflow on long amounts | `clamp()` + `break-words` + `tabular-nums` |
| Executive strip | Cards `min-w-[280px]` caused overflow | `min-w-0 w-full`; help icon 44 px (tap, not hover-only) |
| SW cockpit | Category chips below touch minimum | 44 px pill buttons |
| Charts (7 viz + finance daily) | Unreadable Recharts on &lt; 768 px | Hide chart `md+`; mobile hint; table alternative always visible; finance daily mobile table |
| Dimension comparison | Mode toggle too small | 44 px tab buttons |
| Sections | Collapse control too small | 44 px collapse button in `EvaluationsSection` |
| Dual chart grids | Single column only at xl | Shared `EVALUATIONS_DUAL_GRID_CLASS` (`xl:grid-cols-2`) |

## Shared responsive tokens

`frontend/src/rental/components/evaluations/evaluations-responsive.constants.ts`

- `EVALUATIONS_KPI_GRID_CLASS`
- `EVALUATIONS_DUAL_GRID_CLASS`
- `EVALUATIONS_TOUCH_TARGET_CLASS`
- `EVALUATIONS_PAGE_SHELL_CLASS`
- `EVALUATIONS_STICKY_NAV_CLASS`
- `EVALUATIONS_CHART_DESKTOP_ONLY_CLASS` / `EVALUATIONS_CHART_MOBILE_HINT_CLASS`
- `EVALUATIONS_FILTER_SELECT_CLASS`
- `EVALUATIONS_KPI_VALUE_CLASS`

## Automated tests

| Layer | File |
|-------|------|
| Vitest | `EvaluationsMobileReadiness.test.tsx` — token contracts |
| Vitest | Existing `EvaluationsPageStructure`, `EvaluationsRiskCostVizPanel`, `EvaluationsSwCockpit` |
| Playwright | `e2e/evaluations-responsive.spec.ts` + `e2e/evaluations-fixtures.ts` |
| Playwright config | Added `tablet-1024-landscape`, `desktop-1920` |

E2E assertions: `data-testid="evaluations-page"`, section nav, filter bar, no horizontal overflow, mobile chart hint + table on risks section, desktop risk matrix grid visible.

## Remaining known limitations

1. **Chart tooltips (Recharts)** — Still hover/focus on desktop; mobile uses tables (no hover-only data path).
2. **Executive KPI definitions** — Tooltip on help button; definition text also available via focus (keyboard). Full inline definition not duplicated on mobile to avoid clutter.
3. **SW finding drawer** — Uses shared drawer pattern; very long entity lists scroll inside drawer (acceptable).
4. **Data-quality admin panel** — Dense tables scroll horizontally inside `overflow-x-auto` wrappers when needed; no page-level overflow.
5. **Landscape phones (e.g. 667×375)** — Not a dedicated Playwright project; covered indirectly via tablet landscape + manual safe-area rules.

## Build & test status

Recorded at implementation time (see PR / CI):

```bash
cd frontend && npm run build
cd frontend && npm test -- EvaluationsMobileReadiness EvaluationsPageStructure EvaluationsRiskCostVizPanel
cd frontend/e2e && npx playwright test evaluations-responsive.spec.ts
```

**Recorded (2026-07-24):** `npm run build` ✅ · Vitest (EvaluationsMobileReadiness + related) 21/21 ✅ · Playwright `evaluations-responsive.spec.ts` (mobile-375 + desktop-1280): 12 passed, 2 skipped ✅

## Files changed (summary)

- `evaluations-responsive.constants.ts` (new)
- `EvaluationsPage`, `EvaluationsSection`, `EvaluationsSectionNav`
- `EvaluationsMetricKpiCard`, `EvaluationsExecutiveKpiCard`, `EvaluationsSwCockpit`
- `EvaluationsChartCard`, `EvaluationsRiskCostCharts`, `EvaluationsFinanceInvoiceDetail`
- `EvaluationsAnalyticsFilterBar`, `EvaluationsGlobalFiltersSection`
- Section KPI grids: Risks, Finance, Fleet, Costs/Downtime
- `EvaluationsRiskCostVizPanel`
- i18n: `evaluations.responsive.*`
- E2E: `evaluations-fixtures.ts`, `evaluations-responsive.spec.ts`, `playwright.config.ts`
