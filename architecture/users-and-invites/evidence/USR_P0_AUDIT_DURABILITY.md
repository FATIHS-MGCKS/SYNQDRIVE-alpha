# USR_P0-R-002 — Session revocation audit durability

## Confirmed implementation

`SecurityGovernanceSessionAuditService` calls `masterAdminAudit.record(...)` as **fire-and-forget**:

```45:73:backend/src/modules/platform-admin/security-governance-session-audit.service.ts
    void this.masterAdminAudit
      .record({ ... })
      .catch(() => undefined);
```

Revocation **precedes** audit in the controller (`refreshTokens.revokeSessionById` then `sessionAudit.recordSingleSessionRevocation`).

## Contrast: billing delegate (durable)

`PlatformPermissionService.grantMasterBillingWithMandatoryAudit` runs grant + audit in **one Prisma transaction** via `persistPlatformPermissionMandatoryAuditTx` — audit failure rolls back the grant.

## Verdict

| Dimension | Session revoke | Billing grant/revoke |
|-----------|----------------|----------------------|
| Security mutation durability | **Revocation persists** even if audit fails | **Grant/revoke + audit atomic** |
| Accountability durability | **NOT durable** — audit errors swallowed | **Durable** |
| User access impact if audit fails | None (intended) | Mutation rolled back |

## Interceptor coverage

`MasterAdminPrivilegedAuditInterceptor` audits **successful** privileged master HTTP mutations generically; session revoke also uses dedicated `SecurityGovernanceSessionAuditService`. Neither path retries failed audit writes.

## Smallest safe design (audit-only recommendation)

1. Keep revocation succeeding when audit fails (do not block security response).
2. On audit failure: structured error log + metric (no PII) + optional outbox retry (reuse IAM audit outbox pattern if exists).
3. Do **not** use bare `.catch(() => undefined)` without observability.

**Classification:** `CONFIRMED_SECURITY_GAP` (accountability, not authorization bypass) — **USR-P0-R-002** severity **P2**.