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
- produced an exhaustive coverage manifest classifying discovered structural candidates

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
| Inventory correction HEAD | PR #1548 manifest semantic correction commit (see git log) |

---

## 3. Search methodology

1. Read binding governance: `AGENTS.md`, `SYNQDRIVE_RENTAL_ARCHITECTURE.md`, `MODULE_AUTHORITY_STANDARD.md`, `.cursor/rules/Architectur-Updates.mdc`, central validator scripts.
2. Enumerate backend NestJS modules via `backend/src/app.module.ts`, `backend/src/workers/workers.module.ts`, and all `backend/src/modules/**` directories.
3. Map `vehicle-intelligence/` nested domains to existing authorities before registering new modules.
4. Enumerate frontend surfaces via `frontend/src/App.tsx`, rental/master/operator navigation configs, feature directories, and `frontend/src/lib/api.ts` namespaces.
5. Cross-check Prisma `schema.prisma` model clusters for persistence boundaries.
6. Review workers, queues, schedulers, and webhook controllers for runtime-bearing domains.
7. Build exhaustive coverage manifest with exactly one classification per discovered structural candidate (§8).
8. Reconcile aliases, subcomponents, shared infrastructure, unresolved boundaries, and insufficient-evidence candidates (§9–§12).
9. Second independent reconciliation pass (§13).

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

## 7. Per-module discovery evidence

### Account & Self-Service

- **Mini description:** End-user account profile, preferences, and self-service account operations for authenticated users.
- **Evidence:** `backend/src/modules/account/`, `api.account`
- **Aliases:** `account`, `AccountController`
- **Entry points:** Account APIs; rental settings account tab
- **Qualifies because:** Distinct self-service API and UI surface separate from org admin user management.
- **Independence signal:** Separate NestJS module, controller, and rental settings tab from Users & Invites.
- **Status:** `NOT_STARTED`

### Activity Log & HTTP Audit

- **Mini description:** Captures HTTP mutation audit trails and exposes activity-log APIs for org and master-admin review.
- **Evidence:** `backend/src/modules/activity-log/`
- **Aliases:** `activity-log`, `ActivityLogController`
- **Entry points:** HTTP mutation audit APIs
- **Qualifies because:** HTTP-level operational audit product surface.
- **Independence signal:** Separate module and activity-log persistence from Business Audit outbox domain.
- **Status:** `NOT_STARTED`

### AI Platform (Fleet Chat & Tools)

- **Mini description:** Org-scoped fleet AI chat, LLM gateway, document and vehicle AI tools, limits, and routing.
- **Evidence:** `backend/src/modules/ai/`
- **Aliases:** `ai`, `ChatController`, `api.chat`
- **Entry points:** Fleet chat and AI tools APIs
- **Qualifies because:** LLM gateway, tool registry, and fleet chat orchestration.
- **Independence signal:** Dedicated AI module with chat controller, provider routing, and tool registry.
- **Status:** `NOT_STARTED`

### Auth API

- **Mini description:** Tenant authentication API surface including token refresh and auth endpoints backing Clerk integration.
- **Evidence:** `backend/src/modules/auth/`
- **Aliases:** `auth`, `AuthController`
- **Entry points:** `/api/v1/auth/*`
- **Qualifies because:** Tenant auth API complementing shared Clerk guards.
- **Independence signal:** Separate Auth API module from `shared/auth` infrastructure guards.
- **Status:** `NOT_STARTED`

### Billing (SynqDrive SaaS)

- **Mini description:** Tenant subscription billing, Stripe SaaS catalog, usage metering, and master billing reconciliation.
- **Evidence:** `backend/src/modules/billing/`
- **Aliases:** `billing`, billing subscription models
- **Entry points:** Billing APIs; master billing control center
- **Qualifies because:** SynqDrive tenant SaaS monetization.
- **Independence signal:** Separate Stripe SaaS subscription models, controllers, and reconciliation schedulers from rental Payments.
- **Status:** `NOT_STARTED`

### Bookings

- **Mini description:** Rental booking lifecycle from wizard through handover, eligibility gates, pickup gate, and payment coupling.
- **Evidence:** `backend/src/modules/bookings/`
- **Aliases:** `bookings`, pickup-gate/eligibility subdirs
- **Entry points:** Bookings APIs; rental and operator booking flows
- **Qualifies because:** Core rental reservation lifecycle.
- **Independence signal:** Dedicated booking persistence cluster, controllers, and worker coupling to payments/documents.
- **Status:** `NOT_STARTED`

### Brakes Health

- **Mini description:** Brake component lifecycle, wear evidence, recalculation jobs, and brake health APIs for vehicle detail views.
- **Evidence:** `vehicle-intelligence/brakes/`
- **Aliases:** `BrakesService`, `BRAKE_RECALCULATION` queue
- **Entry points:** Brake health APIs and recalculation processor
- **Qualifies because:** First-class brake health domain.
- **Independence signal:** Own Prisma brake models, APIs, and `dimo.brake.recalculation` worker queue.
- **Status:** `NOT_STARTED`

### Business Audit

- **Mini description:** Durable business-event audit outbox with scheduled processing for operational audit records.
- **Evidence:** `backend/src/modules/business-audit/`
- **Aliases:** `BusinessAuditOutbox`
- **Entry points:** Business audit outbox processor/scheduler
- **Qualifies because:** Durable business-event audit outbox.
- **Independence signal:** Separate BusinessAuditOutbox persistence and processor from HTTP Activity Log.
- **Status:** `NOT_STARTED`

### Business Insights

- **Mini description:** Detector-based dashboard insight signals such as utilization, shortages, and fleet operational patterns.
- **Evidence:** `backend/src/modules/business-insights/`
- **Aliases:** `DashboardInsightsController`
- **Entry points:** Dashboard insights APIs
- **Qualifies because:** Detector pipeline for operational insight signals.
- **Independence signal:** Separate insights detectors/API from utilization aggregate metrics module.
- **Status:** `NOT_STARTED`

### Communication Center

- **Mini description:** Omnichannel conversation persistence and operator inbox across WhatsApp, SMS, and voice projections.
- **Evidence:** `backend/src/modules/communication/`
- **Aliases:** `communication`, conversation adapters
- **Entry points:** Communication center APIs and inbox UI
- **Qualifies because:** Canonical omnichannel conversation persistence.
- **Independence signal:** Own conversation persistence/API; channel modules (WhatsApp/SMS/Voice) feed projections separately.
- **Status:** `NOT_STARTED`

### Customer Verification (Didit)

- **Mini description:** Identity verification workflows and Didit webhook handling for rental eligibility.
- **Evidence:** `backend/src/modules/customer-verification/`
- **Aliases:** `DiditWebhookController`
- **Entry points:** Verification APIs and `/verification/done`
- **Qualifies because:** Identity verification integration with webhooks.
- **Independence signal:** Dedicated Didit provider module and webhook boundary.
- **Status:** `NOT_STARTED`

### Customers

- **Mini description:** Org-scoped rental customer records, profiles, and customer management APIs.
- **Evidence:** `backend/src/modules/customers/`
- **Aliases:** `customers`
- **Entry points:** Customers APIs and CRM UI
- **Qualifies because:** Org-scoped rental CRM.
- **Independence signal:** Separate customer persistence and controllers from bookings.
- **Status:** `NOT_STARTED`

### Damages

- **Mini description:** Structured vehicle damage records with pin and image semantics and org-facing damage management.
- **Evidence:** `vehicle-intelligence/damages/`, `damage-incidents/`
- **Aliases:** `damages`
- **Entry points:** Damages APIs and rental/operator UI
- **Qualifies because:** Structured damage records with pin/image semantics.
- **Independence signal:** Own damage persistence, APIs, and UI surfaces distinct from documents.
- **Status:** `NOT_STARTED`

### Dashboard Utilization

- **Mini description:** Fleet utilization metrics and dashboard aggregates for rental operations.
- **Evidence:** `backend/src/modules/dashboard-utilization/`
- **Aliases:** `DashboardUtilizationController`
- **Entry points:** Dashboard utilization APIs
- **Qualifies because:** Fleet utilization metrics aggregates.
- **Independence signal:** Separate utilization API module from detector-based Business Insights.
- **Status:** `NOT_STARTED`

### Data Analyse

- **Mini description:** Advanced org analytics including driving analyses and misuse-case views for permitted roles.
- **Evidence:** `backend/src/modules/data-analyse/`
- **Aliases:** `data-analyse`, `DataAnalyseView`
- **Entry points:** Advanced analytics APIs/UI
- **Qualifies because:** Permission-gated advanced org analytics.
- **Independence signal:** Separate module/API from booking-scoped Rental Driving Analysis.
- **Status:** `NOT_STARTED`

### Data Authorizations

- **Mini description:** Tenant data-access consent and authorization enforcement for AI and sensitive APIs.
- **Evidence:** `backend/src/modules/data-authorizations/`
- **Aliases:** `data-authorizations`
- **Entry points:** Data authorization APIs and settings tab
- **Qualifies because:** Tenant consent enforcement for AI/sensitive APIs.
- **Independence signal:** Dedicated consent enforcement module and settings surface.
- **Status:** `NOT_STARTED`

### DIMO Integration

- **Mini description:** DIMO auth, telemetry, segments, triggers, webhooks, device-connection episodes, and provider gateway.
- **Evidence:** `backend/src/modules/dimo/`
- **Aliases:** `DimoSegmentsService`, webhooks
- **Entry points:** DIMO APIs, webhooks, workers
- **Qualifies because:** External telematics integration layer.
- **Independence signal:** Separate integration module, auth, webhooks, and DIMO worker queues from Trip Detection consumer logic.
- **Status:** `NOT_STARTED`

### Document Extraction (AI Upload)

- **Mini description:** Shared upload-to-extraction-to-review-to-apply flow for operational document intake.
- **Evidence:** `backend/src/modules/document-extraction/`
- **Aliases:** `DOCUMENT_EXTRACTION` queue
- **Entry points:** AI upload APIs and operator/rental intake UI
- **Qualifies because:** Shared upload→extract→review→apply flow.
- **Independence signal:** Separate extraction jobs, apply service, and queue from document storage module.
- **Status:** `NOT_STARTED`

### Documents

- **Mini description:** Document storage, legal texts, rental contracts, booking document bundles, retention, and integrity controls.
- **Evidence:** `backend/src/modules/documents/`
- **Aliases:** `documents`, booking document generation
- **Entry points:** Documents APIs and vehicle documents UI
- **Qualifies because:** Document storage, contracts, retention, integrity.
- **Independence signal:** Own storage/retention/legal document controllers separate from extraction apply flow.
- **Status:** `NOT_STARTED`

### DTC / Error Codes

- **Mini description:** Diagnostic trouble code storage, knowledge enrichment, alerts, and error-code health surfaces.
- **Evidence:** `vehicle-intelligence/dtc/`, `dtc-knowledge/`
- **Aliases:** `DTC_KNOWLEDGE_ENRICHMENT` queue
- **Entry points:** DTC APIs and health error-code UI
- **Qualifies because:** Diagnostic trouble code health domain.
- **Independence signal:** Own DTC persistence, knowledge enrichment queue, and health UI module.
- **Status:** `NOT_STARTED`

### Evaluations Analytics

- **Mini description:** Entity-scoped evaluation analytics including insights, quality, and recommendation layers.
- **Evidence:** `evaluations-analytics/` (+ e4/e5/e7)
- **Aliases:** `api.evaluations`
- **Entry points:** Evaluations/financial insights UI
- **Qualifies because:** Entity-scoped evaluation analytics layers.
- **Independence signal:** Separate analytics controllers/modules from Evaluations Finance APIs.
- **Status:** `NOT_STARTED`

### Evaluations Finance

- **Mini description:** Financial evaluation analytics APIs for rental operational finance views.
- **Evidence:** `backend/src/modules/evaluations-finance/`
- **Aliases:** `EvaluationsFinanceController`
- **Entry points:** Finance evaluation APIs
- **Qualifies because:** Finance evaluation analytics layer.
- **Independence signal:** Dedicated finance evaluation module and controller separate from insights/quality layers.
- **Status:** `NOT_STARTED`

### Fines

- **Mini description:** Traffic and parking fine record management for fleet operations.
- **Evidence:** `backend/src/modules/fines/`
- **Aliases:** `fines`
- **Entry points:** Fines APIs and UI
- **Qualifies because:** Traffic/parking fine operations.
- **Independence signal:** Standalone fines module and persistence.
- **Status:** `NOT_STARTED`

### High Mobility Integration

- **Mini description:** HM telemetry ingestion, vehicle registration, compatibility intelligence, and webhooks.
- **Evidence:** `backend/src/modules/high-mobility/`
- **Aliases:** `HighMobilityWebhookController`
- **Entry points:** HM admin UI and webhooks
- **Qualifies because:** HM telemetry integration and compatibility intelligence.
- **Independence signal:** Separate HM integration module, MQTT/webhooks, and polling schedulers.
- **Status:** `NOT_STARTED`

### IAM Data Retention

- **Mini description:** GDPR user deletion, IAM retention policies, and master-admin deletion workflows.
- **Evidence:** `backend/src/modules/iam-data-retention/`
- **Aliases:** IAM retention schedulers
- **Entry points:** GDPR deletion APIs/workers
- **Qualifies because:** IAM retention and deletion domain.
- **Independence signal:** Dedicated retention policies, deletion controllers, and IamDataRetentionScheduler.
- **Status:** `NOT_STARTED`

### IAM MFA

- **Mini description:** Multi-factor authentication enrollment, step-up grants, and MFA administration.
- **Evidence:** `backend/src/modules/iam-mfa/`
- **Aliases:** `iam-mfa`
- **Entry points:** MFA enrollment/admin APIs
- **Qualifies because:** MFA enrollment and step-up domain.
- **Independence signal:** Separate MFA module and controllers from Auth API.
- **Status:** `NOT_STARTED`

### Insurances

- **Mini description:** Vehicle insurance policy management and insurance partner channel adapters.
- **Evidence:** `backend/src/modules/insurances/`
- **Aliases:** `insurances`
- **Entry points:** Insurance APIs and rental/master UI
- **Qualifies because:** Insurance policy and partner channels.
- **Independence signal:** Standalone insurances module with admin and tenant surfaces.
- **Status:** `NOT_STARTED`

### Integrations Hub

- **Mini description:** Tenant integrations configuration and connection management surface.
- **Evidence:** `backend/src/modules/integrations/`
- **Aliases:** `integrations`
- **Entry points:** Tenant integrations settings
- **Qualifies because:** Tenant integration configuration.
- **Independence signal:** Tenant-scoped integrations module distinct from master Platform Admin cross-tenant controls.
- **Status:** `NOT_STARTED`

### Invoices

- **Mini description:** Operational invoice records, issue and send flows, and accounts-receivable management for rentals.
- **Evidence:** `backend/src/modules/invoices/`
- **Aliases:** `invoices`
- **Entry points:** Invoices APIs and finance UI
- **Qualifies because:** AR invoicing for rentals.
- **Independence signal:** Separate invoice persistence/controllers from SaaS Billing and rental Payments.
- **Status:** `NOT_STARTED`

### Notifications

- **Mini description:** Multi-channel notification evaluation, preferences, delivery outbox, and in-app notification consumption.
- **Evidence:** `backend/src/modules/notifications/`
- **Aliases:** `NOTIFICATION_EVALUATION`, `NOTIFICATION_DELIVERY` queues
- **Entry points:** Notifications APIs and in-app consumption
- **Qualifies because:** Multi-channel notification evaluation and delivery.
- **Independence signal:** Own evaluation/delivery queues, outbox, and preference models.
- **Status:** `NOT_STARTED`

### Organizations & Tenancy

- **Mini description:** Multi-tenant organization profiles, operational settings, and tenant-scoped configuration.
- **Evidence:** `backend/src/modules/organizations/`
- **Aliases:** `organizations`
- **Entry points:** Org profile APIs and settings
- **Qualifies because:** Multi-tenant org foundation.
- **Independence signal:** Core tenant entity module underpinning org scoping across product.
- **Status:** `NOT_STARTED`

### Outbound Email

- **Mini description:** Resend-based outbound email for org, platform, and booking-document delivery.
- **Evidence:** `backend/src/modules/outbound-email/`
- **Aliases:** `ResendWebhookController`, `orgEmail`
- **Entry points:** Org/platform email APIs
- **Qualifies because:** Resend-based outbound email delivery.
- **Independence signal:** Separate email delivery module and webhooks from Communication Center messaging.
- **Status:** `NOT_STARTED`

### Parts & Accessories

- **Mini description:** Parts procurement integrations including Alzura and eBay marketplace adapters.
- **Evidence:** `backend/src/modules/parts-accessories/`
- **Aliases:** Alzura/eBay adapters
- **Entry points:** Parts APIs and rental/master UI
- **Qualifies because:** Parts procurement integrations.
- **Independence signal:** Standalone marketplace integration module.
- **Status:** `NOT_STARTED`

### Payments (Rental Collections)

- **Mini description:** Stripe Connect payment collection for booking and organization payment requests.
- **Evidence:** `backend/src/modules/payments/`
- **Aliases:** `PaymentsConnectController`
- **Entry points:** Customer payments UI and booking checkout
- **Qualifies because:** Stripe Connect rental payment collection.
- **Independence signal:** Separate Connect payment flows/models from SaaS Billing subscriptions.
- **Status:** `NOT_STARTED`

### Platform Admin

- **Mini description:** Master-admin operations dashboard, security governance, and cross-tenant platform controls.
- **Evidence:** `backend/src/modules/platform-admin/`
- **Aliases:** `PlatformAdminController`
- **Entry points:** Master admin `/master` surface
- **Qualifies because:** Cross-tenant master-admin operations.
- **Independence signal:** Master-admin tenancy boundary and controllers separate from tenant Integrations Hub.
- **Status:** `NOT_STARTED`

### Pricing & Deposits

- **Mini description:** Rental tariff pricing rules, publish flow, and deposit resolution for checkout.
- **Evidence:** `pricing/`, `deposit/`
- **Aliases:** `PricingController`, `DepositResolverModule`
- **Entry points:** Tariffs UI and pricing APIs
- **Qualifies because:** Tariff and deposit resolution for checkout.
- **Independence signal:** Own pricing/deposit modules and publish flow separate from Products catalog.
- **Status:** `NOT_STARTED`

### Products (Rental Catalog)

- **Mini description:** Rental product catalog definitions and org product assignments.
- **Evidence:** `backend/src/modules/products/`
- **Aliases:** `products`
- **Entry points:** Product catalog APIs
- **Qualifies because:** Rental product definitions.
- **Independence signal:** Standalone product catalog module from pricing rules.
- **Status:** `NOT_STARTED`

### Prospects

- **Mini description:** Pre-customer prospect and lead records for master-admin sales pipeline.
- **Evidence:** `backend/src/modules/prospects/`
- **Aliases:** `prospects`
- **Entry points:** Master prospects UI
- **Qualifies because:** Master-admin sales pipeline records.
- **Independence signal:** Separate prospects module from tenant Customers.
- **Status:** `NOT_STARTED`

### Rental Driving Analysis

- **Mini description:** Rental-period driving analysis aggregation for bookings and drivers consuming trip intelligence.
- **Evidence:** `backend/src/modules/rental-driving-analysis/`
- **Aliases:** `api.rentalDrivingAnalyses`
- **Entry points:** Rental driving analysis APIs
- **Qualifies because:** Booking-scoped driving aggregation consuming trip intelligence.
- **Independence signal:** Dedicated rental-driving-analysis module/API separate from org-wide Data Analyse surface.
- **Status:** `NOT_STARTED`

### Rental Health

- **Mini description:** Fleet-level health aggregation consuming source vehicle health modules without recalculating.
- **Evidence:** `backend/src/modules/rental-health/`
- **Aliases:** `api.rentalHealth`
- **Entry points:** Fleet hub health aggregation APIs
- **Qualifies because:** Fleet-level health aggregation without recalculating source modules.
- **Independence signal:** Separate rental-health aggregation API from per-vehicle Vehicle Health Summary projection layer.
- **Status:** `NOT_STARTED`

### Rental Rules

- **Mini description:** Org-level rental policy and rules configuration governing bookings and operations.
- **Evidence:** `backend/src/modules/rental-rules/`
- **Aliases:** `rental-rules`
- **Entry points:** Rental rules settings tab
- **Qualifies because:** Org rental policy configuration.
- **Independence signal:** Standalone rental rules module and settings surface.
- **Status:** `NOT_STARTED`

### Service Cases

- **Mini description:** Operational service-case tracking linked to fleet maintenance and vendor work.
- **Evidence:** `backend/src/modules/service-cases/`
- **Aliases:** `service-cases`
- **Entry points:** Service case APIs and fleet vendor linkage
- **Qualifies because:** Operational service-case tracking.
- **Independence signal:** Own service-case persistence/controllers separate from Tasks.
- **Status:** `NOT_STARTED`

### Service Events & Compliance

- **Mini description:** Oil change, TÜV, service intervals, and compliance task materialization for vehicles.
- **Evidence:** `service-events/`, `service-compliance/`
- **Aliases:** TÜV/oil change flows
- **Entry points:** Service info health UI
- **Qualifies because:** Service interval and compliance materialization.
- **Independence signal:** Own service event/compliance persistence and health UI submodule set.
- **Status:** `NOT_STARTED`

### SMS & Twilio Messaging

- **Mini description:** SMS conversation persistence and Twilio provider provisioning for messaging channels.
- **Evidence:** `sms/`, `twilio/`
- **Aliases:** `SmsPersistenceModule`, `TwilioWebhookController`
- **Entry points:** SMS channel in communication center
- **Qualifies because:** SMS persistence and Twilio provider boundary.
- **Independence signal:** Separate SMS/Twilio modules and webhooks; Communication Center owns canonical conversation store.
- **Status:** `NOT_STARTED`

### Stations

- **Mini description:** Rental station locations, geofencing, booking rules, transfers, and Stations V2 configuration.
- **Evidence:** `backend/src/modules/stations/`
- **Aliases:** geofence/transfers subdirs
- **Entry points:** Stations APIs and rental UI
- **Qualifies because:** Station network, geofencing, transfers.
- **Independence signal:** Dedicated stations module with geofence/booking-rules subdomains.
- **Status:** `NOT_STARTED`

### Support

- **Mini description:** Customer and operator support ticket APIs and in-app support surfaces.
- **Evidence:** `backend/src/modules/support/`
- **Aliases:** `support`
- **Entry points:** Support APIs and rental/master UI
- **Qualifies because:** Support ticket product surface.
- **Independence signal:** Standalone support module and ticket APIs.
- **Status:** `NOT_STARTED`

### Tasks & Work Orders

- **Mini description:** Work orders, task domain V2, and task automation outbox processing.
- **Evidence:** `backend/src/modules/tasks/`
- **Aliases:** `TASK_AUTOMATION` queue
- **Entry points:** Tasks APIs and rental/operator UI
- **Qualifies because:** Work orders and task automation outbox.
- **Independence signal:** Own task domain V2, automation outbox queue, and controllers separate from Workflows engine.
- **Status:** `NOT_STARTED`

### Technical Observations

- **Mini description:** Operator technical observation records feeding notifications and workflow triggers.
- **Evidence:** `backend/src/modules/technical-observations/`
- **Aliases:** `technical-observations`
- **Entry points:** Technical observations APIs
- **Qualifies because:** Operator technical observation records.
- **Independence signal:** Standalone observations module feeding notifications/workflows.
- **Status:** `NOT_STARTED`

### Tires Health

- **Mini description:** Tire wear modeling, lifecycle, measurements, health alerts, and tire trip-usage ledger.
- **Evidence:** `vehicle-intelligence/tires/`
- **Aliases:** `TIRE_RECALCULATION` queue
- **Entry points:** Tire health APIs and operator tire measure
- **Qualifies because:** Tire wear and lifecycle health domain.
- **Independence signal:** Own tire persistence, APIs, and recalculation worker queue.
- **Status:** `NOT_STARTED`

### Trip Detection & Lifecycle

- **Mini description:** Live trip finite-state machine, start and end detection, DIMO segment reconciliation, and route artifacts.
- **Evidence:** `vehicle-intelligence/trips/`
- **Aliases:** `TRIP_TRACKING` queue, `TripDecisionEngine`
- **Entry points:** Trip tracking processor; rental trips tab boundaries
- **Qualifies because:** Live trip FSM and canonical trip boundaries.
- **Independence signal:** Own trip FSM, `dimo.trip-tracking` queue, and reconciliation schedulers separate from DIMO integration and post-finalize ATE.
- **Status:** `NOT_STARTED`

### Users & Invites

- **Mini description:** Org user management, custom roles, invites, and IAM audit outbox scheduling.
- **Evidence:** `backend/src/modules/users/`
- **Aliases:** invites, org roles
- **Entry points:** Users settings tab; master security access
- **Qualifies because:** Org user, invite, and role management.
- **Independence signal:** Separate users/invites/IAM role modules from Account self-service and Auth API.
- **Status:** `NOT_STARTED`

### Vehicle Health Summary

- **Mini description:** Aggregated vehicle health summary, dashboard warning lights, and AI health-care projection layer.
- **Evidence:** `health-summary/`, `dashboard-warning-lights/`, `vehicle-file/`
- **Aliases:** AI health care aggregation
- **Entry points:** Health summary box and AI health care popup
- **Qualifies because:** Aggregated per-vehicle health projection layer.
- **Independence signal:** Per-vehicle summary projection APIs distinct from fleet-level Rental Health aggregation module.
- **Status:** `NOT_STARTED`

### Vehicles (Fleet Operations)

- **Mini description:** Core vehicle CRUD, fleet map, connectivity consent, and operational vehicle projections.
- **Evidence:** `backend/src/modules/vehicles/`
- **Aliases:** `VehiclesController`
- **Entry points:** Fleet map, vehicle detail anchor
- **Qualifies because:** Core fleet entity operations.
- **Independence signal:** Own vehicle CRUD/operational projection APIs; DIMO connectivity integration consumed separately.
- **Status:** `NOT_STARTED`

### Vendors

- **Mini description:** Third-party vendor and workshop directory including geocoding helpers for fleet operations.
- **Evidence:** `backend/src/modules/vendors/`
- **Aliases:** `vendors`
- **Entry points:** Vendor detail UI
- **Qualifies because:** Workshop/vendor partner directory.
- **Independence signal:** Standalone vendors module linked to service cases.
- **Status:** `NOT_STARTED`

### Voice Assistant Platform

- **Mini description:** Voice agent control plane, webhook ingestion, call orchestration, MCP gateway, billing, and protection.
- **Evidence:** six `voice-*` modules
- **Aliases:** ElevenLabs voice stack
- **Entry points:** Master voice admin; communication center voice channel
- **Qualifies because:** End-to-end voice agent product stack.
- **Independence signal:** Distinct voice modules, webhooks, MCP gateway, billing, and protection queues from Communication Center persistence.
- **Status:** `NOT_STARTED`

### WhatsApp Business

- **Mini description:** Meta WhatsApp Business API integration, webhooks, and tenant WhatsApp configuration.
- **Evidence:** `backend/src/modules/whatsapp/`
- **Aliases:** `WhatsAppWebhookController`
- **Entry points:** WhatsApp channel in communication center
- **Qualifies because:** WhatsApp Business API integration.
- **Independence signal:** Separate WhatsApp module/webhooks; Communication Center stores canonical threads.
- **Status:** `NOT_STARTED`

### Workflows

- **Mini description:** Configurable workflow engine with maker-checker, shadow mode, rollout gates, and audit trails.
- **Evidence:** `backend/src/modules/workflows/`
- **Aliases:** `WorkflowEngineService`
- **Entry points:** Workflow automation UI
- **Qualifies because:** Configurable workflow automation engine.
- **Independence signal:** Own workflow engine, maker-checker/shadow/rollout modules separate from Tasks outbox domain.
- **Status:** `NOT_STARTED`

## 8. Exhaustive coverage manifest

Every relevant discovered structural candidate below has **exactly one** classification:

- `REGISTERED_MODULE` — maps to a canonical registry row
- `ALIAS_OF_REGISTERED_MODULE` — alternative NestJS import or code name for the same registered capability
- `SUBCOMPONENT_OF_MODULE` — owned by a registered module or authority; not separately inventoried
- `SHARED_INFRASTRUCTURE` — platform/runtime infrastructure excluded from product module registry
- `AGGREGATE_CONTAINER` — UI or code aggregate grouping multiple module boundaries
- `INSUFFICIENT_EVIDENCE` — no defensible standalone product module from current evidence
- `UNRESOLVED_BOUNDARY` — evidence exists but ownership boundary not safely decidable in inventory-only pass

### 8.1 Top-level `backend/src/modules/` directories (68)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| backend/src/modules/account/ | REGISTERED_MODULE | Account & Self-Service | Dedicated account and self-service NestJS module with controllers for user preferences | backend/src/modules/account/account.module.ts; backend/src/app.module.ts AccountModule import |
| backend/src/modules/activity-log/ | REGISTERED_MODULE | Activity Log & HTTP Audit | HTTP mutation audit persistence and activity-log API | backend/src/modules/activity-log/activity-log.module.ts; model ActivityLog in backend/prisma/schema.prisma |
| backend/src/modules/ai/ | REGISTERED_MODULE | AI Platform (Fleet Chat & Tools) | Org-scoped fleet AI chat gateway and tool routing | backend/src/modules/ai/ai.module.ts; models OrganizationChatAgent, ChatMessage, AiRequestAuditLog |
| backend/src/modules/auth/ | REGISTERED_MODULE | Auth API | Tenant authentication API including refresh-token endpoints | backend/src/modules/auth/auth.module.ts; model RefreshToken |
| backend/src/modules/billing/ | REGISTERED_MODULE | Billing (SynqDrive SaaS) | Stripe SaaS subscription billing and usage metering | backend/src/modules/billing/billing.module.ts; models BillingSubscription, BillingInvoice |
| backend/src/modules/bookings/ | REGISTERED_MODULE | Bookings | Rental booking lifecycle, handover protocols, and eligibility gates | backend/src/modules/bookings/bookings.module.ts; model Booking, BookingHandoverProtocol |
| backend/src/modules/business-audit/ | REGISTERED_MODULE | Business Audit | Business-event audit outbox processor and persistence | backend/src/modules/business-audit/business-audit.module.ts; model BusinessAuditOutbox |
| backend/src/modules/business-insights/ | REGISTERED_MODULE | Business Insights | Detector-based dashboard insight signal pipeline | backend/src/modules/business-insights/business-insights.module.ts; models DashboardInsight, DashboardInsightRun |
| backend/src/modules/clickhouse/ | SHARED_INFRASTRUCTURE | N/A | ClickHouse telemetry mirror client infrastructure, not a product module | backend/src/modules/clickhouse/clickhouse.module.ts; QUEUE CLICKHOUSE_MIRROR_RETRY in backend/src/workers/queues/queue-names.ts |
| backend/src/modules/communication/ | REGISTERED_MODULE | Communication Center | Canonical omnichannel conversation store and inbox API | backend/src/modules/communication/communication.module.ts; models CommunicationConversation, CommunicationEvent |
| backend/src/modules/customer-verification/ | REGISTERED_MODULE | Customer Verification (Didit) | Didit identity verification workflows and webhook handling | backend/src/modules/customer-verification/customer-verification.module.ts; model CustomerVerificationCheck, DiditWebhookEvent |
| backend/src/modules/customers/ | REGISTERED_MODULE | Customers | Org-scoped rental customer records and management APIs | backend/src/modules/customers/customers.module.ts; model Customer |
| backend/src/modules/dashboard-utilization/ | REGISTERED_MODULE | Dashboard Utilization | Fleet utilization metrics API for rental dashboard | backend/src/modules/dashboard-utilization/dashboard-utilization.module.ts |
| backend/src/modules/data-analyse/ | REGISTERED_MODULE | Data Analyse | Org-wide permission-gated driving analysis and misuse views | backend/src/modules/data-analyse/data-analyse.module.ts |
| backend/src/modules/data-authorizations/ | REGISTERED_MODULE | Data Authorizations | Tenant data-access consent enforcement for AI and sensitive APIs | backend/src/modules/data-authorizations/data-authorizations.module.ts; model OrgDataAuthorization |
| backend/src/modules/deposit/ | SUBCOMPONENT_OF_MODULE | Pricing & Deposits | Deposit resolution submodule owned by pricing domain | backend/src/modules/deposit/deposit.module.ts imported by backend/src/modules/pricing/pricing.module.ts |
| backend/src/modules/dimo/ | REGISTERED_MODULE | DIMO Integration | DIMO auth, telemetry, segments, triggers, and webhook gateway | backend/src/modules/dimo/dimo.module.ts; models DimoVehicle, DimoPollLog |
| backend/src/modules/document-extraction/ | REGISTERED_MODULE | Document Extraction (AI Upload) | Shared upload-extract-review-apply document intake pipeline | backend/src/modules/document-extraction/document-extraction.module.ts; QUEUE DOCUMENT_EXTRACTION |
| backend/src/modules/documents/ | REGISTERED_MODULE | Documents | Document storage, legal texts, booking bundles, and retention | backend/src/modules/documents/documents.module.ts; models GeneratedDocument, OrganizationLegalDocument |
| backend/src/modules/energy-events-observability/ | SHARED_INFRASTRUCTURE | N/A | EED metrics and observability adjunct, not standalone product module | backend/src/modules/energy-events-observability/energy-events-observability.module.ts |
| backend/src/modules/evaluations-analytics/ | REGISTERED_MODULE | Evaluations Analytics | Entity-scoped evaluation insights, quality, and recommendations APIs | backend/src/modules/evaluations-analytics/evaluations-analytics.module.ts; model EvaluationsEntityReference |
| backend/src/modules/evaluations-finance/ | REGISTERED_MODULE | Evaluations Finance | Dedicated financial evaluation analytics controller and module | backend/src/modules/evaluations-finance/evaluations-finance.module.ts |
| backend/src/modules/evaluations-metrics/ | SUBCOMPONENT_OF_MODULE | Evaluations Analytics | Metrics sub-layer controllers within evaluations analytics domain | backend/src/modules/evaluations-metrics/evaluations-metric.module.ts; EvaluationsMetricsModule in backend/src/app.module.ts |
| backend/src/modules/evaluations-observability/ | SHARED_INFRASTRUCTURE | N/A | Evaluations API interceptor observability adjunct | backend/src/modules/evaluations-observability/evaluations-observability.module.ts; EvaluationsApiObservabilityInterceptor |
| backend/src/modules/fines/ | REGISTERED_MODULE | Fines | Traffic and parking fine record management | backend/src/modules/fines/fines.module.ts; model Fine |
| backend/src/modules/fleet-health-observability/ | SHARED_INFRASTRUCTURE | N/A | Fleet health pipeline observability metrics host | backend/src/modules/fleet-health-observability/fleet-health-observability.module.ts |
| backend/src/modules/health/ | SHARED_INFRASTRUCTURE | N/A | Liveness and readiness HTTP probes only | backend/src/modules/health/health.module.ts; HealthModule in backend/src/app.module.ts |
| backend/src/modules/high-mobility/ | REGISTERED_MODULE | High Mobility Integration | HM telemetry ingestion, vehicle registration, and webhooks | backend/src/modules/high-mobility/high-mobility.module.ts; model HighMobilityVehicle |
| backend/src/modules/iam-data-retention/ | REGISTERED_MODULE | IAM Data Retention | GDPR deletion, IAM retention policies, and purge schedulers | backend/src/modules/iam-data-retention/iam-data-retention.module.ts; models IamRetentionPolicyOverride, IamLegalHold |
| backend/src/modules/iam-mfa/ | REGISTERED_MODULE | IAM MFA | MFA enrollment, step-up grants, and recovery codes | backend/src/modules/iam-mfa/iam-mfa.module.ts; models UserMfaFactor, UserMfaStepUpGrant |
| backend/src/modules/iam-observability/ | SHARED_INFRASTRUCTURE | N/A | IAM metrics and observability adjunct | backend/src/modules/iam-observability/iam-observability.module.ts |
| backend/src/modules/insurances/ | REGISTERED_MODULE | Insurances | Vehicle insurance records and partner channel adapters | backend/src/modules/insurances/insurances.module.ts; models InsurancePartner, VehicleInsuranceRecord |
| backend/src/modules/integrations/ | REGISTERED_MODULE | Integrations Hub | Tenant integrations configuration and connection management | backend/src/modules/integrations/integrations.module.ts; models Integration, OrganizationIntegration |
| backend/src/modules/invoices/ | REGISTERED_MODULE | Invoices | Operational invoice records and accounts-receivable flows | backend/src/modules/invoices/invoices.module.ts; model OrgInvoice |
| backend/src/modules/master-admin-smoke-lifecycle/ | SUBCOMPONENT_OF_MODULE | Platform Admin | Ephemeral master-admin smoke-test helper, not standalone product module | backend/src/modules/master-admin-smoke-lifecycle/master-admin-smoke-lifecycle.module.ts |
| backend/src/modules/notifications/ | REGISTERED_MODULE | Notifications | Notification evaluation, delivery outbox, and in-app consumption | backend/src/modules/notifications/notifications.module.ts; models Notification, NotificationDeliveryOutbox |
| backend/src/modules/observability/ | SHARED_INFRASTRUCTURE | N/A | Prometheus metrics and runtime status registry host | backend/src/modules/observability/observability.module.ts; RuntimeStatusRegistry in backend/src/app.module.ts |
| backend/src/modules/organizations/ | REGISTERED_MODULE | Organizations & Tenancy | Multi-tenant organization profiles and tenant configuration | backend/src/modules/organizations/organizations.module.ts; model Organization |
| backend/src/modules/outbound-email/ | REGISTERED_MODULE | Outbound Email | Resend-based outbound email for org and platform delivery | backend/src/modules/outbound-email/outbound-email.module.ts; model OutboundEmail |
| backend/src/modules/parts-accessories/ | REGISTERED_MODULE | Parts & Accessories | Parts procurement integrations and marketplace adapters | backend/src/modules/parts-accessories/parts-accessories.module.ts; models PartsProvider, PartsSearchRequest |
| backend/src/modules/payments/ | REGISTERED_MODULE | Payments (Rental Collections) | Stripe Connect payment collection for booking payment requests | backend/src/modules/payments/payments.module.ts; models BookingPaymentRequest, PaymentTransaction |
| backend/src/modules/platform-admin/ | REGISTERED_MODULE | Platform Admin | Master-admin cross-tenant operations and security governance | backend/src/modules/platform-admin/platform-admin.module.ts |
| backend/src/modules/pricing/ | REGISTERED_MODULE | Pricing & Deposits | Rental tariff pricing rules, publish flow, and deposit coupling | backend/src/modules/pricing/pricing.module.ts; models PriceBook, PriceTariffGroup, BookingDeposit |
| backend/src/modules/products/ | REGISTERED_MODULE | Products (Rental Catalog) | Rental product catalog and org product assignments | backend/src/modules/products/products.module.ts; models Product, OrganizationProduct |
| backend/src/modules/prospects/ | REGISTERED_MODULE | Prospects | Pre-customer prospect records for master-admin sales pipeline | backend/src/modules/prospects/prospects.module.ts; model Prospect |
| backend/src/modules/rental-driving-analysis/ | REGISTERED_MODULE | Rental Driving Analysis | Booking-scoped driving analysis aggregation APIs | backend/src/modules/rental-driving-analysis/rental-driving-analysis.module.ts; model RentalDrivingAnalysis |
| backend/src/modules/rental-health/ | REGISTERED_MODULE | Rental Health | Fleet-level health aggregation consuming source health modules | backend/src/modules/rental-health/rental-health.module.ts |
| backend/src/modules/rental-rules/ | REGISTERED_MODULE | Rental Rules | Org-level rental policy and rules configuration | backend/src/modules/rental-rules/rental-rules.module.ts; model OrganizationRentalRules |
| backend/src/modules/service-cases/ | REGISTERED_MODULE | Service Cases | Operational service-case tracking for maintenance and vendors | backend/src/modules/service-cases/service-cases.module.ts; model ServiceCase |
| backend/src/modules/sms/ | REGISTERED_MODULE | SMS & Twilio Messaging | SMS conversation persistence module (SmsPersistenceModule) | backend/src/modules/sms/sms-persistence.module.ts; models SmsConversation, SmsMessage |
| backend/src/modules/stations/ | REGISTERED_MODULE | Stations | Rental station locations, geofencing, and transfers | backend/src/modules/stations/stations.module.ts; model Station |
| backend/src/modules/support/ | REGISTERED_MODULE | Support | Support ticket APIs and messaging | backend/src/modules/support/support.module.ts; models SupportTicket, SupportTicketMessage |
| backend/src/modules/tasks/ | REGISTERED_MODULE | Tasks & Work Orders | Work orders, task domain V2, and automation outbox | backend/src/modules/tasks/tasks.module.ts; models OrgTask, TaskAutomationOutbox |
| backend/src/modules/technical-observations/ | REGISTERED_MODULE | Technical Observations | Operator technical observation records feeding notifications | backend/src/modules/technical-observations/technical-observations.module.ts |
| backend/src/modules/twilio/ | SUBCOMPONENT_OF_MODULE | SMS & Twilio Messaging | Twilio provider adapter submodule for SMS and voice webhooks | backend/src/modules/twilio/twilio.module.ts imported by sms and voice modules |
| backend/src/modules/users/ | REGISTERED_MODULE | Users & Invites | Org user management, custom roles, and invite flows | backend/src/modules/users/users.module.ts; models OrganizationUserInvite, OrganizationRole |
| backend/src/modules/vehicle-intelligence/ | AGGREGATE_CONTAINER | N/A | NestJS aggregate hosting vehicle health, trips, driving, and energy subdomains | backend/src/modules/vehicle-intelligence/vehicle-intelligence.module.ts; VehicleIntelligenceModule in backend/src/app.module.ts |
| backend/src/modules/vehicle-warning-gdpr/ | SUBCOMPONENT_OF_MODULE | IAM Data Retention | Vehicle warning GDPR purge helper consumed by retention workers | backend/src/modules/vehicle-warning-gdpr/vehicle-warning-gdpr.module.ts; VehicleWarningGdprModule in backend/src/workers/workers.module.ts |
| backend/src/modules/vehicles/ | REGISTERED_MODULE | Vehicles (Fleet Operations) | Core vehicle CRUD, fleet map, and operational projections | backend/src/modules/vehicles/vehicles.module.ts; model Vehicle |
| backend/src/modules/vendors/ | REGISTERED_MODULE | Vendors | Third-party vendor and workshop directory | backend/src/modules/vendors/vendors.module.ts; model Vendor |
| backend/src/modules/voice-assistant/ | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Voice agent control-plane API and deployment management | backend/src/modules/voice-assistant/voice-assistant.module.ts; model VoiceAssistant |
| backend/src/modules/voice-billing/ | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Voice usage metering and billing period management | backend/src/modules/voice-billing/voice-billing.module.ts; models VoiceBillingPeriod, VoiceUsageEvent |
| backend/src/modules/voice-call-orchestration/ | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Call lifecycle orchestration for voice conversations | backend/src/modules/voice-call-orchestration/voice-call-orchestration.module.ts; model VoiceConversation |
| backend/src/modules/voice-mcp-gateway/ | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | MCP tool gateway for voice agent tool execution | backend/src/modules/voice-mcp-gateway/voice-mcp-gateway.module.ts; model VoiceToolExecution |
| backend/src/modules/voice-protection/ | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Budget protection and override policies for voice usage | backend/src/modules/voice-protection/voice-protection.module.ts; models VoiceBudgetPolicy, VoiceProtectionOverride |
| backend/src/modules/voice-webhook-ingestion/ | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Twilio voice webhook ingestion and async processing entry | backend/src/modules/voice-webhook-ingestion/voice-webhook-ingestion.module.ts; QUEUE VOICE_WEBHOOK_PROCESS |
| backend/src/modules/whatsapp/ | REGISTERED_MODULE | WhatsApp Business | Meta WhatsApp Business API integration and webhooks | backend/src/modules/whatsapp/whatsapp.module.ts; models WhatsAppConversation, WhatsAppMessage |
| backend/src/modules/workflows/ | REGISTERED_MODULE | Workflows | Configurable workflow engine with maker-checker and rollout gates | backend/src/modules/workflows/workflows.module.ts; models OrgWorkflow, OrgWorkflowRun |


### 8.2 First-level `vehicle-intelligence/` domains (46)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| backend/src/modules/vehicle-intelligence/battery/ | SUBCOMPONENT_OF_MODULE | Battery V2 | Legacy battery path superseded by Battery V2 authority implementation | backend/src/modules/vehicle-intelligence/battery/; Battery V2 authority architecture/battery-v2/ |
| backend/src/modules/vehicle-intelligence/battery-health/ | SUBCOMPONENT_OF_MODULE | Battery V2 | Battery V2 health jobs, processors, and HV reconcile pipeline | backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-jobs.module.ts; QUEUE BATTERY_V2 |
| backend/src/modules/vehicle-intelligence/battery-policy-profile/ | SUBCOMPONENT_OF_MODULE | Battery V2 | Battery policy profile configuration within Battery V2 domain | backend/src/modules/vehicle-intelligence/battery-policy-profile/ |
| backend/src/modules/vehicle-intelligence/brakes/ | REGISTERED_MODULE | Brakes Health | Brake wear evidence, recalculation, and health APIs | backend/src/modules/vehicle-intelligence/brakes/brakes.module.ts; models BrakeHealthCurrent, BrakeHealthSnapshot |
| backend/src/modules/vehicle-intelligence/damage-incidents/ | SUBCOMPONENT_OF_MODULE | Damages | Damage incident linkage helpers within damages domain | backend/src/modules/vehicle-intelligence/damage-incidents/ |
| backend/src/modules/vehicle-intelligence/damages/ | REGISTERED_MODULE | Damages | Structured vehicle damage records with image semantics | backend/src/modules/vehicle-intelligence/damages/damages.module.ts; model VehicleDamage |
| backend/src/modules/vehicle-intelligence/dashboard-warning-lights/ | SUBCOMPONENT_OF_MODULE | Vehicle Health Summary | Dashboard warning-lights projection for vehicle health summary | backend/src/modules/vehicle-intelligence/dashboard-warning-lights/ |
| backend/src/modules/vehicle-intelligence/dimo-native-driving-events/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Native DIMO driving event intake within DI pipeline | backend/src/modules/vehicle-intelligence/dimo-native-driving-events/ |
| backend/src/modules/vehicle-intelligence/dimo-trip-segment-validation/ | SUBCOMPONENT_OF_MODULE | Trip Detection & Lifecycle | DIMO segment validation against canonical trip boundaries | backend/src/modules/vehicle-intelligence/dimo-trip-segment-validation/ |
| backend/src/modules/vehicle-intelligence/drive-profile/ | UNRESOLVED_BOUNDARY | N/A | Drive-profile pipeline could belong to Trip Detection or Driving Intelligence; ownership not safely decidable in inventory-only pass | backend/src/modules/vehicle-intelligence/drive-profile/; §13.3 unresolved boundary |
| backend/src/modules/vehicle-intelligence/driver-attribution/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driver attribution evidence within DI V2 pipeline | backend/src/modules/vehicle-intelligence/driver-attribution/; model DriverAttribution |
| backend/src/modules/vehicle-intelligence/driving-analysis-init/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving analysis initialization stage within DI orchestration | backend/src/modules/vehicle-intelligence/driving-analysis-init/ |
| backend/src/modules/vehicle-intelligence/driving-analysis-reconciliation/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving analysis reconciliation scheduler and repair logic | backend/src/modules/vehicle-intelligence/driving-analysis-reconciliation/; DrivingAnalysisReconciliationScheduler in backend/src/workers/workers.module.ts |
| backend/src/modules/vehicle-intelligence/driving-analysis-run/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving analysis run persistence and stage tracking | backend/src/modules/vehicle-intelligence/driving-analysis-run/; model DrivingAnalysisRun |
| backend/src/modules/vehicle-intelligence/driving-analysis-stage/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Stage orchestrator for durable post-trip DI pipeline | backend/src/modules/vehicle-intelligence/driving-analysis-stage/; model DrivingAnalysisStage |
| backend/src/modules/vehicle-intelligence/driving-capability/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Per-vehicle driving capability signals for DI assessability | backend/src/modules/vehicle-intelligence/driving-capability/; model VehicleDrivingCapability |
| backend/src/modules/vehicle-intelligence/driving-decisions/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving decision audit records within DI evidence chain | backend/src/modules/vehicle-intelligence/driving-decisions/; model DrivingDecisionAudit |
| backend/src/modules/vehicle-intelligence/driving-detector-capability/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Detector capability configuration for driving event detection | backend/src/modules/vehicle-intelligence/driving-detector-capability/ |
| backend/src/modules/vehicle-intelligence/driving-events/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving event storage and projection within DI domain | backend/src/modules/vehicle-intelligence/driving-events/; model DrivingEvent |
| backend/src/modules/vehicle-intelligence/driving-evidence/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving evidence artifacts for DI V2 pipeline | backend/src/modules/vehicle-intelligence/driving-evidence/; model DrivingEvidence |
| backend/src/modules/vehicle-intelligence/driving-impact/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving impact scoring engine (V1 operational load) | backend/src/modules/vehicle-intelligence/driving-impact/; model TripDrivingImpact |
| backend/src/modules/vehicle-intelligence/driving-impact-model-profile/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Impact model profile configuration for driving stress scoring | backend/src/modules/vehicle-intelligence/driving-impact-model-profile/ |
| backend/src/modules/vehicle-intelligence/driving-impact-rolling/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Rolling impact aggregation within DI impact engine | backend/src/modules/vehicle-intelligence/driving-impact-rolling/; model VehicleDrivingImpactCurrent |
| backend/src/modules/vehicle-intelligence/driving-intelligence-jobs/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Typed persistent job envelope for DI V2 async processing | backend/src/modules/vehicle-intelligence/driving-intelligence-jobs/; QUEUE DRIVING_INTELLIGENCE |
| backend/src/modules/vehicle-intelligence/driving-intelligence-v2/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | DI V2 orchestration core consumed by driving-intelligence authority | backend/src/modules/vehicle-intelligence/driving-intelligence-v2/; DrivingIntelligenceJobProcessor |
| backend/src/modules/vehicle-intelligence/driving-metric-normalization/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Metric normalization layer for cross-vehicle driving comparisons | backend/src/modules/vehicle-intelligence/driving-metric-normalization/ |
| backend/src/modules/vehicle-intelligence/driving-signals/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving signal ingestion and normalization within DI | backend/src/modules/vehicle-intelligence/driving-signals/ |
| backend/src/modules/vehicle-intelligence/dtc/ | REGISTERED_MODULE | DTC / Error Codes | DTC event storage, alerts, and error-code health APIs | backend/src/modules/vehicle-intelligence/dtc/dtc.module.ts; model VehicleDtcEvent |
| backend/src/modules/vehicle-intelligence/dtc-knowledge/ | SUBCOMPONENT_OF_MODULE | DTC / Error Codes | DTC knowledge enrichment jobs and AI structuring | backend/src/modules/vehicle-intelligence/dtc-knowledge/; QUEUE DTC_KNOWLEDGE_ENRICHMENT |
| backend/src/modules/vehicle-intelligence/energy-events/ | SUBCOMPONENT_OF_MODULE | Energy Event Detection (EED) | REFUEL/RECHARGE detection implementation owned by EED authority | backend/src/modules/vehicle-intelligence/energy-events/; model VehicleEnergyEvent |
| backend/src/modules/vehicle-intelligence/enrichment-jobs/ | SUBCOMPONENT_OF_MODULE | Automatic Trip Enrichment (ATE) | Post-finalize behavior enrichment job orchestration | backend/src/modules/vehicle-intelligence/enrichment-jobs/; TripBehaviorEnrichmentProcessor in backend/src/workers/workers.module.ts |
| backend/src/modules/vehicle-intelligence/event-context/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Event context assembly for driving analysis stages | backend/src/modules/vehicle-intelligence/event-context/ |
| backend/src/modules/vehicle-intelligence/findings/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Operational findings surfaced from driving intelligence pipeline | backend/src/modules/vehicle-intelligence/findings/; model VehicleFinding |
| backend/src/modules/vehicle-intelligence/fuel-stations/ | SUBCOMPONENT_OF_MODULE | Tankstellenerkennung | Fuel station enrichment after persisted REFUEL events | backend/src/modules/vehicle-intelligence/fuel-stations/; QUEUE ENERGY_REFUEL_STATION_ENRICH |
| backend/src/modules/vehicle-intelligence/health-summary/ | REGISTERED_MODULE | Vehicle Health Summary | Aggregated vehicle health summary and AI health-care projection | backend/src/modules/vehicle-intelligence/health-summary/health-summary.module.ts |
| backend/src/modules/vehicle-intelligence/lv-battery-chemistry/ | SUBCOMPONENT_OF_MODULE | Battery V2 | LV battery chemistry profile data within Battery V2 | backend/src/modules/vehicle-intelligence/lv-battery-chemistry/ |
| backend/src/modules/vehicle-intelligence/misuse-cases/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Misuse case detection and evidence within DI authority scope | backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.module.ts; model MisuseCase |
| backend/src/modules/vehicle-intelligence/reference-capture/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | HF reference capture testbed and autonomous recording runner | backend/src/modules/vehicle-intelligence/reference-capture/; QUEUE REFERENCE_CAPTURE |
| backend/src/modules/vehicle-intelligence/service-compliance/ | REGISTERED_MODULE | Service Events & Compliance | Oil change, TÜV, and service interval compliance materialization | backend/src/modules/vehicle-intelligence/service-compliance/service-compliance.module.ts |
| backend/src/modules/vehicle-intelligence/service-events/ | SUBCOMPONENT_OF_MODULE | Service Events & Compliance | Service event persistence submodule within compliance domain | backend/src/modules/vehicle-intelligence/service-events/; model VehicleServiceEvent |
| backend/src/modules/vehicle-intelligence/shadow-detector/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Shadow detector experimentation within DI pipeline | backend/src/modules/vehicle-intelligence/shadow-detector/ |
| backend/src/modules/vehicle-intelligence/tenant/ | SUBCOMPONENT_OF_MODULE | Business Insights | Tenant insight policy configuration within VI aggregate | backend/src/modules/vehicle-intelligence/tenant/; model TenantInsightPolicy |
| backend/src/modules/vehicle-intelligence/tires/ | REGISTERED_MODULE | Tires Health | Tire wear modeling, measurements, and health alerts | backend/src/modules/vehicle-intelligence/tires/tires.module.ts; models Tire, TireHealthSnapshot |
| backend/src/modules/vehicle-intelligence/trip-assessability/ | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Trip assessability dimension status for DI V2 pipeline | backend/src/modules/vehicle-intelligence/trip-assessability/; model TripAssessability |
| backend/src/modules/vehicle-intelligence/trips/ | REGISTERED_MODULE | Trip Detection & Lifecycle | Trip FSM, tracking, reconciliation, and route artifacts | backend/src/modules/vehicle-intelligence/trips/trips.module.ts; models VehicleTrip, VehicleTripDetectionState |
| backend/src/modules/vehicle-intelligence/vehicle-file/ | SUBCOMPONENT_OF_MODULE | Vehicle Health Summary | Vehicle dossier file summary projection within health summary | backend/src/modules/vehicle-intelligence/vehicle-file/ |


### 8.3 Additional `app.module.ts` infrastructure / submodule imports (14)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| AuthApiModule | ALIAS_OF_REGISTERED_MODULE | Auth API | AuthApiModule re-exports auth module API surface under alternate NestJS import name | backend/src/modules/auth/auth.module.ts exported as AuthApiModule in backend/src/app.module.ts line 87 |
| MisuseCasesModule | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Misuse cases imported at app root but owned by DI authority subdomain | backend/src/modules/vehicle-intelligence/misuse-cases/misuse-cases.module.ts; MisuseCasesModule in backend/src/app.module.ts |
| EvaluationsInsightsModule | SUBCOMPONENT_OF_MODULE | Evaluations Analytics | E4 insights sub-layer within evaluations analytics | backend/src/modules/evaluations-analytics/e4/evaluations-insights.module.ts |
| EvaluationsQualityModule | SUBCOMPONENT_OF_MODULE | Evaluations Analytics | E5 quality sub-layer within evaluations analytics | backend/src/modules/evaluations-analytics/e5/evaluations-quality.module.ts |
| EvaluationsRecommendationsModule | SUBCOMPONENT_OF_MODULE | Evaluations Analytics | E7 recommendations sub-layer within evaluations analytics | backend/src/modules/evaluations-analytics/e7/evaluations-recommendations.module.ts |
| SchedulerLeaderElectionModule | SUBCOMPONENT_OF_MODULE | Scaling Process | Multi-replica scheduler leader election per Scaling Process authority | backend/src/shared/scheduler-leader/scheduler-leader-election.module.ts; architecture/scaling-process/ |
| ReconciliationExecutionMutexModule | SUBCOMPONENT_OF_MODULE | Scaling Process | Reconciliation execution mutex per Scaling Process authority | backend/src/shared/reconciliation-execution-mutex/reconciliation-execution-mutex.module.ts |
| VehicleDetailObservabilityModule | SHARED_INFRASTRUCTURE | N/A | Vehicle detail page observability metrics adjunct | backend/src/modules/vehicles/observability/vehicle-detail-observability.module.ts |
| WorkersModule | SHARED_INFRASTRUCTURE | N/A | BullMQ job runtime host; scaling topology documented under Scaling Process authority | backend/src/workers/workers.module.ts; architecture/scaling-process/SYSTEM_TOPOLOGY.md |
| PrismaModule | SHARED_INFRASTRUCTURE | N/A | Shared database access layer for all modules | backend/src/shared/database/prisma.module.ts |
| RedisModule | SHARED_INFRASTRUCTURE | N/A | Shared Redis client for cache, locks, and BullMQ | backend/src/shared/redis/redis.module.ts |
| StorageModule | SHARED_INFRASTRUCTURE | N/A | Shared object storage adapter for documents and images | backend/src/shared/storage/storage.module.ts |
| SharedGuardsModule | SHARED_INFRASTRUCTURE | N/A | Shared Clerk auth guards and permission decorators | backend/src/shared/auth/shared-guards.module.ts |
| StripeEnvironmentModule | SHARED_INFRASTRUCTURE | N/A | Stripe environment key resolution shared across billing and payments | backend/src/shared/stripe/stripe-environment.module.ts |


### 8.4 `workers.module.ts` imports and queue groups (35)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| workers:DimoModule | REGISTERED_MODULE | DIMO Integration | DIMO worker processors import DIMO integration module | backend/src/workers/workers.module.ts DimoModule import |
| workers:VehicleIntelligenceModule | SUBCOMPONENT_OF_MODULE | N/A | Workers import VI aggregate root to register domain processors | backend/src/workers/workers.module.ts VehicleIntelligenceModule import |
| workers:BatteryV2JobsModule | SUBCOMPONENT_OF_MODULE | Battery V2 | Battery V2 async job producers and processors | backend/src/modules/vehicle-intelligence/battery-health/jobs/battery-v2-jobs.module.ts |
| workers:BookingDocumentGenerationModule | SUBCOMPONENT_OF_MODULE | Documents | Booking PDF generation submodule invoked by workers | backend/src/modules/documents/booking-document-generation/booking-document-generation.module.ts |
| workers:TaskAutomationOutboxModule | SUBCOMPONENT_OF_MODULE | Tasks & Work Orders | Task automation outbox processor module | backend/src/modules/tasks/outbox/task-automation-outbox.module.ts |
| workers:HighMobilityModule | REGISTERED_MODULE | High Mobility Integration | HM health polling scheduler imports HM module | backend/src/workers/workers.module.ts HighMobilityModule import |
| workers:NotificationsModule | REGISTERED_MODULE | Notifications | Notification evaluation and delivery processors | backend/src/workers/workers.module.ts NotificationsModule import |
| workers:PaymentsModule | REGISTERED_MODULE | Payments (Rental Collections) | Payment email processor imports payments module | backend/src/workers/workers.module.ts PaymentsModule import |
| workers:BillingModule | REGISTERED_MODULE | Billing (SynqDrive SaaS) | Billing reconciliation scheduler imports billing module | backend/src/workers/workers.module.ts BillingModule import |
| workers:VoiceWebhookIngestionModule | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Voice webhook async processing entry in workers host | backend/src/workers/workers.module.ts VoiceWebhookIngestionModule import |
| workers:VoiceAssistantModule | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Voice assistant module imported for worker-side voice jobs | backend/src/workers/workers.module.ts VoiceAssistantModule import |
| workers:IamDataRetentionModule | REGISTERED_MODULE | IAM Data Retention | IAM data retention purge scheduler module | backend/src/workers/workers.module.ts IamDataRetentionModule import |
| workers:VehicleWarningGdprModule | SUBCOMPONENT_OF_MODULE | IAM Data Retention | Vehicle warning GDPR purge helper for retention workers | backend/src/workers/workers.module.ts VehicleWarningGdprModule import |


| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| QUEUE DIMO_SNAPSHOT | SUBCOMPONENT_OF_MODULE | DIMO Integration | Scheduled DIMO snapshot polling job entry point | backend/src/workers/queues/queue-names.ts DIMO_SNAPSHOT; DimoSnapshotProcessor |
| QUEUE DIMO_VEHICLE_SYNC | SUBCOMPONENT_OF_MODULE | DIMO Integration | DIMO vehicle sync reconciliation queue | backend/src/workers/queues/queue-names.ts DIMO_VEHICLE_SYNC; DimoVehicleSyncProcessor |
| QUEUE DTC_POLL | SUBCOMPONENT_OF_MODULE | DIMO Integration | DIMO DTC polling queue for diagnostic codes | backend/src/workers/queues/queue-names.ts DTC_POLL; DimoDtcProcessor |
| QUEUE TIRE_RECALCULATION | SUBCOMPONENT_OF_MODULE | Tires Health | Tire wear recalculation async job entry | backend/src/workers/queues/queue-names.ts TIRE_RECALCULATION; TireRecalculationProcessor |
| QUEUE BRAKE_RECALCULATION | SUBCOMPONENT_OF_MODULE | Brakes Health | Brake wear recalculation async job entry | backend/src/workers/queues/queue-names.ts BRAKE_RECALCULATION; BrakeRecalculationProcessor |
| QUEUE TRIP_TRACKING | SUBCOMPONENT_OF_MODULE | Trip Detection & Lifecycle | Live trip tracking and FSM async processing entry | backend/src/workers/queues/queue-names.ts TRIP_TRACKING; TripTrackingProcessor |
| QUEUE TRIP_BEHAVIOR_ENRICHMENT | SUBCOMPONENT_OF_MODULE | Automatic Trip Enrichment (ATE) | Post-finalize behavior enrichment queue per ATE authority | backend/src/workers/queues/queue-names.ts TRIP_BEHAVIOR_ENRICHMENT; TripBehaviorEnrichmentProcessor |
| QUEUE DRIVING_IMPACT_COMPUTE | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Driving impact compute stage after HF enrichment | backend/src/workers/queues/queue-names.ts DRIVING_IMPACT_COMPUTE; DrivingImpactProcessor |
| QUEUE DRIVING_INTELLIGENCE | SUBCOMPONENT_OF_MODULE | Driving Intelligence | DI V2 typed persistent job envelope queue | backend/src/workers/queues/queue-names.ts DRIVING_INTELLIGENCE; DrivingIntelligenceJobProcessor |
| QUEUE DOCUMENT_EXTRACTION | REGISTERED_MODULE | Document Extraction (AI Upload) | AI document upload async extraction queue | backend/src/workers/queues/queue-names.ts DOCUMENT_EXTRACTION |
| QUEUE BOOKING_DOCUMENT_GENERATION | SUBCOMPONENT_OF_MODULE | Documents | Booking PDF generation durable workflow queue | backend/src/workers/queues/queue-names.ts BOOKING_DOCUMENT_GENERATION; BookingDocumentGenerationProcessor |
| QUEUE DTC_KNOWLEDGE_ENRICHMENT | SUBCOMPONENT_OF_MODULE | DTC / Error Codes | DTC knowledge base AI enrichment queue | backend/src/workers/queues/queue-names.ts DTC_KNOWLEDGE_ENRICHMENT; DtcKnowledgeProcessor |
| QUEUE NOTIFICATION_EVALUATION | SUBCOMPONENT_OF_MODULE | Notifications | Org-scoped notification evaluation producer queue | backend/src/workers/queues/queue-names.ts NOTIFICATION_EVALUATION; NotificationEvaluationProcessor |
| QUEUE NOTIFICATION_DELIVERY | SUBCOMPONENT_OF_MODULE | Notifications | Notification delivery outbox dispatch queue | backend/src/workers/queues/queue-names.ts NOTIFICATION_DELIVERY; NotificationDeliveryProcessor |
| QUEUE PAYMENT_EMAIL | SUBCOMPONENT_OF_MODULE | Payments (Rental Collections) | Payment-related email dispatch queue | backend/src/workers/queues/queue-names.ts PAYMENT_EMAIL; PaymentEmailProcessor |
| QUEUE TASK_AUTOMATION | SUBCOMPONENT_OF_MODULE | Tasks & Work Orders | Task automation outbox processing queue | backend/src/workers/queues/queue-names.ts TASK_AUTOMATION; TaskAutomationOutboxProcessor |
| QUEUE BATTERY_V2 | SUBCOMPONENT_OF_MODULE | Battery V2 | Battery V2 typed async jobs queue per Battery V2 authority | backend/src/workers/queues/queue-names.ts BATTERY_V2; BatteryV2Processor |
| QUEUE VOICE_WEBHOOK_PROCESS | SUBCOMPONENT_OF_MODULE | Voice Assistant Platform | Voice provider webhook async lifecycle correlation queue | backend/src/workers/queues/queue-names.ts VOICE_WEBHOOK_PROCESS; VoiceWebhookProcessor |
| QUEUE CONNECTIVITY_WEBHOOK_PROCESS | SUBCOMPONENT_OF_MODULE | DIMO Integration | Device connection webhook inbox async processing queue | backend/src/workers/queues/queue-names.ts CONNECTIVITY_WEBHOOK_PROCESS; DeviceConnectionWebhookProcessor |
| QUEUE CLICKHOUSE_MIRROR_RETRY | SHARED_INFRASTRUCTURE | N/A | ClickHouse telemetry mirror write retry infrastructure queue | backend/src/workers/queues/queue-names.ts CLICKHOUSE_MIRROR_RETRY; ClickHouseMirrorRetryProcessor |
| QUEUE ENERGY_REFUEL_STATION_ENRICH | SUBCOMPONENT_OF_MODULE | Tankstellenerkennung | REFUEL station location enrichment queue per Tankstellenerkennung authority | backend/src/workers/queues/queue-names.ts ENERGY_REFUEL_STATION_ENRICH; RefuelStationEnrichmentProcessor |
| QUEUE REFERENCE_CAPTURE | SUBCOMPONENT_OF_MODULE | Driving Intelligence | DIMO LTE_R1 reference capture autonomous runner queue | backend/src/workers/queues/queue-names.ts REFERENCE_CAPTURE; ReferenceCaptureProcessor |


### 8.5 Frontend navigation and product surfaces (72)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| master-nav:dashboard | REGISTERED_MODULE | Dashboard Utilization; Business Insights | Master dashboard aggregates utilization metrics and insight signals | frontend/src/master/navigation/master-nav.config.ts id=dashboard |
| master-nav:organizations | REGISTERED_MODULE | Organizations & Tenancy | Master-admin organization management surface | frontend/src/master/navigation/master-nav.config.ts id=organizations |
| master-nav:prospects | REGISTERED_MODULE | Prospects | Master-admin prospect pipeline surface | frontend/src/master/navigation/master-nav.config.ts id=prospects |
| master-nav:security-access | REGISTERED_MODULE | Platform Admin; IAM MFA; Users & Invites | Master security and access governance aggregate surface | frontend/src/master/navigation/master-nav.config.ts id=security-access |
| master-nav:vehicles | REGISTERED_MODULE | Vehicles (Fleet Operations); DIMO Integration | Master fleet connectivity and vehicle registry surface | frontend/src/master/navigation/master-nav.config.ts id=vehicles |
| master-nav:vehicle-logbook | REGISTERED_MODULE | Trip Detection & Lifecycle | Master vehicle logbook and trip history surface | frontend/src/master/navigation/master-nav.config.ts id=vehicle-logbook; model VehicleLogbookConfig |
| master-nav:billing | REGISTERED_MODULE | Billing (SynqDrive SaaS) | Master SaaS billing and subscription management | frontend/src/master/navigation/master-nav.config.ts id=billing |
| master-nav:platform-integrations | REGISTERED_MODULE | Integrations Hub; Platform Admin | Master platform integrations configuration surface | frontend/src/master/navigation/master-nav.config.ts id=platform-integrations |
| master-nav:high-mobility | REGISTERED_MODULE | High Mobility Integration | Master HM integration monitoring surface | frontend/src/master/navigation/master-nav.config.ts id=high-mobility |
| master-nav:parts-accessories | REGISTERED_MODULE | Parts & Accessories | Master parts provider administration | frontend/src/master/navigation/master-nav.config.ts id=parts-accessories |
| master-nav:insurances | REGISTERED_MODULE | Insurances | Master insurance partner administration | frontend/src/master/navigation/master-nav.config.ts id=insurances |
| master-nav:voice-assistant | REGISTERED_MODULE | Voice Assistant Platform | Master voice assistant control plane surface | frontend/src/master/navigation/master-nav.config.ts id=voice-assistant |
| master-nav:platform-ops | AGGREGATE_CONTAINER | Platform Admin; Observability (infra) | Master platform operations aggregate: health, smoke, runtime status | frontend/src/master/navigation/master-nav.config.ts id=platform-ops |
| master-nav:support | REGISTERED_MODULE | Support | Master support ticket administration | frontend/src/master/navigation/master-nav.config.ts id=support |
| master-nav:architektur | SHARED_INFRASTRUCTURE | N/A | Engineering architecture browser; not a product runtime module | frontend/src/master/navigation/master-nav.config.ts id=architektur; frontend/src/master/components/ArchitekturView.tsx |
| master-nav:changes | SHARED_INFRASTRUCTURE | N/A | Engineering changelog browser; not a product runtime module | frontend/src/master/navigation/master-nav.config.ts id=changes; frontend/src/master/components/ChangesView.tsx |
| rental-view:dashboard | AGGREGATE_CONTAINER | Dashboard Utilization; Business Insights; Rental Health | Rental operations dashboard aggregating fleet KPIs and insights | frontend/src/rental/components/Sidebar.tsx handleViewChange(dashboard); frontend/src/rental/App.tsx currentView===dashboard |
| rental-view:bookings | REGISTERED_MODULE | Bookings | Rental booking list and wizard entry | frontend/src/rental/components/Sidebar.tsx handleViewChange(bookings) |
| rental-view:customers | REGISTERED_MODULE | Customers | Rental customer list surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(customers) |
| rental-view:customer-detail | SUBCOMPONENT_OF_MODULE | Customers | Customer detail drill-down within customers module surface | frontend/src/rental/App.tsx currentView===customer-detail |
| rental-view:stations | REGISTERED_MODULE | Stations | Rental station list and configuration | frontend/src/rental/components/Sidebar.tsx handleViewChange(stations) |
| rental-view:station-detail | SUBCOMPONENT_OF_MODULE | Stations | Station detail drill-down within stations module | frontend/src/rental/App.tsx currentView===station-detail |
| rental-view:tasks | REGISTERED_MODULE | Tasks & Work Orders | Org task and work-order management surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(tasks) |
| rental-view:communication-center | REGISTERED_MODULE | Communication Center | Omnichannel operator inbox surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(communication-center) |
| rental-view:fleet | AGGREGATE_CONTAINER | Rental Health; Vehicles (Fleet Operations) | Fleet health hub with status, condition, and vendor sub-tabs | frontend/src/rental/components/Sidebar.tsx onFleetTabChange; frontend/src/rental/App.tsx currentView===fleet |
| rental-view:fleet-condition-detail | SUBCOMPONENT_OF_MODULE | Rental Health | Fleet condition detail drill-down within fleet aggregate | frontend/src/rental/App.tsx currentView===fleet-condition-detail |
| rental-view:vendor-detail | SUBCOMPONENT_OF_MODULE | Vendors | Vendor detail drill-down from fleet surface | frontend/src/rental/App.tsx currentView===vendor-detail |
| rental-view:financial-insights | REGISTERED_MODULE | Evaluations Finance | Financial evaluation analytics rental surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(financial-insights) |
| rental-view:invoices | REGISTERED_MODULE | Invoices | Operational invoice management surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(invoices) |
| rental-view:customer-payments | REGISTERED_MODULE | Payments (Rental Collections) | Customer payment collection surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(customer-payments) |
| rental-view:price-tariffs | REGISTERED_MODULE | Pricing & Deposits | Tariff and pricing configuration surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(price-tariffs) |
| rental-view:workflow-automation | REGISTERED_MODULE | Workflows | Workflow configuration and runtime management surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(workflow-automation) |
| rental-view:insurances | REGISTERED_MODULE | Insurances | Tenant insurance management surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(insurances) |
| rental-view:parts-accessories | REGISTERED_MODULE | Parts & Accessories | Parts procurement surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(parts-accessories) |
| rental-view:settings/account | REGISTERED_MODULE | Account & Self-Service | Settings account tab for self-service profile | frontend/src/rental/components/Sidebar.tsx settingsTab=account |
| rental-view:settings/company | REGISTERED_MODULE | Organizations & Tenancy | Settings company profile tab | frontend/src/rental/components/Sidebar.tsx settingsTab=company |
| rental-view:settings/users | REGISTERED_MODULE | Users & Invites | Settings users and roles tab | frontend/src/rental/components/Sidebar.tsx settingsTab=users |
| rental-view:settings/data-authorization | REGISTERED_MODULE | Data Authorizations | Settings data authorization consent tab | frontend/src/rental/components/Sidebar.tsx settingsTab=data-authorization |
| rental-view:settings/email-versand | REGISTERED_MODULE | Outbound Email | Settings outbound email configuration tab | frontend/src/rental/components/Sidebar.tsx settingsTab=email-versand |
| rental-view:settings/rental-rules | REGISTERED_MODULE | Rental Rules | Settings rental rules configuration tab | frontend/src/rental/components/Sidebar.tsx settingsTab=rental-rules |
| rental-view:settings/billing | REGISTERED_MODULE | Billing (SynqDrive SaaS) | Settings tenant SaaS billing tab | frontend/src/rental/components/Sidebar.tsx settingsTab=billing |
| rental-view:support | REGISTERED_MODULE | Support | In-app support ticket surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(support) |
| rental-view:help-center | SHARED_INFRASTRUCTURE | N/A | Static help content surface without dedicated backend module | frontend/src/rental/components/Sidebar.tsx handleViewChange(help-center) |
| rental-view:data-analyse | REGISTERED_MODULE | Data Analyse | Advanced org analytics surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(data-analyse) |
| rental-view:document-upload | REGISTERED_MODULE | Document Extraction (AI Upload) | AI Upload document intake surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(document-upload) |
| rental-view:ai-assistant | REGISTERED_MODULE | AI Platform (Fleet Chat & Tools) | Fleet AI chat assistant surface | frontend/src/rental/components/Sidebar.tsx handleViewChange(ai-assistant) |
| rental-view:fines | REGISTERED_MODULE | Fines | Fine management surface routed in App.tsx | frontend/src/rental/App.tsx currentView===fines |
| rental-view:new-booking | SUBCOMPONENT_OF_MODULE | Bookings | New booking wizard entry route within bookings module | frontend/src/rental/App.tsx currentView===new-booking |
| rental-vehicle-tab:overview | AGGREGATE_CONTAINER | Vehicles (Fleet Operations); Vehicle Health Summary | Vehicle overview hub aggregating location, health cards, and quick navigation | frontend/src/rental/lib/vehicle-overview-navigation.ts VEHICLE_DETAIL_TAB_KEYS overview |
| rental-vehicle-tab:connectivity | REGISTERED_MODULE | DIMO Integration; High Mobility Integration | Vehicle connectivity and telematics consent surface | frontend/src/rental/lib/vehicle-overview-navigation.ts connectivity tab |
| rental-vehicle-tab:trips | REGISTERED_MODULE | Trip Detection & Lifecycle | Vehicle trip list and route detail surface | frontend/src/rental/lib/vehicle-overview-navigation.ts trips tab; model VehicleTrip |
| rental-vehicle-tab:health-errors | AGGREGATE_CONTAINER | Vehicle Health Summary; DTC / Error Codes; Brakes Health; Tires Health; Battery V2 | Vehicle health and error-code aggregate detail surface | frontend/src/rental/lib/vehicle-overview-navigation.ts health-errors tab |
| rental-vehicle-tab:damages | REGISTERED_MODULE | Damages | Vehicle damage pin and image management surface | frontend/src/rental/lib/vehicle-overview-navigation.ts damages tab |
| rental-vehicle-tab:documents | REGISTERED_MODULE | Documents | Vehicle document list and legal text surface | frontend/src/rental/lib/vehicle-overview-navigation.ts documents tab |
| rental-vehicle-tab:vehicle-bookings | REGISTERED_MODULE | Bookings | Vehicle-scoped booking history surface | frontend/src/rental/lib/vehicle-overview-navigation.ts vehicle-bookings tab |
| rental-vehicle-tab:vehicle-tasks | REGISTERED_MODULE | Tasks & Work Orders | Vehicle-scoped task list surface | frontend/src/rental/lib/vehicle-overview-navigation.ts vehicle-tasks tab |
| rental-vehicle-tab:vehicle-requirements | REGISTERED_MODULE | Rental Rules; Service Events & Compliance | Vehicle rental requirement and compliance checklist surface | frontend/src/rental/lib/vehicle-overview-navigation.ts vehicle-requirements tab |
| operator-tab:today | AGGREGATE_CONTAINER | Bookings; Tasks & Work Orders | Operator today feed aggregating bookings and tasks for field ops | frontend/src/operator/components/OperatorBottomNav.tsx id=today |
| operator-tab:scan | SUBCOMPONENT_OF_MODULE | Vehicles (Fleet Operations) | Vehicle scan/search entry within operator shell | frontend/src/operator/components/OperatorBottomNav.tsx id=scan; frontend/src/operator/lib/operatorRoutes.ts tab=scan |
| operator-tab:vehicles | REGISTERED_MODULE | Vehicles (Fleet Operations) | Operator vehicle list and detail routes | frontend/src/operator/components/OperatorBottomNav.tsx id=vehicles; frontend/src/operator/OperatorApp.tsx vehicles/:vehicleId |
| operator-tab:tasks | REGISTERED_MODULE | Tasks & Work Orders | Operator task list and detail surface | frontend/src/operator/components/OperatorBottomNav.tsx id=tasks |
| operator-tab:more | SHARED_INFRASTRUCTURE | N/A | Operator settings and cross-app navigation shell, not a product module | frontend/src/operator/views/OperatorMoreView.tsx |
| operator-sheet:booking-create | SUBCOMPONENT_OF_MODULE | Bookings | Operator mobile booking creation sheet | frontend/src/operator/views/OperatorMoreView.tsx openSheet booking-create; frontend/src/operator/lib/operatorTypes.ts |
| operator-sheet:ai-upload | SUBCOMPONENT_OF_MODULE | Document Extraction (AI Upload) | Operator mobile AI Upload sheet reusing canonical extraction flow | frontend/src/operator/components/OperatorAiUploadSheet.tsx; frontend/src/operator/lib/operatorTypes.ts type=ai-upload |
| operator-sheet:tire-measure | SUBCOMPONENT_OF_MODULE | Tires Health | Operator manual tire tread measurement capture flow | frontend/src/operator/tire-measure/OperatorTireMeasureFlow.tsx; frontend/src/operator/lib/operatorTypes.ts type=tire-measure |
| operator-sheet:handover-pickup | SUBCOMPONENT_OF_MODULE | Bookings | Operator pickup handover protocol flow | frontend/src/operator/handover/; frontend/src/operator/tasks/useOperatorTaskCardController.ts open-handover-pickup |
| operator-sheet:handover-return | SUBCOMPONENT_OF_MODULE | Bookings | Operator return handover protocol flow | frontend/src/operator/handover/; frontend/src/operator/tasks/useOperatorTaskCardController.ts open-handover-return |
| operator-route:bookings/:bookingId | SUBCOMPONENT_OF_MODULE | Bookings | Operator deep-link to booking detail | frontend/src/operator/OperatorApp.tsx Route bookings/:bookingId |
| operator-sheet:task-create | SUBCOMPONENT_OF_MODULE | Tasks & Work Orders | Operator task creation sheet | frontend/src/operator/lib/operatorTypes.ts type=task-create |
| operator-sheet:task-detail | SUBCOMPONENT_OF_MODULE | Tasks & Work Orders | Operator task detail sheet | frontend/src/operator/lib/operatorTypes.ts type=task-detail |
| operator-sheet:pickup-verification | SUBCOMPONENT_OF_MODULE | Bookings | Operator pickup verification gate sheet | frontend/src/operator/lib/operatorTypes.ts type=pickup-verification |
| driver-portal | INSUFFICIENT_EVIDENCE | N/A | DRIVER role exists in backend permissions but no dedicated frontend product surface found | backend permission DRIVER referenced in architecture; no frontend/src/driver/ route tree |


### 8.6 Prisma domain / model clusters (50)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| Prisma Organization & tenancy | REGISTERED_MODULE | Organizations & Tenancy | Core tenant organization and membership persistence | models Organization, OrganizationMembership, OrganizationRole* in backend/prisma/schema.prisma |
| Prisma Users & IAM auth | REGISTERED_MODULE | Users & Invites; Auth API; IAM MFA | User identity, invites, MFA, and session revocation models | models User, RefreshToken, UserMfaFactor, OrganizationUserInvite, IamSessionRevocationIntent |
| Prisma IAM audit & retention | REGISTERED_MODULE | IAM Data Retention; Activity Log & HTTP Audit; Business Audit | IAM and business audit outbox plus retention purge logs | models IamAuditOutbox, BusinessAuditOutbox, IamRetentionRunLog, ActivityLog |
| Prisma Stations & products | REGISTERED_MODULE | Stations; Products (Rental Catalog) | Station locations and rental product catalog persistence | models Station, Product, OrganizationProduct, VehicleStationTransfer |
| Prisma Vehicles fleet | REGISTERED_MODULE | Vehicles (Fleet Operations) | Core vehicle operational entity and latest state | models Vehicle, VehicleLatestState, VehiclePositionUpdate, VehicleComplaint |
| Prisma DIMO connectivity | REGISTERED_MODULE | DIMO Integration | DIMO vehicle linkage, poll logs, and device connection episodes | models DimoVehicle, DimoPollLog, DeviceConnectionEpisode, DeviceConnectionWebhookInbox |
| Prisma High Mobility | REGISTERED_MODULE | High Mobility Integration | HM vehicle registration and telemetry sync state | models HighMobilityVehicle, HmLatestHealthState, HmLatestTelemetryState |
| Prisma Tires health | REGISTERED_MODULE | Tires Health | Tire lifecycle, measurements, wear ledger, and health alerts | models Tire, TireHealthSnapshot, TireTripUsageLedger, TireHealthAlert |
| Prisma Brakes health | REGISTERED_MODULE | Brakes Health | Brake installations, service applications, and health snapshots | models BrakeComponentInstallation, BrakeHealthCurrent, BrakeHealthSnapshot |
| Prisma Battery V2 | REGISTERED_MODULE | Battery V2 | Battery V2 measurements, assessments, HV health, and job DLQ | models BatteryMeasurement, BatteryAssessment, HvBatteryHealthCurrent, BatteryV2JobDeadLetter |
| Prisma Service & compliance | REGISTERED_MODULE | Service Events & Compliance | Service events and rental health review overrides | models VehicleServiceEvent, TireRentalHealthReviewOverride, BrakeRentalHealthReviewOverride |
| Prisma Damages | REGISTERED_MODULE | Damages | Vehicle damage records and image attachments | models VehicleDamage, VehicleDamageImage, VehicleExteriorImage |
| Prisma DTC / error codes | REGISTERED_MODULE | DTC / Error Codes | DTC events and knowledge enrichment persistence | models VehicleDtcEvent, DtcKnowledge, DtcVehicleKnowledge |
| Prisma Trips & tracking | REGISTERED_MODULE | Trip Detection & Lifecycle | Trip entities, waypoints, route artifacts, and detection state | models VehicleTrip, VehicleTripWaypoint, VehicleTripDetectionState, TripRepair |
| Prisma Driving intelligence | REGISTERED_MODULE | Driving Intelligence | Driving analysis runs, evidence, misuse cases, and impact | models DrivingAnalysisRun, DrivingEvidence, MisuseCase, TripDrivingImpact, VehicleDrivingImpactCurrent |
| Prisma Energy events | REGISTERED_MODULE | Energy Event Detection (EED) | REFUEL/RECHARGE energy event persistence and reconciliation | models VehicleEnergyEvent, VehicleEnergyEventRefuelReconciliation |
| Prisma Tankstellenerkennung enrichment | REGISTERED_MODULE | Tankstellenerkennung | Fuel station enrichment records downstream of REFUEL events | model VehicleEnergyEventFuelStationEnrichment in backend/prisma/schema.prisma |
| Prisma ATE enrichment | REGISTERED_MODULE | Automatic Trip Enrichment (ATE) | Trip behavior events and enrichment job tracking | models TripBehaviorEvent, VehicleEnrichmentJob |
| Prisma Reference capture | SUBCOMPONENT_OF_MODULE | Driving Intelligence | Reference capture sessions for HF recovery testbed | models ReferenceCaptureSession, ReferenceCaptureObservation |
| Prisma Customers & prospects | REGISTERED_MODULE | Customers; Prospects | Customer profiles and master-admin prospect records | models Customer, Prospect, CustomerTimelineEvent |
| Prisma Customer verification | REGISTERED_MODULE | Customer Verification (Didit) | Didit verification checks and webhook events | models CustomerVerificationCheck, DiditWebhookEvent |
| Prisma Rental rules | REGISTERED_MODULE | Rental Rules | Org rental policy and vehicle requirement overrides | models OrganizationRentalRules, RentalRuleRevision, VehicleRentalRequirementOverride |
| Prisma Bookings & handover | REGISTERED_MODULE | Bookings | Booking lifecycle, handover protocols, and eligibility | models Booking, BookingHandoverProtocol, BookingEligibilityDecision, RentalContract |
| Prisma Pricing & deposits | REGISTERED_MODULE | Pricing & Deposits | Tariff books, price snapshots, and booking deposits | models PriceBook, PriceTariffGroup, BookingPriceSnapshot, BookingDeposit |
| Prisma Rental driving analysis | REGISTERED_MODULE | Rental Driving Analysis | Booking-scoped driving analysis aggregation persistence | model RentalDrivingAnalysis |
| Prisma Payments & invoices | REGISTERED_MODULE | Payments (Rental Collections); Invoices | Stripe Connect payments and operational invoices | models BookingPaymentRequest, PaymentTransaction, OrgInvoice |
| Prisma Billing SaaS | REGISTERED_MODULE | Billing (SynqDrive SaaS) | Tenant SaaS subscription billing and Stripe catalog | models BillingSubscription, BillingInvoice, BillingCatalogProduct |
| Prisma Documents & extraction | REGISTERED_MODULE | Documents; Document Extraction (AI Upload) | Legal documents, extraction archives, and booking document jobs | models GeneratedDocument, VehicleDocumentExtraction, BookingDocumentGenerationJob |
| Prisma Fines | REGISTERED_MODULE | Fines | Traffic and parking fine records | model Fine |
| Prisma Tasks & automation | REGISTERED_MODULE | Tasks & Work Orders | Org tasks, checklist items, and automation outbox | models OrgTask, TaskChecklistItem, TaskAutomationOutbox |
| Prisma Service cases | REGISTERED_MODULE | Service Cases | Service case tracking with comments and attachments | models ServiceCase, ServiceCaseComment |
| Prisma Technical observations | REGISTERED_MODULE | Technical Observations | Operator technical observation records (via handover payload) | frontend/src/operator/handover/operatorHandoverTechnicalObservations.ts |
| Prisma Notifications | REGISTERED_MODULE | Notifications | Notification entities, delivery outbox, and receipts | models Notification, NotificationDeliveryOutbox, NotificationReceipt |
| Prisma Workflows | REGISTERED_MODULE | Workflows | Org workflow definitions, runs, approvals, and shadow mode | models OrgWorkflow, OrgWorkflowRun, OrgWorkflowApproval |
| Prisma Communication hub | REGISTERED_MODULE | Communication Center | Canonical communication conversation and message store | models CommunicationConversation, CommunicationMessageContent, CommunicationEvent |
| Prisma WhatsApp | REGISTERED_MODULE | WhatsApp Business | WhatsApp tenant config, conversations, and webhook events | models OrgWhatsAppConfig, WhatsAppConversation, WhatsAppWebhookEvent |
| Prisma SMS | REGISTERED_MODULE | SMS & Twilio Messaging | SMS tenant config, conversations, and messages | models OrgSmsConfig, SmsConversation, SmsMessage |
| Prisma Voice | REGISTERED_MODULE | Voice Assistant Platform | Voice assistants, conversations, billing, and tool execution | models VoiceAssistant, VoiceConversation, VoiceBillingPeriod, VoiceToolExecution |
| Prisma Outbound email | REGISTERED_MODULE | Outbound Email | Outbound email queue and delivery events | models OutboundEmail, OutboundEmailEvent, OrgEmailSettings |
| Prisma Parts & accessories | REGISTERED_MODULE | Parts & Accessories | Parts provider access and search requests | models PartsProvider, PartsSearchRequest, PartsAuthorizationLog |
| Prisma Insurances | REGISTERED_MODULE | Insurances | Insurance partners, inquiries, and vehicle insurance records | models InsurancePartner, InsuranceInquiry, VehicleInsuranceRecord |
| Prisma Vendors | REGISTERED_MODULE | Vendors | Vendor directory and vehicle linkage | models Vendor, VendorVehicle |
| Prisma Integrations | REGISTERED_MODULE | Integrations Hub | Integration definitions and org connection records | models Integration, OrganizationIntegration |
| Prisma Data authorizations | REGISTERED_MODULE | Data Authorizations | Org data-access consent records | model OrgDataAuthorization |
| Prisma AI platform | REGISTERED_MODULE | AI Platform (Fleet Chat & Tools) | Fleet chat agents, messages, and AI audit logs | models OrganizationChatAgent, ChatMessage, AiRequestAuditLog |
| Prisma Evaluations | REGISTERED_MODULE | Evaluations Analytics | Entity-scoped evaluation references and dashboard insights | models EvaluationsEntityReference, DashboardInsight, TenantInsightPolicy |
| Prisma Evaluations finance | REGISTERED_MODULE | Evaluations Finance | Finance evaluation persistence consumed by evaluations-finance APIs | backend/src/modules/evaluations-finance/ (no separate Prisma prefix; uses shared analytics cache) |
| Prisma Support | REGISTERED_MODULE | Support | Support tickets and messages | models SupportTicket, SupportTicketMessage |
| Prisma Analytics cache | SHARED_INFRASTRUCTURE | N/A | Shared analytics cache table used across evaluation modules | model AnalyticsCache in backend/prisma/schema.prisma |
| Prisma Platform changelog | SHARED_INFRASTRUCTURE | N/A | Engineering changelog persistence for master Changes view | model PlatformChangelog in backend/prisma/schema.prisma |


**Manifest totals (§8):**

| Source surface | Rows |
|---|---:|
| §8.1 Backend top-level modules | 68 |
| §8.2 Vehicle-intelligence domains | 46 |
| §8.3 App module infrastructure imports | 14 |
| §8.4 Workers imports + queues | 35 |
| §8.5 Frontend navigation surfaces | 72 |
| §8.6 Prisma model clusters | 50 |
| **Total manifest rows** | **285** |

**Classification counts (manifest manifestations):**

| Classification | Count |
|---|---:|
| REGISTERED_MODULE | 156 |
| ALIAS_OF_REGISTERED_MODULE | 1 |
| SUBCOMPONENT_OF_MODULE | 98 |
| SHARED_INFRASTRUCTURE | 21 |
| AGGREGATE_CONTAINER | 7 |
| INSUFFICIENT_EVIDENCE | 1 |
| UNRESOLVED_BOUNDARY | 1 |

**Unique registry modules referenced:** 63 (6 `AUTHORITY_ACTIVE` + 57 `NOT_STARTED`) — manifest rows are structural manifestations, not registry row count.

**Unclassified rows:** 0 (every row above uses a complete allowed classification token with non-empty canonical module, reason, and evidence).

## 9. Module granularity re-evaluation (retained separate modules)

No modules were added, removed, renamed, or merged in this correction pass. The manifest review confirms the original 57 `NOT_STARTED` rows remain defensible. Overlap pairs below document **independence signals** and classification outcome.

| Pair | Retained separate? | Independence signal | Outcome |
|------|-------------------|---------------------|---------|
| Activity Log & HTTP Audit vs Business Audit | Yes | HTTP mutation audit API/persistence vs business-event outbox processor and `BusinessAuditOutbox` models | Separate modules retained |
| Communication Center vs SMS / WhatsApp / Voice | Yes | Canonical conversation store/API vs channel-specific integration modules, webhooks, and provider adapters | Hub + channel modules retained |
| Data Analyse vs Rental Driving Analysis | Yes | Org-wide permission-gated analytics API vs booking-scoped `rental-driving-analysis` module/API | Separate modules retained; boundary audit deferred |
| Dashboard Utilization vs Business Insights | Yes | Utilization aggregate metrics API vs detector-based insight signal pipeline | Separate modules retained |
| Documents vs Document Extraction | Yes | Storage/retention/legal docs vs `DOCUMENT_EXTRACTION` queue and apply/review flow | Separate modules retained |
| DIMO Integration vs Trip Detection & Lifecycle | Yes | External telematics integration/webhooks/queues vs trip FSM/`TRIP_TRACKING` consumer domain | Separate modules retained |
| Evaluations Analytics vs Evaluations Finance | Yes | Insights/quality/recommendation layers vs dedicated `evaluations-finance` controller/module | Separate modules retained |
| Platform Admin vs Integrations Hub | Yes | Master-admin cross-tenant ops vs tenant-scoped integrations configuration | Separate modules retained (different tenancy boundary) |
| Rental Health vs Vehicle Health Summary | Yes | Fleet-level aggregation API vs per-vehicle summary/warning-lights/vehicle-file projection | Separate modules retained |
| Vehicles vs DIMO connectivity | Yes | Core vehicle CRUD/operational projection module vs external DIMO integration module consumed by vehicles/trips | Separate modules retained |

## 10. Alias-to-module mapping

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
| `vehicle-warning-gdpr` | IAM Data Retention (subcomponent) |
| `legacy battery`, `vehicle-intelligence/battery/` | Battery V2 (subcomponent) |
| `master-admin-smoke-lifecycle` | Platform Admin (subcomponent) |
| `clickhouse`, `observability`, `health` module | Shared infrastructure (excluded) |
| six `voice-*` backend modules | Voice Assistant Platform |

**Alias mapping rows:** 15

---

## 11. Subcomponents of registered modules or authorities (not separately registered)

| Candidate | Owned by |
|-----------|----------|
| Misuse Cases (`misuse-cases/`) | Driving Intelligence authority |
| Findings (`findings/`) | Driving Intelligence authority |
| Post-finalize enrichment jobs (`enrichment-jobs/`, behavior enrichment processors) | Automatic Trip Enrichment (ATE) |
| Fuel station enrichment processor | Tankstellenerkennung |
| Battery V2 job producers/processors | Battery V2 |
| EED observability module | Energy Event Detection (EED) adjunct |
| Deposit resolver | Pricing & Deposits |
| Evaluations privacy/audit/e5/e7/metrics subdirs | Evaluations Analytics |
| Vehicle detail observability | Shared infrastructure |
| Communication channel adapters | Communication Center (channels remain separate integration modules) |
| Twilio provider module | SMS & Twilio Messaging |
| Legacy `vehicle-intelligence/battery/` | Battery V2 |
| `vehicle-file/` dossier summary | Vehicle Health Summary |
| Booking document generation submodule | Documents |
| Operator handover / AI upload UI flows | Bookings / Document Extraction sub-surfaces |

**Subcomponent rows:** 15

---

## 12. Shared infrastructure excluded from module registry

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

**Shared infrastructure rows:** 11

---

## 13. Classification outcomes (reconciled ambiguity counts)

### 13.1 Resolved alias / subcomponent decisions (6)

| Candidate | Decision |
|-----------|----------|
| Legacy `vehicle-intelligence/battery/` vs Battery V2 | Subcomponent of Battery V2 authority |
| Evaluations Metrics module | Subcomponent of Evaluations Analytics |
| Vehicle File vs Vehicle Health Summary | Subcomponent merged under Vehicle Health Summary row |
| Misuse Cases / Findings | Subcomponents of Driving Intelligence authority |
| Twilio provider module | Subcomponent of SMS & Twilio Messaging |
| Deposit resolver module | Subcomponent of Pricing & Deposits |

### 13.2 Resolved separate-module decisions with deferred boundary audit (4)

| Pair | Decision |
|------|----------|
| Rental Driving Analysis vs Data Analyse | Both registered; booking-scoped vs org analytics boundary deferred to audit |
| Integrations Hub vs Platform Admin integrations views | Both registered; tenant vs master tenancy scopes differ |
| Communication Center vs channel modules | Both registered; hub persistence vs channel integrations |
| Vehicles operational projection vs DIMO connectivity | Both registered; fleet entity vs telematics integration |

### 13.3 Genuinely unresolved boundaries (2)

| Candidate | Competing evidence |
|-----------|-------------------|
| Trip Detection vs Driving Intelligence completion handoff | Shared trip completion signals; FSM vs post-trip analysis ownership not fully decidable without audit |
| `vehicle-intelligence/drive-profile/` ownership | Could belong to Trip Detection or Driving Intelligence pipelines |

### 13.4 Insufficiently evidenced candidates (1)

| Candidate | Reason |
|-----------|--------|
| Driver / customer self-service portal | `DRIVER` role exists in backend; no dedicated frontend product surface or module boundary |

---

## 14. Second-pass reconciliation result

| Pass | Finding |
|------|---------|
| Backend vs frontend | Every major rental/master/operator nav item maps to a registered backend module or existing authority. |
| Frontend vs backend | Operator, rental, and master surfaces covered. Driver/customer portal insufficiently evidenced. |
| Prisma clusters | Booking, vehicle, tire, brake, billing, notification, workflow, communication, voice, and evaluation model groups align with registered modules. |
| Workers/queues | All domain queues classified in manifest §8.4. |
| Coverage manifest | 285 classified rows in §8; 0 rows with missing or abbreviated classification tokens. |
| Duplicate names | Aliases reconciled; no duplicate registry rows for existing authorities. |
| Over-promotion check | DTOs, hooks, processors, and test suites not registered as modules. |

**Second-pass conclusion:** 63 total registry modules (6 `AUTHORITY_ACTIVE` + 57 `NOT_STARTED`) remains defensible after manifest-backed granularity review. No registry row changes required in this correction pass.

---

## 15. Coverage limitations

- Production runtime state was not inspected; queue names and deploy scripts used as supporting evidence only.
- Submodule boundaries inside large domains (especially trips vs driving intelligence) require future audit — inventory names do not resolve all internal ownership questions.
- Frontend-only or backend-only stubs without coherent product surface were not registered.
- Internationalization and design-system components were out of scope.

---

## 16. Explicit audit disclaimer

**No full current-state audit or Production verification was performed for any newly registered module.**

**Registration means the module name and a minimal inventory description are known — not that architecture is complete, canonical, or safe to change.**

Future work must follow [`MODULE_AUTHORITY_STANDARD.md`](MODULE_AUTHORITY_STANDARD.md) to promote modules from `NOT_STARTED` → `AUDIT_IN_PROGRESS` → `AUTHORITY_ACTIVE`.

---

## 17. Inventory counts (reconciled)

| Metric | Count |
|--------|------:|
| Existing `AUTHORITY_ACTIVE` modules (preserved) | 6 |
| Newly registered `NOT_STARTED` modules | 57 |
| **Total registry modules** | **63** |
| Alias mapping rows (§10) | 15 |
| Subcomponent exclusions (§11) | 15 |
| Shared infrastructure exclusions (§12) | 11 |
| Coverage manifest rows — §8.1 backend modules | 68 |
| Coverage manifest rows — §8.2 VI domains | 46 |
| Coverage manifest rows — §8.3 app imports | 14 |
| Coverage manifest rows — §8.4 workers + queues | 35 |
| Coverage manifest rows — §8.5 frontend surfaces | 72 |
| Coverage manifest rows — §8.6 Prisma clusters | 50 |
| **Total coverage manifest rows (§8)** | **285** |
| Manifest REGISTERED_MODULE count | 156 |
| Manifest SUBCOMPONENT_OF_MODULE count | 98 |
| Manifest SHARED_INFRASTRUCTURE count | 21 |
| Manifest AGGREGATE_CONTAINER count | 7 |
| Manifest ALIAS_OF_REGISTERED_MODULE count | 1 |
| Manifest UNRESOLVED_BOUNDARY count | 1 |
| Manifest INSUFFICIENT_EVIDENCE count | 1 |
| Resolved alias/subcomponent decisions (§13.1) | 6 |
| Resolved separate-module decisions — deferred audit (§13.2) | 4 |
| Genuinely unresolved boundaries (§13.3) | 2 |
| Insufficiently evidenced candidates (§13.4) | 1 |
