# IAM MFA — Agent contract

## Before substantive MFA / step-up changes

1. Read [`README.md`](README.md), [`CURRENT_STATE.md`](CURRENT_STATE.md), [`iam-mfa.policy.ts`](../../backend/src/modules/iam-mfa/iam-mfa.policy.ts).
2. Confirm feature-flag impact in [`iam-mfa-feature-flags.contract.ts`](../../backend/src/modules/iam-mfa/iam-mfa-feature-flags.contract.ts).
3. Do **not** enable Production MFA flags without explicit owner authorization.
4. Preserve fail-closed behavior when flags are **on**; preserve no-op when flags are **off** unless owner changes rollout policy.

## Invariants

- Step-up grants are single-use bounded (`STEP_UP_TTL_MS`, grant `expiresAt`).
- TOTP secrets never stored plaintext (`IAM_MFA_ENCRYPTION_KEY`).
- Recovery codes stored hashed only.
- Master Admin audit: step-up denials owned by MFA guard — do not duplicate `PRIVILEGED_MUTATION_DENIED` for `STEP_UP_REQUIRED` / `STEP_UP_EXPIRED`.
- Org scoping: admin MFA reset requires `OrgScopingGuard` + users `manage` permission.

## Forbidden without owner approval

- Setting Production `IAM_MFA_*` env vars
- Removing default-off flag defaults
- Bypassing guards for privileged routes
- Promoting registry to `AUTHORITY_ACTIVE` without Production read-only flag attestation