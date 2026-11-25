# USR-P1A — Audit accountability + security test harness

**Operation:** `SYNQDRIVE_MASTER_USERS_P1A_AUDIT_ACCOUNTABILITY_AND_SECURITY_TESTS`  
**Owner policy:** USR-OWN-04  
**Predecessor:** PR #2530 merged on `origin/main` (`270a0b4c2`)

## Findings addressed

| ID | Verdict |
|----|---------|
| USR-P0-F-003 | **REMEDIATED** — Nest DI providers restored in session audit HTTP spec (5/5) |
| USR-P0-R-002 | **REMEDIATED** — fire-and-forget silent swallow replaced with durable delivery service |
| USR-P0-R-008 | **OPEN P1** — no JWT redesign in P1A |

## Implementation summary (closeout + runtime wiring)

1. **`master_admin_audit_outbox` + `master_admin_audit_delivery_ledger`** — platform-scoped durable intent (no tenant FK, survives org delete).
2. **`MasterAdminAuditOutboxSchedulerService`** — 15s cron via `SchedulerLeaderGuardService` (`master_admin_audit_outbox`); in-flight overlap guard; stale `PROCESSING` recovery via processor `processDue`.
3. **Atomic normal path** — `SecurityGovernanceSessionAuditService.revokeTargetSessionWithAtomicAudit` / `revokeAllTargetSessionsWithAtomicAudit` — single DB transaction: revocation + authoritative outbox intent; immediate delivery post-commit; controlled fallback on combined-txn failure.
4. **Delivery atomicity** — `ledger` + `activity_log` + outbox `PROCESSED` in one transaction; status regression guarded (`markRetry` / `markDeadLetter` / `markProcessed` only from eligible states).
5. **Tenant isolation** — master-admin `activity_log` rows are not indexed by `organization_id`; org activity-log query/export exclude `MASTER_ADMIN` audit domain.
6. **Deleted org/actor delivery** — FK-safe persistence (nullable `userId`; historical context in envelope); PG13 defers delivery after org+actor delete.
7. **IAM misroute fail-closed** — unchanged from prior closeout.
8. **Privacy** — `master-admin-audit-privacy.util.ts` allowlist + sensitive value rejection.
9. **HTTP** — harness 5/5; real-guard with action-bound step-up characterization.
10. **Retention** — outbox/ledger retention policy deferred to **USR-P4** bounded follow-up (no new retention framework in P1A).

## PostgreSQL certification (executed)

```bash
USR_P1A_SESSION_AUDIT_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> \
  npm test -- --testPathPatterns=usr-p1a-session-audit-certification --runInBand
```

**13/13 PASS** (executed) on disposable `vo5b_p6c_closeout_test` with migration `20261125103000` applied; uses production orchestration (`SecurityGovernanceSessionAuditService`, `RefreshTokenService`, scheduler). Fault injection: PG03 immediate delivery reject, PG06 transient `persist` fail + scheduler retry. Preflight: `assertMasterAdminAuditDisposablePostgresPreflight()`.

## Schema

Migration `20261125103000_master_admin_audit_outbox` — validated on disposable DB via `prisma migrate deploy` (not production).

## Merge gate (`SYNQDRIVE_MASTER_USERS_P1A_FINAL_MERGE_GATE`)

| Control | Status |
|---------|--------|
| Stale `PROCESSING` recovery CAS (`status=PROCESSING` + `updatedAt < staleBefore`) | **YES** — `recoverStaleProcessing` |
| Immediate delivery uses persisted outbox payload + `occurredAt` | **YES** — `attemptImmediateDelivery(outboxId)` |
| Concurrent enqueue via unique `idempotencyKey` (P2002 → existing row) | **YES** — `enqueueInTransaction` |
| Per-operation server identity (`securityOperationId` → `ma-session-audit:op:<uuid>`) | **YES** — distinct revoke-all admissions; correlation IDs trace-only |
| Concurrent enqueue ON CONFLICT (no aborted-tx P2002 read) | **YES** — `enqueueInTransaction` raw insert |
| Regression PGA–PGF (disposable PG) | **19/19 PASS** incl. PG01–PG13 |
| Ambiguous combined-txn commit fallback (no double revoke / duplicate audit) | **YES** — `fallbackSingleSessionRevocation` + revoke-all catch |
| Master Admin vs tenant query scope | **YES** — `buildMasterAdminAuditWhere` / `buildTenantAuditWhere` + export split |
| Legacy tenant rows (`meta_json` null) visible to org reads | **YES** — `activityLogTenantScopeExcludesMasterAdmin` |
| Revoke-all HTTP `{ revoked: true }` contract | **PRESERVED** — `SecurityGovernanceController` |
| PG01–PG13 (disposable `vo5b_p6c_closeout_test`) | **13/13 PASS** (2026-11-25 CET agent run) |
| ActivityLogModule scheduler registration | **VERIFIED** — boot spec + `scheduler-leader.registry` |
| FSD workflow run `45605127510` attempt 1 | **Flake** — concurrent FSD3 terminalStatus race (`FAILED` vs `COMPLETED`); attempt 2 **green**; unrelated to USR-P1A diff |

**R-002:** **REMEDIATED** (PG + HTTP + fallback guarantees). **R-008:** **OPEN P1**. **R012:** **USR-P3**. **Retention:** **USR-P4**.

## Non-goals preserved

No JWT/R-008 fix, no MFA flag arm, no deploy, no central user CRUD, no schema migration, no merge.