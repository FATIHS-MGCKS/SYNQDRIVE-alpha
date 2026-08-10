# Phase 2 — Capability Dependency Graph

Edge types are explicit; PR ancestry is not used as a capability dependency.

| From | To | Type | Reason |
|---|---|---|---|
| `cs-evaluations-analytics-contracts` | `cs-evaluations-metric-response-contract` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-metric-response-contract` | `cs-evaluations-metric-registry` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-metric-registry` | `cs-evaluations-calculation-versioning` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-calculation-versioning` | `cs-evaluations-timezone-period-model` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-timezone-period-model` | `cs-evaluations-money-domain` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-money-domain` | `cs-evaluations-multi-currency` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-multi-currency` | `cs-evaluations-receivables` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-receivables` | `cs-evaluations-revenue-cashflow` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-revenue-cashflow` | `cs-evaluations-cost-model` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-cost-model` | `cs-evaluations-utilization` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-utilization` | `cs-evaluations-analytics-summary` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-analytics-summary` | `cs-evaluations-grouped-insights` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-grouped-insights` | `cs-evaluations-driver-influence-analysis` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-driver-influence-analysis` | `cs-evaluations-strength-detection` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-strength-detection` | `cs-evaluations-weakness-detection` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-weakness-detection` | `cs-evaluations-data-quality` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-data-quality` | `cs-evaluations-freshness-lineage` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-freshness-lineage` | `cs-evaluations-tenant-isolation` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-tenant-isolation` | `cs-evaluations-roles-permissions` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-roles-permissions` | `cs-evaluations-gdpr` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-gdpr` | `cs-evaluations-audit-logging` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-audit-logging` | `cs-evaluations-filter-architecture` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-filter-architecture` | `cs-evaluations-information-architecture` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-information-architecture` | `cs-evaluations-metric-state-ux` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-metric-state-ux` | `cs-evaluations-data-quality-panel` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-data-quality-panel` | `cs-evaluations-executive-kpi-strip` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-executive-kpi-strip` | `cs-evaluations-strength-weakness-cockpit` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-strength-weakness-cockpit` | `cs-evaluations-risk-cost-visualizations` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-risk-cost-visualizations` | `cs-evaluations-mobile-readiness` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-mobile-readiness` | `cs-evaluations-accessibility-i18n` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-accessibility-i18n` | `cs-evaluations-recommendation-domain` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-recommendation-domain` | `cs-evaluations-action-center` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-action-center` | `cs-evaluations-action-integrations` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-action-integrations` | `cs-evaluations-impact-measurement` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-impact-measurement` | `cs-evaluations-predictive-analytics-architecture` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-predictive-analytics-architecture` | `cs-evaluations-feature-store` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-feature-store` | `cs-evaluations-demand-revenue-utilization-forecast` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-demand-revenue-utilization-forecast` | `cs-evaluations-maintenance-failure-forecast` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-maintenance-failure-forecast` | `cs-evaluations-backtesting-drift` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-backtesting-drift` | `cs-evaluations-forecast-ux` | `same-module ordering` | evaluations dependency sequence |
| `cs-evaluations-forecast-ux` | `cs-evaluations-evaluations-core` | `same-module ordering` | evaluations dependency sequence |
| `cs-observability-api-and-domain-contracts` | `cs-administration-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-administration-administration-core` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-administration-administration-core` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-administration-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-administration-observability-and-operations` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-administration-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-administration-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-administration-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-administration-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-administration-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-administration-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-billing-subscriptions-billing` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-billing` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-billing-subscriptions-core` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-operational-ui` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-pricing` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-billing-subscriptions-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-billing-subscriptions-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-billing-subscriptions-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-bookings-api-and-domain-contracts` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-bookings-bookings` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-bookings` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-bookings-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-documents` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-bookings-operational-ui` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-bookings-operational-ui` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-bookings-operator-retention` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-operator-retention` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-bookings-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-stations` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-bookings-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-bookings-workflows` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-connectivity-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-connectivity-dimo` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-connectivity-dimo` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-connectivity-high-mobility` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-connectivity-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-connectivity-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-connectivity-tenant-and-access-controls` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-connectivity-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-connectivity-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-cross-cutting-platform-api-and-domain-contracts` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-cross-cutting-platform-api-and-domain-contracts` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-cross-cutting-platform-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-cross-cutting-platform-cross-cutting-platform-core` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-cross-cutting-platform-cross-cutting-platform-core` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-cross-cutting-platform-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-cross-cutting-platform-operational-ui` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-cross-cutting-platform-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-customers-api-and-domain-contracts` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-customers-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-customers-customer-verification` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-customers-customers` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-customers-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-customers-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-customers-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-ai` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-documents-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-documents-document-extraction` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-document-extraction` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-documents` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-observability-and-operations` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-documents-operational-ui` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-documents-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-documents-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-documents-testing-and-validation` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-documents-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-accessibility-i18n` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-accessibility-i18n` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-action-center` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-action-center` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-action-integrations` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-action-integrations` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-analytics-contracts` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-analytics-contracts` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-analytics-summary` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-analytics-summary` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-audit-logging` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-audit-logging` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-backtesting-drift` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-backtesting-drift` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-calculation-versioning` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-calculation-versioning` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-cost-model` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-cost-model` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-data-quality` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-data-quality` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-data-quality-panel` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-data-quality-panel` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-demand-revenue-utilization-forecast` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-driver-influence-analysis` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-driver-influence-analysis` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-evaluations-core` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-executive-kpi-strip` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-executive-kpi-strip` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-feature-store` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-feature-store` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-filter-architecture` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-filter-architecture` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-forecast-ux` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-forecast-ux` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-freshness-lineage` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-freshness-lineage` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-gdpr` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-gdpr` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-grouped-insights` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-grouped-insights` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-information-architecture` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-information-architecture` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-maintenance-failure-forecast` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-metric-registry` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-metric-registry` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-metric-response-contract` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-metric-response-contract` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-metric-state-ux` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-metric-state-ux` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-mobile-readiness` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-mobile-readiness` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-money-domain` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-multi-currency` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-multi-currency` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-predictive-analytics-architecture` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-receivables` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-receivables` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-recommendation-domain` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-recommendation-domain` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-revenue-cashflow` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-revenue-cashflow` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-risk-cost-visualizations` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-risk-cost-visualizations` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-roles-permissions` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-roles-permissions` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-strength-weakness-cockpit` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-strength-weakness-cockpit` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-strength-detection` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-strength-detection` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-tenant-isolation` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-tenant-isolation` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-timezone-period-model` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-timezone-period-model` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-utilization` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-utilization` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-evaluations-weakness-detection` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-evaluations-weakness-detection` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-fleet-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-fleet-operational-ui` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-fleet-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-fleet-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-fleet-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-health-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-observability-and-operations` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-health-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-health-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-health-tenant-and-access-controls` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-health-vehicle-intelligence` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-health-vehicle-intelligence` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-integrations-api-and-domain-contracts` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-integrations-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-integrations-billing` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-integrations-billing` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-integrations-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-integrations-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-integrations-integrations-core` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-integrations-operational-ui` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-integrations-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-integrations-tenant-and-access-controls` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-integrations-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-integrations-testing-and-validation` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-integrations-testing-and-validation` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-integrations-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-legal-compliance-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-notifications` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-operator-upload` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-legal-compliance-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-legal-compliance-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-legal-compliance-tenant-and-access-controls` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-legal-compliance-vehicle-intelligence` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-legal-compliance-vehicle-intelligence` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-master-admin-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-master-admin-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-master-admin-operational-ui` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-master-admin-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-master-admin-twilio` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-notifications-core` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-notifications-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-notifications-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-notifications-tenant-and-access-controls` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-notifications-workflows` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-operator-app-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-operator-app-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-operator-app-lib` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-operator-app-observability-and-operations` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-operator-app-operational-ui` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-operator-app-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-operator-app-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-operator-app-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-operator-app-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-operator-app-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-stripe-payments-api-and-domain-contracts` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-stripe-payments-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-stripe-payments-billing` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-stripe-payments-billing` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-stripe-payments-billing` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-stripe-payments-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-stripe-payments-invoices` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-stripe-payments-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-stripe-payments-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-stripe-payments-stripe-payments-core` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-stripe-payments-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-trips-observability-and-operations` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-trips-observability-and-operations` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-observability-and-operations` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-operational-ui` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-rental-driving-analysis` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-trips-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-trips-testing-and-validation` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-trips-vehicle-intelligence` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-api-and-domain-contracts` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-business-insights` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-data-analyse` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-data-analyse` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-database-and-data-model` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-unknown-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-i18n` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-i18n` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-lib` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-lib` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-operational-ui` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-unknown-operational-ui` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-unknown-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-unknown-tenant-and-access-controls` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-unknown-unknown-core` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-unknown-unknown-core` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-unknown-core` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-unknown-vehicles` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-vehicle-detail-operational-ui` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-vehicle-detail-operational-ui` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-vehicle-detail-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-vehicle-detail-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-vehicle-detail-testing-and-validation` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-vehicle-detail-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-vehicle-detail-vehicles` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-voice-ai-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-document-extraction` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-voice-ai-invoices` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-invoices` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-voice-ai-operational-ui` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-voice-ai-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-voice-ai-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-twilio` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-voice-ai-voice-mcp-gateway` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-voice-ai-voice-mcp-gateway` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-whatsapp-communications-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-whatsapp-communications-workflows` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-workflow-automation-api-and-domain-contracts` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-api-and-domain-contracts` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-workflow-automation-database-and-data-model` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-workflow-automation-database-and-data-model` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-database-and-data-model` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-workflow-automation-observability-and-operations` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-observability-and-operations` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-workflow-automation-operational-ui` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-operational-ui` | `soft dependency` | observability foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-workflow-automation-runtime-jobs-and-queues` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-runtime-jobs-and-queues` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-workflow-automation-tenant-and-access-controls` | `hard dependency` | roles-access foundation |
| `cs-infrastructure-api-and-domain-contracts` | `cs-workflow-automation-tenant-and-access-controls` | `cross-module dependency` | infrastructure foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-tenant-and-access-controls` | `soft dependency` | observability foundation |
| `cs-roles-access-api-and-domain-contracts` | `cs-workflow-automation-testing-and-validation` | `hard dependency` | roles-access foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-testing-and-validation` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-vehicle-intelligence` | `soft dependency` | observability foundation |
| `cs-observability-api-and-domain-contracts` | `cs-workflow-automation-workflows` | `soft dependency` | observability foundation |

## Change-set nodes

| Change-set | Module | Capability | Dependencies |
|---|---|---|---|
| `cs-administration-api-and-domain-contracts` | `administration` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-administration-administration-core` | `administration` | Administration Core | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-administration-business-audit` | `administration` | Business Audit | — |
| `cs-administration-database-and-data-model` | `administration` | Database and data model | `cs-observability-api-and-domain-contracts` |
| `cs-administration-notifications` | `administration` | Notifications | — |
| `cs-administration-observability-and-operations` | `administration` | Observability and operations | `cs-observability-api-and-domain-contracts` |
| `cs-administration-operational-ui` | `administration` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-administration-runtime-jobs-and-queues` | `administration` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-administration-tenant-and-access-controls` | `administration` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-administration-testing-and-validation` | `administration` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-billing-subscriptions-billing` | `billing-subscriptions` | Billing | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-billing-subscriptions-billing-subscriptions-core` | `billing-subscriptions` | Billing Subscriptions Core | `cs-observability-api-and-domain-contracts` |
| `cs-billing-subscriptions-database-and-data-model` | `billing-subscriptions` | Database and data model | `cs-observability-api-and-domain-contracts` |
| `cs-billing-subscriptions-operational-ui` | `billing-subscriptions` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-billing-subscriptions-pricing` | `billing-subscriptions` | Pricing | `cs-observability-api-and-domain-contracts` |
| `cs-billing-subscriptions-runtime-jobs-and-queues` | `billing-subscriptions` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-billing-subscriptions-tenant-and-access-controls` | `billing-subscriptions` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-billing-subscriptions-testing-and-validation` | `billing-subscriptions` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-bookings-api-and-domain-contracts` | `bookings` | API and domain contracts | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-bookings-bookings` | `bookings` | Bookings | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-bookings-bookings-core` | `bookings` | Bookings Core | — |
| `cs-bookings-business-insights` | `bookings` | Business Insights | — |
| `cs-bookings-database-and-data-model` | `bookings` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-bookings-documents` | `bookings` | Documents | `cs-observability-api-and-domain-contracts` |
| `cs-bookings-operational-ui` | `bookings` | Operational UI | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-bookings-operator-retention` | `bookings` | Operator Retention | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-bookings-runtime-jobs-and-queues` | `bookings` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-bookings-stations` | `bookings` | Stations | `cs-observability-api-and-domain-contracts` |
| `cs-bookings-tenant-and-access-controls` | `bookings` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-bookings-testing-and-validation` | `bookings` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-bookings-vehicles` | `bookings` | Vehicles | — |
| `cs-bookings-workflows` | `bookings` | Workflows | `cs-observability-api-and-domain-contracts` |
| `cs-connectivity-api-and-domain-contracts` | `connectivity` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-connectivity-database-and-data-model` | `connectivity` | Database and data model | — |
| `cs-connectivity-dimo` | `connectivity` | Dimo | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-connectivity-high-mobility` | `connectivity` | High Mobility | `cs-observability-api-and-domain-contracts` |
| `cs-connectivity-lib` | `connectivity` | Lib | — |
| `cs-connectivity-operational-ui` | `connectivity` | Operational UI | — |
| `cs-connectivity-runtime-jobs-and-queues` | `connectivity` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-connectivity-tenant-and-access-controls` | `connectivity` | Tenant and access controls | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-connectivity-testing-and-validation` | `connectivity` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-cross-cutting-platform-api-and-domain-contracts` | `cross-cutting-platform` | API and domain contracts | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-cross-cutting-platform-cross-cutting-platform-core` | `cross-cutting-platform` | Cross Cutting Platform Core | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-cross-cutting-platform-database-and-data-model` | `cross-cutting-platform` | Database and data model | `cs-observability-api-and-domain-contracts` |
| `cs-cross-cutting-platform-operational-ui` | `cross-cutting-platform` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-cross-cutting-platform-testing-and-validation` | `cross-cutting-platform` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-customers-api-and-domain-contracts` | `customers` | API and domain contracts | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-customers-customer-verification` | `customers` | Customer Verification | `cs-observability-api-and-domain-contracts` |
| `cs-customers-customers` | `customers` | Customers | `cs-observability-api-and-domain-contracts` |
| `cs-customers-operational-ui` | `customers` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-customers-runtime-jobs-and-queues` | `customers` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-documentation-api-and-domain-contracts` | `documentation` | API and domain contracts | — |
| `cs-documentation-database-and-data-model` | `documentation` | Database and data model | — |
| `cs-documentation-documentation-and-decisions` | `documentation` | Documentation and decisions | — |
| `cs-documentation-observability-and-operations` | `documentation` | Observability and operations | — |
| `cs-documentation-operational-ui` | `documentation` | Operational UI | — |
| `cs-documentation-runtime-jobs-and-queues` | `documentation` | Runtime jobs and queues | — |
| `cs-documentation-tenant-and-access-controls` | `documentation` | Tenant and access controls | — |
| `cs-documents-api-and-domain-contracts` | `documents` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-documents-ai` | `documents` | Ai | `cs-observability-api-and-domain-contracts` |
| `cs-documents-database-and-data-model` | `documents` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-documents-document-extraction` | `documents` | Document Extraction | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-documents-documents` | `documents` | Documents | `cs-observability-api-and-domain-contracts` |
| `cs-documents-documents-core` | `documents` | Documents Core | — |
| `cs-documents-observability-and-operations` | `documents` | Observability and operations | `cs-observability-api-and-domain-contracts` |
| `cs-documents-operational-ui` | `documents` | Operational UI | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-documents-runtime-jobs-and-queues` | `documents` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-documents-tenant-and-access-controls` | `documents` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-documents-testing-and-validation` | `documents` | Testing and validation | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-evaluations-accessibility-i18n` | `evaluations` | Accessibility / i18n | `cs-evaluations-mobile-readiness`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-action-center` | `evaluations` | Action Center | `cs-evaluations-recommendation-domain`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-action-integrations` | `evaluations` | Action Integrations | `cs-evaluations-action-center`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-analytics-contracts` | `evaluations` | Analytics Contracts | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-analytics-summary` | `evaluations` | Analytics Summary | `cs-evaluations-utilization`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-audit-logging` | `evaluations` | Audit Logging | `cs-evaluations-gdpr`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-backtesting-drift` | `evaluations` | Backtesting / Drift | `cs-evaluations-maintenance-failure-forecast`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-calculation-versioning` | `evaluations` | Calculation Versioning | `cs-evaluations-metric-registry`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-cost-model` | `evaluations` | Cost Model | `cs-evaluations-revenue-cashflow`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-data-quality` | `evaluations` | Data Quality | `cs-evaluations-weakness-detection`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-data-quality-panel` | `evaluations` | Data Quality Panel | `cs-evaluations-metric-state-ux`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-demand-revenue-utilization-forecast` | `evaluations` | Demand / Revenue / Utilization Forecast | `cs-evaluations-feature-store`, `cs-observability-api-and-domain-contracts` |
| `cs-evaluations-driver-influence-analysis` | `evaluations` | Driver / Influence Analysis | `cs-evaluations-grouped-insights`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-evaluations-core` | `evaluations` | Evaluations Core | `cs-evaluations-forecast-ux`, `cs-observability-api-and-domain-contracts` |
| `cs-evaluations-executive-kpi-strip` | `evaluations` | Executive KPI Strip | `cs-evaluations-data-quality-panel`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-feature-store` | `evaluations` | Feature Store | `cs-evaluations-predictive-analytics-architecture`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-filter-architecture` | `evaluations` | Filter Architecture | `cs-evaluations-audit-logging`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-forecast-ux` | `evaluations` | Forecast UX | `cs-evaluations-backtesting-drift`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-freshness-lineage` | `evaluations` | Freshness / Lineage | `cs-evaluations-data-quality`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-gdpr` | `evaluations` | GDPR | `cs-evaluations-roles-permissions`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-grouped-insights` | `evaluations` | Grouped Insights | `cs-evaluations-analytics-summary`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-impact-measurement` | `evaluations` | Impact Measurement | `cs-evaluations-action-integrations` |
| `cs-evaluations-information-architecture` | `evaluations` | Information Architecture | `cs-evaluations-filter-architecture`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-maintenance-failure-forecast` | `evaluations` | Maintenance / Failure Forecast | `cs-evaluations-demand-revenue-utilization-forecast`, `cs-observability-api-and-domain-contracts` |
| `cs-evaluations-metric-registry` | `evaluations` | Metric Registry | `cs-evaluations-metric-response-contract`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-metric-response-contract` | `evaluations` | Metric Response Contract | `cs-evaluations-analytics-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-metric-state-ux` | `evaluations` | Metric State UX | `cs-evaluations-information-architecture`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-mobile-readiness` | `evaluations` | Mobile Readiness | `cs-evaluations-risk-cost-visualizations`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-money-domain` | `evaluations` | Money Domain | `cs-evaluations-timezone-period-model`, `cs-observability-api-and-domain-contracts` |
| `cs-evaluations-multi-currency` | `evaluations` | Multi-Currency | `cs-evaluations-money-domain`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-predictive-analytics-architecture` | `evaluations` | Predictive Analytics Architecture | `cs-evaluations-impact-measurement`, `cs-observability-api-and-domain-contracts` |
| `cs-evaluations-receivables` | `evaluations` | Receivables | `cs-evaluations-multi-currency`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-recommendation-domain` | `evaluations` | Recommendation Domain | `cs-evaluations-accessibility-i18n`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-revenue-cashflow` | `evaluations` | Revenue / Cashflow | `cs-evaluations-receivables`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-risk-cost-visualizations` | `evaluations` | Risk / Cost Visualizations | `cs-evaluations-strength-weakness-cockpit`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-roles-permissions` | `evaluations` | Roles / Permissions | `cs-evaluations-tenant-isolation`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-strength-weakness-cockpit` | `evaluations` | Strength / Weakness Cockpit | `cs-evaluations-executive-kpi-strip`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-strength-detection` | `evaluations` | Strength Detection | `cs-evaluations-driver-influence-analysis`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-tenant-isolation` | `evaluations` | Tenant Isolation | `cs-evaluations-freshness-lineage`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-timezone-period-model` | `evaluations` | Timezone / Period Model | `cs-evaluations-calculation-versioning`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-utilization` | `evaluations` | Utilization | `cs-evaluations-cost-model`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-evaluations-weakness-detection` | `evaluations` | Weakness Detection | `cs-evaluations-strength-detection`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-fleet-api-and-domain-contracts` | `fleet` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-fleet-operational-ui` | `fleet` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-fleet-service-cases` | `fleet` | Service Cases | — |
| `cs-fleet-tenant-and-access-controls` | `fleet` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-fleet-testing-and-validation` | `fleet` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-fleet-vehicles` | `fleet` | Vehicles | — |
| `cs-health-api-and-domain-contracts` | `health` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-health-database-and-data-model` | `health` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-health-health-core` | `health` | Health Core | — |
| `cs-health-lib` | `health` | Lib | — |
| `cs-health-observability-and-operations` | `health` | Observability and operations | `cs-observability-api-and-domain-contracts` |
| `cs-health-operational-ui` | `health` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-health-runtime-jobs-and-queues` | `health` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-health-service-cases` | `health` | Service Cases | — |
| `cs-health-tenant-and-access-controls` | `health` | Tenant and access controls | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-health-testing-and-validation` | `health` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-health-vehicle-intelligence` | `health` | Vehicle Intelligence | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-infrastructure-api-and-domain-contracts` | `infrastructure` | API and domain contracts | — |
| `cs-infrastructure-ai` | `infrastructure` | Ai | — |
| `cs-infrastructure-clickhouse` | `infrastructure` | Clickhouse | — |
| `cs-infrastructure-database-and-data-model` | `infrastructure` | Database and data model | — |
| `cs-infrastructure-infrastructure-core` | `infrastructure` | Infrastructure Core | — |
| `cs-infrastructure-observability-and-operations` | `infrastructure` | Observability and operations | — |
| `cs-infrastructure-operational-ui` | `infrastructure` | Operational UI | — |
| `cs-infrastructure-runtime-jobs-and-queues` | `infrastructure` | Runtime jobs and queues | — |
| `cs-infrastructure-tenant-and-access-controls` | `infrastructure` | Tenant and access controls | — |
| `cs-infrastructure-testing-and-validation` | `infrastructure` | Testing and validation | — |
| `cs-integrations-api-and-domain-contracts` | `integrations` | API and domain contracts | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-integrations-billing` | `integrations` | Billing | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-integrations-database-and-data-model` | `integrations` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-integrations-integrations-core` | `integrations` | Integrations Core | `cs-observability-api-and-domain-contracts` |
| `cs-integrations-observability-and-operations` | `integrations` | Observability and operations | — |
| `cs-integrations-operational-ui` | `integrations` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-integrations-tenant-and-access-controls` | `integrations` | Tenant and access controls | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-integrations-testing-and-validation` | `integrations` | Testing and validation | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-legal-compliance-api-and-domain-contracts` | `legal-compliance` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-legal-compliance-database-and-data-model` | `legal-compliance` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-legal-compliance-notifications` | `legal-compliance` | Notifications | `cs-observability-api-and-domain-contracts` |
| `cs-legal-compliance-operator-upload` | `legal-compliance` | Operator Upload | `cs-observability-api-and-domain-contracts` |
| `cs-legal-compliance-runtime-jobs-and-queues` | `legal-compliance` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-legal-compliance-tenant-and-access-controls` | `legal-compliance` | Tenant and access controls | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-legal-compliance-testing-and-validation` | `legal-compliance` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-legal-compliance-vehicle-intelligence` | `legal-compliance` | Vehicle Intelligence | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-master-admin-api-and-domain-contracts` | `master-admin` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-master-admin-database-and-data-model` | `master-admin` | Database and data model | `cs-observability-api-and-domain-contracts` |
| `cs-master-admin-operational-ui` | `master-admin` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-master-admin-tenant-and-access-controls` | `master-admin` | Tenant and access controls | `cs-observability-api-and-domain-contracts` |
| `cs-master-admin-twilio` | `master-admin` | Twilio | `cs-observability-api-and-domain-contracts` |
| `cs-notifications-api-and-domain-contracts` | `notifications` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-notifications-database-and-data-model` | `notifications` | Database and data model | `cs-observability-api-and-domain-contracts` |
| `cs-notifications-notifications-core` | `notifications` | Notifications Core | `cs-observability-api-and-domain-contracts` |
| `cs-notifications-operational-ui` | `notifications` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-notifications-runtime-jobs-and-queues` | `notifications` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-notifications-tenant-and-access-controls` | `notifications` | Tenant and access controls | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-notifications-testing-and-validation` | `notifications` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-notifications-workflows` | `notifications` | Workflows | `cs-observability-api-and-domain-contracts` |
| `cs-observability-api-and-domain-contracts` | `observability` | API and domain contracts | — |
| `cs-observability-database-and-data-model` | `observability` | Database and data model | — |
| `cs-observability-observability-core` | `observability` | Observability Core | — |
| `cs-observability-observability-and-operations` | `observability` | Observability and operations | — |
| `cs-observability-operational-ui` | `observability` | Operational UI | — |
| `cs-observability-runtime-jobs-and-queues` | `observability` | Runtime jobs and queues | — |
| `cs-observability-tenant-and-access-controls` | `observability` | Tenant and access controls | — |
| `cs-operator-app-api-and-domain-contracts` | `operator-app` | API and domain contracts | — |
| `cs-operator-app-database-and-data-model` | `operator-app` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-operator-app-lib` | `operator-app` | Lib | `cs-observability-api-and-domain-contracts` |
| `cs-operator-app-observability-and-operations` | `operator-app` | Observability and operations | `cs-observability-api-and-domain-contracts` |
| `cs-operator-app-operational-ui` | `operator-app` | Operational UI | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-operator-app-operator-app-core` | `operator-app` | Operator App Core | — |
| `cs-operator-app-runtime-jobs-and-queues` | `operator-app` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-operator-app-tenant-and-access-controls` | `operator-app` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-operator-app-testing-and-validation` | `operator-app` | Testing and validation | — |
| `cs-roles-access-api-and-domain-contracts` | `roles-access` | API and domain contracts | — |
| `cs-roles-access-bookings` | `roles-access` | Bookings | — |
| `cs-roles-access-database-and-data-model` | `roles-access` | Database and data model | — |
| `cs-roles-access-lib` | `roles-access` | Lib | — |
| `cs-roles-access-operational-ui` | `roles-access` | Operational UI | — |
| `cs-roles-access-runtime-jobs-and-queues` | `roles-access` | Runtime jobs and queues | — |
| `cs-roles-access-tenant-and-access-controls` | `roles-access` | Tenant and access controls | — |
| `cs-roles-access-testing-and-validation` | `roles-access` | Testing and validation | — |
| `cs-stripe-payments-api-and-domain-contracts` | `stripe-payments` | API and domain contracts | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-stripe-payments-billing` | `stripe-payments` | Billing | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-stripe-payments-database-and-data-model` | `stripe-payments` | Database and data model | `cs-observability-api-and-domain-contracts` |
| `cs-stripe-payments-invoices` | `stripe-payments` | Invoices | `cs-observability-api-and-domain-contracts` |
| `cs-stripe-payments-runtime-jobs-and-queues` | `stripe-payments` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-stripe-payments-stripe-payments-core` | `stripe-payments` | Stripe Payments Core | `cs-observability-api-and-domain-contracts` |
| `cs-stripe-payments-testing-and-validation` | `stripe-payments` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-trips-database-and-data-model` | `trips` | Database and data model | `cs-observability-api-and-domain-contracts` |
| `cs-trips-observability-and-operations` | `trips` | Observability and operations | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-trips-operational-ui` | `trips` | Operational UI | `cs-observability-api-and-domain-contracts` |
| `cs-trips-rental-driving-analysis` | `trips` | Rental Driving Analysis | `cs-observability-api-and-domain-contracts` |
| `cs-trips-runtime-jobs-and-queues` | `trips` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-trips-tenant-and-access-controls` | `trips` | Tenant and access controls | `cs-observability-api-and-domain-contracts` |
| `cs-trips-testing-and-validation` | `trips` | Testing and validation | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-trips-vehicle-intelligence` | `trips` | Vehicle Intelligence | `cs-observability-api-and-domain-contracts` |
| `cs-unknown-api-and-domain-contracts` | `unknown` | API and domain contracts | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-ai` | `unknown` | Ai | — |
| `cs-unknown-business-insights` | `unknown` | Business Insights | `cs-observability-api-and-domain-contracts` |
| `cs-unknown-data-analyse` | `unknown` | Data Analyse | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-database-and-data-model` | `unknown` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-hooks` | `unknown` | Hooks | — |
| `cs-unknown-i18n` | `unknown` | I18N | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-lib` | `unknown` | Lib | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-operational-ui` | `unknown` | Operational UI | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-runtime-jobs-and-queues` | `unknown` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-unknown-tenant-and-access-controls` | `unknown` | Tenant and access controls | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-testing-and-validation` | `unknown` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-unknown-unknown-core` | `unknown` | Unknown Core | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-unknown-vehicles` | `unknown` | Vehicles | `cs-observability-api-and-domain-contracts` |
| `cs-vehicle-detail-operational-ui` | `vehicle-detail` | Operational UI | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-vehicle-detail-tenant-and-access-controls` | `vehicle-detail` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-vehicle-detail-testing-and-validation` | `vehicle-detail` | Testing and validation | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-vehicle-detail-vehicles` | `vehicle-detail` | Vehicles | `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-api-and-domain-contracts` | `voice-ai` | API and domain contracts | `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-database-and-data-model` | `voice-ai` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-document-extraction` | `voice-ai` | Document Extraction | `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-invoices` | `voice-ai` | Invoices | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-operational-ui` | `voice-ai` | Operational UI | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-voice-ai-runtime-jobs-and-queues` | `voice-ai` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-tenant-and-access-controls` | `voice-ai` | Tenant and access controls | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-voice-ai-testing-and-validation` | `voice-ai` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-twilio` | `voice-ai` | Twilio | `cs-observability-api-and-domain-contracts` |
| `cs-voice-ai-voice-mcp-gateway` | `voice-ai` | Voice Mcp Gateway | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-whatsapp-communications-testing-and-validation` | `whatsapp-communications` | Testing and validation | `cs-observability-api-and-domain-contracts` |
| `cs-whatsapp-communications-workflows` | `whatsapp-communications` | Workflows | `cs-observability-api-and-domain-contracts` |
| `cs-workflow-automation-api-and-domain-contracts` | `workflow-automation` | API and domain contracts | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-workflow-automation-database-and-data-model` | `workflow-automation` | Database and data model | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-workflow-automation-observability-and-operations` | `workflow-automation` | Observability and operations | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-workflow-automation-operational-ui` | `workflow-automation` | Operational UI | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-workflow-automation-runtime-jobs-and-queues` | `workflow-automation` | Runtime jobs and queues | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts` |
| `cs-workflow-automation-tenant-and-access-controls` | `workflow-automation` | Tenant and access controls | `cs-infrastructure-api-and-domain-contracts`, `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-workflow-automation-testing-and-validation` | `workflow-automation` | Testing and validation | `cs-observability-api-and-domain-contracts`, `cs-roles-access-api-and-domain-contracts` |
| `cs-workflow-automation-vehicle-intelligence` | `workflow-automation` | Vehicle Intelligence | `cs-observability-api-and-domain-contracts` |
| `cs-workflow-automation-workflows` | `workflow-automation` | Workflows | `cs-observability-api-and-domain-contracts` |
