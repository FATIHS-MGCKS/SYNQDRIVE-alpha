# Phase 2.6 — Evaluations Validation Report

Generated `2026-08-10T18:30:00+00:00` against `origin/main` `2d721a902feb56101eb9992249f1859ff64024cb`.

## Machine result

- Change-sets: 44
- Packages: 9
- Active dependency edges: 101
- Hard edges: 84
- Soft/test edges: 17
- Active cross-module edges: 0
- Change-set cycles: 0
- Package cycles: 0
- Invalid final package-order edges: 0
- Unknown final dependencies: 0
- Unresolved platform prerequisites: 0
- Validator errors: 0
- Negative validator tests: 10/10 passed
- Result: `PASS`

## Negative fixtures

- `earlier_package_depends_on_later`: `PASS`; expected `INVALID_PACKAGE_ORDER`; observed `CHANGESET_DAG_CYCLE, INVALID_PACKAGE_ORDER, PACKAGE_DAG_CYCLE, PACKAGE_TOPOLOGICAL_ORDER_MISMATCH`.
- `changeset_cycle`: `PASS`; expected `CHANGESET_DAG_CYCLE`; observed `CHANGESET_DAG_CYCLE`.
- `unknown_changeset_id`: `PASS`; expected `UNKNOWN_DEPENDENCY`; observed `UNKNOWN_DEPENDENCY`.
- `missing_package`: `PASS`; expected `MISSING_PACKAGE`; observed `MISSING_PACKAGE`.
- `duplicate_package_assignment`: `PASS`; expected `DUPLICATE_PACKAGE_ASSIGNMENT`; observed `DUPLICATE_PACKAGE_ASSIGNMENT`.
- `hard_dependency_on_obsolete`: `PASS`; expected `HARD_DEPENDENCY_ON_INACTIVE_CHANGESET`; observed `HARD_DEPENDENCY_ON_INACTIVE_CHANGESET`.
- `critical_missing_rollback`: `PASS`; expected `MISSING_ROLLBACK`; observed `MISSING_ROLLBACK`.
- `predictive_without_off_flag`: `PASS`; expected `PREDICTIVE_FLAG_NOT_OFF`; observed `PREDICTIVE_FLAG_NOT_OFF`.
- `cross_module_hard_without_prerequisite`: `PASS`; expected `UNKNOWN_CROSS_MODULE_HARD_DEPENDENCY`; observed `UNKNOWN_CROSS_MODULE_HARD_DEPENDENCY, UNKNOWN_DEPENDENCY`.
- `exclusive_file_in_non_owner_package`: `PASS`; expected `EXCLUSIVE_FILE_OWNER_VIOLATION`; observed `EXCLUSIVE_FILE_OWNER_VIOLATION`.

## ADR consistency spot check

- No page-owned truth: EVAL-ADR-003 remains consistent with metric registry/current UI adapters.
- Tenant isolation/authorization: EVAL-ADR-007 uses current central guards and role defaults; E2 makes enforcement atomic with new analytics contracts.
- Recommendation versus action: EVAL-ADR-005 requires confirmation, tenant/entity checks, idempotency and audit before E7 side effects.
- Predictive uncertainty/release: EVAL-ADR-006/009 require point-in-time data, intervals, backtests and backend default-off before E9 exposure.
- Auditability/privacy: EVAL-ADR-008 extends the existing business-audit outbox; aggregate reads remain distinct from sensitive reads/exports.
- Finance terms: EVAL-ADR-001 preserves typed Money, ISO-4217 and FX provenance; E3 contract precedes migration.
- Data quality/freshness: EVAL-ADR-003 contracts are ordered before UI and predictive consumers.
- Book I–IV remain unavailable under identifiable repository paths; the Phase-2.5 authority matrix and requirement indexes are the documented retrieval limit.

## Specialized gates

- Tenant foundation is E2; no new protected analytics API is ordered before it.
- Predictive order is architecture → feature store → forecast engines → backtesting/release gate → Forecast UI; backend and frontend defaults remain off.
- Recommendation order is domain → permission/audit-gated Action Center → confirmed/idempotent integrations → impact measurement.
- Every UI change-set has `minimum_backend_gate` in the normalized model; no placeholder contract is accepted.

### Finance order

`timezone + KPI contract → Money contract → Money migration`; in parallel after Money, `timezone + Money → receivables → revenue/cashflow/result → multi-currency`; the finance test suite closes the same E3 package. Migration never defines money semantics and multi-currency never creates another authority.

### UI minimum backend gates

| UI change-set | Minimum backend gate |
|---|---|
| `cs-evaluations-accessibility-i18n` | `cs-evaluations-mobile-readiness` |
| `cs-evaluations-action-center` | `cs-evaluations-recommendation-domain`, `cs-evaluations-audit-logging`, `cs-evaluations-roles-permissions` |
| `cs-evaluations-data-quality-panel` | `cs-evaluations-data-quality`, `cs-evaluations-freshness-lineage`, `cs-evaluations-metric-state-ux` |
| `cs-evaluations-executive-kpi-strip` | `cs-evaluations-analytics-summary`, `cs-evaluations-revenue-cashflow-result`, `cs-evaluations-metric-state-ux` |
| `cs-evaluations-forecast-ux` | `cs-evaluations-backtesting-drift`, `cs-evaluations-roles-permissions` |
| `cs-evaluations-information-architecture` | `cs-evaluations-analytics-contracts`, `cs-evaluations-tenant-isolation` |
| `cs-evaluations-metric-state-ux` | `cs-evaluations-data-quality`, `cs-evaluations-freshness-lineage` |
| `cs-evaluations-mobile-readiness` | `cs-evaluations-information-architecture`, `cs-evaluations-data-quality-panel`, `cs-evaluations-executive-kpi-strip`, `cs-evaluations-strength-weakness-cockpit`, `cs-evaluations-risk-cost-failure-visuals` |
| `cs-evaluations-risk-cost-failure-visuals` | `cs-evaluations-cost-model`, `cs-evaluations-analytics-summary` |
| `cs-evaluations-strength-weakness-cockpit` | `cs-evaluations-strength-detection`, `cs-evaluations-weakness-detection` |

E1 is a complete contract-only package and does not expose historical controller deltas. E2 is the first package allowed to expose new protected analytics routes, and those routes merge only with tenant/station guards and negative tests.
