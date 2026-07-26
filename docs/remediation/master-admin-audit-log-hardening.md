# Master Admin Remediation — Phase 2A.7: Immutable Audit Log

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** Append-only enforcement, canonical audit envelope, export capability, and remediation of deletion/manipulation paths across SynqDrive audit stores.

---

## 1. Objective

Ensure audit logs are:

| Requirement | Meaning |
|-------------|---------|
| **No deletion** | Rows cannot be removed after insert |
| **No manipulation** | Rows cannot be updated after insert |
| **Append-only** | Only `INSERT` is permitted |
| **Full history** | Prune/retention must not erase audit trails |
| **Structured fields** | Actor, target, tenant, correlation ID, request ID, IP, user agent, before/after diff, timestamps |
| **Exportable** | Master admin can export filtered audit history (JSON/CSV) with MFA step-up |

---

## 2. Audit inventory (pre-remediation)

### 2.1 Primary stores

| Store | Table | Writer | Pre-2A.7 gaps |
|-------|-------|--------|----------------|
| **General audit** | `activity_logs` | `AuditService`, `ActivityLogService`, `MasterAdminAuditService` | No DB immutability; IAM retention updated/deleted rows; `pruneMasterData` wiped table |
| **Billing audit** | `billing_audit_logs` | `BillingAuditService` | `beforeJson`/`afterJson` present; deleted by prune; no DB immutability |
| **IAM outbox** | `iam_audit_outbox` | `IamAuditService` | Separate pipeline; dead-letter retention still applies |
| **Voice protection** | `voice_protection_audit_events` | `VoiceProtectionAuditService` | Domain-specific; not covered by this phase |
| **Workflow audit** | `workflow_audit_events` | `WorkflowAuditService` | Domain-specific retention policies |
| **Notification audit** | `notification_audit_events` | `NotificationAuditService` | Domain-specific retention policies |
| **Business audit** | `business_audit_outbox` | `BusinessAuditOutboxRepository` | Outbox pattern; separate retention |
| **Station domain** | In-memory / service | `StationDomainAuditService` | Not persisted to `activity_logs` |
| **Pickup gate** | `booking_pickup_gate_audit` | Dedicated table | Already append-only at migration level |

### 2.2 Deletion / manipulation paths found

| Path | Operation | Impact |
|------|-----------|--------|
| `platform-admin.service.ts#pruneMasterData` | `activityLog.deleteMany`, `billingAuditLog.deleteMany` | **Removed** — audit history preserved after prune |
| `prisma/prune-master-data.ts` | Same as above (CLI twin) | **Removed** |
| `iam-data-retention-worker#phaseIpUserAgent` | `activityLog.update` (IP/UA pseudonymize) | **Removed** — activity logs excluded |
| `iam-data-retention-worker#phaseLoginFailures` | `activityLog.deleteMany` (AUTH_FAIL) | **Disabled** — append-only retention |

### 2.3 Field coverage matrix (before → after)

| Field | `activity_logs` before | After 2A.7 |
|-------|------------------------|------------|
| Actor | `userId` column | `metaJson.actor` + legacy `actorUserId` |
| Target | `entity`, `entityId` | `metaJson.target` |
| Tenant | `organizationId` | `metaJson.tenant.organizationId` |
| Correlation ID | Optional flat `metaJson.correlationId` | `metaJson.trace.correlationId` |
| Request ID | Sometimes duplicated | `metaJson.trace.requestId` |
| IP | `ipAddress` column | Column + `metaJson.network.ipAddress` |
| User agent | `userAgent` column | Column + `metaJson.network.userAgent` |
| Before/after | Inconsistent / missing | `metaJson.diff.before` / `diff.after` |
| Timestamp | `createdAt` | `createdAt` + `metaJson.recordedAt` |

---

## 3. Implementation

### 3.1 Database append-only triggers

Migration `20260726180000_activity_audit_log_append_only`:

- Function `audit_deny_row_mutation()` raises on `UPDATE` or `DELETE`
- Triggers on `activity_logs` and `billing_audit_logs`
- Pattern aligned with existing billing ledger append-only guards

### 3.2 Canonical audit envelope

`backend/src/modules/activity-log/audit-envelope.util.ts`:

```typescript
metaJson: {
  auditDomain, auditAction,
  actor: { userId, platformRole, permissions },
  target: { organizationId, entityType, entityId },
  tenant: { organizationId },
  trace: { correlationId, requestId },
  network: { ipAddress, userAgent },
  diff: { before, after, changeSummary },
  recordedAt,
  // legacy flat fields preserved for backward-compatible queries
}
```

Used by:

- `AuditService.record()` — all general audit writes
- `MasterAdminAuditService.record()` — privileged master-admin events
- `normalizeActivityLogForExport()` — export normalization (legacy rows supported)

### 3.3 Privileged HTTP diff capture

`MasterAdminPrivilegedAuditInterceptor` now stores sanitized request body as `diff.after` (`before: null` at HTTP layer). Entity-level before/after still requires service-level audit (e.g. `BillingAuditLog.beforeJson`).

Sensitive keys (`password`, `token`, `secret`, …) are redacted via `sanitizePrivilegedAuditPayload()`.

### 3.4 Export API

| Endpoint | Auth | MFA |
|----------|------|-----|
| `GET /api/v1/admin/activity-log/export` | `MASTER_ADMIN` | `MASTER_AUDIT_EXPORT` step-up |

Query parameters:

- `format=json|csv` (default `json`)
- `organizationId`, `entity`, `action`, `level`, `auditDomain`
- `from`, `to` (ISO date filters on `createdAt`)
- `limit` (default 10 000, max 50 000)

Response headers:

- `Content-Type`, `Content-Disposition` (attachment)
- `X-Export-Row-Count`

Each export is itself audited (`AUDIT_EXPORT` action).

### 3.5 IAM retention alignment

| Category | Previous behavior | 2A.7 behavior |
|----------|-------------------|---------------|
| `IP_USER_AGENT` | Pseudonymized `activity_logs` IP/UA | Refresh tokens only |
| `LOGIN_FAILURE` | Deleted old `AUTH_FAIL` rows | No-op (append-only) |
| `AUDIT_LOG` | Already `NO_OP` | Documented as append-only |

### 3.6 Prune behavior

`pruneMasterData` no longer deletes `activity_logs` or `billing_audit_logs`. Orgs/users may be removed but audit rows remain (FK `onDelete: SetNull` preserves history with nullable org reference).

---

## 4. Verification checklist

| Check | Method |
|-------|--------|
| UPDATE blocked | `UPDATE activity_logs SET description = 'x' WHERE id = …` → exception |
| DELETE blocked | `DELETE FROM activity_logs WHERE id = …` → exception |
| Prune preserves logs | Run prune → `activity_logs` count unchanged |
| Export JSON | `GET /admin/activity-log/export?format=json&auditDomain=MASTER_ADMIN` |
| Export CSV | `GET /admin/activity-log/export?format=csv` |
| MFA on export | Without step-up → `403 STEP_UP_REQUIRED` |
| Envelope fields | Inspect `metaJson.actor`, `trace`, `diff` on new privileged mutations |

---

## 5. Files changed

| File | Change |
|------|--------|
| `backend/prisma/migrations/20260726180000_activity_audit_log_append_only/migration.sql` | DB triggers |
| `backend/src/modules/activity-log/audit-envelope.util.ts` | Canonical envelope + export normalizer |
| `backend/src/modules/activity-log/activity-log-export.service.ts` | Export logic |
| `backend/src/modules/activity-log/activity-log.controller.ts` | Export endpoint |
| `backend/src/modules/activity-log/audit.service.ts` | Envelope on all writes |
| `backend/src/modules/activity-log/master-admin-audit.service.ts` | Envelope + before/after |
| `backend/src/shared/interceptors/master-admin-privileged-audit.interceptor.ts` | Request body as `diff.after` |
| `backend/src/shared/auth/master-admin-mfa.guard.ts` | Sensitive read MFA (`MASTER_AUDIT_EXPORT`) |
| `backend/src/modules/iam-mfa/iam-mfa.policy.ts` | `MASTER_AUDIT_EXPORT` action |
| `backend/src/modules/iam-data-retention/iam-data-retention-worker.service.ts` | Stop mutating activity logs |
| `backend/src/modules/platform-admin/platform-admin.service.ts` | Remove audit deletion from prune |
| `backend/prisma/prune-master-data.ts` | CLI prune aligned |

---

## 6. Remaining scope (not in 2A.7)

| Item | Notes |
|------|-------|
| Domain-specific audit tables | workflow, notification, voice — separate retention; not unified in `activity_logs` |
| Billing audit read API | `billing_audit_logs` export could be added in a follow-up |
| Cold storage / archival | Long-term retention sizing not addressed |
| Entity-level `before` capture | Requires per-service hooks beyond HTTP interceptor |

---

## 7. Rollout

1. Deploy migration `20260726180000_activity_audit_log_append_only`
2. No env flag required — enforcement is DB-level + application path removal
3. Master admin export requires `IAM_MFA_MASTER_ADMIN_ENABLED=true` (from 2A.5) for MFA gate

---

**Changes / Architektur:** Not updated (remediation doc only; no Synqdrive Code doc sync in this phase).
