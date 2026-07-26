# Master Admin Remediation — Phase 2D.6: ClickHouse Analytics Pipeline

**Date:** 2026-07-26  
**Status:** End-to-end pipeline analysis — **no runtime or schema changes**  
**Prerequisites:** [2D.1 Runtime](./clickhouse-runtime-analysis.md) · [2D.3 Integrity](./clickhouse-data-integrity.md) · [2D.4 Tenant](./clickhouse-tenant-isolation.md) · [2D.5 Performance](./clickhouse-performance.md)  
**Constraint:** Documentation and read-only audit tooling only

---

## Executive summary

| Dimension | Assessment | Primary risk |
|-----------|------------|--------------|
| **Completeness** | PG = canonical; CH = optional mirror | Post-trip mirrors off by default (`HF_MIRROR_ENABLED`, `WAYPOINT_MIRROR_ENABLED`, `ACTIVITY_WINDOW_MIRROR_ENABLED`) |
| **Latency** | ~30s poll cadence + async CH write | CH mirror lags PG by seconds; no backfill queue for missed CH rows |
| **Duplicate events** | Append-only tables accept dupes; ReplacingMergeTree tables re-insert safe | Snapshot/state-change rows duplicate on retry; HF points guarded by `hasTripHfPoints` |
| **Lost events** | CH writes are best-effort | Outage during write = permanent gap (no DLQ) |
| **Ordering** | Per-vehicle `jobId` dedup; VLS monotonic guard | Cross-vehicle unordered; stale DIMO snapshots skipped before CH |
| **Retry** | BullMQ 3× exponential backoff on snapshot/enrichment jobs | CH mirror not retried independently of job success |
| **Idempotency** | Partial — trip-scoped guards on HF/waypoints; none on snapshots | Job retry after PG upsert can duplicate CH snapshot rows |

**Verdict:** The pipeline is architecturally sound for an **analytics mirror** — PostgreSQL and DIMO Segments remain canonical. ClickHouse failures must not block operations, and the code honors that. The main remediation gaps are **mirror durability** (no CH write queue), **snapshot idempotency**, and **feature-flag coverage** (HF/waypoint/activity mirrors default off).

**Live VPS:** Not verified in this phase (SSH blocked from Cloud Agent). Run `vps-clickhouse-pipeline-audit.sh` and paste results into [§12](#12-live-audit-results-placeholder).

---

## 1. Pipeline overview

### 1.1 Canonical flow (live telemetry)

```
DIMO GraphQL (signalsLatest)
        │
        ▼
DimoSnapshotScheduler (@Interval 30s)
        │  jobId = snapshot-<vehicleId> (dedup)
        ▼
BullMQ QUEUE_NAMES.DIMO_SNAPSHOT
        │  concurrency 5, lockDuration 60s, attempts 3
        ▼
DimoSnapshotProcessor
        ├─► PostgreSQL vehicle_latest_states (upsert, awaited)
        ├─► TripDetectionOrchestrationService (FSM, awaited)
        ├─► ClickHouseTelemetryService (fire-and-forget)
        │       ├─ telemetry_snapshots
        │       └─ telemetry_state_changes (if previous state exists)
        └─► dimo_poll_log (SUCCESS/FAILURE)
```

### 1.2 Post-trip enrichment flow

```
Trip finalize (PostgreSQL vehicle_trips)
        │
        ▼
BullMQ TRIP_BEHAVIOR_ENRICHMENT
        │  attempts 3, exponential backoff 5s
        ▼
TripBehaviorEnrichmentProcessor
        └─► TripEnrichmentOrchestratorService.runEnrichmentSync
                ├─► DIMO Segments HF fetch (canonical trip boundary)
                ├─► PostgreSQL trip scores, events, waypoints (canonical)
                ├─► HfMirrorService (HF_MIRROR_ENABLED=true only)
                │       ├─ telemetry_hf_points
                │       ├─ telemetry_hf_windows
                │       └─ telemetry_hf_events
                └─► TripChEvidenceMirrorCoordinator
                        ├─ WaypointMirrorService (WAYPOINT_MIRROR_ENABLED)
                        │     └─ telemetry_waypoints (from PG waypoints)
                        └─ ActivityWindowProducerService (ACTIVITY_WINDOW_MIRROR_ENABLED)
                              └─ trip_activity_windows (derived from CH snapshots)
```

### 1.3 Read path (analytics → dashboard)

```
ClickHouse tables
        │
        ├─► ClickHouseAnalyticsService (segment detectors, activity windows)
        ├─► ClickHouseHfService (HF availability, frequency)
        ├─► SignalQualityReadService / TripEvidenceReadService
        └─► DataAnalyseService
                │
                ▼
GET /organizations/:orgId/data-analyse/*
        │
        ├─► Data Analyse UI (vehicle signals, HF, signal quality, pipeline view)
        ├─► Trip detail evidence panels (read-only)
        └─► Grafana synqdrive-driving-intelligence-v2.json (Prometheus metrics)
```

**Important:** Trip FSM, scores, and booking truth always come from PostgreSQL. ClickHouse assists detection/repair and powers analytical UIs only.

---

## 2. Hop-by-hop analysis

### 2.1 DIMO → Worker ingress

| Property | Value |
|----------|-------|
| **Source** | `DimoTelemetryService.fetchLatestVehicleSnapshot` via vehicle JWT |
| **Cadence** | 30s per CONNECTED vehicle (`DimoSnapshotScheduler`) |
| **Filter** | `status IN (AVAILABLE, RENTED)`, `connectionStatus = CONNECTED`, `tokenId` present |
| **Staleness** | VLS monotonic guard (`shouldApplyVlsTelemetryUpdate`) — stale provider timestamps skip full upsert **and CH mirror** |
| **Resume gap** | Tick gap > 3 min → one-shot `TripReconciliationService` backfill with `useDimoSegmentFallback: true` |

**Completeness:** Only vehicles matching scheduler filters are polled. DISCONNECTED / MAINTENANCE / inactive statuses are excluded.

**Lost events at ingress:** DIMO API failures throw → job fails → `dimo_poll_log` FAILURE. No local buffer of raw DIMO payloads beyond poll log metadata.

### 2.2 Queue layer (BullMQ / Redis)

| Queue | Producer | Consumer | jobId strategy | Retry |
|-------|----------|----------|----------------|-------|
| `dimo.snapshot.poll` | `DimoSnapshotScheduler` | `DimoSnapshotProcessor` | `snapshot-<vehicleId>` | Global default: 3 attempts, exp backoff 5s |
| `trip.behavior.enrichment` | Trip finalize / orchestrator | `TripBehaviorEnrichmentProcessor` | trip-scoped | Same global default |

**Global `defaultJobOptions`** (`app.module.ts`):

- `removeOnComplete: { count: 1000, age: 24h }`
- `removeOnFail: { count: 5000, age: 7d }`
- `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`

**Snapshot scheduler recovery:**

1. Each tick removes terminal-state jobs (`failed`/`completed`) before re-add — prevents permanent jobId blocking.
2. Hourly `queue.clean` on failed jobs older than 10 min.
3. Active jobs are never removed — duplicate add is skipped (healthy backpressure).

**Ordering:** Per-vehicle serialization via shared `jobId`. No cross-vehicle ordering guarantee. Concurrent workers (concurrency 5) process different vehicles in parallel.

**Duplicate jobs:** At most one active/waiting snapshot job per vehicle. Re-enqueue while active → silent skip (`duplicate` error swallowed).

### 2.3 Worker → PostgreSQL (canonical write path)

| Write | Timing | Failure behavior |
|-------|--------|------------------|
| `vehicle_latest_states` upsert | Awaited before CH mirror | Job throws → BullMQ retry |
| Trip FSM evaluation | Awaited | Job throws → retry |
| `dimo_poll_log` | Awaited end of job | Written on success or catch |
| Trip finalize / enrichment | Separate queue | Independent retry |

**Idempotency (PG):** `vehicle_latest_states` upsert by `vehicleId` is idempotent. Trip creation uses FSM guards + dedup counters (`duplicateCandidates` metric).

**Monotonic guard side effect:** When stale snapshot is rejected, only `providerFetchedAt` + `syncJobRef` update — **no CH write, no trip evaluation on stale data**. This is correct for ordering but means CH and PG both skip the stale payload.

### 2.4 PostgreSQL → ClickHouse (mirror write path)

| Table | Producer | Sync model | Idempotency | Default active |
|-------|----------|------------|-------------|----------------|
| `telemetry_snapshots` | `ClickHouseTelemetryService.insertSnapshot` | Fire-and-forget after PG upsert | **None** — append-only MergeTree | Yes (if `CLICKHOUSE_URL` set) |
| `telemetry_state_changes` | `detectAndInsertStateChanges` | Same | **None** — transition rows can repeat on retry | Yes |
| `telemetry_hf_points` | `HfMirrorService` | Post-trip async | `hasTripHfPoints` skip | **No** (`HF_MIRROR_ENABLED`) |
| `telemetry_hf_windows` | `HfMirrorService` | Post-trip | ReplacingMergeTree — re-insert safe | **No** |
| `telemetry_hf_events` | `HfMirrorService` | Post-trip | ReplacingMergeTree — re-insert safe | **No** |
| `telemetry_waypoints` | `WaypointMirrorService` | Post-trip | `hasTripWaypoints` skip | **No** (`WAYPOINT_MIRROR_ENABLED`) |
| `trip_activity_windows` | `ActivityWindowProducerService` | Post-trip | ReplacingMergeTree + dedupe keys | **No** (`ACTIVITY_WINDOW_MIRROR_ENABLED`) |
| `trip_segment_candidates` | — | — | N/A | **No producer** |

**Availability gate:** `ClickHouseService.isAvailable` — false when URL missing, ping fails, or write error triggers `markUnavailable`. Circuit breaker on **reads** (3 failures → 30s open). Health ping every 60s.

**Lost events:** If CH is down at insert time, row is skipped permanently. No outbox, no retry queue, no reconciliation backfill from PG poll logs.

**Latency budget (repo design):**

| Stage | Typical latency | Notes |
|-------|-----------------|-------|
| DIMO poll period | 0–30s | Scheduler interval |
| Queue wait | 0–few s | Depends on fleet size ÷ concurrency |
| Processor (DIMO + PG) | 1–15s | GraphQL + DB; lockDuration 60s cap |
| CH mirror | +50–500ms async | Not awaited by job completion |
| Post-trip HF mirror | Minutes after trip end | Enrichment queue + DIMO HF fetch |
| Analytics query | <5s default timeout | `CLICKHOUSE_ANALYSIS_QUERY_TIMEOUT_MS` |

### 2.5 ClickHouse → Analytics (read path)

| Service | Role | Degradation |
|---------|------|-------------|
| `ClickHouseAnalyticsService` | Ignition/motion segments, activity window summaries | Throws or returns empty when unavailable |
| `ClickHouseHfService` | HF points/events/windows reads | `available: false` responses |
| `SignalQualityReadService` | Trip signal quality from HF windows | Graceful empty |
| `TripEvidenceReadService` | Combined trip evidence DTO | `clickhouseStatus: degraded \| mirror_disabled` |
| `DataAnalyseService` | Org-scoped analytical API aggregation | Partial panels empty |

**Trip assist (live):** `CLICKHOUSE_TRIP_ASSIST_ENABLED` (default on) uses CH segment detectors for start/continuity/repair — **not** for canonical trip boundaries (DIMO Segments on enrichment).

**Ordering (reads):** Queries use `ORDER BY` time columns + window functions (`leadInFrame`). Event order within a vehicle is preserved by `changed_at` / `recorded_at`. No global ordering across vehicles.

### 2.6 Analytics → Dashboard

| Surface | Data source | CH dependency |
|---------|-------------|---------------|
| Data Analyse UI | `DataAnalyseController` | Partial — HF/quality/pipeline tabs need mirrors |
| Trip detail evidence | `TripEvidenceReadService` | HF + waypoints when mirrors enabled |
| Master Admin diagnostics | `GET …/clickhouse-diagnostics` | Registry + `ClickHouseService.getStatus()` |
| Grafana DI V2 dashboard | Prometheus (`synqdrive_clickhouse_*`) | Mirror write counters, not row-level completeness |

**Frontend permission:** `data-analyse.read` + org scoping via `OrgScopingGuard`.

---

## 3. Quality dimensions (detailed)

### 3.1 Completeness

| Path | Complete when | Known gaps |
|------|---------------|------------|
| Live snapshots | Every successful non-stale poll | Stale skips; CH outage gaps; vehicles outside scheduler filter |
| State changes | Ignition/motion transition on consecutive polls | First poll has no previous state → no transition row |
| HF mirror | Trip enriched + flag on + orgId present | Default flag off; `hasTripHfPoints` false negative on CH error → duplicate risk |
| Waypoints | PG waypoints exist + flag on | Default flag off |
| Activity windows | CH snapshots exist in trip window + flag on | Depends on snapshot mirror completeness |

**Cross-check (operator):** Compare `dimo_poll_log` SUCCESS count (24h) vs `telemetry_snapshots` insert rate per vehicle — see audit script §4.

### 3.2 Latencies

| Metric | Prometheus | Interpretation |
|--------|------------|----------------|
| Queue lag | `observeQueueLag` on snapshot/enrichment jobs | BullMQ `timestamp` vs processing start |
| Snapshot duration | `dimo_poll_log.durationMs` | End-to-end processor time |
| CH mirror recency | `synqdrive_clickhouse_last_mirror_unix_seconds{table}` | Latest `recorded_at` mirrored |
| Analysis queries | `synqdrive_clickhouse_analytics_queries_total` | success / skipped_unavailable / error |

**End-to-end dashboard freshness:** Data Analyse telemetry overview reflects CH data with up to ~30s poll lag + mirror write delay. Post-trip HF evidence appears after enrichment completes (typically 1–5 min after trip end).

### 3.3 Duplicate events

| Table | Duplicate mechanism | Mitigation today | Remediation idea |
|-------|---------------------|------------------|------------------|
| `telemetry_snapshots` | Job retry after PG upsert | None | Insert dedup key `(vehicle_id, recorded_at)` or batch id |
| `telemetry_state_changes` | Same | None | Dedup on `(vehicle_id, signal_name, changed_at)` |
| `telemetry_hf_points` | Re-enrichment if `hasTripHfPoints` fails open | Pre-insert count query | Outbox + exactly-once trip mirror job |
| `telemetry_hf_events` | ReplacingMergeTree | Engine handles at merge | `FINAL` or scheduled OPTIMIZE (2D.5) |
| `telemetry_hf_windows` | ReplacingMergeTree | Same | Same |
| `telemetry_waypoints` | `hasTripWaypoints` guard | Pre-insert query | Same as HF points |
| `trip_activity_windows` | ReplacingMergeTree + `dedupeActivityWindows` | In-memory dedupe before insert | Safe to re-run |

### 3.4 Lost events

| Scenario | PG impact | CH impact | Recovery |
|----------|-----------|-----------|----------|
| CH container down | None | Rows skipped | Manual backfill not implemented |
| `markUnavailable` after write error | None | Writes skipped until ping recovers | Auto-recover on health ping |
| Snapshot job failure before CH call | Retry via BullMQ | Row may be missing for failed attempt | Retry may duplicate if PG already committed |
| Stale snapshot guard | Skips update | Skips mirror | Intentional |
| HF mirror disabled | Full enrichment | No HF rows | Enable flag + re-run enrichment |
| Host suspend > 3 min | Resume backfill for trips | Snapshot gap in CH | Reconciliation uses DIMO segments; CH gap remains |

**No DLQ for CH writes.** `synqdrive_clickhouse_mirror_writes_total{result="error"}` is the only automated signal.

### 3.5 Ordering

1. **Per vehicle:** Snapshot `jobId` ensures one in-flight poll; VLS monotonic guard enforces `sourceTimestamp` ordering for applied updates.
2. **State changes:** Derived from consecutive applied snapshots — order matches applied PG timeline, not raw DIMO receive order.
3. **Post-trip:** Enrichment runs after trip finalize; HF/waypoint mirrors run inside enrichment — ordered after PG trip close.
4. **Cross-vehicle:** Unordered — acceptable for analytics.

### 3.6 Retry semantics

| Component | Retries | What retries | What does NOT retry |
|-----------|---------|--------------|---------------------|
| BullMQ snapshot job | 3× exp backoff | Full processor including DIMO fetch + PG + trip FSM | Independent CH insert |
| BullMQ enrichment | 3× | Full enrichment + mirrors | Individual CH table writes |
| CH insert methods | 0 | — | Fail → log + metric + `markUnavailable` |
| CH circuit breaker | Half-open after 30s | Analysis reads only | Writes bypass circuit |

**Critical gap:** Job can succeed (PG committed, poll log SUCCESS) while CH mirror promise rejects asynchronously — no job-level failure, no retry.

### 3.7 Idempotency summary

| Operation | Idempotent? | Notes |
|-----------|-------------|-------|
| PG `vehicle_latest_states` upsert | Yes | By `vehicleId` |
| CH snapshot insert | **No** | Append-only |
| CH state change insert | **No** | Append-only |
| HF points mirror | **Partial** | `hasTripHfPoints`; fails open on error |
| HF events/windows mirror | Yes | ReplacingMergeTree |
| Waypoint mirror | **Partial** | `hasTripWaypoints` |
| Activity windows | Yes | ReplacingMergeTree + dedupe |

---

## 4. Feature flags and configuration

| Env var | Default | Effect |
|---------|---------|--------|
| `CLICKHOUSE_URL` | unset | Disables entire CH layer |
| `HF_MIRROR_ENABLED` | `false` | Gates HF points/events/windows writes |
| `WAYPOINT_MIRROR_ENABLED` | `false` | Gates waypoint mirror |
| `ACTIVITY_WINDOW_MIRROR_ENABLED` | `false` | Gates activity window producer |
| `CLICKHOUSE_TRIP_ASSIST_ENABLED` | `true` | CH-assisted FSM/repair reads |
| `CLICKHOUSE_CIRCUIT_FAILURE_THRESHOLD` | `3` | Read circuit breaker |
| `CLICKHOUSE_CIRCUIT_COOLDOWN_MS` | `30000` | Circuit open duration |
| `CLICKHOUSE_ANALYSIS_QUERY_TIMEOUT_MS` | `5000` | Query guard timeout |

Ops helper: `vps-enable-clickhouse-mirrors.sh` sets mirror flags in `backend.env`.

---

## 5. Observability map

| Signal | Location | Pipeline stage |
|--------|----------|----------------|
| `synqdrive_dimo_snapshot_poll_total{result}` | Prometheus | DIMO → Worker |
| `synqdrive_clickhouse_mirror_writes_total{table,result}` | Prometheus | PG → CH |
| `synqdrive_clickhouse_last_mirror_unix_seconds{table}` | Prometheus | CH freshness |
| `synqdrive_clickhouse_available` | Prometheus | CH connectivity |
| `synqdrive_clickhouse_analytics_queries_total{query,result}` | Prometheus | CH → Analytics |
| `dimo_poll_log` | PostgreSQL | Per-poll audit |
| `CLICKHOUSE_TABLE_REGISTRY` | Code | Producer/consumer map |

Queue depth: inspect BullMQ via Redis CLI or ops tooling — not exported as first-class metric in this analysis.

---

## 6. Risk register

| ID | Risk | Severity | Stage | Mitigation (future phase) |
|----|------|----------|-------|---------------------------|
| P1 | CH mirror loss silent on async failure | **P1** | PG → CH | CH write outbox or awaited insert with retry |
| P2 | Snapshot duplicate rows on job retry | **P2** | Worker → CH | Dedup key or idempotent insert |
| P3 | HF/waypoint mirrors default off | **P2** | Post-trip | Enable mirrors in prod + monitor |
| P4 | `hasTripHfPoints` fail-open → duplicate points | **P2** | Enrichment | Fail-closed or insert idempotency token |
| P5 | No CH backfill from PG | **P2** | Recovery | Batch backfill job from poll logs / VLS history |
| P6 | Legacy tables lack `org_id` | **P2** | Write path | Migration 007 (2D.4) |
| P7 | Activity windows depend on snapshot mirror | **P3** | Post-trip | Document flag chain; validate before enable |
| P8 | Stale snapshot skip → CH gap aligned with PG | **P3** | Ingress | Expected behavior — document in ops runbook |

---

## 7. Code reference map

| Stage | Key files |
|-------|-----------|
| Scheduler | `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts` |
| Snapshot processor | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| CH telemetry mirror | `backend/src/modules/clickhouse/clickhouse-telemetry.service.ts` |
| CH connection | `backend/src/modules/clickhouse/clickhouse.service.ts` |
| HF mirror | `backend/src/modules/vehicle-intelligence/trips/hf-mirror.service.ts` |
| Waypoint mirror | `backend/src/modules/vehicle-intelligence/trips/waypoint-mirror.service.ts` |
| Activity producer | `backend/src/modules/vehicle-intelligence/trips/activity-window-producer.service.ts` |
| Evidence coordinator | `backend/src/modules/vehicle-intelligence/trips/trip-ch-evidence-mirror.coordinator.ts` |
| Enrichment | `backend/src/modules/vehicle-intelligence/trips/trip-behavior-enrichment.service.ts` |
| Analytics reads | `backend/src/modules/clickhouse/clickhouse-analytics.service.ts` |
| Data Analyse API | `backend/src/modules/data-analyse/data-analyse.service.ts` |
| Table registry | `backend/src/modules/clickhouse/clickhouse-table-registry.ts` |
| Metrics | `backend/src/modules/observability/trip-metrics.service.ts` |

---

## 8. Audit tooling

### 8.1 Pipeline audit script (read-only)

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-pipeline-audit.sh \
  | tee /opt/synqdrive/shared/reports/clickhouse-pipeline-$(date -u +%Y%m%dT%H%M%SZ).log
```

Script: `backend/scripts/ops/vps-clickhouse-pipeline-audit.sh`

**Checks:**

- Mirror freshness lag per table (`now() - max(time_column)`)
- 24h row ingest rates
- Duplicate key samples (snapshots, state changes)
- HF trip coverage vs recent completed trips (when PG accessible)
- Prometheus metric hints

**Exit codes:** `0` = completed · `1` = P1 threshold breach · `2` = connectivity error

### 8.2 Complementary audits

| Script | Phase | Use with pipeline audit |
|--------|-------|-------------------------|
| `vps-clickhouse-data-integrity-audit.sh` | 2D.3 | Duplicate parts, CHECK TABLE |
| `vps-clickhouse-performance-audit.sh` | 2D.5 | Insert/query latency |
| `vps-clickhouse-tenant-isolation-audit.sh` | 2D.4 | org_id gaps on writes |

---

## 9. Remediation roadmap (suggestions only — not in 2D.6)

| Priority | Item | Rationale |
|----------|------|-----------|
| **R1** | CH write outbox (trip-scoped + snapshot batch) | Close P1 lost-event gap |
| **R2** | Snapshot insert dedup `(vehicle_id, recorded_at)` | Close P2 duplicates |
| **R3** | Enable + validate mirrors in prod | Close P3 empty HF/waypoint tables |
| **R4** | Apply migration 007 + backfill org_id | Tenant isolation (2D.4) |
| **R5** | `async_insert` for snapshots (2D.5 B1) | Reduce merge pressure |
| **R6** | Alert on `mirror_writes{result="error"}` rate | Operational visibility |

---

## 10. Architecture invariants (preserved)

1. **PostgreSQL** = system of record for trips, scores, waypoints, VLS.
2. **DIMO Segments** = canonical trip boundaries for enrichment where applicable.
3. **ClickHouse** = optional append-only analytics mirror — failures never block operational flows.
4. **AI Upload** = unrelated to this pipeline; no auto-apply from CH.
5. **Multi-tenant** = org scoping in API; CH legacy tables lack `org_id` on write (see 2D.4).

---

## 11. Related documents

- `docs/remediation/clickhouse-runtime-analysis.md` (2D.1)
- `docs/remediation/clickhouse-storage-topology.md` (2D.2)
- `docs/remediation/clickhouse-data-integrity.md` (2D.3)
- `docs/remediation/clickhouse-tenant-isolation.md` (2D.4)
- `docs/remediation/clickhouse-performance.md` (2D.5)
- `architecture/CLICKHOUSE_TRIP_ASSIST_AND_TRIP_END_2026-07-08.md`
- `architecture/WAYPOINTS_ACTIVITY_WINDOWS_2026-07-08.md`

---

## 12. Live audit results (placeholder)

> **Status:** Pending VPS execution. Cloud Agent SSH to production was unavailable during 2D.6.

```
# Paste output of:
# bash .../vps-clickhouse-pipeline-audit.sh

Mirror freshness: TBD
24h ingest rates: TBD
Duplicate samples: TBD
HF trip coverage: TBD
```

---

*Phase 2D.6 — analysis only. No ClickHouse, queue, or application runtime changes applied.*
