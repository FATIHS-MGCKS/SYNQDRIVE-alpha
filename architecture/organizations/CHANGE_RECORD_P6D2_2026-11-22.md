# CHANGE_RECORD — P6D2 Organization offboarding foundation

**Operation:** `SYNQDRIVE_ORGANIZATIONS_P6D2_OFFBOARDING_CONTRACT_PREFLIGHT_JOB_FOUNDATION`  
**Base SHA:** `5206075419ed597790914b405fc8b0b0b9c9531b`

## CHANGE

- `OrganizationOffboardingJob` persistence + `OrganizationOffboardPreflightService`
- Master Admin routes under `admin/organizations/:organizationId/offboarding`
- Hard delete 409 unchanged; no execution side effects in prepare

## DEFERRED (P6D3+)

- SUSPEND / session revoke / vehicle batch / provider disconnect / ARCHIVED finalize
- Generic PATCH ARCHIVED guard
- DIMO scheduler org-status cohort filter

## OWNER POLICIES

See evidence `P6D_ORGANIZATION_OFFBOARDING_OWNER_POLICIES_2026-11-22.md` (six binding decisions).

## APPEND — P6D2 final merge-gate hardening (2026-11-22)

- Strict `parseOrganizationOffboardingPrepareBody` (400 on invalid/malformed; allow-list; bounded key/note).
- Lifecycle admission fail-closed: `PENDING` / unknown statuses → `INVALID_ORGANIZATION_STATUS`; `ARCHIVED` unchanged.
- Parallel PostgreSQL concurrency coverage (`Promise.all`).
- Master Admin audit on prepare success and preflight-denied prepare (`MasterAdminAuditService`; no note/secrets in metadata).