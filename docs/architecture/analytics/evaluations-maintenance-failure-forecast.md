# Maintenance, Failure & Cost Risk Forecasts

Prompt 43/54 — conservative, explainable risk baselines for fleet operations.

## Scope

| Target | Output | Unit | Probability / impact |
|--------|--------|------|----------------------|
| **MAINTENANCE_COST** | Expected maintenance spend | `EUR_minor` | P50/P90 monthly median scaled to horizon |
| **UNPLANNED_FAILURE** | Fleet unplanned failure risk | `probability` | Separate `probabilityEstimate` + `impactEstimate` |
| **EXPECTED_DOWNTIME** | Rental-blocking downtime | `minutes` | `impactEstimate` = scheduled + trailing unplanned |
| **CAPACITY_RISK** | Operational headroom pressure | `score` (0–100) | Separate probability + expected blocked vehicles |
| **COST_RISK** | Upside cost exposure | `EUR_minor` | P50/P90 from maintenance baseline + open cases |

**Horizons:** 30 and 90 days (forward from `asOfDate`).

All API responses include `isRiskForecast: true` and `safetyBoundaries` disclaimers.

## Model type

v1 uses **transparent rule-based and statistical baselines only** — no ML tier.

| Target | Tier | Method |
|--------|------|--------|
| Maintenance cost | `STATISTICAL` (≥6 monthly buckets) or `RULE_BASED` fallback | Monthly median P50/P90 from `maintenance.cost_minor` feature series + scheduled case uplift |
| Unplanned failure | `RULE_BASED` | Historical unplanned rate + critical/warning health signals (tire, brake, DTC) |
| Expected downtime | `STATISTICAL` (≥90 days) or `RULE_BASED` | Scheduled downtime minutes + trailing daily average from `downtime.minutes` |
| Capacity risk | `RULE_BASED` | Health-blocked vehicles + scheduled service load / fleet size |
| Cost risk | `RULE_BASED` | Maintenance P50/P90 uplifted by critical health + open service cases |

## Features used

| Feature source | Used by |
|----------------|---------|
| `maintenance.cost_minor` (feature store) | Maintenance cost, cost risk |
| `downtime.minutes` (feature store) | Expected downtime |
| Service case history (`actualCostCents`, category, downtime, blocksRental) | All cost/downtime targets |
| Tire wear snapshots (`tireHealthSnapshot`) | Failure, capacity, cost risk |
| Brake condition snapshots (`brakeHealthSnapshot`) | Failure, capacity, cost risk |
| Active critical DTCs (`vehicleDtcEvent`, severity CRITICAL) | Failure, capacity, cost risk |
| Vehicle odometer / model year | Failure lineage |
| Service intervals (`nextServiceDueDate`) | Loader context only — **not** a failure driver |
| Telemetry freshness (`latestState.lastSeenAt`) | Loader context only — **offline excluded from failure** |
| Fleet vehicle count | Capacity normalization |
| Scheduled cases in horizon | Maintenance, downtime, capacity |

Battery health is reserved (`unknown` in v1 loader) until a stable module signal exists.

## Minimum data gates

| Target | Min history days | Min events | Min health coverage |
|--------|------------------|------------|---------------------|
| Maintenance cost | 90 | 10 costed service cases | — |
| Unplanned failure | — | 5 unplanned cases | 50% |
| Expected downtime | 60 | 3 downtime days | — |
| Capacity risk | — | — (≥3 vehicles) | — |
| Cost risk | inherits maintenance | inherits maintenance | — |

Below threshold → `INSUFFICIENT_DATA`, null point estimates, `suppressedReason` populated.

Additional failure gate: fleet must have ≥5 vehicles.

## Safety boundaries

Enforced in every forecast result (`safetyBoundaries`):

- `notForAutonomousSafetyDecisions: true` — estimates support planning only
- `telemetryOfflineExcludedFromFailure: true` — stale telemetry ≠ vehicle failure
- `serviceOverdueNotAutoFailure: true` — overdue service does not raise failure probability alone
- Human-readable disclaimer string

Probability and impact are **always separate fields** where both apply.

## Evaluation

Stored per forecast in `evaluationMetrics`:

| Field | Description |
|-------|-------------|
| `method` | Baseline method identifier |
| `holdoutDays` | 0 in v1 (rule baselines; no holdout calibration yet) |
| `mape` | null in v1 |
| `sampleSize` | Monthly buckets, unplanned cases, or series length |

`explainability` carries `topFactors`, `limitations`, and `inferenceTier`.

## Model versions

| Target | Version |
|--------|---------|
| Maintenance cost | `maintenance-cost-baseline-v1.0` |
| Unplanned failure | `unplanned-failure-baseline-v1.0` |
| Expected downtime | `expected-downtime-baseline-v1.0` |
| Capacity risk | `capacity-risk-baseline-v1.0` |
| Cost risk | `cost-risk-baseline-v1.0` |
| Platform | `risk-forecast-baseline-v1` |

Feature set: `feature-store-v1`.

## Storage

PostgreSQL:

- `org_predictive_risk_forecasts` — one row per `(org, riskKey, horizon, scope, asOfDate)`
- `org_predictive_risk_forecast_runs` — batch audit trail

TTL: forecasts expire after 3 days (`expiresAt`); refreshed nightly or via manual run.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/:orgId/business-insights/evaluations/predictive/risk-forecasts` | List risk forecasts |
| GET | `.../runs/latest` | Latest run metadata |
| POST | `.../run` | Run risk forecasts (requires prior feature build) |
| POST | `/admin/business-insights/predictive-risk-forecasts/run/:orgId` | Admin: feature build + risk run |

Query filters: `riskKey`, `horizonDays`, `asOfDate`, `scopeKey`.

## Jobs

`PredictiveForecastScheduler` — cron `15 3 * * *` (03:15 UTC daily):

1. Feature build (400-day lookback)
2. Operational forecasts (Prompt 42)
3. Risk forecasts (Prompt 43) — 5 targets × 2 horizons = 10 rows per org

## Architecture

```
Feature snapshots (Prompt 41)
        │
        ├─▶ Service cases, tire/brake/DTC health
        │
        ▼
PredictiveRiskLoader ──▶ MaintenanceRiskFleetInput
        │
        ▼
runAllMaintenanceRiskForecasts (shared, pure)
        │
        ▼
PredictiveRiskRepository.upsert
```

## Tests

### Shared (Vitest)

`shared/evaluations-insights/predictive/evaluations-maintenance-risk-forecast.shared.spec.ts`

- Unplanned category classification
- Service overdue / telemetry offline excluded from failure drivers
- Health coverage suppression
- Separate probability and impact
- P50/P90 for maintenance and cost risk
- Safety boundaries on every forecast
- Fleet size isolation for capacity risk

```bash
cd frontend && npx vitest run shared/evaluations-insights/predictive/evaluations-maintenance-risk-forecast.shared.spec.ts
```

### Backend (Jest)

`backend/src/modules/business-insights/predictive/predictive-risk.service.spec.ts`

- Five forecasts per horizon with safety metadata
- Org-scoped loader calls

```bash
cd backend && NODE_OPTIONS='--max-old-space-size=8192' npx jest src/modules/business-insights/predictive/predictive-risk.service.spec.ts --runInBand
```

## Known limitations

- **FLEET scope only** — no station/class segmentation in v1
- **EUR only** for cost targets
- **No calibrated per-vehicle failure model** — fleet-level rule score
- **Battery health** not yet wired
- **No ML tier** — requires separate backtest gate per Prompt 40 architecture
- **No UI** — API + storage only
- **Unplanned categories** — `REPAIR`, `DIAGNOSTIC`, `DAMAGE` only
- **Cost risk** is maintenance upside exposure, not liquidity or receivables forecast

## Related

- `docs/architecture/analytics/evaluations-feature-store.md` — feature materialization (Prompt 41)
- `docs/architecture/analytics/evaluations-demand-revenue-utilization-forecast.md` — operational baselines (Prompt 42)
- `docs/architecture/analytics/evaluations-predictive-analytics-architecture.md` — full predictive target architecture (Prompt 40)
