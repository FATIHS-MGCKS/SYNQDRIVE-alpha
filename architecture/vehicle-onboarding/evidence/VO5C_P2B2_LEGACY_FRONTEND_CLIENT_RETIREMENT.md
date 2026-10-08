# VO5C-P2B2 — Legacy frontend deregister client retirement

| Field | Value |
|-------|-------|
| **Slice** | VO5C-P2B2 |
| **Status** | IMPLEMENTED (draft PR) |
| **Depends on** | VO5C-P2B1 merged (`2dc48329a…`) |
| **Last updated** | 2026-10-08 |

## Change

Removed obsolete `api.vehicles.deregister(vehicleId)` client wrapper (`POST /admin/vehicles/:vehicleId/deregister`).

## Caller inventory (repository)

| Class | Finding |
|-------|---------|
| Active runtime caller | **None** — no production `api.vehicles.deregister` usage before removal |
| Connected Vehicles | Uses `api.vehicleOnboarding.offboardVehicle` via `useVehicleOffboard` only |
| `api.vehicles.delete` (org-scoped DELETE) | Wrapper **present**; **no** located runtime caller in `frontend/src` (P2B3 handoff) |
| Direct `DELETE /vehicles/:vehicleId` | **No** frontend client located |
| Documentation | Historical references remain in `ChangesView` / `ArchitekturView` only |

## Intentional non-changes

- Backend tenant DELETE and platform prune routes unchanged
- Canonical P1 offboard client unchanged
- `VITE_MASTER_VEHICLE_OFFBOARD_UI` release gate unchanged (default OFF)

## Remaining work

- **P2B3:** lock down tenant/direct DELETE HTTP surfaces
- **P2B4:** platform prune review

## Validation

- `frontend/src/lib/legacy-deregister-frontend-retirement.test.ts` — repo-wide negative scan + API contract checks
- Existing Connected Vehicles MFA/idempotency/offboard regression suites preserved
