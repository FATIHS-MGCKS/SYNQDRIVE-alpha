# IAM MFA and Step-Up — Security Audit (2026-07)

## Scope

Prompt 18: privileged MFA foundations, TOTP enrollment, recovery codes, JWT assurance claims, step-up guard for critical IAM mutations.

## Findings

| Area | Status |
|------|--------|
| TOTP secrets encrypted (AES-256-GCM) | PASS |
| Recovery codes bcrypt-hashed, single-use | PASS |
| No plaintext secret after enrollment | PASS |
| JWT assurance claims (`aal`, timestamps, `authMethods`) | PASS |
| Step-up guard on privileged endpoints | PASS |
| MFA reset audited via transactional outbox | PASS |
| Session revocation on MFA reset | PASS |
| Feature flags + org allowlist rollout | PASS |
| WebAuthn enum reserved, not yet implemented | NOTED |
| Break-glass / privacy flows | Step-up gated stubs only |

## Test coverage

14 scenarios in `iam-mfa.security.spec.ts` including replay, expired step-up policy, cross-org allowlist, and privileged enrollment requirement.

## Rollout recommendation

1. Enable `IAM_MFA_ENROLLMENT_ENABLED` for pilot orgs via `IAM_MFA_ORG_ALLOWLIST`
2. Require privileged users to enroll (`IAM_MFA_PRIVILEGED_ENROLLMENT_REQUIRED`)
3. Enforce step-up (`IAM_MFA_STEP_UP_ENFORCED`) after enrollment baseline reached
