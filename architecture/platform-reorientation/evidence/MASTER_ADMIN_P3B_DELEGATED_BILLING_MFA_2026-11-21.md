# P3B — Delegated master-billing MFA step-up

**Date:** 2026-11-21 (Europe/Berlin)  
**Base `main`:** `0d917a23e71ece4f156f44d1bcda48d8a23e7844`  
**Owner policy:** Operators with JWT `master-billing` must complete MFA step-up before sensitive billing mutations.

## Mechanism

| Component | Role |
|-----------|------|
| `MasterBillingGuard` | Authorization (unchanged) — `MASTER_ADMIN` or `platformPermissions` contains `master-billing` |
| `MasterAdminMfaGuard` | Step-up for `MASTER_ADMIN` only (unchanged) |
| `MasterBillingDelegateMfaGuard` | Step-up for delegated operators when `IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED=true` (default **false**) |

Delegate guard applies only when:

- Route has `@RequireMasterBilling` + `@RequireMasterAdminMfa` metadata
- HTTP method is mutating (`POST`/`PUT`/`PATCH`/`DELETE`)
- Principal is not `MASTER_ADMIN` but has `master-billing` in JWT

Uses existing `userMfaFactor`, `IamMfaStepUpService`, `x-step-up-token`, and billing `STEP_UP_ACTION` scopes (`MASTER_BILLING`, `MASTER_SUBSCRIPTION`).

## Wired controllers

- `MasterSubscriptionController`
- `StripeCatalogMappingController`
- `BillingController` (delegate enforcement only on handlers with `@RequireMasterBilling`)

Not wired: `BillingEmailDeliveryController` (`MASTER_ADMIN` only).

## Rollout prerequisites

1. Set `IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED=true` (isolated gate; does not enable master-admin MFA).
2. Ensure operators can enroll MFA via existing IAM MFA APIs (`IAM_MFA_ENROLLMENT_ENABLED` recommended).
3. **Blocker (2026-11-21):** Implement canonical `master-billing` grant store + JWT issuer wiring — see [`MASTER_ADMIN_P3B_JWT_INTEGRATION_CORRECTION_2026-11-21.md`](./MASTER_ADMIN_P3B_JWT_INTEGRATION_CORRECTION_2026-11-21.md). Until then, only `MASTER_ADMIN` can use real signed JWTs on billing routes.

## Permission revocation

JWT `platformPermissions` are fixed at issuance (`AuthGuard.validateJwt`). Revocation takes effect on **token refresh / re-login** when the issuer omits `master-billing`. Until then, `MasterBillingGuard` may still authorize stale grants — operational controls should bump `sessionVersion` / force refresh when revoking platform permissions (existing session policy).

## Tests

- `backend/src/shared/auth/master-billing-delegate-mfa.guard.spec.ts`
- `backend/src/modules/billing/master-billing-delegate.mfa.http-security.spec.ts`
- `backend/src/modules/auth/refresh-token.platform-permissions.gap.spec.ts` (issuer gap)
- `backend/src/modules/billing/master-billing.real-jwt.http-security.spec.ts` (real JWT HTTP)

## Registry

**REGISTRY_REVIEWED:** UNCHANGED (billing/IAM evidence; no authority promotion).