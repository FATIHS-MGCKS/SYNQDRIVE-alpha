# Phase 2.6 — Evaluations Phase-3 Runbook

This is the Phase-3 recovery authority and supersedes the Phase-2.5 package order without deleting prior audit evidence.

## Branch policy

For every package: `git fetch origin`, create only that package branch from then-current `origin/main`, target `main`, merge only after its gate, then delete no historical branch in this phase. Never stack recovery PRs.

## 1. E1 — Metric, Time & KPI Contracts

- Planned branch: `integration/evaluations-e1-metric-time-and-kpi-contracts-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-metric-registry-baseline`, `cs-evaluations-calculation-versioning-baseline`, `cs-evaluations-timezone-period-model`, `cs-evaluations-unified-kpi-contract`
- Source PRs: #752, #754, #755
- Source commits: `312ee93f5315af7c8a4474a5014976a68584a7c6`, `59cbd9f1f8f2e5f55601b5f2385f9fc5701c49b2`, `850b20bc632e514acba32e05e38b92c864840779`, `f23e6bdab173c9e4705f56316737a2497d147ae1`
- Implementation: ALREADY_IN_MAIN_NO_ACTION, REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: None.
- Tests: shared contract tests; timezone/DST boundary tests; calculation provenance regression
- Staging: required; VPS: not in this package.
- Entry gate: Fresh current main; preserve the two already-main registry/versioning baselines.
- Exit/merge gate: Contract-only foundation compiles; DST/provenance tests pass; no new controller or protected route is exposed before E2.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `none`

<details><summary>Phase-3 implementation file scope</summary>

- `backend/package.json`
- `backend/src/modules/evaluations-metrics/evaluations-financial-kpi.service.ts`
- `backend/src/modules/evaluations-metrics/evaluations-kpi.controller.ts`
- `backend/src/modules/evaluations-metrics/evaluations-metric-response.dto.ts`
- `backend/src/modules/evaluations-metrics/evaluations-metric-response.spec.ts`
- `backend/src/modules/evaluations-metrics/evaluations-metric.module.ts`
- `backend/src/modules/evaluations-metrics/evaluations-period.controller.ts`
- `backend/src/modules/evaluations-metrics/evaluations-period.resolver.spec.ts`
- `backend/src/modules/evaluations-metrics/evaluations-period.resolver.ts`
- `backend/src/modules/evaluations-metrics/evaluations-period.service.ts`
- `backend/src/modules/evaluations-metrics/financial-kpi.logic.ts`
- `backend/tsconfig.json`
- `docs/architecture/analytics/evaluations-metric-response-contract.md`
- `docs/architecture/analytics/evaluations-timezone-period-model.md`
- `frontend/src/lib/api.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.ts`
- `frontend/src/rental/components/dashboard/useDashboardViewModel.ts`
- `frontend/src/rental/lib/evaluations/evaluations-metric-response.test.ts`
- `frontend/src/rental/lib/evaluations/evaluations-metric-response.ts`
- `frontend/src/rental/lib/evaluations/evaluations-period.client.test.ts`
- `frontend/src/rental/lib/evaluations/evaluations-period.client.ts`
- `frontend/src/rental/lib/evaluations/useEvaluationsReportingPeriods.ts`
- `frontend/tsconfig.app.json`
- `frontend/vite.config.ts`
- `frontend/vitest.config.ts`
- `shared/evaluations-metrics/evaluations-metric-response.builder.ts`
- `shared/evaluations-metrics/evaluations-metric-response.contract.ts`
- `shared/evaluations-metrics/evaluations-metric-response.legacy-map.ts`
- `shared/evaluations-metrics/evaluations-metric-response.validator.ts`
- `shared/evaluations-periods/evaluations-period.contract.ts`
- `shared/evaluations-periods/evaluations-zoned-date.ts`

</details>

## 2. E2 — Tenant-Safe Analytics Foundation

- Planned branch: `integration/evaluations-e2-tenant-safe-analytics-foundation-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-grouping-entity-references`, `cs-evaluations-filter-architecture`, `cs-evaluations-analytics-contracts`, `cs-evaluations-tenant-isolation`, `cs-evaluations-summary-detail-separation`
- Source PRs: #767, #770, #774, #776, #778
- Source commits: `1724bd92bf8e4dfab742767ded38fbc18dabb19e`, `26e4532201c94ddf0f72d17c324b42add7dec9cc`, `515cd44e5b4beac30ffe8b9d63f3d941a9fb578b`, `642a210403b63cb719af7566f2019c76044933aa`, `da79b28aa4ad0d84202d332c1f20e10cad8f06dd`
- Implementation: PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: `backend/prisma/migrations/20260724100000_dashboard_insights_analytics_index/migration.sql`, `backend/prisma/migrations/20260724110000_dashboard_insights_entity_references/migration.sql`, `backend/prisma/schema.prisma`
- Tests: contract tests; migration dry run; cross-tenant/station negative tests; RBAC guard tests
- Staging: required; VPS: not in this package.
- Entry gate: E1 merged; normalized entity-reference and tenant-scope design reviewed before schema work.
- Exit/merge gate: Contracts, entity persistence and APIs are organization/station scoped; cross-tenant tests fail closed.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `EVALUATIONS_ANALYTICS_V2_MODE=off`

### Capability ownership notes

- Reimplement entity-reference contracts, persistence and grouping before wiring them into the E2 summary/detail service; do not replay the historical grouping commit as a standalone patch.
- Bind filter period resolution to the E1 canonical period resolver. Analytics-summary services, repositories and shared summary implementations are owned by E4.

<details><summary>Phase-3 implementation file scope</summary>

- `backend/package.json`
- `backend/prisma/migrations/20260724100000_dashboard_insights_analytics_index/migration.sql`
- `backend/prisma/migrations/20260724110000_dashboard_insights_entity_references/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/src/modules/business-insights/business-insights.module.ts`
- `backend/src/modules/business-insights/business-insights.service.ts`
- `backend/src/modules/business-insights/business-insights.spec.ts`
- `backend/src/modules/business-insights/dashboard-insights-analytics.service.spec.ts`
- `backend/src/modules/business-insights/dashboard-insights-analytics.service.ts`
- `backend/src/modules/business-insights/dashboard-insights.controller.ts`
- `backend/src/modules/business-insights/dashboard-insights.repository.ts`
- `backend/src/modules/business-insights/detectors/tight-handover.detector.ts`
- `backend/src/modules/business-insights/dto/evaluations-analytics-filters.dto.ts`
- `backend/src/modules/business-insights/dto/evaluations-analytics-query.dto.ts`
- `backend/src/modules/business-insights/dto/evaluations-analytics-response.dto.ts`
- `backend/src/modules/business-insights/dto/insight-analytics-query.dto.ts`
- `backend/src/modules/business-insights/evaluations-analytics-contracts.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-analytics-filter.service.spec.ts`
- `backend/src/modules/business-insights/evaluations-analytics-filter.service.ts`
- `backend/src/modules/business-insights/evaluations-analytics-filters.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-analytics.controller.ts`
- `backend/src/modules/business-insights/evaluations-insights.controller.ts`
- `backend/src/modules/business-insights/evaluations-tenant-isolation.security.spec.ts`
- `backend/src/modules/business-insights/insight-entity-reference.util.ts`
- `backend/src/modules/business-insights/insight-entity-references.shared.spec.ts`
- `backend/src/modules/business-insights/insight-grouping.service.ts`
- `backend/src/modules/business-insights/insight.types.ts`
- `backend/src/modules/business-insights/insights-analytics.shared.spec.ts`
- `backend/src/modules/business-insights/internal-business-insights.controller.ts`
- `backend/src/modules/business-insights/notification-engine.characterization.spec.ts`
- `backend/src/shared/stations/station-access.service.ts`
- `backend/tsconfig.json`
- `docs/api/evaluations-analytics-contracts.md`
- `docs/architecture/analytics/evaluations-filter-contract.md`
- `docs/architecture/analytics/evaluations-insight-grouping-model.md`
- `docs/architecture/analytics/evaluations-summary-detail-separation.md`
- `docs/security/evaluations-tenant-isolation-audit.md`
- `frontend/src/lib/api.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/rental/DashboardInsightsContext.tsx`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/insights/EvaluationsAnalyticsFilterBar.tsx`
- `frontend/src/rental/components/insights/InsightsCockpit.tsx`
- `frontend/src/rental/hooks/useEvaluationsAnalyticsFilters.ts`
- `frontend/src/rental/hooks/useEvaluationsInsightsAnalytics.ts`
- `frontend/src/rental/lib/evaluations-analytics-api.types.ts`
- `frontend/src/rental/lib/insights-categories.ts`
- `frontend/tsconfig.app.json`
- `frontend/vite.config.ts`
- `shared/evaluations-insights/evaluations-analytics-contract-validation.ts`
- `shared/evaluations-insights/evaluations-analytics-contracts.index.ts`
- `shared/evaluations-insights/evaluations-analytics-contracts.spec.ts`
- `shared/evaluations-insights/evaluations-analytics-filters.contract.ts`
- `shared/evaluations-insights/evaluations-analytics-filters.spec.ts`
- `shared/evaluations-insights/evaluations-analytics-filters.ts`
- `shared/evaluations-insights/evaluations-analytics-primitives.contract.ts`
- `shared/evaluations-insights/evaluations-insight-detail.contract.ts`
- `shared/evaluations-insights/insight-entity-references.contract.ts`
- `shared/evaluations-insights/insight-entity-references.ts`
- `shared/evaluations-insights/insights-analytics.contract.ts`
- `shared/evaluations-insights/insights-analytics.ts`

</details>

<details><summary>Historical file overlap deferred to its owning package</summary>

- `backend/src/modules/business-insights/evaluations-analytics-summary.integration.spec.ts` → `E4`; do not port in `E2`.
- `backend/src/modules/business-insights/evaluations-analytics-summary.repository.ts` → `E4`; do not port in `E2`.
- `backend/src/modules/business-insights/evaluations-analytics-summary.service.spec.ts` → `E4`; do not port in `E2`.
- `backend/src/modules/business-insights/evaluations-analytics-summary.service.ts` → `E4`; do not port in `E2`.
- `shared/evaluations-insights/evaluations-analytics-summary.contract.ts` → `E4`; do not port in `E2`.
- `shared/evaluations-insights/evaluations-analytics-summary.ts` → `E4`; do not port in `E2`.

</details>

## 3. E3 — Money & Finance Correctness

- Planned branch: `integration/evaluations-e3-money-and-finance-correctness-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-money-domain`, `cs-evaluations-money-migration`, `cs-evaluations-receivables`, `cs-evaluations-revenue-cashflow-result`, `cs-evaluations-multi-currency`, `cs-evaluations-finance-test-suite`
- Source PRs: #756, #757, #760, #762, #765
- Source commits: `077ba5060251eaa4fae983249822be68b6b00293`, `7ab6d01dac0cf6a979c321327b03289ed31afe92`, `d966961c2dc9d6690f5ea21d32d8360b77c0ab1c`, `de17de779d1c3a5de9358268ecbc50da98270849`, `e340795d2f22198c867401becfa99217c321c0f5`, `efb3abc5feda78818a04849b19d24226c8396282`
- Implementation: REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: `backend/scripts/ops/backfill-evaluations-insight-money-metrics.ts`, `backend/src/shared/money/money-insight-migration.spec.ts`, `docs/migrations/evaluations-money-migration.md`
- Tests: money property tests; finance integration tests; migration/backfill dry run; multi-currency reconciliation
- Staging: required; VPS: not in this package.
- Entry gate: E2 tenant-safe contract surface merged; EVAL-ADR-001 migration design approved.
- Exit/merge gate: Money/FX/receivable calculations reconcile; migration dry run and finance property tests pass.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `EVALUATIONS_ANALYTICS_V2_MODE=off`

<details><summary>Phase-3 implementation file scope</summary>

- `backend/package-lock.json`
- `backend/package.json`
- `backend/scripts/ops/backfill-evaluations-insight-money-metrics.ts`
- `backend/src/modules/business-insights/detectors/low-utilization.detector.ts`
- `backend/src/modules/business-insights/financial-insights.logic.spec.ts`
- `backend/src/modules/business-insights/insight-grouping.service.ts`
- `backend/src/modules/business-insights/insight-health-gate.spec.ts`
- `backend/src/modules/business-insights/insight-health-gate.ts`
- `backend/src/modules/business-insights/insight-ranking.service.ts`
- `backend/src/modules/evaluations-metrics/evaluations-calculation-provenance.spec.ts`
- `backend/src/modules/evaluations-metrics/evaluations-finance-periods.spec.ts`
- `backend/src/modules/evaluations-metrics/evaluations-financial-kpi.harness.ts`
- `backend/src/modules/evaluations-metrics/evaluations-financial-kpi.integration.spec.ts`
- `backend/src/modules/evaluations-metrics/evaluations-financial-kpi.service.ts`
- `backend/src/modules/evaluations-metrics/evaluations-fx-rate.service.spec.ts`
- `backend/src/modules/evaluations-metrics/evaluations-fx-rate.service.ts`
- `backend/src/modules/evaluations-metrics/evaluations-kpi.controller.characterization.spec.ts`
- `backend/src/modules/evaluations-metrics/evaluations-metric.definitions.ts`
- `backend/src/modules/evaluations-metrics/evaluations-metric.module.ts`
- `backend/src/modules/evaluations-metrics/financial-kpi.logic.spec.ts`
- `backend/src/modules/evaluations-metrics/financial-kpi.logic.ts`
- `backend/src/shared/evaluations-finance-golden.spec.ts`
- `backend/src/shared/finance/index.ts`
- `backend/src/shared/finance/revenue-cashflow-contribution.spec.ts`
- `backend/src/shared/fx/fx.org-reporting-currency.spec.ts`
- `backend/src/shared/fx/index.ts`
- `backend/src/shared/fx/multi-currency-analytics.spec.ts`
- `backend/src/shared/money/index.ts`
- `backend/src/shared/money/money-domain.properties.spec.ts`
- `backend/src/shared/money/money-domain.spec.ts`
- `backend/src/shared/money/money-insight-migration.spec.ts`
- `backend/src/shared/receivables/index.ts`
- `backend/src/shared/receivables/receivables-analytics.spec.ts`
- `backend/tsconfig.json`
- `docs/architecture/finance/money-domain-model.md`
- `docs/architecture/finance/multi-currency-analytics.md`
- `docs/architecture/finance/receivables-analytics.md`
- `docs/architecture/finance/revenue-cashflow-contribution-model.md`
- `docs/audits/evaluations/evaluations-finance-test-report-2026-07.md`
- `docs/migrations/evaluations-money-migration.md`
- `frontend/src/lib/money.test.ts`
- `frontend/src/lib/money.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.test.ts`
- `frontend/src/rental/components/dashboard/runtime/businessPulseSliceBuilder.ts`
- `frontend/src/rental/components/dashboard/useDashboardViewModel.ts`
- `frontend/src/rental/components/finance/FinanceMetricHint.tsx`
- `frontend/src/rental/components/finance/MultiCurrencySummary.tsx`
- `frontend/src/rental/components/insights/InsightsCockpit.tsx`
- `frontend/src/rental/lib/evaluations/evaluations-finance-golden-fixtures.ts`
- `frontend/src/rental/lib/evaluations/evaluations-financial-mtd.contract.test.ts`
- `frontend/src/rental/lib/evaluations/evaluations-metric-response.ts`
- `frontend/src/rental/lib/evaluations/evaluations-money.ts`
- `frontend/src/rental/lib/evaluations/evaluations-test-fixtures.ts`
- `frontend/src/rental/lib/evaluations/financial-insights-golden.characterization.test.ts`
- `frontend/src/rental/lib/evaluations/financial-insights-scenarios.characterization.test.ts`
- `frontend/src/rental/lib/evaluations/insights-categories.characterization.test.ts`
- `frontend/src/rental/lib/evaluations/insights-cockpit-kpi.characterization.test.ts`
- `frontend/src/rental/lib/financial-insights.logic.ts`
- `frontend/src/rental/lib/insights-categories.ts`
- `frontend/tsconfig.app.json`
- `frontend/vite.config.ts`
- `frontend/vitest.config.ts`
- `scripts/test/evaluations-verify.sh`
- `shared/evaluations-fixtures/finance-golden-organizations.ts`
- `shared/evaluations-metrics/evaluations-metric.i18n.ts`
- `shared/evaluations-metrics/evaluations-metric.legacy-map.ts`
- `shared/finance/finance-metric-definitions.ts`
- `shared/finance/revenue-cashflow-contribution.contract.ts`
- `shared/finance/revenue-cashflow-contribution.ts`
- `shared/fx/fx.analytics-resolver.ts`
- `shared/fx/fx.contract.ts`
- `shared/fx/fx.convert.ts`
- `shared/fx/fx.org-reporting-currency.ts`
- `shared/fx/fx.provider.ts`
- `shared/fx/index.ts`
- `shared/fx/multi-currency-definitions.ts`
- `shared/money/currency-decimals.ts`
- `shared/money/money-insight-metrics.ts`
- `shared/money/money.contract.ts`
- `shared/money/money.format.ts`
- `shared/money/money.legacy-insight.ts`
- `shared/money/money.util.ts`
- `shared/receivables/receivables-analytics.ts`
- `shared/receivables/receivables-invoice.contract.ts`
- `shared/receivables/receivables-zoned-due.ts`

</details>

## 4. E4 — Tenant-Safe Analytics Backend

- Planned branch: `integration/evaluations-e4-tenant-safe-analytics-backend-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-analytics-summary`, `cs-evaluations-cost-model`, `cs-evaluations-utilization`, `cs-evaluations-strength-detection`, `cs-evaluations-weakness-detection`, `cs-evaluations-driver-influence-analysis`
- Source PRs: #773, #780, #782, #783, #784, #786
- Source commits: `32714750f7f197c5a8e4b9bb304011ca2444a05d`, `46f533afc431d9c68a4486133313e4f5d7888de0`, `56b9efe22b059cedf5aff64188922aef6e10ba37`, `d96ba7a8c6379e533ca17f2f3c77b46bbeb6ee43`, `e65b88dbefb34b99d6c9520a6d785f571a8f33e6`, `f5cfe0c5cda1bef260dca6a0417977701530210e`
- Implementation: PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: None.
- Tests: repository/aggregation tests; pagination and large-dataset tests; tenant negative tests; contract compatibility tests
- Staging: required; VPS: not in this package.
- Entry gate: E2 contracts/security and E3 canonical finance semantics merged.
- Exit/merge gate: All analytics services use canonical contracts and tenant filters; aggregation and scale tests pass.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `EVALUATIONS_ANALYTICS_V2_MODE=off`

### Capability ownership notes

- Own the analytics-summary service/repository and shared summary implementation; consume E2 tenant-safe contracts and E1 period semantics.

<details><summary>Phase-3 implementation file scope</summary>

- `backend/package.json`
- `backend/src/modules/business-insights/business-insights.module.ts`
- `backend/src/modules/business-insights/dto/evaluations-analytics-query.dto.ts`
- `backend/src/modules/business-insights/dto/evaluations-analytics-response.dto.ts`
- `backend/src/modules/business-insights/evaluations-analytics-summary.characterization.spec.ts`
- `backend/src/modules/business-insights/evaluations-analytics-summary.integration.spec.ts`
- `backend/src/modules/business-insights/evaluations-analytics-summary.repository.ts`
- `backend/src/modules/business-insights/evaluations-analytics-summary.service.spec.ts`
- `backend/src/modules/business-insights/evaluations-analytics-summary.service.ts`
- `backend/src/modules/business-insights/evaluations-analytics-summary.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-analytics.controller.ts`
- `backend/src/modules/business-insights/evaluations-cost-model.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-driver-analysis.service.ts`
- `backend/src/modules/business-insights/evaluations-driver-analysis.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-strength-detection.service.ts`
- `backend/src/modules/business-insights/evaluations-strength-detection.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-utilization-model.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-utilization-snapshot.service.ts`
- `backend/src/modules/business-insights/evaluations-weakness-detection.service.ts`
- `backend/src/modules/business-insights/evaluations-weakness-detection.shared.spec.ts`
- `backend/src/modules/vehicles/vehicles.service.ts`
- `docs/api/evaluations-analytics-summary-api.md`
- `docs/architecture/analytics/evaluations-cost-model.md`
- `docs/architecture/analytics/evaluations-driver-analysis.md`
- `docs/architecture/analytics/evaluations-strength-detection.md`
- `docs/architecture/analytics/evaluations-utilization-model.md`
- `docs/architecture/analytics/evaluations-weakness-detection.md`
- `frontend/src/lib/api.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `shared/evaluations-insights/evaluations-analytics-contract-validation.ts`
- `shared/evaluations-insights/evaluations-analytics-contracts.index.ts`
- `shared/evaluations-insights/evaluations-analytics-contracts.spec.ts`
- `shared/evaluations-insights/evaluations-analytics-summary.contract.ts`
- `shared/evaluations-insights/evaluations-analytics-summary.spec.ts`
- `shared/evaluations-insights/evaluations-analytics-summary.ts`
- `shared/evaluations-insights/evaluations-cost-model.contract.ts`
- `shared/evaluations-insights/evaluations-cost-model.spec.ts`
- `shared/evaluations-insights/evaluations-cost-model.ts`
- `shared/evaluations-insights/evaluations-driver-analysis.contract.ts`
- `shared/evaluations-insights/evaluations-driver-analysis.spec.ts`
- `shared/evaluations-insights/evaluations-driver-analysis.ts`
- `shared/evaluations-insights/evaluations-strength-detection.contract.ts`
- `shared/evaluations-insights/evaluations-strength-detection.spec.ts`
- `shared/evaluations-insights/evaluations-strength-detection.ts`
- `shared/evaluations-insights/evaluations-utilization-intervals.ts`
- `shared/evaluations-insights/evaluations-utilization-model.contract.ts`
- `shared/evaluations-insights/evaluations-utilization-model.spec.ts`
- `shared/evaluations-insights/evaluations-utilization-model.ts`
- `shared/evaluations-insights/evaluations-weakness-detection.contract.ts`
- `shared/evaluations-insights/evaluations-weakness-detection.spec.ts`
- `shared/evaluations-insights/evaluations-weakness-detection.ts`
- `shared/evaluations-insights/insights-analytics.contract.ts`
- `shared/evaluations-insights/insights-analytics.ts`

</details>

## 5. E5 — Quality, Privacy, Authorization & Audit

- Planned branch: `integration/evaluations-e5-quality-privacy-authorization-and-audit-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-data-quality`, `cs-evaluations-freshness-lineage`, `cs-evaluations-metric-state-ux`, `cs-evaluations-gdpr`, `cs-evaluations-roles-permissions`, `cs-evaluations-audit-logging`
- Source PRs: #788, #790, #792, #815, #816, #817
- Source commits: `2c32183956d3aa4ce56cd3ce4b02f33bcb3dc9b4`, `549c0e237d862eee491943b87077d3ce931ae8a8`, `5de5e0295658ae3e23f4025e9c316b54193d2872`, `c82e449362177a4c9d30ae308558464a2ab934f4`, `c8714b1f9e9760b29a282a294412bf9ebe31cec2`, `d10d072efce62980e7732d086dd8f6f8f1e2f875`
- Implementation: PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: None.
- Tests: data quality/freshness tests; RBAC matrix tests; PII redaction tests; durable audit outbox tests
- Staging: required; VPS: not in this package.
- Entry gate: E4 backend merged; central RBAC and business-audit extension plan approved.
- Exit/merge gate: Quality/freshness, permissions, privacy and sensitive-read audit gates pass with no PII leakage.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `EVALUATIONS_ANALYTICS_V2_MODE=off`

### Capability ownership notes

- Add reusable authorization and audit foundations only; concrete analytics-summary files remain E4-owned and predictive backend/shared files remain E8-owned.

<details><summary>Phase-3 implementation file scope</summary>

- `backend/package.json`
- `backend/src/modules/business-audit/business-audit-outbox.processor.ts`
- `backend/src/modules/business-audit/business-audit.constants.ts`
- `backend/src/modules/business-insights/access/evaluations-access.service.ts`
- `backend/src/modules/business-insights/access/evaluations-audit-request.util.spec.ts`
- `backend/src/modules/business-insights/access/evaluations-audit-request.util.ts`
- `backend/src/modules/business-insights/access/evaluations-audit.constants.ts`
- `backend/src/modules/business-insights/access/evaluations-audit.service.spec.ts`
- `backend/src/modules/business-insights/access/evaluations-audit.service.ts`
- `backend/src/modules/business-insights/access/evaluations-export.controller.ts`
- `backend/src/modules/business-insights/access/evaluations-permission.constants.ts`
- `backend/src/modules/business-insights/access/evaluations-permission.defaults.ts`
- `backend/src/modules/business-insights/access/evaluations-permission.guard.spec.ts`
- `backend/src/modules/business-insights/access/evaluations-permission.guard.ts`
- `backend/src/modules/business-insights/access/evaluations-privacy.policy.spec.ts`
- `backend/src/modules/business-insights/access/evaluations-privacy.policy.ts`
- `backend/src/modules/business-insights/access/evaluations.permissions.matrix.spec.ts`
- `backend/src/modules/business-insights/access/require-evaluations-permission.decorator.ts`
- `backend/src/modules/business-insights/business-insights.module.ts`
- `backend/src/modules/business-insights/dashboard-insights.controller.ts`
- `backend/src/modules/business-insights/dto/evaluations-analytics-response.dto.ts`
- `backend/src/modules/business-insights/evaluations-analytics.controller.ts`
- `backend/src/modules/business-insights/evaluations-chart-series.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-data-quality.service.ts`
- `backend/src/modules/business-insights/evaluations-data-quality.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-driver-analysis.service.ts`
- `backend/src/modules/business-insights/evaluations-lineage.service.ts`
- `backend/src/modules/business-insights/evaluations-lineage.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-metric-state.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-strength-detection.service.ts`
- `backend/src/modules/business-insights/evaluations-weakness-detection.service.ts`
- `backend/src/modules/business-insights/internal-business-insights.controller.ts`
- `backend/src/modules/business-insights/tenant-insight-policy.service.ts`
- `backend/src/modules/customers/customers.controller.ts`
- `backend/src/modules/customers/customers.module.ts`
- `backend/src/modules/customers/customers.service.ts`
- `backend/src/modules/users/defaults/organization-role.defaults.ts`
- `backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.controller.ts`
- `backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.module.ts`
- `backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.service.ts`
- `backend/src/shared/auth/permission.constants.ts`
- `docs/architecture/analytics/evaluations-data-quality-model.md`
- `docs/architecture/analytics/evaluations-lineage-freshness.md`
- `docs/compliance/evaluations-gdpr-privacy-by-design.md`
- `docs/frontend/evaluations-metric-state-ux.md`
- `docs/security/evaluations-audit-logging.md`
- `docs/security/evaluations-role-permission-matrix.md`
- `frontend/src/lib/api.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/Sidebar.tsx`
- `frontend/src/rental/components/evaluations-forecasts/EvaluationsForecastsSection.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsMetricKpiCard.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsMetricStateBadge.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsMetricValue.test.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsMetricValue.tsx`
- `frontend/src/rental/components/insights/InsightsCockpit.tsx`
- `frontend/src/rental/components/users-roles/constants.ts`
- `frontend/src/rental/hooks/useEvaluationsAnalyticsSummary.test.ts`
- `frontend/src/rental/hooks/useEvaluationsAnalyticsSummary.ts`
- `frontend/src/rental/lib/evaluations-permissions.test.ts`
- `frontend/src/rental/lib/evaluations-permissions.ts`
- `frontend/src/rental/lib/evaluations-privacy.test.ts`
- `frontend/src/rental/lib/evaluations-privacy.ts`
- `frontend/vitest.config.ts`
- `shared/evaluations-insights/evaluations-analytics-contract-validation.ts`
- `shared/evaluations-insights/evaluations-analytics-contracts.index.ts`
- `shared/evaluations-insights/evaluations-analytics-primitives.contract.ts`
- `shared/evaluations-insights/evaluations-chart-series.spec.ts`
- `shared/evaluations-insights/evaluations-chart-series.ts`
- `shared/evaluations-insights/evaluations-cost-model.contract.ts`
- `shared/evaluations-insights/evaluations-data-quality.contract.ts`
- `shared/evaluations-insights/evaluations-data-quality.spec.ts`
- `shared/evaluations-insights/evaluations-data-quality.thresholds.ts`
- `shared/evaluations-insights/evaluations-data-quality.ts`
- `shared/evaluations-insights/evaluations-lineage.contract.ts`
- `shared/evaluations-insights/evaluations-lineage.spec.ts`
- `shared/evaluations-insights/evaluations-lineage.ts`
- `shared/evaluations-insights/evaluations-metric-state.contract.ts`
- `shared/evaluations-insights/evaluations-metric-state.spec.ts`
- `shared/evaluations-insights/evaluations-metric-state.ts`
- `shared/evaluations-insights/evaluations-permission.contract.ts`
- `shared/evaluations-insights/evaluations-privacy.shared.spec.ts`
- `shared/evaluations-insights/evaluations-privacy.ts`
- `shared/evaluations-insights/evaluations-utilization-model.contract.ts`

</details>

<details><summary>Historical file overlap deferred to its owning package</summary>

- `backend/src/modules/business-insights/evaluations-analytics-summary.integration.spec.ts` → `E4`; do not port in `E5`.
- `backend/src/modules/business-insights/evaluations-analytics-summary.service.spec.ts` → `E4`; do not port in `E5`.
- `backend/src/modules/business-insights/evaluations-analytics-summary.service.ts` → `E4`; do not port in `E5`.
- `backend/src/modules/business-insights/predictive/predictive-backtest.controller.ts` → `E8`; do not port in `E5`.
- `backend/src/modules/business-insights/predictive/predictive-backtest.service.ts` → `E8`; do not port in `E5`.
- `backend/src/modules/business-insights/predictive/predictive-feature.controller.ts` → `E8`; do not port in `E5`.
- `backend/src/modules/business-insights/predictive/predictive-forecast.controller.ts` → `E8`; do not port in `E5`.
- `backend/src/modules/business-insights/predictive/predictive-risk.controller.ts` → `E8`; do not port in `E5`.
- `shared/evaluations-insights/evaluations-analytics-summary.contract.ts` → `E4`; do not port in `E5`.
- `shared/evaluations-insights/evaluations-analytics-summary.ts` → `E4`; do not port in `E5`.

</details>

## 6. E6 — Core Evaluations UI

- Planned branch: `integration/evaluations-e6-core-evaluations-ui-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-data-quality-panel`, `cs-evaluations-information-architecture`, `cs-evaluations-executive-kpi-strip`, `cs-evaluations-strength-weakness-cockpit`, `cs-evaluations-risk-cost-failure-visuals`, `cs-evaluations-mobile-readiness`, `cs-evaluations-accessibility-i18n`
- Source PRs: #793, #794, #795, #796, #798, #801, #803
- Source commits: `14072b3141bbfc5001372334aca8c8df9311df76`, `2759f22353106ac3c3804fce0e95f8e1aef32b25`, `304a6ed19da12e30bde4ed8e78f9784e0984eb49`, `7f6dde4c8c502dc238167d62c508ac9145e91c5c`, `cb2ced964d28bbbec11f1564e7081376cc12710d`, `ddad560687ad7d42ca7a15bb033e85bc06b25187`, `ff34b66f0074e7f5efd155ff6301cae1790cc361`
- Implementation: PORT_PATCH_MANUALLY, REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: None.
- Tests: frontend typecheck; component/E2E tests; mobile/visual regression; accessibility/i18n
- Staging: required; VPS: not in this package.
- Entry gate: E3-E5 backend, finance, quality and security contracts merged; no placeholder API allowed.
- Exit/merge gate: Canonical EvaluationsPage passes typecheck, E2E, mobile, a11y/i18n and regenerated visual baselines.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `VITE_EVALUATIONS_UI_V2=off`

<details><summary>Phase-3 implementation file scope</summary>

- `backend/package.json`
- `backend/src/modules/business-insights/evaluations-data-quality-panel.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-executive-kpi-registry.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-risk-cost-visualizations.shared.spec.ts`
- `backend/src/modules/business-insights/evaluations-sw-cockpit.shared.spec.ts`
- `docs/audits/evaluations/evaluations-accessibility-i18n-2026-07.md`
- `docs/audits/evaluations/evaluations-mobile-readiness-2026-07.md`
- `docs/frontend/evaluations-data-quality-panel.md`
- `docs/frontend/evaluations-executive-kpis.md`
- `docs/frontend/evaluations-information-architecture.md`
- `docs/frontend/evaluations-risk-cost-visualizations.md`
- `docs/frontend/evaluations-strengths-weaknesses-cockpit.md`
- `frontend/.gitignore`
- `frontend/e2e/e2e/artifacts/evaluations/evaluations-page-desktop-1280.png`
- `frontend/e2e/e2e/artifacts/evaluations/evaluations-page-mobile-375.png`
- `frontend/e2e/evaluations-a11y.spec.ts`
- `frontend/e2e/evaluations-fixtures.ts`
- `frontend/e2e/evaluations-responsive.spec.ts`
- `frontend/e2e/playwright.config.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/rental/App.tsx`
- `frontend/src/rental/components/EvaluationsPage.tsx`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsDataQualityAdminPanel.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsDataQualityPanel.test.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsDataQualitySourceCard.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsDataQualityStateBadge.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsDataQualityUserHint.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsExecutiveKpiCard.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsExecutiveKpiStrip.test.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsExecutiveKpiStrip.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsFinanceInvoiceDetail.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsInsightListCard.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsMetricKpiCard.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsMetricValue.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsMobileReadiness.test.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsPageStructure.test.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsRiskCostVizPanel.test.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsRiskCostVizPanel.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsSection.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsSectionNav.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsSwCockpit.test.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsSwCockpit.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsSwFindingCard.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsSwFindingDetailDrawer.tsx`
- `frontend/src/rental/components/evaluations/charts/EvaluationsChartCard.tsx`
- `frontend/src/rental/components/evaluations/charts/EvaluationsChartDataTable.tsx`
- `frontend/src/rental/components/evaluations/charts/EvaluationsRiskCostCharts.tsx`
- `frontend/src/rental/components/evaluations/charts/EvaluationsRiskMatrixChart.tsx`
- `frontend/src/rental/components/evaluations/evaluations-a11y.ts`
- `frontend/src/rental/components/evaluations/evaluations-page.constants.ts`
- `frontend/src/rental/components/evaluations/evaluations-responsive.constants.ts`
- `frontend/src/rental/components/evaluations/evaluations.a11y.ui.test.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsActionsSection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsCostsDowntimeSection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsDataQualitySection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsExecutiveSummarySection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsFinanceSection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsFleetSection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsGlobalFiltersSection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsRisksSection.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsStrengthsWeaknessesSection.tsx`
- `frontend/src/rental/components/insights/EvaluationsAnalyticsFilterBar.tsx`
- `frontend/src/rental/hooks/useEvaluationsAnalyticsSummary.types.ts`
- `frontend/src/rental/hooks/useEvaluationsInvoiceData.ts`
- `frontend/src/rental/i18n/translations/de.ts`
- `frontend/src/rental/i18n/translations/en.ts`
- `frontend/src/rental/lib/evaluations-data-quality-navigation.test.ts`
- `frontend/src/rental/lib/evaluations-data-quality-navigation.ts`
- `frontend/src/rental/lib/evaluations-format.ts`
- `shared/evaluations-insights/evaluations-data-quality-panel.contract.ts`
- `shared/evaluations-insights/evaluations-data-quality-panel.spec.ts`
- `shared/evaluations-insights/evaluations-data-quality-panel.ts`
- `shared/evaluations-insights/evaluations-executive-kpi-registry.contract.ts`
- `shared/evaluations-insights/evaluations-executive-kpi-registry.spec.ts`
- `shared/evaluations-insights/evaluations-executive-kpi-registry.ts`
- `shared/evaluations-insights/evaluations-risk-cost-visualizations.contract.ts`
- `shared/evaluations-insights/evaluations-risk-cost-visualizations.spec.ts`
- `shared/evaluations-insights/evaluations-risk-cost-visualizations.ts`
- `shared/evaluations-insights/evaluations-sw-cockpit.contract.ts`
- `shared/evaluations-insights/evaluations-sw-cockpit.spec.ts`
- `shared/evaluations-insights/evaluations-sw-cockpit.ts`

</details>

## 7. E7 — Recommendations & Safe Actions

- Planned branch: `integration/evaluations-e7-recommendations-and-safe-actions-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-recommendation-domain`, `cs-evaluations-action-center`, `cs-evaluations-action-integrations`, `cs-evaluations-impact-measurement`
- Source PRs: #804, #806, #807, #808
- Source commits: `038223bc18dc475a7f0908baa34c6da22986fd68`, `364bd93733e30c6a98ea579f1707b8a73be2ecd8`, `8829b6a56a0687994edde3ead74d6f95b3122d33`, `9eae4b1246fcbfe5efa7f04caa2bb429600ccf3b`
- Implementation: PORT_PATCH_MANUALLY, RECONSTRUCT_MERGE_RESULT, REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: `backend/prisma/migrations/20260724120000_org_recommendations/migration.sql`, `backend/prisma/migrations/20260724130000_org_recommendation_impacts/migration.sql`, `backend/prisma/schema.prisma`
- Tests: state-machine tests; authorization/idempotency tests; audit outbox tests; side-effect safety tests
- Staging: required; VPS: not in this package.
- Entry gate: E5 authorization/audit and E6 UI shell merged; material-action policy review complete.
- Exit/merge gate: State machine, tenant checks, confirmation, idempotency and audit precede every material action.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `EVALUATIONS_RECOMMENDATIONS_MODE=off;EVALUATIONS_IMPACT_MEASUREMENT_ENABLED=false`

<details><summary>Phase-3 implementation file scope</summary>

- `backend/prisma/migrations/20260724120000_org_recommendations/migration.sql`
- `backend/prisma/migrations/20260724130000_org_recommendation_impacts/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/src/modules/business-insights/business-insights.module.ts`
- `backend/src/modules/business-insights/recommendations/dto/recommendation-impact.dto.ts`
- `backend/src/modules/business-insights/recommendations/dto/recommendation-integration.dto.ts`
- `backend/src/modules/business-insights/recommendations/dto/recommendation.dto.ts`
- `backend/src/modules/business-insights/recommendations/org-recommendations.controller.ts`
- `backend/src/modules/business-insights/recommendations/org-recommendations.repository.ts`
- `backend/src/modules/business-insights/recommendations/org-recommendations.service.spec.ts`
- `backend/src/modules/business-insights/recommendations/org-recommendations.service.ts`
- `backend/src/modules/business-insights/recommendations/recommendation-entity-validation.service.ts`
- `backend/src/modules/business-insights/recommendations/recommendation-impact.repository.ts`
- `backend/src/modules/business-insights/recommendations/recommendation-impact.service.spec.ts`
- `backend/src/modules/business-insights/recommendations/recommendation-impact.service.ts`
- `backend/src/modules/business-insights/recommendations/recommendation-integrations.service.spec.ts`
- `backend/src/modules/business-insights/recommendations/recommendation-integrations.service.ts`
- `backend/src/shared/recommendations/recommendation-domain.logic.spec.ts`
- `backend/src/shared/recommendations/recommendation-domain.logic.ts`
- `backend/src/shared/recommendations/recommendation-domain.mapper.ts`
- `backend/src/shared/recommendations/recommendation-domain.types.ts`
- `backend/src/shared/recommendations/recommendation-impact.mapper.ts`
- `docs/architecture/analytics/evaluations-action-integrations.md`
- `docs/architecture/analytics/evaluations-impact-measurement.md`
- `docs/architecture/analytics/evaluations-recommendation-domain.md`
- `docs/frontend/artifacts/evaluations-action-center.png`
- `docs/frontend/evaluations-action-center.md`
- `frontend/e2e/artifacts/evaluations/evaluations-action-center-desktop.png`
- `frontend/e2e/evaluations-action-center.spec.ts`
- `frontend/e2e/evaluations-fixtures.ts`
- `frontend/e2e/playwright.config.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/rental/App.tsx`
- `frontend/src/rental/components/EvaluationsPage.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsActionCenter.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsRecommendationDetailDrawer.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsRecommendationImpactPanel.tsx`
- `frontend/src/rental/components/evaluations/EvaluationsRecommendationIntegrations.tsx`
- `frontend/src/rental/components/evaluations/evaluations-action-center.ui.test.tsx`
- `frontend/src/rental/components/evaluations/sections/EvaluationsActionsSection.tsx`
- `frontend/src/rental/hooks/useEvaluationsRecommendationImpact.ts`
- `frontend/src/rental/hooks/useEvaluationsRecommendationIntegrations.ts`
- `frontend/src/rental/hooks/useEvaluationsRecommendations.test.ts`
- `frontend/src/rental/hooks/useEvaluationsRecommendations.ts`
- `frontend/src/rental/i18n/translations/de.ts`
- `frontend/src/rental/i18n/translations/en.ts`
- `frontend/src/rental/lib/evaluations-recommendation-integrations-navigation.test.ts`
- `frontend/src/rental/lib/evaluations-recommendation-integrations-navigation.ts`
- `frontend/src/rental/lib/evaluations-recommendations-api.types.ts`
- `frontend/src/rental/lib/evaluations-recommendations-format.ts`
- `frontend/vitest.config.ts`
- `shared/evaluations-insights/evaluations-impact-measurement.shared.spec.ts`
- `shared/evaluations-insights/evaluations-impact-measurement.ts`
- `shared/evaluations-insights/evaluations-recommendation-integrations.shared.spec.ts`
- `shared/evaluations-insights/evaluations-recommendation-integrations.ts`
- `shared/evaluations-insights/evaluations-recommendations.shared.spec.ts`
- `shared/evaluations-insights/evaluations-recommendations.ts`

</details>

## 8. E8 — Predictive Backend & Release Gate

- Planned branch: `integration/evaluations-e8-predictive-backend-and-release-gate-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-predictive-analytics-architecture`, `cs-evaluations-feature-store`, `cs-evaluations-demand-revenue-utilization-forecast`, `cs-evaluations-maintenance-failure-forecast`, `cs-evaluations-backtesting-drift`
- Source PRs: #809, #810, #811, #812, #813
- Source commits: `8488537978d8294e8ac04c436866104b99958886`, `96edda271330a5904843034b98e16990f9ed76e7`, `9cb26ece2b380e456fc440c3e97a336dd80dd890`, `e3c8966a51c00a80eadfc2bc69cdca0e398e9b9d`, `f988c3664bbe18edc49ba8a3e762bb1660a8e043`
- Implementation: REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: `backend/prisma/migrations/20260724140000_org_predictive_feature_snapshots/migration.sql`, `backend/prisma/migrations/20260724150000_org_predictive_forecasts/migration.sql`, `backend/prisma/migrations/20260724160000_org_predictive_risk_forecasts/migration.sql`, `backend/prisma/migrations/20260724170000_org_predictive_backtesting/migration.sql`, `backend/prisma/schema.prisma`
- Tests: future-leakage tests; rolling backtests; baseline and interval-coverage tests; model release denial tests
- Staging: required; VPS: not in this package.
- Entry gate: E4/E5 analytics, quality, tenant and audit foundations merged; model governance review complete.
- Exit/merge gate: Point-in-time features, forecasts and backtests pass release/uncertainty gates while customer exposure remains off.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `EVALUATIONS_PREDICTIVE_MODE=off`

<details><summary>Phase-3 implementation file scope</summary>

- `backend/package.json`
- `backend/prisma/migrations/20260724140000_org_predictive_feature_snapshots/migration.sql`
- `backend/prisma/migrations/20260724150000_org_predictive_forecasts/migration.sql`
- `backend/prisma/migrations/20260724160000_org_predictive_risk_forecasts/migration.sql`
- `backend/prisma/migrations/20260724170000_org_predictive_backtesting/migration.sql`
- `backend/prisma/schema.prisma`
- `backend/src/modules/business-insights/business-insights.module.ts`
- `backend/src/modules/business-insights/internal-business-insights.controller.ts`
- `backend/src/modules/business-insights/predictive/dto/build-predictive-features.dto.ts`
- `backend/src/modules/business-insights/predictive/dto/list-predictive-feature-snapshots.dto.ts`
- `backend/src/modules/business-insights/predictive/dto/list-predictive-forecasts.dto.ts`
- `backend/src/modules/business-insights/predictive/dto/list-predictive-risk-forecasts.dto.ts`
- `backend/src/modules/business-insights/predictive/dto/run-predictive-forecasts.dto.ts`
- `backend/src/modules/business-insights/predictive/predictive-backtest.controller.ts`
- `backend/src/modules/business-insights/predictive/predictive-backtest.loader.ts`
- `backend/src/modules/business-insights/predictive/predictive-backtest.repository.ts`
- `backend/src/modules/business-insights/predictive/predictive-backtest.scheduler.ts`
- `backend/src/modules/business-insights/predictive/predictive-backtest.service.spec.ts`
- `backend/src/modules/business-insights/predictive/predictive-backtest.service.ts`
- `backend/src/modules/business-insights/predictive/predictive-feature.controller.ts`
- `backend/src/modules/business-insights/predictive/predictive-feature.loader.ts`
- `backend/src/modules/business-insights/predictive/predictive-feature.repository.ts`
- `backend/src/modules/business-insights/predictive/predictive-feature.service.spec.ts`
- `backend/src/modules/business-insights/predictive/predictive-feature.service.ts`
- `backend/src/modules/business-insights/predictive/predictive-forecast.controller.ts`
- `backend/src/modules/business-insights/predictive/predictive-forecast.loader.ts`
- `backend/src/modules/business-insights/predictive/predictive-forecast.repository.ts`
- `backend/src/modules/business-insights/predictive/predictive-forecast.scheduler.ts`
- `backend/src/modules/business-insights/predictive/predictive-forecast.service.spec.ts`
- `backend/src/modules/business-insights/predictive/predictive-forecast.service.ts`
- `backend/src/modules/business-insights/predictive/predictive-risk.controller.ts`
- `backend/src/modules/business-insights/predictive/predictive-risk.loader.ts`
- `backend/src/modules/business-insights/predictive/predictive-risk.repository.ts`
- `backend/src/modules/business-insights/predictive/predictive-risk.service.spec.ts`
- `backend/src/modules/business-insights/predictive/predictive-risk.service.ts`
- `backend/src/shared/predictive/predictive-backtest.mapper.ts`
- `backend/src/shared/predictive/predictive-feature.mapper.ts`
- `backend/src/shared/predictive/predictive-forecast.mapper.ts`
- `backend/src/shared/predictive/predictive-risk-forecast.mapper.ts`
- `backend/tsconfig.json`
- `docs/architecture/analytics/evaluations-demand-revenue-utilization-forecast.md`
- `docs/architecture/analytics/evaluations-feature-store.md`
- `docs/architecture/analytics/evaluations-forecast-backtesting.md`
- `docs/architecture/analytics/evaluations-maintenance-failure-forecast.md`
- `docs/architecture/analytics/evaluations-predictive-analytics-architecture.md`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/vitest.config.ts`
- `shared/evaluations-insights/predictive/evaluations-backtest.contract.ts`
- `shared/evaluations-insights/predictive/evaluations-backtest.shared.spec.ts`
- `shared/evaluations-insights/predictive/evaluations-backtest.ts`
- `shared/evaluations-insights/predictive/evaluations-baseline-forecast.shared.spec.ts`
- `shared/evaluations-insights/predictive/evaluations-baseline-forecast.ts`
- `shared/evaluations-insights/predictive/evaluations-drift-monitor.ts`
- `shared/evaluations-insights/predictive/evaluations-feature-calendar.ts`
- `shared/evaluations-insights/predictive/evaluations-feature-extraction.ts`
- `shared/evaluations-insights/predictive/evaluations-feature-registry.ts`
- `shared/evaluations-insights/predictive/evaluations-feature-store.contract.ts`
- `shared/evaluations-insights/predictive/evaluations-feature-store.shared.spec.ts`
- `shared/evaluations-insights/predictive/evaluations-feature-time.ts`
- `shared/evaluations-insights/predictive/evaluations-forecast.contract.ts`
- `shared/evaluations-insights/predictive/evaluations-maintenance-risk-forecast.shared.spec.ts`
- `shared/evaluations-insights/predictive/evaluations-maintenance-risk-forecast.ts`
- `shared/evaluations-insights/predictive/evaluations-maintenance-risk.contract.ts`

</details>

## 9. E9 — Forecast UI & Final Acceptance

- Planned branch: `integration/evaluations-e9-forecast-ui-and-final-acceptance-2026-08`
- Starting point: current `origin/main` after every hard-dependency package is merged.
- Change-sets: `cs-evaluations-forecast-ux`
- Source PRs: #814
- Source commits: `46b905ad6a441f3c16a3f66c17ff88afc1fa7318`
- Implementation: REIMPLEMENT_ON_CURRENT_MAIN
- Migration evidence to regenerate from current main: None.
- Tests: forecast component/E2E tests; uncertainty/accessibility tests; release-gate denial tests; staging and rollback smoke
- Staging: required; VPS: required.
- Entry gate: E6 UI and E8 model-status/release contracts merged; backend remains default off.
- Exit/merge gate: Forecast UI never bypasses release status or uncertainty; full staging/VPS acceptance and rollback smoke pass.
- Rollback: Set package feature modes to off; revert the isolated package commit and redeploy the prior release. For applied schema, use rehearsed roll-forward repair or restore only from a verified backup.
- Feature flag: `VITE_EVALUATIONS_PREDICTIVE_MODE=off;EVALUATIONS_PREDICTIVE_MODE=off`

<details><summary>Phase-3 implementation file scope</summary>

- `docs/frontend/evaluations-forecast-ux.md`
- `frontend/src/lib/api.ts`
- `frontend/src/master/components/ArchitekturView.tsx`
- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/rental/components/FinancialInsightsView.tsx`
- `frontend/src/rental/components/evaluations-forecasts/EvaluationsForecastsSection.test.ts`
- `frontend/src/rental/components/evaluations-forecasts/EvaluationsForecastsSection.tsx`
- `frontend/src/rental/components/evaluations-forecasts/ForecastCard.tsx`
- `frontend/src/rental/components/evaluations-forecasts/ForecastDrilldown.tsx`
- `frontend/src/rental/components/evaluations-forecasts/ForecastTable.tsx`
- `frontend/src/rental/components/evaluations-forecasts/ForecastTermTooltip.tsx`
- `frontend/src/rental/components/evaluations-forecasts/ForecastUncertaintyBand.tsx`
- `frontend/src/rental/hooks/useEvaluationsForecasts.ts`
- `frontend/src/rental/lib/evaluations-forecast-view-model.test.ts`
- `frontend/src/rental/lib/evaluations-forecast-view-model.ts`

</details>

## Global no-go gates

- Any cross-tenant/station read, missing central permission check, unconfirmed material action, idempotency gap, audit enqueue failure, mixed-currency sum, PII leakage, future leakage, or predictive default-on is `NO-GO`.
- Historical migrations are evidence only. Recompute each schema diff and rehearse expand/backfill/switch/contract on current main.
- Analytics-summary service/repository and shared summary implementation paths are owned by E4. E2 must use E1 period semantics and must not replay historical summary-service refactors from filter/grouping commits.
- Predictive backend/shared implementation paths are owned exclusively by E8. Earlier RBAC/audit packages may add reusable guards and contracts, but must not port predictive controllers, services or shared predictive implementations.
- Figma remains visual authority during Phase-3 UI implementation; no UI package may introduce client-owned KPI truth.
