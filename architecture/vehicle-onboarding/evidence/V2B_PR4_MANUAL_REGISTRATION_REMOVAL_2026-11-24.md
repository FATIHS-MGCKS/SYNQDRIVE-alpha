# V2B-PR4 — Manual registration removal

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR4_MANUAL_REGISTRATION_REMOVAL`  
**Base:** `origin/main` @ `af05edf5347cfa5a97a400c08a1943a6a25bf26d`  
**Prerequisite:** [#2515](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2515) merged (PG-03 HM_ONLY)  
**Owner decision:** `MANUAL_REGISTRATION_REMOVED`  
**Canonical channels:** `DIMO`, `HIGH_MOBILITY` only for **new** vehicle registration.

## Scope

- Retire HTTP `POST /organizations/:orgId/vehicles` as a registration channel (`MANUAL_VEHICLE_REGISTRATION_RETIRED`).
- Remove Master Admin manual “create vehicle” UX entry; keep DIMO import/register and vehicle edit/spec enrichment.
- **No** data deletion, backfill, billing policy change, flag activation, or option **M-A** implementation.
- **No** change to DIMO / HM canonical activation rails (default-OFF flags unchanged).

## Inventory (paths)

| Surface | Before | After |
|---------|--------|-------|
| `VehiclesController.createByOrg` | `VehiclesService.create` | Fail-closed retirement contract |
| `VehiclesService.create` | Prisma create + legacy billing hook | Throws retirement |
| `api.vehicles.create` (frontend) | Manual Master persist | Unused for registration |
| `persistMasterRegisteredVehicle` (no DIMO) | Manual POST | Throws `MANUAL_REGISTRATION_RETIRED` |
| `ConnectedVehicleAddMenu` | DIMO import + manual | Single DIMO import CTA |
| HM `POST /vehicles/register/hm-only` | Canonical (flagged) | Unchanged |
| `POST …/register-from-dimo` | DIMO canonical | Unchanged |
| Tire/brake `manual_registration` source | Enrichment on existing vehicles | Unchanged (not vehicle creation) |

## PG matrix

| ID | Topic | Status |
|----|--------|--------|
| PG-04-N | Manual POST / service.create does not persist vehicle or outbox | Supertest HTTP (`vehicles-manual-registration-retired.http-security.integration.spec.ts`) + unit specs |
| HARNESS | `createVehicleRowForIntegrationHarness` | Test-only module `vehicles/testing/vehicle-row-integration.harness.ts`; production fail-closed unless `ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS=1` |
| PG-03 | HM_ONLY canonical regression | Unchanged (VO-5B gate) |

## Owner decisions (delta)

| ID | Status |
|----|--------|
| OWN-1 (M-A manual canonical) | **SUPERSEDED_BY_OWNER_DECISION** |
| OWN-2 (billing for new manual vehicles) | **NOT_APPLICABLE_AFTER_REMOVAL** |

## Merge / production

- **MERGE_READINESS:** engineering complete when CI green; owner gates for HM/DIMO production flags unchanged.
- **PRODUCTION_ACTIVATION:** **NO_GO** — no deploy or flag arm in this PR.