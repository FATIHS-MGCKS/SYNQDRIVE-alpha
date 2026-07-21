# IAM MFA and Step-Up Authentication (2026-07-21)

## Summary

Prompt 18 adds **TOTP MFA** with hashed recovery codes, **JWT session assurance claims**, and **step-up enforcement** for privileged IAM actions. Architecture is open for **WebAuthn/Passkeys** via `MfaFactorType.WEBAUTHN`.

## Components

| Component | Path |
|-----------|------|
| `IamMfaModule` | `backend/src/modules/iam-mfa/` |
| Enrollment | `iam-mfa-enrollment.service.ts` |
| Challenge | `iam-mfa-challenge.service.ts` |
| Reset | `iam-mfa-reset.service.ts` |
| Step-up grants | `iam-mfa-step-up.service.ts` |
| Policy | `iam-mfa.policy.ts` |
| Feature flags | `iam-mfa-feature-flags.*` |
| Step-up guard | `backend/src/shared/auth/step-up.guard.ts` |
| Session claims | `backend/src/shared/auth/auth-session-claims.types.ts` |

## Data model

- `UserMfaFactor` — encrypted TOTP secret (AES-256-GCM); WebAuthn fields reserved
- `UserMfaRecoveryCode` — bcrypt hash only, single-use
- `UserMfaStepUpGrant` — short-lived step-up tokens (hashed)
- `User.securityVersion` — bumped on MFA enroll/reset; included in JWT

## Session claims (access JWT)

- `assuranceLevel` — `1` (password) or `2` (MFA)
- `authenticatedAt`
- `mfaAuthenticatedAt`
- `authMethods` — e.g. `['pwd','totp']`
- `securityVersion`

## Step-up actions

Enforced when `IAM_MFA_STEP_UP_ENFORCED=true` and org is in allowlist (if configured):

- Admin role assign/revoke
- Privileged permission changes
- Role template changes / bulk assignment delete
- MFA reset (other user)
- Revoke other user sessions
- Security activity / audit export
- Invite resend (manual link rotation)
- Break glass, privacy export/deletion (placeholder endpoints, step-up gated)
- **Exempt:** `POST /auth/seed-admin` (bootstrap token gate only)

## Feature flags

| Env | Default |
|-----|---------|
| `IAM_MFA_ENROLLMENT_ENABLED` | `false` |
| `IAM_MFA_STEP_UP_ENFORCED` | `false` |
| `IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED` | `false` |
| `IAM_MFA_ORG_ALLOWLIST` | empty (all orgs when enabled) |
| `IAM_MFA_ENCRYPTION_KEY` | falls back to `JWT_SECRET` |

## API (account)

- `GET /account/mfa/status`
- `POST /account/mfa/totp/enroll/start`
- `POST /account/mfa/totp/enroll/confirm` — returns recovery codes once
- `POST /account/mfa/challenge` — TOTP or recovery code → elevated JWT + step-up token
- `POST /account/mfa/reset` — self-service reset (step-up required)

## API (org admin)

- `POST /organizations/:orgId/users/:userId/mfa/reset`
- `POST /organizations/:orgId/users/:userId/sessions/revoke-all`
- `POST /organizations/:orgId/privileged-actions/*` — break-glass / privacy stubs

## Security guarantees

- TOTP secrets encrypted at rest; never returned after enrollment
- Recovery codes stored hashed; one-time use
- TOTP replay protection via `lastTotpStep`
- MFA reset: transactional audit outbox (`MFA_CHANGED`), session revocation, `securityVersion` bump
- Idempotency keys on enroll confirm, challenge, reset

## Tests

`backend/src/modules/iam-mfa/iam-mfa.security.spec.ts` — enrollment, challenge, replay, recovery, step-up guard, reset, session claims, multi-org flags.
