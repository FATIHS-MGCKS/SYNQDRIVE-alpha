# USR-P2C — Deterministic concurrency acceptance

**Operation:** `SYNQDRIVE_MASTER_USERS_P2C_CONCURRENCY_AUTHORIZATION`  
**PR:** #2534  
**Target:** USR-P0-R-008 — P2C scope **PASS**; repository **REMEDIATED_REPO** @ product HEAD `7da011d72` (see [`USR_P2E_FINAL_RESIDUALS.md`](USR_P2E_FINAL_RESIDUALS.md))

## Infrastructure

| Artifact | Role |
|----------|------|
| `backend/src/modules/users/testing/usr-p2-deterministic-concurrency.helper.ts` | Phase barrier (`usr_p2_race_barrier`); **`pg_blocking_pids`** / **`pg_locks`** (advisory class `913104`); `holdUserSessionWriteLockTransaction`; `waitUntilAdvisoryLockWaiters` |
| `usr-p2c-semantic-guard.postgres.integration.spec.ts` | SEMANTIC 07/10/11/12/13 (`USR_P2C_SEMANTIC_GUARD_PG=1`) |
| `backend/src/modules/users/testing/usr-p2-pg-iam-stack.helper.ts` | Real `RefreshTokenService` + `IamSessionPolicyService` wiring (no mocked `recordAndExecute` on reuse path) |
| `usr-p2c-deterministic-race.postgres.integration.spec.ts` | P2C acceptance (`USR_P2C_DETERMINISTIC_RACE_PG=1`) |
| `usr-p2-session-concurrency.postgres.integration.spec.ts` | RACE06, RACE09, RACE10, legacy barrier RACE02 (stack refactor) |

Gate: `usr-p2-postgres-gate.sh` P2C shards (14) + semantic guard spec after P2B.

## Race matrix (executed)

| ID | Evidence | Method |
|----|----------|--------|
| RACE01 | P2C shard | Rotation holds user advisory; revoke **blocked** (`pg_blocking_pids`); release → rotate wins |
| RACE02 | P2C shard | Revoke enqueued before rotate; both wait; revoke commits first → rotate denied |
| RACE03 | P2C | Multi-family + `recordAndExecute` fence |
| RACE04 | P2C | Logout on rotated predecessor |
| RACE05 | P2C | `IamMembershipLifecycleService.suspend` |
| RACE06 | session-concurrency | Concurrent rotate — one winner |
| RACE07 | P2C + session-concurrency | Real reuse → `REFRESH_TOKEN_REUSE_DETECTED` intent |
| RACE08 | P2C | `AccountService.changePassword` vs rotate; lock wait + mutation wins |
| RACE09 | session-concurrency | Family isolation |
| RACE10 | session-concurrency | Multi-org preservation |
| RACE11 | P2C | Org `SUSPENDED` + legacy unscoped deny |
| B05 first-app | P2C | Pre-session + concurrent first-apply; revoked count + replay + fresh rotate |
| B10 lock order | P2C | `changePassword`, MFA reset, `lifecycle.suspend` — mutation before rotate; `pg_blocking_pids` |
| CROSS_REPLICA | P2C | Revoke via stack B; deny on stack A authority |

## P2C verdict (repository)

**P2C_VERDICT=PASS** for deterministic disposable-PostgreSQL concurrency scope defined above.

**Historical:** R-008 was **OPEN** until P2E acceptance — **P2C_VERDICT=PASS** retained; **R-008=REMEDIATED_REPO** at repository level on frozen HEAD `7da011d72`.