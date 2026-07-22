# IAM Data Retention & Data Subject Rights — Runbook

## Purpose

Operational guide for configurable IAM data retention, legal holds, DSAR exports, and global user pseudonymization. Policies are **technically enforceable** but require **organizational approval** before activation — no legal conclusions are embedded in defaults.

## Feature flags

| Variable | Default | Meaning |
|----------|---------|---------|
| `IAM_DATA_RETENTION_ENABLED` | `false` | Master switch for retention worker |
| `IAM_DATA_RETENTION_DRY_RUN` | `true` | When enabled, worker reports candidates without mutating |
| `IAM_DATA_RETENTION_BATCH_SIZE` | `500` | Rows per batch |
| `IAM_DATA_RETENTION_MAX_BATCHES` | `50` | Max batches per category per run |
| `IAM_DATA_RETENTION_MAX_RETRIES` | `3` | Per-category retry attempts |
| `IAM_DATA_RETENTION_SESSION_GRACE_DAYS` | `7` | Extra grace after session expiry |
| `IAM_DATA_RETENTION_INVITE_DELIVERY_DAYS` | `30` | Delivery metadata cleanup window |
| `IAM_DATA_PSEUDONYMIZATION_SALT` | _(empty)_ | Salt for IP pseudonymization — set in production |

## Data categories

| Category | Default retention | Strategy | Notes |
|----------|-------------------|----------|-------|
| `GLOBAL_USER_PROFILE` | 0 (disabled) | ANONYMIZE | Via explicit deletion workflow only |
| `MEMBERSHIP` | 0 (disabled) | NO_OP | JML lifecycle only |
| `SESSION_REFRESH_TOKEN` | 30d | DELETE | Immediate cleanup eligible |
| `IP_USER_AGENT` | 90d | PSEUDONYMIZE | Requires org override approval |
| `LOGIN_FAILURE` | 90d | DELETE | Requires org override approval |
| `INVITE` | 180d | DELETE | Token hash redaction after revoke |
| `RESET_TOKEN` | 7d | DELETE | Delivery ciphertext cleanup |
| `MFA_DATA` | 0 (disabled) | DELETE | Inactive users only when enabled |
| `AUDIT_LOG` | 0 (disabled) | NO_OP | Separate audit policy |
| `ACCESS_REVIEW` | 0 (disabled) | NO_OP | Governance records |
| `SECURITY_EVENT` | 365d | DELETE | IAM outbox dead-letter rows |

**No unlimited defaults:** categories with `retentionDays: 0` are visibly disabled unless an org override is approved.

## Org policy overrides

1. Create `IamRetentionPolicyOverride` with `enabled: true`, `approvedAt`, and `approvedByUserId`.
2. Verify via `GET /api/v1/organizations/:orgId/iam/data-retention/policies`.
3. Run dry-run before enforcement: `POST .../runs` with `{ "dryRun": true }`.

## Legal holds

- Place: `POST /api/v1/organizations/:orgId/iam/data-retention/legal-holds`
- Release: `DELETE .../legal-holds/:holdId`
- Holds block retention mutations for matching user/org/category.
- All hold actions are audited (`IAM_LEGAL_HOLD_PLACED` / `IAM_LEGAL_HOLD_RELEASED`).

## Retention worker

- **Cron:** daily 04:00 UTC (`IamDataRetentionScheduler`)
- **Manual:** `POST /api/v1/organizations/:orgId/iam/data-retention/runs`
- **Dry run:** default when `IAM_DATA_RETENTION_DRY_RUN=true`
- **Batch limits:** prevents uncontrolled hard deletes
- **Retry:** per-category with exponential backoff
- **Metrics:** `IamDataRetentionMetricsService.snapshot()`
- **Audit:** `IamRetentionRunLog` per phase + `IAM_RETENTION_RUN_COMPLETED` for API runs

## DSAR export

- Endpoint: `GET /api/v1/organizations/:orgId/iam/data-retention/dsar/export/:userId`
- **Step-up required:** `PRIVACY_DATA_EXPORT`
- **Tenant-scoped:** subject must have membership in requesting org
- **No cross-tenant data:** export payload includes only org-scoped rows
- **Audited:** `IAM_DSAR_EXPORT_REQUESTED` via transactional outbox
- **Idempotency:** `?idempotencyKey=` query param

## Global user deletion

1. Assess: `GET .../users/:userId/deletion-assessment`
2. Execute: `POST .../users/:userId/delete` (step-up required)

Assessment checks:
- Active memberships across orgs
- `customerDocument` references
- Legal holds

**Pseudonymization** is used when hard delete is unsafe; global identity is distinguished from org membership.

## Incident response

| Symptom | Action |
|---------|--------|
| Unexpected deletions | Set `IAM_DATA_RETENTION_ENABLED=false`, redeploy |
| Legal hold needed | Place hold before any retention run |
| Export leak concern | Review `IamDsarExportLog` + audit outbox |
| Worker errors | Check `IamRetentionRunLog.errorMessage` |

## Verification

```bash
cd backend && npm test -- iam-data-retention.security.spec
```

## Related docs

- `architecture/IAM_DATA_RETENTION_2026-07-21.md`
- `docs/audits/iam-data-retention-2026-07.md`
