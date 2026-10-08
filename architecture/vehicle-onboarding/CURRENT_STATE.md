# Vehicle Onboarding / Vehicle Registry — Current State

| Field | Value |
|-------|-------|
| **Sealed from** | VO-0A discovery audit |
| **Repository anchor SHA** | `312d9f54a2b4c0b0740061d3e2b74897e78eacb0` |
| **Authority status** | `AUDIT_IN_PROGRESS` — **not** `AUTHORITY_ACTIVE` |
| **Last updated** | 2026-10-08 (VO5C-P2B2 legacy deregister client removed; P2B1 merged; tenant DELETE + prune **unchanged**) |

## Executive summary

SynqDrive today separates **provider mirrors** (`DimoVehicle`, `HighMobilityVehicle`) from the **tenant-operational** entity (`Vehicle`). Onboarding is implemented as **registration transactions** and UI flows, not as a unified lifecycle module. Canonical PK is `Vehicle.id`; DIMO discovery does not create `Vehicle` rows.

---

## A. Current architecture

- **Canonical operational entity:** `Vehicle` (`backend/prisma/schema.prisma` — `@@map("vehicles")`).
- **DIMO mirror:** `DimoVehicle` (`dimo_vehicles`) — global per developer license sync, not tenant-scoped.
- **HM provider state:** `HighMobilityVehicle` (`high_mobility_vehicles`) — clearance, streaming, optional `synqdriveVehicleId`.
- **Provider-neutral bindings:** `VehicleDataSourceLink`, `VehicleProviderConsent` (schema comments designate extensible provider binding).
- **VO-3 (2026-09-30):** `VehicleOnboardingModule` — internal case orchestration + atomic activation; legacy `registerFromDimo` / HM_ONLY / manual create **unchanged** (see [VO3_ORCHESTRATOR_ACTIVATION.md](./evidence/VO3_ORCHESTRATOR_ACTIVATION.md)).
- **VO-3.2 (2026-09-30):** Governed `attachDimoSource` / `attachHighMobilitySource` only (no public arbitrary snapshot attach); DIMO cutover auth invariant `VO-INV-DIMO-CUTOVER-AUTH-001` (see [VO3_2_FINAL_RUNTIME_SEAL.md](./evidence/VO3_2_FINAL_RUNTIME_SEAL.md)).
- **VO-4 / VO-4.1 (2026-09-30):** `VehicleOnboardingReadinessService` + snapshot V2 + explicit `ProductSlug` entitlement + fingerprint v1.1 (incl. source evidence); HM source refresh; shared readiness mutation lock (see [VO4_READINESS_AUTHORITY.md](./evidence/VO4_READINESS_AUTHORITY.md)).
- **VO-4.8 (2026-09-30):** Tenant-scoped authenticated capture HTTP (`VehicleOnboardingCaptureController`) — see [VO48_AUTHENTICATED_CAPTURE_API.md](./evidence/VO48_AUTHENTICATED_CAPTURE_API.md).
- **VO-4.9 (2026-10-01):** Master Admin trusted source adoption HTTP (`VehicleOnboardingSourceAdoptionController`) — global source claim lock, cross-org suppression, platform-trusted DIMO adoption; **no** tenant self-service adoption (see [VO49_MASTER_ADMIN_SOURCE_ADOPTION_API.md](./evidence/VO49_MASTER_ADMIN_SOURCE_ADOPTION_API.md)).
- **VO-4.10 (2026-10-01):** Master Admin read-only provider candidate discovery (`GET …/candidates`) — derived projection over DIMO/HM mirrors; adoption transaction remains write authority (see [VO410_PROVIDER_CANDIDATE_DISCOVERY.md](./evidence/VO410_PROVIDER_CANDIDATE_DISCOVERY.md)).
- **VO-5A (2026-10-01):** Offboarding foundation — destructive `VehiclesService.deregister` audited; internal registry offboard (`ACTIVE`→`OFFBOARDED` + `VEHICLE_OFFBOARDED` outbox); **no** public HTTP; **no** legacy endpoint change (see [VO5A_OFFBOARDING_FOUNDATION.md](./evidence/VO5A_OFFBOARDING_FOUNDATION.md)).
- **VO-5B (2026-10-01):** Post-commit registry outbox consumer → Billing quantity deprovision (`VEHICLE_DISCONNECTED` at `occurredAt`); billable policy requires registry `ACTIVE`; **no** Stripe in registry consumer; **no** public offboard HTTP (see [VO5B_REGISTRY_BILLING_BRIDGE.md](./evidence/VO5B_REGISTRY_BILLING_BRIDGE.md)).
- **VO5B-AB1 (2026-10-07):** Same outbox worker handles `VEHICLE_ACTIVATED` → `VEHICLE_CONNECTED` at `occurredAt` / `activatedAt`; event idempotency `vehicle-registry:<eventId>:billing-activate:v1`; legacy `registerFromDimo`/`create` billing hooks **unchanged** (see [VO5B_AB1_ACTIVATION_BILLING_BRIDGE.md](./evidence/VO5B_AB1_ACTIVATION_BILLING_BRIDGE.md)).
- **VO5C-P1 (2026-10-07):** Master Admin safe offboard HTTP (`POST …/offboard`) with MFA, operational preflight, idempotency; calls `VehicleOffboardingService` only; **no** legacy deregister/tenant DELETE changes (see [VO5C_P1_MASTER_ADMIN_OFFBOARD_HTTP.md](./evidence/VO5C_P1_MASTER_ADMIN_OFFBOARD_HTTP.md)).
- **VO5C-P2A (2026-10-08):** Connected Vehicles UI cutover to P1 offboard HTTP; lifecycle visibility + server `registryLifecycle` filter; **no** legacy backend route removal (see [VO5C_P2A_FRONTEND_CUTOVER.md](./evidence/VO5C_P2A_FRONTEND_CUTOVER.md)).
- **VO5C-P2B1 (2026-10-08):** `POST admin/vehicles/:vehicleId/deregister` retired with **409** `LEGACY_VEHICLE_DESTRUCTION_DISABLED` + `MASTER_ADMIN` + `MASTER_INTEGRATIONS` MFA; `VehiclesService.deregister` fail-closed; tenant DELETE + prune **unchanged** (see [VO5C_P2B1_LEGACY_DEREGISTER_LOCKDOWN.md](./evidence/VO5C_P2B1_LEGACY_DEREGISTER_LOCKDOWN.md)).
- **VO5C-P2B2 (2026-10-08):** Removed `api.vehicles.deregister` frontend client; repo scan proves no active runtime caller; canonical `api.vehicleOnboarding.offboardVehicle` unchanged; org-scoped `api.vehicles.delete` wrapper retained for P2B3 (see [VO5C_P2B2_LEGACY_FRONTEND_CLIENT_RETIREMENT.md](./evidence/VO5C_P2B2_LEGACY_FRONTEND_CLIENT_RETIREMENT.md)).

---

## B. Current provider ingress

**DIMO**

- **Discovery:** `DimoApiSyncService.fetchAndSyncFromDimoApi()` — Identity GraphQL `vehicles(filterBy: { privileged: clientId })` (`backend/src/modules/dimo/dimo-api-sync.service.ts`).
- **Schedule:** `DimoVehicleSyncScheduler` — 24h repeat (`backend/src/workers/schedulers/dimo-vehicle-sync.scheduler.ts`).
- **Manual:** `POST /admin/dimo/sync` (`backend/src/modules/dimo/dimo.controller.ts`).
- **Persistence:** `DimoVehicleSyncService.syncMirroredVehicles()` upsert by `externalId` (`backend/src/modules/dimo/dimo-vehicle-sync.service.ts`).
- **Non-registered:** derived — `DimoVehicle` with no referencing `Vehicle.dimoVehicleId` (`getNonRegisteredVehicles()`).

**High Mobility**

- Substantial runtime: models through `high_mobility_*`, MQTT/stream logs, signal groups, webhooks, Master `HighMobilityDataView` (see `backend/src/modules/high-mobility/`).
- Registration paths: `DIMO_PLUS_HM` link-after-DIMO vs `HM_ONLY` (`high-mobility-registration.service.ts`).

---

## C. Current canonical identity

| Question | Answer | Evidence |
|----------|--------|----------|
| Canonical PK | `Vehicle.id` (UUID) | `schema.prisma` `Vehicle` |
| Tenant uniqueness | `@@unique([vin, organizationId])` | `schema.prisma` |
| Global DIMO binding | Partial unique `vehicles.dimo_vehicle_id` WHERE NOT NULL | migration `20260726140000_vehicles_dimo_vehicle_id_partial_unique` |
| VIN fallback | `dimoVehicle.vin \|\| \`DIMO-${externalId}\`` at register | `vehicles.service.ts` `registerFromDimo` |
| License plate | Single nullable `Vehicle.licensePlate` | `schema.prisma` — no history table |

---

## D. Registration paths

| Path | Entry | Backend |
|------|-------|---------|
| DIMO → tenant vehicle | Master `VehicleRegistrationModal` / Connected Vehicles | `POST organizations/:orgId/vehicles/register-from-dimo` → `VehiclesService.registerFromDimo` |
| Manual create | Org fleet APIs | `POST organizations/:orgId/vehicles` → `VehiclesService.create` |
| HM_ONLY | HM register API | `POST vehicles/register/hm-only` → `HighMobilityRegistrationService.registerHmOnlyVehicle` |
| HM health add-on | Post-register | `activate-high-mobility-health`, `link-high-mobility-full-telemetry` (`high-mobility-vehicle-register.controller.ts`) |
| Deregister (retired) | Legacy Master Admin HTTP | `POST admin/vehicles/:vehicleId/deregister` → **409** `LEGACY_VEHICLE_DESTRUCTION_DISABLED` (use canonical offboard HTTP) |
| Offboard (canonical) | Master Connected Vehicles | `POST admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard` → `VehicleOffboardingService` (`OFFBOARDED` + outbox) |

**Concurrency:** advisory lock `vehicleDimoBindingLockKey` in `registerFromDimo` (`pg-advisory-lock.util.ts`, `register-from-dimo-concurrency.smoke.spec.ts`).

---

## E. Technical baseline ownership

| Domain | Onboarding writes | Ongoing authority |
|--------|-------------------|-------------------|
| Tires | `manualSpecs.tires` → `TireLifecycleService` | `VehicleTireSetup`, measurements, health |
| Brakes | `manualSpecs.brakes` → `BrakeRegistrationService` | `VehicleBrakeReferenceSpec`, brake health |
| LV battery | `VehicleBatterySpec` on register | Battery V2 |
| HV capacity hint | `Vehicle.hvBatteryCapacityKwh`, etc. | `VehicleBatteryReferenceCapacity` (Battery V2) |
| Service / TÜV / BOKraft | `Vehicle` columns + optional events | Service intelligence, rental health |
| Exterior | Registration modal + `VehicleExteriorImage` | Damages / vehicle detail |

---

## F. Capability ownership

- **Static routing:** `getVehicleCapabilities(hardwareType)` (`backend/src/modules/vehicle-intelligence/vehicle-capabilities.ts`).
- **Device family (telemetry semantics):** `resolveTelemetrySourceFamily(DimoVehicle.rawJson)` — **not** `hardwareType` (`telemetry-source-family.ts`). **Cross-ref VDC-GAP-013** in VDC authority.
- **Post-register async:** `VehicleDrivingCapability`, `VehicleBatteryCapability` refresh (`registerFromDimo` hooks).

---

## G. Billing coupling

- **Canonical activation:** `VEHICLE_ACTIVATED` outbox → `VehicleRegistryLifecycleOutboxProcessor` → `onVehicleProvisioned` (VO5B-AB1).
- **Legacy:** `billingQuantity.onVehicleProvisioned` after `registerFromDimo` / `create` (`vehicles.service.ts`) — disjoint from canonical onboarding; cutover deferred.
- `onVehicleRemoved` on deregister.
- Policy: `BillableVehiclesService` / `evaluateBillableVehiclePolicy` (`backend/src/modules/billing/billable-vehicles.service.ts`) — billing owns billable semantics.

---

## H. Downstream dependencies

Registered `Vehicle` required for: snapshot polling (`DimoSnapshotProcessor`), trip FSM state, fleet map, rental bookings, health modules, billing assignments. Pre-registration telemetry uses `DimoVehicle` mirror refresh only (`DimoController.refreshVehicleSnapshot`).

---

## I. Lifecycle fragmentation

| Layer | States |
|-------|--------|
| `VehicleStatus` | AVAILABLE, RENTED, IN_SERVICE, OUT_OF_SERVICE, RESERVED |
| `DimoConnectionStatus` | CONNECTED, DISCONNECTED, PENDING, ERROR |
| HM enums | clearance, registration, streaming on `HighMobilityVehicle` |
| Derived | `registrationState` registered/unregistered (`vehicles-operational.types.ts`) |

No unified onboarding lifecycle enum or readiness record.

---

## J. Known authority collisions

- Connectivity/freshness: `telemetry-freshness.resolver` vs `fleet-connectivity.util` vs `DimoVehicle.connectionStatus` vs Master UI (`docs/ui/master-admin-connected-vehicles-dimo-deep-audit.md`).
- `hardwareType` vs `DimoVehicle.rawJson` device family — **VDC-GAP-013** (do not duplicate; VO-GAP-011 related).
- Operational fleet `status` vs booking-derived RENTED/RESERVED (`vehicles.controller.ts` admin PATCH rules).

---

## K. Security / tenant observations

- `register-from-dimo`: `OrgScopingGuard`, `fleet:write` (`vehicles.controller.ts`, `iam-endpoint-enforcement-triage.security.spec.ts`).
- `admin/dimo/*`: `MASTER_ADMIN` + MFA step-up (`dimo.controller.ts`).
- `deregister`: platform-wide by `vehicleId` — high impact, master-only.

---

## L. Test coverage summary

| Area | Specs |
|------|-------|
| registerFromDimo tx/conflict | `vehicles.service.register-from-dimo.spec.ts`, `register-from-dimo-concurrency.smoke.spec.ts` |
| DIMO data source link at register | `dimo-vehicle-data-source-link.service.spec.ts` (D9) |
| Brake registration | `brake-registration-regression.spec.ts` |
| Telemetry family R1/Tesla | `telemetry-source-family.spec.ts`, `trip-analytics-canonical.service.spec.ts` |
| E2E Master onboarding UI | **Not found** dedicated suite |

---

## M. Open gaps

See [contradictions/KNOWLEDGE_GAPS.md](./contradictions/KNOWLEDGE_GAPS.md) (`VO-GAP-001` … `VO-GAP-015`). VO-1 must not implement until authorized.
