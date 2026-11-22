# V2A — Registration & Billing Safety Foundation

**Operation:** `SYNQDRIVE_VEHICLES_V2A_REGISTRATION_BILLING_SAFETY_FOUNDATION`  
**Reference audit SHA:** `41923f8486cfea8a09e25b2365cddc74d370f4ae`  
**Worktree baseline:** `origin/main` at branch creation (`ff962e50a` family)  
**Mode:** Focused characterization and evidence — **no** registration cutover, **no** billing business-logic changes, **no** feature-flag activation, **no** live DIMO/HM mutations.

## Scope

Establish verified safety contracts before V2B implementation for:

- VEH-001 parallel registration rails (canonical DIMO, HM_ONLY, manual `VehiclesService.create`)
- VEH-002 dual billing activation rails (registry `VEHICLE_ACTIVATED` outbox vs legacy `onVehicleProvisioned` fire-and-forget)
- Tenant security regressions (characterization tests only)

## Phase 1 — Baseline

| Check | Result |
|-------|--------|
| Vehicle onboarding runtime diff `41923f848..origin/main` | **Empty** (unchanged for vehicles/HM/registry paths) |
| V1 targeted Jest (`legacy-vehicle-destruction`, `vehicles.controller.security.characterization`, `billable-vehicle`, `product-vehicle-access`) | **61 passed**, 8 skipped |
| Broad `vehicle-onboarding` Jest (`--maxWorkers=1`) | 234 passed / 29 failed / 243 skipped — failures classified below |
| Frontend `connected-vehicles-offboard.test.tsx` | **Fixed** (modular `master.cv.*` locale shards) — 7/7 pass |

### V1 failure root causes (broad suite)

| Bucket | Examples | Classification |
|--------|----------|----------------|
| Missing disposable PG DB | `vo5a-offboarding`, `dimo-source-link-operator-authorization` specs | **INFRASTRUCTURE** |
| Parallel worker heap pressure | Earlier run SIGKILL at default workers | **OOM / infra** |
| Test drift vs code | `vehicle-onboarding-dimo-module.bootstrap.spec.ts` module import count | **APPLICATION_DRIFT** (test maintenance) |
| Test drift vs code | `master-dimo-registration-payload-fingerprint.unit.spec.ts` optional field throws | **APPLICATION_DRIFT** |
| i18n modular dictionaries | `master.cv.dimoPrivilege.*`, `master.cv.oemSpecs.*` not inlined in `de.ts` | **TEST_MAINTENANCE** (addressed in V2A) |

## Phase 2 — Registration characterization

### A — Canonical DIMO (`registerFromDimo` → `MasterDimoCanonicalRegistrationService`)

- **Org authorization:** Master/canonical service enforces tenant + provider contracts (existing VO-SIG P2 specs).
- **Billing:** `VehiclesService.registerFromDimo` **does not** call `billingQuantity.onVehicleProvisioned` directly (V2A characterization test).
- **Registry / readiness:** Canonical path owns activation, registry lifecycle, and outbox emission (existing integration specs; PG opt-in).
- **Verdict:** **ALIGNED with intended canonical rail**; billing intended via `VEHICLE_ACTIVATED` outbox consumer.

### B — HM_ONLY (`HighMobilityRegistrationService.registerHmOnlyVehicle`)

- **Org authorization:** Body `organizationId` must match tenant unless master admin; HM record tenant guard.
- **Vehicle identity:** VIN from HM record; duplicate VIN per org → `ConflictException` (V2A test).
- **Provider binding:** `vehicleDataSourceLink` HIGH_MOBILITY / HM_ONLY in same transaction.
- **Registry lifecycle:** Default schema lifecycle; **no** `vehicleRegistryLifecycleOutbox` write in HM_ONLY TX (V2A test).
- **Billing:** **No** `onVehicleProvisioned` and **no** `VEHICLE_ACTIVATED` outbox on this path (characterization).
- **Verdict:** **PARALLEL_LEGACY_RAIL** — functional but not converged to canonical registry+billing (VEH-001).

### C — Manual organization vehicle create (`VehiclesService.create`)

- **Authorization:** Controller/guard layer (existing security characterization tests).
- **Persistence:** Direct `prisma.vehicle.create` (no registry lifecycle TX).
- **Billing:** Fire-and-forget `billingQuantity.onVehicleProvisioned` post-commit (V2A test).
- **Idempotency key namespace:** `vehicle:connected:<orgId>:<vehicleId>` via `buildQuantityIdempotencyKey` — **disjoint** from `vehicle-registry:<eventId>:billing-activate:v1`.
- **Verdict:** **LEGACY_BILLING_HOOK_RAIL** — owner policy required before disablement (VEH-001).

## Phase 3 — Billing consistency

| Rail | Trigger | Idempotency key pattern |
|------|---------|-------------------------|
| Registry outbox | `VehicleRegistryLifecycleOutboxProcessor` on `VEHICLE_ACTIVATED` | `vehicle-registry:<eventId>:billing-activate:v1` |
| Legacy create | `VehiclesService.create` | `vehicle:connected:<orgId>:<vehicleId>` |

| Risk | Reproduced in V2A? | Notes |
|------|-------------------|-------|
| **Double billing event** | **Not E2E without PG** | Theoretically if same vehicle received **both** registry activation processing **and** legacy create hook with both integrations enabled — keys differ, so duplicate quantity lines are **possible** unless business rules dedupe by vehicle |
| **Missing billing event** | **Yes (by construction)** | HM_ONLY and manual paths that never emit `VEHICLE_ACTIVATED` may skip registry outbox billing even when vehicle is operationally active |

Offboard deprovision: existing `VEHICLE_OFFBOARDED` handler + offboarding specs (PG opt-in); not re-run in V2A without disposable DB.

## Phase 4 — Security characterization (new tests)

File: `backend/src/modules/vehicle-onboarding/characterization/v2a-registration-billing-safety.characterization.spec.ts`

- Cross-organization HM_ONLY rejection
- Duplicate VIN within org (HM_ONLY)
- Disjoint billing idempotency namespaces
- Canonical DIMO delegation without legacy billing hook

No live DIMO/HM dependencies.

## Phase 5 — V2B remediation contract (proposed slices)

### VEH-001 — HM_ONLY canonical convergence

1. After HM_ONLY TX success, enqueue `VEHICLE_ACTIVATED` (or invoke shared activation helper) with same invariants as canonical DIMO.
2. Remove duplicate vehicle semantics; preserve HM data source link invariants.
3. **Do not** remove HM_ONLY endpoint until parity proven in PG harness.

### VEH-001 — Manual create policy

**Owner decision required:** retain with registry hook, restrict to master-only, or route through canonical registration API. V2A does **not** disable manual create.

### VEH-002 — Single billing activation rail

1. Route all activation billing through registry outbox processor.
2. Retire or no-op `VehiclesService.create` `onVehicleProvisioned` after migration window.
3. Guard with feature flag default **OFF** until V2B owner sign-off.

Preserve **canonical DIMO** implementation and invariants; changes are additive convergence, not replacement of Master DIMO registration.

## Confirmed defects (repository characterization)

| ID | Severity | Status |
|----|----------|--------|
| VEH-002 dual rails | Medium | **Confirmed design debt** — disjoint idempotency keys |
| VEH-001 HM_ONLY missing outbox billing | Medium | **Confirmed gap** — characterization |
| VEH-001 manual create parallel rail | Medium | **Confirmed** — policy decision pending |
| Broad PG opt-in specs | Low | **Infra** — require disposable PostgreSQL |
| Bootstrap/fingerprint unit drift | Low | **Test maintenance** — not V2A scope |

## Validation commands

```bash
cd backend && npx jest src/modules/vehicle-onboarding/characterization/v2a-registration-billing-safety.characterization.spec.ts
cd backend && npx jest legacy-vehicle-destruction vehicles.controller.security.characterization billable-vehicle product-vehicle-access --testPathPattern
cd frontend && npx vitest run src/master/connected-vehicles/connected-vehicles-offboard.test.tsx
```

## Lifecycle

- **IMPLEMENTED / TESTED (branch):** characterization tests + evidence
- **NOT MERGED / NOT DEPLOYED / NOT PRODUCTION_VERIFIED**