# Workflow Event Outbox — Operations Runbook (2026-07)

## Overview

The workflow domain event outbox delivers validated domain events from PostgreSQL to `WorkflowEngineService` using the existing BullMQ + Redis worker infrastructure.

**Producer path (Prompt 16):** business transactions call `WorkflowEventOutboxEnqueueService.enqueueInTransaction()` — events remain `PENDING` until the worker dispatches them.

**Consumer path (Prompt 17):** `WorkflowEventOutboxSchedulerService` polls due rows every 30s, enqueues BullMQ jobs on `workflow.event.outbox`, and `WorkflowEventOutboxProcessorService` claims rows with a lease before dispatch.

## Architecture

```
Business TX ──► workflow_event_outbox (PENDING)
                      │
                      ▼
         Cron poll (30s) + stale lease recovery
                      │
                      ▼
              BullMQ workflow.event.outbox
                      │
                      ▼
    Atomic CLAIMED + workerId + leaseExpiresAt
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
  Re-validate envelope      Heartbeat renewLease
  Tenant org exists
         │
         ▼
  WorkflowEngineService.processEvent()
         │
         ▼
      DISPATCHED
```

### Status lifecycle

| Status | Meaning |
|--------|---------|
| `PENDING` | Ready for first dispatch |
| `CLAIMED` | Worker holds lease (`claimedBy`, `leaseExpiresAt`) |
| `DISPATCHED` | Successfully processed |
| `RETRY_SCHEDULED` | Backoff scheduled (`availableAt`) |
| `DEAD_LETTER` | Max attempts or non-retryable error |

### Error classes

| Class | Retry? | Examples |
|-------|--------|----------|
| `retryable` | Yes (until max) | DB timeout, connection reset |
| `permanent` | No | Already dispatched, unsupported manipulation |
| `validation` | No | Unknown event type, invalid payload |
| `tenant_violation` | No | Cross-tenant envelope, missing org |

## Retry parameters (defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKFLOW_EVENT_OUTBOX_MAX_ATTEMPTS` | `8` | Row-level processing attempts |
| `WORKFLOW_EVENT_OUTBOX_BACKOFF_MS` | `30000` | Base exponential backoff |
| `WORKFLOW_EVENT_OUTBOX_MAX_BACKOFF_MS` | `900000` | Backoff cap (15 min) |
| `WORKFLOW_EVENT_OUTBOX_JITTER_MS` | `5000` | Random jitter added to backoff |
| `WORKFLOW_EVENT_OUTBOX_LEASE_MS` | `60000` | Claim lease duration |
| `WORKFLOW_EVENT_OUTBOX_HEARTBEAT_MS` | `15000` | Lease renewal interval |
| `WORKFLOW_EVENT_OUTBOX_POLL_BATCH` | `50` | Rows polled per cron tick |

Backoff formula: `min(maxBackoff, base * 2^(attempt-1)) + random(0, jitter)`.

## Metrics (Prometheus)

| Metric | Type | Labels |
|--------|------|--------|
| `synqdrive_workflow_event_outbox_dispatched_total` | Counter | `event_type` |
| `synqdrive_workflow_event_outbox_failed_total` | Counter | `event_type`, `error_class`, `error_code` |
| `synqdrive_workflow_event_outbox_retry_total` | Counter | `event_type` |
| `synqdrive_workflow_event_outbox_dead_letter_total` | Counter | `event_type` |
| `synqdrive_workflow_event_outbox_queue_lag` | Gauge | — |
| `synqdrive_workflow_event_outbox_processing_duration_seconds` | Histogram | — |

## Structured logs

All worker logs use `workflow.event.outbox.<operation>` with:

- `eventId`, `correlationId`, `organizationId`, `eventType`
- `outboxId`, `workerId`, `attempts` (when applicable)
- `errorClass`, `errorCode` on failures

Payloads and metadata are **not** logged raw — use envelope safe-log helpers only.

## Health check

`GET /api/v1/organizations/:orgId/workflow-event-outbox/health` (ORG_ADMIN / MASTER_ADMIN)

Returns queue lag, dead-letter count, oldest pending age, BullMQ reachability, in-flight count, last poll timestamp.

## Dead letter & replay

**List (summary only — no raw envelope/payload):**

`GET /api/v1/organizations/:orgId/workflow-event-outbox/dead-letters?limit=25`

**Replay (audited):**

`POST /api/v1/organizations/:orgId/workflow-event-outbox/dead-letters/:outboxId/replay`

Requires ORG_ADMIN or MASTER_ADMIN. Writes structured audit log (`replay_requested`) with `actorUserId`, then resets row to `PENDING` and schedules BullMQ job.

## Graceful shutdown

`WorkflowEventOutboxProcessorService.onModuleDestroy()` sets `shuttingDown`, stops accepting new claims, and drains in-flight work up to `WORKFLOW_EVENT_OUTBOX_SHUTDOWN_DRAIN_MS` (default 30s).

## VPS environment variables

Required (already present for workers):

- `DATABASE_URL`
- `REDIS_URL` (BullMQ)
- `WORKERS_ENABLED=true` on worker process

Recommended workflow outbox tuning (see `.env.example`):

```
WORKFLOW_EVENT_OUTBOX_ENABLED=true
WORKFLOW_EVENT_OUTBOX_MAX_ATTEMPTS=8
WORKFLOW_EVENT_OUTBOX_BACKOFF_MS=30000
WORKFLOW_EVENT_OUTBOX_LEASE_MS=60000
WORKFLOW_EVENT_OUTBOX_POLL_BATCH=50
```

Optional stable identity for debugging:

```
WORKFLOW_EVENT_OUTBOX_WORKER_ID=synqdrive-api-worker-1
```

## Operational playbooks

### Queue lag growing

1. Check `synqdrive_workflow_event_outbox_queue_lag` and health endpoint.
2. Verify Redis/BullMQ reachable (`queueReachable` in health).
3. Inspect failed/retry metrics by `error_code`.
4. Scale worker concurrency or increase `WORKFLOW_EVENT_OUTBOX_POLL_BATCH`.

### Stuck CLAIMED rows

Expired leases are auto-released to `RETRY_SCHEDULED` on each poll cycle. If persistent, verify worker process is running and `WORKFLOW_EVENT_OUTBOX_LEASE_MS` is sufficient for dispatch duration.

### Dead letters

1. Use dead-letter list API (summary fields only).
2. Fix root cause (validation, tenant, upstream data).
3. Replay via admin API after fix — never expose raw DLQ JSON in frontend.

## Key source files

| File | Role |
|------|------|
| `backend/src/config/workflow-event-outbox.config.ts` | Env config |
| `backend/src/modules/workflows/outbox/workflow-event-outbox.repository.ts` | Claim/lease/retry/DLQ |
| `backend/src/modules/workflows/outbox/workflow-event-outbox-processor.service.ts` | Worker orchestration |
| `backend/src/modules/workflows/outbox/workflow-event-outbox-dispatch.service.ts` | Re-validation + engine dispatch |
| `backend/src/modules/workflows/outbox/workflow-event-outbox-scheduler.service.ts` | Cron poll → BullMQ |
| `backend/src/workers/processors/workflow-event-outbox.processor.ts` | BullMQ processor |
| `backend/src/modules/workflows/outbox/workflow-event-outbox-worker.spec.ts` | Tests |
