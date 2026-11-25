# USR_P0 — API inventory (IAM / Master Admin users)

Repository snapshot @ `a5664ac10`. Non-exhaustive for rental-only routes.

## Platform governance (`SecurityGovernanceController`)

Base: `/api/v1/admin/security` (global prefix assumed)

| Method | Path | Guards | Purpose |
|--------|------|--------|---------|
| GET | `attention-summary` | RolesGuard, MasterAdminMfaGuard, MASTER_ADMIN | KPIs |
| GET | `users` | same | Paginated platform user list |
| GET | `users/:userId` | same | Detail |
| GET | `users/:userId/sessions` | same | Sessions |
| POST | `users/:userId/sessions/:sessionId/revoke` | + StepUp | Revoke one |
| POST | `users/:userId/sessions/revoke-all` | + StepUp | Revoke all |
| POST | `users/:userId/mfa/reset` | + StepUp | MFA reset |
| POST | `users/:userId/platform-permissions/master-billing/grant` | MFA | Delegate billing |
| POST | `users/:userId/platform-permissions/master-billing/revoke` | MFA | Revoke delegate |
| GET | `platform-roles` | MFA | Role catalog |
| GET | `org-roles` | MFA | Org role catalog |
| GET | `roles/:roleId` | MFA | Role detail |

## Users module (org-scoped — representative)

Path prefix pattern: `/api/v1/organizations/:organizationId/...`

Discover via `backend/src/modules/users/users.controller.ts`, invite controllers, `iam-team`, access reviews.

## Auth / account

- `backend/src/modules/auth/*` — login, refresh, logout, password reset
- Account self-service — separate from MA

## Activity / audit

- `activity-log` module — MA audit export tab in Security & Access (`useSecurityAuditLogs`)

## Alternate entrypoints

- Legacy `admin/users` — used by dead `App.tsx` paths
- Organization onboarding atomic create — Organizations P4 (initial admin membership)