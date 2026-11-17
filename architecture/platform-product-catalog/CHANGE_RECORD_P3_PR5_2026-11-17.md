# P3-PR5 — Master Admin Core App service client management

**Date:** 2026-11-17

## Backend

- `GET/POST/PATCH /api/v1/admin/core-app-service-clients`
- `POST .../:id/rotate-credential` (one-time secret, `Cache-Control: no-store`)
- `GET/POST/PATCH .../:id/org-grants`
- Guards: `MASTER_ADMIN`, `MasterAdminMfaGuard`, `STEP_UP_ACTION.MASTER_API_KEYS`
- Audit (post-remediation): `activityLog.create` inside the same Prisma transaction as each mutation (`persistCoreAppServiceClientAuditTx`); failure rolls back the mutation
- New clients **DISABLED**; new org grants **REVOKED**
- `productSlug` immutable after create; TAXI rejected
- **F1:** `credentialVersion` increments on disable and on `allowedScopes` change (invalidates outstanding JWTs; reactivation without scope change does not decrement version)

## Frontend

- Master view `service-client-management` (`CoreAppServiceClientsHub`)
- One-time secret panel (no persistence in storage)
- **F3/F4:** Canonical scope checkboxes for create + edit; org grants gated to `loadedForClientId`; secret cleared on client switch/unmount; post-mutation refresh failures surfaced explicitly

## Non-effects

- No M2M runtime activation (`CORE_APP_M2M_*` unchanged)
- Rental / user JWT unchanged
- No automatic `OrganizationProduct` assignment

## Limitations

- Not production-validated; operator must still set env flags deliberately for M2M
- MA must activate client + grant + org product entitlement separately for token issuance

## Independent review remediation (2026-11-17)

| Item | Evidence |
|------|----------|
| F1 credentialVersion | `core-app-service-client.admin.service.spec.ts` (disable + scope change bump) |
| F2 transactional audit | `core-app-service-client.admin-audit.util.ts` + audit failure rolls back update |
| F3 scopes UI | `CoreAppServiceClientsHub` + `known-scopes.ts` + `core-app-service-clients-i18n.ts` |
| F4 stale data | `useCoreAppServiceOrgGrants` + `grantsVisibleForClient` + hub refresh warning |
| F6 MFA | `core-app-service-client.mfa.http-security.spec.ts` (`STEP_UP_REQUIRED` on `MASTER_API_KEYS`) |

Reviewed head before remediation: `41fd57d7256ee72cbf23351ca92700dee398fbce` (#2421).

## Final UI safety closeout (2026-11-17)

- Post-create client selection preserves one-time secret; user switch/dismiss still clears.
- List/org-grant `refresh({ throwOnFailure: true })` for post-mutation sync; stale in-flight errors ignored.
- Controller metadata test: `@RequireMasterAdminMfa(MASTER_API_KEYS)` on admin routes.