# Phase 2.6 — Package Changes from Phase 2.5

## Package structure

- Package count: 8 → 9.
- Old declared order: E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8.
- New source-derived order: E1 → E2 → E3 → E4 → E5 → E6 → E7 → E8 → E9.
- `E2` is now an atomic tenant-safe contract/persistence package; subsequent package numbers shift by one.

## Change-set movements

| Change-set | Phase 2.5 | Phase 2.6 | Reason |
|---|---|---|---|
| `cs-evaluations-money-domain` | `E2` | `E3` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-money-migration` | `E2` | `E3` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-receivables` | `E2` | `E3` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-revenue-cashflow-result` | `E2` | `E3` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-multi-currency` | `E2` | `E3` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-finance-test-suite` | `E2` | `E3` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-summary-detail-separation` | `E3` | `E2` | Contract/security atomicity. |
| `cs-evaluations-grouping-entity-references` | `E1` | `E2` | Contract/security atomicity. |
| `cs-evaluations-analytics-summary` | `E3` | `E4` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-filter-architecture` | `E3` | `E2` | Contract/security atomicity. |
| `cs-evaluations-tenant-isolation` | `E4` | `E2` | Contract/security atomicity. |
| `cs-evaluations-analytics-contracts` | `E1` | `E2` | Contract/security atomicity. |
| `cs-evaluations-cost-model` | `E3` | `E4` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-utilization` | `E3` | `E4` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-strength-detection` | `E3` | `E4` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-weakness-detection` | `E3` | `E4` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-driver-influence-analysis` | `E3` | `E4` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-data-quality` | `E4` | `E5` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-freshness-lineage` | `E4` | `E5` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-metric-state-ux` | `E4` | `E5` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-data-quality-panel` | `E5` | `E6` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-information-architecture` | `E5` | `E6` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-executive-kpi-strip` | `E5` | `E6` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-strength-weakness-cockpit` | `E5` | `E6` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-risk-cost-failure-visuals` | `E5` | `E6` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-mobile-readiness` | `E5` | `E6` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-accessibility-i18n` | `E5` | `E6` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-recommendation-domain` | `E6` | `E7` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-action-center` | `E6` | `E7` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-action-integrations` | `E6` | `E7` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-impact-measurement` | `E6` | `E7` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-predictive-analytics-architecture` | `E7` | `E8` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-feature-store` | `E7` | `E8` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-demand-revenue-utilization-forecast` | `E7` | `E8` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-maintenance-failure-forecast` | `E7` | `E8` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-backtesting-drift` | `E7` | `E8` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-forecast-ux` | `E8` | `E9` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-gdpr` | `E4` | `E5` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-roles-permissions` | `E4` | `E5` | Dependency-safe package renumbering or domain consolidation. |
| `cs-evaluations-audit-logging` | `E6` | `E5` | Dependency-safe package renumbering or domain consolidation. |

## Dependency normalization

- Original dependencies: 93 (37 internal, 56 external).
- Removed observability-only external entries from the recovery graph: 39.
- Removed historical stack dependencies: 24.
- Removed/satisfied-by-main role dependencies: 4.
- Problem A: removed `summary-detail-separation → grouping-entity-references`; no source import establishes it.
- Problem B: removed `tenant-isolation → analytics-contracts`; contract definition now precedes same-package enforcement.
- Infrastructure dependency removed: its Phase-2 source is Voice Assistant deployment code.
- Observability dependency removed as a recovery blocker: its Phase-2 affected files are the same evaluations commits, not a separate platform contract.
- Roles dependency replaced by current-main `OrgScopingGuard`, `PermissionsGuard`, `RequirePermission` and versioned role defaults.
- Platform prerequisites added: 0 (`P0_REQUIRED=false`).

## External dependency decisions

| Historical ID | Evaluation references | Phase-2 source evidence | Current-main authority / decision | P0 |
|---|---:|---|---|---|
| `cs-observability-api-and-domain-contracts` | 39 | PRs #754, #755, #756, #757, #760, #762, #765, #792, #793, #794, #795, #796, #798, #801, #803, #806, #807; commits `f23e6bdab173c9e4705f56316737a2497d147ae1`, `59cbd9f1f8f2e5f55601b5f2385f9fc5701c49b2`, `7ab6d01dac0cf6a979c321327b03289ed31afe92`, `c82e449362177a4c9d30ae308558464a2ab934f4`, `364bd93733e30c6a98ea579f1707b8a73be2ecd8`; 30 evaluation-owned metric/finance/UI paths; no independent imported observability symbol | `OBSERVABILITY_ONLY`; preserve current #819/Nest Logger/runbook behavior, but no external recovery change-set. | `false` |
| `cs-infrastructure-api-and-domain-contracts` | 13 | PRs #508, #511; commit `8cec86c19d70882ee860016568ccf98db9707610`; `agent-deployment.controller.ts` and `agent-deployment.service.ts` only; no evaluation import/symbol | `HISTORICAL_STACK_INHERITANCE`; Voice Assistant deployment has no evaluations import. | `false` |
| `cs-roles-access-api-and-domain-contracts` | 4 | PRs #910, #911, #912, #913, #922, #923, #924; commits `f3bfff7cc8864250b341aeb39154f401756f4380`, `539ac1c28bc31e69c6fdf51ff83d87e740a796e0`; booking handover files | `ALREADY_SATISFIED_BY_MAIN`; use `OrgScopingGuard`, `PermissionsGuard`, `RequirePermission`, operational permission registry and versioned role defaults. | `false` |

## Package size and atomicity review

| Package | Change-sets | Files | Mix | Risk | Test burden | Rollback complexity |
|---|---:|---:|---|---|---|---|
| `E1` | 4 | 34 | FE/BE | `HIGH` | `MEDIUM` | `MEDIUM` |
| `E2` | 5 | 62 | FE/BE/DB | `CRITICAL` | `HIGH` | `HIGH` |
| `E3` | 6 | 88 | FE/BE/DB | `CRITICAL` | `HIGH` | `HIGH` |
| `E4` | 6 | 54 | FE/BE | `HIGH` | `MEDIUM` | `MEDIUM` |
| `E5` | 6 | 86 | FE/BE | `CRITICAL` | `HIGH` | `MEDIUM` |
| `E6` | 7 | 83 | FE/BE | `HIGH` | `HIGH` | `MEDIUM` |
| `E7` | 4 | 59 | FE/BE/DB | `CRITICAL` | `HIGH` | `HIGH` |
| `E8` | 5 | 64 | FE/BE/DB/Worker | `CRITICAL` | `HIGH` | `HIGH` |
| `E9` | 1 | 15 | FE | `HIGH` | `MEDIUM` | `MEDIUM` |

Each package has a coherent disabled-or-production-safe end state. E1 is contract-only and exposes no new protected route; E2 atomically introduces persistence/contracts with tenant enforcement; later APIs inherit E2 security. No package intentionally leaves an unguarded API or a second money/KPI authority for a successor to repair.
