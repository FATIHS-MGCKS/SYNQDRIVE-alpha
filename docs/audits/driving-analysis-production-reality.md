# Driving Analysis — Production Reality Audit

**Date:** 2026-07-16 (UTC)  
**Mode:** Read-only (no data mutations, no job triggers, no service restarts)  
**Scope:** Full Fahrtenanalyse pipeline — code, VPS runtime, PostgreSQL, Redis queues, Prometheus metrics  
**Production org (sole fleet operator in sample):** `faa710c9-…` (anonymized as **Org-A**) — 6 LTE_R1 vehicles  

---

## 1. Executive Summary

The SynqDrive driving-analysis pipeline is **architecturally complete and partially operational** on production, but **not production-ready as an end-to-end, customer-attributable driving intelligence product**.

What works reliably today (LTE_R1 / ICE fleet):

- Trip finalization via V2 live FSM (`dimo.trip-tracking`)
- HF behavior enrichment queue processing (100% `COMPLETED` on last-30-day trips)
- Native DIMO driving events persistence (`HARSH_ACCELERATION`, `HARSH_CORNERING`)
- ICE event-context enrichment (~97% `COMPLETED` assessments on native events)
- Route enrichment (100% `enriched_at` + road-split on last-30-day trips)
- Trip-level driving-impact row materialization (`TripDrivingImpact`, model `v1.1.0`) for ~60% of recent trips
- Tire health snapshot generation (1,245 snapshots / 30d) with driving-impact inputs

Critical production gaps (P0):

1. **`trip_analysis_status` backfill gap** — 83.9% of 90-day completed trips have `NULL` analysis status; only trips in the most recent ~30-day window show `COMPLETED`.
2. **`driving_impact_status` desync** — 628 trips (90d) have a `trip_driving_impact` row but `driving_impact_status='PENDING'`; UI/API readiness flags contradict persisted impact data.
3. **ClickHouse unavailable** — `clickhouse_available=0` while `clickhouse_configured=1`; all HF mirror and CH-assisted analytics show `skipped_unavailable`. HF point density and CH evidence paths are degraded.
4. **Brake Health V2 not populated** — `brake_health_current` has 0 rows despite active driving-impact computation and tire snapshots.
5. **Rental Driving Analysis never materialized** — 0 `rental_driving_analyses` rows; 0 `COMPLETED` bookings in production DB (fleet is ~95% private trips).

**Production-readiness verdict (overall):** **SHADOW ONLY** for customer-facing rental driving intelligence; **PARTIALLY READY** for internal vehicle stress / native-event monitoring on LTE_R1.

| Dimension | Verdict |
|-----------|---------|
| Trip detection & finalize | **READY** |
| Native DIMO events (LTE_R1) | **READY** |
| HF behavior enrichment | **SHADOW ONLY** (sparse HF, CH down) |
| Event context (ICE) | **READY** |
| Driving impact compute | **SHADOW ONLY** (rows exist, status/UI desync) |
| Trip analysis orchestration status | **NOT READY** (NULL on 84% historical) |
| Misuse cases | **SHADOW ONLY** (100% `informationalOnly`) |
| Trip assignment / customer attribution | **NOT READY** for customer scores (5.4% booking-assigned) |
| Rental driving analysis | **NOT READY** (no completed bookings / no rows) |
| Tire health consumption | **READY** |
| Brake health consumption | **NOT READY** |
| API / UI coherence | **SHADOW ONLY** (legacy labels, stale readiness flags) |

**Headline rates (90-day completed trips, LTE_R1 only, n=1,172):**

| Metric | Rate |
|--------|------|
| Behavior enrichment success | **99.1%** (`COMPLETED` / completed) |
| Trip analysis `COMPLETED` status | **16.1%** |
| Driving impact `READY` status | **9.0%** |
| Trips with `trip_driving_impact` row | **62.5%** |
| Assessability `FULL` (30d, where JSON present) | **41.2%** of 30d cohort |
| Booking-customer-assigned trips | **5.4%** |
| Rental driving analyses / completed bookings | **0%** (0 bookings completed) |

---

## 2. Investigated Commit and Environment

| Item | Value |
|------|-------|
| **Production VPS release** | `20260716014912_v4994` → `/opt/synqdrive/releases/20260716014912_v4994` |
| **Production git commit** | `2cd57c856c39d5a681bf82546bb79f8ab3fb7d92` — *billing: fix tenant billing tabs stuck loading on mobile* |
| **Audit workspace commit (pre-doc)** | `0672e0f5` (pulled `main` before audit doc commit) |
| **Host** | `srv1374778.hstgr.cloud` (Path A, public SSH) |
| **Health** | `https://app.synqdrive.eu/api/v1/health` → `ok` |
| **PM2** | Single `synqdrive` fork (API + BullMQ workers + schedulers in-process) |
| **Database** | PostgreSQL `synqdrive` @ localhost:5432 |
| **Redis** | localhost, db0 (~193 keys) |
| **ClickHouse** | Configured in env, **not reachable** at audit time |

**Local build checks (workspace, read-only):**

| Check | Result |
|-------|--------|
| `backend` `npm run build` | ✅ Pass |
| `frontend` `npm run build` | ✅ Pass (chunk size warning only) |
| `npx prisma validate` | ✅ Valid (1 non-blocking `onDelete SetNull` warning) |

---

## 3. Runtime Topology

### 3.1 Processes

| Process | Count | Notes |
|---------|-------|-------|
| `synqdrive` (PM2) | 1 | NestJS monolith: HTTP API + BullMQ consumers + cron schedulers |
| `pm2-logrotate` | 1 | Log rotation module |

No separate worker PM2 entries — `synqdrive_worker_runtime_enabled=1` confirms workers run inside the API process.

### 3.2 Trip & enrichment queues (BullMQ / Redis)

| Queue | Failed jobs (gauge) | Wait/active (snapshot) |
|-------|---------------------|-------------------------|
| `dimo.trip-tracking` | 2 | 0 wait |
| `trip.behavior.enrichment` | 0 | 0 wait / 0 active |
| `trip.driving-impact.compute` | 0 | 0 wait / 0 active |
| `dimo.snapshot.poll` | 0 | — |
| `dimo.tire.recalculation` | 0 | repeat jobs active |
| `dimo.dtc.poll` | 0 | repeat jobs active |

**Retry / backoff (code):** `trip.behavior.enrichment` — 3 attempts, exponential backoff, idempotent `jobId=hf-enrich-{tripId}`. `trip.driving-impact.compute` — idempotent `jobId=driving-impact-{tripId}`.

**Dead-letter:** BullMQ `failed` sets; no custom DLQ table. `dimo.trip-tracking` has 2 failed jobs (investigate separately; not re-queued during audit).

### 3.3 Schedulers (in-process)

| Scheduler | Interval | Driving relevance |
|-----------|----------|-------------------|
| `TripAnalysisRecoveryScheduler` | 5 min | Re-triggers misuse for `PARTIAL` + `misuse=pending` |
| `TripTrackingRecoveryScheduler` | periodic | Stuck FSM recovery |
| `TripReconciliationScheduler` | periodic | Missing-trip / enrichment failure audit |
| `BrakeRecalculationScheduler` | periodic | Brake health (no rows produced yet) |
| `TireRecalculationScheduler` | periodic | Tire health (active — 1,245 snapshots / 30d) |
| `DimoSnapshotScheduler` | `WORKER_SNAPSHOT_INTERVAL_MS` | Trip tracking input |

**Duplicate consumer risk:** Low — single PM2 instance, single worker runtime.

### 3.4 Prometheus (`GET /api/v1/metrics`, bearer-protected)

Selected gauges/counters at audit time (counters partially reset after PM2 uptime ~2.5h):

| Metric | Value | Interpretation |
|--------|-------|----------------|
| `clickhouse_configured` | 1 | Env present |
| `clickhouse_available` | 0 | **CH unreachable** |
| `hf_mirror_enabled` | 1 | Mirror intended but skipped |
| `worker_runtime_enabled` | 1 | Workers on |
| `enrichment_pending` | 1 | One trip awaiting enrichment |
| `trip_finalized_total` | 4 (since restart) | Live finalize path active |
| `clickhouse_mirror_writes_total{result="skipped_unavailable"}` | 1,840+ | All mirror paths skipped |
| `missing_trip_candidates_total` | 9 | Reconciliation signal |

**Grafana:** No in-VPS Grafana instance discovered. `platform-admin` service references configurable `prometheusUrl` — dashboard access not verified in this audit.

---

## 4. 30-/90-Day Funnel

**Hardware profile in production:** 100% `LTE_R1` (6 vehicles). No `SMART5` trips in window.

### 4.1 Completed trips

| Window | Completed trips |
|--------|-----------------|
| 30 days | 345 |
| 90 days | 1,172 |

### 4.2 Trip analysis status (`trip_analysis_status`)

| Status | 30d | 90d | Success rate (90d) |
|--------|-----|-----|---------------------|
| `COMPLETED` | 189 | 189 | **16.1%** |
| `NULL` | 156 | 983 | **83.9%** missing |
| `PENDING` / `IN_PROGRESS` / `PARTIAL` | 0 | 0 | 0% stuck |
| `FAILED` / `SKIPPED` | 0 | 0 | — |

**Cohort insight:** All 189 `COMPLETED` rows are in the last-30-day window. Older trips (31–90d, n=827) have **100% NULL** — status field was never backfilled for historical trips.

### 4.3 Behavior enrichment (`behavior_enrichment_status`)

| Status | 30d | 90d |
|--------|-----|-----|
| `COMPLETED` | 345 (100%) | 1,161 (99.1%) |
| `FAILED_*` | 0 | 11 (0.9%, 2 attempts) |

**Median latency:** Not reliably computable from DB (`analysis_latency_ms` only on 189 status-backfilled trips).  
**P50/P95 analysis latency (90d, n=189):** DB query returned values only for `COMPLETED` subset — treat as **non-representative** of full fleet.

### 4.4 Route enrichment

| Signal | 30d rate |
|--------|----------|
| `enriched_at` set | **100%** (345/345) |
| Road split (`city_share_percent`) | **100%** |
| Waypoints present | **97.7%** (337/345) |

### 4.5 Driving impact

| Signal | 30d | 90d |
|--------|-----|-----|
| `driving_impact_status=READY` | 105 (30.4%) | 105 (9.0%) |
| `PENDING` | 171 (49.6%) | 998 (85.1%) |
| `SKIPPED` | 69 (20.0%) | 69 (5.9%) |
| `trip_driving_impact` row exists | 208 (60.3%) | 733 (62.5%) |

**Critical desync (90d):**

| Pattern | Count |
|---------|-------|
| Impact row exists + status `PENDING` | **628** |
| Impact row exists + status `READY` | 105 |
| No row + status `PENDING` | 370 |
| Status `READY` without row | 0 |

**Stuck rate:** 0% in explicit `PENDING/IN_PROGRESS/PARTIAL` analysis status; **85% false-negative** on driving-impact readiness flag.

### 4.6 Native driving events

| Type | 30d count |
|------|-----------|
| `HARSH_ACCELERATION` | 410 |
| `HARSH_CORNERING` | 37 |
| `HARSH_BRAKING` / `EXTREME_BRAKING` | 0 |

Events outside trip time bounds: **2** (0.4%). Duplicate (trip, type, timestamp): **0**.

### 4.7 HF `TripBehaviorEvent`

| HF events per trip (30d) | Trips |
|--------------------------|-------|
| 0 | majority of trips (incl. 2 vehicles with 0 native events) |
| 1–5 | small bucket |
| 6–20 | small bucket |
| 20+ | rare |

Total HF rows (30d): **70** across **345** trips — very sparse vs native events.

`hfInsufficientForAbuse=true` (via `behavior_summary_json`): **224** trips (30d).

### 4.8 Event context assessments

| `contextAssessment.status` | 30d native events |
|----------------------------|-------------------|
| `COMPLETED` | 434 |
| `INSUFFICIENT_CONTEXT` | 5 |
| **Total native events** | 447 |

Code uses `COMPLETED` / `INSUFFICIENT_CONTEXT` / `FAILED` / `SKIPPED` — **not** `SUCCESS`. Audit queries using `SUCCESS` return 0 by schema mismatch.

### 4.9 Misuse cases (90d)

| Type | Severity | Count | Avg `event_count` |
|------|----------|-------|-------------------|
| `COLD_ENGINE_ABUSE` | WARNING | 23 | 2 |
| `AGGRESSIVE_DRIVING_PATTERN` | SEVERE | 14 | 29 |
| `AGGRESSIVE_DRIVING_PATTERN` | WARNING | 2 | 4 |
| `COLD_ENGINE_ABUSE` | SEVERE | 1 | 4 |

All 40 cases: **`informationalOnly=true`**.

### 4.10 Trip assignment

| Pattern (90d) | Count | Share |
|---------------|-------|-------|
| `PRIVATE_UNASSIGNED` + `is_private_trip=true` | 1,109 | 94.6% |
| `ASSIGNED_BOOKING_CUSTOMER` + `TIME_WINDOW` | 63 | 5.4% |
| `ASSIGNED_DRIVER` | 0 | 0% |

### 4.11 Rental driving analysis

| Metric | Value |
|--------|-------|
| `rental_driving_analyses` rows | **0** |
| `COMPLETED` bookings (all time window) | **0** (DB has ACTIVE/CONFIRMED/CANCELLED only) |
| Analyses missing for completed bookings | N/A |

### 4.12 Tire / brake health consumption

| Table | 30d activity |
|-------|--------------|
| `tire_health_snapshots` | 1,245 rows |
| `brake_health_current` | **0 rows** |
| `brake_trip_metrics` | **0 rows** (30d) |
| `vehicle_driving_impact_current` | 6 rows (1 per vehicle) |

Tire snapshots referencing driving impact in JSON: **1,839** (90d query).

---

## 5. Native Events (LTE_R1)

### 5.1 Ingestion path (code)

`DimoSegmentsService` → `driving-events.query.ts` maps:

- `behavior.extremeAcceleration` → `HARSH_ACCELERATION` + metadata `classification: EXTREME`
- `behavior.extremeEmergency*` → `EXTREME_BRAKING`

### 5.2 Production reality

| Check | Result |
|-------|--------|
| Persisted `DrivingEvent` rows | ✅ 447 / 30d |
| Source | 100% `TELEMETRY_EVENTS` |
| `extremeAcceleration` → `HARSH_ACCELERATION` | ✅ 410 harsh accel; classification stored in metadata (code + unit tests) |
| `EXTREME_BRAKING` rows | ❌ 0 in 30d/90d — either no DIMO extreme braking events or mapping/filter gap |
| Trip counter `hard_braking_count` | 0 across fleet (consistent with no brake native events) |
| Counter vs rows (`hard_acceleration_count`) | 410 = 410 ✅ |
| Unmapped DIMO names | Not observable without DIMO API pull (excluded per safety rules) |
| Context on native events | 98.9% assessed (`COMPLETED`) |

### 5.3 Per-vehicle variance (30d)

Two of six vehicles had **zero** native events despite 91–102 trips each — device/event delivery asymmetry worth monitoring.

---

## 6. HF Reality

| Metric | Finding |
|--------|---------|
| ClickHouse HF mirror | **Disabled in practice** (`clickhouse_available=0`) |
| HF points inserted (metrics) | 0 |
| HF events in CH (metrics) | 0 |
| DB `TripBehaviorEvent` rows (30d) | 70 total |
| Trips with `hfInsufficientForAbuse` | 224 / 345 (65%) |
| Trips meeting distance/duration floor (≥0.5 km OR ≥2 min) | 344 / 345 |
| Short trips | 1 |

**Assessability from `behavior_summary_json` (30d):**

| `analysisAssessability` | `analysisLimitReason` | Count |
|-------------------------|----------------------|-------|
| `FULL` | — | 142 |
| `NOT_ASSESSABLE` | `NO_NATIVE_EVENTS` | 40 |
| `LIMITED` | `DEVICE_NATIVE_EVENT_QUALITY` | 18 |
| `LIMITED` | `INSUFFICIENT_HF` | 8 |
| NULL | NULL | 137 (no summary JSON — correlates with NULL `trip_analysis_status`) |

**UNAUFFÄLLIG risk:** 69 trips show low stress + no misuse + `hfInsufficientForAbuse` — calm classification may rest on weak behavior coverage.

---

## 7. Event Context

- Service: `EventContextEnrichmentService` (LTE_R1 ICE only)
- Status enum: `COMPLETED` | `INSUFFICIENT_CONTEXT` | `FAILED` | `SKIPPED`
- Production: **97% COMPLETED**, 1% insufficient, no `FAILED` without retry observable in DB
- Does not create misuse cases (by design)
- Re-run is idempotent (metadata replace)

**Gap:** Audit checklist referenced `SUCCESS` — implementation uses `COMPLETED`. Documentation alignment needed.

---

## 8. Driving Impact

| Item | Value |
|------|-------|
| Model version | **v1.1.0** (100% of impact rows) |
| `drivingStressScore` P50 / P95 (30d) | **8 / 38** (low–moderate load) |
| `source_summary_json.primarySource` | **NULL on all 733 rows** — traceability field not populated |
| Synthetic/proxy fields (`stop_density`, `mean_brake_energy_per_km`, `p95_negative_decel`) | **100% populated** on impact rows |
| `VehicleTrip.drivingScore` mirror drift (>0.5) | 0 rows detected (90d) |
| Rolling window (`vehicle_driving_impact_current`) | 6 rows, model `v1.1.0` |

**Source mix (LTE_R1):** Impact scorer uses native `DrivingEvent` when `hardware_type=LTE_R1`; HF fills gaps. With sparse HF and rich native accel, effective mix is **native-primary** despite NULL `source_summary_json`.

**Cross-hardware:** Not evaluable — no SMART5 production data.

---

## 9. Misuse Cases

| Check | Result |
|-------|--------|
| Fingerprint uniqueness | ✅ DB `@unique` on `fingerprint` |
| Evidence dedup | ✅ In-memory key `sourceType:sourceId:eventType` before `createMany` |
| `eventCount` on reprocess | Code sets `eventCount: candidate.eventCount` (replace, not accumulate) |
| **DB reality:** `eventCount` > distinct evidence rows | **17 / 40 cases** (avg inflation +13.7, max +57) |
| `informationalOnly` | **100%** true — no enforcement cases |
| Types observed | `AGGRESSIVE_DRIVING_PATTERN`, `COLD_ENGINE_ABUSE` only |
| Not observed in 90d | `REV_IN_IDLE`, `LAUNCH_ABUSE`, `BRAKE_ABUSE`, `POSSIBLE_IMPACT`, `DIMO_COLLISION`, `OVERHEATING`, `DTC_AFTER_ABUSE` |

**False-positive risk:** Aggressive pattern uses high `event_count` from rule engine vs fewer deduped evidence rows — UI may overstate repetition.

---

## 10. Trip Assessment

Assessment is **computed at API read time** (`TripAssessmentService`), not persisted as a top-level column.

**Proxy distribution (30d, heuristic from DB):**

| Proxy bucket | Count |
|--------------|-------|
| Low stress, no misuse, HF insufficient | 69 |
| Low stress, no misuse, HF sufficient | 239 |
| Any misuse case | 37 |

**`quality_status` (30d):** Predominantly NULL / not backfilled on older rows.

**PRUEFHINWEIS drivers (code):** native extreme events, misuse relevance, device quality (`DEVICE_NATIVE_EVENT_QUALITY` → `LIMITED` assessability). Cannot compute exact PRUEFHINWEIS % without authenticated API samples.

---

## 11. Assignment / Attribution

| Resolution | 90d trips | Customer-score eligible? |
|------------|-----------|--------------------------|
| Private / unassigned | 1,109 | No |
| Booking customer (`TIME_WINDOW`) | 63 | Partial — time-window fallback, not explicit handover |
| Assigned driver | 0 | — |
| Vehicle only / unknown | 0 | — |

**HIGH-confidence customer-attributed trips:** **≤ 5.4%** (only `ASSIGNED_BOOKING_CUSTOMER`; no confidence enum persisted on trip — `TIME_WINDOW` is a fallback link).

`RentalDrivingAnalysisService` prefers `EXPLICIT` booking link; production uses `TIME_WINDOW` for assigned rental trips → report generation preconditions not met in practice.

---

## 12. Rental Driving Analysis

| Check | Result |
|-------|--------|
| Rows in DB | 0 |
| Trigger | `generateForBooking` requires `BookingStatus.COMPLETED` |
| Completed bookings | 0 |
| Fallback time-window analysis | Code exists; no production executions |
| Driver ID = Customer ID | By schema design (`driverId` → `customerId`) |
| >200 trips cap | Not hit |

**Status:** **NOT READY** — feature wired in code but inert in production data.

---

## 13. Health-Verdrahtung

| Consumer | Driving inputs | Production |
|----------|----------------|------------|
| `TireWearModelService` / `TireHealthService` | `getVehicleImpactForTire()`, stress + road split | ✅ Active snapshots |
| `BrakeHealthService` | `getVehicleImpactForBrake()`, trip impact evidence | ❌ No `brake_health_current` rows |
| `DrivingImpactProcessor` | Calls `brakeHealthService.recalculate` post-impact | Runs but produces no current state |
| `RentalHealthService` | Indirect via tire/brake | Brake path empty |
| `DriverScoreService` | Distance-weighted `drivingStressScore` | Computable; sparse customer attribution |

**Tire input quality:** Driving impact available in tire snapshot JSON for majority of snapshots; HF/native breakdown not stored in snapshot.

---

## 14. API / UI

**API (code + DB cross-check, no authenticated live pull):**

- Trip list/detail mappers expose `drivingStressScore` + deprecated `drivingStyleScore` alias (`trip-api.mapper.ts`)
- `behaviorReady`, `drivingImpactStatus`, `tripAnalysisStatus`, assessability fields exposed when coordinator backfill present
- **Contradiction:** trips with impact row may still show `drivingImpactStatus=PENDING`

**UI issues (code review + i18n):**

| Issue | Severity |
|-------|----------|
| i18n keys still say **"Fahrbewertung" / "Driving Score"** (`de.ts` / `en.ts`) while `scoreFormat.ts` documents stress semantics | P1 — misleading operator language |
| `RentalStressAnalysisCard` falls back to legacy `drivingScore` | P2 |
| Trip assessment badges (`PRUEFHINWEIS`, `NICHT_BEWERTBAR`) conflate device-quality limits with driver conduct if copy not scoped | P1 |
| UUIDs in internal URLs only (standard) | Info |
| Rental analysis UI surfaces empty for all bookings | Expected given DB |

**Representative trip pattern (read-only DB sample):** Completed trip with `trip_analysis_status=COMPLETED`, `driving_impact_status=READY`, native events present, misuse cases optional — **≤ 30%** of 30d fleet matches this "fully green" pattern.

---

## 15. P0 / P1 / P2 Findings

### P0

| ID | Finding |
|----|---------|
| P0-1 | **84% of 90d trips lack `trip_analysis_status`** — orchestration state not backfilled; dashboards/funnels lie by omission. |
| P0-2 | **628 trips have impact data but `driving_impact_status=PENDING`** — readiness flag never reconciled with `trip_driving_impact`. |
| P0-3 | **ClickHouse unavailable** (`clickhouse_available=0`) — HF mirror, CH trip assist, and analytics queries skipped (1,840+ skip counters). |
| P0-4 | **Brake Health V2 empty** — driving impact → brake pipeline non-functional in production. |
| P0-5 | **Rental Driving Analysis inactive** — 0 completed bookings / 0 analyses; customer rental intelligence not delivered. |

### P1

| ID | Finding |
|----|---------|
| P1-1 | **95% private trips** — customer/driver attribution not production-representative. |
| P1-2 | **Misuse `eventCount` ≠ evidence rows** on 42% of cases — reprocessing inflates counts vs deduped evidence. |
| P1-3 | **All misuse cases `informationalOnly`** — no operational enforcement path. |
| P1-4 | **`source_summary_json.primarySource` always NULL** — cannot audit native/HF/proxy mix post-hoc. |
| P1-5 | **UI/i18n "Fahrbewertung"** conflates stress with driver quality. |
| P1-6 | **HF sparse + `hfInsufficientForAbuse` on 65%** of 30d trips — abuse/misuse assessability limited. |
| P1-7 | **No `EXTREME_BRAKING` native events** in DB — extreme braking KPI path unused on this fleet. |
| P1-8 | **2 vehicles with 0 native events** despite high trip volume — device/event subscription gap. |

### P2

| ID | Finding |
|----|---------|
| P2-1 | Legacy field aliases (`drivingScore`, `avgDrivingStyleScore`) still in API mappers — technical debt, mitigated by docs. |
| P2-2 | `dimo.trip-tracking` queue: 2 failed jobs. |
| P2-3 | `enrichment_pending=1` — single trip lagging (monitor). |
| P2-4 | Event-context status naming (`COMPLETED` vs audit spec `SUCCESS`). |
| P2-5 | Grafana dashboards not validated in this audit. |

---

## 16. Tables by Hardware Profile

### LTE_R1 (only profile with production data)

| Stage | 30d | 90d | Rate 90d |
|-------|-----|-----|----------|
| Completed trips | 345 | 1,172 | 100% |
| Behavior `COMPLETED` | 345 | 1,161 | 99.1% |
| Analysis `COMPLETED` | 189 | 189 | 16.1% |
| Impact row | 208 | 733 | 62.5% |
| Impact status `READY` | 105 | 105 | 9.0% |
| Native events | 447 | — | — |
| HF event rows | 70 | — | — |
| Misuse cases | — | 40 | 3.4% of trips |
| Booking-assigned | — | 63 | 5.4% |
| Assessability `FULL` (30d) | 142 | — | 41.2% of 30d |

### SMART5 / UNKNOWN

No completed trips in production window — **not evaluable**.

---

## 17. Reliable vs Non-Reliable Functions

| Function | Reliability | Notes |
|----------|-------------|-------|
| Trip finalize (V2 live) | **Reliable** | Metrics + DB confirm |
| Route / road-split enrichment | **Reliable** | 100% on 30d |
| Native DIMO accel/cornering events | **Reliable** on 4/6 vehicles | 2 vehicles silent |
| ICE event context | **Reliable** | 97% completed |
| HF behavior density | **Not reliable** | CH down, sparse DB rows |
| Driving impact numeric scores | **Mostly reliable** | Row exists for 62.5% / 90d |
| Driving impact readiness flag | **Not reliable** | Desync on 628 trips |
| Trip analysis status field | **Not reliable** | 84% NULL |
| Misuse detection | **Shadow only** | Informational; count inflation |
| Customer driving scores | **Not reliable** | 5% attribution |
| Rental driving reports | **Non-functional** | No data |
| Tire wear from driving stress | **Reliable** | Snapshots active |
| Brake wear from driving stress | **Non-functional** | No health rows |

---

## 18. Production-Readiness Verdict

| Layer | Status |
|-------|--------|
| **Internal fleet monitoring (vehicle stress, native events)** | **SHADOW ONLY → approaching READY** after P0-2/P0-3 fixes |
| **Operator trip detail (single trip)** | **SHADOW ONLY** — misleading pending flags |
| **Customer rental driving intelligence** | **NOT READY** |
| **Health wear from driving (tire)** | **READY** |
| **Health wear from driving (brake)** | **NOT READY** |
| **Compliance / enforcement misuse** | **NOT READY** (informational only) |

**Overall:** **SHADOW ONLY** — pipeline runs, data flows for LTE_R1 native path, but status fields, CH dependency, attribution, and rental outputs block production-grade customer-facing use.

---

## 19. Read-Only Queries Used

All queries: `SELECT` only, scoped to aggregates or anonymized IDs. `DATABASE_URL` stripped of Prisma `?schema=` for `psql`.

```sql
-- Funnel by hardware (30d / 90d)
SELECT COALESCE(v.hardware_type::text,'UNKNOWN'), COUNT(*) FILTER (WHERE t.trip_status='COMPLETED' AND t.end_time >= NOW()-INTERVAL '30 days'), ...
FROM vehicle_trips t JOIN vehicles v ON v.id=t.vehicle_id GROUP BY 1;

-- Analysis status cohort
SELECT CASE WHEN end_time >= NOW()-INTERVAL '30 days' THEN '30d' ELSE '31-90d' END,
       COALESCE(trip_analysis_status,'NULL'), COUNT(*)
FROM vehicle_trips WHERE trip_status='COMPLETED' AND end_time >= NOW()-INTERVAL '90 days'
GROUP BY 1,2;

-- Impact row vs status desync
SELECT COUNT(*) FILTER (WHERE t.driving_impact_status='PENDING' AND tdi.id IS NOT NULL), ...
FROM vehicle_trips t LEFT JOIN trip_driving_impact tdi ON tdi.trip_id=t.id
WHERE t.trip_status='COMPLETED' AND t.end_time >= NOW()-INTERVAL '90 days';

-- Native events
SELECT de.source::text, de.event_type::text, COUNT(*) FROM driving_events de
JOIN vehicle_trips t ON t.id=de.trip_id JOIN vehicles v ON v.id=t.vehicle_id
WHERE v.hardware_type='LTE_R1' AND t.end_time >= NOW()-INTERVAL '30 days' GROUP BY 1,2;

-- Event context status
SELECT de.metadata_json->'contextAssessment'->>'status', COUNT(*) FROM driving_events de ...

-- Assessability
SELECT behavior_summary_json->>'analysisAssessability', behavior_summary_json->>'analysisLimitReason', COUNT(*)
FROM vehicle_trips WHERE trip_status='COMPLETED' AND end_time >= NOW()-INTERVAL '30 days' GROUP BY 1,2;

-- Misuse eventCount inflation
SELECT COUNT(*) FROM misuse_cases mc
JOIN LATERAL (SELECT COUNT(*) c FROM misuse_case_evidence mce WHERE mce.case_id=mc.id) ev ON true
WHERE mc.event_count > ev.c;

-- Assignment breakdown
SELECT assignment_status::text, assignment_subject_type::text, booking_link_source::text, is_private_trip, COUNT(*)
FROM vehicle_trips WHERE trip_status='COMPLETED' AND end_time >= NOW()-INTERVAL '90 days' GROUP BY 1,2,3,4;

-- Health tables
SELECT COUNT(*) FROM tire_health_snapshots WHERE created_at >= NOW()-INTERVAL '30 days';
SELECT COUNT(*) FROM brake_health_current;
SELECT COUNT(*) FROM vehicle_driving_impact_current;
```

**Runtime (non-SQL):**

- `pm2 list`, `redis-cli KEYS bull:*`, queue length probes
- `curl -H "Authorization: Bearer ***" http://127.0.0.1:3001/api/v1/metrics` (token redacted)
- `git rev-parse HEAD` on VPS release

---

## 20. Missing Access and Uncertainties

| Gap | Impact |
|-----|--------|
| No authenticated API samples for trip detail / rental analysis | UI value contradictions inferred from code + DB, not live JSON |
| DIMO API not queried | Cannot verify live event catalog vs persisted mapping |
| ClickHouse server not probed directly | Availability inferred from metrics only |
| Grafana / Loki / external dashboards | Not accessed |
| Customer PII | Org name anonymized; no names/emails in this document |
| Trip assessment exact enum distribution | Requires API hydration — DB stores inputs only in `behavior_summary_json` |
| PM2 error log sample | Minimal trip errors in last 20 grep lines at audit time |
| Workspace ahead of VPS by several commits | Production at `2cd57c8`; audit code review includes `main` through `0672e0f5` — driving pipeline unchanged in intervening doc-only commits (not re-verified on VPS) |

---

## Code Consistency Notes (Teil A)

| Topic | Finding |
|-------|---------|
| Legacy `drivingScore` | Mirror of `drivingStressScore` on `VehicleTrip`; API aliases deprecated fields |
| `drivingStressScore` as driver quality | Code comments + `scoreFormat.ts` explicitly forbid; some i18n still says "Fahrbewertung" |
| Vehicle load vs driver conduct vs misuse | Separated in services; UI copy not always |
| Model version | `v1.1.0` uniform on impact rows |
| Tenant scope | `VehicleOwnershipGuard`, `OrgScopingGuard` on org routes |
| Idempotency | Queue jobIds, misuse fingerprint, `TripDrivingImpact.tripId` unique |
| DTO drift | No orphan DTOs found in driving modules during spot check |
| `VehicleEnrichmentJob` | Separate from trip HF pipeline (battery/brake/tire onboarding jobs) |

---

## References

- `architecture/TRIP_SYSTEM_AUDIT_2026-04-10.md`
- `architecture/TRIP_ANALYSIS_ASSESSABILITY_2026-07-05.md`
- `architecture/HF_WINDOWS_SIGNAL_QUALITY_2026-07-08.md`
- `architecture/DRIVING_ASSESSMENT_DEVICE_QUALITY_2026-07-10.md`
- `backend/src/modules/vehicle-intelligence/trips/trip-enrichment-orchestrator.service.ts`
- `backend/src/modules/observability/trip-metrics.service.ts`

---

*Audit performed read-only. No production state was modified.*
