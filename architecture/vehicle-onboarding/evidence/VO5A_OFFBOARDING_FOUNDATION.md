# VO-5A — Offboarding foundation / destructive deregistration replacement audit

| Field | Value |
|-------|-------|
| **Status** | Audit + bounded internal foundation (no HTTP cutover) |
| **Authority** | `AUDIT_IN_PROGRESS` (not promoted) |
| **Merge anchor context** | Post VO-4.10 (`ffe5f415447b23b6dbbed4ac05c14ae9de6d2f5a`) |

## Executive summary

Legacy **`VehiclesService.deregister`** performs a **hard `vehicle.delete`**, cascading operational history and calling **`billingQuantity.onVehicleRemoved` outside** the delete transaction. This contradicts the VO target registry model where **`NORMAL_OFFBOARDING_DELETES_VEHICLE=NO`**, **`DEACTIVATE_VEHICLE != OFFBOARD_VEHICLE`**, and **`vehicle.offboarded`** must be a **transactional outbox fact** with **post-commit idempotent billing consumers**.

VO-5A delivers the **audit**, **dependency map**, **transaction contract**, and a **minimal internal `VehicleOffboardingService`** (no public HTTP, no legacy endpoint change).

## Current destructive deregistration (production code)

| Surface | Path | Behavior |
|---------|------|----------|
| Master Admin HTTP | `POST admin/vehicles/:vehicleId/deregister` | `VehiclesController.deregisterVehicle` → `VehiclesService.deregister` |
| Service | `vehicles.service.ts` | Pre-delete billing hook; **`prisma.vehicle.delete`** |

**`CURRENT_DEREGISTER_DELETES_VEHICLE=YES`**

**`CURRENT_DEREGISTER_CLASSIFICATION=must be deprecated before production cutover`** — immediate **integrity/history-loss risk** if used for normal tenant offboarding; retain temporarily only behind explicit admin break-glass with governance.

### Dependency map (durable records)

| Category | On `vehicle.delete` (deregister) | Tenant scope | Notes |
|----------|----------------------------------|--------------|-------|
| **Vehicle** row | **Deleted** | `organizationId` on row | Canonical registry id lost |
| **VehicleOrganizationAssignment** | **Blocked** (`onDelete: Restrict`) | history | Delete fails if assignments exist unless removed first — deregister may fail or assignments pre-cleaned elsewhere |
| **VehicleLicensePlateAssignment** | **Restrict** | history | Same |
| **VehicleRegistryLifecycleOutbox** | **Restrict** | facts | Outbox rows prevent delete if present |
| **VehicleDataSourceLink** | **Cascade** | binding history | Active + inactive links removed |
| **Trips, bookings, battery, brakes, damages, DI, …** | **Cascade** (many relations) | org via vehicle | **Major history loss** |
| **DimoVehicle** mirror | **Retained** (`dimoVehicleId` SetNull on Vehicle) | platform | Comment claims rediscovery via legacy non-registered list |
| **HighMobilityVehicle** | **Not deleted** by Vehicle delete | org/global | `synqdriveVehicleId` may orphan depending on HM update paths |
| **OnboardingCase** completed refs | **Retain** (`vehicleId` SetNull or restrict — case uses relation) | org | Completed case suppression remains |

**`CURRENT_DEREGISTER_CASCADE_RISK=HIGH`**

**`CURRENT_DEREGISTER_HISTORY_LOSS_RISK=HIGH`**

### Billing boundary (legacy)

- `deregister` invokes **`billingQuantity.onVehicleRemoved` before delete** — **not** in the same DB transaction as a durable lifecycle fact; **not** idempotent outbox consumer pattern.

## Target lifecycle (preserved)

| Invariant | VO-5A status |
|-----------|----------------|
| `PROVIDER_DISCONNECT_DOES_NOT_OFFBOARD` | **YES** — HM `deactivateHealthLink` / link `isActive=false` only |
| `OPERATIONAL_DEACTIVATION_DOES_NOT_OFFBOARD` | **YES** — `VehicleStatus` unchanged by offboarding service |
| `OFFBOARDING_RETAINS_CANONICAL_VEHICLE` | **YES** — `registryLifecycle` → `OFFBOARDED`, row retained |
| `OFFBOARDING_RETAINS_HISTORY` | **YES** — no delete; links deactivated not removed |
| `OFFBOARDED_CANDIDATE_AUTO_REAPPEAR_ALLOWED` | **NO** — canonical suppression still sees `Vehicle.dimoVehicleId` / HM registration / inactive links / completed cases |

## VO-5A internal foundation

**Service:** `VehicleOffboardingService.offboardVehicle` (module export, **no HTTP**).

### Atomic transaction contract

1. Fail-closed on `destinationOrganizationId` → `ORG_TRANSFER_NOT_SUPPORTED`
2. `SELECT … FOR UPDATE` vehicle scoped to `organizationId`
3. Require `registryLifecycle=ACTIVE` (idempotent replay when already `OFFBOARDED` + matching outbox key)
4. `registryLifecycle` → `OFFBOARDED` (**`organizationId` unchanged**)
5. Close open `VehicleOrganizationAssignment` (`validTo`, reason = offboard reason)
6. Deactivate active `VehicleDataSourceLink` (`isActive=false`, `deactivationReason=VEHICLE_OFFBOARDED`)
7. **Preserve** `dimoVehicleId` on Vehicle, **preserve** HM mirrors
8. Insert `VehicleRegistryLifecycleOutbox` **`VEHICLE_OFFBOARDED`** (`vehicle.offboarded` payload v1) with idempotency key
9. Commit — **no Stripe/billing inside transaction**

### Offboard reasons (governed)

- `OFFBOARD_SOLD`
- `REMOVE_FROM_PRODUCT`
- `ADMINISTRATIVE_OFFBOARD`

### Organization transfer

**`ORG_TRANSFER_ENABLED=NO`**, **`ORG_TRANSFER_FAIL_CLOSED=YES`**

**Transfer-blocking domains (audit):** trips/bookings attribution, battery longitudinal stores, driving intelligence jobs, billing quantity reconciliation, cross-org document/damage retention, HM/DIMO consent scope, onboarding source claims — transfer remains **explicit later slice** with fail-closed checklist (TARGET_ARCHITECTURE §transfer).

## Candidate projection (VO-4.10 consistency)

Offboarding **does not** clear `Vehicle.dimoVehicleId`; `assertSourceNotCanonicallyRegistered` continues to suppress mirrors while an OFFBOARDED vehicle row references the mirror. **RE_ONBOARD not implemented.**

## Tests

- `npm run test:vehicle-onboarding:vo5a:postgres`
- Unit: `vehicle-offboarding.service.unit.spec.ts` (org transfer fail-closed)

## Explicit non-goals (this slice)

- Legacy deregister endpoint **unchanged**
- No public offboard HTTP
- No RE_ONBOARD, ARCHIVE workflow, org transfer, production deploy/migration
