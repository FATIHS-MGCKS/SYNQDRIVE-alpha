# Phase 2 — Module Recovery Plan

These integration branch names are plans only; no recovery branch was created.

| Module | Planned branch | Change-sets | Highest risk | Status |
|---|---|---:|---|---|
| `evaluations` | `integration/evaluations-recovery-2026-08` | 43 | `CRITICAL` | `PLANNED` |
| `vehicle-detail` | `integration/vehicle-detail-recovery-2026-08` | 4 | `HIGH` | `PLANNED` |
| `fleet` | `integration/fleet-recovery-2026-08` | 6 | `HIGH` | `PLANNED` |
| `trips` | `integration/trips-recovery-2026-08` | 8 | `HIGH` | `PLANNED` |
| `health` | `integration/health-recovery-2026-08` | 11 | `HIGH` | `PLANNED` |
| `connectivity` | `integration/connectivity-recovery-2026-08` | 9 | `HIGH` | `PLANNED` |
| `bookings` | `integration/bookings-recovery-2026-08` | 14 | `CRITICAL` | `PLANNED` |
| `customers` | `integration/customers-recovery-2026-08` | 5 | `HIGH` | `PLANNED` |
| `documents` | `integration/documents-recovery-2026-08` | 11 | `CRITICAL` | `PLANNED` |
| `notifications` | `integration/notifications-recovery-2026-08` | 8 | `CRITICAL` | `PLANNED` |
| `workflow-automation` | `integration/workflow-automation-recovery-2026-08` | 9 | `CRITICAL` | `PLANNED` |
| `operator-app` | `integration/operator-app-recovery-2026-08` | 9 | `HIGH` | `PLANNED` |
| `billing-subscriptions` | `integration/billing-subscriptions-recovery-2026-08` | 8 | `CRITICAL` | `PLANNED` |
| `stripe-payments` | `integration/stripe-payments-recovery-2026-08` | 7 | `CRITICAL` | `PLANNED` |
| `voice-ai` | `integration/voice-ai-recovery-2026-08` | 10 | `CRITICAL` | `PLANNED` |
| `whatsapp-communications` | `integration/whatsapp-communications-recovery-2026-08` | 2 | `HIGH` | `PLANNED` |
| `integrations` | `integration/integrations-recovery-2026-08` | 8 | `CRITICAL` | `PLANNED` |
| `administration` | `integration/administration-recovery-2026-08` | 10 | `CRITICAL` | `PLANNED` |
| `roles-access` | `integration/roles-access-recovery-2026-08` | 8 | `CRITICAL` | `PLANNED` |
| `legal-compliance` | `integration/legal-compliance-recovery-2026-08` | 8 | `CRITICAL` | `PLANNED` |
| `master-admin` | `integration/master-admin-recovery-2026-08` | 5 | `HIGH` | `PLANNED` |
| `infrastructure` | `integration/infrastructure-recovery-2026-08` | 10 | `CRITICAL` | `PLANNED` |
| `observability` | `integration/observability-recovery-2026-08` | 7 | `CRITICAL` | `PLANNED` |
| `cross-cutting-platform` | `integration/cross-cutting-platform-recovery-2026-08` | 5 | `HIGH` | `PLANNED` |
| `documentation` | `integration/documentation-recovery-2026-08` | 7 | `CRITICAL` | `PLANNED` |
| `unknown` | `integration/unknown-recovery-2026-08` | 14 | `CRITICAL` | `PLANNED` |

## Capability package boundaries

Historical stack components are not package boundaries. Phase 3 should preserve these capability slices inside the module branches:

1. Dashboard/UI cleanup; 2. TOTP/IAM; 3. ClickHouse trip evidence; 4. Invoice payment command; 5. Generated-document lifecycle;
6. Fleet operational cache/read models; 7. Battery Health V2; 8. Driving Intelligence V2/canonical trip enrichment;
9. Document Intake V2 and confirmation/apply safety; 10. Stations V2/state/transfers; 11. Voice AI/Twilio;
12. Fleet connectivity/DIMO triggers; 13. Fleet service/health-task matching; 14. IAM role versions;
15. Legal documents/deposits/rental rules; 16. Booking remediation/finance; 17. Data Authorization;
18. Vehicle Detail aggregation; 19. Evaluations; 20. Workflow Automation; 21. Fleet Chat; 22. Vehicle warnings;
23. Operator App; 24. Notifications; 25. Master Admin/billing/tenant safety/backup/observability.

Provider/consumer relationships are explicit dependencies; shared audit/changelog files do not create a cross-cutting package.

## Package contents

### evaluations

`cs-evaluations-timezone-period-model`, `cs-evaluations-unified-kpi-contract`, `cs-evaluations-money-domain`, `cs-evaluations-money-migration`, `cs-evaluations-receivables`, `cs-evaluations-revenue-cashflow-result`, `cs-evaluations-multi-currency`, `cs-evaluations-finance-test-suite`, `cs-evaluations-summary-detail-separation`, `cs-evaluations-grouping-entity-references`, `cs-evaluations-analytics-summary`, `cs-evaluations-filter-architecture`, `cs-evaluations-tenant-isolation`, `cs-evaluations-analytics-contracts`, `cs-evaluations-cost-model`, `cs-evaluations-utilization`, `cs-evaluations-strength-detection`, `cs-evaluations-weakness-detection`, `cs-evaluations-driver-influence-analysis`, `cs-evaluations-data-quality`, `cs-evaluations-freshness-lineage`, `cs-evaluations-metric-state-ux`, `cs-evaluations-data-quality-panel`, `cs-evaluations-information-architecture`, `cs-evaluations-executive-kpi-strip`, `cs-evaluations-strength-weakness-cockpit`, `cs-evaluations-risk-cost-failure-visuals`, `cs-evaluations-mobile-readiness`, `cs-evaluations-accessibility-i18n`, `cs-evaluations-recommendation-domain`, `cs-evaluations-action-center`, `cs-evaluations-action-integrations`, `cs-evaluations-impact-measurement`, `cs-evaluations-predictive-analytics-architecture`, `cs-evaluations-feature-store`, `cs-evaluations-demand-revenue-utilization-forecast`, `cs-evaluations-maintenance-failure-forecast`, `cs-evaluations-backtesting-drift`, `cs-evaluations-forecast-ux`, `cs-evaluations-gdpr`, `cs-evaluations-roles-permissions`, `cs-evaluations-audit-logging`, `cs-evaluations-unresolved-residual`

### vehicle-detail

`cs-vehicle-detail-operational-ui`, `cs-vehicle-detail-tenant-and-access-controls`, `cs-vehicle-detail-testing-and-validation`, `cs-vehicle-detail-vehicles`

### fleet

`cs-fleet-api-and-domain-contracts`, `cs-fleet-operational-ui`, `cs-fleet-service-cases`, `cs-fleet-tenant-and-access-controls`, `cs-fleet-testing-and-validation`, `cs-fleet-vehicles`

### trips

`cs-trips-database-and-data-model`, `cs-trips-observability-and-operations`, `cs-trips-operational-ui`, `cs-trips-rental-driving-analysis`, `cs-trips-runtime-jobs-and-queues`, `cs-trips-tenant-and-access-controls`, `cs-trips-testing-and-validation`, `cs-trips-vehicle-intelligence`

### health

`cs-health-api-and-domain-contracts`, `cs-health-database-and-data-model`, `cs-health-health-core`, `cs-health-lib`, `cs-health-observability-and-operations`, `cs-health-operational-ui`, `cs-health-runtime-jobs-and-queues`, `cs-health-service-cases`, `cs-health-tenant-and-access-controls`, `cs-health-testing-and-validation`, `cs-health-vehicle-intelligence`

### connectivity

`cs-connectivity-api-and-domain-contracts`, `cs-connectivity-database-and-data-model`, `cs-connectivity-dimo`, `cs-connectivity-high-mobility`, `cs-connectivity-lib`, `cs-connectivity-operational-ui`, `cs-connectivity-runtime-jobs-and-queues`, `cs-connectivity-tenant-and-access-controls`, `cs-connectivity-testing-and-validation`

### bookings

`cs-bookings-api-and-domain-contracts`, `cs-bookings-bookings`, `cs-bookings-bookings-core`, `cs-bookings-business-insights`, `cs-bookings-database-and-data-model`, `cs-bookings-documents`, `cs-bookings-operational-ui`, `cs-bookings-operator-retention`, `cs-bookings-runtime-jobs-and-queues`, `cs-bookings-stations`, `cs-bookings-tenant-and-access-controls`, `cs-bookings-testing-and-validation`, `cs-bookings-vehicles`, `cs-bookings-workflows`

### customers

`cs-customers-api-and-domain-contracts`, `cs-customers-customer-verification`, `cs-customers-customers`, `cs-customers-operational-ui`, `cs-customers-runtime-jobs-and-queues`

### documents

`cs-documents-api-and-domain-contracts`, `cs-documents-ai`, `cs-documents-database-and-data-model`, `cs-documents-document-extraction`, `cs-documents-documents`, `cs-documents-documents-core`, `cs-documents-observability-and-operations`, `cs-documents-operational-ui`, `cs-documents-runtime-jobs-and-queues`, `cs-documents-tenant-and-access-controls`, `cs-documents-testing-and-validation`

### notifications

`cs-notifications-api-and-domain-contracts`, `cs-notifications-database-and-data-model`, `cs-notifications-notifications-core`, `cs-notifications-operational-ui`, `cs-notifications-runtime-jobs-and-queues`, `cs-notifications-tenant-and-access-controls`, `cs-notifications-testing-and-validation`, `cs-notifications-workflows`

### workflow-automation

`cs-workflow-automation-api-and-domain-contracts`, `cs-workflow-automation-database-and-data-model`, `cs-workflow-automation-observability-and-operations`, `cs-workflow-automation-operational-ui`, `cs-workflow-automation-runtime-jobs-and-queues`, `cs-workflow-automation-tenant-and-access-controls`, `cs-workflow-automation-testing-and-validation`, `cs-workflow-automation-vehicle-intelligence`, `cs-workflow-automation-workflows`

### operator-app

`cs-operator-app-api-and-domain-contracts`, `cs-operator-app-database-and-data-model`, `cs-operator-app-lib`, `cs-operator-app-observability-and-operations`, `cs-operator-app-operational-ui`, `cs-operator-app-operator-app-core`, `cs-operator-app-runtime-jobs-and-queues`, `cs-operator-app-tenant-and-access-controls`, `cs-operator-app-testing-and-validation`

### billing-subscriptions

`cs-billing-subscriptions-billing`, `cs-billing-subscriptions-billing-subscriptions-core`, `cs-billing-subscriptions-database-and-data-model`, `cs-billing-subscriptions-operational-ui`, `cs-billing-subscriptions-pricing`, `cs-billing-subscriptions-runtime-jobs-and-queues`, `cs-billing-subscriptions-tenant-and-access-controls`, `cs-billing-subscriptions-testing-and-validation`

### stripe-payments

`cs-stripe-payments-api-and-domain-contracts`, `cs-stripe-payments-billing`, `cs-stripe-payments-database-and-data-model`, `cs-stripe-payments-invoices`, `cs-stripe-payments-runtime-jobs-and-queues`, `cs-stripe-payments-stripe-payments-core`, `cs-stripe-payments-testing-and-validation`

### voice-ai

`cs-voice-ai-api-and-domain-contracts`, `cs-voice-ai-database-and-data-model`, `cs-voice-ai-document-extraction`, `cs-voice-ai-invoices`, `cs-voice-ai-operational-ui`, `cs-voice-ai-runtime-jobs-and-queues`, `cs-voice-ai-tenant-and-access-controls`, `cs-voice-ai-testing-and-validation`, `cs-voice-ai-twilio`, `cs-voice-ai-voice-mcp-gateway`

### whatsapp-communications

`cs-whatsapp-communications-testing-and-validation`, `cs-whatsapp-communications-workflows`

### integrations

`cs-integrations-api-and-domain-contracts`, `cs-integrations-billing`, `cs-integrations-database-and-data-model`, `cs-integrations-integrations-core`, `cs-integrations-observability-and-operations`, `cs-integrations-operational-ui`, `cs-integrations-tenant-and-access-controls`, `cs-integrations-testing-and-validation`

### administration

`cs-administration-api-and-domain-contracts`, `cs-administration-administration-core`, `cs-administration-business-audit`, `cs-administration-database-and-data-model`, `cs-administration-notifications`, `cs-administration-observability-and-operations`, `cs-administration-operational-ui`, `cs-administration-runtime-jobs-and-queues`, `cs-administration-tenant-and-access-controls`, `cs-administration-testing-and-validation`

### roles-access

`cs-roles-access-api-and-domain-contracts`, `cs-roles-access-bookings`, `cs-roles-access-database-and-data-model`, `cs-roles-access-lib`, `cs-roles-access-operational-ui`, `cs-roles-access-runtime-jobs-and-queues`, `cs-roles-access-tenant-and-access-controls`, `cs-roles-access-testing-and-validation`

### legal-compliance

`cs-legal-compliance-api-and-domain-contracts`, `cs-legal-compliance-database-and-data-model`, `cs-legal-compliance-notifications`, `cs-legal-compliance-operator-upload`, `cs-legal-compliance-runtime-jobs-and-queues`, `cs-legal-compliance-tenant-and-access-controls`, `cs-legal-compliance-testing-and-validation`, `cs-legal-compliance-vehicle-intelligence`

### master-admin

`cs-master-admin-api-and-domain-contracts`, `cs-master-admin-database-and-data-model`, `cs-master-admin-operational-ui`, `cs-master-admin-tenant-and-access-controls`, `cs-master-admin-twilio`

### infrastructure

`cs-infrastructure-api-and-domain-contracts`, `cs-infrastructure-ai`, `cs-infrastructure-clickhouse`, `cs-infrastructure-database-and-data-model`, `cs-infrastructure-infrastructure-core`, `cs-infrastructure-observability-and-operations`, `cs-infrastructure-operational-ui`, `cs-infrastructure-runtime-jobs-and-queues`, `cs-infrastructure-tenant-and-access-controls`, `cs-infrastructure-testing-and-validation`

### observability

`cs-observability-api-and-domain-contracts`, `cs-observability-database-and-data-model`, `cs-observability-observability-core`, `cs-observability-observability-and-operations`, `cs-observability-operational-ui`, `cs-observability-runtime-jobs-and-queues`, `cs-observability-tenant-and-access-controls`

### cross-cutting-platform

`cs-cross-cutting-platform-api-and-domain-contracts`, `cs-cross-cutting-platform-cross-cutting-platform-core`, `cs-cross-cutting-platform-database-and-data-model`, `cs-cross-cutting-platform-operational-ui`, `cs-cross-cutting-platform-testing-and-validation`

### documentation

`cs-documentation-api-and-domain-contracts`, `cs-documentation-database-and-data-model`, `cs-documentation-documentation-and-decisions`, `cs-documentation-observability-and-operations`, `cs-documentation-operational-ui`, `cs-documentation-runtime-jobs-and-queues`, `cs-documentation-tenant-and-access-controls`

### unknown

`cs-unknown-api-and-domain-contracts`, `cs-unknown-ai`, `cs-unknown-business-insights`, `cs-unknown-data-analyse`, `cs-unknown-database-and-data-model`, `cs-unknown-hooks`, `cs-unknown-i18n`, `cs-unknown-lib`, `cs-unknown-operational-ui`, `cs-unknown-runtime-jobs-and-queues`, `cs-unknown-tenant-and-access-controls`, `cs-unknown-testing-and-validation`, `cs-unknown-unknown-core`, `cs-unknown-vehicles`
