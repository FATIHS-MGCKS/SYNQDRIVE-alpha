# CHANGE_RECORD — P6D3 Controlled organization offboarding execution

**Operation:** `SYNQDRIVE_ORGANIZATIONS_P6D3_CONTROLLED_OFFBOARDING_EXECUTION`  
**Base SHA:** `5149cba2ab74c991f565009a3e5c439cc17bddd2`

## CHANGE

- `OrganizationOffboardingExecutionService` — phased execution on existing `OrganizationOffboardingJob`
- Phases: REVALIDATE → SUSPEND → REVOKE_ORG_SESSIONS → VEHICLE_OFFBOARD_BATCH → PROVIDER_QUIESCE → READY_FOR_ARCHIVE
- Master Admin `POST …/offboarding/execute` with explicit confirmation + execution idempotency
- `RefreshTokenService.revokeAllActiveForOrganization` (org-scoped refresh revocation)
- Preflight `excludeOffboardingJobId` + `suspendAdmissionOnly` for execution revalidate
- Production fail-closed: `ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED=1` required when `NODE_ENV=production`

## NON-EFFECTS (policy)

- No `ARCHIVED` / `COMPLETED` job terminalization; no hard delete; no Stripe; no live DIMO/HM calls
- Scheduler cohort filter and generic ARCHIVED PATCH guard remain P6D4

## DEFERRED (P6D4+)

- External provider disconnect confirmation
- DIMO/HM polling cohort for SUSPENDED orgs
- ARCHIVED transition and PATCH bypass closure