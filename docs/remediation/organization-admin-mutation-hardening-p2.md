# Master Admin organization mutation hardening (P2)

**Status:** ACTIVE  
**Depends on:** P1 organization delete safety (`ORGANIZATION_HARD_DELETE_DISABLED`)

## Scope

- `POST /api/v1/admin/organizations`
- `PATCH /api/v1/admin/organizations/:id`

Unchanged:

- `PATCH .../payments-enabled` (dedicated payments surface)
- Tenant `PATCH /organizations/:orgId/profile` allow-list
- MFA / `MASTER_ADMIN` guards

## PATCH allow-list

Platform profile, contact, legal, and lifecycle fields on `Organization` scalars — **excluding**:

- `id`, `paymentsEnabled`, `nextInvoiceNumber`
- `createdAt`, `updatedAt`, `lastActiveAt`
- Any Prisma relation / nested writes

Unknown JSON keys → **400** (`forbidNonWhitelisted`).

## CREATE validation

Required: `companyName` (trimmed, non-empty).  
Optional: `shortCode`, `businessType`, `email`/`contactEmail`, address fields, `status` (default **PENDING** in service).

## Frontend compatibility

Verified payloads:

- `OrganizationCreateWizard` / `App.tsx` create body
- `OrganizationDetailView` settings save `{ companyName, city }`