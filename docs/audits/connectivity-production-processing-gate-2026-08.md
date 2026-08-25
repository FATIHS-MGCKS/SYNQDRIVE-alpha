# Connectivity Production Processing Gate — August 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `connectivity-production-processing-gate-2026-08` |
| **Baseline main SHA** | `ff03c4b7` (PR #1263 merged) |
| **Deployed main SHA** | `6acd45cc` (PR #1267) + hotfix `2022e586` (DimoModule provider registration) |
| **Branch** | `main` (PR #1267 merged 2026-08-25T07:43:15Z) |
| **Mode** | Production controlled deployment + live verification |
| **Production modified** | **Yes** — env cutover set; release deployed; no historical row mutations |

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

**Gate verdict (post-deploy 2026-08-25):** **CONDITIONAL** — infrastructure verified live; lifecycle OPEN/RESOLVE not yet observed on natural post-cutover traffic. **P0.2: NO-GO** until live event observed.

**Cutover correction (2026-08-25T08:49Z):** Initial cutover `2026-08-25T07:48:30.000Z` predated successful repaired-pipeline activation (`2026-08-25T08:04:17.000Z`). Gap query returned **0** inbox/event/episode rows in the accidental window. Cutover corrected forward to activation instant; historical July safety re-verified PASS.

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

### Performed (read-only, pre-deploy 2026-08-25T07:47Z)
- Health check
- SQL audit (events, inbox, counts)
- BullMQ queue counts (empty)
- Deploy path / process start time

### Production Deployment Verification (2026-08-25)

#### A. Merged / deployed SHA
| Item | Value |
|------|-------|
| PR #1267 merge commit | `6acd45cc12dfe3d4de9e99e0eeaade13c4b7f7f5` |
| PR #1263 (still included) | `ff03c4b7` |
| Deploy hotfix (boot check) | `2022e586399ef5d08ff44b8bfdd20e866ee34639` — `ConnectivityLifecycleRuntimePolicyService` missing from `DimoModule.providers` blocked first deploy attempt |
| **Deployed release** | `20260825075756_v4994` |
| **Running SHA** | `2022e586` |

#### B. Cutover timestamp
| Item | Value |
|------|-------|
| `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` | **`2026-08-25T07:48:30.000Z`** |
| Set via | `/opt/synqdrive/shared/backend.env` (backup: `backend.env.pre-connectivity-gate-*`) |
| Startup log confirmed | `connectivity.lifecycle_reconciliation_enabled` with `cutover: 2026-08-25T07:48:30.000Z` at `2026-08-25T08:04:17Z` |

#### C. Process / worker verification
| Check | Result |
|-------|--------|
| PM2 `synqdrive` | **online** (PID 433289, restart count 47 after deploy) |
| Public health | `https://app.synqdrive.eu/api/v1/health` → `ok` |
| Boot check | Passed on second deploy attempt (first aborted safely — prior release untouched) |
| `DeviceConnectionWebhookProcessor` | Registered in deployed build (`WorkersModule`) |
| `DeviceConnectionWebhookInboxSchedulerService` | Active — cron ticks at `:00` and `:30` each minute observed |

#### D. Queue verification
| Queue | waiting | active | delayed | failed | completed |
|-------|---------|--------|---------|--------|-----------|
| `connectivity.webhook.process` | 0 | 0 | 0 | 0 | 0 |

Redis reachable via `REDIS_HOST`/`REDIS_PORT` (no `REDIS_URL` in production env).

#### E. Historical safety verification (post-deploy scheduler ticks)
Verified at `2026-08-25T08:05Z` and `08:06Z` after deploy:

| Historical row | Pre-deploy | Post-deploy | Episode created? |
|----------------|------------|-------------|------------------|
| July 8 event `27c12038…` | `processed_at` NULL, no episode | **unchanged** | **No** |
| July 11 event `d79dc043…` | `processed_at` NULL, no episode | **unchanged** | **No** |
| July 20 event `5389a9c7…` | `processed_at` NULL, no episode | **unchanged** | **No** |
| July 28 inbox `da2601ce…` | RECEIVED, attempts=0 | **unchanged** | **No** |
| Aug 8 inbox `c19d5eed…` | RECEIVED, attempts=0 | **unchanged** | **No** |

Scheduler emits `connectivity.historical_orphan_backlog` warnings (report-only) — **no automatic materialization**.

**Historical safety: PASS**

#### F. New webhook processing evidence
| Item | Result |
|------|--------|
| Natural post-cutover `OBD_DEVICE_UNPLUGGED` webhooks | **None observed** during observation window (~08:04–08:07 UTC) |
| Post-cutover inbox rows | **0** |
| Post-cutover canonical events | **0** |
| Post-cutover `RECEIVED` + `attempts=0` | **0** |

**Live end-to-end webhook path: UNOBSERVED** — no customer unplug events during window. Manual replay not executed (requires explicit approval per safety rules).

#### G. Snapshot recovery evidence
| Item | Result |
|------|--------|
| Post-cutover OPEN episodes | **0** |
| Post-cutover RESOLVED episodes | **0** |
| Natural snapshot-based episode resolution | **Not observed** (no new unplug to recover from) |

Automated tests J/I cover snapshot recovery paths; live production RESOLVE not yet proven.

#### H. Post-cutover inbox health
| Status | Count |
|--------|-------|
| RECEIVED (all) | 2 (both pre-cutover historical) |
| Post-cutover RECEIVED + attempts=0 | **0** |
| Oldest RECEIVED row | `2026-07-28T07:56:52Z` (historical) |

#### I. Post-cutover canonical event health
| Metric | Count |
|--------|-------|
| Total `processed_at IS NULL` | 3 (all pre-cutover historical) |
| Post-cutover `processed_at IS NULL` | **0** |
| Post-cutover events total | **0** |

#### J. Episode health
| Metric | Count |
|--------|-------|
| OPEN episodes (all) | **0** |
| Post-cutover OPEN | **0** |
| Post-cutover RESOLVED | **0** |
| State conflicts | **0** observed |

#### K. P0.1 domain invariants (live, read-only)
Not re-audited exhaustively in this window. Pre-deploy P0.1 audit (`vehicle-operational-state-p01-provenance-2026-08.md`) remains authoritative. No Availability/Health mutations performed.

#### L. Unresolved items
1. **Live webhook OPEN path** — await natural post-cutover `OBD_DEVICE_UNPLUGGED` or approved controlled test
2. **Live snapshot RESOLVE path** — await recoverable post-cutover unplug + telemetry resume
3. **Historical July rows** — intentionally untouched; separate controlled remediation if desired
4. **Pre-cutover stuck inbox** (`da2601ce…`, `c19d5eed…`) — excluded from auto-replay by cutover policy

#### M. Production mutations performed
| Action | Detail |
|--------|--------|
| Env var set | `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER=2026-08-25T07:48:30.000Z` |
| VPS deploy | Standard `vps-deploy-release.sh` via `cloud-agent-deploy.sh` |
| PM2 restart | Yes (with new release) |
| Historical row mutations | **None** |
| Manual replay / synthetic webhook | **None** |

### Not performed (requires approval or natural traffic)
- Controlled webhook replay (`POST .../inbox/:id/replay` — operator-authenticated)
- Manual vehicle unplug test
- Historical row remediation

### Post-deploy verification plan (original)
1. Set `CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` to actual rollout instant **before** deploy — **DONE**
2. Deploy via standard VPS workflow — **DONE** (`2022e586`)
3. Verify startup log shows expected cutover — **DONE**
4. Confirm first scheduler tick does **not** create episodes for July 8/11/20 events or July 28/Aug 8 inbox rows — **DONE**
5. Confirm new post-cutover webhooks process end-to-end — **PENDING** (no natural traffic)
6. Confirm scheduler enqueue failures produce `RETRYABLE_FAILED` — **not triggered** (no failures observed)

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
| BullMQ job created? | No jobs in Redis at pre-deploy audit; enqueue/worker gap suspected but unproven |
| Correct worker running? | **Yes** — deployed `2022e586`, processor registered, queue healthy |
| Partial failure retryable? | **Yes** (code + cutover configured) |
| Dedupe blocks lifecycle? | **Fixed** in deployed build |
| Unplug → OPEN episode reliable? | **Proven in tests; live post-cutover UNOBSERVED** |
| Snapshots resolve without plug webhook? | **Proven in tests; live post-cutover UNOBSERVED** |
| Historical rows auto-mutated on deploy? | **No** — verified |
| Cutover loaded? | **Yes** — `2026-08-25T07:48:30.000Z` |
| Production processing healthy now? | **Partially** — infrastructure PASS; lifecycle path awaiting natural traffic |

```
PRODUCTION PROCESSING GATE: CONDITIONAL
P0.2 READY: NO-GO
```

---

## R. Cutover Correction (2026-08-25)

### R.1 Activation evidence

| Source | Timestamp (UTC) |
|--------|-----------------|
| Failed deploy release `20260825074743_v4994` | Aborted — `ConnectivityLifecycleRuntimePolicyService` missing from `DimoModule.providers` |
| Successful deploy release `20260825075756_v4994` (SHA `2022e586`) | Built ~07:58 |
| PM2 process `created_at` | **2026-08-25T08:04:11.594Z** |
| `connectivity.lifecycle_reconciliation_enabled` startup log | **2026-08-25T08:04:17Z** |
| `Nest application successfully started` | **2026-08-25T08:04:17Z** |

**Authoritative activation instant:** `2026-08-25T08:04:17.000Z` (first successful bootstrap of repaired pipeline).

### R.2 Pre-correction gap query

Window: `2026-08-25T07:48:30.000Z` → `2026-08-25T08:04:17.000Z`

| Table | Count |
|-------|-------|
| `device_connection_webhook_inbox` | **0** |
| `dimo_device_connection_events` | **0** |
| `device_connection_episodes` | **0** |

Safe to advance cutover — no stranded post-cutover evidence.

### R.3 Correction applied

| Item | Value |
|------|-------|
| Old cutover | `2026-08-25T07:48:30.000Z` |
| **Corrected cutover** | **`2026-08-25T08:04:17.000Z`** |
| Mechanism | `/opt/synqdrive/shared/backend.env` (backup `backend.env.pre-cutover-correction-20260825084914`) |
| PM2 restart | `pm2 restart synqdrive --update-env` |
| Post-restart startup log | `cutover: 2026-08-25T08:04:17.000Z` at `2026-08-25T08:49:19Z` |

### R.4 Post-correction historical safety

After scheduler cycles + env reload:

| Historical row | Status |
|----------------|--------|
| July 8 event `27c12038…` | `processed_at` NULL — **unchanged** |
| July 11 event `d79dc043…` | `processed_at` NULL — **unchanged** |
| July 20 event `5389a9c7…` | `processed_at` NULL — **unchanged** |
| July 28 inbox `da2601ce…` | RECEIVED / attempts=0 — **unchanged** |
| Aug 8 inbox `c19d5eed…` | RECEIVED / attempts=0 — **unchanged** |
| Episodes total | **0** |
| Gap-window mutations | **0** |

**Historical safety after correction: PASS**

### R.5 Nest DI bootstrap regression

| Item | Value |
|------|-------|
| Test | `backend/src/modules/dimo/dimo-module.bootstrap.spec.ts` |
| Module fixture | `DimoConnectivityLifecycleDiModule` |
| Guards | DimoModule export/provider metadata + runtime graph resolution |
| Mutation proof | Compile fails when `ConnectivityLifecycleRuntimePolicyService` omitted |

---

## S. Long-offline reference matrix

See `docs/audits/connectivity-long-offline-reference-matrix-2026-08.md`.

**CONDITIONAL because:** deploy + cutover + worker/queue + historical safety verified live, but no natural post-cutover `OBD_DEVICE_UNPLUGGED` → OPEN episode → snapshot RESOLVE chain observed.

**Upgrade to PASS/GO when:** at least one post-cutover webhook completes full lifecycle (inbox → BullMQ → canonical event → episode OPEN → `processed_at` → inbox PROCESSED) and, if applicable, snapshot recovery resolves without plug webhook.

---

## T. FINAL LIVE POST-CUTOVER ACCEPTANCE — KS MX 2024 (2026-08-25)

### A. Production SHA

| Item | Value |
|------|-------|
| Backend SHA | `a483ab72` (release `20260825195646_v4994`, includes #1277 P0.4) |
| Test vehicle | KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`) |
| DIMO tokenId | `187336` |
| Active DIMO link | `e2bd6a49-f1fc-4d4f-bd60-e958b15d8142` (`dimoVehicleId` set, `sourceReferenceId` NULL) |

### B. T0

**T0 = `2026-08-25T20:37:17Z`** (agent observation start; operator had already been driving ~1–2 min)

`CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER` configured in production env (value redacted).

### C. Pre-test canonical state

| Layer | State |
|-------|-------|
| OPEN episodes | **0** (no ambiguous pre-existing OPEN episode) |
| Canonical events (KS MX) | **0** historical rows for this vehicle |
| Inbox (KS MX) | **0** pre-test rows |
| P0.3 operationalAvailability | `NEEDS_VERIFICATION` |
| P0.4 health | `PARTIALLY_EVALUABLE` → Eingeschränkt bewertbar |
| Provider link | ACTIVE DIMO mapping valid |

### D. PRE_UNPLUG_BASELINE_SNAPSHOT

| Field | Value |
|-------|-------|
| Snapshot ref | `90802564-0045-4a4a-98f9-6e4ad579322a` |
| `source_timestamp` | **`2026-08-25T20:39:59Z`** |
| Newer than T0 | **YES** |
| Speed | 46 km/h (driving) |
| **UNPLUG TEST READY** | **YES** (declared 20:40:28Z) |

### E. Real OBD_DEVICE_UNPLUGGED (post-cutover)

**YES** — two natural provider unplug webhooks for token `187336`:

| Inbox ID | `observed_at` | `received_at` | Provider event ref (safe) |
|----------|---------------|---------------|---------------------------|
| `38e7951d-58a0-4eb4-9f55-de88a94348f1` | `2026-08-25T20:41:54Z` | `2026-08-25T20:41:58.738Z` | `DIMO:token:187336:type:OBD_DEVICE_UNPLUGGED:bucket:59589683` |
| `0d4cc578-b377-4de5-84e1-db9eac7b7a4f` | `2026-08-25T20:42:02Z` | `2026-08-25T20:42:06.258Z` | `DIMO:token:187336:type:OBD_DEVICE_UNPLUGGED:bucket:59589684` |

Both `observed_at > T0`. Second aligns with last pre-unplug snapshot timestamp.

### F–H. Inbox / BullMQ / Worker

| Step | Result |
|------|--------|
| Inbox created | **YES** (2 rows) |
| Inbox status | **`RETRYABLE_FAILED`** (both) |
| `processing_attempts` | **0** (worker never claimed) |
| `last_error_code` | **`enqueue_failed`** |
| BullMQ enqueue | **FAIL** |
| Worker processing | **FAIL** (never reached) |
| Scheduler retry | Observed natural retries (`next_retry_at` advanced at ~20:53, 20:54, 20:56) — enqueue continued failing |

**Root cause class:** **ENQUEUE_FAILURE** — inbox intake succeeded but `DeviceConnectionWebhookInboxEnqueueService.enqueueOrMarkRetryableFailed()` could not add BullMQ jobs. Same failure class as pre-fix July 28/Aug 8 stuck rows, but now correctly surfaced as `RETRYABLE_FAILED` with `enqueue_failed` (not silent `RECEIVED`).

### I–K. Canonical event / processedAt / Episode OPEN

| Check | Result |
|-------|--------|
| Canonical events created | **0** |
| `processedAt` populated | **NO** |
| Episode OPEN | **NO** |
| Duplicate canonical events | **0** (none created) |
| Duplicate OPEN episodes | **0** |

### L. Unplug window observation

Telemetry snapshots ceased updating at `20:42:02` during unplug window; `provider_fetched_at` continued polling but `source_timestamp` remained stale until `20:53:45` (recovery snapshot candidate). Without processed unplug event, P0.1 `physicalDeviceState` did **not** transition to canonical `UNPLUGGED` via lifecycle pipeline.

### M. RECOVERY_SNAPSHOT

| Field | Value |
|-------|-------|
| `source_timestamp` | **`2026-08-25T20:53:45Z`** |
| Newer than unplug event | **YES** (`20:53:45 > 20:42:02`) |
| Speed | 14 km/h |
| Telemetry recovery observations | **0** (no episode to attach) |

### N–O. Physical recovery / Episode RESOLVE

| Check | Result |
|-------|--------|
| Physical state via lifecycle pipeline | **NOT PROVEN** (no canonical unplug processed) |
| Episode auto-RESOLVE | **NOT OBSERVED** (no OPEN episode existed) |
| PLUGGED webhook observed | **NO** |
| PLUGGED webhook required | **NO** (by contract) |
| Manual episode mutation | **NO** |

### P. Authoritative timeline (UTC)

| Marker | Timestamp | Evidence |
|--------|-----------|----------|
| T0 | `20:37:17` | Agent start |
| T1 | `20:39:59` | PRE_UNPLUG_BASELINE_SNAPSHOT (`source_timestamp`) |
| T2 | `20:41:54` | First `OBD_DEVICE_UNPLUGGED` (`observed_at`) |
| T3 | `20:41:58.738` | First inbox received |
| T2b | `20:42:02` | Second unplug + last stale snapshot before gap |
| T4 | `20:42:06.258` | Second inbox received |
| T5–T8 | — | **Not reached** (enqueue_failed) |
| T9 | `20:53:45` | First post-unplug recovery snapshot |
| T10–T12 | — | **Not reached** (no episode) |

Physical reconnect: inferred between T4 and T9 (not system-recorded).

### Q–U. Post-recovery P0.1/P0.2/P0.3/P0.4

Without lifecycle processing, connectivity projection remained on pre-test characteristics (`REAUTH_REQUIRED` / `NEEDS_VERIFICATION`). P0.4 Health unaffected (no fabricated severity from connectivity). Fresh telemetry resumed at 20:53:45 but lifecycle gate criteria not met.

### V–X. Health checks after test

| Check | Result |
|-------|--------|
| Post-cutover stuck inbox (`RECEIVED`, attempts=0) | **0** |
| Post-cutover stuck inbox (`RETRYABLE_FAILED`, enqueue_failed) | **2** (this test) |
| Post-cutover `processedAt NULL` events | **0** new (July historical unchanged) |
| July `5389a9c7…` `processed_at` | **Still NULL** (historical safety PASS) |
| PM2/API/Redis | **PASS** (Redis PONG; API healthy) |

### Y. Historical safety

**PASS** — July 20 canonical event `5389a9c7-33c3-4f50-ba07-0338da4841d6` still `processed_at = NULL`; no historical replay or mutation.

### Z. Final gate verdict

| Gate | Verdict |
|------|---------|
| Fresh snapshot after T0 before unplug | **PASS** |
| Real post-cutover unplug webhook | **PASS** |
| Inbox created | **PASS** |
| BullMQ enqueue | **FAIL** (`enqueue_failed`) |
| Worker processed | **FAIL** |
| Canonical event + processedAt | **FAIL** |
| Episode OPEN | **FAIL** |
| Recovery snapshot newer than unplug | **PASS** (observed) |
| Snapshot-based episode RESOLVE | **NOT OBSERVED** |
| Historical safety | **PASS** |
| **REAL UNPLUG PROCESSING** | **FAIL** |
| **SNAPSHOT-BASED RECOVERY** | **NOT YET OBSERVED** |
| **EPISODE OPEN** | **FAIL** |
| **EPISODE AUTO-RESOLVE** | **NOT YET OBSERVED** |
| **PRODUCTION CONNECTIVITY PROCESSING GATE** | **FAIL** |
| **P0 CONNECTIVITY FOUNDATION** | **NOT PRODUCTION READY** |

**Blocker:** BullMQ job enqueue failure prevents inbox → worker → canonical event → episode lifecycle. Scheduler retries observed but enqueue repeatedly fails. **Do not manually repair during acceptance test.**

**Production mutations:** Natural pipeline only (2 inbox rows from real DIMO webhooks; scheduler retry metadata updates).

**Next step (out of scope for this test):** Investigate/fix BullMQ `connectivity.webhook.process` enqueue failure on Production, then re-run physical acceptance test.

**Pre-deploy verdict (superseded):**
```
PRODUCTION PROCESSING GATE: FAIL (pre-deploy)
P0.2 READY: NO-GO
```

---

## U. BullMQ Enqueue Root Cause + Controlled Production Recovery (2026-08-25)

### Root cause (proven)

| Item | Evidence |
|------|----------|
| **Exact failure** | BullMQ v5 rejects custom `jobId` values containing `:` |
| **Exact exception** | `Custom Id cannot contain :` |
| **Causal chain** | HTTP webhook → inbox `RECEIVED` → `DeviceConnectionWebhookQueueProducer.enqueue()` → `queue.add({ jobId: 'connectivity-webhook:{inboxId}' })` → exception → `DeviceConnectionWebhookInboxEnqueueService` marks `RETRYABLE_FAILED` / `enqueue_failed` → worker never reached |
| **Redis** | Healthy (PONG); not root cause |
| **Producer/worker drift** | None — same `BullModule.forRootAsync` (`REDIS_HOST=localhost`, `REDIS_PORT=6379`, `REDIS_DB=0`), queue `connectivity.webhook.process`, job name `process` |

**Faulty code (pre-fix):** `device-connection-webhook-queue.producer.ts` `buildJobId()` returned `connectivity-webhook:${inboxId}`.

**Fix:** Replace `:` delimiters with `__` → `connectivity-webhook__${inboxId}` (replay: `connectivity-webhook-replay__${inboxId}__${timestamp}`).

### Deploy

| Field | Value |
|-------|-------|
| Production SHA before | `a483ab72` (release `20260825195646_v4994`) |
| Fix commit | `655f9dbe` |
| Production SHA after | `655f9dbe` (release `20260825221549_v4994`) |
| Deploy timestamp (UTC) | `2026-08-25T22:21:40Z` |
| Affected service | `synqdrive` PM2 (single process: API + workers) |
| Failed inbox rows before | 2 (`RETRYABLE_FAILED`, `enqueue_failed`, attempts=0) |
| Failed inbox rows after | 0 |

### Natural retry recovery (KS MX 2024)

**No manual inbox mutation, enqueue, or worker invocation.**

Scheduler discovered `RETRYABLE_FAILED` rows ~50s after deploy:

| Inbox ID | Status after | processedAt | processing_attempts | domainEventId |
|----------|--------------|-------------|---------------------|---------------|
| `38e7951d-58a0-4eb4-9f55-de88a94348f1` | `PROCESSED` | `2026-08-25T22:22:30.067Z` | 1 | `b0f4ffc3-5edb-4d50-a879-a1bd51f4c75d` |
| `0d4cc578-b377-4de5-84e1-db9eac7b7a4f` | `PROCESSED` | `2026-08-25T22:22:30.072Z` | 1 | `ecaaab0d-4b41-424b-9ead-137c15328285` |

**Canonical events:** 2 `OBD_DEVICE_UNPLUGGED` (distinct provider `dedup_bucket` values — two real provider notifications).

**Episode:** 1 OPEN (`b256bb09-86ce-4676-a197-76dd7ea5871b`, `openedAt=2026-08-25T20:41:54Z`, `openedReason=OBD_DEVICE_UNPLUGGED_WEBHOOK`). **No duplicate OPEN episodes.**

### Recovery snapshot / episode RESOLVE

| Check | Result |
|-------|--------|
| Post-replug snapshot exists | **YES** (`source_timestamp=2026-08-25T20:53:45Z`, latest `20:56:39Z`) |
| Telemetry recovery observations | **0** (none created after episode opened at 22:22:30) |
| Episode RESOLVED | **NO** (still `OPEN` at 22:27:54Z observation) |
| Architecture contract | Snapshot-based recovery runs **prospectively** via `dimo-snapshot.processor` → `tryResolveFromSustainedTelemetry()`; pre-existing recovery snapshots ingested before episode creation are **not** retroactively replayed through the live pipeline |
| Manual reconciliation | **Not invoked** (out of scope / prohibited for acceptance) |

**Conclusion:** Unplug → canonical event → OPEN episode is **proven**. Snapshot-based auto-RESOLVE from the already-persisted recovery evidence **cannot be demonstrated** on this delayed test without a second physical cycle or manual historical reconciliation apply.

### KS MX P0.1 / P0.2 / P0.3 / P0.4 (post-recovery processing)

| Layer | State |
|-------|-------|
| **P0.1** `providerLinkState` | `UNKNOWN` (consent gap) |
| **P0.1** `telemetryState` | `standby` |
| **P0.1** `physicalDeviceState` | `PLUGGED_INFERRED` |
| **P0.1** `overallState` | `UNKNOWN` (`STATE_CONFLICT` — open episode + reconnection evidence) |
| **P0.2** `businessState` | `AVAILABLE` |
| **P0.2** `operationalAvailability` | `NEEDS_VERIFICATION` |
| **P0.2** `primaryReason` | `CONNECTIVITY_VERIFICATION_REQUIRED` |
| **P0.3** fleet `operationalAvailability.state` | `NEEDS_VERIFICATION` |
| **P0.3** `attention` | `ACTION_REQUIRED` |
| **P0.4** health | `PARTIALLY_EVALUABLE` → **Eingeschränkt bewertbar**; `wouldShowEvaluableGood=false` (no stale Gut regression) |

### Blast radius / safety

| Check | Result |
|-------|--------|
| Unexpected canonical event explosion | **NO** (exactly 2 new events for KS MX) |
| Duplicate OPEN episodes | **NO** (1) |
| Cross-tenant contamination | **NO** |
| Historical inbox replay storm | **NO** |
| July `5389a9c7…` `processed_at` | **Still NULL** |
| Global `RETRYABLE_FAILED` inbox | **0** |
| Global OPEN episodes | **1** (KS MX only) |

### Tests (fix validation)

| Suite | Result |
|-------|--------|
| `device-connection-webhook-queue.producer.spec.ts` | **PASS** (incl. colon-safe job id test) |
| `device-connection-webhook-inbox-enqueue.service.spec.ts` | **PASS** |
| `device-connection-webhook-inbox-scheduler.service.spec.ts` | **PASS** |
| `device-connection-webhook-processing.service.spec.ts` | **PASS** |
| `npm run build` | **PASS** |
| Connectivity regression (`connectivity-consumer-migration.spec.ts`) | 2 pre-existing failures (unrelated `overallState` mapping) |

### Gate verdict (post-fix)

| Gate | Verdict |
|------|---------|
| BullMQ enqueue | **PASS** |
| Worker / canonical event / episode OPEN | **PASS** |
| Snapshot-based episode RESOLVE | **NOT OBSERVED** |
| Full end-to-end lifecycle | **INCOMPLETE** |
| **PRODUCTION CONNECTIVITY PROCESSING GATE** | **CONDITIONAL** |
| **P0 CONNECTIVITY FOUNDATION** | **NOT PRODUCTION READY** (recovery lifecycle unproven) |
| **SECOND PHYSICAL TEST REQUIRED** | **YES** |

---

## Changes / Architektur

- **Changes:** `ChangesView.tsx` — production processing gate entry
- **Architektur:** `architecture/VEHICLE_OPERATIONAL_STATE_PROVENANCE_2026-08.md` — webhook processing lifecycle section
