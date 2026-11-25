# USR_P0-R-003 — Complete API inventory

Prefix: `/api/v1` unless noted.

**Total unique method+path combinations: 98** (static controller scan, USR_P0 IAM scope).

**Reconciliation:** earlier **78** figure omitted slices (auth/account/MFA/retention detail) or used narrative rounding — **98** is authoritative for this inventory.

Legend: **REACH** = `UI` | `LEGACY_UI` | `API_ONLY` | `PUBLIC`

## Count breakdown

| Area | Routes |
|------|--------|
| admin/security | 12 |
| admin/users (+ DELETE controller) | 6 |
| org users | 11 |
| org invites | 4 |
| public invites | 2 |
| org roles | 9 |
| iam team | 7 |
| access reviews | 6 |
| auth | 11 |
| account | 7 |
| activity log | 4 |
| iam-mfa | 10 |
| iam data-retention | 9 |
| **Total** | **98** |

## `admin/security` — `SecurityGovernanceController` (12)

| Method | Path | Guards | REACH |
|--------|------|--------|-------|
| GET | `admin/security/attention-summary` | MASTER_ADMIN, MasterAdminMfaGuard* | UI |
| GET | `admin/security/users` | same | UI |
| GET | `admin/security/users/:userId` | same | UI |
| GET | `admin/security/users/:userId/sessions` | same | UI |
| POST | `admin/security/users/:userId/sessions/:sessionId/revoke` | +MFA+StepUp | UI |
| POST | `admin/security/users/:userId/sessions/revoke-all` | +MFA+StepUp | UI |
| POST | `admin/security/users/:userId/mfa/reset` | +MFA+StepUp | UI |
| POST | `admin/security/users/:userId/platform-permissions/master-billing/grant` | +MFA metadata | UI |
| POST | `admin/security/users/:userId/platform-permissions/master-billing/revoke` | +MFA metadata | UI |
| GET | `admin/security/platform-roles` | MFA guard noop on GET | UI |
| GET | `admin/security/org-roles` | same | UI |
| GET | `admin/security/roles/:roleId` | same | UI |

\*MasterAdminMfaGuard no-ops without handler metadata on GET.

## `admin/users` — `UsersController` + `MasterAdminUserDeletionController` (6)

| Method | Path | Guards | REACH |
|--------|------|--------|-------|
| GET | `admin/users` | MASTER_ADMIN | **LEGACY_UI** (`App.tsx` fetch) |
| GET | `admin/users/:id` | MASTER_ADMIN | API_ONLY |
| POST | `admin/users` | MASTER_ADMIN + MasterAdminMfa | API_ONLY |
| PATCH | `admin/users/:id` | same | API_ONLY |
| POST | `admin/users/:id/change-password` | +StepUp | API_ONLY |
| DELETE | `admin/users/:id` | +StepUp + MFA + deletion pipeline | API_ONLY |

## Org users — `UsersController` (11)

`organizations/:orgId/users` (+ password reset, membership, assign-role, security-activity) — `OrgScopingGuard`, `PermissionsGuard`, step-up on privileged writes.

## Org invites — `OrganizationInvitesController` (4)

`organizations/:orgId/invites` — CRUD/resend/revoke.

## Public invites — `PublicInvitesController` (2)

`invites/validate`, `invites/accept` — **PUBLIC** (token-bound).

## Org roles — `OrganizationRolesController` (9)

`organizations/:orgId/roles` — permission preview/apply uses step-up on apply.

## IAM team — `IamTeamController` (7)

`organizations/:orgId/iam/team/*`, `.../roles`, `.../security`.

## Access reviews — `IamAccessReviewController` (6)

`organizations/:orgId/access-reviews/*`.

## Auth — `AuthController` (11)

`auth/login`, `login/mfa`, `refresh`, `logout`, `logout-all`, `me`, `memberships`, `switch-organization`, password-reset, `seed-admin` (non-prod).

## Account self-service — `AccountController` (7)

`account/me/*`, sessions revoke.

## MFA — `iam-mfa` (10)

`account/mfa/*`; `organizations/:orgId/users/:userId/mfa/reset`, `sessions/revoke-all`; privileged privacy routes.

## Activity — `ActivityLogController` (4)

`admin/activity-log` (+ export step-up); org activity log.

## Retention / DSAR — `IamDataRetentionController` (9)

`organizations/:orgId/iam/data-retention/*`.

## Security notes (legacy)

- **`admin/users` POST/PATCH** remain **unguarded alternate mutation paths** vs MA Security & Access UI — still authorized for MASTER_ADMIN (not unauthenticated).
- Frontend hiding does not remove API reachability.