# Forecast Backtesting, Quality & Drift Monitoring

Prompt 44/54 — reproducible backtesting and model oversight for predictive analytics.

## Scope

Backtesting and monitoring cover all Prompt 42/43 models:

| Family | Models | Horizons |
|--------|--------|----------|
| **FORECAST** | DEMAND, REVENUE, UTILIZATION | 7, 30, 60, 90 days |
| **RISK** (regression) | MAINTENANCE_COST, EXPECTED_DOWNTIME, COST_RISK | 30, 90 days |
| **RISK** (classification) | UNPLANNED_FAILURE, CAPACITY_RISK | 30, 90 days |

Results are **ORG_SPECIFIC** (tenant-scoped). Models are labeled `GLOBAL_SEGMENT` only when platform templates apply; v1 runs per-org fits.

## Backtesting method

### Rolling-origin evaluation

- **Origins:** weekly steps back over ~12 weeks (operational) or 8 weeks (risk)
- **Train window:** all observations ≤ origin date (PIT-safe via feature snapshots)
- **Holdout:** actual values in `(origin, origin + horizon]`
- **Minimum folds:** 4 — below → `INSUFFICIENT_DATA`, no release

### Baselines compared

| Model type | Challenger | Baseline |
|------------|------------|----------|
| Operational forecast | Selected method from `runBaselineForecast` | 14-day moving average scaled to horizon |
| Risk regression | P50 / point estimate | Trailing 90-day daily average × horizon |
| Risk classification | Rule-based probability | Fixed 0.5 threshold |

## Metrics

### Regression (operational + risk cost/downtime)

| Metric | When computed |
|--------|---------------|
| **MAE** | Always |
| **RMSE** | Always |
| **MAPE** | Only when actuals ≠ 0 |
| **sMAPE** | Always (primary gate for operational) |
| **Bias** | Mean signed error |
| **Bias %** | Bias / mean actual |
| **Prediction interval coverage (PIC)** | % actuals within `[intervalLow, intervalHigh]` |
| **Calibration error** | Mean normalized absolute error |
| **Beat baseline %** | Relative sMAPE improvement vs naive MA |

### Classification (failure, capacity risk)

| Metric | Description |
|--------|-------------|
| **Precision / Recall / F1** | At threshold 0.5 (configurable) |
| **False positives / False negatives** | Counts |
| **Brier score** | Probability calibration |
| **Calibration error** | Binned mean predicted vs observed rate |

## Release gates (Go/No-Go)

### Operational forecasts (`FORECAST`)

| Gate | Threshold |
|------|-----------|
| `min_folds` | ≥ 4 |
| `max_smape` | ≤ 25% |
| `max_mape` | ≤ 30% |
| `max_bias` | ±10% of mean actual |
| `min_interval_coverage` | ≥ 70% |
| `max_calibration_error` | ≤ 0.15 |
| `beat_baseline` | ≥ 0% relative sMAPE improvement |

### Risk models (`RISK`)

| Gate | Threshold |
|------|-----------|
| `min_folds` | ≥ 4 |
| `max_smape` | ≤ 40% |
| `max_mape` | ≤ 50% |
| `max_bias` | ±15% |
| `min_interval_coverage` | ≥ 60% |
| `min_precision` | ≥ 0.5 (classification) |
| `min_recall` | ≥ 0.4 (classification) |
| `max_brier` | ≤ 0.35 (classification) |

**Lifecycle:**

```
DRAFT → (gates pass) → SHADOW → (admin approve) → APPROVED
                              ↘ drift CRITICAL → ROLLED_BACK / DISABLED
```

Models **must not** be treated as production-ready until `APPROVED` and drift is not `CRITICAL`.

## Drift monitoring

Weekly job compares:

1. **Input drift** — 28-day recent vs prior 28-day feature means (`demand.*`, `revenue.*`, etc.)
2. **Error drift** — recent 4-week live MAE/sMAPE vs last backtest baseline

| Severity | Condition | Action |
|----------|-----------|--------|
| **STABLE** | Within thresholds | `NONE` |
| **WARNING** | Error ratio ≥ 1.5× or input shift ≥ 25% | Monitor only |
| **CRITICAL** | Error ratio ≥ 2.0× or input shift ≥ 50% | `FALLBACK` → `ROLLED_BACK` if was APPROVED |
| **CRITICAL+** | Error ratio ≥ 2.5× | `DISABLE` |

## Storage

| Table | Purpose |
|-------|---------|
| `org_predictive_model_registry` | Model version, status, gates, backtest metrics |
| `org_predictive_backtest_runs` | Batch audit trail |
| `org_predictive_backtest_results` | Per model × horizon results |
| `org_predictive_drift_snapshots` | Drift evaluations with recommended action |

Each result stores `modelVersion`, `evaluatedAt`, `metrics`, `baselineMetrics`, `releaseGates`, `gatesPassed`.

## Jobs

| Job | Cron (UTC) | Description |
|-----|------------|-------------|
| Weekly backtest | `30 3 * * 0` (Sun 03:30) | Rolling-origin backtest all models per active org |
| Weekly drift | `0 4 * * 1` (Mon 04:00) | Input + error drift check; auto rollback/disable |

Nightly forecast job (03:15) unchanged — continues producing forecasts; registry gates control approval.

## API

### Org-scoped (read + admin run)

| Method | Path | Description |
|--------|------|-------------|
| GET | `.../predictive/backtests/results` | List backtest results |
| GET | `.../predictive/backtests/registry` | Model registry status |
| GET | `.../predictive/backtests/drift` | Drift snapshots |
| GET | `.../predictive/backtests/runs/latest` | Latest backtest run |
| POST | `.../predictive/backtests/run` | Run backtests (ORG_ADMIN) |
| POST | `.../predictive/backtests/drift-check` | Run drift check (ORG_ADMIN) |

### Master admin diagnostics

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/business-insights/predictive-backtests/run/:orgId` | Run backtests |
| POST | `/admin/business-insights/predictive-backtests/drift-check/:orgId` | Drift check |
| POST | `/admin/business-insights/predictive-backtests/approve/:orgId` | Promote to APPROVED (gates required) |
| GET | `/admin/business-insights/predictive-backtests/diagnostics/:orgId` | Combined diagnostics view |

## Architecture

```
Feature snapshots + forecast/risk engines
        │
        ▼
PredictiveBacktestLoader (historical folds)
        │
        ▼
runOperationalForecastBacktest / runRisk*Backtest (shared)
        │
        ▼
Release gate evaluation → Model registry upsert
        │
        ▼
Weekly drift monitor → auto ROLLED_BACK / DISABLE
```

## Tests

### Shared (Vitest)

`shared/evaluations-insights/predictive/evaluations-backtest.shared.spec.ts`

- Rolling-origin operational backtest with metrics
- Insufficient data suppression
- Risk regression with baseline comparison
- Classification precision/recall/FP/FN
- Drift severity and rollback behavior

```bash
cd frontend && npx vitest run shared/evaluations-insights/predictive/evaluations-backtest.shared.spec.ts
```

### Backend (Jest)

`backend/src/modules/business-insights/predictive/predictive-backtest.service.spec.ts`

- Multi-model backtest run per org
- Approval gate enforcement
- Approved + drift status checks

```bash
cd backend && NODE_OPTIONS='--max-old-space-size=8192' npx jest src/modules/business-insights/predictive/predictive-backtest.service.spec.ts --runInBand
```

## Known limitations

- Risk classification actuals use service-case outcomes — not per-vehicle labeled failures
- Drift monitoring v1 covers operational FORECAST targets only (risk drift deferred)
- No cross-org pooled models — all evaluations tenant-scoped
- `APPROVED` requires explicit admin action after gates pass
- UI diagnostics via API only — no Master Admin visual dashboard in v1

## Related

- `docs/architecture/analytics/evaluations-predictive-analytics-architecture.md` — target architecture (Prompt 40)
- `docs/architecture/analytics/evaluations-demand-revenue-utilization-forecast.md` — operational baselines (Prompt 42)
- `docs/architecture/analytics/evaluations-maintenance-failure-forecast.md` — risk baselines (Prompt 43)
