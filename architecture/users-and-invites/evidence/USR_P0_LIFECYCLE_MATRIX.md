# USR_P0 — Account, membership, and session lifecycle

Enums from `schema.prisma` — **not invented**.

## Global `UserStatus`

`ACTIVE` | `INACTIVE` | `SUSPENDED`

| Transition | Service / route evidence | Refresh on next | Access JWT |
|------------|-------------------------|-----------------|------------|
| Suspend user | org/master user services | `refresh-token.service` rejects non-ACTIVE user | **Stale until JWT exp** — guard does not re-read DB |
| Password reset confirm | `password-reset` / auth | `sessionVersion` / `securityVersion` bumps (policy) | Old JWT may work until expiry **unless** version checked on request — **not** in `auth.guard` |
| MFA reset | `iam-mfa-reset` increments `securityVersion` | Refresh re-issues claims | JWT `sessionClaims` may be stale |
| Global delete | `MasterAdminUserDeletionController` | tokens revoked via deletion pipeline | N/A |

## `MembershipStatus`

`INVITED` | `ACTIVE` | `SUSPENDED` | `OFFBOARDING` | `REMOVED` | `REACTIVATION_REQUIRED`

| Transition | Evidence | Refresh binding |
|------------|----------|-----------------|
| REMOVED | PR #2481 `iam-removed-membership` | `MEMBERSHIP_REMOVED` on refresh (`refresh-token.service` ~186–200) |
| SUSPENDED | membership policy | `MEMBERSHIP_SUSPENDED` |
| ACTIVE re-add after REMOVED | identity isolation tests | New membership row; no password overwrite |

## Version fields

| Field | Stored on | Enforced at refresh | Enforced every API request |
|-------|-----------|---------------------|----------------------------|
| `sessionVersion` | `users`, `refresh_tokens` | **YES** `validateVersionSnapshots` | **NO** (JWT payload only) |
| `membershipVersion` | membership, refresh row | **YES** | **NO** |
| `permissionVersion` / `roleVersion` | refresh row | **YES** | **NO** |
| `securityVersion` | user, JWT claims | Partial via MFA/login paths | **NO** in `auth.guard` |

**Stale privilege window:** CONFIRMED — access token may carry old `platformPermissions` / role until TTL or refresh fails. **USR-P0-R-008** (see findings register).

## Invitations

`OrganizationInviteStatus`: `PENDING` | `ACCEPTED` | `EXPIRED` | `REVOKED` — routes `organizations/:orgId/invites/*`, public `invites/accept`.