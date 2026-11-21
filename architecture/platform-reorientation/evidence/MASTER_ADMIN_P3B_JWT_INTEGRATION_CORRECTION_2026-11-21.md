# P3B — JWT integration correction (delegated master-billing)

**Date:** 2026-11-21 (Europe/Berlin)  
**PR:** #2468 (`cursor/p3b-delegated-billing-mfa-7037`)  
**Mode:** Read-first; **no** new IAM persistence; **no** merge/deploy.

## CANONICAL_PERMISSION_SOURCE

**NONE in repository/runtime.**

| Inspected surface | Result |
|-------------------|--------|
| Prisma `User` | `platformRole` enum only (`MASTER_ADMIN` \| `USER`) — no `platformPermissions` column |
| `MembershipPermissionOverride` | Org-scoped module keys — not platform `master-billing` |
| `security-governance` / `platform-admin` | Lists `MASTER_ADMIN` users — no grant/revoke API for `master-billing` |
| Docs | `docs/remediation/master-admin-mfa.md` §8 — pre-existing gap, explicitly out of scope for MFA rollout |

Guards and UI assume JWT claim `platformPermissions: ['master-billing']`, but **no authoritative store** backs that claim in this codebase.

## JWT_ISSUANCE

| Path | Service | `platformPermissions` in access JWT |
|------|---------|-------------------------------------|
| Password login | `RefreshTokenService.issueTokenPair` → `signAccessToken` | **Absent** |
| MFA login completion | `auth-mfa-login.service` → `issueTokenPair` | **Absent** |
| Login user JSON | `AuthSessionContextService.buildUserResponse` | **Absent** |

Payload today: `sub`, `email`, `name`, `platformRole`, membership fields, `sessionVersion`, `sessionClaims` assurance fields (`assuranceLevel`, `authenticatedAt`, `mfaAuthenticatedAt`, `authMethods`, `securityVersion`).

## JWT_REFRESH

`RefreshTokenService.rotate` → new pair via `signAccessToken` — **`platformPermissions` not re-resolved** (claim never emitted). `validateVersionSnapshots` enforces `sessionVersion` / membership versions on refresh, not platform delegation.

## MFA_REISSUANCE

`IamMfaChallengeService` → `RefreshTokenService.reissueAccessToken` → `signAccessToken` — **same omission**. Step-up updates assurance claims only.

`AuthGuard.validateJwt` maps `decoded.platformPermissions ?? []` onto `request.user`; without issuer support, delegates always present **empty** permissions after real authentication.

## DELEGATE_ENROLLMENT

With `IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED=true` (default **false**):

1. Delegate must pass `MasterBillingGuard` (needs `master-billing` in JWT — **blocked today** for real tokens).
2. `MasterBillingDelegateMfaGuard` requires enrolled `userMfaFactor` + valid `x-step-up-token` on mutations.
3. `IAM_MFA_ENROLLMENT_ENABLED` gates enrollment APIs (orthogonal).
4. `IAM_MFA_ORG_ALLOWLIST` applies to **tenant/org MFA** paths — **not** used by delegate billing guard (platform-scoped).

End-to-end delegate path **cannot complete** with production-issued JWTs until a canonical permission source exists and is wired into `signAccessToken` / `buildUserResponse`.

## REVOCATION_SEMANTICS

| Mechanism | Effect on existing access JWT | Effect on new access JWT |
|-----------|------------------------------|--------------------------|
| Remove `master-billing` (no store today) | N/A | N/A |
| `sessionVersion` bump (`IamSessionPolicyService`) | **Not checked** per request in `AuthGuard` | Refresh `rotate` fails version check → re-login required |
| Refresh token revoke | Access JWT valid until **exp** (`app.jwtExpiresIn`) | Cannot refresh |
| MFA reissue | N/A | Still omits `platformPermissions` |

Do **not** claim `sessionVersion` immediately invalidates in-flight access tokens without DB check — runtime does not compare JWT `sessionVersion` to `User.sessionVersion` on each API call.

## REAL_JWT_HTTP_TESTS

Added regression (real `RefreshTokenService` + `AuthGuard`):

- `backend/src/modules/auth/refresh-token.platform-permissions.gap.spec.ts`
- `backend/src/modules/billing/master-billing.real-jwt.http-security.spec.ts`

**Observed:** USER-issued JWT → `MasterBillingGuard` 403; `MASTER_ADMIN` JWT → allowed without `platformPermissions`.

Existing mock HTTP suite (`master-billing-delegate.mfa.http-security.spec.ts`) still validates guard wiring when claims are **manually** present (simulates pre-gap / test-only tokens).

## REGRESSION_TESTS

Local (2026-11-21): **20 passed** — `refresh-token.platform-permissions.gap`, `master-billing.real-jwt`, `master-billing-delegate` (+ guard unit spec).

## BLOCKERS

**P3B delegate MFA is not production-complete for real delegates** until:

1. Owner-approved **canonical persistence + grant/revoke API** for platform permissions (or documented external issuer), and
2. `RefreshTokenService.signAccessToken` (and login payloads) **re-resolve** grants from that store on login, refresh, and MFA reissue — never copy from stale access tokens or tenant membership.

**This PR intentionally does not** add schema, parallel IAM, or manual JWT injection in production paths.

## STEP 2 OUTCOME

**STOP** — no minimal code change possible without (1). P3B guard/flag wiring remains valid for `MASTER_ADMIN` and for future issuer wiring.

## Registry

**REGISTRY_REVIEWED:** UNCHANGED (evidence-only; billing/IAM authorities unchanged).