# Auswertungen — Metric State UX (Prompt 28/54)

## Problem

Failed fetches and partial data were rendered as valid zeros (`?? 0`, `openReceivablesEur={0}` on invoice errors). Users could not distinguish:

- available data
- partial sources
- stale cache
- unavailable / permission / empty org
- hard errors
- not applicable metrics
- legitimate zero balances

## Solution

### Shared layer (`shared/evaluations-insights/`)

| Module | Role |
|--------|------|
| `evaluations-metric-state.contract.ts` | UX kinds, resolved state shape, export row type |
| `evaluations-metric-state.ts` | `resolveMetricFromEnvelope`, `resolveScalarMetricState`, CSV export |
| `evaluations-chart-series.ts` | Daily series with `null` gaps (`connectNulls={false}`) |

### UX kinds

| Kind | When | Display |
|------|------|---------|
| `available` | Section `OK`, value present | Formatted value |
| `partial` | Section `PARTIAL` | Value only if data exists; badge + tooltip |
| `stale` | `freshness.stale` or refetch overlay | Value dimmed + badge |
| `unavailable` | `UNAVAILABLE`, empty org, missing permission | `—`, no zero |
| `error` | `ERROR`, HTTP 500, timeout | `—`, critical tooltip |
| `not_applicable` | Context rule | `—` |
| `null_value` | `OK` + explicit zero (`zeroMeansNull`) | `0` with “Kein Wert” tooltip |

### Fetch phases

| Phase | UI |
|-------|-----|
| `loading` | Skeleton — **no** previous value |
| `refetching` | Previous value allowed with “Aktualisiere…” + stale ring |
| `failed` | Error state — **no** numeric fallback |
| `ready` | Resolved from envelope |

### Frontend components

- `EvaluationsMetricValue` — value, skeleton, tooltip, badge
- `EvaluationsMetricStateBadge` — short state label
- `EvaluationsMetricKpiCard` — Auswertungen cockpit KPI shell
- `useEvaluationsAnalyticsSummary` — canonical summary hook with section helpers

### Wiring

- **InsightsCockpit** — KPIs from `GET …/evaluations/analytics/summary` envelopes (`receivables`, `activeRisks`); never `openReceivablesEur={0}` on errors
- **FinancialInsightsView** — invoice KPIs use `resolveScalarMetricState`; charts use null gaps; CSV export includes `status`, `ux_kind`, `excluded`

## Tests

| Scenario | Coverage |
|----------|----------|
| API 500 | `evaluations-metric-state.spec.ts` — ERROR envelope |
| Timeout | `useEvaluationsAnalyticsSummary.test.ts` — rejected fetch |
| Partial source | PARTIAL envelope without data |
| Stale cache | `freshness.stale` → `stale` kind |
| True null | `zeroMeansNull` → `null_value` |
| Empty org | hook with `orgId: null` |
| Missing permission | `UNAVAILABLE` envelope |
| Chart gaps | `evaluations-chart-series.spec.ts` |

Run:

```bash
cd backend && npm run test:insights:analytics
cd frontend && npx vitest run src/rental/hooks/useEvaluationsAnalyticsSummary.test.ts src/rental/components/evaluations/EvaluationsMetricValue.test.tsx
```

## Export CSV columns

`section`, `metric`, `label`, `status`, `ux_kind`, `value`, `excluded`, `exclusion_reason`, `generated_at`, `error`

Failed receivables rows are `excluded=true` with `value=—` — never `0 EUR`.
