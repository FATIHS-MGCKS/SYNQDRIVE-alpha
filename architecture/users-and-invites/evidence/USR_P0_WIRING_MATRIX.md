# USR_P0 — Wiring matrix (Master Admin user operations)

Status: `FULLY_WIRED` | `PARTIALLY_WIRED` | `INCORRECTLY_WIRED` | `UNWIRED` | `UNREACHABLE` | `NOT_IMPLEMENTED` | `NOT_APPLICABLE`

## Security & Access hub — users tab

| Operation | UI | Handler | API client | Endpoint | AuthZ | Service | DB | Audit | Status |
|-----------|----|---------|------------|----------|-------|---------|----|----|--------|
| List users | `SecurityUsersTab` | `useSecurityUsers` | `api.admin.securityAccess.listUsers` | `GET /admin/security/users` | MASTER_ADMIN+MFA guard | `SecurityGovernanceService` | User/Membership join | N/A | **FULLY_WIRED** |
| User detail | `UserDetailDrawer` | hook load | `getUser` | `GET /admin/security/users/:id` | same | same | same | N/A | **FULLY_WIRED** |
| List sessions | drawer | `useSecurityUserSessions` | `listSessions` | `GET .../sessions` | same | `RefreshTokenService` | RefreshToken | N/A | **FULLY_WIRED** |
| Revoke session | drawer | `revokeSession` | POST | `POST .../sessions/:id/revoke` | + StepUp | `RefreshTokenService` | update | `SecurityGovernanceSessionAuditService` | **FULLY_WIRED** |
| Revoke all sessions | drawer | `revokeAllSessions` | POST | `POST .../sessions/revoke-all` | + StepUp | same | same | same | **FULLY_WIRED** |
| MFA reset | drawer | `resetMfa` | POST | `POST .../mfa/reset` | + StepUp | `IamMfaService` | MFA tables | via MFA module | **FULLY_WIRED** |
| Grant master billing | drawer | handler | POST | `POST .../master-billing/grant` | MFA | `PlatformPermissionService` | grant row | mandatory audit | **FULLY_WIRED** |
| Revoke master billing | drawer | handler | POST | `POST .../master-billing/revoke` | MFA | same | same | mandatory audit | **FULLY_WIRED** |
| Create user | — | — | — | — | — | org IAM / legacy admin | — | — | **NOT_IMPLEMENTED** (MA hub) |
| Invite user (platform) | — | — | org invites | `organizationInvites` | org admin | users module | invite | outbox | **NOT_APPLICABLE** (org-scoped) |
| Change org role | org product UI | IAM tab | `api.users` / iam | org routes | org RBAC | users services | membership | audit outbox | **PARTIALLY_WIRED** (not in MA hub) |
| Suspend user (global) | — | — | account/admin | varies | varies | users | UserStatus | activity | **PARTIALLY_WIRED** — verify org vs global paths in org IAM |
| Legacy MA user CRUD | none visible | `App.tsx` handlers | `api.users.*` | `admin/users` | MASTER_ADMIN | platform users | User | ? | **UNREACHABLE** |

## Navigation

| `?view=users` | redirect | `security-access-url.ts` | — | — | — | — | — | — | **FULLY_WIRED** (redirect) |

## File anchors

- UI hub: `frontend/src/master/security-access/SecurityAccessHub.tsx`
- API: `frontend/src/lib/api.ts` (~4149–4204)
- Controller: `backend/src/modules/platform-admin/security-governance.controller.ts`
- Dead path: `frontend/src/master/App.tsx` (~143–415)