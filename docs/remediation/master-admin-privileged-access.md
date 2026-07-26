# Master Admin Remediation — Phase 2A.6: Privileged Access Audit

**Date:** 2026-07-26  
**Status:** Implemented (structured audit layer)  
**Scope:** Full traceability for master-admin privileged mutations — permission, MFA, audit, reason, tenant context, actor, timestamp, correlation ID.

---

## 1. Objective

Every **privileged master-admin mutation** must be traceable with:

| Dimension | Requirement |
|-----------|-------------|
| **Permission** | Actor role / `master-billing` permission recorded |
| **MFA** | Step-up action + assurance level + whether MFA was used |
| **Audit log** | Structured `ActivityLog` entry (`entity: ADMIN_OPERATION`) |
| **Reason code** | Human-readable reason for destructive actions |
| **Tenant context** | `targetOrganizationId` when action affects a tenant |
| **Actor** | `actorUserId` + platform role |
| **Timestamp** | `ActivityLog.createdAt` + `metaJson.recordedAt` |
| **Correlation ID** | `req.requestId` / `X-Request-Id` / `X-Correlation-Id` |

Normal tenant users are **unchanged** — interceptor only activates on `/api/v1/admin/*` and master-billing privileged routes.

---

## 2. Pre-remediation analysis

### 2.1 Audit mechanisms (before)

| Mechanism | Coverage | Gaps |
|-----------|----------|------|
| `AuditInterceptor` (global) | All HTTP mutations | Generic description, no reason/MFA/correlation, wrong entity for `/admin/*` |
| `AuditService.record` (manual) | Platform-admin, email settings | Partial — no correlation ID, inconsistent tenant context |
| `BillingAuditService` | Billing/subscription commands | Separate `billing_audit_logs` table; `requestId` not wired from HTTP |
| `VoiceProtectionAuditService` | Voice suspend/replay | Separate table; reason supported |
| `UserAccessAuditService` | Org-scoped IAM only | **Not** used for `admin/users` platform routes |
| `MasterAdminMfaGuard` | MFA enforcement | No audit trail on grant/deny |

### 2.2 Master-admin mutating surface (~115 endpoints)

| Area | Routes | Pre-audit status |
|------|--------|------------------|
| Organizations | 5 | **none** (interceptor only) |
| Platform users | 4 | **none** |
| Billing / subscription | ~38 | **full** (billing audit table; missing HTTP correlation) |
| Platform settings / prune | 8 | **partial** (manual audit) |
| DIMO / HM / voice integrations | ~25 | **none** |
| Prospects / products / parts / insurances | ~21 | **none** |
| Support / vehicles admin | ~14 | **none** |

### 2.3 Traceability matrix (before → after)

| Control | Before | After (2A.6) |
|---------|--------|----------------|
| Permission | JWT `platformRole` only in generic log | `metaJson.actorPlatformRole`, `actorPermissions` |
| MFA | Enforced on subset (2A.5); not logged | `mfaStepUpAction`, `mfaAssuranceLevel`, `mfaStepUpUsed` + MFA grant/deny events |
| Audit | Generic or domain-specific silos | Unified `MASTER_ADMIN` domain in `ActivityLog.metaJson` |
| Reason | Voice/billing only; optional elsewhere | **Required** for DELETE org/user, POST prune, HM vehicle delete |
| Tenant context | Often null for cross-tenant ops | `targetOrganizationId` from route params (`orgId`, `:id`) |
| Actor | `userId` in ActivityLog | `actorUserId` + platform role in metaJson |
| Timestamp | `createdAt` | `createdAt` + `metaJson.recordedAt` |
| Correlation ID | HTTP logs only (`X-Request-Id`) | Propagated to all privileged audit records |

---

## 3. Implementation

### 3.1 `MasterAdminAuditService`

Central structured writer to `activity_logs`:

```typescript
metaJson: {
  auditDomain: 'MASTER_ADMIN',
  auditAction: 'ORG_DELETED' | 'BILLING_MUTATION' | ...,
  correlationId, requestId,
  actorUserId, actorPlatformRole, actorPermissions,
  targetOrganizationId, reasonCode,
  mfaStepUpAction, mfaAssuranceLevel, mfaStepUpUsed,
  permissionGranted, httpMethod, httpStatus, recordedAt
}
```

**Files:**
- `backend/src/modules/activity-log/master-admin-audit.contract.ts`
- `backend/src/modules/activity-log/master-admin-audit.service.ts`
- `backend/src/modules/activity-log/master-admin-audit.policy.ts`
- `backend/src/modules/activity-log/master-admin-audit.util.ts`

### 3.2 `MasterAdminPrivilegedAuditInterceptor`

Global interceptor (registered in `app.module.ts`) for all **mutating** requests where:
- Path matches `/api/v1/admin/`, or
- Actor has `master-billing` permission on billing admin routes

**Behavior:**
1. Validates **reason required** for destructive routes (400 `PRIVILEGED_REASON_REQUIRED` if missing)
2. On HTTP 2xx success → writes structured `MasterAdminAuditService` record
3. Skips generic `AuditInterceptor` duplicate for `/api/v1/admin/` paths

**Reason sources (priority):**
- `body.reason`
- `body.auditReason`
- Header `x-privileged-reason`

### 3.3 MFA step-up audit

`MasterAdminMfaGuard` now logs:
- `MFA_STEP_UP_GRANTED` — valid `x-step-up-token` or fresh session MFA
- `MFA_STEP_UP_DENIED` — missing/expired step-up

Sets `request.masterAdminMfaStepUpUsed` / `masterAdminMfaStepUpAction` for the privileged audit interceptor.

### 3.4 Correlation ID propagation

- `RequestLoggingInterceptor` stamps `req.requestId` + `X-Request-Id` response header
- `AuditService.contextFromRequest()` extended with `correlationId` in `metaJson`
- `MasterSubscriptionController.actor()` now passes `requestId` to billing commands

### 3.5 Destructive actions requiring reason

| Method | Path pattern |
|--------|--------------|
| DELETE | `/api/v1/admin/organizations/:id` |
| DELETE | `/api/v1/admin/users/:id` |
| POST | `/api/v1/admin/prune` |
| DELETE | `/api/v1/admin/high-mobility/**/vehicles/:id` |

---

## 4. Privileged action checklist (post-2A.6)

| Area | Permission | MFA (2A.5) | Structured audit | Reason (destructive) | Tenant | Actor | Timestamp | Correlation |
|------|:----------:|:----------:|:----------------:|:--------------------:|:------:|:-----:|:---------:|:-----------:|
| Organizations | ✅ | ✅ | ✅ | ✅ DELETE | ✅ | ✅ | ✅ | ✅ |
| Platform users | ✅ | ✅ | ✅ | ✅ DELETE | — | ✅ | ✅ | ✅ |
| Billing | ✅ | ✅ | ✅ + billing table | optional | ✅ orgId | ✅ | ✅ | ✅ |
| Subscription | ✅ | ✅ | ✅ + billing table | optional | ✅ | ✅ | ✅ | ✅ |
| Platform settings | ✅ | ✅ | ✅ | optional | — | ✅ | ✅ | ✅ |
| Integrations (DIMO/HM/voice) | ✅ | ✅ | ✅ | ✅ HM delete | ✅ | ✅ | ✅ | ✅ |
| Prospects/products/etc. | ✅ | — | ✅ | optional | varies | ✅ | ✅ | ✅ |

MFA column "—" = guard not yet on all controllers (2A.5 scope); audit still captures MFA when present.

---

## 5. Verification

### Automated tests

```bash
cd backend && npm test -- --testPathPattern="master-admin-audit|master-admin-privileged-audit|master-admin-mfa.guard"
```

### Manual smoke test

```bash
# 1. Destructive without reason → 400
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  https://app.synqdrive.eu/api/v1/admin/organizations/$ORG_ID

# 2. With reason → 200 + ActivityLog entry
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"test tenant decommission"}' \
  https://app.synqdrive.eu/api/v1/admin/organizations/$ORG_ID

# 3. Query activity log
curl -H "Authorization: Bearer $TOKEN" \
  "https://app.synqdrive.eu/api/v1/admin/activity-log?level=CRITICAL"
```

Inspect `metaJson.auditDomain === 'MASTER_ADMIN'` and `correlationId` matches `X-Request-Id` response header.

---

## 6. Files changed

| File | Change |
|------|--------|
| `master-admin-audit.*` | Contract, service, policy, util |
| `master-admin-privileged-audit.interceptor.ts` | Global privileged HTTP audit |
| `audit.interceptor.ts` | Skip `/api/v1/admin/` (avoid duplicates) |
| `audit.service.ts` | Correlation ID in `contextFromRequest` |
| `activity-log.module.ts` | Export `MasterAdminAuditService` |
| `app.module.ts` | Register privileged audit interceptor |
| `master-admin-mfa.guard.ts` | MFA step-up audit + request flags |
| `master-subscription.controller.ts` | Pass `requestId` to billing actor |
| `*.spec.ts` | Policy, service, interceptor tests |

---

## 7. Residual / follow-up

| Item | Priority | Notes |
|------|----------|-------|
| MFA guard on prospects/products/support | P2 | Extend 2A.5 `@RequireMasterAdminMfa` |
| `activity_logs.requestId` column | P3 | Indexed column vs `metaJson` query |
| Billing audit `requestId` wiring in all controllers | P2 | Subscription actor done; extend billing.controller |
| Master admin audit UI filters | P3 | Filter by `metaJson.auditAction`, correlationId |
| `@MasterAdminAudit()` per-endpoint override | P3 | Finer action codes than route derivation |

---

## 8. Rollout

No new env flag required — structured audit is active after deploy.

**Destructive API change:** DELETE org/user and POST prune now require `reason` in body or `x-privileged-reason` header. Update master admin UI/scripts accordingly.

---

**Changes / Architektur:** Not updated — extends existing `AuditService` / `ActivityLog` architecture; billing and voice domain audits preserved.
