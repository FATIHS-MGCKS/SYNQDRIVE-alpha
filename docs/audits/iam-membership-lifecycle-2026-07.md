# IAM membership lifecycle audit (2026-07)

## Central service

`IamMembershipLifecycleService` with `join`, `move`, `previewMove`, `suspend`, `remove`, `reactivate`, and `applyJoinInTransaction`.

## Delegation

- `UsersService`: remove, reactivate, suspend/move via lifecycle
- `InviteAcceptService`: join via `applyJoinInTransaction`
- `createMembership` / `removeMembership`: lifecycle join/remove/reactivate

## Leaver side effects (atomic with membership)

- Refresh token revocation
- Pending invite revocation (by email)
- Org task automation override unassignment
- Ownership conflict detection (open OrgTasks, overrides)

## Acceptance mapping

| Criterion | Implementation |
|-----------|----------------|
| Central lifecycle | IamMembershipLifecycleService |
| Leaver loses org access | REMOVED/SUSPENDED + session revoke |
| Global identity preserved | No user.delete in lifecycle |
| Explicit reactivation | reactivate() requires role assignment |

## Verification

```bash
cd backend && npm test -- --testPathPattern=iam-membership-lifecycle
```
