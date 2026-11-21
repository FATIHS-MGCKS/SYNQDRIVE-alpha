# Organization → active fleet access (P5B1 operational runbook)

Evidence harness: `backend/src/modules/organizations/organizations-e2e-activation-seal.postgres.integration.spec.ts` (opt-in disposable PostgreSQL).

## Preconditions

- Master Admin platform user with MFA (production UI).
- Catalog product exists (`FLEET` and/or `RENTAL` in `products` table).
- No automatic promotion from `PENDING` — explicit Master Admin steps required.

## 1. Create organization (PENDING)

**UI:** Master Admin → Organizations → Create wizard (`OrganizationCreateWizard`)  
Optional initial admin (name, email, password). Default status: **PENDING**.

**API:** `POST /api/v1/admin/organizations`  
Body includes `companyName`, `businessType`, optional `initialAdmin`, `status: 'PENDING'`.

**Outcome:** Organization row, `organization_memberships` (ORG_ADMIN), system `organization_roles` + approved `organization_role_versions` (P4 atomic onboarding).

## 2. Initial admin access while PENDING

**Login:** `POST /api/v1/auth/login` (session issuance allowed for PENDING per lifecycle policy).

**Allowed:** Profile, invites, tenant onboarding surfaces (`TENANT_ONBOARDING` / `SESSION_ISSUANCE`).

**Denied:** Operational fleet routes (`TENANT_OPERATIONAL`) — e.g. `GET/POST /api/v1/organizations/:orgId/vehicles` blocked by `OrgScopingGuard` + lifecycle policy.

## 3. Assign product (Master Admin)

**UI:** Master Admin → Organization → Products → assign Fleet (or Rental).

**API:** `POST /api/v1/admin/products/assign`  
`ProductsService.assignProductForMasterAdmin` sets **`OrgProductStatus.ACTIVE`** (not auto on org create).

Verify: `organization_products` row for org + product slug with `status = ACTIVE`.

## 4. Activate organization

**UI:** Master Admin → Organization → change status to **ACTIVE**.

**API:** `PATCH /api/v1/admin/organizations/:id` with `status: 'ACTIVE'`.

**Note:** `ACTIVE` org with **TRIAL** (or missing) product does **not** enable vehicle activation — entitlement policy requires **ACTIVE** product row (`assertOrganizationProductEntitled` / `ProductLicenseGuard`).

## 5. Organization admin — fleet operations

**Login:** Org admin via standard auth; JWT carries `organizationId`.

**Create vehicle:** `POST /api/v1/organizations/:orgId/vehicles`  
Guards: auth, `OrgScopingGuard` (ACTIVE + operational), `PermissionsGuard` (`fleet.write`; ORG_ADMIN passes without `organizationRoleId`).

**Read vehicle:** `GET /api/v1/organizations/:orgId/vehicles/:vehicleId`  
`VehicleOwnershipGuard` binds vehicle to JWT org context.

**Vehicle onboarding activation** (DIMO / VO paths): requires **ACTIVE** product entitlement (`canActivateVehicles`); TRIAL is UI-only for entitlement capabilities.

## 6. Verification checklist

| Check | Expected |
|-------|----------|
| Org status after wizard | `PENDING` until MA PATCH |
| Roles after create | System templates + approved versions |
| Fleet HTTP while PENDING | 403 lifecycle |
| Fleet with ACTIVE org, no ACTIVE product | 403 product license / VO entitlement |
| Fleet with ACTIVE org + ACTIVE FLEET | 200 / vehicle created |
| Cross-org vehicle id | 404 `VehicleOwnershipGuard` |
| Org `SUSPENDED` with valid JWT | 403 operational (fail-closed) |

## Core vs Rental boundary

| Step | Domain |
|------|--------|
| Organization CRUD, lifecycle, IAM, products/entitlements | **Core** (`organizations`, `products`, `users`, shared auth guards) |
| Fleet vehicle CRUD | **Core** (`vehicles`) |
| Rental bookings / handover | **Rental** (requires `RENTAL` ACTIVE entitlement; not part of minimal Fleet E2E) |

## Disposable PostgreSQL test

```bash
export ORG_E2E_ACTIVATION_P5B1_PG=1
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/synqdrive_org_e2e_activation_p5b1_test'
cd backend && npx prisma db push --accept-data-loss
npx jest src/modules/organizations/organizations-e2e-activation-seal.postgres.integration.spec.ts --runInBand
```