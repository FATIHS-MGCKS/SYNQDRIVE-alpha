# TDL-OQ-001 — COMPLETED → Driving Intelligence durable handoff audit

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ001-HANDOFF-001 |
| **Audited at (UTC)** | `2026-09-25` |
| **REPO_CURRENT** | `f87391f798709bf686fb03f8f2b65727907b410d` (`origin/main` post PR #1764) |
| **PRODUCTION_CURRENT** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `20260924235024_v4994` |
| **Verdict** | **`RESOLVED_WITH_BOUNDED_GAPS`** |
| **OQ-001 status after** | **`PARTIALLY_RESOLVED`** — contract documented; bounded recovery/edge-case gaps remain |
| **Runtime changes** | **NONE** (read-only Production Postgres + repository trace) |

## Question (authority)

What is the exact durable transition from a trip finalized to **`tripStatus=COMPLETED`** by **`TripDecisionEngine.finalizeTrip()`** (or **`finalizeRepairedTrip()`**) to downstream **Driving Intelligence V2** processing?

## Phase 1 — Canonical lifecycle commit

### Lifecycle owner

| Role | Owner |
|------|--------|
| **`vehicleTrip.tripStatus` → COMPLETED** | **`TripDecisionEngine`** only (`TRIP_OWNERSHIP.ts`) |
| **Live finalize caller** | `TripDetectionOrchestrationService` — `processFinalize` / FINALIZE BullMQ trigger |
| **Repair finalize caller** | `TripReconciliationService` → `finalizeRepairedTrip()` then `enqueueRepairEnrichment()` |

### `WHEN_IS_TRIP_COMPLETED_DURABLE`

**Classification: B — immediate PostgreSQL commit per `prisma.vehicleTrip.update` (not in a shared transaction with DI enqueue).**

`finalizeTrip()` performs a single `vehicleTrip.update` setting `tripStatus=COMPLETED`, `endTime`, end metadata, and initializes analysis-facing fields including **`tripAnalysisStatus: 'PENDING'`** (`trip-decision.engine.ts`).

There is **no** enclosing `$transaction` coupling trip completion to `DrivingAnalysisRun` / `DrivingIntelligenceJob` / BullMQ.

### Ordered flow (normal FSM FINALIZE — code-proven)

```
FINALIZE (trip-tracking processor)
  → TripDetectionOrchestrationService.processFinalize(...)
  → [pre-write admission gates]
  → TripDecisionEngine.finalizeTrip(tripId, meta)     ← COMPLETED durable (PG commit)
  → TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion({ source: LIVE_FINALIZE })  ← awaited, same process
       → EventTripAssociationService.reconcileFinalizedTrip (best-effort)
       → DrivingAnalysisInitService.initializeForCompletedTrip(...)
            → DrivingAnalysisRun resolveOrBeginRun (PG)
            → DrivingAnalysisStageOrchestrator initializeStages + enqueueReadyStages
            → DrivingIntelligenceJobRepository.persistOrGet (PG, status PENDING)
            → DrivingIntelligenceJobDispatcherService.enqueue → BullMQ `driving.intelligence.jobs`
  → TripEnrichmentOrchestrator.enqueueBehaviorEnrichment(...)  ← **separate** legacy queue (fire-and-forget `.catch`)
  → transitionState(RESTING) + battery/shutdown side effects
```

**Gap:** Steps after `finalizeTrip()` are **not** atomic with the COMPLETED commit.

## Phase 2 — Post-finalize producer inventory

| Consumer | Trigger | Sync/Async | Queue | Durable intent? | Retry | Idempotent? | Owner |
|----------|---------|------------|-------|-----------------|-------|-------------|-------|
| **DI V2 init** | `produceAfterPersistedCompletion` | Awaited async in finalize process | `driving.intelligence.jobs` | **YES** — `driving_analysis_runs` + `driving_intelligence_jobs` | Bull + PG retry fields | **YES** — run fingerprint + job idempotency keys | **Driving Intelligence** |
| **Legacy HF behavior** | `enqueueBehaviorEnrichment` after finalize | Fire-and-forget | `trip.behavior.enrichment` | Partial — `behaviorEnrichmentStatus` | Bull attempts | jobId `hf-enrich-{tripId}` | **KG-ATE / enrichment orchestrator** (parallel, not DI V2) |
| **Driving impact (legacy chain)** | Chained from behavior processor | Async | `trip.driving-impact.compute` | Separate status fields | Bull | trip-scoped | **DI / impact** (legacy) |
| **Rental DI recompute** | After init / stage complete | `void` enqueue | (rental recompute queue) | Separate contract | — | correlation id | **Rental driving analysis** |
| **Battery LV rest / shutdown evidence** | After RESTING transition | Awaited / best-effort | Battery queues | Separate | — | — | **Battery V2** |

**Canonical COMPLETED → DI V2 handoff** is **`TripPostFinalizeAnalysisProducer` → `DrivingAnalysisInitService.initializeForCompletedTrip`** — not the legacy behavior queue.

Sources passed to init: `LIVE_FINALIZE` | `MID_GAP_SPLIT` | `REPAIR_FINALIZE` (`driving-analysis-init.types.ts`).

## Phase 3 — Driving Intelligence ingress

| Field | Value |
|-------|-------|
| **Queue** | `driving.intelligence.jobs` (`QUEUE_NAMES.DRIVING_INTELLIGENCE`) |
| **Worker** | `DrivingIntelligenceJobProcessor` (`@Processor`, concurrency **2**, lockDuration 120s) |
| **Dispatch service** | `DrivingIntelligenceJobProcessorService.processPersistentJobForWorker` |
| **First pipeline job type** | **`DIMO_TRIP_SEGMENT_VALIDATE`** (`DRIVING_INTELLIGENCE_PIPELINE_START_JOB` / stage `SEGMENT_VALIDATE`) |
| **Stage chain** | Orchestrator enqueues ready stages; `onJobCompleted` chains further stages (`DrivingAnalysisStageOrchestratorService`) |
| **Bull payload** | `{ persistentJobId, jobType, organizationId }` |
| **Bull jobId** | `buildBullJobId(persistentJob.id)` |
| **PG idempotency** | `trip-init:{tripId}:{modelVersion}:{jobType}` and `stage:{tripId}:{modelVersion}:{stageKey}:{fingerprint}` |
| **attempts / backoff** | `DRIVING_INTELLIGENCE_JOB_DEFAULT_MAX_ATTEMPTS`, exponential backoff (`driving-intelligence-jobs.dispatcher.service.ts`) |
| **removeOnComplete** | **true** (Bull) |
| **Multi-replica** | Any replica may run workers; **persistent job row + idempotency** dedupe enqueue; processor skips terminal statuses |

## Phase 4 — Persistence state machine (trip-facing)

### Trip row (canonical customer + coordinator)

| Field | Set at finalize | Updated by |
|-------|-----------------|------------|
| `tripStatus` | `COMPLETED` | `TripDecisionEngine` |
| `tripAnalysisStatus` | `PENDING` | `TripDecisionEngine`; then coordinator / legacy enrichment |
| `analysisQueuedAt` / `analysisStartedAt` / … | — | `TripAnalysisCoordinatorService` (primarily via **legacy** `onAnalysisEnqueued` when behavior queue enqueues) |
| `analysisStagesJson` | — | Coordinator + DI stage handlers (via enrichment pipeline) |
| `behaviorEnrichmentStatus` | `PENDING` at finalize | `TripEnrichmentOrchestrator` |
| `drivingImpactStatus` | `PENDING` at finalize | Impact pipeline |

**Important:** DI V2 init does **not** require `tripAnalysisStatus` to leave `PENDING` immediately; **`DrivingAnalysisRun`** + **`DrivingIntelligenceJob`** rows are the **durable DI handoff intent**.

### DI durable rows

| Model | Role |
|-------|------|
| `DrivingAnalysisRun` | Trip×modelVersion analysis run (`TRIP_ENRICHMENT`, fingerprint idempotent) |
| `DrivingAnalysisStage` | Per-stage status for V2 DAG |
| `DrivingIntelligenceJob` | Durable job ledger (`PENDING` → `ENQUEUED` → `IN_PROGRESS` → terminal) |

Coordinator states (`PENDING` / `IN_PROGRESS` / `PARTIAL` / `COMPLETED` / `FAILED` / `SKIPPED`) are documented in `trip-analysis-status.ts` and **`TripAnalysisCoordinatorService`**.

## Phase 5 — Atomicity gap audit

| Question | Answer |
|----------|--------|
| **A — DB completion + queue enqueue atomic?** | **NO** |
| **Transactional outbox?** | **NO** |
| **Persisted handoff intent before BullMQ?** | **YES** — `DrivingAnalysisRun` + `DrivingIntelligenceJob` (`status=PENDING`) created before `queue.add` |
| **Recovery for COMPLETED without run?** | **YES** — `DrivingAnalysisReconciliationService` check **`TRIP_WITHOUT_ANALYSIS_RUN`** → `initializeForCompletedTrip(..., REPAIR_FINALIZE)` |
| **Recovery for PENDING job not enqueued?** | **YES** — **`PENDING_JOB_RETRY`** + `DrivingAnalysisInitService.retryPendingJobsForTrip` |
| **Recovery owner** | **Driving Intelligence** (`DrivingAnalysisReconciliationScheduler`, leader-gated) |
| **Recovery trigger** | `@Interval(600_000)` (10 min) + per-org scan |
| **Recovery bound** | **14-day** lookback, **100** actions/run, **50** orgs/tick — not unbounded |
| **Can orphan persist forever?** | **Unlikely within lookback** if orgId present; **edge:** missing `organizationId` skips init with **no** DI reconciliation trigger documented for that skip |

**Crash window (COMPLETED committed, init not run):** **RECOVERABLE** via periodic DI reconciliation (bounded).

**Terminal FSM recovery (`resolveTerminalRestingRecoveryWake`):** Re-schedules **FINALIZE** when RESTING transition failed but trip is durably terminal — **does not** directly call DI init; relies on subsequent finalize path or DI reconciliation if init never ran.

## Phase 6 — Scenario matrix (code-based)

| # | Scenario | Verdict |
|---|----------|---------|
| 1 | Finalize OK, DI enqueue OK, worker OK | **SAFE** |
| 2 | Finalize OK, DI enqueue fails (queue down) | **RECOVERABLE** — PG `PENDING` job + `PENDING_JOB_RETRY` / init queueErrors logged |
| 3 | Finalize OK, job durable, crash before return | **RECOVERABLE** — reconciliation / retry |
| 4 | Worker double delivery | **DUPLICATE_SAFE** — terminal job skip + idempotency |
| 5 | Worker crash mid-handler | **RECOVERABLE** — retry / dead-letter + stage failure hooks |
| 6 | Finalize retried after COMPLETED | **DUPLICATE_SAFE** — init dedupe on run/job keys |
| 7 | Repair/reconciliation completion | **SAFE** — same producer, `REPAIR_FINALIZE` |
| 8 | Two replicas finalize (lock) | **SAFE** — vehicle worker lock serializes FSM; DI idempotent |
| 9 | Redis outage at enqueue | **RECOVERABLE** — persisted PENDING jobs |
| 10 | COMPLETED + analysis PENDING/FAILED long-lived | **RECOVERABLE** within reconciliation rules; **not** auto-infinite |

## Phase 7 — Completion path matrix

| Completion path | DI handoff via canonical producer | Recovery if missed | Idempotent | Verdict |
|-----------------|-----------------------------------|--------------------|------------|---------|
| Normal FSM FINALIZE | **YES** (`LIVE_FINALIZE`) | DI reconciliation | **YES** | **SAFE** |
| Live mid-gap split (trip 1) | **YES** (`MID_GAP_SPLIT`) | DI reconciliation | **YES** | **SAFE** |
| Reconciliation repair finalize | **YES** (`REPAIR_FINALIZE`) | DI reconciliation | **YES** | **SAFE** |
| Boundary repair refresh | **YES** (`REPAIR_FINALIZE`) | DI reconciliation | **YES** | **SAFE** |
| Retroactive intra-gap split repair | **YES** (`enqueueRepairEnrichment`) | DI reconciliation | **YES** | **SAFE** |
| Missing `organizationId` at finalize | **SKIP** (producer returns null) | **GAP** — no documented DI scan for this skip | — | **GAP** |

## Phase 8 — Production read-only audit

**Window:** COMPLETED trips with `end_time` in last **14 days** (matches DI reconciliation lookback).

| Metric | Value |
|--------|-------|
| **COMPLETED trips (14d)** | **210** |
| **COMPLETED without `TRIP_ENRICHMENT` run** | **0** |
| **COMPLETED with `trip_analysis_status=PENDING`** | **0** |
| **Suspected orphans (per derived definition)** | **0** |
| **Confirmed orphans** | **0** |

**Derived “expected DI processing” (audit window):** existence of ≥1 `driving_analysis_runs` row with `analysis_type='TRIP_ENRICHMENT'` for the trip (same predicate as reconciliation **`TRIP_WITHOUT_ANALYSIS_RUN`** inverted).

## Phase 9 — Natural temporal ordering (3 samples)

All three recent COMPLETED trips show **`DIMO_TRIP_SEGMENT_VALIDATE.requested_at` == `vehicle_trips.end_time`** (ms precision), with **`FINALIZATION_CHECK` tracking run** seconds later and analysis runs completing within minutes.

| Trip ID | `end_time` (UTC) | First DI job `requested_at` | `FINALIZATION_CHECK` (latest) |
|---------|------------------|----------------------------|-------------------------------|
| `81223168-01fb-4d68-97a1-2e05eec45c7f` | `2026-09-25 06:02:09.96` | `2026-09-25 06:02:09.96` | `2026-09-25 06:10:31.882` |
| `53830505-3188-4de3-ad03-d2eb75ff5f29` | `2026-09-25 04:16:49.411` | aligned to `end_time` (prod sample) | follows within minutes |
| `995bae51-428e-4f84-a650-ffb2ddafca48` | `2026-09-24 20:57:08.772` | aligned to `end_time` (prod sample) | follows within minutes |

**Limitation:** PM2/application log ordering not captured in this audit — ordering proof is **DB timestamp correlation**, not log trace.

## Phase 10 — Cross-authority ownership

### Trip Detection & Lifecycle owns

- Live/repair **trip boundary** and **`tripStatus=COMPLETED`** commit via **`TripDecisionEngine`**
- **Invoking** `TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion` on canonical completion paths (FSM finalize, mid-gap segment 1, reconciliation repairs)
- **Not** owning DI stage semantics, scoring, or V2 handler logic

### HANDOFF CONTRACT (durable)

```
TDL: VehicleTrip.tripStatus=COMPLETED persisted
  → TripPostFinalizeAnalysisProducer (requires organizationId)
  → DrivingAnalysisInitService.initializeForCompletedTrip
  → DrivingAnalysisRun + DrivingIntelligenceJob rows (PG)
  → BullMQ driving.intelligence.jobs
```

### Driving Intelligence owns

- Everything after **`initializeForCompletedTrip`** acceptance: runs, stages, jobs, handlers, retries, **`DrivingAnalysisReconciliationService`**
- **`tripAnalysisStatus` coordinator semantics** (partially shared write surface with legacy enrichment)

### ATE (legacy parallel)

- **`trip.behavior.enrichment`** queue and **`TripEnrichmentOrchestrator`** — **separate** from DI V2 canonical handoff (`AUTHORITY_BOUNDARIES.md`: ATE references DI init via producer)

**ATE_PIPELINE_SEPARATED:** **YES** for canonical DI V2 — legacy behavior/driving-impact queues are parallel, not substitutes.

## Phase 11 — Bounded gaps (not runtime defects)

1. **Non-atomic** COMPLETED commit vs DI enqueue — mitigated by **persisted jobs + 10m reconciliation**, bounded **14d** lookback.
2. **Missing `organizationId`** skips DI init entirely — **no** proven recovery path in DI reconciliation scan.
3. **Dual analysis surfaces** — legacy behavior enqueue + DI V2 init both run post-finalize; UI `tripAnalysisStatus` may track legacy coordinator more visibly than DI run rows.
4. **Production temporal proof** — DB-correlated only (3 trips); not full log-based E2E seal.
5. **Terminal FINALIZE recovery wake** re-schedules FSM finalize — **not** a direct DI init replay (DI reconciliation still covers missing runs).

## Explicit non-claims

- **NOT** claiming transactional exactly-once handoff.
- **NOT** claiming zero duplicate BullMQ deliveries (only idempotent processing).
- **NOT** closing unrelated open questions (TDL-OQ-006, DI production SLOs, etc.).
