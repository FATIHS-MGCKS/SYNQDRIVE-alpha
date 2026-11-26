# USR-P2B — Atomic security mutations

**Operation:** `SYNQDRIVE_MASTER_USERS_P2B_FOCUSED_CLOSEOUT`  
**PR:** #2534  
**Scope:** Ephemeral PostgreSQL + backend IAM mutation paths (no production)

## P2-R20 — lock hierarchy

- Helper: `backend/src/modules/auth/iam-security-mutation-concurrency.ts` (`acquireCanonicalSecurityMutationLocks`)
- Order: sorted org advisories (913105) → sorted user advisories (913104) → row mutations / authoritative invalidation
- Wired before conflicting row updates in: `AccountService.changePassword`, `PasswordResetService.confirmReset`, `IamMfaResetService`, `OrganizationRoleChangeService`, `IamMembershipLifecycleService`, `UsersService.changePasswordAdmin`, and related mutation paths
- `enqueueInTransactionWithAuthoritativeInvalidation` acquires canonical fences before enqueue/apply

**P2-R20 (admin password):** `UsersService.changePasswordAdmin` uses canonical locks, authoritative invalidation in one transaction, and `processIntents` post-commit. Covered by PostgreSQL shard `ADMIN changePasswordAdmin`.

## P2-R21 — operation idempotency & multi-scope identity

- `buildScopedRevocationIdempotencyKey`: explicit caller keys always gain `:${scope}`; generated keys include scope
- Legacy single-scope intents without suffix remain readable; enqueue skips re-apply when `authoritativeAppliedInCommit` is already set for that scope
- Per-scope `revokedTokenCount` and metadata preserved on partial replays
- High-risk reuse emits distinct `TOKEN_FAMILY` and `USER_ALL_SESSIONS` intents (shard `multi-scope high-risk`)

## P2B PostgreSQL matrix (14 shards)

Suite: `backend/src/modules/users/usr-p2b-atomic-security-mutations.postgres.integration.spec.ts`  
Gate: `usr-p2-postgres-gate.sh` runs **sharded** jest invocations (`run_jest_heavy`, 8 GiB heap per shard) to avoid single-process OOM.

| ID | Name | Status |
|----|------|--------|
| B01 | AccountService password change + blocked processIntents | PASS |
| B02 | Fresh login preserved after deferred processIntents | PASS |
| B03 | Distinct password operations / mutation keys | PASS |
| B04 | Same-operation replay preserves fresh session | PASS |
| B05 | Concurrent same-operation replay (dual `PrismaClient`) | PASS |
| B06 | Transaction rollback — no partial mutation | PASS |
| B07 | Password reset confirm + pre-intent invalidation | PASS |
| B08 | MFA reset + MASTER_ADMIN pending invalidation | PASS |
| B09 | Membership suspend org-scoped isolation | PASS |
| B10a | Password change vs concurrent refresh | PASS |
| B10b | MFA reset vs concurrent refresh | PASS |
| B10c | Membership suspend vs concurrent refresh | PASS |
| ADMIN | `changePasswordAdmin` atomic invalidation + intent | PASS |
| MS | Multi-scope high-risk distinct intents | PASS |

## Gate evidence

Local disposable gate (2026-11-26, Europe/Berlin): **66** PostgreSQL tests (`USR_P2_PG_EXECUTED=1`) — P2A/P2 prior suites plus **14** P2B shards and P1A certification.

**R-008** remains **OPEN** (broader IAM acceptance). **P2C** race matrix not started. **P2D** full TOTP/recovery login matrix not started.