# Phase 3A.1 — DIMO LTE_R1 Flight Recorder Foundation + Pre-Recorder Preflight

**Date:** 2026-08-31  
**Status:** DONE (correction pass complete)  
**Authority:** `DIMO_LTE_R1_REFERENCE_MANIFEST` v1.1.0  
**Branch:** `cursor/dimo-phase-3a1-flight-recorder-foundation-7d78`

---

## Status summary

| Flag | Value |
|------|-------|
| **Phase 3A.1** | **DONE** |
| **READY_FOR_DEPLOYMENT_PREFLIGHT** | **READY** (when runtime readiness checks pass at preflight) |
| **REFERENCE_DRIVE_READINESS** | **BLOCKED** (requires post-deploy vehicle canary — not executed in this PR) |

**No reference drive executed.** No scoring formula changes.

---

## Main reconciliation (2026-08-31)

| Item | Value |
|------|-------|
| **Main SHA incorporated** | `bfcf9ddb7e18b04d57e9b241883457ec9864ebc5` |
| **PR head before reconciliation** | `53061268f0fd1e90fcc117e7e9c6c4a8508c936f` |
| **Merge-base** | `1474bc7d98652b41291159d9bd987e9cb064201b` |
| **Conflicted files** | `frontend/src/master/components/ChangesView.tsx` only |
| **Resolution** | Semantic union: preserve P1.8.1 + P1.8 soak entries from main and Phase 3A.1 entry from #1468 (newest-first in `FALLBACK_ENTRIES`) |
| **ArchitekturView** | Auto-merged cleanly — all three workstream entries present |
| **Migration `20260831210000`** | PostgreSQL `--` comment preserved; no regression |

Main commits incorporated: #1469 (P1.8 soak audit), #1470 (P1.8.1 remediation), #1471 (P1.8.2 scale-to-2).

**Second reconciliation (post-#1471):** merged `58c7d8777` — single conflict in `ChangesView.tsx` (semantic union: Phase 3A.1 + P1.8.2 + P1.8.1 + P1.8 soak). `ArchitekturView.tsx` auto-merged with all four entries.

---

## 1. Purpose

First **implementation** phase of the Driving Intelligence Reconstruction workstream. Delivers an isolated DIMO LTE_R1 reference-capture (Flight Recorder) foundation with:

- Dynamic broad per-vehicle observation discovery **and** matching dynamic acquisition
- Temporal-class-driven acquisition surfaces (not uniform 1 Hz polling)
- Autonomous BullMQ recording runner (not manual `/tick` as primary mechanism)
- Session-scoped incremental native event watermark + stable provider event identity
- True HTTP ingress timing at Axios response boundary (RP-039)
- Durable observation writer with retry and session FAILED on terminal persist failure
- Evidence-based session readiness assessment
- Versioned wire/storage contract + replayable Postgres persistence

---

## 2. Implementation paths

| Component | Path |
|-----------|------|
| Module root | `backend/src/modules/vehicle-intelligence/reference-capture/` |
| REST API | `GET/POST …/organizations/:orgId/vehicles/:vehicleId/reference-capture/…` |
| Feature gate | `REFERENCE_CAPTURE_ENABLED` (default `false`) |
| Autonomous runner | `reference.capture.recording` BullMQ queue + `ReferenceCaptureProcessor` |
| Dynamic query builder | `reference-capture-query-builder.ts` |
| Temporal planner | `reference-capture-acquisition-planner.ts` |
| Readiness | `reference-capture-readiness.service.ts` |
| Env config | `backend/src/config/reference-capture.config.ts` |
| Prisma models | `ReferenceCaptureSession`, `ReferenceCaptureObservation` |
| Migrations | `20260831180000_*`, `20260831200000_*`, `20260831210000_*` |
| DIMO category | `REFERENCE_CAPTURE` in `dimo-provider-category.types.ts` |
| Ingress timing | `DimoTelemetryService.postGraphQLWithHttpTiming()` → `synqReceivedAt = httpResponseReceivedAt` |
| Frozen manifest | `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json` |

---

## 3. Architecture (correction pass)

### 3.1 Broad discovery → broad acquisition

Preflight discovers `availableSignals` + dynamic `signalsLatest` keys via **`buildBroadReferenceSignalsLatestQuery()`** — not `buildLatestSnapshotQuery()`.

Acquisition uses the same dynamic builder per temporal surface. Fields absent from the static production snapshot (yaw, wheel speed, brake pressure, RPM, throttle, torque, gear, battery power, tire pressure, unknown future fields) are capturable when DIMO lists them.

Schema-validated GraphQL selections only (`reference-capture-signal-schema.registry.ts`).

### 3.2 Temporal acquisition execution

| Temporal class | Surfaces | Cadence |
|----------------|----------|---------|
| WAVEFORM_DYNAMICS, POWERTRAIN_DYNAMIC | `LATEST_LIVE` + `HF_HISTORICAL` | Every runner cycle |
| SLOW_PHYSICAL_CONTEXT, HEALTH_DIAGNOSTIC, SPATIAL_ROUTE | `LATEST_SLOW` | Every N cycles (`REFERENCE_CAPTURE_SLOW_CYCLE_EVERY`, default 6) |
| EVENT | `NATIVE_EVENT_INCREMENTAL` | Every runner cycle, session-scoped watermark |

`requestedCadenceMs` and `requestedInterval` preserved separately from empirical provider cadence.

### 3.3 Autonomous runner (correction 2)

| Property | Value |
|----------|-------|
| Session runner key | `refcap-session_{sessionId}` (traceability only — never reused as cycle jobId) |
| Cycle job ID | `refcap-cycle_{sessionId}_{cycleNumber}_{uuid}` — unique per physical cycle |
| Pending job | `pending_cycle_job_id` on session |
| Chain | cycle completes → schedule next with **new** jobId + delay |
| Concurrency | processor concurrency=1; DB `activeCycleJobId` lock |
| Start | READY → **STARTING** → enqueue → RECORDING (compensated on failure) |
| Stop | STOPPING (authoritative) → cancel pending delayed job → flush → COMPLETED |

Manual `POST /tick` remains diagnostic only.

### 3.4 Event watermark / dedup

- First event window: `sessionStartedAt` (no 24h pre-roll)
- Incremental: `eventWatermarkAt - 2s overlap`
- Stable identity: SHA256 fingerprint (`providerEventFingerprint`)
- Duplicate retrievals flagged in provenance (`duplicateRetrieval: true`) — not counted as new physical events

### 3.5 Request identity

| ID | Scope |
|----|-------|
| `captureCycleId` | One acquisition cycle (may include multiple HTTP requests) |
| `requestCorrelationId` | Per provider HTTP request (snapshot, HF, events) |
| `sequenceNumber` | Session-global monotonic (`REFERENCE_CAPTURE_SEQUENCE_SCOPE = SESSION_GLOBAL`) |

### 3.6 Timestamp contract (RP-039)

- `synqReceivedAt` = `httpResponseReceivedAt` at Axios `client.post()` return
- `processingCompletedAt` / `requestCompletedAt` tracked separately
- Not DB insert time

### 3.7 Writer durability

- `flush()` retries with exponential backoff; batch not spliced until persist succeeds
- Terminal failure → `ReferenceCapturePersistenceError` → session **FAILED**

### 3.8 Retention / storage (corrected arithmetic)

**Logical envelope estimate** (80 signals @ 1 Hz, 512 B/observation):

- 80 × 60 obs/min × 60 min = **288,000 observations/hour**
- 512 × 288,000 = **147,456,000 bytes ≈ 147 MB/hour** (not ~1.4 GB)

**PostgreSQL physical estimate** (multiplier ~2.5× for tuple/JSONB/index overhead):

- ≈ **368 MB/hour** at same assumptions

Purge: `ReferenceCaptureRetentionService.purgeExpiredObservations()` with `created_at` index. Scheduled purge only when `REFERENCE_CAPTURE_RETENTION_SCHEDULER_ENABLED=true` (cron 04:30 UTC).

### 3.9 Evidence-based readiness

`ReferenceCaptureReadinessService` + `ReferenceCaptureRuntimeHealthService`:

- **deploymentPreflightReady** — gates session READY (queue, Postgres, manifest match, query compile, instrumentation)
- **referenceDriveReady** — always false until post-deploy vehicle canary (`reference_drive_canary_not_executed` blocker)

Mass absence → warning only unless brake-kinetic validation explicitly required.

---

## 4. PRE_RECORDER_BLOCKER matrix

| ID | Status | Evidence |
|----|--------|----------|
| **RP-010** | **RESOLVED** | Durable batch writer + backpressure + corrected volume math + integration TEST G |
| **RP-039** | **RESOLVED** | Axios HTTP boundary in `postGraphQLWithHttpTiming` + ingress timing spec |
| **RP-040** | **RESOLVED** | Envelope v1.0.0 + contract spec |
| **RP-044** | **RESOLVED** | Mass binding service; no invented runtime mass |
| **RP-045** | **RESOLVED** | 180-day policy + corrected estimates + optional retention scheduler |

---

## 5. Test coverage

| Test file | Coverage |
|-----------|----------|
| `reference-capture-correction-2.spec.ts` | Tests H–R: BullMQ IDs, transient retry, schema quarantine, HF identity, serialization |
| `reference-capture-runner.live.integration.spec.ts` | TEST H Redis/BullMQ lifecycle (`REFERENCE_CAPTURE_REDIS_INTEGRATION=1`) |
| `reference-capture-ingress-timing.spec.ts` | TEST F: HTTP boundary |
| `reference-capture.contract.spec.ts` | Wire format, unmapped retention |
| `reference-capture-preflight.service.spec.ts` | Dynamic broad discovery |
| `reference-capture-observation-writer.service.spec.ts` | Batching, backpressure, persist failure |
| `reference-capture-retention.service.spec.ts` | Corrected arithmetic, purge |
| `reference-capture-session.service.spec.ts` | Lifecycle, readiness, runner start/stop |
| `reference-capture-mass-binding.service.spec.ts` | RP-044 |

**42 unit tests passing** (+1 env-gated Redis integration test).

---

## 7. Readiness

**READY_FOR_DEPLOYMENT_PREFLIGHT = READY** when runtime infrastructure checks pass at preflight.

**REFERENCE_DRIVE_READINESS = BLOCKED** until post-deploy vehicle canary confirms ≥3 autonomous cycles on actual LTE_R1 hardware.

**Phase status:** Phase 3A.1 **DONE** · Phase 3A Ground Truth reference drive execution **NOT STARTED**
