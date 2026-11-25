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

## Implementation summary

1. **`MasterAdminAuditDeliveryService`** — primary `activity_log` persist (throws on failure path); on failure enqueues **IAM audit outbox** when `recoveryOrganizationId` is known; otherwise writes **`MASTER_PRIVILEGED_AUDIT_DELIVERY_FAILED`** diagnostic; structured logs + `iamMetrics.recordAuditOutboxFailed`.
2. **`IamAuditOutboxProcessorService`** — routes `MASTER_ADMIN_AUDIT_DELIVERY` events to delivery replay (idempotent processed state).
3. **`SecurityGovernanceSessionAuditService`** — uses delivery with deterministic idempotency keys per correlation/action/target/outcome.
4. **HTTP tests** — harness fix + `security-governance-session-revoke.http-security.integration.spec.ts` (real `MasterAdminMfaGuard` / `StepUpGuard`).

## PostgreSQL proof (optional)

```bash
USR_P1A_SESSION_AUDIT_PG=1 DATABASE_URL=postgresql://...@127.0.0.1/..._test \
  npm test -- --testPathPatterns=master-admin-audit-delivery.postgres.integration.spec --runInBand
```

Disposable DB name must match project guard (`test|disposable|ci|local|dev|seal|pg03|p3b0`).

## Non-goals preserved

No JWT/R-008 fix, no MFA flag arm, no deploy, no central user CRUD, no schema migration.