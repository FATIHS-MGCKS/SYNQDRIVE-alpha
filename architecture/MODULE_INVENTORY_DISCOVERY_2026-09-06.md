# SynqDrive Repository-Wide Module Inventory Discovery

**Date:** 2026-09-06  
**Type:** Discovery evidence (not a module authority)  
**Registry updated:** [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](SYNQDRIVE_RENTAL_ARCHITECTURE.md)

---

## 1. Purpose and inventory-only scope

This report records repository-wide architectural module discovery performed to populate the canonical module registry overview table. It is **supporting evidence only** — not a module authority directory and not `AUTHORITY_ACTIVE`.

This workstream:

- discovered product/runtime modules from repository evidence
- assigned canonical inventory names and concise mini descriptions
- reconciled aliases and overlaps
- registered confirmed modules as `NOT_STARTED` in the central registry

This workstream did **not**:

- perform complete current-state or Production audits
- create module-authority directories
- add detailed authority sections for new modules
- promote any module to `AUDIT_IN_PROGRESS` or `AUTHORITY_ACTIVE`
- change runtime code, dependencies, schema, deployment, or Production

**Registration does not mean a module is understood, audited, canonical, Production-validated, or safe to change.**

---

## 2. Repository SHA inspected

| Field | Value |
|-------|-------|
| Base branch | `main` after merged PR #1545 |
| Merge commit cited | `06f647c7903443e343410806a73742ab5797667a` |
| Working tree HEAD at inventory | `140ebdd33c9102bcacb969ce5bef01b144c4b64a` |

---

## 3. Search methodology

1. Read binding governance: `AGENTS.md`, `SYNQDRIVE_RENTAL_ARCHITECTURE.md`, `MODULE_AUTHORITY_STANDARD.md`, `.cursor/rules/Architectur-Updates.mdc`, central validator scripts.
2. Enumerate backend NestJS modules via `backend/src/app.module.ts`, `backend/src/workers/workers.module.ts`, and all `backend/src/modules/**` directories.
3. Map `vehicle-intelligence/` nested domains to existing authorities before registering new modules.
4. Enumerate frontend surfaces via `frontend/src/App.tsx`, rental/master/operator navigation configs, feature directories, and `frontend/src/lib/api.ts` namespaces.
5. Cross-check Prisma `schema.prisma` model clusters for persistence boundaries.
6. Review workers, queues, schedulers, and webhook controllers for runtime-bearing domains.
7. Reconcile aliases, subcomponents, shared infrastructure, and ambiguous candidates.
8. Second independent reconciliation pass (see §12).

---

## 4. Repository areas inspected

| Area | Paths / artifacts |
|------|-------------------|
| Backend modules | `backend/src/modules/**` (68 top-level dirs + nested VI, DIMO, workflows, voice, notifications, etc.) |
| Backend workers | `backend/src/workers/**` |
| Shared runtime | `backend/src/shared/**` |
| Frontend surfaces | `frontend/src/rental/**`, `frontend/src/master/**`, `frontend/src/operator/**`, `frontend/src/lib/api.ts` |
| Data model | `backend/prisma/schema.prisma` |
| Architecture memos | `architecture/*.md`, `architecture/knowledge-graphs/**` (supporting evidence only) |
| Existing authorities | Six `AUTHORITY_ACTIVE` directories (read-only; not modified) |
| Ops / deploy scripts | `backend/scripts/ops/**` (domain identification only; not executed) |

---

## 5. Existing active authorities preserved

The following six registry rows remain **`AUTHORITY_ACTIVE`** with unchanged metadata and authority directories:

| Module | Authority path |
|--------|----------------|
| Automatic Trip Enrichment (ATE) | `architecture/knowledge-graphs/automatic-trip-enrichment/` |
| Battery V2 | `architecture/battery-v2/` |
| Driving Intelligence | `architecture/drivingintelligence/` |
| Energy Event Detection (EED) | `architecture/knowledge-graphs/energy-event-detection/` |
| Scaling Process | `architecture/scaling-process/` |
| Tankstellenerkennung | `architecture/tankstellenerkennung/` |

---

## 6. Newly registered modules (57)

All new rows use:

- Registry status: `NOT_STARTED`
- Authority-native status: `N/A — inventory only`
- Authority path: `—`

See the canonical overview table in [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](SYNQDRIVE_RENTAL_ARCHITECTURE.md) for the authoritative list. Summary count: **57 newly registered `NOT_STARTED` modules**.

---

## 7. Per-module discovery evidence

### Account & Self-Service

- **Mini description:** End-user account profile, preferences, and self-service account operations.
- **Evidence:** `backend/src/modules/account/`, `api.account` in frontend.
- **Aliases:** `account`, `AccountController`
- **Entry points:** `GET/PATCH /api/v1/account/*`, rental settings account tab
- **Qualifies because:** Distinct self-service API and UI surface separate from org admin user management.
- **Status:** `NOT_STARTED`

### Activity Log & HTTP Audit

- **Evidence:** `backend/src/modules/activity-log/`, global audit interceptor targets.
- **Aliases:** `activity-log`, `AuditService`
- **Entry points:** `ActivityLogController`, master-admin audit export
- **Qualifies because:** Cross-cutting operational audit product surface with dedicated API.
- **Status:** `NOT_STARTED`

### AI Platform (Fleet Chat & Tools)

- **Evidence:** `backend/src/modules/ai/` (chat, llm, tools, document extraction AI, vehicle-specs).
- **Aliases:** `ai`, `FleetChatOrchestratorService`, `api.chat`
- **Entry points:** `ChatController`, rental `AIAssistantView`
- **Qualifies because:** Independent LLM gateway, tool registry, limits, and fleet chat orchestration.
- **Status:** `NOT_STARTED`

### Auth API

- **Evidence:** `backend/src/modules/auth/` (distinct from `shared/auth` Clerk guards).
- **Aliases:** `auth`, `AuthController`, `RefreshTokenService`
- **Entry points:** `/api/v1/auth/*`, `frontend/src/pages/LoginPage.tsx`
- **Qualifies because:** Tenant auth API boundary complementing shared infrastructure guards.
- **Status:** `NOT_STARTED`

### Billing (SynqDrive SaaS)

- **Evidence:** `backend/src/modules/billing/`, Stripe webhooks, subscription models in Prisma.
- **Aliases:** `billing`, `MasterSubscriptionController`
- **Entry points:** `BillingController`, master `BillingControlCenter`, rental settings billing tab
- **Qualifies because:** SynqDrive tenant SaaS monetization distinct from rental customer payments.
- **Status:** `NOT_STARTED`

### Bookings

- **Evidence:** `backend/src/modules/bookings/` (+ eligibility, pickup-gate, allowed-drivers, overdue-return).
- **Aliases:** `bookings`, `BookingEligibilityGatekeeperService`
- **Entry points:** `BookingsController`, rental `BookingsView`, operator handover flows
- **Qualifies because:** Core rental reservation lifecycle with multiple sub-gates but single product ownership.
- **Status:** `NOT_STARTED`

### Brakes Health

- **Evidence:** `backend/src/modules/vehicle-intelligence/brakes/`
- **Aliases:** `BrakesService`, `BrakeRecalculationProcessor`
- **Entry points:** VI brakes APIs, rental health brakes popup
- **Qualifies because:** First-class health module per product architecture; distinct lifecycle and persistence.
- **Maps to:** Not Battery V2 or Driving Intelligence authority (consumer of DI events only).
- **Status:** `NOT_STARTED`

### Business Audit

- **Evidence:** `backend/src/modules/business-audit/`, `BusinessAuditOutbox` Prisma model.
- **Aliases:** `business-audit`, `BusinessAuditService`
- **Entry points:** Global business audit outbox processor/scheduler
- **Qualifies because:** Durable business-event audit domain with outbox lifecycle.
- **Status:** `NOT_STARTED`

### Business Insights

- **Evidence:** `backend/src/modules/business-insights/`
- **Aliases:** `DashboardInsightsController`, detector-based insights
- **Entry points:** Rental dashboard insights context
- **Qualifies because:** Detector pipeline producing operational insight signals.
- **Status:** `NOT_STARTED`

### Communication Center

- **Evidence:** `backend/src/modules/communication/` (read/write/reply, adapters, retention).
- **Aliases:** `communication`, `CommunicationReadController`
- **Entry points:** Rental `CommunicationCenterView`, `api.communication`
- **Qualifies because:** Canonical omnichannel conversation product surface.
- **Status:** `NOT_STARTED`

### Customer Verification (Didit)

- **Evidence:** `backend/src/modules/customer-verification/`, Didit provider.
- **Aliases:** `customer-verification`, `DiditWebhookController`
- **Entry points:** `/verification/done`, operator verification flows
- **Qualifies because:** Identity verification integration with webhook boundary.
- **Status:** `NOT_STARTED`

### Customers

- **Evidence:** `backend/src/modules/customers/`
- **Aliases:** `customers`, `CustomersController`
- **Entry points:** Rental `CustomersView`, `CustomerDetailView`
- **Qualifies because:** Org-scoped rental CRM domain.
- **Status:** `NOT_STARTED`

### Damages

- **Evidence:** `backend/src/modules/vehicle-intelligence/damages/`, `damage-incidents/`
- **Aliases:** `damages`, `DamagesService`
- **Entry points:** Rental `DamagesView`, operator damage capture
- **Qualifies because:** Structured damage records with pin/image semantics.
- **Status:** `NOT_STARTED`

### Dashboard Utilization

- **Evidence:** `backend/src/modules/dashboard-utilization/`
- **Aliases:** `dashboard-utilization`
- **Entry points:** `DashboardUtilizationController`, rental dashboard tiles
- **Qualifies because:** Fleet utilization metrics API distinct from business insights detectors.
- **Status:** `NOT_STARTED`

### Data Analyse

- **Evidence:** `backend/src/modules/data-analyse/`, `api.rentalDrivingAnalyses`, `api.misuseCases`
- **Aliases:** `data-analyse`, `DataAnalyseView`
- **Entry points:** Rental advanced analytics view
- **Qualifies because:** Permission-gated advanced analytics consuming Driving Intelligence outputs.
- **Status:** `NOT_STARTED`

### Data Authorizations

- **Evidence:** `backend/src/modules/data-authorizations/`
- **Aliases:** `data-authorizations`, rental settings data-authorization tab
- **Entry points:** `DataAuthorizationsController`
- **Qualifies because:** Tenant consent enforcement for AI and sensitive data access.
- **Status:** `NOT_STARTED`

### DIMO Integration

- **Evidence:** `backend/src/modules/dimo/` (telemetry, segments, triggers, webhooks, connectivity).
- **Aliases:** `dimo`, `DimoSegmentsService`, `DimoWebhookController`
- **Entry points:** `api.dimo`, master platform integrations, VI trip/energy consumers
- **Qualifies because:** External telematics integration layer with independent auth and webhook surface.
- **Maps to:** Consumed by EED, ATE, Trip Detection — not a duplicate of those authorities.
- **Status:** `NOT_STARTED`

### Document Extraction (AI Upload)

- **Evidence:** `backend/src/modules/document-extraction/`
- **Aliases:** `document-extraction`, `DocumentExtractionApplyService`
- **Entry points:** Rental `DocumentUploadView`, operator `ai-upload/`
- **Qualifies because:** Shared ingestion architecture (upload → extract → review → apply).
- **Status:** `NOT_STARTED`

### Documents

- **Evidence:** `backend/src/modules/documents/` (+ booking generation, retention, malware scanner).
- **Aliases:** `documents`, `LegalDocumentsController`
- **Entry points:** Rental `DocumentsView`, booking document bundles
- **Qualifies because:** Document storage, legal texts, contracts, and integrity controls.
- **Status:** `NOT_STARTED`

### DTC / Error Codes

- **Evidence:** `backend/src/modules/vehicle-intelligence/dtc/`, `dtc-knowledge/`
- **Aliases:** `dtc`, `DtcKnowledgeEnrichmentService`
- **Entry points:** Rental health error codes surfaces
- **Qualifies because:** First-class error-code health module.
- **Status:** `NOT_STARTED`

### Evaluations Analytics

- **Evidence:** `backend/src/modules/evaluations-analytics/` (+ e4, e5, e7, privacy, audit subdirs).
- **Aliases:** `evaluations-analytics`, `EvaluationsInsightsController`, `api.evaluations`
- **Entry points:** Rental `EvaluationsPage` / Financial Insights
- **Qualifies because:** Entity-scoped evaluation analytics product (insights, quality, recommendations).
- **Status:** `NOT_STARTED`

### Evaluations Finance

- **Evidence:** `backend/src/modules/evaluations-finance/`
- **Aliases:** `evaluations-finance`
- **Entry points:** `EvaluationsFinanceController`
- **Qualifies because:** Distinct finance evaluation API layer.
- **Status:** `NOT_STARTED`

### Fines

- **Evidence:** `backend/src/modules/fines/`
- **Aliases:** `fines`, `FinesView`
- **Entry points:** `FinesController`
- **Qualifies because:** Traffic/parking fine operational domain.
- **Status:** `NOT_STARTED`

### High Mobility Integration

- **Evidence:** `backend/src/modules/high-mobility/` (+ compatibility).
- **Aliases:** `high-mobility`, `HighMobilityWebhookController`, `api.highMobility`
- **Entry points:** Master `HighMobilityDataView`
- **Qualifies because:** HM telemetry integration with registration and compatibility intelligence.
- **Status:** `NOT_STARTED`

### IAM Data Retention

- **Evidence:** `backend/src/modules/iam-data-retention/`
- **Aliases:** `iam-data-retention`, `MasterAdminUserDeletionController`
- **Entry points:** GDPR deletion workers and admin APIs
- **Qualifies because:** IAM retention and deletion product domain.
- **Status:** `NOT_STARTED`

### IAM MFA

- **Evidence:** `backend/src/modules/iam-mfa/`
- **Aliases:** `iam-mfa`, `IamMfaAccountController`
- **Entry points:** MFA enrollment UI components
- **Qualifies because:** MFA enrollment and step-up domain.
- **Status:** `NOT_STARTED`

### Insurances

- **Evidence:** `backend/src/modules/insurances/`
- **Aliases:** `insurances`, rental and master insurance views
- **Entry points:** `InsurancesController`
- **Qualifies because:** Insurance policy and partner channel domain.
- **Status:** `NOT_STARTED`

### Integrations Hub

- **Evidence:** `backend/src/modules/integrations/`
- **Aliases:** `integrations`, `IntegrationsController`
- **Entry points:** Tenant integrations settings
- **Qualifies because:** Generic tenant integration configuration surface.
- **Status:** `NOT_STARTED`

### Invoices

- **Evidence:** `backend/src/modules/invoices/`
- **Aliases:** `invoices`, rental finance invoices tab
- **Entry points:** `InvoicesController`
- **Qualifies because:** AR invoicing for rental operations.
- **Status:** `NOT_STARTED`

### Notifications

- **Evidence:** `backend/src/modules/notifications/` (evaluation, delivery, adapters, runtime).
- **Aliases:** `notifications`, `NotificationDeliveryProcessor`
- **Entry points:** `NotificationsController`, embedded notification consumption
- **Qualifies because:** Multi-channel notification product with outbox delivery.
- **Status:** `NOT_STARTED`

### Organizations & Tenancy

- **Evidence:** `backend/src/modules/organizations/`
- **Aliases:** `organizations`, `OrganizationsController`
- **Entry points:** Master org admin, rental settings company tab
- **Qualifies because:** Multi-tenant org foundation.
- **Status:** `NOT_STARTED`

### Outbound Email

- **Evidence:** `backend/src/modules/outbound-email/`
- **Aliases:** `outbound-email`, `ResendWebhookController`, `orgEmail`
- **Entry points:** Org/platform email APIs, rental email settings
- **Qualifies because:** Resend-based outbound email product.
- **Status:** `NOT_STARTED`

### Parts & Accessories

- **Evidence:** `backend/src/modules/parts-accessories/`
- **Aliases:** `parts-accessories`, Alzura/eBay adapters
- **Entry points:** Rental and master parts views
- **Qualifies because:** Parts procurement integration domain.
- **Status:** `NOT_STARTED`

### Payments (Rental Collections)

- **Evidence:** `backend/src/modules/payments/` (transitive in app module, used by bookings).
- **Aliases:** `payments`, `PaymentsConnectController`, `bookingPaymentRequests`
- **Entry points:** Rental customer payments tab, booking checkout
- **Qualifies because:** Stripe Connect rental payment collection distinct from SaaS billing.
- **Status:** `NOT_STARTED`

### Platform Admin

- **Evidence:** `backend/src/modules/platform-admin/`
- **Aliases:** `platform-admin`, `PlatformAdminController`, master admin APIs
- **Entry points:** Master admin surface (`/master`)
- **Qualifies because:** Cross-tenant master-admin operations domain.
- **Status:** `NOT_STARTED`

### Pricing & Deposits

- **Evidence:** `backend/src/modules/pricing/`, `backend/src/modules/deposit/`
- **Aliases:** `pricing`, `DepositResolverModule`, rental tariffs UI
- **Entry points:** `PricingController`, `FinanceView` price-tariffs
- **Qualifies because:** Tariff and deposit resolution for rental checkout.
- **Status:** `NOT_STARTED`

### Products (Rental Catalog)

- **Evidence:** `backend/src/modules/products/`
- **Aliases:** `products`, `ProductsController`
- **Entry points:** Product catalog APIs
- **Qualifies because:** Rental product definitions.
- **Status:** `NOT_STARTED`

### Prospects

- **Evidence:** `backend/src/modules/prospects/`
- **Aliases:** `prospects`, master `ProspectsView`
- **Entry points:** `ProspectsController`
- **Qualifies because:** Master-admin sales pipeline records.
- **Status:** `NOT_STARTED`

### Rental Driving Analysis

- **Evidence:** `backend/src/modules/rental-driving-analysis/`
- **Aliases:** `rental-driving-analysis`, `api.rentalDrivingAnalyses`
- **Entry points:** `RentalDrivingAnalysisController`
- **Qualifies because:** Rental-period driving aggregation layer consuming trip intelligence.
- **Maps to:** Consumes Driving Intelligence; not a duplicate authority.
- **Status:** `NOT_STARTED`

### Rental Health

- **Evidence:** `backend/src/modules/rental-health/`
- **Aliases:** `rental-health`, `api.rentalHealth`, fleet health service
- **Entry points:** Rental fleet hub and health tabs
- **Qualifies because:** Fleet-level health aggregation API (consumer of VI health modules).
- **Status:** `NOT_STARTED`

### Rental Rules

- **Evidence:** `backend/src/modules/rental-rules/`
- **Aliases:** `rental-rules`, rental settings rental-rules tab
- **Entry points:** `RentalRulesController`
- **Qualifies because:** Org rental policy configuration domain.
- **Status:** `NOT_STARTED`

### Service Cases

- **Evidence:** `backend/src/modules/service-cases/`
- **Aliases:** `service-cases`, fleet vendor work linkage
- **Entry points:** `ServiceCasesController`
- **Qualifies because:** Operational service-case tracking.
- **Status:** `NOT_STARTED`

### Service Events & Compliance

- **Evidence:** `backend/src/modules/vehicle-intelligence/service-events/`, `service-compliance/`
- **Aliases:** `service-events`, `service-compliance`, TÜV/oil change flows
- **Entry points:** Rental health service info surfaces
- **Qualifies because:** Service interval and compliance materialization.
- **Status:** `NOT_STARTED`

### SMS & Twilio Messaging

- **Evidence:** `backend/src/modules/sms/`, `backend/src/modules/twilio/`
- **Aliases:** `sms`, `twilio`, `SmsController`, `TwilioWebhookController`
- **Entry points:** Communication center SMS channel, Twilio webhooks
- **Qualifies because:** SMS persistence and Twilio provider boundary (channel under Communication Center).
- **Status:** `NOT_STARTED`

### Stations

- **Evidence:** `backend/src/modules/stations/` (+ geofence, transfers, booking-rules).
- **Aliases:** `stations`, `StationsV2ConfigService`
- **Entry points:** Rental `StationsView`, station detail
- **Qualifies because:** Station network and geofence domain.
- **Status:** `NOT_STARTED`

### Support

- **Evidence:** `backend/src/modules/support/`
- **Aliases:** `support`, rental/master `SupportView`
- **Entry points:** `SupportController`
- **Qualifies because:** Support ticket product surface.
- **Status:** `NOT_STARTED`

### Tasks & Work Orders

- **Evidence:** `backend/src/modules/tasks/` (+ outbox, automation, task-domain-v2).
- **Aliases:** `tasks`, `TaskAutomationOutboxProcessor`
- **Entry points:** Rental `TasksView`, operator tasks, vehicle tasks tab
- **Qualifies because:** Work order and task automation domain.
- **Status:** `NOT_STARTED`

### Technical Observations

- **Evidence:** `backend/src/modules/technical-observations/`
- **Aliases:** `technical-observations`
- **Entry points:** `TechnicalObservationsController`
- **Qualifies because:** Operator technical observation records.
- **Status:** `NOT_STARTED`

### Tires Health

- **Evidence:** `backend/src/modules/vehicle-intelligence/tires/`
- **Aliases:** `tires`, `TireRecalculationProcessor`
- **Entry points:** Rental health tires surfaces, operator tire measure
- **Qualifies because:** First-class tire health module.
- **Status:** `NOT_STARTED`

### Trip Detection & Lifecycle

- **Evidence:** `backend/src/modules/vehicle-intelligence/trips/` (FSM, detectors, policy, reconciliation — excluding ATE enrichment chain).
- **Aliases:** `TripDetectionOrchestrationService`, `TripDecisionEngine`, queue `TRIP_TRACKING`
- **Entry points:** Trip tracking processor, rental trips tab (boundaries), master trip FSM docs
- **Qualifies because:** Canonical trip boundary FSM distinct from post-finalize ATE enrichment.
- **Maps to:** Related to ATE/DI/EED but no `AUTHORITY_ACTIVE` authority yet.
- **Status:** `NOT_STARTED`

### Users & Invites

- **Evidence:** `backend/src/modules/users/`
- **Aliases:** `users`, `OrganizationInvitesController`, IAM roles
- **Entry points:** Rental settings users tab, master security access
- **Qualifies because:** Org user, invite, and role management domain.
- **Status:** `NOT_STARTED`

### Vehicle Health Summary

- **Evidence:** `backend/src/modules/vehicle-intelligence/health-summary/`, `dashboard-warning-lights/`, `vehicle-file/`
- **Aliases:** `health-summary`, `AiHealthCareAggregationService`, `VehicleFileSummaryService`
- **Entry points:** Rental health summary box, AI health care popup
- **Qualifies because:** Aggregated health projection layer across health modules.
- **Status:** `NOT_STARTED`

### Vehicles (Fleet Operations)

- **Evidence:** `backend/src/modules/vehicles/` (+ operational, connectivity).
- **Aliases:** `vehicles`, `VehiclesController`, fleet map
- **Entry points:** Rental fleet hub, vehicle detail anchor, master connected vehicles
- **Qualifies because:** Core fleet entity operations.
- **Status:** `NOT_STARTED`

### Vendors

- **Evidence:** `backend/src/modules/vendors/`
- **Aliases:** `vendors`, `VendorDetailView`
- **Entry points:** `VendorsController`
- **Qualifies because:** Workshop/vendor partner directory.
- **Status:** `NOT_STARTED`

### Voice Assistant Platform

- **Evidence:** `voice-assistant/`, `voice-webhook-ingestion/`, `voice-call-orchestration/`, `voice-mcp-gateway/`, `voice-billing/`, `voice-protection/`
- **Aliases:** ElevenLabs voice stack, `api.voiceAssistant`
- **Entry points:** Master voice admin, communication center voice channel
- **Qualifies because:** End-to-end voice agent product (control plane + ingestion + orchestration + MCP + billing + protection).
- **Status:** `NOT_STARTED`

### WhatsApp Business

- **Evidence:** `backend/src/modules/whatsapp/`
- **Aliases:** `whatsapp`, `WhatsAppWebhookController`
- **Entry points:** Communication center WhatsApp channel
- **Qualifies because:** WhatsApp Business API integration domain.
- **Status:** `NOT_STARTED`

### Workflows

- **Evidence:** `backend/src/modules/workflows/` (+ maker-checker, shadow, rollout, audit, bridge).
- **Aliases:** `workflows`, `WorkflowEngineService`
- **Entry points:** Rental `WorkflowAutomationView`
- **Qualifies because:** Configurable workflow automation engine.
- **Status:** `NOT_STARTED`

---

## 8. Alias-to-module mapping

| Alias / code name | Canonical module |
|-------------------|------------------|
| `behaviorEnrichment`, `TripBehaviorEnrichmentService`, `TRIP_BEHAVIOR_ENRICHMENT` | Automatic Trip Enrichment (ATE) |
| `battery-health`, `BatteryV2Service`, `BATTERY_V2` queue | Battery V2 |
| `driving-intelligence-jobs`, `driving-analysis-*`, `misuse-cases`, `findings`, `DRIVING_INTELLIGENCE` queue | Driving Intelligence |
| `energy-events`, `detectEnergyEvents`, `VehicleEnergyEvent` | Energy Event Detection (EED) |
| `fuel-stations`, `ENERGY_REFUEL_STATION_ENRICH`, `FuelStationEnrichment*` | Tankstellenerkennung |
| `SchedulerLeaderElection`, `WorkersModule`, `DimoProviderBudget` | Scaling Process |
| `trip-tracking`, `TripDetectionOrchestrationService`, trip FSM | Trip Detection & Lifecycle |
| `deposit`, `DepositResolverModule` | Pricing & Deposits |
| `evaluations-metrics`, `EvaluationsMetricController` | Evaluations Analytics (sub-layer) |
| `evaluations-observability` | Shared infrastructure (excluded) |
| `vehicle-warning-gdpr` | IAM Data Retention / Rental Health adjunct (subcomponent) |
| `legacy battery`, `vehicle-intelligence/battery/` | Battery V2 legacy path (subcomponent; not separate module) |
| `master-admin-smoke-lifecycle` | Platform Admin ops adjunct (subcomponent) |
| `clickhouse`, `observability`, `health` module | Shared infrastructure (excluded) |

---

## 9. Subcomponents of existing modules (not separately registered)

| Candidate | Owned by |
|-----------|----------|
| Misuse Cases (`misuse-cases/`) | Driving Intelligence authority |
| Findings (`findings/`) | Driving Intelligence authority |
| Post-finalize enrichment jobs (`enrichment-jobs/`, behavior enrichment processors) | Automatic Trip Enrichment (ATE) |
| Fuel station enrichment processor | Tankstellenerkennung |
| Battery V2 job producers/processors | Battery V2 |
| EED observability module | Energy Event Detection (EED) adjunct |
| Deposit resolver | Pricing & Deposits |
| Evaluations privacy/audit/e5/e7 subdirs | Evaluations Analytics |
| Vehicle detail observability | Vehicles / shared infrastructure |
| Communication adapters (sms/whatsapp/voice projections) | Communication Center channels |
| Twilio provider module | SMS & Twilio Messaging |
| Legacy `vehicle-intelligence/battery/` | Battery V2 (legacy; not inventoried separately) |

---

## 10. Shared infrastructure excluded from module registry

| Component | Reason |
|-----------|--------|
| `backend/src/modules/health/` | Liveness/readiness probes only |
| `backend/src/modules/observability/` | Prometheus metrics host |
| `backend/src/modules/clickhouse/` | Analytics mirror infrastructure |
| `backend/src/modules/iam-observability/` | IAM metrics adjunct |
| `backend/src/modules/fleet-health-observability/` | Pipeline observability |
| `backend/src/modules/evaluations-observability/` | API interceptor observability |
| `backend/src/modules/energy-events-observability/` | EED metrics adjunct |
| `backend/src/shared/database/`, `redis/`, `storage/`, `stripe/` | Platform infrastructure |
| `backend/src/shared/auth/` (Clerk guards) | Auth infrastructure (distinct from Auth API module) |
| `backend/src/workers/` (as host) | Job runtime host covered by Scaling Process authority |
| `backend/src/modules/master-admin-smoke-lifecycle/` | Ephemeral smoke-test helper |

---

## 11. Ambiguous or insufficiently evidenced candidates

| Candidate | Competing evidence | Decision |
|-----------|-------------------|----------|
| **Legacy Battery vs Battery V2** | `vehicle-intelligence/battery/` coexists with `battery-health/` authority | Map legacy path to Battery V2 subcomponent; do not register separately |
| **Rental Driving Analysis vs Data Analyse** | Both consume DI/misuse outputs; `rental-driving-analysis` is booking-scoped aggregation while `data-analyse` is permission-gated org analytics | Register both; boundary audit deferred |
| **Evaluations Metrics standalone** | Separate NestJS module but thin API over analytics core | Classified as sub-layer of Evaluations Analytics; not separate registry row |
| **Driver / customer self-service portal** | `DRIVER` role exists in backend; no `/driver` frontend route | No module registered — insufficient product surface |
| **Integrations Hub vs Platform Admin integrations** | Tenant `integrations/` vs master `platform-admin` integration views | Both registered — different tenancy scopes |
| **Vehicle File vs Vehicle Health Summary** | `vehicle-file/` provides dossier summary used by health tab | Merged into Vehicle Health Summary inventory row |
| **Trip Detection vs Driving Intelligence boundary** | Shared trip completion signals; DI owns post-trip behavior analysis, Trip Detection owns live FSM | Registered Trip Detection separately; full boundary audit deferred |

---

## 12. Second-pass reconciliation result

| Pass | Finding |
|------|---------|
| Backend vs frontend | Every major rental/master/operator nav item maps to a registered backend module or existing authority. No orphan frontend product surface without backend domain. |
| Frontend vs backend | Operator, rental, and master surfaces covered. No dedicated driver/customer portal → not registered. |
| Prisma clusters | Booking, vehicle, tire, brake, billing, notification, workflow, communication, voice, and evaluation model groups align with registered modules. |
| Workers/queues | All domain queues map to registered modules or existing authorities (ATE, Battery V2, DI, EED, Tankstellenerkennung, Trip Detection, etc.). |
| Architecture memos | Flat `architecture/*.md` and `docs/audits/**` treated as evidence only — not auto-promoted to authorities. |
| Duplicate names | Aliases reconciled (§8); no duplicate registry rows for EED/ATE/Tankstellenerkennung/DI/Battery V2. |
| Omissions check | Shared infra deliberately excluded (§10). Health sub-modules (tires, brakes, DTC, damages, service) registered per product pillar architecture. |
| Over-promotion check | Individual DTOs, hooks, processors, and test suites not registered as modules. |

**Second-pass conclusion:** 63 total registry modules (6 `AUTHORITY_ACTIVE` + 57 `NOT_STARTED`) is defensible for current repository evidence. Unresolved boundaries (§11) are explicit and deferred to future audits.

---

## 13. Coverage limitations

- Production runtime state was not inspected; queue names and deploy scripts used as supporting evidence only.
- Submodule boundaries inside large domains (especially `vehicle-intelligence/trips/` vs Driving Intelligence) require future audit — inventory names do not resolve all internal ownership questions.
- Frontend-only or backend-only stubs without coherent product surface were not registered.
- Internationalization and design-system components were out of scope.

---

## 14. Explicit audit disclaimer

**No full current-state audit or Production verification was performed for any newly registered module.**

**Registration means the module name and a minimal inventory description are known — not that architecture is complete, canonical, or safe to change.**

Future work must follow [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md) to promote modules from `NOT_STARTED` → `AUDIT_IN_PROGRESS` → `AUTHORITY_ACTIVE`.

---

## Inventory counts

| Metric | Count |
|--------|------:|
| Existing `AUTHORITY_ACTIVE` modules (preserved) | 6 |
| Newly registered `NOT_STARTED` modules | 57 |
| **Total registry modules** | **63** |
| Excluded aliases/subcomponents (documented) | 14 |
| Shared infrastructure exclusions | 11 |
| Unresolved ambiguous candidates | 7 |
