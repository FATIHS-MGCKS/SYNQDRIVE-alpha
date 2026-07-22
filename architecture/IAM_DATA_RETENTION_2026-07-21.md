# IAM Data Retention & Data Subject Rights (2026-07-21)

## Summary

Prompt 20 adds **configurable IAM data retention**, **legal holds**, **DSAR exports**, and **global user pseudonymization**. Policies are org-overridable; defaults are conservative (most categories disabled at `retentionDays: 0`).

## Data model

| Model | Purpose |
|-------|---------|
| `IamRetentionPolicyOverride` | Org-scoped retention/strategy per `IamDataCategory` |
| `IamLegalHold` | Blocks retention mutations for user/org/category |
| `IamRetentionRunLog` | Per-phase retention run audit |
| `IamDsarExportLog` | DSAR export request log with idempotency |

### Categories (`IamDataCategory`)

`GLOBAL_USER_PROFILE` | `MEMBERSHIP` | `SESSION_REFRESH_TOKEN` | `IP_USER_AGENT` | `LOGIN_FAILURE` | `INVITE` | `RESET_TOKEN` | `MFA_DATA` | `AUDIT_LOG` | `ACCESS_REVIEW` | `SECURITY_EVENT`

### Strategies (`IamRetentionStrategy`)

`DELETE` | `ANONYMIZE` | `PSEUDONYMIZE` | `NO_OP`

## Worker architecture

```
IamDataRetentionScheduler (cron 04:00)
  └─ IamDataRetentionWorkerService.run()
       ├─ resolveRetentionPolicies(orgId?)
       ├─ per-category phases (batch + retry)
       ├─ IamLegalHoldService.isBlocked() gate
       ├─ IamRetentionRunLog per phase
       └─ IamDataRetentionMetricsService counters
```

Phases implemented:
- Sessions: delete expired refresh tokens (+ grace days)
- Invites: redact revoked token hashes; clear delivery ciphertext
- Reset tokens: clear password-reset delivery metadata
- IP/UA: pseudonymize on sessions + activity logs
- Login failures: delete `AUTH_FAIL` activity rows
- Security events: delete IAM audit outbox dead-letter rows
- MFA: remove factors for long-inactive users (when policy enabled)

**Master switch:** `IAM_DATA_RETENTION_ENABLED` (default `false`)  
**Dry run:** `IAM_DATA_RETENTION_DRY_RUN` (default `true`)

## DSAR export

`IamDsarExportService.exportUserData()`:
- Membership gate (org-scoped)
- Structured JSON payload (profile, membership, sessions count, activity, invites, MFA metadata, access reviews)
- No secrets (MFA secrets excluded)
- Transactional audit via `IamAuditService`
- Step-up: `PRIVACY_DATA_EXPORT`

## Global user deletion

`IamUserDeletionService`:
- `assessGlobalDeletion()` — cross-org dependency check
- `pseudonymizeGlobalUser()` — pseudonymize identity, revoke sessions, clear MFA
- Distinguishes global identity from org memberships

## API surface

`GET/POST /api/v1/organizations/:orgId/iam/data-retention/*`

Controllers: `IamDataRetentionController`  
Module: `IamDataRetentionModule`

## Audit actions

- `IAM_DSAR_EXPORT_REQUESTED`
- `IAM_USER_PSEUDONYMIZED`
- `IAM_RETENTION_RUN_COMPLETED`
- `IAM_LEGAL_HOLD_PLACED`
- `IAM_LEGAL_HOLD_RELEASED`

## Tests

`iam-data-retention.security.spec.ts` — dry run, legal hold, session/invite retention, IP pseudonymization, DSAR cross-tenant, global deletion dependencies, audit.
