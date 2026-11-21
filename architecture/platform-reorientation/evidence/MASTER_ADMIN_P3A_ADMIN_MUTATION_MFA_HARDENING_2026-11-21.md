# P3A — Master Admin Support & Vehicle mutation MFA hardening

**Date:** 2026-11-21 (Europe/Berlin)  
**Base `main`:** `7454b0afba02002d66adc107e9e11fd8c8f2f3f3`  
**Owner policy:** Critical Master Admin Support and Vehicle mutations require MFA step-up when enforcement is enabled.

## Support (`SupportController`)

| Route | Step-up | Before | After |
|-------|---------|--------|-------|
| `POST admin/support/tickets` | `MASTER_PLATFORM_SETTINGS` | `RolesGuard` only | `+ MasterAdminMfaGuard` on method |
| `POST admin\|master/support/tickets/:id/messages` | same | same | same |
| `POST admin\|master/support/tickets/:id/internal-notes` | same | same | same |
| `PATCH admin\|master/support/tickets/:id` | same | same | same |
| `PATCH admin/support/tickets/:id/status` | same | same | same |
| `POST support/upload` | same | same | same |
| All `GET admin\|master/support/*` | — | unchanged | no MFA metadata |
| All `organizations/:orgId/support/*` | — | unchanged | no MFA |

## Vehicles (`VehiclesController` — admin only)

| Route | Step-up | Notes |
|-------|---------|--------|
| `PATCH admin/vehicles/:vehicleId/hv-master-specification` | `MASTER_INTEGRATIONS` | method-level guard |
| `PUT admin/vehicle-exterior-model-images/:view` | `MASTER_PLATFORM_SETTINGS` | |
| `PUT admin/vehicles/:vehicleId/exterior-images/:view` | `MASTER_PLATFORM_SETTINGS` | |
| `POST …/save-as-model`, `POST …/apply-model` | `MASTER_PLATFORM_SETTINGS` | |
| `DELETE admin/vehicles/:vehicleId/exterior-images/:view` | `MASTER_PLATFORM_SETTINGS` | |
| `POST admin/vehicles/:vehicleId/deregister` | `MASTER_INTEGRATIONS` | **preserved** (pre-existing) |
| Org-scoped `organizations/:orgId/vehicles/*` | — | **unchanged** |

## Tests

- `backend/src/modules/support/support.mfa.http-security.spec.ts`
- `backend/src/modules/vehicles/vehicles-admin.mfa.http-security.spec.ts`

Harness: `master-admin-mfa-http.integration.harness.ts` with `IAM_MFA_MASTER_ADMIN_ENABLED=true`.

## Remaining policy

- `VsiSignalProfileInspectionController` `POST …/materialize` — certification ops (not in this slice).
- Delegated `master-billing` MFA on non-`MASTER_ADMIN` principals — unchanged from P2.

## Registry

**REGISTRY_REVIEWED:** Support module `NOT_STARTED` — evidence only, no registry row promotion.