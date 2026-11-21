# P3B — Delegated master-billing MFA step-up

**Date:** 2026-11-21 (Europe/Berlin)  
**Base `main`:** `b2592c90658a0d8e13fc7d10b232a68472cafb6b` (includes P3B0 #2469)  
**PR:** #2468 (rebased integration closeout)

## Mechanism

| Component | Role |
|-----------|------|
| `MasterBillingGuard` | `MASTER_ADMIN` **or** active DB grant + JWT `master-billing` (P3B0) |
| `MasterAdminMfaGuard` | Step-up for `MASTER_ADMIN` only (unchanged) |
| `MasterBillingDelegateMfaGuard` | Step-up for delegates when `IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED=true` (default **false**) |

Delegate guard applies only when:

- Route has `@RequireMasterBilling` + `@RequireMasterAdminMfa` metadata
- HTTP method is mutating (`POST`/`PUT`/`PATCH`/`DELETE`)
- Principal is not `MASTER_ADMIN` but has `master-billing` in JWT

Uses `userMfaFactor`, `IamMfaStepUpService`, `x-step-up-token`, billing `STEP_UP_ACTION` scopes.

## Wired controllers

- `MasterSubscriptionController`
- `StripeCatalogMappingController`
- `BillingController` (delegate enforcement on `@RequireMasterBilling` handlers only)

## Rollout

1. P3B0 merged — canonical grants + JWT emission **live**.
2. Delegate MFA remains **OFF** by default (`IAM_MFA_MASTER_BILLING_DELEGATE_ENABLED=false`).
3. MFA production activation is a **later release gate** (owner policy); do not enable in development by default.

## Revocation

`MasterBillingGuard` denies delegates when DB grant is inactive **immediately**, even if JWT still carries a stale claim (P3B0). Refresh/login/reissue drops the claim from the token.

## Audit attribution

`MasterAdminAuditService.recordMfaStepUp` accepts `actorPlatformRole`; delegate guard passes the real `USER` role (not `MASTER_ADMIN`).

## Tests

- `master-billing-delegate-mfa.guard.spec.ts`
- `master-billing-delegate.mfa.http-security.spec.ts`
- `master-billing.real-jwt.http-security.spec.ts` (signed JWT + `AuthGuard`)
- `platform-permission-jwt.integration.spec.ts` (issuer; on `main`)

## Registry

**REGISTRY_REVIEWED:** UNCHANGED