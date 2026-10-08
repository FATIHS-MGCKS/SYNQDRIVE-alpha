# VO-5C-P2A — Master Admin safe offboard frontend cutover

| Field | Value |
|-------|-------|
| **Slice** | VO5C-P2A (Connected Vehicles UI only) |
| **Status** | IMPLEMENTED (draft PR) |
| **Depends on** | VO5C-P1 merge `340b4c86ab30e9c06c0b74d39ae394dc0af170bb` |
| **Last updated** | 2026-10-08 |

## Scope

- Connected Vehicles Master Admin UI calls `POST /admin/vehicle-onboarding/organizations/:organizationId/vehicles/:vehicleId/offboard` only.
- **No** `api.vehicles.deregister` from Connected Vehicles surfaces.
- MFA step-up (`MASTER_INTEGRATIONS`) with stable per-intent idempotency key.
- Registry lifecycle badges + server-side `registryLifecycle` list filter (default `ACTIVE`).
- **Unchanged:** legacy `POST admin/vehicles/:vehicleId/deregister`, tenant DELETE routes, RE_ONBOARD, Stripe/provider network from UI.

## Release gate

```
PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED=NO (as of P2A implementation)
```

Do **not** deploy P2A to production before P1 offboard route is verified live. Optional env: `VITE_MASTER_VEHICLE_OFFBOARD_UI=off` hides the action until verification.

## Flags

| Flag | Meaning |
|------|---------|
| `VO5C_P1_COMPLETE` | YES (merged on main) |
| `VO5C_P2A_IMPLEMENTED` | YES (this slice) |
| `VO5C_P2B_LEGACY_LOCKDOWN` | NOT_DONE |
| `VO5C_TOTAL_CUTOVER_COMPLETE` | NO |

## Validation

```bash
cd frontend && npm run test -- connected-vehicles-offboard
cd frontend && npm run i18n:check
cd backend && npm test -- vehicles-operational.registry-lifecycle-filter
```
