# P3B0 — Platform permission foundation (`master-billing`)

**Date:** 2026-11-21 (Europe/Berlin)  
**Base:** `0d917a23e71ece4f156f44d1bcda48d8a23e7844`  
**Dependent draft:** PR #2468 (not modified)

## Persistence

`user_platform_permission_grants` — one active row per `(user_id, master-billing)` via partial unique index (`revoked_at IS NULL`).

## Issuer

`RefreshTokenService.signAccessToken` emits `platformPermissions` from `PlatformPermissionService.resolveJwtPermissions` on login, refresh rotation, and MFA reissue.

## Enforcement

`MasterBillingGuard` — `MASTER_ADMIN` unchanged; delegates require **active DB grant** and matching JWT claim (stale JWT after revoke denied immediately).

## Admin API

`POST /admin/security/users/:userId/platform-permissions/master-billing/grant|revoke` — `MASTER_ADMIN` + `MASTER_USER_MANAGEMENT` MFA step-up.

## MFA allowlist

`resolveIamMfaFeatureFlagsForPrincipal({ platformMasterBillingGrant: true })` bypasses org allowlist for platform billing delegates with `organizationId: null`.

## Registry

**REGISTRY_REVIEWED:** UNCHANGED (IAM evidence; no module authority promotion).