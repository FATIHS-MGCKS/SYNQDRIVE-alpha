# Auswertungen — Unified Metric Response Contract

**Status:** Active (Prompt 8/54)  
**Schema version:** `1.0.0` (`EVALUATIONS_METRIC_RESPONSE_SCHEMA_VERSION`)

## Purpose

Every KPI on the Auswertungen page must expose the same metadata envelope so UI, exports, and future APIs interpret availability, freshness, and errors consistently.

## Response shape

```typescript
interface EvaluationsMetricResponse {
  metricId: string;
  value: number | string | boolean | null;
  unit: EvaluationsMetricUnit;
  currency: string | null;
  status: EvaluationsMetricStatus;
  generatedAt: string;              // ISO-8601
  period: {
    preset: EvaluationsPeriodPreset | 'snapshot';
    periodStart: string;
    periodEndInclusive: string;
    timezone: string;
  };
  comparison: {
    type: 'none' | 'mom' | 'yoy' | 'prev_period';
    priorValue: number | null;
    deltaAbs: number | null;
    deltaPct: number | null;
    status: EvaluationsMetricStatus;
  } | null;
  dataCoverage: {
    ratio: number | null;
    rowsObserved: number | null;
    rowsExpected: number | null;
    missingSources: string[];
  } | null;
  sourceFreshness: {
    latestSourceAt: string | null;
    staleAfterMs: number | null;
    isStale: boolean;
    reason: string | null;
  } | null;
  calculationVersion: string;
  exclusions: string[];
  warnings: string[];
}
```

## Status semantics

| Status | `value` | Rules |
|--------|---------|-------|
| `AVAILABLE` | **Required** (may be `0`) | Full inputs; zero is a real measurement |
| `PARTIAL` | Required | `dataCoverage.missingSources.length > 0` OR `ratio < 1` |
| `STALE` | Required | `sourceFreshness.isStale === true` + non-empty `reason` + `latestSourceAt` |
| `UNAVAILABLE` | **`null` only** | Source missing / insufficient — not applicable to business context |
| `ERROR` | **`null` only** | Computation failed — never emit `0` as placeholder |
| `NOT_APPLICABLE` | **`null` only** | Metric irrelevant for tenant context (e.g. no EV fleet) |

### Critical rules

1. **`0` is a real value** for `AVAILABLE` / `PARTIAL` / `STALE` when the measurement is legitimately zero.
2. **`null` means no value** — UI shows `—` or status badge, not `€0`.
3. **`ERROR` and `UNAVAILABLE` must not use `0`** — validated by `assertValidEvaluationsMetricResponse`.
4. **`NOT_APPLICABLE` ≠ `UNAVAILABLE`** — N/A is contextual irrelevance; unavailable is missing/blocked data.

## Example responses

### AVAILABLE with zero revenue

```json
{
  "metricId": "fin.mtd_issued_revenue",
  "value": 0,
  "unit": "EUR_CENTS",
  "currency": "EUR",
  "status": "AVAILABLE",
  "generatedAt": "2026-06-16T12:00:00.000Z",
  "period": {
    "preset": "mtd",
    "periodStart": "2026-05-31T22:00:00.000Z",
    "periodEndInclusive": "2026-06-16T12:00:00.000Z",
    "timezone": "Europe/Berlin"
  },
  "comparison": {
    "type": "mom",
    "priorValue": 125000,
    "deltaAbs": -125000,
    "deltaPct": -100,
    "status": "AVAILABLE"
  },
  "dataCoverage": {
    "ratio": 1,
    "rowsObserved": 42,
    "rowsExpected": null,
    "missingSources": []
  },
  "sourceFreshness": {
    "latestSourceAt": "2026-06-16T11:55:00.000Z",
    "staleAfterMs": 86400000,
    "isStale": false,
    "reason": null
  },
  "calculationVersion": "1.0.0",
  "exclusions": ["revenue_excluded_statuses:DRAFT,CANCELLED,VOID,CREDITED"],
  "warnings": []
}
```

### ERROR — no fake zero

```json
{
  "metricId": "fin.mtd_issued_revenue",
  "value": null,
  "unit": "EUR_CENTS",
  "currency": "EUR",
  "status": "ERROR",
  "generatedAt": "2026-06-16T12:00:00.000Z",
  "period": { "preset": "mtd", "periodStart": "…", "periodEndInclusive": "…", "timezone": "Europe/Berlin" },
  "comparison": null,
  "dataCoverage": null,
  "sourceFreshness": null,
  "calculationVersion": "1.0.0",
  "exclusions": [],
  "warnings": ["Financial KPI computation failed"]
}
```

### PARTIAL — non-EUR rows excluded

```json
{
  "metricId": "fin.mtd_expenses",
  "value": 45000,
  "status": "PARTIAL",
  "dataCoverage": {
    "ratio": 0.95,
    "rowsObserved": 95,
    "rowsExpected": null,
    "missingSources": ["non_eur_currency_rows"]
  }
}
```

## Implementation map

| Layer | Path |
|-------|------|
| Contract | `shared/evaluations-metrics/evaluations-metric-response.contract.ts` |
| Builders | `shared/evaluations-metrics/evaluations-metric-response.builder.ts` |
| Validator | `shared/evaluations-metrics/evaluations-metric-response.validator.ts` |
| Legacy mapping | `shared/evaluations-metrics/evaluations-metric-response.legacy-map.ts` |
| Backend DTO | `backend/.../evaluations-metric-response.dto.ts` |
| Financial KPI service | `backend/.../evaluations-financial-kpi.service.ts` |
| Frontend re-export | `frontend/src/rental/lib/evaluations/evaluations-metric-response.ts` |

## Migrated endpoints

| Endpoint | Metrics |
|----------|---------|
| `GET /organizations/:orgId/evaluations/kpis/financial-mtd` | `fin.mtd_issued_revenue`, `fin.mtd_paid_revenue`, `fin.mtd_expenses`, `fin.mtd_net_result`, `fin.profit_margin_mtd`, `fin.open_receivables`, `fin.overdue_receivables` |

## Not yet migrated

| Endpoint / surface | Current shape | Planned |
|--------------------|---------------|---------|
| `GET /organizations/:orgId/invoices` (client aggregation) | Raw rows → FinancialInsightsView computes KPIs | Consume `financial-mtd` API |
| `GET /organizations/:orgId/dashboard-insights` | Insight DTOs without unified metric envelope | Wrap cockpit KPIs in Prompt 9+ |
| `GET /organizations/:orgId/invoices/stats` | Lifetime totals, no status | Deprecate or align |
| Business Pulse slices | `BusinessPulseSlice` rows | Map via `resolveLegacyMetricStatus` until API migration |
| Data Analyse telemetry KPIs | Diagnostic DTOs | Future domain bundle |

## Tests preventing error-as-zero

| Test | Assertion |
|------|-----------|
| `evaluations-metric-response.spec.ts` → ERROR rejects `value: 0` | `assertValidEvaluationsMetricResponse` throws |
| `evaluations-metric-response.spec.ts` → UNAVAILABLE rejects `value: 0` | Same |
| `evaluations-metric-response.spec.ts` → AVAILABLE allows `value: 0` | Passes validation |
| `evaluations-metric-response.test.ts` (frontend) | `isDisplayableMetricValue(ERROR)` is false; zero AVAILABLE is true |

Run:

```bash
cd backend && npm run test:evaluations
cd frontend && npm run test:evaluations
```

## Related docs

- [evaluations-metric-registry.md](./evaluations-metric-registry.md)
- [evaluations-calculation-versioning.md](./evaluations-calculation-versioning.md)
- [evaluations-timezone-period-model.md](./evaluations-timezone-period-model.md)
