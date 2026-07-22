# IAM — Central Session Invalidation Policy (2026-07-21)

## Changes

- `IamSessionPolicyService` centralizes session revocation for all critical IAM events.
- `iam_session_revocation_intents` outbox couples IAM mutations to revocation intents in the same DB transaction.
- Scopes: `CURRENT_SESSION`, `USER_ALL_SESSIONS`, `ORGANIZATION_MEMBERSHIP_SESSIONS`, `TOKEN_FAMILY`, `PRIVILEGED_SESSIONS`, `NO_IMMEDIATE_REVOCATION`.
- `User.sessionVersion` + `OrganizationMembership.membershipVersion` + JWT claims prepared for server-side access-token invalidation before JWT exp.
- `RefreshToken` rows store `organizationId`, `membershipId`, version snapshots, `privilegedSession`.
- Wired into: `UsersService` (suspend/remove/role/permissions/station), `AccountService` (password change), `RefreshTokenService` (reuse detection).

## Architektur

### Separation of concerns

| Layer | Responsibility |
|-------|----------------|
| Policy (`iam-session-invalidation.policy.ts`) | Deterministic scope per event |
| Intent (`IamSessionPolicyService.enqueueInTransaction`) | Durable, idempotent revocation intent in IAM transaction |
| Execution (`executeIntent`) | Refresh-token revocation + version bumps |
| Audit (`UserAccessAuditService`) | `SESSION_INVALIDATION_EXECUTED` |
| Notification (`IamSessionNotificationService`) | Decoupled stub for email/push (later prompt) |

### Policy matrix

| Event | Scope |
|-------|-------|
| PASSWORD_CHANGED / COMPROMISED | USER_ALL_SESSIONS |
| MEMBERSHIP_SUSPENDED / REMOVED | ORGANIZATION_MEMBERSHIP_SESSIONS |
| ROLE_DOWNGRADED / PERMISSION_REVOKED / STATION_SCOPE_REDUCED | ORGANIZATION_MEMBERSHIP_SESSIONS |
| ROLE_UPGRADED | ORGANIZATION_MEMBERSHIP_SESSIONS |
| MFA_RESET | PRIVILEGED_SESSIONS |
| REFRESH_TOKEN_REUSE_DETECTED | TOKEN_FAMILY (+ USER_ALL_SESSIONS when high risk) |

### Access token residual lifetime

Refresh-token revocation is immediate. Access tokens remain valid until JWT `exp` (`app.jwtExpiresIn`, typically ~15m). Mitigation path: compare JWT `sessionVersion` / `membershipVersion` against DB on guarded routes (enforcement in a later prompt).

### Multi-org

Org-scoped events revoke only `refresh_tokens` with matching `organization_id`. Other org sessions for the same user remain active.
