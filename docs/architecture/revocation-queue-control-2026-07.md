# Revocation Queue & Worker Control (Prompt 27)

**Date:** 2026-07-24  
**Version:** V4.9.810  
**Migration:** `20260724080000_revocation_queue_control`

## Overview

Extends the Revocation Orchestrator with scoped BullMQ cancellation, cron/systemd scheduler pauses, worker checkpoints, downstream partner notifications, and runtime policy-engine verification.

## Queue Strategy

**No blanket queue flush.** Each job is matched by:

- `organizationId` (required)
- Optional `vehicleId`, `processingActivityId`, `enforcementPolicyId`

| Job state | Action |
|-----------|--------|
| `waiting`, `delayed`, `paused` | Removed (idempotent, logged) |
| `active` | Not removed — `CHECKPOINT_REQUIRED` logged; worker denies at persist |
| Retry re-enqueue | Blocked by `QueueEnqueueGuardService` + deny switch |

All actions append to `data_authorization_revocation_queue_actions` with unique `idempotencyKey`.

### Covered Queues (19)

Telemetry ingest, trip analytics, health derive, notifications, AI jobs, documents, partner webhooks, provider sync, batch analytics, task automation, connectivity — see `revocation-queue-catalog.ts`.

## Worker Checkpoints

`WorkerRevocationCheckpointService.assertMayProceed()` runs before:

- `PRE_PERSIST` — database/ClickHouse writes
- `PRE_EXTERNAL` — partner/export egress
- `PRE_ENQUEUE` — scheduler-driven enqueue

Checks:

1. Worker policy engine version (`WORKER_POLICY_ENGINE_VERSION`)
2. Deny switch (re-evaluated, not cached decision)
3. Tenant vehicle scope

Wired in `DimoSnapshotProcessor` (reference implementation for other workers).

## Downstream Process

`DownstreamRevocationNotifyService`:

- Persists to `data_authorization_downstream_revocation_notifies`
- Audit outbox dispatch
- Status: PENDING → DELIVERED | FAILED | DEAD_LETTER
- Manual retry via `retryDeadLetter()`

Partner step in orchestrator uses this service instead of fire-and-forget audit only.

## Cron / systemd Schedulers

`ScheduledJobRevocationService.pauseSchedulersForOrganization()` writes pause tokens to `data_authorization_scheduled_job_pauses`.

Schedulers check via `QueueEnqueueGuardService.mayEnqueue()` — wired in `DimoSnapshotScheduler`.

## Runtime Verification

`WorkerRuntimeHealthService`:

- Workers register `WORKER_POLICY_ENGINE_VERSION` on boot (`WorkerRuntimeHealthBootstrapService`)
- `isWorkerCompliant()` blocks checkpoint if version mismatch
- `snapshot()` for ops health

`RuntimeStatusRegistry` extended with `policyEngineVersion`.

## Test Results

```bash
cd backend && npm run test:data-auth:revocation-queues
```

| Scenario | Result |
|----------|--------|
| Waiting job | Checkpoint DENY |
| Running job | Checkpoint DENY at PRE_PERSIST |
| Retry | Enqueue guard DENY |
| Backfill | Scheduler pause blocks enqueue |
| AI job | Catalog includes document.extraction, dtc.knowledge |
| Partner webhooks | Downstream notify idempotent |
| Foreign tenant | ORG_SCOPE_MISMATCH |
| Queue restart | Scheduler pause respected |
| Old worker | WORKER_POLICY_ENGINE_OUTDATED |
| Delayed job | Enqueue guard with scheduler key |

## Architecture Flow

```
RevocationOrchestrator
  → deny_switch (sync)
  → cancel_queues
      → ScheduledJobRevocationService.pauseSchedulers
      → RevocationQueueControlService.cancelScopedJobs
      → notification/external outbox suppression
  → notify_partner
      → DownstreamRevocationNotifyService
  → verify

Workers (ongoing)
  → WorkerRevocationCheckpointService (PRE_PERSIST)
  → TelemetryIngestionEnforcementService (existing)
```
