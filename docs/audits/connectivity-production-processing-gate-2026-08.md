# Connectivity Production Processing Gate — August 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `connectivity-production-processing-gate-2026-08` |
| **Baseline main SHA** | `ff03c4b7` (PR #1263 merged) |
| **Branch** | `fix/connectivity-production-processing-gate-2026-08` |
| **Mode** | Production read-only investigation + targeted code repair |
| **Production modified** | **No** |

---

## A. Executive Summary

Production investigation confirms two distinct runtime defects blocking reliable device-connection lifecycle processing:

1. **July 20 canonical event (`5389a9c7…`)** — event persisted with `processed_at = NULL`, no episode, no inbox. Root cause: **IDEMPOTENCY_RETRY_DEFECT** in `persistDeviceConnectionEvent()` — duplicate upsert short-circuited episode sync and `processed_at` update. Likely triggered when first attempt persisted the row but episode sync failed (or pre-inbox direct path without reconciliation).

2. **July 28 / Aug 8 inbox rows** — `RECEIVED`, `processing_attempts = 0`, no BullMQ jobs in Redis. Root cause: **DEPLOYMENT_OR_WORKER_GAP** — inbox intake succeeded but async worker never claimed rows (no job consumption evidence; queue empty at audit time).

**Code fix (this branch):**
- Separate event dedupe from lifecycle completion — reconcile when `processed_at` is null.
- Mark inbox `RETRYABLE_FAILED` on enqueue failure (prevents silent `RECEIVED` forever).
- Scheduler defense-in-depth: reconcile orphan `processed_at IS NULL` events every 30s poll tick.

**Gate verdict (pre-deploy):** **FAIL** — fix not yet deployed; historical rows remain. **P0.2: NO-GO** until post-deploy verification.

---

## B. Production Baseline

| Item | Value |
|------|-------|
| Health | `https://app.synqdrive.eu/api/v1/health` → `ok` (2026-08-25T00:51:15Z) |
| Release path | `/opt/synqdrive/releases/20260824203418_v4994` |
| Process | `node /opt/synqdrive/current/backend/dist/src/main.js` (PID 411699, started Mon Aug 24 20:39:38 2026 UTC) |
| Main SHA deployed | `ff03c4b7` lineage (v4994 release after PR #1263) |
| Redis | Reachable; `REDIS_URL` configured (value redacted) |
| BullMQ queue `connectivity.webhook.process` | `{ waiting: 0, active: 0, failed: 0, completed: 0 }` |
| Unprocessed canonical events | **3** (`processed_at IS NULL`) |
| Inbox `RECEIVED` + `attempts=0` | **2** |

---

## C. July 20 Root Cause

| Field | Value |
|-------|-------|
| Event ID | `5389a9c7-33c3-4f50-ba07-0338da4841d6` |
| Type | `OBD_DEVICE_UNPLUGGED` |
| `observed_at` | `2026-07-20T11:05:00.000Z` |
| `received_at` | `2026-07-20T11:05:03.768Z` |
| `processed_at` | **NULL** |
| Vehicle ID | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |
| tokenId | 187784 |
| Episode | **none** |
| Lifecycle audits | **0** |
| Inbox row | **none** |

### Classification: **IDEMPOTENCY_RETRY_DEFECT**

**Path:** Direct persist (pre-inbox era or synchronous path) → `persistDeviceConnectionEvent` → upsert succeeded → episode sync did not complete → `processed_at` never set.

**First failure stage:** Episode lifecycle sync / `processed_at` update after successful event upsert.

**Retry defect:** On retry, upsert hits existing row (`isNew === false`) and returned `duplicate` without calling `syncEpisodeAfterPersistedEvent` or setting `processed_at`. Processing service then marked inbox processed on `duplicate` outcome (when inbox path used).

**Code reference (pre-fix):**

```typescript
const isNew = row.createdAt.getTime() === row.updatedAt.getTime();
if (!isNew) {
  return { outcome: 'duplicate', eventId: row.id, eventType };
}
// episode sync only below this guard
```

---

## D. July 28 / Aug 8 Inbox Root Cause

| inbox id | created_at | status | attempts | event type | domain_event_id |
|----------|------------|--------|----------|------------|-----------------|
| `da2601ce-904e-4087-a1c3-916a0b51d96b` | 2026-07-28T07:56:52Z | RECEIVED | 0 | OBD_DEVICE_UNPLUGGED | null |
| `c19d5eed-e627-41fa-b9c8-4f7a69d0e22c` | 2026-08-08T06:59:20Z | RECEIVED | 0 | OBD_DEVICE_UNPLUGGED | null |

Both: tokenId 187784, `last_error_code = null`.

### Classification: **DEPLOYMENT_OR_WORKER_GAP**

**Evidence:**
- `processing_attempts = 0` → `claimForProcessing` never ran → worker never consumed.
- BullMQ queue empty at audit — no waiting/failed jobs.
- Inbox rows exist → HTTP intake + DB persist succeeded.
- Scheduler stale re-enqueue (`findStaleInFlightBatch` every 30s after 5min stale) should have re-queued — either enqueue failed without status transition (pre-fix), worker was not registered in deployed build at that time, or Redis job was lost after completion-with-skip.

**Most likely:** Enqueue failure or worker not consuming left rows in `RECEIVED` with no retryable status. Pre-fix code did not mark `RETRYABLE_FAILED` on enqueue failure.

---

## E. Queue Producer / Consumer Architecture

```
POST /api/v1/webhooks/dimo
  → DimoWebhookController
  → DeviceConnectionWebhookInboxService.intakeDeviceConnectionWebhook
      → device_connection_webhook_inbox (RECEIVED)
      → DeviceConnectionWebhookQueueProducer.enqueue(inboxId)
          queue: connectivity.webhook.process
          job name: process
          job id: connectivity-webhook:{inboxId}
  → DeviceConnectionWebhookProcessor (WorkersModule)
  → DeviceConnectionWebhookProcessingService.processInboxId
      → claimForProcessing (increments attempts)
      → processValidatedWebhookEvent
      → persistDeviceConnectionEvent + syncEpisodeAfterPersistedEvent
      → markProcessed / markRetryableFailed / markDeadLetter
```

**Shared constants:** `QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS`, `DEVICE_CONNECTION_WEBHOOK_JOB_NAME = 'process'`.

**Retry:** BullMQ 5 attempts, exponential backoff 5s; inbox `RETRYABLE_FAILED` with `nextRetryAt`; scheduler re-enqueues stale `RECEIVED`/`VALIDATED` after `processingStaleMs` (default 5min).

---

## F. Worker Runtime Verification

| Check | Result |
|-------|--------|
| `DeviceConnectionWebhookProcessor` in source | Yes — `workers.module.ts` |
| `WorkersModule` in `AppModule` | Yes — always registered (Redis reconnect at runtime) |
| `DeviceConnectionWebhookInboxSchedulerService` | Yes — `@Cron('*/30 * * * * *')` in DimoModule |
| Production queue consumer active | **Unproven for historical rows** — 0 jobs, 2 stuck inbox |
| PM2 worker role split | **No** — single `main.js` process (API + workers colocated) |

---

## G. Transaction / Retry Analysis

| Step | Transaction boundary |
|------|---------------------|
| Inbox create | Independent write |
| BullMQ enqueue | Independent (Redis) |
| Event upsert | Independent |
| Episode sync | Independent (multiple writes + audits) |
| `processed_at` update | Independent |

**Invariant after fix:** `processed_at` is set only after episode sync succeeds. Partial failure is retryable; dedupe no longer skips lifecycle when `processed_at` is null.

---

## H. Idempotency Analysis

| Scenario | Pre-fix | Post-fix |
|----------|---------|----------|
| Duplicate webhook, fully processed | Skip (correct) | Skip (correct) |
| Retry after event persisted, episode failed | Skip lifecycle (**bug**) | Reconcile lifecycle |
| Duplicate OPEN episode | Episode service idempotent (`already_open`) | Unchanged |
| Scheduler orphan reconciliation | None | `reconcilePersistedEventLifecycle` batch |

---

## I. Episode OPEN Lifecycle

`syncEpisodeAfterPersistedEvent` → `DeviceConnectionEpisodeService.openFromUnplugEvent` on `OBD_DEVICE_UNPLUGGED`.

Gated by `ConnectivityRecoveryPolicyService.isEpisodeRecoveryEnabled()` (production: recovery on).

---

## J. Snapshot Recovery / Episode RESOLVE Lifecycle

Separate path (no plug webhook required):

```
DimoSnapshotProcessor
  → DeviceConnectionEpisodeResolutionService.tryResolveFromSnapshotPlugSignal
  → tryResolveFromSustainedTelemetry (SPAN/TRIP thresholds)
  → episode RESOLVED + audit
```

Single valid snapshot with plug signal can resolve via `SNAPSHOT_PLUG_SIGNAL`. Sustained telemetry may require span/trip evidence per policy.

---

## K. Code Changes

| File | Change |
|------|--------|
| `device-connection-webhook.service.ts` | Reconcile partial events; `reconciled` outcome; `reconcilePersistedEventLifecycle` |
| `device-connection-webhook-processing.service.ts` | Handle `reconciled` outcome |
| `device-connection-webhook-inbox.service.ts` | `safeEnqueue` → `RETRYABLE_FAILED` on failure |
| `device-connection-webhook-inbox-scheduler.service.ts` | Orphan event reconciliation in poll tick |
| Tests | Service, processing, inbox, scheduler, queue producer specs |
| `scripts/ops/read-only-connectivity-audit.mjs` | Production read-only audit helper |

---

## L. Tests

| ID | Coverage | Spec |
|----|----------|------|
| A | Webhook → inbox + enqueue | `device-connection-webhook-inbox.service.spec.ts` |
| B | Job processes inbox | `device-connection-webhook-processing.service.spec.ts` |
| C | Canonical event persisted | `device-connection-webhook.service.spec.ts` |
| D | OPEN episode created | `device-connection-webhook.service.spec.ts` |
| E | Duplicate idempotent | `device-connection-webhook.service.spec.ts` |
| F | Retry completes lifecycle | `device-connection-webhook.service.spec.ts`, processing spec |
| G | `processed_at` only after lifecycle | service spec |
| H | Failure → retryable state | processing spec, inbox enqueue failure spec |
| I | Snapshot resolves episode | `device-connection-episode-resolution.service.spec.ts` |
| J | Recovery without plug webhook | resolution spec (telemetry/snapshot paths) |
| K | Reconciliation scheduler | `device-connection-webhook-inbox-scheduler.service.spec.ts` |
| L | Queue constant alignment | `device-connection-webhook-queue.producer.spec.ts` |
| M | Stuck inbox enqueue failure | inbox service spec |

**Pass count (targeted):** 84 tests across 11 suites (local run 2026-08-25).

---

## M. Production Verification

### Performed (read-only)
- Health check
- SQL audit (events, inbox, counts)
- BullMQ queue counts
- Deploy path / process start time

### Not performed (requires deploy + approval)
- Controlled webhook replay
- Manual vehicle unplug test
- Post-fix inbox row mutation

### Post-deploy verification plan
1. Deploy via standard VPS workflow
2. Confirm worker logs: `device_connection.lifecycle_complete`, scheduler reconciliation
3. Observe scheduler reconcile 3 orphan events (read-only verify `processed_at` populated)
4. Re-enqueue 2 stuck inbox rows via scheduler stale poll or admin replay API
5. Confirm no new `RECEIVED` + `attempts=0` rows accumulate
6. Monitor `connectivity.webhook.process` queue consumption

---

## N. Remaining Historical Data Gaps

| Item | Disposition |
|------|-------------|
| July 8/11 events | **HISTORICAL_ONLY** — no backfill |
| July 20 event | Repairable post-deploy via scheduler reconciliation |
| July 28 / Aug 8 inbox | Repairable post-deploy via stale re-enqueue + fixed processor |
| 3rd unprocessed event | Identify in post-deploy audit; reconcile via scheduler |

No automatic historical episode fabrication.

---

## O. Observability

Added structured logs:
- `device_connection.lifecycle_complete` (eventId, inboxId, outcome)
- Enqueue success/failure with inbox id
- Reconciliation warnings for orphan events
- Processing service dedupe/reconcile debug lines

Existing: `ConnectivityObservabilityService` webhook_processing events, Prometheus connectivity metrics.

**Recommended follow-up:** Gauge for `processed_at IS NULL` count, inbox `RECEIVED` age histogram.

---

## P. Final Gate Verdict

| Question | Answer |
|----------|--------|
| Why July 20 `processed_at` NULL? | Episode sync never completed; retry dedupe skipped lifecycle |
| Why no episode? | `syncEpisodeAfterPersistedEvent` never succeeded |
| Why inbox stuck RECEIVED? | Worker never claimed; likely enqueue/worker gap |
| BullMQ job created? | No jobs in Redis at audit; likely never enqueued or completed without claim |
| Correct worker running? | Processor in deployed build; consumption unproven for stuck rows |
| Partial failure retryable? | **Yes after fix** |
| Dedupe blocks lifecycle? | **Yes pre-fix; fixed** |
| Unplug → OPEN episode reliable? | **After deploy + verification** |
| Snapshots resolve without plug webhook? | **Yes** (existing resolution service) |
| Future failures diagnosable? | Improved logging; metrics follow-up recommended |
| Production processing healthy now? | **No** — fix not deployed |

```
PRODUCTION PROCESSING GATE: FAIL (pre-deploy)
P0.2 READY: NO-GO
```

**Re-evaluate to PASS/GO after:** deploy + post-deploy verification steps in §M complete with no new stuck rows.

---

## Changes / Architektur

- **Changes:** `ChangesView.tsx` — production processing gate entry
- **Architektur:** `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md` — webhook processing lifecycle section
