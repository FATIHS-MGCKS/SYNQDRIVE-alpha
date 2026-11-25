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

## Implementation summary (closeout)

1. **`master_admin_audit_outbox` + `master_admin_audit_delivery_ledger`** — platform-scoped durable intent (no tenant FK, survives org delete).
2. **`MasterAdminAuditDeliveryService.commitAuditIntent`** — awaited after revocation; enqueue platform outbox then atomic deliver (`ledger` + `activity_log` + outbox `PROCESSED` in one transaction).
3. **`MasterAdminAuditOutboxProcessorService`** — worker delivery, bounded `errorCode`, preserves `occurredAt`.
4. **IAM misroute fail-closed** — `MASTER_ADMIN_AUDIT_DELIVERY` in `iam_audit_outbox` never recorded as tenant user audit.
5. **Privacy** — `master-admin-audit-privacy.util.ts` allowlist + sensitive value rejection.
6. **HTTP** — harness 5/5; real-guard with action-bound step-up characterization.

## PostgreSQL certification (executed)

```bash
USR_P1A_SESSION_AUDIT_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> \
  npm test -- --testPathPatterns=usr-p1a-session-audit-certification --runInBand
```

**13/13 cases** in `usr-p1a-session-audit-certification.postgres.integration.spec.ts` (PG01–PG13). Preflight: `assertMasterAdminAuditDisposablePostgresPreflight()`.

## Schema

Migration `20261125103000_master_admin_audit_outbox` — validated on disposable DB via `prisma migrate deploy` (not production).

## Non-goals preserved

No JWT/R-008 fix, no MFA flag arm, no deploy, no central user CRUD, no schema migration.