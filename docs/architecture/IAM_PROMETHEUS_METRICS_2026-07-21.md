# IAM Prometheus metrics (2026-07-21)

Low-cardinality operational metrics for Identity & Access Management. Registered via `IamObservabilityModule` on the shared Prometheus registry (`GET /api/v1/metrics`).

**Rule:** No `userId`, `organizationId`, `membershipId`, `inviteId`, or token values in labels.

## Counter catalog

| Metric | Labels | Emitted from |
|--------|--------|--------------|
| `iam_login_success_total` | `method` | `AuthController.login` |
| `iam_login_failure_total` | `reason` | `AuthController.login` |
| `iam_session_created_total` | `source` | `RefreshTokenService` |
| `iam_session_revoked_total` | `scope` | `RefreshTokenService` |
| `iam_session_reuse_detected_total` | — | `RefreshTokenService.rotate` |
| `iam_membership_lifecycle_total` | `action`, `outcome` | Lifecycle service (reserved) |
| `iam_role_change_total` | `action` | Role service (reserved) |
| `iam_permission_change_total` | `action` | Users service (reserved) |
| `iam_effective_access_denied_total` | `module`, `level` | `PermissionsGuard` |
| `iam_invite_total` | `action`, `outcome` | Invite service (reserved) |
| `iam_invite_delivery_failed_total` | `reason` | `InviteEmailDeliveryService` |
| `iam_password_reset_total` | `action`, `outcome` | Account/auth (reserved) |
| `iam_mfa_challenge_total` | `action`, `outcome` | MFA service (reserved) |
| `iam_step_up_denied_total` | `reason` | `StepUpGuard` |
| `iam_audit_outbox_failed_total` | `event_type` | `IamAuditOutboxProcessorService` |
| `iam_audit_dead_letter_total` | `event_type` | `IamAuditOutboxProcessorService` |
| `iam_cross_tenant_denial_total` | `source` | `OrgScopingGuard` |
| `iam_retention_job_failed_total` | `phase` | `IamDataRetentionWorkerService` |

## Gauge catalog

| Metric | Refresh | Purpose |
|--------|---------|---------|
| `iam_access_review_overdue_total` | 5m cron | Active campaigns past `dueAt` |
| `iam_seed_admin_enabled` | 5m cron + boot | 1 when `ENABLE_SEED_ADMIN=true` |
| `iam_organizations_without_admin_total` | 5m cron | Orgs with zero active ORG_ADMIN |

## Alerts

Defined in `backend/monitoring/prometheus/alerts.yml` group `synqdrive_iam`. See `docs/runbooks/iam-incident-and-access-revocation.md` for response procedures.

## Files

| Path | Role |
|------|------|
| `backend/src/modules/iam-observability/iam-metrics.service.ts` | Counter/gauge definitions |
| `backend/src/modules/iam-observability/iam-metrics-refresh.service.ts` | Periodic gauge refresh |
| `backend/src/modules/iam-observability/iam-observability.module.ts` | Global Nest module |

## Tests

```bash
cd backend && npm test -- --testPathPattern=iam-metrics
```
