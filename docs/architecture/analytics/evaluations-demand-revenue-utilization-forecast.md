# Demand, Revenue & Utilization Baseline Forecasts

Prompt 42/54 — statistical/rule baselines for three core forecast targets.

## Scope

| Target | Variable | Unit | Revenue basis |
|--------|----------|------|-----------------|
| **DEMAND** | Booking starts per day | `count` (summed over horizon) | n/a |
| **REVENUE** | Issued outgoing invoices | `EUR_minor` (summed over horizon) | `revenue.invoice_issued_minor` only — **not** cash/payment receipts |
| **UTILIZATION** | Fleet utilization | `percent` (horizon average) | `utilization.percent` from feature store |

**Horizons:** 7, 30, 60, 90 days (forward from `asOfDate`).

Forecasts are explicitly marked `isForecast: true` in API responses and stored separately from observed KPIs.

## Methods

### Baseline ladder

1. **Moving average (14-day)** — `RULE_BASED` — always eligible when minimum history met
2. **Seasonal naive (day-of-week)** — `STATISTICAL` — requires ≥28 days train holdout
3. **Seasonal naive (calendar week)** — `STATISTICAL` — candidate when ≥90 days history

### Model selection

- Holdout: last `min(28, floor(history/4))` days
- Compare sMAPE across candidates
- Seasonal method used **only if** it beats moving average by ≥5% relative sMAPE
- Otherwise fallback to moving average (`FALLBACK` status when statistical tier downgraded due to short history)

### Uncertainty

- **P50:** `pointEstimate` (aggregated daily forecasts)
- **Interval:** residual std from holdout × 1.28 (≈80% PI), scaled by `√horizon` for sum targets
- **Rule:** no forecast without `intervalLow` / `intervalHigh`

## Minimum data

| Target | Suppress below | Rule-based | Statistical |
|--------|----------------|------------|-------------|
| Demand | 30 days | 30 days | 90 days |
| Revenue | 180 days | 180 days | 365 days |
| Utilization | 14 days | 14 days | 60 days |

Below suppress threshold → `INSUFFICIENT_HISTORY`, no point estimate surfaced (zeros stored with `suppressedReason`).

Feature snapshots must exist (`feature-store-v1`). Nightly job builds features (400-day lookback) then runs forecasts.

## Evaluation metrics

Stored per forecast in `evaluationMetrics`:

| Field | Description |
|-------|-------------|
| `mape` | Mean absolute percentage error on holdout |
| `smape` | Symmetric MAPE on holdout |
| `holdoutDays` | Holdout window length |
| `selectedMethod` | Winning method |
| `baselineMethod` | Always `moving_average` for comparison |
| `beatBaselineByPercent` | Relative improvement vs MA |

## Model versions

| Target | Version |
|--------|---------|
| Demand | `demand-baseline-v1.0` |
| Revenue | `revenue-baseline-v1.0` |
| Utilization | `utilization-baseline-v1.0` |
| Platform | `forecast-baseline-v1` |

## Storage

PostgreSQL:

- `org_predictive_forecasts` — one row per `(org, target, horizon, scope, asOfDate)`
- `org_predictive_forecast_runs` — batch audit trail

TTL: forecasts expire after 2 days (`expiresAt`); refreshed by nightly job or manual run.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/:orgId/business-insights/evaluations/predictive/forecasts` | List forecasts |
| GET | `.../runs/latest` | Latest run metadata |
| POST | `.../run` | Build features + run forecasts |
| POST | `/admin/business-insights/predictive-forecasts/run/:orgId` | Admin full pipeline |

## Jobs

`PredictiveForecastScheduler` — cron `15 3 * * *` (03:15 UTC daily):

1. Feature build (400-day lookback) per active org
2. Forecast run for all targets × horizons

Failures are logged per org; other orgs continue.

## Architecture

```
Feature snapshots (Prompt 41)
        │
        ▼
PredictiveForecastLoader ──▶ daily time series per target
        │
        ▼
runBaselineForecast (shared, pure)
        │
        ▼
PredictiveForecastRepository.upsert
```

## Tests

### Shared (Vitest)

`shared/evaluations-insights/predictive/evaluations-baseline-forecast.shared.spec.ts`

- Insufficient history suppression
- Uncertainty interval always present
- Revenue uses issued-invoice metadata only
- Utilization as percent average
- Reproducibility
- All horizons 7/30/60/90
- Org isolation via separate series

```bash
cd frontend && npx vitest run shared/evaluations-insights/predictive/evaluations-baseline-forecast.shared.spec.ts
```

### Backend (Jest)

`backend/src/modules/business-insights/predictive/predictive-forecast.service.spec.ts`

- 12 forecasts (3 targets × 4 horizons) with intervals
- Org-scoped loader calls
- Failed run handling

```bash
cd backend && npx jest src/modules/business-insights/predictive/predictive-forecast.service.spec.ts --runInBand
```

## Known limitations

- **FLEET scope only** in v1 — no station/class segmentation
- **EUR only** for revenue; multi-currency orgs need normalization (suppress if not EUR-normalized)
- **No ML tier** — statistical/rule baselines only; ML requires separate backtest gate (Prompt 40 architecture)
- **No UI** — API + storage only; production UI requires SHADOW/APPROVED lifecycle
- **Feature dependency** — forecasts quality bounded by feature snapshot coverage
- **Seasonality** — weekly pattern needs ≥90 days; annual patterns not modeled in v1
- **Utilization** — does not separately forecast booked-but-not-realized pipeline (rule-based upgrade deferred)

## Related

- `docs/architecture/analytics/evaluations-feature-store.md` — feature materialization (Prompt 41)
- `docs/architecture/analytics/evaluations-predictive-analytics-architecture.md` — full predictive target architecture (Prompt 40)
