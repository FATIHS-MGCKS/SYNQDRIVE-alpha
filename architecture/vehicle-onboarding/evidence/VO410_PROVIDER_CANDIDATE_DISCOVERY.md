# VO-4.10 — Master Admin provider candidate discovery projection

| Field | Value |
|-------|-------|
| **Status** | Implemented (read-only advisory projection) |
| **HTTP** | `GET /admin/vehicle-onboarding/organizations/:orgId/candidates` |
| **Security** | `MASTER_ADMIN` + `MasterAdminMfaGuard` + `MASTER_INTEGRATIONS` step-up |
| **Writes** | None |
| **Provider network** | None |

## Authority model

- **CANDIDATE_MODEL=PERSISTED_PROVIDER_MIRRORS_PLUS_DERIVED_PROJECTION**
- **PERSISTED_VEHICLE_CANDIDATE_ENTITY=NO**
- **CANDIDATE_LIST_IS_ACTIVATION_AUTHORITY=NO**
- **ADOPTION_TRANSACTION_REMAINS_FINAL_AUTHORITY=YES**
- **PROVIDER_NETWORK_CALLS=NO**
- **PUBLIC_CUTOVER=NO**
- **ACTIVATION_HTTP=NO**
- **LEGACY_REGISTRATION_CHANGED=NO**

Candidate listing is advisory. `VehicleOnboardingSourceAdoptionService.adoptProviderSource()` remains the transactional write authority with source-claim locks and full revalidation.

## Projection rules

- Reuses canonical suppression read helper, active claim disposition (primary resume / secondary omit / multi-holder omit), and `VehicleOnboardingSourceAdoptionAuthority` mirror checks.
- **DIMO:** platform-trusted Master Admin boundary; mirrors are not tenant-owned rows.
- **HIGH_MOBILITY:** org-scoped or platform-global (`organizationId` null) with existing clearance/active/registration rules.
- **Disposition:** `AVAILABLE` | `RESUMABLE` (same-org consistent primary only).
- Cross-org or secondary-only claims: mirror omitted — no foreign tenant/case disclosure.

## Tests

- `npm run test:vehicle-onboarding:vo410:postgres`
- Unit: `provider-candidate-disposition.authority.unit.spec.ts`
- HTTP: `vehicle-onboarding-provider-candidate.controller.http-boundary.spec.ts`
