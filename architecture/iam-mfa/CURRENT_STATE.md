# IAM MFA — Current state (repository baseline)

**Epistemic baseline:** `origin/main` @ `59182a9dec80b35d805cf64dd6252172c2fc4ba9`  
**Production runtime:** **UNKNOWN** for feature-flag activation (see [`evidence/PRODUCTION_BASELINE.md`](evidence/PRODUCTION_BASELINE.md))

## Implementation map

| Layer | Location | Role |
|-------|----------|------|
| Module | `backend/src/modules/iam-mfa/iam-mfa.module.ts` | `@Global()` — exports step-up + enrollment for cross-module guards |
| Facade | `IamMfaService` | Status, TOTP enroll/challenge, self reset |
| Enrollment | `IamMfaEnrollmentService` | TOTP secret encrypt, recovery codes |
| Challenge | `IamMfaChallengeService` | TOTP/recovery verify → elevated session claims |
| Step-up | `IamMfaStepUpService` | Grant mint/validate (`UserMfaStepUpGrant`) |
| Reset | `IamMfaResetService` | Self + admin reset flows |
| Policy | `iam-mfa.policy.ts` | `STEP_UP_ACTION` catalog, `MFA_ERROR`, assurance TTL |
| Flags | `iam-mfa-feature-flags.resolver.ts` | Env-driven; **default `false`** |

## HTTP API (Nest global prefix `api/v1`)

| Controller | Base path | Notes |
|------------|-----------|-------|
| `IamMfaAccountController` | `account/mfa` | status, TOTP enroll, challenge, self reset (step-up) |
| `IamMfaAdminController` | `organizations/:orgId/users/:userId` | MFA reset, revoke-all sessions (step-up) |
| `IamPrivilegedActionsController` | `organizations/:orgId/privileged-actions` | break-glass / privacy — **501 NOT_IMPLEMENTED** placeholders |

## Guards and consumers

| Guard | When active | Failure codes |
|-------|-------------|---------------|
| `StepUpGuard` | `mfaStepUpEnforced` true for principal | `STEP_UP_REQUIRED`, `STEP_UP_EXPIRED` |
| `MasterAdminMfaGuard` | `IAM_MFA_MASTER_ADMIN_ENABLED` + MA user | enrollment + step-up per route metadata |
| `MasterAdminMfaGuard` | flags false | **No-op** (allows mutation if RBAC passes) |

Master Admin step-up uses header `x-step-up-token` validated against `UserMfaStepUpGrant` (see P5-B2 HTTP tests).

## Feature flags (repository defaults — `.env.example`)

| Env key | Default in template |
|---------|---------------------|
| `IAM_MFA_ENROLLMENT_ENABLED` | `false` |
| `IAM_MFA_STEP_UP_ENFORCED` | `false` |
| `IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED` | `false` |
| `IAM_MFA_MASTER_ADMIN_ENABLED` | `false` |
| `IAM_MFA_ORG_ALLOWLIST` | empty (no rollout filter) |
| `IAM_MFA_ENCRYPTION_KEY` | unset (required when enrolling) |

Master admin bypass allowlist: when `IAM_MFA_MASTER_ADMIN_ENABLED=true`, principal flags force enrollment + step-up without org allowlist.

## Persistence

- `UserMfaFactor` — TOTP (`encryptedSecret`), WebAuthn fields reserved
- `UserMfaRecoveryCode` — hashed single-use codes
- `UserMfaStepUpGrant` — hashed token, `actionScope`, expiry, `consumedAt`

Migration: `20260722110000_iam_mfa_step_up` (repository — **CONFIRMED**).

## Frontend

- `frontend/src/lib/mfa.ts` — API client for account MFA
- `MfaEnrollmentPanel`, `MfaStepUpDialog` — user UX
- `MasterMfaGate` — master surface gating when flags enabled client-side

## Audit integration

- `MasterAdminMfaGuard` → `MasterAdminAuditService.recordMfaStepUp` on grant/deny
- Privileged mutation denial for step-up **skipped** in interceptor when `STEP_UP_*` (PR5-B3 PR1)
- `MFA_ENROLLMENT_REQUIRED` → `PRIVILEGED_MUTATION_DENIED` via global exception filter

## Tests (repository)

- `iam-mfa.security.spec.ts` — crypto/replay/policy unit coverage
- `iam-mfa-feature-flags.resolver.spec.ts`
- P5-B2: `master-admin-mfa-http.integration.harness.ts` + per-controller MFA HTTP specs

## Explicit non-claims

- **NOT CLAIMED:** MFA enforced on Production VPS
- **NOT CLAIMED:** All Master Admin routes covered (P5-B2 closed inventory gaps; intelligence read exceptions documented)
- **NOT CLAIMED:** WebAuthn enrollment shipped