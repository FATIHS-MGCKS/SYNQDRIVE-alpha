# P3B — JWT integration (post–P3B0 closeout)

**Status:** SUPERSEDED by P3B0 merge (`b2592c90658a0d8e13fc7d10b232a68472cafb6b`)  
**PR #2468:** Rebased onto P3B0; prior “issuer gap” blocker **resolved**.

## Current contract (P3B0 + P3B integration)

| Path | `platformPermissions` in access JWT |
|------|-------------------------------------|
| Password login / refresh | Resolved from `PlatformPermissionService` |
| MFA reissue | Resolved on each reissue |
| `MasterBillingGuard` | DB grant **and** JWT claim for delegates |

## Tests

- `platform-permission-jwt.integration.spec.ts` — real `RefreshTokenService` + resolver mocks
- `master-billing.real-jwt.http-security.spec.ts` — `AuthGuard` + `MasterBillingGuard` with signed JWTs (no injected claims on user object)

## Historical note

Pre-P3B0 gap characterization (no persistence, omitted claims) is retained only for audit trail in git history of this file prior to rebase closeout.