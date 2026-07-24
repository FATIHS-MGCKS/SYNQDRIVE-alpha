# Persistent Revocation Orchestrator (Prompt 24)

## Overview

`RevocationOrchestratorService` implements a durable, idempotent revocation workflow for data-authorization entities. It replaces ad-hoc cache invalidation with a persisted state machine that survives restarts, supports controlled retries, and separates internal deny-switch from external provider/partner actions.

## Workflow States

| Status | Meaning |
|--------|---------|
| `REVOCATION_REQUESTED` | Workflow record created |
| `DENY_SWITCH_ACTIVE` | Synchronous deny-switch completed (auth cache + GPS caches) |
| `INGESTION_STOPPED` | Ingestion blocked via deny-switch |
| `PROVIDER_ACCESS_REVOKE_PENDING` | External provider revocation in progress |
| `PROVIDER_ACCESS_REVOKED` | Provider consent/grant revoked at platform |
| `QUEUES_CANCELLED` | Pending notification/outbox/BullMQ jobs suppressed |
| `DOWNSTREAM_NOTIFICATION_PENDING` | Partner notification dispatch starting |
| `DOWNSTREAM_NOTIFIED` | Partner/recipient notified (audit marker) |
| `RETENTION_DECISION_PENDING` | Awaiting retention decision |
| `RETENTION_DECIDED` | Retention applied (default `RETAIN`) |
| `DELETION_SCHEDULED` | Only when retention = `DELETE` (no auto-purge) |
| `VERIFICATION_PENDING` | Technical verification starting |
| `REVOCATION_COMPLETE` | All critical steps verified |
| `REVOCATION_FAILED` | Dead-letter after max retries |

## Step Order

1. **deny_switch** (sync on `requestRevocation`) — `AuthorizationDecisionService.invalidateOrganizationCache` + `LiveGpsEnforcementService.invalidateOrgGpsCaches`
2. **stop_ingestion** — ingestion blocked by deny-switch
3. **revoke_provider** — `VehicleProviderConsent` revoke (separate from internal deny)
4. **cancel_queues** — notification delivery outbox, audit outbox, BullMQ jobs for org
5. **notify_partner** — data-sharing recipient audit (partner ≠ provider)
6. **retention_decision** — defaults to `RETAIN`; no automatic data deletion
7. **schedule_deletion** — only when retention = `DELETE`
8. **verify** — mandatory technical verification before `REVOCATION_COMPLETE`

## Idempotency

- Workflow idempotency key: `data-auth-revocation:{orgId}:{triggerType}:{entityId}:{version}`
- Duplicate `requestRevocation` returns existing workflow without re-running deny-switch actions
- `completedSteps` JSON array prevents double-execution of individual steps after restart
- Audit outbox entries use deterministic idempotency keys per correlation

## Retry & Dead Letter

- Config: `REVOCATION_ORCHESTRATOR` — max 8 attempts, 2s base backoff (exponential)
- Scheduler polls every 5s (`DATA_AUTH_REVOCATION_POLL_MS`, disable via `DATA_AUTH_REVOCATION_POLL_ENABLED=false`)
- Stale processing recovery after 180s
- On max attempts → `REVOCATION_FAILED` + `deadLetteredAt` + visible `failureReason` / `stepErrors`
- No silent catch-and-log: failures propagate to workflow status and step events

## Manual Resume

- Permission: `data_processing.revocation_resume` (manage level)
- Endpoint: `POST .../revocation-workflows/:workflowId/resume`
- Resets `REVOCATION_FAILED` to last completed step status
- Optional `retentionDecision`, `resetAttempts`

## Correlation

Workflow records link to:

- `processingActivityId`
- `enforcementPolicyId`
- `consentId`
- `providerGrantId`
- `dataSharingAuthId`
- `legacyOrgAuthId`
- `correlationId` (audit trail)

## Trigger Types

| Trigger | Enqueued from |
|---------|---------------|
| `PROCESSING_ACTIVITY_REVOKED` | `ProcessingActivityLifecycleService.revoke` |
| `ENFORCEMENT_POLICY_REVOKED` | `EnforcementPolicyLifecycleService.revoke` |
| `LEGACY_ORG_AUTH_REVOKED` | `DataAuthorizationsService.revoke` |
| `CONSENT_WITHDRAWN` | `DataSubjectConsentService.withdraw` |
| `PROVIDER_GRANT_REVOKED` | `ProviderAccessGrantService.revoke` |
| `DATA_SHARING_REVOKED` | `DataSharingAuthorizationService.revoke` |

## API

| Method | Path | Permission |
|--------|------|------------|
| GET | `.../revocation-workflows/:workflowId` | `data_processing.revocation_view` |
| POST | `.../revocation-workflows/:workflowId/resume` | `data_processing.revocation_resume` |

## Test Results

```
npm test -- --testPathPattern=revocation-orchestrator
11 passed
```

Scenarios covered:

- Full success (step-by-step)
- Provider error → retry → dead-letter
- Queue cancellation error → retry
- Exponential backoff
- Duplicate revocation (idempotent replay)
- Restart from partial completion
- Manual resume with reset attempts
- Wrong tenant (NotFoundException)
- Expired policy verification
- Synchronous deny-switch on request

## Files

- `backend/src/modules/data-authorizations/revocation-orchestrator/`
- Migration: `20260724050000_data_authorization_revocation_workflow`
