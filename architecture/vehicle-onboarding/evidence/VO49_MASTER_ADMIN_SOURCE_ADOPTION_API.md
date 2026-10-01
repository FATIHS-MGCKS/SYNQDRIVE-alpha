# VO-4.9 — Master Admin trusted provider source adoption HTTP

| Field | Value |
|-------|-------|
| **Slice** | VO-4.9 |
| **Repository anchor** | `c7fd1b532b7bfa2f966519629ddda3327424fbb7` (base) + VO-4.9 branch |
| **API classification** | `MASTER_ADMIN_TRUSTED_SOURCE_ADOPTION_API` |
| **Public cutover** | **NO** — legacy `register-from-dimo`, HM-only registration, manual create unchanged |
| **Activation HTTP** | **NO** |

## Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/admin/vehicle-onboarding/organizations/:orgId/sources/adopt` | Open/resume onboarding case from DIMO or HM mirror |
| `POST` | `/admin/vehicle-onboarding/organizations/:orgId/cases/:caseId/sources/attach` | Attach secondary provider source to existing case |

Guards: `RolesGuard`, `MasterAdminMfaGuard`, `@Roles('MASTER_ADMIN')`, `@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)`.

## Authority decisions

- **DIMO** mirrors are global Developer License rows — adoption requires server-built `PLATFORM_TRUSTED_ADOPTION` context (never caller-supplied `sourceAdoptionMode`).
- **HM** org-scoped mirrors adopt under tenant correlation; `organizationId == null` requires platform trusted adoption.
- **Global source claim** uses PostgreSQL advisory lock `vehicle-onboarding-source-claim:<provider>:<sourceMirrorId>` in the same transaction as claim checks and mutations.
- **Cross-org active case** holding the same mirror → `SOURCE_ALREADY_CLAIMED` (409, no tenant leakage).
- **Canonical / completed-case suppression** → `SOURCE_ALREADY_REGISTERED` (409).
- **Attach** participates in VO-4.8 concurrency (`expectedConcurrencyToken`), prospective source-set + VIN validation, readiness invalidation, token rotation on semantic change.
- **No provider network calls** during adopt/attach (mirrors only).
- **No Vehicle materialization** on adopt/attach.

## Tests

- `npm run test:vehicle-onboarding:vo49:postgres`
- Unit: `source-adoption-request.validation.unit.spec.ts`, `source-adoption.authority.unit.spec.ts`
