# Connectivity Production Processing Gate — August 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `connectivity-production-processing-gate-2026-08` |
| **Baseline main SHA** | `ff03c4b7` (PR #1263 merged) |
| **Branch** | `cursor/connectivity-production-processing-gate-90ec` (PR #1267) |
| **Mode** | Production read-only investigation + targeted code repair |
| **Production modified** | **No** |

---

## A. Executive Summary

Production investigation confirms two distinct runtime defects blocking reliable device-connection lifecycle processing:

1. **July 20 canonical event (`5389a9c7…`)** — event persisted with `processed_at = NULL`, no episode, no inbox. Root cause: **IDEMPOTENCY_RETRY_DEFECT** in `persistDeviceConnectionEvent()` — duplicate upsert short-circuited episode sync and `processed_at` update. Likely triggered when first attempt persisted the row but episode sync failed (or pre-inbox direct path without reconciliation).

2. **July 28 / Aug 8 inbox rows** — `RECEIVED`, `processing_attempts = 0`, no BullMQ jobs in Redis. Root cause: **DEPLOYMENT_OR_WORKER_GAP** — inbox intake succeeded but async worker never claimed rows (no job consumption evidence; queue empty at audit time).

**Code fix (PR #1267):**
- Separate event dedupe from lifecycle completion — reconcile when `processed_at` is null **for current-era events only**.
- Explicit runtime cutover (`CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER`) — **required in production**; fail-closed when missing.
- Central domain-boundary eligibility via `ConnectivityLifecycleRuntimePolicyService`.
- Historical orphans return `historical_orphan` — inbox terminal ignore, canonical event untouched.
- Shared `DeviceConnectionWebhookInboxEnqueueService` — intake + scheduler enqueue failures persist `RETRYABLE_FAILED`.
- Scheduler batch isolation — per-row enqueue with `continue`; one failure cannot abort the batch.
- Scheduler defense-in-depth: reconcile eligible orphan `processed_at IS NULL` events each 30s poll tick.

**Corrective pass (PR #1267 follow-up):** prevents automatic historical episode backfill on deploy and closes scheduler silent-stuck enqueue gap.

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

### Classification: **IDEMPOTENCY_RETRY_DEFECT** (proven retry blocker)

**PROVEN:**
- Event persisted (`5389a9c7…`)
- `processed_at = NULL`, no episode, no inbox, 0 lifecycle audits
- Pre-fix retry/dedupe logic returned `duplicate` on existing upsert and could not complete lifecycle once the event row already existed

**NOT PROVEN:**
- Exact original first-failure trigger (episode sync exception, feature gate, worker absence, DB constraint, etc.)

**Evidence-safe wording:** Initial lifecycle completion failed for an historically unobservable reason. A proven **IDEMPOTENCY_RETRY_DEFECT** prevented later reconciliation on retry. The idempotency defect does not necessarily explain the original first failure.

**Path:** Direct persist (no inbox row) → `persistDeviceConnectionEvent` → upsert succeeded → lifecycle never completed.

**Retry defect:** On retry, upsert hits existing row (`isNew === false`) and returned `duplicate` without calling `syncEpisodeAfterPersistedEvent` or setting `processed_at`.

**Post-fix runtime policy:** July 20 event has `received_at < CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` → **excluded from automatic scheduler reconciliation**. Controlled remediation only.

---

## D. July 28 / Aug 8 Inbox Root Cause

| inbox id | created_at | status | attempts | event type | domain_event_id |
|----------|------------|--------|----------|------------|-----------------|
| `da2601ce-904e-4087-a1c3-916a0b51d96b` | 2026-07-28T07:56:52Z | RECEIVED | 0 | OBD_DEVICE_UNPLUGGED | null |
| `c19d5eed-e627-41fa-b9c8-4f7a69d0e22c` | 2026-08-08T06:59:20Z | RECEIVED | 0 | OBD_DEVICE_UNPLUGGED | null |

Both: tokenId 187784, `last_error_code = null`.

### Classification: **UNCLAIMED_PROCESSING_GAP** (evidence-safe; subcause unresolved)

**PROVEN:**
- Inbox row persisted
- Status remained `RECEIVED`, `processing_attempts = 0`
- Worker never claimed the row (`claimForProcessing` never incremented attempts)
- BullMQ queue empty at audit time

**NOT PROVEN (cannot distinguish from current evidence):**
- Enqueue failure vs worker unavailable vs deployment gap vs lost BullMQ job vs runtime mismatch

**Post-fix runtime policy:** Both rows have `received_at < CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` → **excluded from automatic stale re-enqueue**. Controlled remediation only (must consider unplug `observedAt` vs later valid snapshots before materializing episodes).

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
| Scheduler orphan reconciliation | None | Eligible current-era events only (`receivedAt >= cutover`) |

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
| `device-connection-webhook-inbox-enqueue.service.ts` | Shared enqueue + `RETRYABLE_FAILED` on failure (intake + scheduler) |
| `device-connection-webhook-inbox.service.ts` | Uses shared enqueue service |
| `device-connection-webhook-inbox-scheduler.service.ts` | Cutover-gated reconciliation; per-row scheduler enqueue; historical orphan reporting |
| `device-connection-webhook-inbox.repository.ts` | Cutover filter on stale/retryable batch queries |
| `device-connection-webhook-inbox.config.ts` | `lifecycleReconcileAfter` + `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` |
| `connectivity-lifecycle-runtime.policy.ts` | Central eligibility evaluation |
| `connectivity-lifecycle-runtime-policy.service.ts` | Injectable policy + startup logging |
| Tests | A–M + N1–N13 |
| `scripts/ops/read-only-connectivity-audit.mjs` | Production read-only audit helper |

---

## Q. Automatic Reconciliation Cutover Policy

| Item | Value |
|------|-------|
| Config key | `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` (ISO-8601) |
| **Production** | **Required** — no silent default. Missing → `automaticLifecycleReconciliationEnabled = false` |
| **Non-production** | Deterministic dev default `CONNECTIVITY_LIFECYCLE_DEV_RECONCILE_AFTER_ISO` (`2026-08-25T00:00:00.000Z`) for tests/local only |
| Meaning | First instant the **repaired** inbox→BullMQ→episode pipeline is **actually authoritative in that environment** |

### Production fail-closed behavior

When `NODE_ENV=production` and `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` is unset:

- Automatic canonical-event orphan reconciliation = **DISABLED**
- Stale inbox auto-retry under this gate = **DISABLED**
- Structured warning: `connectivity.lifecycle_reconciliation_disabled`
- Application remains healthy (no startup failure)
- **Primary webhook intake** for new events still processes normally

### Deployment contract (required before enabling auto-reconciliation)

1. Choose deployment timestamp immediately before rollout
2. Set `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER=<that ISO instant>` in production env
3. Deploy PR #1267 release
4. Verify startup log: `connectivity.lifecycle_reconciliation_enabled` with expected cutover
5. Verify historical July rows remain excluded (read-only audit)

Do **not** set the cutover before deployment. Do **not** use `Date.now()` at boot.

### Domain-boundary enforcement (not scheduler-only)

Central check: `ConnectivityLifecycleRuntimePolicyService.evaluateOrphanReconciliationEligibility`

Enforced in:
- `reconcilePersistedEventLifecycle`
- `persistDeviceConnectionEvent` (existing-event dedupe/retry path)

Outcomes:
- `eligible` → reconcile lifecycle, set `processed_at` after success
- `historical_orphan` → no episode sync, no `processed_at` mutation
- `reconciliation_disabled` → same (cutover not configured)
- `duplicate` → fully processed event only

### Duplicate delivery edge case (N9)

Historical canonical event (`receivedAt` pre-cutover, `processedAt` null) + new post-cutover inbox delivery:

- Domain returns `historical_orphan`
- Inbox → `IGNORED_BY_POLICY` with reason `historical_orphan` (terminal, no retry loop)
- Canonical historical event remains `processedAt = null`

### Runtime rules (when cutover configured)

| Condition | Automatic scheduler behavior |
|-----------|------------------------------|
| `processed_at IS NULL` AND `received_at >= cutover` | May call `reconcilePersistedEventLifecycle` |
| `processed_at IS NULL` AND `received_at < cutover` | **Blocked at domain boundary** + log/report only |
| Inbox stale `RECEIVED`/`VALIDATED` AND `received_at >= cutover` | May enqueue via scheduler |
| Inbox stale `RECEIVED`/`VALIDATED` AND `received_at < cutover` | **Excluded** — controlled remediation only |
| Scheduler enqueue failure | `RETRYABLE_FAILED`, `lastErrorCode=enqueue_failed`, `nextRetryAt` set |
| Scheduler batch | Per-row isolation — one failure does not block siblings |

### Historical safety invariant

> Runtime retry/reconciliation repairs **current-pipeline partial failures** only.  
> Historical pre-cutover evidence is **never automatically materialized** into episodes through any normal runtime path.

Scheduler filtering is **defense-in-depth**, not the sole safety control.

Controlled historical remediation (if ever approved) must evaluate unplug `observedAt` vs latest valid snapshot after unplug — not implemented in this slice.

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
| N1 | Pre-cutover event not reconciled | scheduler spec |
| N2 | Post-cutover event reconciled | scheduler spec |
| N3 | Pre-cutover stale inbox not enqueued | scheduler spec |
| N4 | Post-cutover stale inbox enqueued | scheduler spec |
| N5 | Scheduler enqueue failure persisted | enqueue + scheduler spec |
| N6 | Batch isolation (3 rows, middle fails) | scheduler spec |
| N7 | July historical orphans excluded | scheduler spec + policy spec |
| N8 | Direct reconcile blocks pre-cutover | `device-connection-webhook.service.spec.ts` |
| N9 | Post-cutover duplicate hits historical event | service + processing spec |
| N10 | Post-cutover reconcile completes lifecycle | service spec |
| N11 | Production missing cutover disables auto-reconciliation | config + scheduler spec |
| N12 | Explicit cutover enables eligible reconciliation | config + scheduler spec |
| N13 | Invalid cutover fails config validation | config spec |

**Pass count (targeted):** 107 tests across 13 suites (local run 2026-08-25).

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
1. Set `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` to actual rollout instant **before** deploy
2. Deploy via standard VPS workflow
3. Verify startup log shows expected cutover
4. Confirm first scheduler tick does **not** create episodes for July 8/11/20 events or July 28/Aug 8 inbox rows
5. Confirm new post-cutover webhooks process end-to-end (inbox → job → episode → `processed_at`)
6. Confirm scheduler enqueue failures produce `RETRYABLE_FAILED` (not silent `RECEIVED`)

**Historical remediation:** deferred — requires explicit controlled approval and snapshot-aware evaluation.

---

## N. Remaining Historical Data Gaps

| Item | Disposition |
|------|-------------|
| July 8/11 events | **HISTORICAL_ONLY** — no automatic backfill |
| July 20 event | **Historical orphan** — excluded from scheduler; controlled remediation only |
| July 28 / Aug 8 inbox | **Historical stuck inbox** — excluded from auto-replay; controlled remediation only |
| Post-cutover partial failures | Repairable via retry + eligible scheduler reconciliation |

No automatic historical episode fabrication on deploy.

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
| Why July 20 `processed_at` NULL? | Initial lifecycle completion failed (cause unproven); retry dedupe blocked completion |
| Why no episode? | `syncEpisodeAfterPersistedEvent` never succeeded |
| Why inbox stuck RECEIVED? | Worker never claimed (`attempts=0`); exact subcause unproven |
| BullMQ job created? | No jobs in Redis at audit; enqueue/worker gap suspected but unproven |
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
