# P3-PR5 — Master Admin Core App service client management

**Date:** 2026-11-17

## Backend

- `GET/POST/PATCH /api/v1/admin/core-app-service-clients`
- `POST .../:id/rotate-credential` (one-time secret, `Cache-Control: no-store`)
- `GET/POST/PATCH .../:id/org-grants`
- Guards: `MASTER_ADMIN`, `MasterAdminMfaGuard`, `STEP_UP_ACTION.MASTER_API_KEYS`
- Audit: `MasterAdminAuditService` via `PRIVILEGED_HTTP_MUTATION` + domain metadata
- New clients **DISABLED**; new org grants **REVOKED**
- `productSlug` immutable after create; TAXI rejected

## Frontend

- Master view `service-client-management` (`CoreAppServiceClientsHub`)
- One-time secret panel (no persistence in storage)

## Non-effects

- No M2M runtime activation (`CORE_APP_M2M_*` unchanged)
- Rental / user JWT unchanged
- No automatic `OrganizationProduct` assignment

## Limitations

- Not production-validated; operator must still set env flags deliberately for M2M
- MA must activate client + grant + org product entitlement separately for token issuance