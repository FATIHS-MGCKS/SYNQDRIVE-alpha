# Evaluations Analytics API Contracts

Canonical type definitions for the Auswertungen (evaluations) analytics surface (Prompt 20/54).

## Source of truth

| Layer | Location |
|-------|----------|
| **Primitives** | `shared/evaluations-insights/evaluations-analytics-primitives.contract.ts` |
| **Filters** | `shared/evaluations-insights/evaluations-analytics-filters.contract.ts` |
| **Insight summary** | `shared/evaluations-insights/insights-analytics.contract.ts` |
| **Insight detail/list** | `shared/evaluations-insights/evaluations-insight-detail.contract.ts` |
| **Analytics summary** | `shared/evaluations-insights/evaluations-analytics-summary.contract.ts` |
| **Entity references** | `shared/evaluations-insights/insight-entity-references.contract.ts` |
| **Runtime validation** | `shared/evaluations-insights/evaluations-analytics-contract-validation.ts` |
| **Barrel** | `shared/evaluations-insights/evaluations-analytics-contracts.index.ts` |
| **Backend query DTOs** | `backend/.../dto/evaluations-analytics-filters.dto.ts` |
| **Backend response DTOs (OpenAPI)** | `backend/.../dto/evaluations-analytics-response.dto.ts` |
| **Frontend import surface** | `frontend/src/rental/lib/evaluations-analytics-api.types.ts` |

Import alias: `@synq/evaluations-insights/*` (backend + frontend).

## Primitive contracts

### Metric Value (discriminated union)

```typescript
type EvaluationsMetricValue =
  | { kind: 'count'; value: number; unit?: string | null }
  | { kind: 'money'; value: EvaluationsMoney }
  | { kind: 'percent'; value: number; decimals?: number }
  | { kind: 'ratio'; numerator: number; denominator: number; percent: number | null }
  | { kind: 'duration'; valueMs: number; label?: string | null }
  | { kind: 'text'; value: string };
```

### Metric Status

`OK | PARTIAL | UNAVAILABLE | ERROR` — used for section envelopes and data quality.

### Money

```typescript
interface EvaluationsMoney {
  amountMinor: number;
  currency: string; // ISO 4217
}
```

Legacy summary fields (`revenueMtdMinor`, `currency`) remain for backward compatibility; new chart/ranking surfaces should prefer `EvaluationsMetricValue`.

### Time Period & Comparison

- `EvaluationsTimePeriod` — `key`, `label`, `from`, `to`, `timezone`
- `EvaluationsComparison` — current/previous windows + `deltaPercent`

### Time Series, Ranking, Forecast

Defined in primitives for upcoming chart/ranking/drill-down endpoints. Not yet exposed as dedicated HTTP routes.

### Risk, Strength, Weakness, Recommendation

| Contract | Current usage |
|----------|---------------|
| `EvaluationsRisk` | Maps to insight list items + `EvaluationsActiveRisksSummary` counts |
| `EvaluationsStrength` / `EvaluationsWeakness` | Maps to `EvaluationsHighlightItem` (`severity: positive/negative`) |
| `EvaluationsRecommendation` | Insight `actionLabel` / `actionType` on `EvaluationsInsightDetail` |

### Data Quality

`EvaluationsDataQuality` — alias `EvaluationsDataQualitySummary` in summary response.

### Entity Reference

`EvaluationsEntityReference` = `InsightEntityReference` (typed, tenant-scoped).

### Drill-down Result

`EvaluationsDrillDownResult` — reserved for future drill-down API; includes `kind`, filters echo, and optional entity list / time series / ranking payload.

## HTTP endpoints

| Method | Path | Response contract |
|--------|------|-------------------|
| GET | `/organizations/:orgId/evaluations/analytics/summary` | `EvaluationsAnalyticsSummaryResponse` |
| GET | `/organizations/:orgId/evaluations/insights/summary` | `InsightAnalyticsSummary` |
| GET | `/organizations/:orgId/evaluations/insights` | `EvaluationsInsightListResponse` |
| GET | `/organizations/:orgId/evaluations/insights/:insightId` | `EvaluationsInsightDetail` |

OpenAPI: `@ApiTags('Evaluations Analytics')` / `@ApiTags('Evaluations Insights Analytics')` with `@ApiOkResponse` DTOs.

## Runtime validation

Shared validators (no zod — matches project pattern):

- `validateInsightAnalyticsSummary`
- `validateEvaluationsInsightDetail`
- `validateEvaluationsInsightListResponse`
- `validateEvaluationsAnalyticsSummaryResponse`

Frontend hook `useEvaluationsInsightsAnalytics` validates summary + list responses after fetch.

## Legacy compatibility

| Legacy | Replacement |
|--------|-------------|
| `EvaluationsSectionStatus` | `EvaluationsMetricStatus` |
| `EvaluationsInsightsSummary` (frontend) | `InsightAnalyticsSummary` |
| `EvaluationsInsightListItem` (frontend) | `EvaluationsInsightDetail` |
| `InsightEntityBreakdown` (DashboardInsightsContext) | `InsightGroupMemberPreview` (UI-only; not analytics entity breakdown) |
| `category` / `severity` query params | `riskCategory` / `insightStatus` |
| Flat `*Minor` money fields in summary | Kept; use `EvaluationsMoney` for new surfaces |

## Coupling strategy

- **Shared types** are dependency-free TypeScript interfaces — safe for frontend + backend.
- **Backend** implements shared interfaces in class-validator DTOs (query) and Swagger response DTOs.
- **Frontend** imports types from `@synq/evaluations-insights/*` via thin re-export file; no backend imports in UI.
- **No zod** — validation at HTTP boundary uses `class-validator`; response validation uses shared pure functions.

## Contract tests

```bash
cd backend && npm run test:insights:analytics
```

Includes `evaluations-analytics-contracts.shared.spec.ts` — detects schema drift via required-key anchors and validation failures.

## Related docs

- Filters: `docs/architecture/analytics/evaluations-filter-contract.md`
- Summary API: `docs/api/evaluations-analytics-summary-api.md`
- Tenant isolation: `docs/security/evaluations-tenant-isolation-audit.md`
