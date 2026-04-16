# SynqDrive — Current-State Architecture & Security Review

**Date:** 2026-04-10
**Scope:** Backend, Database, Security, Privacy, Tenancy, Integrations, Pipelines, ISO-Readiness
**Method:** Full codebase inspection (schema.prisma, all backend modules, workers, config, frontend structure)

---

## 1. Executive Summary

### Current State

SynqDrive is a multi-tenant SaaS platform built as a monorepo with a NestJS backend, Vite/React frontend, PostgreSQL via Prisma ORM, Redis + BullMQ for job queues, and external integrations with DIMO (blockchain telematics) and High Mobility (OEM fleet data). The system spans 96 Prisma models, 28+ backend modules, 7 Bull queues, and 6 scheduled workers, serving rental/fleet/taxi operations, vehicle health intelligence, trip tracking, AI analysis, and partner ecosystems.

### Biggest Architecture Strengths

1. **Rich domain model** — 96 models covering vehicles, health, trips, insurance, parts, service partners, voice, and business insights.
2. **Provider isolation pattern** — HM signals are explicitly isolated from DIMO calculation pipelines (documented in code comments).
3. **VehicleDataSourceLink abstraction** — Extensible provider-agnostic link table (`sourceType`, `sourceSubtype`, `sourceReferenceId`) already exists.
4. **Bull queue architecture** — 7 queues with schedulers/processors for snapshot polling, DTC, trips, tire recalculation, and driving impact.
5. **Trip detection state machine** — V2 CUSUM-based trip end detection with recovery scheduler is architecturally solid.
6. **Global ValidationPipe + Helmet** — Basic security hygiene is wired into bootstrap.

### Biggest Risks

1. **CRITICAL: Public unauthenticated `seed-admin` endpoint** can create/reset master admin with hardcoded password on any exposed deployment.
2. **CRITICAL: No centralized tenant isolation enforcement** — org scoping depends on each route/service correctly filtering by orgId; several routes ignore it (IDOR risk).
3. **CRITICAL: Audit logging is structurally dead** — `ActivityLogService.log()` is never called from any application flow outside its own module.
4. **HIGH: JWT secret has a hardcoded fallback** in source code (`synqdrive-dev-jwt-secret-2026`).
5. **HIGH: No soft delete anywhere** — all deletes are hard deletes; no data recovery or retention compliance.
6. **HIGH: No rate limiting** on any API endpoint.

### Most Dangerous Gaps Blocking ISO/Security/Privacy Maturity

- No functioning audit trail (ISO 27001 A.12.4)
- No access control verification between JWT identity and requested resource tenant (ISO 27001 A.9)
- No consent/lawful-basis tracking for PII or telemetry (ISO 27701)
- No data retention/deletion lifecycle (ISO 27001 A.18, GDPR Art. 17)
- No secrets management beyond environment variables (ISO 27001 A.10)
- No incident investigation capability (no log correlation, no admin action trail)

---

## 2. System Topology

### Services & Apps

| Component | Technology | Port | Path |
|-----------|-----------|------|------|
| Backend API | NestJS 10 | 3001 | `backend/` |
| Frontend SPA | Vite 7 + React 19 | 5173 (dev) | `frontend/` |
| Frontend build output | Static files | served by backend | `backend/public/` |
| Database | PostgreSQL 16 | 5432 | `backend/docker-compose.yml` |
| Cache/Queue broker | Redis 7 | 6379 | `backend/docker-compose.yml` |

### Backend Modules (28)

`activity-log`, `auth`, `billing`, `bookings`, `business-insights`, `customers`, `data-authorizations`, `dimo` (28 files), `fines`, `high-mobility` (18 files), `insurances`, `integrations`, `invoices`, `organizations`, `parts-accessories`, `platform-admin`, `products`, `prospects`, `rental-driving-analysis`, `service-partners`, `stations`, `support`, `tasks`, `users`, `vehicle-intelligence` (48 files), `vehicles`, `vendors`, `voice-assistant`, `workflows`

### Workers / Schedulers

| Scheduler | Interval | Queue |
|-----------|----------|-------|
| `dimo-snapshot.scheduler.ts` | 30s | `dimo.snapshot.poll` |
| `dimo-dtc.scheduler.ts` | 3h (repeatable) | `dimo.dtc.poll` |
| `tire-recalculation.scheduler.ts` | 60min | `dimo.tire.recalculation` |
| `brake-recalculation.scheduler.ts` | 60min | in-process (no queue) |
| `trip-tracking-recovery.scheduler.ts` | 2min | `dimo.trip-tracking` |
| `hm-health-polling.scheduler.ts` | 5min tick | in-process (no queue) |
| `business-insights-scheduler.service.ts` | 30min | in-process |

### Bull Queues

`dimo.snapshot.poll`, `dimo.vehicle.sync`, `dimo.dtc.poll`, `dimo.tire.recalculation`, `dimo.trip-tracking`, `trip.behavior.enrichment`, `trip.driving-impact.compute`

### External Integrations

| Provider | Protocol | Auth Method | Files |
|----------|----------|-------------|-------|
| DIMO Telemetry | HTTPS GraphQL | Web3 challenge/sign → developer JWT → vehicle JWT exchange | `dimo-auth.service.ts`, `dimo-telemetry.service.ts` |
| DIMO Identity | HTTPS REST | Developer JWT | `dimo-api-sync.service.ts` |
| DIMO Triggers | HTTPS REST | Developer JWT | `dimo-triggers.service.ts` |
| DIMO Agents | HTTPS REST | Developer JWT + API key | `dimo-agents.service.ts` |
| High Mobility | HTTPS REST | OAuth2 client_credentials | `high-mobility-auth.service.ts`, `high-mobility-fleet.service.ts`, `high-mobility-health-fetch.service.ts` |
| HM MQTT | MQTTS (disabled) | mTLS certificates | `high-mobility-mqtt-consumer.service.ts` |
| Euromaster | HTTPS REST | OAuth2 | `euromaster.client.ts`, `euromaster-auth.service.ts` |
| ElevenLabs | HTTPS REST | API key | `elevenlabs.service.ts` |
| Mapbox | HTTPS REST | API key | `mapbox.service.ts` |
| Google Places | HTTPS REST | API key | `vendors.service.ts` |

### Webhook Endpoints (Inbound)

| Path | Provider | Verification |
|------|----------|-------------|
| `POST /api/v1/webhooks/dimo` | DIMO | Optional HMAC (`x-dimo-signature`) |
| `POST /api/v1/integrations/high-mobility/webhook` | High Mobility | Optional HMAC (`x-hm-signature`) |

### Infrastructure Gaps

- **No Dockerfile** in repo
- **No CI/CD** configuration (`.github/workflows/` absent)
- **No deployment scripts**
- **No health check endpoint** (Kubernetes/ECS readiness)
- **No structured logging** (stdout only via NestJS Logger)

---

## 3. Database Inventory

### Overview

- **Database:** PostgreSQL 16 (via Prisma 5)
- **Models:** 96
- **Enums:** ~115
- **Primary keys:** UUID (`@default(uuid())`) on all models
- **Soft delete:** None (no `deletedAt` field anywhere)
- **createdBy/updatedBy:** Not present on any model

### Critical Tables by Domain

#### Core SaaS

| Table | Org-Scoped | Audit Fields | PII | Sensitive | Notes |
|-------|-----------|-------------|-----|-----------|-------|
| `organizations` | self | created/updated | address, phone, email | — | Tenant root |
| `users` | via memberships | created/updated | email, name, phone | `passwordHash` | Global identity; no `deletedAt` |
| `organization_memberships` | yes | created/updated | — | `permissions` (Json) | `@@unique [userId, orgId]` |
| `stations` | yes | created/updated | — | — | lat/lng GPS |
| `vehicles` | yes | created/updated | VIN, licensePlate | — | `@@unique [vin, orgId]`; `hardwareType` |
| `customers` | yes | created/updated | name, email, phone, DOB, license, address | — | **High PII density** |
| `bookings` | yes | created/updated | — | insurance_options Json | — |
| `prospects` | **NO** | created/updated | company, contact, email, phone | — | **No tenant scoping — global sales pipeline** |

#### Telemetry & Vehicle State

| Table | Org-Scoped | Contains | Sensitive |
|-------|-----------|----------|-----------|
| `vehicle_latest_states` | via vehicle FK | GPS, speed, fuel, EV SoC, tire pressures, DTC list, `rawPayloadJson` | Location data, diagnostics |
| `vehicle_position_updates` | via vehicle FK | lat/lng history | **Location tracking** |
| `vehicle_trips` | via vehicle FK | route geometry, driving scores, behavior JSON, consumption | Location + behavior profiling |
| `vehicle_trip_waypoints` | via trip FK | lat/lng per point | **Granular location** |
| `driving_events` | org **optional** | lat/lng, driverName, `metadataJson` | Location + driver PII |
| `trip_behavior_events` | org **optional** | lat/lng, acceleration data | Location + behavior |
| `dimo_poll_logs` | vehicleId nullable | job metadata | — |
| `analytics_cache` | via vehicle FK | `payloadJson` (required) | May contain any signal data |

#### Health & Diagnostics

| Table | Contains | Notes |
|-------|----------|-------|
| `vehicle_dtc_events` | OBD fault codes, `rawPayload` | Diagnostic data |
| `battery_health_snapshots` | voltage, crank events, `rawPayload` | — |
| `hv_battery_health_snapshots` | SoC, range, odometer | EV health |
| `tire_health_snapshots` | wear data per position | — |
| `brake_trip_metrics` | deceleration, speed profiles | — |
| `hm_signal_group_states` | HM cached signals `dataJson` | Oil, limp mode, tire warnings |

#### External Provider Records

| Table | Contains | Risk |
|-------|----------|------|
| `dimo_vehicles` | externalId, tokenId, `rawJson` | DIMO NFT identifiers; no org scope |
| `high_mobility_vehicles` | VIN, clearance status, `providerPayloadJson`, `telemetryReadinessJson` | Org **optional**; HM API responses stored raw |
| `vehicle_data_source_links` | sourceType, sourceReferenceId, `metadata` Json | **No org column; no Vehicle FK in Prisma** |
| `high_mobility_health_sync_logs` | `payloadJson` from HM API | Raw API responses |
| `high_mobility_stream_sync_logs` | MQTT payloads | Raw telemetry |

#### Credentials Storage

| Table | Field | What's Stored |
|-------|-------|---------------|
| `users` | `passwordHash` | bcrypt hash (cost 10) |
| `organization_integrations` | `credentials` (Json) | Stripe/external API keys |
| `parts_providers` | `credentialsJson` | Parts API keys |
| `insurance_partners` | `credentialsJson` | Insurer API credentials |
| `tenant_service_partner_assignments` | `credentials` (Json) | Service partner creds per org |

**All credential Json fields are stored as plaintext JSON in PostgreSQL. No field-level encryption.**

#### Consent / Authorization Records

| Table | Purpose | Completeness |
|-------|---------|-------------|
| `parts_authorization_logs` | Parts data-sharing consent | Partial (logs IP, user agent) |
| `insurance_data_authorization_logs` | Insurance data sharing | Partial |
| `insurance_live_sharing_permissions` | Ongoing live sharing | Operational |
| `org_data_authorizations` | Generic org data authorization | Structural only |
| `partner_data_authorizations` | Service partner data scopes | Has `consentReference` field |

**Missing:** No user-level consent tracking (GDPR lawful basis), no DIMO access consent record, no HM clearance consent audit from vehicle owner perspective.

### Dangerous Schema Patterns

1. **No soft delete** — Deletes are irreversible; no compliance with data retention requirements.
2. **No `createdBy`/`updatedBy`** on any model — Cannot trace who changed data.
3. **Nullable `organizationId`** on: `DrivingEvent`, `TripBehaviorEvent`, `TripDrivingImpact`, `VehicleTripDetectionState`, `VehicleTripTrackingRun`, `BrakeHealthCurrent`, `VehicleDrivingImpactCurrent`, `HighMobilityVehicle`, `DimoPollLog`, `VehicleDocumentExtraction`, `VehicleTireSetup` — Risk of orphan rows or cross-tenant queries.
4. **Missing Prisma-level FKs** on: `VehicleDataSourceLink.vehicleId`, `HmSignalGroupState.vehicleId`, `Fine.vehicleId/bookingId/customerId`, `OrgTask.vehicleId`, `VehicleInsuranceRecord.vehicleId`, `InsuranceInquiry` references.
5. **Schema vs migration drift** — `TripStatus.CANCELLED` exists in schema but not in the `20260325` migration SQL.

---

## 4. Identity / Tenancy / RBAC Assessment

### Authentication

- **Mechanism:** Stateless JWT (HS256), 24h expiry, no refresh tokens.
- **Password hashing:** bcrypt cost factor 10.
- **JWT claims:** `sub` (userId), `email`, `name`, `platformRole`, `membershipRole`, `organizationId` (from first active membership).
- **Public auth endpoint risk:** `POST /api/v1/auth/seed-admin` is unauthenticated, creates master admin with hardcoded password.
- **Development bypass:** `AuthGuard` injects a master admin dev user when `NODE_ENV=development` and no token is present.

### Role System

| Layer | Roles |
|-------|-------|
| Platform | `MASTER_ADMIN`, `USER` |
| Organization | `ORG_ADMIN`, `SUB_ADMIN`, `WORKER`, `DRIVER` |

- `RolesGuard` checks `user.platformRole` OR `user.membershipRole` against `@Roles()` decorator.
- `permissions` JSON on `OrganizationMembership` exists in schema but is **never enforced** in guards.
- `RolesGuard` is **not global** — must be added per controller.

### Tenant Isolation

**How it works today:**
- Most routes use URL pattern `organizations/:orgId/...` and pass `orgId` to service queries.
- JWT contains `organizationId` from login, but **no middleware verifies that the JWT's orgId matches the requested :orgId**.

**Cross-Tenant / IDOR Risks (Evidence):**

| Route | File | Issue |
|-------|------|-------|
| `GET organizations/:orgId/vehicles/:vehicleId/telemetry` | `vehicles.controller.ts` | `_orgId` parameter ignored; `findUnique({ where: { id: vehicleId } })` with no org filter |
| `GET organizations/:orgId/vehicles/:vehicleId/live-gps` | `vehicles.controller.ts` | Same pattern — org ignored |
| `GET organizations/:orgId/support/tickets/:id` | `support.controller.ts` | `findById(id)` uses `findUnique({ where: { id } })` only |
| `GET vehicles/:vehicleId/*` | `vehicle-intelligence.controller.ts` | Entire health/DTC/trips surface uses `vehicleId` only — no org check |
| `GET organizations/:orgId/activity-log` | `activity-log.controller.ts` | No `@Roles` decorator — any authenticated user for any org |

**Admin Override:**
- `MASTER_ADMIN` routes under `admin/` can operate across all tenants.
- `pruneMasterData()` deletes organizations, vehicles, users, activity logs across the platform.
- **Admin actions are not logged** — `platform-admin.controller.ts` methods do not call `ActivityLogService`.

---

## 5. External Provider Architecture Assessment

### DIMO

| Aspect | Status |
|--------|--------|
| Auth flow | Web3 challenge/sign → developer JWT → vehicle JWT token exchange; Redis + memory cached |
| Vehicle mapping | `Vehicle.dimoVehicleId → DimoVehicle.id`; `DimoVehicle.tokenId` for API calls |
| Telemetry | GraphQL `signalsLatest(tokenId)` → `VehicleLatestState` upsert via Bull worker |
| Webhooks | `POST /webhooks/dimo` with optional HMAC; DTC + ignition/speed triggers |
| Consent model | Implicit — DIMO privilege granted to developer license at vehicle onboarding; no consent record in our DB |
| Audit | `DimoPollLog` per snapshot/DTC job; auth token events in memory only (not persisted) |

### High Mobility

| Aspect | Status |
|--------|--------|
| Auth flow | OAuth2 client_credentials; in-memory token cache only (no Redis) |
| Vehicle mapping | `HighMobilityVehicle` → `VehicleDataSourceLink` → `Vehicle`; VIN as primary identifier |
| Telemetry | REST `get_vehicle_status` command → `HmSignalGroupState` cache; MQTT pipeline implemented but disabled |
| Webhooks | `POST /integrations/high-mobility/webhook` with HMAC; clearance status events |
| Consent model | `HmClearanceStatus` workflow (DRAFT → PENDING → APPROVED); no vehicle owner consent record |
| Audit | `HighMobilityStatusHistory`, `HighMobilityHealthSyncLog`, `HighMobilityStreamSyncLog` |

### Missing Provider-Agnostic Abstraction

- **`VehicleDataSourceLink`** is the right structural foundation but is only used by HM, not DIMO.
- **No unified telemetry facade** — DIMO writes to `VehicleLatestState`; HM writes to `HmSignalGroupState`. No common interface.
- **No per-signal provenance** — `VehicleLatestState.source` defaults to `'dimo'` (string); no signal-level source tagging.
- **No unified consent ledger** — DIMO access is implicit (privilege grant); HM uses clearance workflow; neither produces a consent audit record in our system.
- **Conflict handling:** Explicit code comments prevent HM data from mixing into DIMO pipelines. No merge strategy for when both providers exist on one vehicle.

---

## 6. Telemetry / Trips / Health Pipeline Assessment

### Pipeline Map

```
DIMO API ─── signalsLatest ──→ DimoSnapshotProcessor ──→ VehicleLatestState (upsert)
                                    │                         │
                                    ├─ battery V2 side effect │
                                    ├─ HV battery snapshot    │
                                    └─ trip start evaluation  │
                                                              ▼
                                                    Trip V2 State Machine
                                                    (orchestration service)
                                                         │
                                                    ┌────┴────┐
                                                    │         │
                                               waypoints   CUSUM end
                                                    │     detection
                                                    ▼         │
                                              VehicleTrip ◄───┘
                                                    │
                                         ┌──────────┼──────────┐
                                         ▼          ▼          ▼
                                    HF Enrichment  Route    Driving
                                    (behavior)     Match    Impact
                                         │          │          │
                                         ▼          ▼          ▼
                                  TripBehavior  VehicleTrip  TripDriving
                                  Events        (updated)    Impact

HM API ─── get_vehicle_status ──→ HmSignalGroupState (cache)
                                         │
                                         ▼
                                  AI Health Care (display-only overlay)
                                  Service Info (override when active)
```

### Key Pipeline Risks

| Risk | Pipeline | Severity | Evidence |
|------|----------|----------|----------|
| No idempotency key on snapshot jobs | Snapshot | Medium | Job id = `snapshot-${vehicleId}-${Date.now()}` — concurrent duplicates possible |
| Trip eval failures silently swallowed | Snapshot | Medium | `evaluateTripStart` in try/catch with warn only |
| Battery/HV side effects fire-and-forget | Snapshot | Low | Async errors logged, not rethrown |
| V2 trips use synthetic segment ID | Trip | Medium | `dimoSegmentId = 'v2-${vehicleId}-${startTime}'` — not canonical DIMO segment |
| No driving score on V2 trips | Health/Trip | High | `drivingScore` only populated by deprecated V1 path; V2 uses `drivingStyleScore` in separate table |
| HM health 404 errors logged but UI shows "no data" silently | HM | Medium | HM `fetchHealth` returns empty signals on API failure; UI gets `null` |
| DTC stale threshold hides active faults after 6h | DTC | Low | By design, but could mask real issues |
| No observability on pipeline health | All | High | No metrics, no pipeline health dashboard, no alerting |

---

## 7. Audit / Consent / Provenance Assessment

### What Exists

| Component | Status | Evidence |
|-----------|--------|----------|
| `ActivityLog` model | Schema exists with action/entity enums | `backend/prisma/schema.prisma` |
| `ActivityLogService.log()` | Method exists | `activity-log.service.ts` |
| `DimoPollLog` | Per-job execution log | Written by snapshot/DTC processors |
| `HighMobilityStatusHistory` | Clearance workflow audit | Written by fleet/webhook services |
| `HighMobilityHealthSyncLog` | HM fetch audit | Written by health-fetch service |
| `PartsAuthorizationLog` | Parts data sharing | Logs IP, user agent, disclosed fields |
| `InsuranceDataAuthorizationLog` | Insurance data sharing | Logs decisions |

### What Is Missing

| Gap | Impact | Required For |
|-----|--------|-------------|
| **ActivityLog is never populated** | No user action trail exists | ISO 27001 A.12.4, incident investigation |
| **No admin action logging** | Platform admin actions (prune, backfill) are untraceable | ISO 27001 A.9.4, A.12.4 |
| **No `createdBy`/`updatedBy`** | Cannot prove who changed any record | ISO 27001 A.12.4, GDPR accountability |
| **No auth event logging** | Login, logout, failed login not recorded | ISO 27001 A.12.4.1 |
| **No DIMO consent record** | Cannot prove vehicle access authorization | ISO 27701, provider governance |
| **No HM consent record** | Clearance workflow exists but no vehicle-owner-facing consent proof | ISO 27701, provider governance |
| **No data access logging** | Cannot prove who viewed telemetry/health/location data | ISO 27001 A.12.4, GDPR Art. 30 |
| **No per-signal provenance** | Cannot trace which provider/session produced a data point | Data governance, dispute resolution |
| **No retention enforcement** | No automated deletion after retention period | ISO 27001 A.18.1.3, GDPR Art. 5(1)(e) |

### What Is Required for Unified Trust Architecture

1. **Consent ledger** — Per-vehicle, per-provider record of: who granted access, what scopes, when, proof (signature/reference), expiry.
2. **Access provenance** — Per data point or batch: which provider, which API call, which session/token, timestamp.
3. **User action audit** — Every create/update/delete on tenant data with userId, timestamp, IP, affected entity.
4. **Admin action audit** — Every platform admin action with full context.
5. **Auth event log** — Login, logout, failed login, token refresh.
6. **Retention policy engine** — Per data class, automated archival/deletion.

---

## 8. ISO / Security / Privacy Readiness Gap Analysis

### CRITICAL Gaps

| # | Title | Affected Modules | Why It Matters | Evidence | Direction |
|---|-------|-----------------|----------------|----------|-----------|
| 1 | **Public unauthenticated seed-admin endpoint** | `auth` | Any attacker can create a master admin on exposed deployments | `auth.controller.ts` line 124; public prefix match in `auth.guard.ts` | Remove or protect behind deployment-time-only flag |
| 2 | **No centralized tenant isolation** | All org-scoped routes | Cross-tenant data access possible via direct entity ID manipulation | `vehicles.controller.ts` telemetry/GPS routes; `support.controller.ts`; `vehicle-intelligence.controller.ts` | Implement global org-scoping middleware that verifies JWT orgId matches :orgId |
| 3 | **Audit logging is dead** | Entire platform | No evidence of who did what — blocks ISO 27001 A.12.4 and incident response | `ActivityLogService.log()` has zero callers outside its own module | Wire audit interceptor into all mutating operations |
| 4 | **JWT secret hardcoded fallback** | `auth` | If `JWT_SECRET` env is unset, all deployments share the same secret | `auth.controller.ts` line 13; `auth.guard.ts` line 5 | Remove fallback; fail-fast if JWT_SECRET is not set |

### HIGH Gaps

| # | Title | Affected Modules | Why It Matters | Evidence | Direction |
|---|-------|-----------------|----------------|----------|-----------|
| 5 | **No rate limiting** | All API routes | Brute force, credential stuffing, API abuse | No ThrottlerGuard in codebase | Add `@nestjs/throttler` globally |
| 6 | **No soft delete** | All models | Irrecoverable data loss; no retention compliance | No `deletedAt` in schema.prisma | Add soft delete to PII-bearing and audit-relevant tables |
| 7 | **CORS origin: true** | Backend | Reflects any Origin header; enables CSRF-style attacks from any domain | `main.ts` CORS config | Whitelist specific frontend origins |
| 8 | **Credentials stored as plaintext JSON** | `organization_integrations`, `parts_providers`, `insurance_partners`, `tenant_service_partner_assignments` | Credential exposure on DB compromise | Schema fields: `credentials Json`, `credentialsJson` | Implement field-level encryption or use secrets manager |
| 9 | **Development auth bypass in production risk** | `auth.guard` | If `NODE_ENV` misconfigured, auth is completely bypassed | `auth.guard.ts` lines 38-40, 57-85 | Add explicit runtime check; remove dev bypass from compiled build |
| 10 | **No refresh token mechanism** | `auth` | 24h JWT forces re-login; no revocation capability | `auth.controller.ts` — no refresh endpoint | Implement refresh tokens with rotation |

### MEDIUM Gaps

| # | Title | Affected Modules | Why It Matters | Evidence | Direction |
|---|-------|-----------------|----------------|----------|-----------|
| 11 | **class-validator unused** | All controllers | ValidationPipe exists but DTOs lack decorators — input validation is ineffective | No `class-validator` imports in `backend/src/` | Add validation decorators to all DTO classes |
| 12 | **No data retention policy** | All data stores | Cannot comply with GDPR Art. 5(1)(e), ISO 27001 A.18 | Only `business-insights` has a 7-day prune; no general retention | Define and implement per-table retention policies |
| 13 | **No consent tracking** | Users, vehicles, telemetry | No GDPR lawful basis evidence for PII processing | No consent model for end users | Implement consent ledger |
| 14 | **Webhook verification is optional** | DIMO, HM webhooks | Unsigned webhooks accepted if secret not configured | Both controllers skip verification when secret is empty | Make webhook verification mandatory in production |
| 15 | **Missing Prisma FKs** | `VehicleDataSourceLink`, `HmSignalGroupState`, `Fine`, `OrgTask`, insurance tables | Referential integrity not enforced at DB level | Schema inspection | Add Prisma relations and DB-level FKs |
| 16 | **No structured logging** | All | Cannot correlate requests, cannot search logs, no SIEM integration | NestJS Logger to stdout only | Implement structured JSON logging with request correlation IDs |
| 17 | **No health check / readiness endpoint** | Backend | No container orchestration support | Not found in routes | Add `/health` and `/ready` endpoints |
| 18 | **Permissions JSON not enforced** | RBAC | Fine-grained permissions exist in schema but are never checked | `OrganizationMembership.permissions` unused by `RolesGuard` | Either enforce or remove to avoid false security assumptions |

### LOW Gaps

| # | Title | Affected Modules | Evidence | Direction |
|---|-------|-----------------|----------|-----------|
| 19 | No CI/CD pipeline | DevOps | No `.github/workflows/` | Add automated tests, security scanning, deployment |
| 20 | No Dockerfile | DevOps | Not found | Create for reproducible deployments |
| 21 | Port mismatch in config | Config | `.env.example` = 3000; `app.config.ts` default = 3001 | Align defaults |
| 22 | HM token cache not in Redis | HM auth | In-memory only; lost on restart | Mirror DIMO pattern with Redis cache |

---

## 9. Refactor Readiness Map

### Safe to Keep

- **Core domain models** (Vehicle, Organization, User, Booking, Customer, Trip)
- **Bull queue architecture** and worker/scheduler pattern
- **Trip V2 state machine** with CUSUM end detection
- **VehicleDataSourceLink** as provider abstraction foundation
- **HM signal isolation** design (display-only, never mixed into calc pipelines)
- **Health module decomposition** (battery, tires, brakes, DTC as separate services)
- **Business insights** detector pattern

### Should Be Refactored

| Area | What | Why |
|------|------|-----|
| Auth | Remove seed-admin public endpoint; remove dev bypass; enforce JWT_SECRET | Critical security |
| Tenant isolation | Add global org-scoping interceptor/guard | Cross-tenant risk |
| Audit logging | Wire ActivityLogService into interceptor for all mutations | Dead code currently |
| Credentials storage | Encrypt `credentials` Json fields | Plaintext exposure |
| DIMO vehicle mapping | Use VehicleDataSourceLink for DIMO too (currently only dimoVehicleId FK) | Provider-agnostic architecture |
| VehicleLatestState | Add source tagging per signal field or per-update provenance | Traceability |
| Input validation | Add class-validator decorators to all DTOs | Currently ineffective |
| CORS | Whitelist specific origins | Overly permissive |

### Must Be Introduced New

| Component | Purpose | Priority |
|-----------|---------|----------|
| **Global org-scoping guard** | Verify JWT org matches route org | Phase 1 |
| **Audit interceptor** | Auto-log all mutations with user, IP, entity | Phase 2 |
| **Auth event service** | Log login, logout, failed auth | Phase 2 |
| **Consent ledger model** | Per-vehicle, per-provider consent records | Phase 2 |
| **Data provenance layer** | Source tagging on telemetry/health data | Phase 3 |
| **Provider abstraction facade** | Unified telemetry interface for DIMO + HM | Phase 3 |
| **Field encryption service** | Encrypt/decrypt credential JSON fields | Phase 4 |
| **Retention policy engine** | Per-table automated archival/deletion | Phase 4 |
| **Structured logging** | JSON logs with request correlation IDs | Phase 0 |
| **Health/readiness endpoints** | Container orchestration support | Phase 0 |
| **Rate limiter** | API abuse protection | Phase 1 |
| **Refresh token system** | Token rotation and revocation | Phase 1 |

---

## 10. Phase-by-Phase Remediation Roadmap

### Phase 0: Documentation & Observability (Week 1-2)

**Goal:** Establish visibility before making structural changes.

- [ ] Add structured JSON logging (replace default NestJS Logger)
- [ ] Add request correlation IDs to all log entries
- [ ] Add `/health` and `/ready` endpoints
- [ ] Create `Dockerfile` for backend
- [ ] Set up basic CI pipeline (lint, type-check, test, build)
- [ ] Document current data flow diagrams (from this review)
- [ ] Align `.env.example` PORT with actual default
- [ ] Add `npm audit` to CI

### Phase 1: Schema & Tenancy Hardening (Week 3-5)

**Goal:** Close critical security gaps and enforce tenant isolation.

- [ ] **Remove `seed-admin` public endpoint** or gate behind deployment secret
- [ ] **Remove JWT_SECRET fallback** — fail-fast if unset
- [ ] **Remove dev auth bypass** from production builds (compile-time guard or env check)
- [ ] **Implement global `OrgScopingGuard`** — validates JWT `organizationId` matches `:orgId` in URL
- [ ] **Fix IDOR routes** — vehicle telemetry, support tickets, vehicle intelligence must include org verification
- [ ] **Add `@nestjs/throttler`** with sensible defaults (10 req/s login, 100 req/s API)
- [ ] **Restrict CORS** to known frontend origins
- [ ] **Add soft delete** (`deletedAt`) to: User, Customer, Vehicle, Booking, Organization, SupportTicket
- [ ] **Add `createdBy`/`updatedBy`** to high-value models via Prisma middleware
- [ ] **Add missing Prisma FKs** for VehicleDataSourceLink, HmSignalGroupState, Fine, OrgTask
- [ ] Implement refresh token rotation

### Phase 2: Audit / Consent / Provenance Foundation (Week 6-9)

**Goal:** Build the trust evidence layer required for ISO and provider governance.

- [ ] **Implement AuditInterceptor** — auto-capture mutations (entity, action, userId, orgId, IP, timestamp, diff)
- [ ] **Wire audit to all tenant-facing controllers** via global interceptor
- [ ] **Add auth event logging** — login, logout, failed login, token refresh
- [ ] **Add admin action logging** — all platform-admin mutations
- [ ] **Create consent ledger model** (`VehicleProviderConsent`):
  - vehicleId, provider, grantType, scopes, grantedBy, grantedAt, expiresAt, proofReference, revokedAt
- [ ] **Record DIMO access grants** when vehicle is linked (privilege proof)
- [ ] **Record HM clearance approvals** as consent records
- [ ] **Add provenance metadata** to VehicleLatestState updates (source, sessionId, fetchedAt)
- [ ] **Enforce mandatory webhook verification** in production (fail if secret not set)
- [ ] **Wire VehicleDataSourceLink for DIMO** vehicles (currently only used by HM)

### Phase 3: Provider Abstraction for DIMO + HM (Week 10-13)

**Goal:** Create a unified, provider-agnostic data architecture.

- [ ] **Define TelemetryProvider interface** (fetchLatest, fetchHistory, getCapabilities)
- [ ] **Implement DimoTelemetryProvider** wrapping existing DimoTelemetryService
- [ ] **Implement HmTelemetryProvider** wrapping HM health fetch + MQTT
- [ ] **Create TelemetryFacadeService** that routes to the correct provider per vehicle
- [ ] **Extend VehicleDataSourceLink** with capability metadata (which signals, delivery mode, freshness SLA)
- [ ] **Add per-signal source tagging** on VehicleLatestState or new normalized telemetry table
- [ ] **Implement conflict resolution strategy** when both providers report for same vehicle
- [ ] **Add provider health monitoring** (last success, error rates, latency)
- [ ] Migrate existing DIMO vehicle links to use VehicleDataSourceLink

### Phase 4: Security/Privacy Controls Hardening (Week 14-17)

**Goal:** Close remaining gaps for enterprise readiness.

- [ ] **Implement field-level encryption** for credentials Json fields (AES-256-GCM via KMS or env key)
- [ ] **Add class-validator decorators** to all DTOs (systematic pass)
- [ ] **Implement data retention engine** — per-table policies, automated archival/purge
- [ ] **Add GDPR data export** endpoint (user data portability)
- [ ] **Add GDPR data deletion** workflow (right to erasure with cascade rules)
- [ ] **Implement consent tracking** for end-user PII processing
- [ ] **Add API key management** for external consumers (if applicable)
- [ ] **Implement secrets rotation** capability for external provider credentials
- [ ] **Add security headers audit** (CSP, HSTS, etc.)
- [ ] Enforce HTTPS-only for all external calls (explicit TLS verification)

### Phase 5: Operational Evidence for ISO Readiness (Week 18-22)

**Goal:** Produce evidence that satisfies ISO 27001 / ISO 27701 control requirements.

- [ ] **Asset inventory** — automated registry of all data stores, services, integrations
- [ ] **Access review process** — tooling to audit who has access to what
- [ ] **Incident response runbook** — documented procedures using audit trail
- [ ] **Change management evidence** — Git-based change tracking + deployment audit
- [ ] **Backup/restore testing** — documented database backup verification
- [ ] **Penetration test** — third-party security assessment
- [ ] **Privacy impact assessment** — for DIMO and HM data processing
- [ ] **Supplier risk register** — documented assessment of DIMO, HM, Euromaster, ElevenLabs, Mapbox dependencies
- [ ] **Data classification enforcement** — access controls aligned with sensitivity levels
- [ ] **Business continuity plan** — documented recovery procedures and RTO/RPO targets

---

## Data Classification Reference

| Class | Examples | Current Storage | Required Controls |
|-------|---------|----------------|-------------------|
| **Restricted** | `passwordHash`, API credentials, DIMO private key, HM client secret | Plaintext in DB/env | Encryption at rest, access logging, rotation |
| **Confidential** | Customer PII (name, email, phone, DOB, license), VIN, location history, telemetry, diagnostics | PostgreSQL, unencrypted | Tenant isolation, access logging, retention, consent |
| **Internal** | Booking details, invoices, task descriptions, service events, business insights | PostgreSQL | Tenant isolation, basic access control |
| **Public** | Product catalog, integration catalog, platform changelog | PostgreSQL | Basic integrity |

---

*This review is based on code inspection as of 2026-04-10. Findings are evidence-based with file references. Inferences are labeled. No code changes were made during this review.*

---

## Trip System Architecture — Post-Refactor State (2026-04-10)

The trip detection system has been fully refactored in Phases 0–9 of the SynqDrive V2 Trip System Refactor. The following architectural state now applies:

### Signal Flow (Live Detection)
```
DIMO Snapshot Poll
  → DimoSnapshotProcessor
    → [ClickHouse mirror: fire-and-forget]          (Phase 6)
    → [Prometheus: empty/stale snapshot counters]   (Phase 5)
    → TripDetectionOrchestrationService.evaluateSnapshotForTripStart
        → TripDetectionPolicyResolver.resolve(LIVE_START)
        → DetectorRegistry.runAll(['SnapshotEvidenceEvaluator'])
            → [Prometheus: detector latency]         (Phase 5)
        → TripDecisionEngine.evaluateStartCandidate
          → if shouldStart → POSSIBLE_START state
            → [Prometheus: tripStartCandidates]      (Phase 5)
            → self-retriggering ACTIVE_TICK loop
              → StartConfirmationDetector
              → ContinuityAssessmentDetector
              → EndContinuityDetector
              → ChangePointEndDetector (CUSUM, sorted inputs)
              → TripDecisionEngine.finalizeTrip
                → [Prometheus: tripFinalized, finalizeLatency]  (Phase 5)
                → TripEnrichmentOrchestratorService.enqueueBehaviorEnrichment
```

### Signal Flow (Repair/Reconciliation)
```
TripReconciliationScheduler (fast/warm/cold tiers)  (Phase 8)
  → TripReconciliationService.reconcileWindow
    → repairStaleOngoingTrips
    → detectAndRepairMissingTrips
        → IgnitionSegmentDetector (ClickHouse-backed)   (Phase 7)
        → ActivityWindowDetector (corroboration)         (Phase 7)
    → repairMissingEnds
    → TripDecisionEngine.{createRepairedTrip, finalizeRepairedTrip}
    → [Prometheus: repairActions]                        (Phase 5)

TripTrackingRecoveryScheduler (every 2 min)
  → re-enqueue stale tracking jobs
  → onStuckTrip (POSSIBLE_END > 30 min)              (Phase 8)
  → onAnomalyDetected (ACTIVE_TRIP > 4 hours)         (Phase 8)
```

### Observability Stack
- **Prometheus** (`/metrics` endpoint): trip lifecycle, detector latency, enrichment pipeline, repair actions, snapshot health
- **ClickHouse**: telemetry mirror for analytics (telemetry_snapshots, telemetry_state_changes, telemetry_waypoints, trip_activity_windows, trip_segment_candidates)
- **No Grafana** (out of scope)

### Key Invariants
1. `TripDecisionEngine` is the ONLY class that writes `tripStatus` to `vehicle_trips`
2. V1 signal-based detection is fully removed — no methods or callsites remain
3. All detectors return `DetectorFinding` — they never mutate DB state
4. ClickHouse writes are fire-and-forget — unavailability never blocks the FSM
5. Prometheus metrics are `@Optional()` — metrics unavailability never blocks the FSM
6. Frontend sees only `behaviorReady`/`detailsLimited` — no internal status fields

---

## HM Dual-App Architecture — Post-Refactor State (2026-04-12)

### App-Container Separation

The High Mobility integration is split into two fully independent application containers:

| Container | Env Prefix | Package | Credentials | MQTT Topic | Use Case |
|---|---|---|---|---|---|
| HM Health-APP | `HM_HEALTH_APP_*` | `HEALTH` | Own OAuth + cert | HM snippet | Display-grade health signals on DIMO-backed vehicles |
| HM Telemetry-APP | `HM_TELEMETRY_APP_*` | `FULL_TELEMETRY` | Own OAuth + cert | HM snippet | Independent full-telemetry pipeline |

### Architecture Invariants
1. `HighMobilityAppConfigService` is the single config accessor — no service reads `HM_*` env vars directly
2. Auth tokens are NEVER shared between Health-APP and Telemetry-APP
3. MQTT clients are NEVER shared — separate `clientId`, `topic`, and cert files
4. `HM_HEALTH_APP_MQTT_*` controls health consumer; `HM_TELEMETRY_APP_MQTT_*` controls telemetry consumer
5. `appContainerType` column on `high_mobility_vehicles` (nullable; null = legacy HM_HEALTH_APP row)
6. Signal usage, polling, and HM vehicle link services only access Health-APP records
7. Telemetry ingestion only accesses Telemetry-APP records
8. Both app containers tolerate the other being absent — boot degrades gracefully

### Signal Flow

```
HM Health-APP
  HM_HEALTH_APP_MQTT → HighMobilityHealthAppMqttConsumerService
    → HighMobilityHealthAppIngestionService (appContainerType=HM_HEALTH_APP)
      → HighMobilityTelemetryRoutingService (staging only)
      → [HmSignalUsageService / HmHealthPollingScheduler for display-grade UI usage]

HM Telemetry-APP
  HM_TELEMETRY_APP_MQTT → HighMobilityTelemetryAppMqttConsumerService
    → HighMobilityTelemetryAppIngestionService (appContainerType=HM_TELEMETRY_APP)
      → HighMobilityTelemetryRoutingService (staging only)

OAuth / Fleet Clearance
  HM Health-APP → HighMobilityHealthAppAuthService → HighMobilityFleetService (HEALTH records)
  HM Telemetry-APP → HighMobilityTelemetryAppAuthService → HighMobilityTelemetryAppFleetService (FULL_TELEMETRY records)

Webhooks
  POST /integrations/high-mobility/webhook/health   → verifySignature(HM_HEALTH_APP_WEBHOOK_SECRET)
  POST /integrations/high-mobility/webhook/telemetry → verifySignature(HM_TELEMETRY_APP_WEBHOOK_SECRET)
```

### UI Domain Separation

| Tab | Content | Badge logic |
|---|---|---|
| Registered Vehicles | SynqDrive-registered vehicles | Operational status |
| DIMO | Unregistered DIMO vehicles | `HW only` or `HW + HMH` (HM Health-APP approved) |
| HM Telemetry | Approved HM Telemetry-APP candidates | Ready for registration |

### Environment Variable Contract

```env
# ── HM Health-APP ─────────────────────────────────────────────────────────────
HM_HEALTH_APP_ENV=live
HM_HEALTH_APP_CLIENT_ID=<oauth-client-id>
HM_HEALTH_APP_CLIENT_SECRET=<oauth-client-secret>
HM_HEALTH_APP_WEBHOOK_SECRET=<webhook-hmac-secret>
HM_HEALTH_APP_API_BASE_URL=https://api.high-mobility.com/v1
HM_HEALTH_APP_MQTT_ENABLED=false
HM_HEALTH_APP_MQTT_APP_ID=<hm-app-id>
HM_HEALTH_APP_MQTT_TOPIC=$share/<group>/live/<appId>/#
HM_HEALTH_APP_MQTT_CLIENT_ID=<client-id-from-hm-snippet>
HM_HEALTH_APP_MQTT_CA_CERT_PATH=/path/to/health-ca.crt
HM_HEALTH_APP_MQTT_CLIENT_CERT_PATH=/path/to/health-client.crt
HM_HEALTH_APP_MQTT_CLIENT_KEY_PATH=/path/to/health-client.key
HM_HEALTH_APP_MQTT_CONSUMER_GROUP=synqdrive-hm-health

# ── HM Telemetry-APP ──────────────────────────────────────────────────────────
HM_TELEMETRY_APP_ENV=live
HM_TELEMETRY_APP_CLIENT_ID=<oauth-client-id>
HM_TELEMETRY_APP_CLIENT_SECRET=<oauth-client-secret>
HM_TELEMETRY_APP_WEBHOOK_SECRET=<webhook-hmac-secret>
HM_TELEMETRY_APP_API_BASE_URL=https://api.high-mobility.com/v1
HM_TELEMETRY_APP_MQTT_ENABLED=false
HM_TELEMETRY_APP_MQTT_APP_ID=<hm-app-id>
HM_TELEMETRY_APP_MQTT_TOPIC=$share/<group>/live/<appId>/#
HM_TELEMETRY_APP_MQTT_CLIENT_ID=<client-id-from-hm-snippet>
HM_TELEMETRY_APP_MQTT_CA_CERT_PATH=/path/to/telemetry-ca.crt
HM_TELEMETRY_APP_MQTT_CLIENT_CERT_PATH=/path/to/telemetry-client.crt
HM_TELEMETRY_APP_MQTT_CLIENT_KEY_PATH=/path/to/telemetry-client.key
HM_TELEMETRY_APP_MQTT_CONSUMER_GROUP=synqdrive-hm-telemetry

# ── Auth / Security ────────────────────────────────────────────────────────────
JWT_SECRET=<random-256-bit-secret>           # REQUIRED — app fails fast if absent
JWT_EXPIRES_IN=24h
CORS_ORIGINS=https://app.synqdrive.io,https://admin.synqdrive.io

# Seed-admin bootstrap — disabled by default; only activate for initial deployments
# ENABLE_SEED_ADMIN=true
# SEED_ADMIN_TOKEN=<random-deployment-token>
# SEED_ADMIN_EMAIL=admin@synqdrive.de
```

---

## Security Hotfixes Applied — 2026-04-12

### Summary
Immediate security risks identified in the architecture review were patched without redesigning existing modules.

### Changes

| Area | File(s) Changed | Fix Applied |
|---|---|---|
| **JWT fail-fast** | `src/config/app.config.ts` | Application throws at startup if `JWT_SECRET` is not set. No more hardcoded fallback. |
| **Auth controller** | `src/modules/auth/auth.controller.ts` | Removed hardcoded JWT secret/fallback. JWT secret read from config. |
| **Seed-admin gate** | `src/modules/auth/auth.controller.ts` | `POST /auth/seed-admin` now requires `ENABLE_SEED_ADMIN=true` AND a matching `SEED_ADMIN_TOKEN` header. Returns 403 Forbidden if either check fails. No password in response. |
| **Auth guard** | `src/shared/auth/auth.guard.ts` | Removed `injectDevUser()` dev bypass. Replaced broad `/api/v1/auth/` prefix allowlist with a small explicit set of safe public paths (login, DIMO webhook, HM webhook prefix). |
| **Vehicle telemetry IDOR** | `vehicles.controller.ts`, `vehicles.service.ts` | `getVehicleTelemetry` and `getLiveGps` now enforce `organizationId` ownership before reading by `vehicleId`. Previously `orgId` was silently discarded. |
| **Support ticket IDOR** | `support.controller.ts`, `support.service.ts` | `GET /organizations/:orgId/support/tickets/:id` and `POST /messages` now call org-scoped methods that verify ticket belongs to the org. |
| **Vehicle-intelligence IDOR** | `vehicle-intelligence.controller.ts`, `vehicle-intelligence.module.ts`, new `shared/auth/vehicle-ownership.guard.ts` | Added `VehicleOwnershipGuard` applied at the controller level. MASTER_ADMIN bypasses, all other callers have vehicleId verified against their organizationId. |
| **Trip cross-vehicle IDOR** | `vehicle-intelligence.controller.ts` | `GET /trips/:tripId` now verifies `trip.vehicleId === vehicleId` before returning data. |
| **DIMO webhook verification** | `dimo-webhook.controller.ts` | Removed module-level constant. In production with no secret set, rejects all webhooks. Uses raw body for HMAC when available. Uses `timingSafeEqual` for comparison. |
| **HM webhook verification** | `high-mobility-webhook.service.ts` | In production with no secret configured, throws `UnauthorizedException` instead of silently skipping. |
| **CORS allowlist** | `src/main.ts` | Replaced `origin: true` (permissive) with explicit allowlist from `CORS_ORIGINS` env var. Dev environments auto-include `localhost:3000` and `localhost:5173`. |
| **Rate limiting** | `src/app.module.ts`, `src/main.ts`, `auth.controller.ts` | Added `@nestjs/throttler` with global limit of 200 req/min. Login endpoint limited to 10/min. Seed-admin limited to 3 per 5 minutes. |
| **Raw body** | `src/main.ts` | Enabled NestJS raw body support so HMAC webhook verification uses raw bytes instead of serialised parsed body. |

### New Environment Variables Required

```env
JWT_SECRET=<required-in-all-environments>
CORS_ORIGINS=https://app.synqdrive.io         # comma-separated; localhost auto-included in dev
# Optional — only for bootstrap deployments:
ENABLE_SEED_ADMIN=true
SEED_ADMIN_TOKEN=<random-deployment-token>
```

### Remaining Risks (Not Fixed in This Pass)
- Audit logging (`ActivityLogService.log()`) is still structurally dead — no application flow calls it.
- No soft-delete anywhere — hard deletes leave no audit trail.
- No per-org rate limiting at the DB query layer for large exports.
- Full tenant isolation for all remaining routes relies on correct route-level scoping; only the known IDOR paths were patched here.

---

## Platform Enforcement Layer — Phase 1 Applied — 2026-04-12

### Summary

Moved SynqDrive from scattered per-route safety checks to centralized platform-level enforcement for tenant isolation, request traceability, validation, and operational readiness.

### Enforcement Added

| Item | Files Changed | Detail |
|------|--------------|--------|
| **OrgScopingGuard** | `shared/auth/org-scoping.guard.ts` (NEW), `shared/auth/shared-guards.module.ts` (NEW), `shared/decorators/org-scoped.decorator.ts` (NEW), `auth.module.ts`, `app.module.ts` | Centralized guard that verifies the requesting user has an active DB membership for the requested `:orgId`. MASTER_ADMIN bypasses. Applied to all 20 org-scoped controllers (12 class-level, 8 per-handler). |
| **Stations, bookings, customers, vendors, service-partners, data-authorizations, dashboard-insights, workflows, voice-assistant, rental-driving-analysis** | Each controller file | Added `OrgScopingGuard` at class level before `RolesGuard`. |
| **fines, invoices, tasks, users, support, vehicles** | Each controller file | Added `OrgScopingGuard` per org-scoped handler. |
| **SharedGuardsModule (global)** | `shared/auth/shared-guards.module.ts` | `@Global()` module providing `OrgScopingGuard` and `VehicleOwnershipGuard` app-wide without per-module imports. |
| **Refresh token architecture** | `modules/auth/refresh-token.service.ts` (NEW), `auth.controller.ts`, `auth.module.ts`, `shared/auth/auth.guard.ts`, `prisma/schema.prisma` | SHA-256 hash persistence for lookup, family-based rotation, reuse detection → entire family revoke, 30-day TTL. Endpoints: `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`. |
| **Structured request logging** | `shared/interceptors/request-logging.interceptor.ts` (NEW), `main.ts` | Global interceptor emitting JSON log lines with `requestId`, `userId`, `organizationId`, `method`, `url`, `statusCode`, `durationMs`, `ip`, `userAgent`. Attaches `X-Request-Id` response header. |
| **Health/readiness endpoints** | `modules/health/health.controller.ts` (NEW), `modules/health/health.service.ts` (NEW), `modules/health/health.module.ts` (NEW), `app.module.ts`, `auth.guard.ts` | `GET /health` (liveness), `GET /health/readiness` (Postgres + Redis check). Both publicly accessible. |
| **DTO validation hardening** | `shared/dto/auth.dto.ts`, `shared/dto/user.dto.ts`, `shared/dto/vehicle.dto.ts`, `shared/dto/support.dto.ts`, `shared/dto/organization.dto.ts` (all NEW) | class-validator decorators on auth (LoginDto, RefreshTokenDto, LogoutDto), user create/update, vehicle create/update, support ticket create/update/add-message. Wired into auth.controller.ts and support.controller.ts. |
| **Schema integrity** | `prisma/schema.prisma`, migration `20260412030000_platform_hardening_phase1` | `VehicleDataSourceLink → Vehicle` FK (Cascade), `HmSignalGroupState → Vehicle` FK (Cascade), `refresh_tokens` table, `org_tasks.created_by_user_id / updated_by_user_id`, `vehicles.created_by_user_id / updated_by_user_id`. |
| **createdBy/updatedBy** | `prisma/schema.prisma`, `tasks.service.ts`, `tasks.controller.ts` | `OrgTask` and `Vehicle` now carry `createdByUserId` and `updatedByUserId`. Task creation wires `createdByUserId` from authenticated user context. |

### Routes/Classes Affected

- **Guard coverage**: 20 org-scoped controllers now enforce membership verification at the DB level before any handler runs.
- **New public endpoints**: `GET /health`, `GET /health/readiness`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all` (all excluded from JWT auth where appropriate).
- **Existing login response**: now returns `accessToken`, `refreshToken`, and `expiresIn` alongside legacy `token` field for backward compatibility.

### Migration Implications

The migration `20260412030000_platform_hardening_phase1` adds:
1. `refresh_tokens` table — safe, new table.
2. FK constraint on `vehicle_data_source_links.vehicle_id → vehicles.id` — **check for orphaned rows before applying to production**.
3. FK constraint on `hm_signal_group_states.vehicle_id → vehicles.id` — **check for orphaned rows before applying to production**.
4. Nullable columns on `org_tasks` and `vehicles` — always safe (nullable, no defaults needed).

### Remaining Edge Cases / Future Work
- `createdByUserId` is wired into tasks.service.ts and vehicles.service.ts (Phase 2 completed full wire path).
- Per-handler OrgScopingGuard on billing and activity-log controllers (currently rely on service-level org scoping only).
- Refresh token `family` cookie-based approach is not yet implemented for browser clients that prefer cookie transport.
- DTO validation is wired for auth/support high-risk entry points; remaining controllers (bookings, invoices, fines body shapes) are still untyped DTOs.

---

## Audit / Consent / Provenance Foundation — Phase 2 Applied — 2026-04-12

### Summary

Phase 2 implements the trust-evidence layer for SynqDrive: structured audit, provider consent records, and data provenance tracking from DIMO and High Mobility sources.

### Changes Applied

| Area | Files / Classes Changed | What was implemented |
|---|---|---|
| **AuditService (new)** | `modules/activity-log/audit.service.ts` | Fire-and-forget audit record service. Never throws. Provides `record()`, `critical()`, `warn()` convenience methods and `contextFromRequest()` helper. Registered as `@Global()` via `ActivityLogModule`. |
| **AuditInterceptor (new)** | `shared/interceptors/audit.interceptor.ts` | Global interceptor for all POST/PUT/PATCH/DELETE operations. Derives entity/action from URL and method. Skips high-volume paths (webhooks, health). Registered via `APP_INTERCEPTOR` in `app.module.ts`. |
| **ActivityLogModule** | `modules/activity-log/activity-log.module.ts` | Upgraded to `@Global()`. Now exports both `ActivityLogService` and `AuditService`. Imports `PrismaModule` directly. |
| **ActivityLog schema extension** | `prisma/schema.prisma` | Added: `changeSummary`, `route`, `userAgent`, `level` (INFO/WARN/CRITICAL) columns. Added `level_idx` index. |
| **Enum extension** | `prisma/schema.prisma` | `ActivityAction` extended with: `GRANT`, `REVOKE`, `REJECT`, `AUTH_FAIL`, `ADMIN_OVERRIDE`, `PRUNE`, `BACKFILL`, `LINK`, `UNLINK`, `APPROVE`, `RESET`, `REFRESH`, `REVOKE_ALL`. `ActivityEntity` extended with: `SESSION`, `PROVIDER_CONSENT`, `PROVIDER_BINDING`, `AUTH_EVENT`, `ADMIN_OPERATION`, `REFRESH_TOKEN`, `SUPPORT_MESSAGE`, `TASK`, `INVOICE`, `FINE`. |
| **Admin audit** | `modules/platform-admin/platform-admin.controller.ts` | `pruneMasterData` → CRITICAL. `backfillHardwareType` → CRITICAL. `enableLogbook` → ADMIN_OVERRIDE. `disableLogbook` → ADMIN_OVERRIDE. `backfillTripEnrichment` → BACKFILL. `createChangelog` → CREATE. All use `AuditService.contextFromRequest()`. |
| **Auth event logging** | `modules/auth/auth.controller.ts` | Login success → LOGIN/AUTH_EVENT. Login failures (unknown user, inactive account, wrong password) → AUTH_FAIL/WARN. Logout → LOGOUT. Logout-all → REVOKE_ALL/WARN. Token refresh → REFRESH. All structured with user and IP context. |
| **VehicleProviderConsent (new)** | `prisma/schema.prisma`, migration `20260412040000_audit_consent_provenance` | Full consent ledger model: `vehicleId`, `organizationId`, `provider`, `grantType`, `status`, `scopes`, `grantedByUserId`, `grantedByExternalSubject`, `grantedAt`, `expiresAt`, `revokedAt`, `revokedByUserId`, `proofReference`, `proofHash`, `providerVehicleRef`, `metadataJson`. New enums: `VehicleProviderConsentStatus` and `VehicleProviderConsentGrantType`. |
| **VehicleProviderConsentService (new)** | `modules/vehicles/vehicle-provider-consent.service.ts` | `recordDimoConsent()`, `recordHmConsent()`, `revokeByProvider()`, `getActiveConsent()`, `listForVehicle()`. Fire-and-forget safe (catches errors internally). Exported via `VehiclesModule`. |
| **DIMO consent recording** | `modules/vehicles/vehicles.service.ts` (registerFromDimo) | After every vehicle creation from DIMO, fires `recordDimoConsent()` with dimoExternalId, tokenId, organizationId, and actor user. |
| **HM consent recording** | `modules/high-mobility/high-mobility-webhook.service.ts` | On `fleet_clearance.approved` webhook: fires `recordHmConsent()` with hmVehicleId, vin, appContainerType, event proof. Also fires audit log. On `fleet_clearance.revoked`: fires `revokeByProvider()`. |
| **VehicleDataSourceLink hardening** | `prisma/schema.prisma` | Added: `provider` (canonical provider name), `consentId` (FK-ready link to consent record), `linkedByUserId`, `lastVerifiedAt`. Now documented as the canonical provider binding structure for both DIMO and HM. Indexes added for `provider` and `consentId`. |
| **createdByUserId write path** | `modules/vehicles/vehicles.service.ts`, `modules/vehicles/vehicles.controller.ts` | `vehicles.create()` and `registerFromDimo()` now accept and persist `createdByUserId` from the authenticated request actor. |
| **VehicleLatestState provenance** | `prisma/schema.prisma` | Added: `providerSource`, `providerFetchedAt`, `sourceTimestamp`, `syncJobRef`, `providerBindingId`. |
| **DIMO snapshot provenance** | `workers/processors/dimo-snapshot.processor.ts` | Upsert now stamps `providerSource=DIMO`, `providerFetchedAt`, and `sourceTimestamp`. After each successful snapshot, the DimoPollLog.id is written as `syncJobRef` on the VehicleLatestState row — enabling full traceability from state → poll job. |

### Audited Flows Now Covered

- All mutating HTTP operations (POST/PUT/PATCH/DELETE) — automatic via `AuditInterceptor`
- Platform admin actions: prune, backfill (hardware, trips), logbook enable/disable, changelog creation
- Auth events: login success, login failure (3 categories), logout, logout-all, token refresh
- HM fleet clearance approvals and revocations (via webhook handler)

### Consent / Provider Access Flows Now Covered

| Flow | Trigger | Model Written |
|---|---|---|
| DIMO vehicle registration | `registerFromDimo()` in VehiclesService | `VehicleProviderConsent` with grantType=DIMO_DIRECT |
| HM fleet clearance approved | `fleet_clearance.approved` webhook | `VehicleProviderConsent` with grantType=HM_FLEET_CLEARANCE |
| HM clearance revoked | `fleet_clearance.revoked` webhook | Updates existing consent status → REVOKED |

### Provenance Touchpoints Added

| Data Path | Provenance Fields |
|---|---|
| `VehicleLatestState` (DIMO snapshot) | `providerSource=DIMO`, `providerFetchedAt`, `sourceTimestamp` (from signal lastSeenAt), `syncJobRef` (DimoPollLog.id) |
| `HmLatestHealthState` (HM MQTT) | `lastMessageId` (MQTT message ID), `lastReceivedAt` (natural provenance — already existed) |
| `HmLatestTelemetryState` (HM MQTT) | `lastMessageId`, `lastReceivedAt` (natural provenance — already existed) |
| `VehicleDataSourceLink` | `provider` field, `consentId` (FK-ready), `linkedByUserId`, `lastVerifiedAt` |
| `DimoPollLog` | Full traceability already: vehicleId, jobType, status, durationMs, errorMessage. Linked back to VehicleLatestState via syncJobRef. |

### Migration: 20260412040000_audit_consent_provenance

1. Enum extensions for `ActivityAction` and `ActivityEntity` — additive, backward safe.
2. New nullable columns on `activity_logs` — safe.
3. New enums `VehicleProviderConsentStatus`, `VehicleProviderConsentGrantType` — new types.
4. New `vehicle_provider_consents` table — safe, FK-constrained to vehicles and organizations.
5. New columns on `vehicle_data_source_links` — all nullable, backward safe. **Important: existing rows get `provider='UNKNOWN'` default.**
6. New nullable provenance columns on `vehicle_latest_states` — backward safe.

### Deferred to Phase 3 (Provider Abstraction)

- Full provider abstraction layer (unified provider SDK interface)
- VehicleDataSourceLink as the single registration entry point (currently parallel to dimoVehicleId FK on Vehicle and hmVehicle record)
- `consentId` FK enforcement at the DB level (left nullable — enforcement is at the service layer)
- DIMO consent via OAuth flow (currently only DIMO_DIRECT; DIMO_OAUTH requires OAuth token capture at registration time)
- Consent expiry enforcement and TTL-based revocation worker
- HM manual registration path consent recording (HighMobilityRegistrationService registers HM_ONLY vehicles — needs consent wire-up)
- `updatedByUserId` write-path for update operations (schema column exists, not yet wired into update handlers)
- Backfill of `providerBindingId` on existing VehicleLatestState rows
- Consent viewer UI for fleet admin
