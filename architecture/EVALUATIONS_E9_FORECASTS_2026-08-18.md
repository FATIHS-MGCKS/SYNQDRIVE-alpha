# Evaluations E9 — Forecasts & Time-Series (2026-08-18)

## Changes

- E9A authority freeze (docs-only): forecast taxonomy, time-series inventory, historical salvage archaeology, empirical viability assessment, proposed forecast contract, backtest plan, quality fail-closed matrix, E9B/C/D topology.
- Machine artifact: `docs/audits/ci-recovery/data/e9a01-forecast-timeseries-viability-2026-08.json`
- Production read-only probe tooling prepared: `docs/audits/ci-recovery/tooling/e9a01_production_readonly_timeseries_remote.py` (SSH blocked in E9A run)
- **No runtime, Prisma, migration, or Production mutation**

## Architektur

### Role in Evaluations Recovery

E9 is the **canonical Forecast / Time-Series phase**. It extends E1–E7 authorities and is **independent of deferred E8 predictive risk runtime**.

| Phase | Purpose | E9A status |
|-------|---------|------------|
| E9A | Authority + empirical viability + contract freeze | ✅ COMPLETE |
| E9B | Canonical forecast backend + shared contract + backtesting | NOT_READY |
| E9C | Forecast frontend on `EvaluationsPage` | Blocked |
| E9D | Integrated acceptance | Blocked |
| E9D-DEFER | Final deferral acceptance | Candidate |

**E9A outcome:** `DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY` — authority defined, no MVP runtime target authorized.

---

### Forecast taxonomy (product language)

1. **Historical series** — observed canonical bucket values (`metricKind: OBSERVED`)
2. **Projection** — unvalidated deterministic extension (not labeled forecast)
3. **Baseline forecast** — holdout-validated algorithm (`metricKind: BASELINE_FORECAST`)
4. **Statistical forecast** — validated statistical model (`metricKind: STATISTICAL_FORECAST`)
5. **Scenario** — hypothetical user assumption (never future truth)

---

### E9 vs E8 boundary

```
E8: P(event in horizon) / risk category for FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION
E9: y(t+1..h) for continuous/count/money series (e.g. daily issued revenue)
```

Zero cross-import of `riskScore`, `eventProbability`, `estimatedExposure`, `confidenceScore`, or E8 predictive-risk endpoint outputs.

---

### Time-series inventory on main (canonical sources)

#### Served today (period scalars)

| ID | Authority | Time basis | Series today |
|----|-----------|------------|--------------|
| `fin.mtd_issued_revenue` | E3 | invoice business time | MTD scalar only |
| `fin.mtd_paid_revenue` | E3 | payment time | MTD scalar |
| `fin.mtd_expenses` | E3 | expense business time | MTD scalar |
| `fin.mtd_net_result` | E3 | derived | MTD scalar |
| `fin.profit_margin_mtd` | E3 | derived ratio | MTD scalar |
| `fin.open/overdue/total_receivables` | E3 | current snapshot | point-in-time |
| `ops.fleet_utilization_pct` | E4 | booking + ServiceCase intervals | period scalar |
| E4 cost sections | E4 | invoice / ServiceCase / damage events | period totals |

#### Registry / planned (not served)

| ID | Status |
|----|--------|
| `fin.daily_revenue_mtd` etc. | active_degraded — no backend owner |
| `fc.revenue_forecast_30d` | planned |
| `fc.utilization_forecast_30d` | planned |
| `fc.receivables_collection_forecast` | planned |
| `fc.maintenance_downtime_forecast` | planned |

#### Non-canonical (reject for E9)

| Source | Why |
|--------|-----|
| `FinancialInsightsView` daily chart | Client `/invoices` aggregation, browser TZ, EUR `/100` |
| `vehicle-forecast-engine.ts` | Vehicle maintenance planning, not org evaluations |
| Dashboard pulse MTD helpers | Legacy parallel path |

**Gap:** zero `GET …/series` or forecast endpoints with `{bucketStart, bucketEnd, value}[]`.

---

### Candidate targets (priority when data exists)

#### 1. `fin.daily_issued_revenue` (primary)

- **UNIT:** MONEY (`amountMinor` + `currency`)
- **GRAIN:** DAILY (org local calendar)
- **SCOPE:** ORGANIZATION_ONLY (E3 station fail-closed)
- **TIME_FIELD:** `COALESCE(invoiceDate, createdAt)` per E3 revenue business time
- **PIT:** closed invoice business timestamps
- **MONEY:** per-currency series; never sum mixed currencies

#### 2. `ops.fleet_utilization_pct` daily (secondary)

- **UNIT:** PERCENT (0–100, one decimal)
- **GRAIN:** DAILY
- **SCOPE:** ORGANIZATION_ONLY
- **Basis:** SCHEDULED occupancy (E4) — label PARTIAL when blocked unknown
- **Denominator:** fleet eligibility × 1440 min

---

### Observation & bucket authority

- **Timezone:** E1 `EvaluationsTimezoneContext` (org → station → platform fallback)
- **Bucket:** `[start, endExclusive)` local day boundaries
- **Closed bucket:** complete at local midnight endExclusive
- **Current partial day:** observed may be PARTIAL; **never** training/backtest complete bucket
- **Missing semantics:** NO_ACTIVITY_ZERO vs MISSING_DATA vs NOT_APPLICABLE — never coerce missing to zero

---

### Horizon & lookback (E9A freeze)

| Field | E9A value |
|-------|-----------|
| FORECAST_HORIZON | **NONE** (runtime deferred) |
| LOOKBACK | NOT_AUTHORIZED until empirical certification |
| Salvage reference gates (revalidate) | revenue 180d rule / 365d stat; utilization 14d / 60d |

No invented horizons. Future E9B must prove horizon via rolling-origin backtest before product exposure.

---

### Baseline methods (salvage + E9A freeze)

| Method | Use |
|--------|-----|
| LAST_OBSERVED_VALUE | Mandatory trivial baseline |
| SEASONAL_NAIVE (DOW) | Only if weekly seasonality empirically supported |
| MA(14) | Candidate baseline after holdout beats trivial |
| Trend / ML / LLM | Not authorized in E9A |

Negative count/money forecasts: clamp policy must be explicit before E9B; `INVALID_NEGATIVE_COUNT_FORECAST_COUNT=0` in authority.

---

### Backtest authority

- Rolling-origin walk-forward only
- `training_end < forecast_start` per fold
- Min 4 folds
- Metrics: MAE, RMSE, WAPE/MASE (no MAPE on zero denominators)
- `FORECAST_TARGET_LEAKAGE_COUNT=0`

---

### Forecast contract (proposed — not implemented)

```typescript
interface EvaluationsForecastResponse {
  schemaVersion: string;
  forecastContractVersion: string;
  calculationVersion: string;
  methodVersion: string;
  generatedAt: string;       // ISO UTC
  forecastAsOf: string;      // evaluation anchor
  scope: { organizationId: string; stationIds: null }; // org-only MVP
  target: string;              // e.g. fin.daily_issued_revenue
  unit: 'MONEY' | 'PERCENT' | 'COUNT';
  grain: 'DAY';
  horizon: { bucketCount: number } | null;
  historyPeriod: { start: string; endExclusive: string };
  forecastPeriod: { start: string; endExclusive: string } | null;
  status: EvaluationsMetricStatus; // AVAILABLE | PARTIAL | INSUFFICIENT_EVIDENCE | ...
  series: EvaluationsForecastSeriesPoint[];
  quality: EvaluationsQualityReport; // E5 subset
  provenance: EvaluationsProvenance;
  method: { tier: 'RULE_BASED' | 'STATISTICAL_BASELINE'; name: string };
  backtestSummary: BacktestSummary | null;
  interval: ForecastInterval | null; // NOT_AUTHORIZED in E9A
}

interface EvaluationsForecastSeriesPoint {
  bucketStart: string;
  bucketEnd: string;
  value: EvaluationsMoney | number | null;
  kind: 'OBSERVED' | 'FORECAST';
  status: EvaluationsMetricStatus;
}
```

**Client rule:** `CLIENT_FORECAST_BUSINESS_DERIVATION_COUNT=0` — no frontend moving averages or forecast recomputation.

---

### API proposal

```
GET /api/v1/organizations/:orgId/evaluations/analytics/insights/forecasts
  ?target=fin.daily_issued_revenue
  &forecastAsOf=2026-06-15T23:59:59Z
  &horizonDays=7
  &currency=EUR
```

Reuse existing evaluations analytics guard stack. No second tenant authority.

---

### UI placement (E9C — not implemented)

- Page: canonical `EvaluationsPage` / `financial-insights`
- Section: after Utilization or Finance block
- Chart: distinct styling for OBSERVED vs FORECAST; forecast start boundary marker
- Disclosure: target, method, as-of, history window, quality limitations
- No "AI prediction" decorative language

---

### Persistence

**E9_PERSISTENCE_DECISION: DERIVED_ON_READ**

Rationale: reproducibility from facts + method version; avoids Prisma churn; aligns with E7/E8 deferral pattern. Ephemeral cache optional in E9B.

---

### Data access plan (E9B)

| Target | Sources | Queries | Bucketing |
|--------|---------|---------|-----------|
| Daily issued revenue | `OrgInvoice` via E3 repository | 1–2 org-filtered aggregations | Server E1 day buckets |
| Daily utilization | `Booking`, `ServiceCase`, vehicle eligibility | 2–3 batch queries | Server interval overlap per day |

Expected series: ≤ 366 observed + horizon forward points. Tenant filter on all queries. No N+1 per vehicle.

---

### Salvage archaeology summary

| Branch | Verdict |
|--------|---------|
| feature-store-8427 | PORT_WITH_REWRITE — PIT feature extraction |
| baseline-forecasts-8427 | PORT_WITH_REWRITE — MA/seasonal engine (E9 only) |
| forecast-backtesting-8427 | PORT_TEST_ONLY — rolling backtest gates |
| predictive-analytics-architecture-8427 | REUSE_CONCEPT — tiers/lifecycle |
| maintenance-risk-forecast | REJECT — uncalibrated probabilities |

---

### Test matrix (E9B/C/D — 47 categories)

Tenant isolation, station isolation, RBAC, timezone/DST, daily/weekly/monthly boundaries, closed vs partial buckets, zero vs missing, insufficient history, future leakage, rolling-origin backtest, LAST_OBSERVED and seasonal baselines, zero-actual metrics, negative forecast clamp, money EUR/USD/JPY/KWD mixed currency, status AVAILABLE/PARTIAL/STALE/UNAVAILABLE/ERROR, quality limitations, determinism, versioning, observed vs forecast distinction, no E8 dependency, no LLM values, no frontend derivation, transport 403/404/5xx, responsive chart, accessibility, reduced motion, E7/E8 regression.

---

### Empirical viability (E9A)

- Production read-only probe: **blocked** (SSH)
- E8B0.1 cross-ref: 4 orgs, 9 vehicles, 0 ServiceCases
- **E9B NOT_READY** until bucket API + measured history ≥ salvage min gates

Evidence: `docs/audits/pr-recovery/phase3-e9a-forecast-authority-timeseries-baseline-2026-08.md`
