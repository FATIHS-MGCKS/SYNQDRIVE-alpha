# Phase 2 — Evaluations Recovery Plan

Capabilities use manually verified canonical PR/commit sources. Cumulative descendant PRs are recorded only as containment evidence, never as capability sources.

## Current-main baseline to preserve

- PR #752 / `850b20bc632e…`: Metric Registry — exactly reachable from main.
- PR #752 / `312ee93f5315…`: Calculation Versioning — exactly reachable from main.
- PR #818: current evaluation E2E/visual/accessibility fixtures.
- PR #819: current evaluation observability.
- PRs #820–#821: verification/readiness evidence.
- Observability is a preservation/test gate, not an unimplemented dependency.

## Capability reconstruction

| Order | Capability | Status | Source PRs | Source commits | Files | Recovery change-set | Confidence |
|---:|---|---|---|---:|---:|---|---|
| 1 | Metric Registry | `EXACTLY_IN_MAIN` | #752 | 1 | 22 | — | `HIGH` |
| 2 | Calculation Versioning | `EXACTLY_IN_MAIN` | #752 | 1 | 19 | — | `HIGH` |
| 3 | Timezone / Period Model | `UNIQUE_REQUIRES_RECOVERY` | #754 | 1 | 22 | `cs-evaluations-timezone-period-model` | `HIGH` |
| 4 | Unified KPI Contract | `UNIQUE_REQUIRES_RECOVERY` | #755 | 1 | 17 | `cs-evaluations-unified-kpi-contract` | `HIGH` |
| 5 | Money Domain | `UNIQUE_REQUIRES_RECOVERY` | #756 | 1 | 21 | `cs-evaluations-money-domain` | `HIGH` |
| 6 | Money Migration | `UNIQUE_REQUIRES_RECOVERY` | #756 | 1 | 24 | `cs-evaluations-money-migration` | `HIGH` |
| 7 | Receivables | `UNIQUE_REQUIRES_RECOVERY` | #757 | 1 | 23 | `cs-evaluations-receivables` | `HIGH` |
| 8 | Revenue / Cashflow / Result | `UNIQUE_REQUIRES_RECOVERY` | #760 | 1 | 23 | `cs-evaluations-revenue-cashflow-result` | `HIGH` |
| 9 | Multi-Currency | `UNIQUE_REQUIRES_RECOVERY` | #762 | 1 | 26 | `cs-evaluations-multi-currency` | `HIGH` |
| 10 | Finance Test Suite | `UNIQUE_REQUIRES_RECOVERY` | #765 | 1 | 27 | `cs-evaluations-finance-test-suite` | `HIGH` |
| 11 | Summary / Detail Separation | `UNIQUE_REQUIRES_RECOVERY` | #767 | 1 | 24 | `cs-evaluations-summary-detail-separation` | `HIGH` |
| 12 | Grouping / Entity References | `UNIQUE_REQUIRES_RECOVERY` | #770 | 1 | 23 | `cs-evaluations-grouping-entity-references` | `HIGH` |
| 13 | Analytics Summary | `UNIQUE_REQUIRES_RECOVERY` | #773 | 1 | 17 | `cs-evaluations-analytics-summary` | `HIGH` |
| 14 | Filter Architecture | `UNIQUE_REQUIRES_RECOVERY` | #774 | 1 | 31 | `cs-evaluations-filter-architecture` | `HIGH` |
| 15 | Tenant Isolation | `UNIQUE_REQUIRES_RECOVERY` | #776 | 1 | 23 | `cs-evaluations-tenant-isolation` | `HIGH` |
| 16 | Analytics Contracts | `UNIQUE_REQUIRES_RECOVERY` | #778 | 1 | 18 | `cs-evaluations-analytics-contracts` | `HIGH` |
| 17 | Cost Model | `UNIQUE_REQUIRES_RECOVERY` | #780 | 1 | 18 | `cs-evaluations-cost-model` | `HIGH` |
| 18 | Utilization | `UNIQUE_REQUIRES_RECOVERY` | #782 | 1 | 20 | `cs-evaluations-utilization` | `HIGH` |
| 19 | Strength Detection | `UNIQUE_REQUIRES_RECOVERY` | #783 | 1 | 18 | `cs-evaluations-strength-detection` | `HIGH` |
| 20 | Weakness Detection | `UNIQUE_REQUIRES_RECOVERY` | #784 | 1 | 24 | `cs-evaluations-weakness-detection` | `HIGH` |
| 21 | Driver / Influence Analysis | `UNIQUE_REQUIRES_RECOVERY` | #786 | 1 | 21 | `cs-evaluations-driver-influence-analysis` | `HIGH` |
| 22 | Data Quality | `UNIQUE_REQUIRES_RECOVERY` | #788 | 1 | 22 | `cs-evaluations-data-quality` | `HIGH` |
| 23 | Freshness / Lineage | `UNIQUE_REQUIRES_RECOVERY` | #790 | 1 | 22 | `cs-evaluations-freshness-lineage` | `HIGH` |
| 24 | Metric State UX | `UNIQUE_REQUIRES_RECOVERY` | #792 | 1 | 25 | `cs-evaluations-metric-state-ux` | `HIGH` |
| 25 | Data Quality Panel | `UNIQUE_REQUIRES_RECOVERY` | #793 | 1 | 19 | `cs-evaluations-data-quality-panel` | `HIGH` |
| 26 | Information Architecture | `UNIQUE_REQUIRES_RECOVERY` | #794 | 1 | 25 | `cs-evaluations-information-architecture` | `HIGH` |
| 27 | Executive KPI Strip | `UNIQUE_REQUIRES_RECOVERY` | #795 | 1 | 12 | `cs-evaluations-executive-kpi-strip` | `HIGH` |
| 28 | Strength / Weakness Cockpit | `UNIQUE_REQUIRES_RECOVERY` | #796 | 1 | 16 | `cs-evaluations-strength-weakness-cockpit` | `HIGH` |
| 29 | Risk / Cost / Failure Visuals | `UNIQUE_REQUIRES_RECOVERY` | #798 | 1 | 20 | `cs-evaluations-risk-cost-failure-visuals` | `HIGH` |
| 30 | Mobile Readiness | `UNIQUE_REQUIRES_RECOVERY` | #801 | 1 | 28 | `cs-evaluations-mobile-readiness` | `HIGH` |
| 31 | Accessibility / i18n | `UNIQUE_REQUIRES_RECOVERY` | #803 | 1 | 31 | `cs-evaluations-accessibility-i18n` | `HIGH` |
| 32 | Recommendation Domain | `UNIQUE_REQUIRES_RECOVERY` | #804 | 1 | 15 | `cs-evaluations-recommendation-domain` | `HIGH` |
| 33 | Action Center | `UNIQUE_REQUIRES_RECOVERY` | #806 | 1 | 224 | `cs-evaluations-action-center` | `HIGH` |
| 34 | Action Integrations | `UNIQUE_REQUIRES_RECOVERY` | #807 | 1 | 27 | `cs-evaluations-action-integrations` | `HIGH` |
| 35 | Impact Measurement | `UNIQUE_REQUIRES_RECOVERY` | #808 | 1 | 22 | `cs-evaluations-impact-measurement` | `HIGH` |
| 36 | Predictive Analytics Architecture | `UNIQUE_REQUIRES_RECOVERY` | #809 | 1 | 3 | `cs-evaluations-predictive-analytics-architecture` | `HIGH` |
| 37 | Feature Store | `UNIQUE_REQUIRES_RECOVERY` | #810 | 1 | 24 | `cs-evaluations-feature-store` | `HIGH` |
| 38 | Demand / Revenue / Utilization Forecast | `UNIQUE_REQUIRES_RECOVERY` | #811 | 1 | 19 | `cs-evaluations-demand-revenue-utilization-forecast` | `HIGH` |
| 39 | Maintenance / Failure Forecast | `UNIQUE_REQUIRES_RECOVERY` | #812 | 1 | 18 | `cs-evaluations-maintenance-failure-forecast` | `HIGH` |
| 40 | Backtesting / Drift | `UNIQUE_REQUIRES_RECOVERY` | #813 | 1 | 15 | `cs-evaluations-backtesting-drift` | `HIGH` |
| 41 | Forecast UX | `UNIQUE_REQUIRES_RECOVERY` | #814 | 1 | 15 | `cs-evaluations-forecast-ux` | `HIGH` |
| 42 | GDPR | `UNIQUE_REQUIRES_RECOVERY` | #815 | 1 | 22 | `cs-evaluations-gdpr` | `HIGH` |
| 43 | Roles / Permissions | `UNIQUE_REQUIRES_RECOVERY` | #816 | 1 | 33 | `cs-evaluations-roles-permissions` | `HIGH` |
| 44 | Audit Logging | `UNIQUE_REQUIRES_RECOVERY` | #817 | 1 | 22 | `cs-evaluations-audit-logging` | `HIGH` |

## Exact recovery sequence

1. `cs-evaluations-timezone-period-model` — Timezone / Period Model
   - Source PRs: #754
   - Source commits: `f23e6bdab173c9e4705f56316737a2497d147ae1`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
2. `cs-evaluations-unified-kpi-contract` — Unified KPI Contract
   - Source PRs: #755
   - Source commits: `59cbd9f1f8f2e5f55601b5f2385f9fc5701c49b2`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-timezone-period-model`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
3. `cs-evaluations-money-domain` — Money Domain
   - Source PRs: #756
   - Source commits: `077ba5060251eaa4fae983249822be68b6b00293`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-unified-kpi-contract`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
4. `cs-evaluations-money-migration` — Money Migration
   - Source PRs: #756
   - Source commits: `de17de779d1c3a5de9358268ecbc50da98270849`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-money-domain`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
5. `cs-evaluations-receivables` — Receivables
   - Source PRs: #757
   - Source commits: `d966961c2dc9d6690f5ea21d32d8360b77c0ab1c`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-money-migration`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
6. `cs-evaluations-revenue-cashflow-result` — Revenue / Cashflow / Result
   - Source PRs: #760
   - Source commits: `e340795d2f22198c867401becfa99217c321c0f5`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-receivables`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
7. `cs-evaluations-multi-currency` — Multi-Currency
   - Source PRs: #762
   - Source commits: `efb3abc5feda78818a04849b19d24226c8396282`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-revenue-cashflow-result`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
8. `cs-evaluations-finance-test-suite` — Finance Test Suite
   - Source PRs: #765
   - Source commits: `7ab6d01dac0cf6a979c321327b03289ed31afe92`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-multi-currency`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
9. `cs-evaluations-summary-detail-separation` — Summary / Detail Separation
   - Source PRs: #767
   - Source commits: `515cd44e5b4beac30ffe8b9d63f3d941a9fb578b`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
10. `cs-evaluations-grouping-entity-references` — Grouping / Entity References
   - Source PRs: #770
   - Source commits: `da79b28aa4ad0d84202d332c1f20e10cad8f06dd`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-evaluations-summary-detail-separation`, `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
11. `cs-evaluations-analytics-summary` — Analytics Summary
   - Source PRs: #773
   - Source commits: `e65b88dbefb34b99d6c9520a6d785f571a8f33e6`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-grouping-entity-references`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
12. `cs-evaluations-filter-architecture` — Filter Architecture
   - Source PRs: #774
   - Source commits: `642a210403b63cb719af7566f2019c76044933aa`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-analytics-summary`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
13. `cs-evaluations-tenant-isolation` — Tenant Isolation
   - Source PRs: #776
   - Source commits: `1724bd92bf8e4dfab742767ded38fbc18dabb19e`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-filter-architecture`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; cross-tenant negative and RBAC tests; frontend evaluations component and accessibility regression
14. `cs-evaluations-analytics-contracts` — Analytics Contracts
   - Source PRs: #778
   - Source commits: `26e4532201c94ddf0f72d17c324b42add7dec9cc`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-tenant-isolation`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
15. `cs-evaluations-cost-model` — Cost Model
   - Source PRs: #780
   - Source commits: `d96ba7a8c6379e533ca17f2f3c77b46bbeb6ee43`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-analytics-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression; money precision, period, currency, receivable and financial reconciliation fixtures
16. `cs-evaluations-utilization` — Utilization
   - Source PRs: #782
   - Source commits: `46f533afc431d9c68a4486133313e4f5d7888de0`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-cost-model`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
17. `cs-evaluations-strength-detection` — Strength Detection
   - Source PRs: #783
   - Source commits: `f5cfe0c5cda1bef260dca6a0417977701530210e`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-utilization`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
18. `cs-evaluations-weakness-detection` — Weakness Detection
   - Source PRs: #784
   - Source commits: `32714750f7f197c5a8e4b9bb304011ca2444a05d`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-utilization`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
19. `cs-evaluations-driver-influence-analysis` — Driver / Influence Analysis
   - Source PRs: #786
   - Source commits: `56b9efe22b059cedf5aff64188922aef6e10ba37`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-strength-detection`, `cs-evaluations-weakness-detection`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
20. `cs-evaluations-data-quality` — Data Quality
   - Source PRs: #788
   - Source commits: `2c32183956d3aa4ce56cd3ce4b02f33bcb3dc9b4`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-driver-influence-analysis`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
21. `cs-evaluations-freshness-lineage` — Freshness / Lineage
   - Source PRs: #790
   - Source commits: `5de5e0295658ae3e23f4025e9c316b54193d2872`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-data-quality`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
22. `cs-evaluations-metric-state-ux` — Metric State UX
   - Source PRs: #792
   - Source commits: `c82e449362177a4c9d30ae308558464a2ab934f4`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
23. `cs-evaluations-data-quality-panel` — Data Quality Panel
   - Source PRs: #793
   - Source commits: `ff34b66f0074e7f5efd155ff6301cae1790cc361`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-metric-state-ux`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
24. `cs-evaluations-information-architecture` — Information Architecture
   - Source PRs: #794
   - Source commits: `14072b3141bbfc5001372334aca8c8df9311df76`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `MEDIUM`
   - Dependencies: `cs-evaluations-data-quality-panel`
   - Tests: frontend evaluations component and accessibility regression
25. `cs-evaluations-executive-kpi-strip` — Executive KPI Strip
   - Source PRs: #795
   - Source commits: `2759f22353106ac3c3804fce0e95f8e1aef32b25`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-information-architecture`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
26. `cs-evaluations-strength-weakness-cockpit` — Strength / Weakness Cockpit
   - Source PRs: #796
   - Source commits: `cb2ced964d28bbbec11f1564e7081376cc12710d`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-executive-kpi-strip`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
27. `cs-evaluations-risk-cost-failure-visuals` — Risk / Cost / Failure Visuals
   - Source PRs: #798
   - Source commits: `7f6dde4c8c502dc238167d62c508ac9145e91c5c`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-strength-weakness-cockpit`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
28. `cs-evaluations-mobile-readiness` — Mobile Readiness
   - Source PRs: #801
   - Source commits: `304a6ed19da12e30bde4ed8e78f9784e0984eb49`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `MEDIUM`
   - Dependencies: `cs-evaluations-risk-cost-failure-visuals`
   - Tests: frontend evaluations component and accessibility regression
29. `cs-evaluations-accessibility-i18n` — Accessibility / i18n
   - Source PRs: #803
   - Source commits: `ddad560687ad7d42ca7a15bb033e85bc06b25187`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `MEDIUM`
   - Dependencies: `cs-evaluations-mobile-readiness`
   - Tests: frontend evaluations component and accessibility regression
30. `cs-evaluations-recommendation-domain` — Recommendation Domain
   - Source PRs: #804
   - Source commits: `9eae4b1246fcbfe5efa7f04caa2bb429600ccf3b`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
31. `cs-evaluations-action-center` — Action Center
   - Source PRs: #806
   - Source commits: `364bd93733e30c6a98ea579f1707b8a73be2ecd8`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-evaluations-recommendation-domain`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
32. `cs-evaluations-action-integrations` — Action Integrations
   - Source PRs: #807
   - Source commits: `8829b6a56a0687994edde3ead74d6f95b3122d33`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-action-center`, `cs-observability-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
33. `cs-evaluations-impact-measurement` — Impact Measurement
   - Source PRs: #808
   - Source commits: `038223bc18dc475a7f0908baa34c6da22986fd68`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-evaluations-action-integrations`, `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
34. `cs-evaluations-predictive-analytics-architecture` — Predictive Analytics Architecture
   - Source PRs: #809
   - Source commits: `f988c3664bbe18edc49ba8a3e762bb1660a8e043`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: frontend evaluations component and accessibility regression
35. `cs-evaluations-feature-store` — Feature Store
   - Source PRs: #810
   - Source commits: `9cb26ece2b380e456fc440c3e97a336dd80dd890`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-evaluations-predictive-analytics-architecture`, `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
36. `cs-evaluations-demand-revenue-utilization-forecast` — Demand / Revenue / Utilization Forecast
   - Source PRs: #811
   - Source commits: `96edda271330a5904843034b98e16990f9ed76e7`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-evaluations-feature-store`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
37. `cs-evaluations-maintenance-failure-forecast` — Maintenance / Failure Forecast
   - Source PRs: #812
   - Source commits: `8488537978d8294e8ac04c436866104b99958886`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-evaluations-demand-revenue-utilization-forecast`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests; frontend evaluations component and accessibility regression
38. `cs-evaluations-backtesting-drift` — Backtesting / Drift
   - Source PRs: #813
   - Source commits: `e3c8966a51c00a80eadfc2bc69cdca0e398e9b9d`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `CRITICAL`
   - Dependencies: `cs-evaluations-maintenance-failure-forecast`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: Prisma migration and rollback rehearsal; backend evaluations contract/domain/integration tests
39. `cs-evaluations-forecast-ux` — Forecast UX
   - Source PRs: #814
   - Source commits: `46b905ad6a441f3c16a3f66c17ff88afc1fa7318`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-backtesting-drift`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: frontend evaluations component and accessibility regression
40. `cs-evaluations-gdpr` — GDPR
   - Source PRs: #815
   - Source commits: `c8714b1f9e9760b29a282a294412bf9ebe31cec2`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts`
   - Tests: GDPR purpose, retention and audit evidence review; backend evaluations contract/domain/integration tests; cross-tenant negative and RBAC tests; frontend evaluations component and accessibility regression
41. `cs-evaluations-roles-permissions` — Roles / Permissions
   - Source PRs: #816
   - Source commits: `549c0e237d862eee491943b87077d3ce931ae8a8`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-gdpr`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; cross-tenant negative and RBAC tests; frontend evaluations component and accessibility regression
42. `cs-evaluations-audit-logging` — Audit Logging
   - Source PRs: #817
   - Source commits: `d10d072efce62980e7732d086dd8f6f8f1e2f875`
   - Classification/risk: `REQUIRED_BUT_NEEDS_PORT` / `HIGH`
   - Dependencies: `cs-evaluations-roles-permissions`, `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts`
   - Tests: backend evaluations contract/domain/integration tests; cross-tenant negative and RBAC tests; frontend evaluations component and accessibility regression
43. `cs-evaluations-unresolved-residual` — Unresolved residual evaluation artifacts
   - Source PRs: #91, #313, #314, #315, #316, #317, #318, #396, #397, #506, #509, #527, #535, #538, #549, #554, #732, #734, #749, #753, #801, #803, #806, #807, #826, #827, #828, #866, #867, #868, #870
   - Source commits: `082464aae4a8eea85350291a0a93f946d712a3cb`, `14eb5aa433fe2b0c231476a251c478e596ba6c2b`, `198c8e22e090ce337fdcb72545070d917082f2e4`, `1b3d814ee0ee1b7ec06ef88927df21efaba2639a`, `3a8004c9aa8ec3c66cc3f336f446054f2f3ab93c`, `55b8ac4dd743084b6fb17f35772d71e54adf4887`, `6434434e750ad6890db6c6ff5f7c6f3e9d3ee36c`, `723b566609908ff40d621e30efb8c95cff3f17c3`, `72ce3ba52ff18c27f0d5a884271c322171c215c6`, `76a6d686b1f508f134f0f29f3d79694c76313c45`, `77e7a8e5a5a9c684f9b27a74718fbe48959c02ad`, `8718daad62262893034264f248d239ee621b8181`, `9302bd8ba34c206f1c4bc53de8380f7e4e30fe57`, `9c02947e27a477402a2e3b774ab0d001c6fc8206`, `9d958453bc8afbc7b80ce7aff5f82598f1f2e970`, `d571a8491eb3cf15af7e24762cb90ac0e4a71424`, `f69bfbe65bda93235bfbaf7b38a895adca4c1382`
   - Classification/risk: `UNKNOWN` / `HIGH`
   - Dependencies: `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`
   - Tests: tests determined after manual domain attribution

## Required integration gates

1. Domain contracts and calculation/money correctness.
2. Backend aggregations, data quality, lineage, tenant authorization.
3. UI architecture and components.
4. Recommendations/actions.
5. Forecast infrastructure before forecast UI.
6. Compliance, audit, tests, and observability before production.
