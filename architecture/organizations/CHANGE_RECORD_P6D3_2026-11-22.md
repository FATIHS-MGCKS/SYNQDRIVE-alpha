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

## P6D3 EXECUTION SAFETY HARDENING (append)

**Prior head:** `e1fe63f24b71b58c09f6b724323049a86589605d`

### FIXES

1. **Failed phases** — `phasesCompleted` only on verified postconditions; failures stay `RETRYABLE` with structured `lastErrorCode`; vehicle batch preserves `processedVehicleIds` and resumes at blocker.
2. **Concurrency** — durable `executionLease` (token, fence, TTL) in `progressJson`; short transactional lease acquire; `assertHoldsLease` fences stale writers; no long transactions across vehicle/provider work. **No schema migration.**
3. **Audit** — phase/summary audit via `await masterAudit.record` (actor + `correlationId` preserved).
4. **Provider readiness** — `ProviderFinalizationState` gate; `READY_FOR_ARCHIVE` only when `NO_EXTERNAL_PROVIDER_DEPENDENCY` / confirmed local-external states; `EXTERNAL_DISCONNECT_PENDING` blocks completion.

### EVIDENCE

- `organization-offboarding-execution.phase-retry.spec.ts`
- `organization-offboarding-execution.postgres.integration.spec.ts` (opt-in `ORGANIZATION_OFFBOARDING_EXECUTION_POSTGRES=1`)

## P6D3 EXECUTION CORRECTNESS CLOSEOUT (append)

**Prior head:** `795dfb44caa967a7fc0d246ca31674b821ea50e5`

### FIXES

1. **Active lease ownership** — active lease + same execution idempotency key → `ORGANIZATION_OFFBOARDING_EXECUTION_IN_PROGRESS` (no lease replacement).
2. **Atomic fencing** — `persistJobUnderActiveLease` / `releaseJobLeaseUnderActiveToken` with `FOR UPDATE` + token CAS.
3. **Session crash idempotency** — revoke + membership bump + `sessions.completedAt` in one transaction.
4. **Provider provenance** — historical DIMO/HM consent + `dimoVehicleId` evidence; revoked-only local state stays `EXTERNAL_DISCONNECT_PENDING`.

### PG scenarios A–G

Opt-in suite extended (10 cases) on `synqdrive_org_offboarding_p6d2`.