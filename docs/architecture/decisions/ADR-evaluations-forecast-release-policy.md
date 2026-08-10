# Evaluations Forecast Data and Release Policy

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-006`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

Forecasts require sufficient point-in-time data, backtesting, calibrated uncertainty and versioned release evidence.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance.

## Authority evidence

- `docs/architecture/analytics/evaluations-metric-registry.md — estimate/forecast kind separation`
- `docs/architecture/analytics/evaluations-calculation-versioning.md — formula and source provenance`
- `docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — forecast/backtesting absent from main`

## Decision

- A rule-based estimate, statistical forecast and ML forecast are distinct registered metric kinds and must be labeled as such.
- Demand/revenue/utilization release requires at least 90 elapsed days, 12 weekly cycles and 80% expected-source coverage. Maintenance/failure release requires at least 180 days plus the target-specific minimum labeled outcomes declared by the model registry; absent labels block release.
- Training uses point-in-time feature snapshots with no future leakage. At least three rolling-origin backtest folds are mandatory.
- A candidate must beat the approved naive baseline by at least 5% on the registered primary error metric, or document a domain-approved non-inferiority margin. Release confidence must be at least 0.70.
- Prediction intervals are mandatory. The registry declares a nominal coverage between 80% and 95%; rolling backtests must achieve empirical coverage within five percentage points of that target.
- Every result includes model/version, feature schema version, trained/fitted timestamp, forecast creation/as-of timestamps, horizon, confidence, prediction interval, coverage and data-quality status.
- Default retention is 24 months for forecast outputs and model metadata and 13 months for feature snapshots, capped by source/privacy retention. Longer retention requires a recorded legal/operational policy.
- Failed freshness, drift, coverage or release gates disable the forecast and return an explicit unavailable/degraded state; no fabricated fallback forecast is shown.

## Non-negotiable constraints

- Model promotion is immutable and auditable; rollback selects a previously approved version.
- Drift is evaluated at least per scheduled fit and weekly for active models.
- UI never renders a point forecast without uncertainty and release status.

## Impact

- Affected change-sets: `cs-evaluations-predictive-analytics-architecture`, `cs-evaluations-feature-store`, `cs-evaluations-demand-revenue-utilization-forecast`, `cs-evaluations-maintenance-failure-forecast`, `cs-evaluations-backtesting-drift`, `cs-evaluations-forecast-ux`
- Migration: Required: feature snapshots, forecasts, backtests and model-release metadata.
- Security/privacy: Critical privacy, tenant isolation and model-governance review.

## Consequences

- Historical cumulative branches are evidence only and are not integration authorities.
- Phase 3 reimplements or manually ports the decision on current main with the package gates.
- Any future exception requires a superseding ratified ADR and calculation/contract version update.

## Verification

- Architecture matrix consistency check.
- Package dependency and source-coverage validation.
- Required automated, security, migration and staging gates from the Phase-3 runbook.

## Open questions

None. Runtime activation remains gated by tests and release evidence, not by an unresolved architecture choice.
