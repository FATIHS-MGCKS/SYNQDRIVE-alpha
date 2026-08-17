# Phase 2.5 — Evaluations Integration Packages

Every Phase-3 package starts from the then-current `origin/main`, targets `main`, and is merged before the next package branch is created.

## E1 — Foundation & Contracts

- Order / risk: `1` / `CRITICAL`
- Dependencies: none
- Change-sets (6): `cs-evaluations-metric-registry-baseline`, `cs-evaluations-calculation-versioning-baseline`, `cs-evaluations-timezone-period-model`, `cs-evaluations-unified-kpi-contract`, `cs-evaluations-grouping-entity-references`, `cs-evaluations-analytics-contracts`
- Integration: `PORT_PATCH_MANUALLY`, `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `none`
- DB/migrations: 3; dry run required: `true`
- Tests: typecheck; shared contract tests; timezone/DST tests; tenant-scope tests
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.

## E2 — Money & Finance Correctness

- Order / risk: `2` / `CRITICAL`
- Dependencies: `E1`
- Change-sets (6): `cs-evaluations-money-domain`, `cs-evaluations-money-migration`, `cs-evaluations-receivables`, `cs-evaluations-revenue-cashflow-result`, `cs-evaluations-multi-currency`, `cs-evaluations-finance-test-suite`
- Integration: `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `none`
- DB/migrations: 2; dry run required: `true`
- Tests: money property tests; finance integration tests; migration dry run; multi-currency reconciliation
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.

## E3 — Analytics Backend

- Order / risk: `3` / `CRITICAL`
- Dependencies: `E1`, `E2`
- Change-sets (8): `cs-evaluations-summary-detail-separation`, `cs-evaluations-analytics-summary`, `cs-evaluations-filter-architecture`, `cs-evaluations-cost-model`, `cs-evaluations-utilization`, `cs-evaluations-strength-detection`, `cs-evaluations-weakness-detection`, `cs-evaluations-driver-influence-analysis`
- Integration: `PORT_PATCH_MANUALLY`, `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `EVALUATIONS_ANALYTICS_V2_MODE=off`
- DB/migrations: 2; dry run required: `true`
- Tests: repository tests; aggregation/pagination tests; large-dataset tests; tenant tests
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.

## E4 — Data Quality & Security

- Order / risk: `4` / `CRITICAL`
- Dependencies: `E1`, `E3`
- Change-sets (6): `cs-evaluations-tenant-isolation`, `cs-evaluations-data-quality`, `cs-evaluations-freshness-lineage`, `cs-evaluations-metric-state-ux`, `cs-evaluations-gdpr`, `cs-evaluations-roles-permissions`
- Integration: `PORT_PATCH_MANUALLY`, `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `none`
- DB/migrations: 0; dry run required: `false`
- Tests: cross-tenant negative tests; RBAC tests; data-quality/freshness tests; PII redaction tests
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.

## E5 — Core UI

- Order / risk: `5` / `HIGH`
- Dependencies: `E1`, `E2`, `E3`, `E4`
- Change-sets (7): `cs-evaluations-data-quality-panel`, `cs-evaluations-information-architecture`, `cs-evaluations-executive-kpi-strip`, `cs-evaluations-strength-weakness-cockpit`, `cs-evaluations-risk-cost-failure-visuals`, `cs-evaluations-mobile-readiness`, `cs-evaluations-accessibility-i18n`
- Integration: `PORT_PATCH_MANUALLY`, `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `VITE_EVALUATIONS_UI_V2=off`
- DB/migrations: 0; dry run required: `false`
- Tests: frontend typecheck; E2E; mobile/visual regression; accessibility/i18n
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.

## E6 — Recommendations & Actions

- Order / risk: `6` / `CRITICAL`
- Dependencies: `E3`, `E4`, `E5`
- Change-sets (5): `cs-evaluations-recommendation-domain`, `cs-evaluations-action-center`, `cs-evaluations-action-integrations`, `cs-evaluations-impact-measurement`, `cs-evaluations-audit-logging`
- Integration: `PORT_PATCH_MANUALLY`, `RECONSTRUCT_MERGE_RESULT`, `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `EVALUATIONS_RECOMMENDATIONS_MODE=off; EVALUATIONS_IMPACT_MEASUREMENT_ENABLED=false`
- DB/migrations: 3; dry run required: `true`
- Tests: state-machine tests; authorization/idempotency; audit outbox; workflow integration; side-effect safety
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.

## E7 — Predictive Backend

- Order / risk: `7` / `CRITICAL`
- Dependencies: `E1`, `E3`, `E4`
- Change-sets (5): `cs-evaluations-predictive-analytics-architecture`, `cs-evaluations-feature-store`, `cs-evaluations-demand-revenue-utilization-forecast`, `cs-evaluations-maintenance-failure-forecast`, `cs-evaluations-backtesting-drift`
- Integration: `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `EVALUATIONS_PREDICTIVE_MODE=off`
- DB/migrations: 5; dry run required: `true`
- Tests: point-in-time correctness; future-leakage tests; backtesting/baseline comparison; model release gates; tenant isolation
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.

## E8 — Forecast UI & Final Acceptance

- Order / risk: `8` / `HIGH`
- Dependencies: `E5`, `E7`
- Change-sets (1): `cs-evaluations-forecast-ux`
- Integration: `REIMPLEMENT_ON_CURRENT_MAIN`
- Feature flag: `VITE_EVALUATIONS_PREDICTIVE_MODE=off`
- DB/migrations: 0; dry run required: `false`
- Tests: full E2E; visual regression; staging smoke; observability verification; release-gate denial tests
- Entry gate: Fresh branch from current origin/main; all dependency packages merged and CI green.
- Exit gate: Build/typecheck/tests green; migration/security gates pass; package acceptance evidence recorded.
- Rollback: Disable package flags, roll forward schema when already migrated, and redeploy the prior application release; restore only from a rehearsed backup for irreversible data errors.
