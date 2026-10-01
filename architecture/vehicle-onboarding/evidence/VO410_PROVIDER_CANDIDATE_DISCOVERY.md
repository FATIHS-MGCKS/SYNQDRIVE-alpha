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

## Combined pagination authority (VO-4.10.1)

Global deterministic order for unfiltered queries:

1. **DIMO** mirrors scanned by `dimo_vehicles.id ASC` (projected candidates only).
2. **HIGH_MOBILITY** mirrors scanned by `high_mobility_vehicles.id ASC` (projected candidates only).

Cursors are **versioned opaque** base64url JSON (`v`, `m`, `p`, `i`) — not raw mirror UUIDs:

| Field | Meaning |
|-------|---------|
| `v` | Cursor version (`1`) |
| `m` | `COMBINED` \| `DIMO` \| `HIGH_MOBILITY` (must match query provider filter) |
| `p` | Active scan phase: `DIMO` or `HIGH_MOBILITY` |
| `i` | Last **scanned** mirror id in `p` (or HM phase-start sentinel) |

A cursor emitted after DIMO scanning **must not** be applied as an HM `id >` lower bound. HM phase resumes from the HM phase-start sentinel or the last scanned HM id.

**COMBINED_PROVIDER_CURSOR_PROVIDER_AWARE=YES**  
**COMBINED_PROVIDER_PAGINATION_NO_DUPLICATE=PROVEN** (PostgreSQL)  
**COMBINED_PROVIDER_PAGINATION_NO_SKIP=PROVEN** (PostgreSQL, DIMO→HM lexical trap)  
**SUPPRESSION_HEAVY_PAGINATION=PROVEN** (PostgreSQL, 50-mirror scan batch)  
**MULTI_HOLDER_POSTGRES_FAIL_CLOSED=PROVEN** (PostgreSQL corruption fixture)

## Performance note (read-only)

Per projected mirror, listing currently performs:

- 1× `vehicleOnboardingCaseSourceRef.findMany` (active claims / disposition)
- 1× canonical suppression read (`assertSourceNotCanonicallyRegistered` path)

This is an **N+1 pattern** relative to scanned mirrors (not returned page size). Acceptable for current **Master Admin internal** discovery with paginated scans; a later slice may batch claim/suppression lookups without changing adoption authorities.

## Tests

- `npm run test:vehicle-onboarding:vo410:postgres` (includes VO-4.10.1 pagination + multi-holder proofs)
- Unit: `provider-candidate-disposition.authority.unit.spec.ts`, `provider-candidate-list.cursor.unit.spec.ts`
- HTTP: `vehicle-onboarding-provider-candidate.controller.http-boundary.spec.ts`
