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
| Inventory correction HEAD | `140ebdd33` (base) → PR #1548 correction commit |

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
- `ALIAS_OF_REGISTERED_MODULE` — code/worker/UI alias of a registered module or authority
- `SUBCOMPONENT_OF_MODULE` — owned by a registered module or authority; not separately inventoried
- `SHARED_INFRASTRUCTURE` — platform/runtime infrastructure excluded from product module registry
- `INSUFFICIENT_EVIDENCE` — no defensible standalone product module from current evidence
- `UNRESOLVED_BOUNDARY` — evidence exists but ownership boundary not safely decidable in inventory-only pass

### 8.1 Top-level `backend/src/modules/` directories (68)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| backend/src/modules/account/ | R | E | G | I |
| backend/src/modules/activity-log/ | R | E | G | I |
| backend/src/modules/ai/ | R | E | G | I |
| backend/src/modules/auth/ | R | E | G | I |
| backend/src/modules/billing/ | R | E | G | I |
| backend/src/modules/bookings/ | R | E | G | I |
| backend/src/modules/business-audit/ | R | E | G | I |
| backend/src/modules/business-insights/ | R | E | G | I |
| backend/src/modules/clickhouse/ | S | H | A | R |
| backend/src/modules/communication/ | R | E | G | I |
| backend/src/modules/customer-verification/ | R | E | G | I |
| backend/src/modules/customers/ | R | E | G | I |
| backend/src/modules/dashboard-utilization/ | R | E | G | I |
| backend/src/modules/data-analyse/ | R | E | G | I |
| backend/src/modules/data-authorizations/ | R | E | G | I |
| backend/src/modules/deposit/ | S | U | B | C |
| backend/src/modules/dimo/ | R | E | G | I |
| backend/src/modules/document-extraction/ | R | E | G | I |
| backend/src/modules/documents/ | R | E | G | I |
| backend/src/modules/energy-events-observability/ | S | U | B | C |
| backend/src/modules/evaluations-analytics/ | R | E | G | I |
| backend/src/modules/evaluations-finance/ | R | E | G | I |
| backend/src/modules/evaluations-metrics/ | S | U | B | C |
| backend/src/modules/evaluations-observability/ | S | H | A | R |
| backend/src/modules/fines/ | R | E | G | I |
| backend/src/modules/fleet-health-observability/ | S | H | A | R |
| backend/src/modules/health/ | S | H | A | R |
| backend/src/modules/high-mobility/ | R | E | G | I |
| backend/src/modules/iam-data-retention/ | R | E | G | I |
| backend/src/modules/iam-mfa/ | R | E | G | I |
| backend/src/modules/iam-observability/ | S | H | A | R |
| backend/src/modules/insurances/ | R | E | G | I |
| backend/src/modules/integrations/ | R | E | G | I |
| backend/src/modules/invoices/ | R | E | G | I |
| backend/src/modules/master-admin-smoke-lifecycle/ | S | U | B | C |
| backend/src/modules/notifications/ | R | E | G | I |
| backend/src/modules/observability/ | S | H | A | R |
| backend/src/modules/organizations/ | R | E | G | I |
| backend/src/modules/outbound-email/ | R | E | G | I |
| backend/src/modules/parts-accessories/ | R | E | G | I |
| backend/src/modules/payments/ | R | E | G | I |
| backend/src/modules/platform-admin/ | R | E | G | I |
| backend/src/modules/pricing/ | R | E | G | I |
| backend/src/modules/products/ | R | E | G | I |
| backend/src/modules/prospects/ | R | E | G | I |
| backend/src/modules/rental-driving-analysis/ | R | E | G | I |
| backend/src/modules/rental-health/ | R | E | G | I |
| backend/src/modules/rental-rules/ | R | E | G | I |
| backend/src/modules/service-cases/ | R | E | G | I |
| backend/src/modules/sms/ | R | E | G | I |
| backend/src/modules/stations/ | R | E | G | I |
| backend/src/modules/support/ | R | E | G | I |
| backend/src/modules/tasks/ | R | E | G | I |
| backend/src/modules/technical-observations/ | R | E | G | I |
| backend/src/modules/twilio/ | S | U | B | C |
| backend/src/modules/users/ | R | E | G | I |
| backend/src/modules/vehicle-intelligence/ | A | L | I | A |
| backend/src/modules/vehicle-warning-gdpr/ | S | U | B | C |
| backend/src/modules/vehicles/ | R | E | G | I |
| backend/src/modules/vendors/ | R | E | G | I |
| backend/src/modules/voice-assistant/ | A | L | I | A |
| backend/src/modules/voice-billing/ | A | L | I | A |
| backend/src/modules/voice-call-orchestration/ | A | L | I | A |
| backend/src/modules/voice-mcp-gateway/ | A | L | I | A |
| backend/src/modules/voice-protection/ | A | L | I | A |
| backend/src/modules/voice-webhook-ingestion/ | A | L | I | A |
| backend/src/modules/whatsapp/ | R | E | G | I |
| backend/src/modules/workflows/ | R | E | G | I |


### 8.2 First-level `vehicle-intelligence/` domains (46)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| backend/src/modules/vehicle-intelligence/battery/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/battery-health/ | A | L | I | A |
| backend/src/modules/vehicle-intelligence/battery-policy-profile/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/brakes/ | R | E | G | I |
| backend/src/modules/vehicle-intelligence/damage-incidents/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/damages/ | R | E | G | I |
| backend/src/modules/vehicle-intelligence/dashboard-warning-lights/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/dimo-native-driving-events/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/dimo-trip-segment-validation/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/drive-profile/ | U | N | R | E |
| backend/src/modules/vehicle-intelligence/driver-attribution/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-analysis-init/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-analysis-reconciliation/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-analysis-run/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-analysis-stage/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-capability/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-decisions/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-detector-capability/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-events/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-evidence/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-impact/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-impact-model-profile/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-impact-rolling/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-intelligence-jobs/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-intelligence-v2/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-metric-normalization/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/driving-signals/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/dtc/ | R | E | G | I |
| backend/src/modules/vehicle-intelligence/dtc-knowledge/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/energy-events/ | A | L | I | A |
| backend/src/modules/vehicle-intelligence/enrichment-jobs/ | A | L | I | A |
| backend/src/modules/vehicle-intelligence/event-context/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/findings/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/fuel-stations/ | A | L | I | A |
| backend/src/modules/vehicle-intelligence/health-summary/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/lv-battery-chemistry/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/misuse-cases/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/reference-capture/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/service-compliance/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/service-events/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/shadow-detector/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/tenant/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/tires/ | R | E | G | I |
| backend/src/modules/vehicle-intelligence/trip-assessability/ | S | U | B | C |
| backend/src/modules/vehicle-intelligence/trips/ | R | E | G | I |
| backend/src/modules/vehicle-intelligence/vehicle-file/ | S | U | B | C |


### 8.3 Additional `app.module.ts` infrastructure / submodule imports

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| AuthApiModule | R | E | G | I |
| MisuseCasesModule | S | U | B | C |
| EvaluationsInsightsModule | S | U | B | C |
| EvaluationsQualityModule | S | U | B | C |
| EvaluationsRecommendationsModule | S | U | B | C |
| SchedulerLeaderElectionModule | A | L | I | A |
| ReconciliationExecutionMutexModule | A | L | I | A |
| VehicleDetailObservabilityModule | S | H | A | R |
| WorkersModule | S | H | A | R |
| PrismaModule | S | H | A | R |
| RedisModule | S | H | A | R |
| StorageModule | S | H | A | R |
| SharedGuardsModule | S | H | A | R |
| StripeEnvironmentModule | S | H | A | R |


### 8.4 `workers.module.ts` imports and queue groups

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| DimoModule | R | E | G | I |
| VehicleIntelligenceModule | A | L | I | A |
| BatteryV2JobsModule | A | L | I | A |
| BookingDocumentGenerationModule | S | U | B | C |
| TaskAutomationOutboxModule | S | U | B | C |


| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| QUEUE DIMO_SNAPSHOT | A | L | I | A |
| QUEUE TRIP_TRACKING | R | E | G | I |
| QUEUE TRIP_BEHAVIOR_ENRICHMENT | A | L | I | A |
| QUEUE DRIVING_INTELLIGENCE | A | L | I | A |
| QUEUE BATTERY_V2 | A | L | I | A |
| QUEUE ENERGY_REFUEL_STATION_ENRICH | A | L | I | A |
| QUEUE DOCUMENT_EXTRACTION | R | E | G | I |
| QUEUE BOOKING_DOCUMENT_GENERATION | S | U | B | C |
| QUEUE NOTIFICATION_EVALUATION | S | U | B | C |
| QUEUE NOTIFICATION_DELIVERY | S | U | B | C |
| QUEUE VOICE_WEBHOOK_PROCESS | A | L | I | A |
| QUEUE CLICKHOUSE_MIRROR_RETRY | S | H | A | R |


### 8.5 Major frontend navigation / product surfaces

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| frontend /rental dashboard | R | E | G | I |
| frontend /rental communication-center | R | E | G | I |
| frontend /rental workflow-automation | R | E | G | I |
| frontend /master platform-ops | A | L | I | A |
| frontend /operator handover | S | U | B | C |
| frontend /operator ai-upload | S | U | B | C |
| frontend DRIVER portal | I | N | S | U |


### 8.6 Prisma domain / model clusters (representative)

| Path / identifier | Classification | Canonical module | Reason | Evidence |
|---|---|---|---|---|
| Prisma Booking* models | R | E | G | I |
| Prisma Vehicle* operational models | R | E | G | I |
| Prisma Tire* / Brake* models | R | E | G | I |
| Prisma Billing* subscription models | R | E | G | I |
| Prisma Notification* models | R | E | G | I |
| Prisma Workflow* models | R | E | G | I |
| Prisma EvaluationsEntityReference | R | E | G | I |


**Manifest totals:** 159 classified rows; **0 unclassified** relevant structural candidates in scoped areas above.

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
| Coverage manifest | 0 unclassified relevant structural candidates in scoped areas. |
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
| Coverage manifest classified rows (§8) | 159 |
| Resolved alias/subcomponent decisions (§13.1) | 6 |
| Resolved separate-module decisions — deferred audit (§13.2) | 4 |
| Genuinely unresolved boundaries (§13.3) | 2 |
| Insufficiently evidenced candidates (§13.4) | 1 |
