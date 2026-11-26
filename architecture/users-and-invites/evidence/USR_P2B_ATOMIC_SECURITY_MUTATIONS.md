# USR-P2B — Atomic security mutations

**Operation:** `SYNQDRIVE_MASTER_USERS_P2B_ATOMIC_SECURITY_MUTATIONS`  
**PR:** #2534  
**Scope:** Ephemeral PostgreSQL + backend IAM mutation paths (no production)

## P2-R20 — lock hierarchy

- Helper: `backend/src/modules/auth/iam-security-mutation-concurrency.ts` (`acquireCanonicalSecurityMutationLocks`)
- Order: sorted org advisories (913105) → sorted user advisories (913104) → row mutations / authoritative invalidation
- Wired before conflicting row updates in: `AccountService.changePassword`, `PasswordResetService.confirmReset`, `IamMfaResetService`, `OrganizationRoleChangeService.applyRoleChange`, `RoleAssignmentDriftReconciliationService`, `IamMembershipLifecycleService` (move/remove/leaver), `IamUserDeletionService`
- `enqueueInTransactionWithAuthoritativeInvalidation` acquires canonical fences before enqueue/apply

**Residual (documented):** `UsersService.changePasswordAdmin` still single-table update without session policy — not P2B matrix scope.

## P2-R21 — operation idempotency

- Authoritative enqueue skips re-invalidation when existing intent metadata has `authoritativeAppliedInCommit: true`
- Server-side `mutationVersion` resolved from impending `sessionVersion` / `securityVersion` / `membershipVersion` when caller omits explicit identity
- `distinct` password changes no longer share `mutationVersion=0` dedupe keys

## P2B PostgreSQL matrix (8 tests)

Suite: `backend/src/modules/users/usr-p2b-atomic-security-mutations.postgres.integration.spec.ts`  
Gate: `USR_P2B_ATOMIC_SECURITY_PG=1` in `usr-p2-postgres-gate.sh`

| ID | Name | Status |
|----|------|--------|
| B01 | AccountService password change + blocked processIntents | PASS |
| B02 | Fresh login preserved after deferred processIntents | PASS |
| B03 | Distinct password operations / mutation keys | PASS |
| B04 | Same-operation replay without version re-bump | PASS |
| B05 | Concurrent same-operation replay (dual connection) | NOT_EXECUTED (deferred P2C) |
| B06 | Transaction rollback — no partial mutation | PASS |
| B07 | Password reset confirm atomicity | PASS |
| B08 | MFA reset + stale MFA pending denial | PASS |
| B09 | Membership suspend org-scoped isolation | PASS |
| B10 | Deterministic lock-order barriers vs refresh | NOT_EXECUTED (covered partially by `usr-p2-session-concurrency`) |

## Gate evidence

Local disposable gate (2026-11-26): **60/60** PostgreSQL tests (`USR_P2_PG_EXECUTED=1`), incl. **8** P2B + prior P2A/P2 suites.

R-008 remains **OPEN**. P2C race matrix not started.