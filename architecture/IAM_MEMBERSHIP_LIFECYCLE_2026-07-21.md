# IAM membership lifecycle (2026-07-21)

## Service

`IamMembershipLifecycleService` — central orchestrator for all membership state transitions.

## Status model

| Status | Meaning |
|--------|---------|
| INVITED | Provisioned, not yet active |
| ACTIVE | Full org access per role/scope |
| SUSPENDED | Access revoked, membership retained |
| OFFBOARDING | Transitional leaver state |
| REMOVED | Org access terminated |
| REACTIVATION_REQUIRED | Explicit reactivation needed |

`membershipVersion` increments on mover/leaver; used for session invalidation signaling.

## Flows

### Joiner
Invite/provisioning → membership create/update → role/scope/MFA flags → audit outbox (atomic) → notification (post-commit).

### Mover
Preview permission gain/loss → apply change → increment version → revoke sessions when access profile changes → audit + notification.

### Leaver
Suspend or remove → revoke refresh tokens → revoke pending invites → clear automation overrides → report ownership conflicts → audit + notification. **Global User is never deleted.**

### Reactivate
Explicit controlled operation with required role/scope assignment — no blind restore of old overrides.

## Transaction boundaries

- Membership mutation + `iam_audit_outbox` in same Prisma transaction
- Notifications via `IamMembershipLifecycleNotificationService` after commit
- Idempotency key on every mutation

## Tests

`backend/src/modules/users/iam-membership-lifecycle.security.spec.ts`
