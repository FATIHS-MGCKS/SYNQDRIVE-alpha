# SynqDrive Deep Audit — Automated Trip Enrichment, Driver Scoring, Refueling & Charging Detection

**Date:** 2026-08-27
**Scope:** End-to-end audit of DIMO ingestion, telemetry, trip lifecycle, enrichment, driving events, driver scoring, energy-event (refuel/recharge) detection, workers/schedulers, queues, database models, observability, tests, scalability, and git regression history.
**Method:** Code inspection on `main` (`61a3578e8`), git history analysis, live DIMO Telemetry/Identity/Vehicle-Triggers API queries (via `@dimo-network/data-sdk` with production developer credentials, guided by the DIMO MCP repository), and production evidence (SSH to VPS: Postgres queries + PM2 logs).

**Evidence levels used throughout:**

- `CONFIRMED FROM CODE` — proven by reading the current codebase
- `CONFIRMED FROM GIT HISTORY` — proven by commit archaeology
- `CONFIRMED FROM DIMO API (LIVE)` — proven by live queries against production DIMO APIs
- `CONFIRMED FROM PRODUCTION` — proven by production DB rows / PM2 logs
- `LIKELY` — strong inference, not directly proven
- `UNKNOWN / NEEDS RUNTIME EVIDENCE` — cannot be proven with available access

---

## 1. Executive Summary

SynqDrive's trip pipeline is **substantially more automated than the observed UI behavior suggests**. Trips are created and finalized by a live V2 finite-state machine driven by 30-second DIMO snapshot polling; behavior enrichment (driving events), route/speeding enrichment, and driving-impact scoring are **enqueued automatically on trip finalize** via BullMQ. The UI-triggered enrichment that was observed is a **fallback layer plus two genuinely UI-coupled mutations**, not the primary engine (Section 4).

The energy-event system (refuel/recharge) is the true production failure, and its root cause is now fully proven:

1. **P0 regression (fleet-wide, ongoing since 2026-07-16/17):** commit `79e381069` ("robust recharge segments client with pagination and retry") introduced `DimoRechargeSegmentsClient` whose GraphQL query is **invalid against the live DIMO schema** (selects `id` on `Segment`, passes unsupported `limit`/`after` arguments). Every call returns **HTTP 422**. Unlike the old per-mechanism error handling, this client **rethrows** non-retryable errors, aborting the shared `fetchEnergyEventSegments` loop **after refuel segments were already fetched but before anything is persisted**. `EnergyEventsService.detectEnergyEvents` catches the exception, logs a warning, and returns an empty result. **Consequence: zero REFUEL and zero RECHARGE events have been persisted fleet-wide since 2026-07-17.** Production confirms: last REFUEL row created 2026-07-16 05:52, last RECHARGE row 2026-07-17 00:02:54; a single day of PM2 logs contains **8,817** `DIMO energy-event fetch failed … 422` warnings across all vehicles.

2. **Second, independent layer for the KS MX 2024 case (23 Aug 2026):** even without the regression, DIMO's native refuel detector **with default configuration does not emit a segment** for that refuel (verified live: `segments(mechanism: refuel)` for 22–24 Aug returns `[]`; with `config:{minIncreasePercent:5}` it returns exactly one segment 16:15:15–16:23:16 UTC, matching the physical refuel where relative fuel level jumped ~13% → ~42%). SynqDrive passes no `config` to the refuel query, so smaller/faster refuels are systematically invisible even after the 422 is fixed.

3. **Latent destructive hazard:** `pruneStaleSubSegments` deletes every `VehicleEnergyEvent` row inside the detection window whose id is not in the just-persisted set. A successful detect pass that yields **zero** persistable segments prunes with an empty keep-set — deleting previously persisted events in that window. The 422 has been masking this since July (the early-return path skips prune); the moment the fetch is fixed, this becomes live.

On scalability, the architecture is queue-oriented with good idempotency patterns, but three hot paths are O(all vehicles) with insufficient concurrency and will not survive 1,000 vehicles unchanged: the 30s snapshot fan-out (concurrency 5), the active-trip tracking worker (concurrency 1, 3 DIMO calls per 30s tick per active trip), and the sequential warm/cold trip-reconciliation sweeps (Sections 15–17).

---

## 2. Current Architecture

`CONFIRMED FROM CODE`

**Runtime topology:** a single PM2 process (`synqdrive`) runs the NestJS API, all BullMQ processors, and all `@Cron`/`@Interval` schedulers together. Postgres is operational truth; ClickHouse is an optional append-only analytics mirror (TTL-managed); Redis backs BullMQ, distributed locks, DIMO JWT caching, and small caches. "Workers enabled" is keyed off Redis health at boot (`app.module.ts`), not the documented `WORKERS_ENABLED` env var (ops-confusion risk).

**Ingestion model:** poll-first. `DimoSnapshotScheduler` (`@Interval(30000)`) enqueues one `dimo.snapshot.poll` job per CONNECTED + AVAILABLE/RENTED vehicle; the processor (concurrency 5) queries DIMO `signalsLatest`, upserts `VehicleLatestState`, mirrors to ClickHouse, and feeds trip-start evaluation. DIMO webhooks exist (`POST /api/v1/webhooks/dimo`) but only handle OBD plug/unplug (connectivity inbox), DTC pushes, and RPM candidates; trigger auto-registration is off by default (`DIMO_TRIGGER_BOOTSTRAP_ENABLED=false`). **Webhooks are not the telemetry path.**

**Trip engine:** trips are owned exclusively by `TripDecisionEngine` (documented invariant in `TRIP_OWNERSHIP.ts`). The live path is a per-vehicle FSM (`VehicleTripDetectionState`: `RESTING → POSSIBLE_START → ACTIVE_TRIP/IDLE_WITHIN_TRIP → POSSIBLE_END → RESTING`) orchestrated by `TripDetectionOrchestrationService` on the self-scheduling `dimo.trip-tracking` queue. DIMO Segments are used as the **repair/backfill** boundary source by `TripReconciliationService` (fast/warm/cold tiers), not as the live creator. This is a documented tension with the project rule "DIMO Segments are canonical trip boundaries" — at runtime the FSM is primary and segments are the safety net.

**Post-trip processing (automatic):** finalize → `TripPostFinalizeAnalysisProducer` (durable Driving-Intelligence-V2 jobs) + `enqueueBehaviorEnrichment` (queue `trip.behavior.enrichment`, jobId `hf-enrich-<tripId>`, 5s delay) → behavior events (LTE_R1: DIMO native `events(behavior.*)`; SMART5: HF 1s-signal reconstruction) → route/speeding enrichment (Mapbox) → `trip.driving-impact.compute` → `TripDrivingImpact` + `VehicleTrip.drivingScore` + rolling `VehicleDrivingImpactCurrent`.

**Energy events:** no dedicated worker. Detection is Step 5 of `TripReconciliationService.reconcileWindow`, so the reconciliation tiers are the only automatic trigger; persistence goes to `VehicleEnergyEvent`. A parallel Battery-Health-V2 pipeline (`HvChargeSession`) exists for HV charging sessions but is feature-flagged off by default and shares the same broken recharge client.

---

## 3. Current Trip Data Flow

`CONFIRMED FROM CODE`

```
DIMO Telemetry GraphQL (signalsLatest)
  │  DimoSnapshotScheduler @Interval(30s) → queue dimo.snapshot.poll (jobId snapshot-<vehicleId>, c=5)
  ▼
DimoSnapshotProcessor.process (backend/src/workers/processors/dimo-snapshot.processor.ts)
  ├─ upsert vehicle_latest_states (VehicleLatestState — monotonic guard)
  ├─ ClickHouse mirror: telemetry_snapshots, telemetry_state_changes (fire-and-forget)
  ├─ DimoPollLog row per poll
  ├─ Battery V2 enqueue, connectivity episode resolution
  └─ evaluateTripStart → TripDetectionOrchestrationService.evaluateSnapshotForTripStart
       │  (VehicleTripDetectionState FSM; queue dimo.trip-tracking, c=1)
       ▼
     POSSIBLE_START → TripDecisionEngine.createTrip
       → VehicleTrip (tripStatus=ONGOING, tripSource=V2_LIVE,
         dimoSegmentId = resolved or synthetic `v2-<vehicleId>-<startMs>`)
       → initial waypoints append, start temperature fetch
       ▼
     ACTIVE_TICK every ~30s (3 DIMO GraphQL calls: core 20s / route 7s / perf 15s buckets)
       → waypoint createMany, odometer/continuity updates, mid-trip gap split
       ▼
     POSSIBLE_END_CHECK → END_VALIDATION (CUSUM ± ClickHouse assist)
       ▼
     FINALIZE → TripDecisionEngine.finalizeTrip
       → tripStatus=COMPLETED, tripAnalysisStatus=PENDING
       ├─ TripPostFinalizeAnalysisProducer → DrivingAnalysisRun/Stage + DrivingIntelligenceJob
       │    (queue driving.intelligence.jobs, c=2, org-scoped idempotency keys)
       └─ TripEnrichmentOrchestratorService.enqueueBehaviorEnrichment
            (queue trip.behavior.enrichment, jobId hf-enrich-<tripId>, delay 5s, c=1)
            ▼
          TripBehaviorEnrichmentService.enrichTrip
            LTE_R1: DIMO events(behavior.*) → DrivingEvent (unique [orgId, providerFingerprint])
                    + HF abuse → TripBehaviorEvent
            SMART5: HF signals(interval:"1s") → Δv/Δt detectors → TripBehaviorEvent
            → counters + behaviorEnrichmentStatus on VehicleTrip
            ▼
          runRouteSafetyEnrichment → TripsService.enrichTrip
            (DIMO route/temperature/performance + Mapbox map-match →
             road shares, speeding fields, enrichedAt, waypoints)
            ▼
          queue trip.driving-impact.compute (jobId driving-impact-<tripId>, c=1)
            → DrivingImpactService.computeForTrip
            → TripDrivingImpact (tripId unique) + VehicleTrip.drivingScore mirror
            + VehicleDrivingImpactCurrent (rolling 30d)
            → (booking settled) RentalDrivingAnalysis recompute

Repair net (parallel):
  TripReconciliationScheduler  fast @15m (45m window, recently-active) /
                               warm @4h (12h window, ALL dimoTokenId vehicles) /
                               cold @Cron 03:00 (7-day window, ALL)
    → TripReconciliationService.reconcileWindow
       stale-ongoing → missing trips (DIMO segments, filtered !isOngoing && !startedBeforeRange,
       or ClickHouse ignition/motion) → missing ends → intra-trip gap splits
       → TripDecisionEngine.createRepairedTrip/finalizeRepairedTrip (tripSource=REPAIRED)
       → TripRepair audit rows → same enrichment enqueue
       → Step 5: EnergyEventsService.detectEnergyEvents (currently failing — Section 8)

API → frontend:
  GET /vehicles/:id/trips-timeline (trips + energy events merged; read-only hydrate)
  GET /trips/:tripId (read-only), GET /trips/:tripId/behavior-events (read-only)
  GET /trips/:tripId/route (WRITES waypoints — Section 4)
  POST /trips/:tripId/enrich, POST /trips/:tripId/behavior-enrich (UI fallback)
  POST /trips/reconcile (manual sync, 12h window)
```

Telemetry persistence detail: there is **no Postgres time-series table for raw signals**. Live truth is the 1-row-per-vehicle `VehicleLatestState`; historical high-frequency data is fetched on demand from DIMO GraphQL and optionally mirrored to ClickHouse `telemetry_hf_*` (gated by `HF_MIRROR_ENABLED`).

---

## 4. Exact UI-Triggered Enrichment Path

`CONFIRMED FROM CODE`

Opening/selecting a trip fires `useTripsTab.handleSelectTrip` (`frontend/src/rental/components/trips/hooks/useTripsTab.ts`), which loads route + behavior events + detail in parallel; two auto-enrich hooks then fire conditionally. Exact behavior:

| UI action on trip select | Endpoint | Method | Mutates backend? |
|---|---|---|---|
| Load detail | `GET /vehicles/:id/trips/:tripId` | GET | **No** — `hydrateTrips`/`hydrateTrip` is a read-only in-memory projection |
| Load behavior events | `GET …/behavior-events` | GET | **No** |
| Load route | `GET …/route` | GET | **Yes** — always re-fetches DIMO route enrichment; if points return, `storeWaypoints` runs `vehicleTripWaypoint.deleteMany` + `createMany` (≤500 sampled). A GET that writes, on **every** select. `trips.service.ts` L116–152, L494–505 |
| Auto route enrich | `POST …/enrich` | POST | **Yes**, only when `enrichedAt` is null (`useTripEnrichment.ts` L31–41). Writes road shares, speeding fields, temperatures, perf averages, waypoints, `enrichedAt` |
| Auto behavior enrich | `POST …/behavior-enrich` | POST | **Yes**, only when trip is COMPLETED and `behaviorEnrichmentStatus` is null (`useTripBehaviorEvents.ts` L98–128). Runs `runEnrichmentSync` → behavior events + route safety + misuse + driving-impact enqueue |
| Sync button | `POST …/trips/reconcile` | POST | **Yes** — manual warm reconciliation (12h window), may create/finalize repaired trips |

Answers to the specific questions:

- **Is enrichment triggered by GET?** The heavy enrichments (road/behavior/scores) are POSTs auto-fired by hooks. But `GET …/route` genuinely mutates state (waypoint rewrite) on every trip open — the only GET-that-writes in the trip surface.
- **Is there a lazy-enrichment function?** Yes, two: `useAutoTripEnrichment` (route/road enrichment when `enrichedAt` null) and the auto behavior-enrich effect (when `behaviorEnrichmentStatus` null). Both are **fallbacks**: the canonical path already enqueues the same work on finalize. They fire only when the worker path failed, lagged, or predates the automation.
- **Does the trip list return incomplete trips?** Yes — `ONGOING` trips and COMPLETED trips whose enrichment hasn't finished appear with null `enrichedAt` / null `behaviorEnrichmentStatus` / zero counters, until either the workers finish or a user opens the trip.
- **Is data cached after first access?** POSTs are guarded (`enrichedAt`, non-null status), so second open skips them. The route GET is **not** guarded — it re-fetches DIMO and rewrites waypoints on every open.
- **Are driving events / scores created during the request?** During auto behavior-enrich, yes (synchronously creates `TripBehaviorEvent`/`DrivingEvent` rows and chains driving-impact). Never during the detail GET.

**Conclusion:** the observed "trips only enriched when opened" is real but is the *fallback firing*, which means the primary automatic path is failing or lagging often enough to be user-visible. Given the enrichment queues run at concurrency 1 in one shared process (Section 12), backlog under bursts is the likely cause; per-trip proof requires checking `behaviorEnrichmentStatus`/`attempts`/`error` on the affected rows (columns exist — Section 21).

---

## 5. Current Trip Lifecycle

`CONFIRMED FROM CODE`

**Trip row states** (`TripStatus` enum): `ONGOING → COMPLETED | CANCELLED`, plus `COMPLETED → ONGOING` via `reopenTripForMerge` (short-gap merge) and mid-trip `splitTripAtGap`. Only `TripDecisionEngine` writes these transitions.

**Vehicle-level detection FSM** (`VehicleTripDetectionState.state`): `RESTING | POSSIBLE_START | ACTIVE_TRIP | IDLE_WITHIN_TRIP | POSSIBLE_END | ENDED`, with processing watermarks (`lastCoreProcessedAt`, `lastRouteProcessedAt`, `lastDrivingProcessedAt`), CUSUM end-validation fields, and a Postgres worker lock (`workerLockedUntil`).

**Post-trip pipelines** tracked on the trip row: `behaviorEnrichmentStatus` (`PENDING → IN_PROGRESS → COMPLETED | SKIPPED_NO_HF_DATA | FAILED_TRANSIENT | FAILED_PERMANENT`), `tripAnalysisStatus` (`PENDING | IN_PROGRESS | PARTIAL | COMPLETED | FAILED | SKIPPED` with `analysisStagesJson`: behavior → route → misuse → drivingImpact), plus UI-readiness strings (`qualityStatus`, `behaviorSummaryStatus`, `drivingImpactStatus`).

**Late telemetry / correction:** active-tick backfill windows, CUSUM end validation with retries, optional ClickHouse trip-end assist, mid-trip gap split, stale-ONGOING repair (>2h), tiered reconciliation (15m/4h/daily), tracking recovery every 2 minutes, and enrichment retriggers. Scores are explicitly regenerable (fingerprint/model-version keyed), so history can legitimately change.

**Dedup/idempotency:** `VehicleTrip.dimoSegmentId` unique (live trips use synthetic `v2-<vehicleId>-<startMs>`); `TripOverlapDetector` (±5 min) rejects duplicate repairs; BullMQ jobIds per phase/trip; `TripDrivingImpact.tripId` unique; `DrivingEvent` unique on `[organizationId, providerFingerprint]`; `DrivingIntelligenceJob` unique on `[organizationId, idempotencyKey]`.

A canonical lifecycle **already exists** — the conceptual `OPEN/ACTIVE/ENDING/CLOSED/ENRICHING/READY/FAILED` states map onto existing structures. No new state machine is needed; the gap is reliability/observability of the existing one, not its shape.

---

## 6. Current Driver Score Architecture

`CONFIRMED FROM CODE`

The canonical scalar is **vehicle stress / Fahrbelastung** (`drivingStressScore`, 0–100, higher = more load), not a classic driver-quality score. Model version `v1.2.0` (`driving-impact.config.ts`).

- **Per trip (materialized):** `DrivingImpactService.computeForTrip` (queue `trip.driving-impact.compute`, after behavior enrichment) writes `TripDrivingImpact` (unique `tripId`, `modelVersion`, `sourceFingerprint`) and mirrors to `VehicleTrip.drivingScore`. Composite: `0.30×longitudinal + 0.35×braking + 0.20×stopGo + 0.15×highSpeed`, each component from per-100-km event rates with weight tables, capped 0–100. Speeding no longer feeds the composite (safety score retired in V4.8.24). A separate `abuseScore` is stored on the trip.
- **Per vehicle (materialized):** `VehicleDrivingImpactCurrent` — rolling 30-day distance-weighted stress, upserted after each trip impact.
- **Per driver/customer (computed on read):** `DriverScoreService.getScoreSummary` — distance-weighted average over assigned, non-private, completed trips' `TripDrivingImpact` rows; gates ≥3 scored trips and ≥50 km. **No persisted driver-score table; no daily/weekly/monthly rollups.**
- **Per booking (materialized):** `RentalDrivingAnalysis` (versioned `rental-driving-analysis-v2`, fingerprinted, supersession).

**Dependencies:** score requires behavior enrichment (event counts) and partially route enrichment (city/highway shares feed stop-go and high-speed components; missing route data degrades those components but doesn't block scoring). **A score can and does exist without anyone opening the trip** — the pipeline is worker-driven. Historical scores can change on re-enrichment/backfill/model-version change (fingerprint-guarded); drift between the legacy mirror and impact rows is watched by a Prometheus metric.

**Distance from near-real-time scoring:** the architecture is trip-finalized batch analytics. Missing for live scoring: mid-trip incremental event detection (current detectors fetch the whole trip window once), a per-trip processing cursor for score contributions, partial-score writes for `ONGOING` trips, and a product definition of an in-trip score. The FSM's active tick (already fetching 30s of signals) is the natural attachment point, but nothing consumes it for scoring today.

---

## 7. Current Driving Event Architecture

`CONFIRMED FROM CODE`

Dual hardware-split paths, routed by `getVehicleCapabilities()` (`vehicle-capabilities.ts`):

| Hardware | Harsh brake/accel/corner | Abuse | Speeding |
|---|---|---|---|
| **LTE_R1** | DIMO-native `events(behavior.*)` → `DrivingEvent` (provider-side classification; thresholds unknown to SynqDrive) | HF reconstruction → `TripBehaviorEvent` | Mapbox route match → `VehicleTrip.speeding*` fields |
| **SMART5 / UNKNOWN** | HF speed reconstruction (Δv/Δt from 1s `signals`) → `TripBehaviorEvent`; cornering not detectable (set to 0) | same | same |

HF thresholds (`hf-braking.ts`, `hf-acceleration.ts`, `hf-abuse.ts`): braking entry 1.5 m/s², HARD ≥4.5, EXTREME ≥7.0; acceleration entry 1.5, HARD ≥3.5, EXTREME ≥5.0; FULL_BRAKING ≥7.5, POSSIBLE_IMPACT ≥12.0; plus RPM/throttle/coolant abuse detectors (kickdown, launch-like, cold engine, long idle). No accelerometer/IMU is used in the HF path — acceleration is derived from speed samples.

Historical note baked into the code (`dimo-segments.service.ts` L929–932): a prior `signals(safetySystem*)` query path was removed in 2026-04 because those fields never existed on DIMO's schema and **silently returned HTTP 422, causing zero event ingestion for every LTE_R1 vehicle since launch**. This is the *same failure class* as the current energy-event regression — the codebase has now shipped two invalid-GraphQL-422 regressions against DIMO, both silent (Section 21, Section 23).

Trigger: post-finalize queue (5s delay); recovery/reconciliation re-enqueue; manual/auto UI POST as fallback. Detection is never mid-trip.

---

## 8. Refueling Detection Audit

**Was it implemented? Yes — and it is still fully wired.** `CONFIRMED FROM CODE + GIT HISTORY`

- Introduced 2026-04-28 (`f54cbece40`): `EnergyEventsService`, `buildEnergyEventSegmentsQuery` (`segments(mechanism: refuel)` with fuel abs/rel + odometer MIN/MAX signal requests), migration `20260420070000_vehicle_energy_events`, and Step 5 in `TripReconciliationService.reconcileWindow`.
- Coalescing + pruning added 2026-06-14 (`03a6cdfe94`): refuel sub-segments ≤5 min apart and ≤250 m merge into one event; `pruneStaleSubSegments` cleans superseded rows.
- **No dedicated energy worker/cron/queue and no feature flag** — the only automatic triggers are the trip-reconciliation tiers (fast 15m/45m-window recently-active; warm 4h/12h all DIMO vehicles; cold daily/7d all). Manual: `POST /vehicles/:id/energy-events/detect` (30-day default window; the frontend never calls it) and the UI Sync button (12h window via reconciliation).
- Persist gate (`isSegmentPersistable`): requires `endTime`, not `isOngoing`, `durationSeconds > 0`, and **`fuelDeltaLiters > 1.0` — a percent-only delta is not persistable**. Confidence: HIGH ≥10 L + GPS, MEDIUM ≥3 L, else LOW. Idempotency via unique `dimoSegmentId` (coalesced key `dimo-refuel-coalesced-<tokenId>-<startMs>`).
- UI: `TripTimelineEnergyCard` ("Tanken") rendered from `GET …/trips-timeline` / `GET …/energy-events` — read path fully intact.

**Current status: BROKEN fleet-wide since 2026-07-16/17**, not by removal but by the recharge-client regression that aborts the *shared* fetch (full mechanics in Section 23). `CONFIRMED FROM PRODUCTION`: only 10 REFUEL rows exist; last created 2026-07-16 05:52:12; 8,817 `EnergyEventsService … 422` warnings in one day of PM2 logs (2026-08-27), across all vehicles.

**Additional latent defects (will matter after the 422 fix):**

1. **Prune-on-empty** (`energy-events.service.ts` L484–508): a successful detect returning zero persistable segments deletes **all** existing events in `[from, to]` for that vehicle. The cold tier's 7-day window makes this dangerous: one DIMO response that omits a previously returned segment (or a default-config non-detection) erases a stored event. Currently masked by the early-return on fetch failure.
2. **No detector config passed**: DIMO's refuel detector accepts a `config` argument (verified live, Section 10); with defaults it missed the KS MX 23-Aug refuel entirely. SynqDrive relies on defaults.
3. **Liters-only gate**: vehicles reporting only `powertrainFuelSystemRelativeLevel` can never persist a refuel. (Not the KS MX blocker — that vehicle reports absolute liters; all 5 of its historical events carry 24–35 L, HIGH confidence. `CONFIRMED FROM PRODUCTION`.)
4. **Zero test coverage**: no `*.spec.ts` for `EnergyEventsService` or for `buildEnergyEventSegmentsQuery` (Section 22).

**Legacy/adjacent code that is NOT an energy-event producer** (must not be confused): the in-trip `refuelDetected` guard in `fetchFuelSummary` (tank grows >2.0 L during a ≥3-min trip → nulls `fuelUsedLiters`) protects consumption stats only; `backfill-lte-r1-events-fuel.ts` is a one-off script; snapshot fuel fields are live state. No removed fuel workers/crons exist in history (`git log --diff-filter=D` clean).

---

## 9. Charging Detection Audit

`CONFIRMED FROM CODE`

Two parallel systems that must not be conflated:

**A) Trips-timeline RECHARGE (`VehicleEnergyEvent`)** — same pipeline as refuel. Since `79e381069` the recharge half goes through `DimoRechargeSegmentsClient` (`recharge-segments/`), whose query is schema-invalid (Section 23) → the whole energy fetch fails → **no RECHARGE events since 2026-07-17 00:02:54** (`CONFIRMED FROM PRODUCTION`; 120 historical rows, all liters-null/SOC-based as expected). Persist gate: SOC Δ ≥1% or kWh Δ >0; coalesce gap 30 min / 250 m.

**B) Battery-Health-V2 HV charge sessions (`HvChargeSession`)** — org-scoped model with `segmentFingerprint` + `idempotencyKey` uniques, quality assessment, ongoing-session reconcile, and a Postgres DLQ. Producers: `HvChargeSessionIngestService` (DIMO recharge segments — same broken client) and `HvFallbackChargeSessionDetectorService` (snapshot-telemetry-based: `IS_CHARGING` flank → cable → added energy → SOC rise ≥3% → power ≥1 kW; min 5 min / 3 observations). **Both gated by env flags that default to false** (`BATTERY_V2_HV_RECHARGE_SESSION_ENABLED`, `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED`), so the empty production table is expected. UI consumer is battery HV health, not the Trips timeline.

**Plug/SOC live tracking exists** in the snapshot path (`latest-vehicle-snapshot.query.ts` fetches `powertrainTractionBatteryChargingIsCharging`, `…IsChargingCableConnected`, `…ChargingPower`, `…AddedEnergy`, SOC, energy into `VehicleLatestState`) — used for live UI and the fallback detector, **not** consumed by `EnergyEventsService`. Charging power/location/energy-added and duration are captured on segments/sessions where available.

The `HvChargeSession` pipeline (idempotency, quality states, DLQ, reconcile of ongoing sessions) is the strongest energy-domain pattern in the codebase and the natural template for hardening `VehicleEnergyEvent` (Section 24).

---

## 10. DIMO MCP Findings — "DIMO Capabilities Relevant to SynqDrive Trip & Energy Processing"

**MCP tooling note** `CONFIRMED`: the configured DIMO MCP server could not start in this environment — `.cursor/mcp.json` references `mcp-dimo@1.5.5`, which does not exist on npm. The audit therefore cloned `DIMO-Network/mcp-dimo` from GitHub as documentation and executed **live queries directly** against DIMO Telemetry/Identity/Vehicle-Triggers APIs using `@dimo-network/data-sdk` with the production developer credentials (same auth path as `DimoAuthService`). All findings below are `CONFIRMED FROM DIMO API (LIVE)` unless noted.

1. **Trip/drive data:** `segments(tokenId, from, to, mechanism, …)` on the Telemetry GraphQL API. Trip mechanisms: `ignitionDetection`, `frequencyAnalysis`, `changePointDetection`; energy mechanisms: `refuel`, `recharge`; plus `idling`. So DIMO **does provide canonical trip boundaries and native refuel/recharge detection** — SynqDrive's use of `mechanism: refuel|recharge` is the right architecture, not a custom heuristic to replace.
2. **Live Segment schema shape:** `start { timestamp value { latitude longitude } }`, `end { … }`, `duration`, `isOngoing`, `startedBeforeRange`, `signals(signalRequests: [{name, agg}]) { name agg value }`. **There is no `id` field on `Segment`, and no `limit`/`after` pagination arguments** — queries using them fail GraphQL validation with HTTP 422. This is exactly what the recharge client sends.
3. **Detector configuration:** `segments` accepts a `config` argument. Verified live for refuel: default config returned no segment for the KS MX 23-Aug refuel; `config:{minIncreasePercent:5}` returned the correct segment. Detection sensitivity is tunable per query — SynqDrive currently never passes config.
4. **Historical telemetry:** `signals(tokenId, from, to, interval)` with per-signal aggregations (used correctly by SynqDrive for 1s/7s/15s/20s/30s/2m/3m windows) and `signalsLatest` for snapshots. `dataSummary.eventDataSummary` lists available event types with first/last seen — useful for capability probing.
5. **Native events:** `events(tokenId, from, to, filter)` returns `behavior.*` (harshBraking, extremeBraking, harshAcceleration, harshCornering, …) and `safety.*` (collision) — already consumed for LTE_R1.
6. **Fuel signals:** `powertrainFuelSystemRelativeLevel` (%) and `powertrainFuelSystemAbsoluteLevel` (L). Availability is per-OEM/device: KS MX 2024 reports both; some vehicles report relative only (liters gate concern, Section 8).
7. **Battery/charging signals:** `powertrainTractionBatteryStateOfChargeCurrent` (%), `…StateOfChargeCurrentEnergy` (kWh), `…ChargingIsCharging`, `…IsChargingCableConnected` (plug state), `…ChargingPower` (W), `…AddedEnergy`.
8. **Webhooks (Vehicle Triggers API, `vehicle-triggers-api.dimo.zone`):** `/v1/webhooks` CRUD and `/v1/webhooks/signals` listing triggerable signals — the live list includes fuel-level, charging, SOC, ignition, speed, battery and location-class signals. Event-driven triggers on fuel/SOC/ignition changes are therefore **available** and could replace part of the 30s polling fan-out; SynqDrive currently registers webhooks manually and uses them only for OBD plug/DTC/RPM.
9. **Sampling reality for KS MX 2024:** fuel-level samples arrive in ~5-minute-class batches while driving; the 23-Aug refuel appears between a null bucket at 16:10 and 41.96% at 16:15 UTC. Fine-grained pump-curve resolution is not available; segment-based detection (with tuned config) is the right granularity.
10. **Rate limits / batch:** no explicit rate-limit contract was observable from the API surface; one GraphQL call serves one `tokenId` (no multi-vehicle batching on Telemetry). `UNKNOWN / NEEDS DIMO CONFIRMATION` for hard limits — at 1,000 vehicles SynqDrive's current cadence generates ~120k calls/hour (Section 16), which makes limits a real planning concern regardless.

**Comparison to current implementation — where SynqDrive deviates:**

- **Wrong/outdated API usage:** recharge client (`id`, `limit`, `after`) — invalid against live schema (the root-cause regression). The battery capability probe `buildRechargeSegmentsProbeQuery` also passes `limit: 1` and is `LIKELY` failing the same way, misreporting recharge capability.
- **Unused native capability:** detector `config` tuning for refuel/recharge sensitivity.
- **Missing event-driven option:** fuel/SOC/ignition triggers exist but are unused; everything is polled.
- **Duplicated fetches:** route GET re-fetches DIMO route enrichment on every trip open; active-tick + snapshot overlap on the same signals.
- **Correct usage worth keeping:** trip-segment queries, `signalsLatest` snapshot query, `events(behavior.*)`, the refuel `energy-event-segments.query.ts` — all schema-valid live.

---

## 11. KS MX 2024 — 23 Aug 2026 Investigation

**Vehicle identity** `CONFIRMED FROM PRODUCTION`: license plate KS MX 2024 → vehicle `a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO tokenId **187336**, reports both relative and absolute fuel levels.

**The refuel is real and visible in DIMO** `CONFIRMED FROM DIMO API (LIVE)`: relative fuel level rises from ~13% to ~42% around 16:10–16:15 UTC on 2026-08-23; `segments(mechanism: refuel, config:{minIncreasePercent:5})` returns exactly one segment **16:15:15 → 16:23:16 UTC (481 s)**. Hypothesis B ("SynqDrive never received raw data" / DIMO lacks the data) is **refuted**.

**Why no SynqDrive event exists — two proven layers:**

**Layer 1 (sufficient on its own): the fleet-wide 422 regression.** Every `detectEnergyEvents` call since 2026-07-17 fails before persistence (Section 23). The first 422 warning in the current day's log is literally this vehicle (`vehicle=a60c0749… tokenId=187336`). Hypotheses E ("background process broken") and G ("DIMO API behavior changed" — schema evolved under a query written against an assumed shape) are **confirmed**; H is partially confirmed (the regression arrived as a side effect of Battery-V2 work, unintentionally coupling refuel to a broken recharge client).

**Layer 2 (would bite after fixing layer 1): DIMO default detector config does not fire for this refuel.** `segments(mechanism: refuel)` with defaults returns `[]` for 22–24 Aug while returning the historical Apr/Jun events for their windows (verified live). SynqDrive passes no config, so this refuel would still be missed. Hypothesis C, in the form "DIMO's default detection sensitivity missed the event", is **confirmed**; SynqDrive's polling frequency is irrelevant here since detection is segment-based.

**Non-factors, checked:** timezone handling (all UTC end-to-end; event at 16:15 UTC is mid-day local, no day-boundary issue); liters gate (vehicle reports liters); UI rendering (read path intact; DB simply has no row — last KS MX refuel row is 2026-06-23); dedup/debounce (no candidate ever reached persistence); F ("detected internally but not surfaced") **refuted** — nothing was persisted anywhere.

**Verdict (evidence level: CONFIRMED, live-reproduced):** A + E + G combined. DIMO raw telemetry contains the change; SynqDrive's processing chain fails fleet-wide before persistence (422 regression); and independently, DIMO's default refuel detector does not emit a segment for this event, so restoring the pipeline without tuning detector config would still miss it.

---

## 12. Background Worker / Scheduler Audit

`CONFIRMED FROM CODE`. Global BullMQ defaults (`app.module.ts`): attempts 3, exponential backoff 5s, removeOnComplete 1000/24h, removeOnFail 5000/7d. Concurrency 1 unless stated. All in one PM2 process.

| Process | Trigger | Frequency | Scope | Cost | Queue | Conc. | Retry | Idempotent? | Production risk |
|---|---|---|---|---|---|---|---|---|---|
| DIMO snapshot poll | `@Interval` | 30s enqueue | ALL connected AVAILABLE/RENTED | 1 GraphQL/vehicle/tick + DB upsert | `dimo.snapshot.poll` | **5** | 3/exp | Yes (`snapshot-<id>`, monotonic guard) | **CRITICAL** — O(N)/30s |
| Trip tracking (FSM) | snapshot + self-requeue | ~30s/active trip | per active trip | **3 GraphQL/tick** | `dimo.trip-tracking` | **1** (config `WORKER_TRIP_TRACKING_CONCURRENCY=5` exists but is **unused**) | 3/exp | Yes (phase jobIds + PG lock) | **CRITICAL** at >~20 concurrent trips |
| Trip tracking recovery | `@Interval` | 2 min | stuck FSM states | low | same | — | — | jobId `trip-recovery-<vehicleId>` | Medium |
| Trip reconciliation fast | `@Interval` | 15 min | recently-active (VLS lastSeen <1h) | DIMO segments/vehicle, sequential | inline (no queue) | serial | none | windowed | High |
| Trip reconciliation warm | `@Interval` | 4 h | **ALL** `dimoTokenId` vehicles, 12h window | sequential O(N) DIMO calls | inline | serial | none | windowed | **CRITICAL ≥1k** |
| Trip reconciliation cold | `@Cron 03:00` | daily | ALL, 7-day window | heaviest | inline | serial | none | windowed | **CRITICAL ≥1k** |
| Energy-event detection | inside reconcileWindow Step 5 | with above tiers | same | refuel+recharge GraphQL | inline | serial | none | unique `dimoSegmentId` (+ prune hazard) | **BROKEN (422)** |
| HF behavior enrichment | trip finalize | per completed trip | per trip | 1s-interval GraphQL over full trip window, unchunked | `trip.behavior.enrichment` | 1 | 3/10s | jobId `hf-enrich-<tripId>` + status guards | High (long trips, bursts) |
| Driving impact | after enrichment | per trip | per trip | CPU + DB | `trip.driving-impact.compute` | 1 | 3/exp | jobId + fingerprint | Medium |
| Driving intelligence jobs | dispatchers | event + 10-min reconciliation (bounded 50 orgs) | per job | varies | `driving.intelligence.jobs` | 2 | 3/exp | persistent rows + idempotency keys | Medium |
| Trip analysis recovery | `@Interval` | 5 min | stuck stages (batch 50) | low | — | — | — | yes | Low |
| DTC poll | BullMQ scheduler | 3 h fan-out | all DIMO vehicles | 1 GraphQL/vehicle | `dimo.dtc.poll` | 1 | 3/exp | 3h-bucket jobIds | Medium at 10k |
| DIMO vehicle sync | BullMQ scheduler | 24 h | platform | Identity API | `dimo.vehicle.sync` | 1 | 3/exp | repeatable | Low |
| Tire / brake recalc | `@Interval` | 1 h each | due setups | CPU + DB | tire/brake queues | 2 | 3/exp | hour-bucket jobIds + fingerprints | Medium |
| Battery V2 | producers + 5-min reconcile (batch 25) | continuous | typed jobs | varies | `battery.v2` | 2 | custom + **PG DLQ** | strongest pattern in repo | Medium |
| HM health polling | `@Interval` | 5 min | active REST HM links, sequential | external REST | inline | serial | — | cadence-gated | Medium |
| Webhook consumers | HTTP + 30s inbox poll | event | per event | low | `connectivity.webhook.process` (c=4), `voice.webhook.process` (c=4) | 4 | 5/exp | inbox ids + unique providerEventId | Low |
| Notification eval/delivery | cron 30m / 30s outbox | org-scoped | per org/outbox | med | eval c=2, delivery c=4 | 2/4 | 3/exp | org lock + outbox ids | Medium |
| Outbox family (payment email, task automation, invites, audit, billing) | crons 15–30s | domain rows | low | various | 2–4 | 3/exp | outbox pattern | Low |
| Retention (data/battery/voice/IAM/docs) + orphan sweep | daily crons 03:30–04:30, weekly | append tables | batched deletes | — | batch 5k | — | yes | Low (but must stay enabled) |
| Metrics refresh | 30s–5m | platform | low | — | — | — | yes | Noise only |
| Snapshot resume backfill | gap >3 min on tick | on host resume | ALL connected, sequential reconcile | high | inline | serial | reconciliation-dependent | High after stalls |

Redis beyond BullMQ: `RedisDistributedLockService` (SET NX PX — notification eval, brake recalc, battery vehicle locks), DIMO vehicle-JWT cache + fetch locks, fleet-map cache. No BullMQ rate limiters configured on any queue. Dead-lettering: real DLQ tables only for Battery V2 and connectivity/voice inboxes; trip/energy paths rely on BullMQ failed-job retention only.

---

## 13. Database Model Audit

`CONFIRMED FROM CODE` (`backend/prisma/schema.prisma`)

**Storage split:** Postgres = operational truth (vehicles, latest state, trips, events, health, job state); ClickHouse = TTL-managed telemetry mirrors (`telemetry_snapshots` 180d, `telemetry_state_changes` 365d, `telemetry_hf_points` 90d / `hf_windows` 180d / `hf_events` 365d, `telemetry_waypoints` 365d, `trip_activity_windows` 365d, `trip_segment_candidates` 180d — the latter has **no producer yet**). No Postgres raw-signal time-series table. DIMO JWTs live in Redis/memory, not the DB.

**Key models:** `VehicleTrip` (unique `dimoSegmentId`; good indexes incl. `[vehicleId, startTime]` and status fields; **no org column** — tenant scoping via `Vehicle`), `VehicleTripWaypoint`, `VehicleTripDetectionState` (FSM + watermarks + lock), `VehicleTripTrackingRun`, `TripRepair`, `TripBehaviorEvent`, `DrivingEvent` (unique `[organizationId, providerFingerprint]`), `TripDrivingImpact` (unique `tripId`, `modelVersion`, fingerprint), `VehicleDrivingImpactCurrent`, `RentalDrivingAnalysis` (unique `[bookingId, calculationVersion, inputFingerprint]`, supersession), `DrivingAnalysisRun/Stage`, `DrivingIntelligenceJob` (unique `[organizationId, idempotencyKey]`, DEAD_LETTER status), `VehicleLatestState` (1:1, monotonic provenance fields; **no secondary indexes on `lastSeenAt`/`providerFetchedAt`**, which the fast reconciliation tier filters on), `DimoPollLog`, `VehicleEnergyEvent`, `HvChargeSession`, Battery-V2 family incl. `BatteryV2JobDeadLetter`.

**`VehicleEnergyEvent` vs the conceptual canonical EnergyEvent (Part M):**

| Concept | Status |
|---|---|
| id / vehicleId / startedAt / endedAt / delta / confidence | **Exists** (`startTime`/`endTime`; fuel L & %, SOC %, kWh deltas; HIGH/MEDIUM/LOW) |
| type REFUEL/CHARGE | Exists as `kind` REFUEL/RECHARGE |
| startValue/endValue | Partial — only inside `rawDetectionMeta` JSON |
| source | Partial — `detectionMechanism` string only |
| evidence | Partial — `rawDetectionMeta` blob (incl. coalesce audit) |
| detectorVersion | **Missing** |
| status CANDIDATE/CONFIRMED/REJECTED | **Missing** — persist-filter only, no review lifecycle |
| organizationId | **Missing** (via vehicle only) |

**Verdict:** `VehicleEnergyEvent` is ~80% of the canonical concept. **Extend it** (detectorVersion, lifecycle status, optional org denormalization) rather than creating a new model. `HvChargeSession` remains the separate battery-health session concept; a documented linkage (energy event ↔ session) is sufficient.

**Retention concerns (Postgres, no schema TTL):** `DimoPollLog` (~120 rows/vehicle/hour from snapshots alone → ~2.9M rows/day at 1k vehicles), `VehicleTripWaypoint`, `VehiclePositionUpdate`, `DrivingEvent`, `TripBehaviorEvent`, `BatteryHealthSnapshot`, webhook/sync logs — all depend on the daily `DataRetentionScheduler` staying enabled and tuned.

---

## 14. Queue / Redis / BullMQ Audit

`CONFIRMED FROM CODE`

- Sound global defaults (attempts 3, exp backoff, bounded retention); consistent jobId discipline on hot paths (`snapshot-<vehicleId>`, `trip-{phase}-…`, `hf-enrich-<tripId>`, hour/3h buckets for tire/brake/DTC, sanitized inbox ids).
- **Concurrency is the weak point:** snapshot c=5 vs O(N)/30s arrival; trip tracking c=1 (a config knob for 5 exists but is not applied to the processor decorator); behavior enrichment and driving impact both c=1.
- **No BullMQ `limiter`** anywhere — no queue-level rate limiting toward DIMO/Mapbox.
- Dead-letter: Battery V2 (Postgres DLQ + replay) and connectivity/voice inboxes are exemplary; trip tracking, enrichment, and energy detection have no durable DLQ (BullMQ failed retention only; energy detection isn't even a queue).
- Distributed locks: Redis SET NX PX service + Postgres `workerLockedUntil` for the FSM — adequate.
- Reconciliation tiers run **inline in schedulers** (no queue, no lock, sequential) — the biggest structural gap: unbounded wall-clock, no per-vehicle retry isolation, invisible progress.

---

## 15. Scalability Assessment

`CONFIRMED FROM CODE` (mechanics) / `LIKELY` (numeric breakpoints)

Confirmed hazards with evidence:

1. **O(all vehicles) snapshot fan-out every 30s** (`dimo-snapshot.scheduler.ts` L76–160): `findMany` all connected + sequential `getJob`+`add` per vehicle; processor c=5. Arrival rate N/30s vs drain 5×(1/job-seconds).
2. **Active-tick DIMO triple-fetch at c=1** (`trip-detection-orchestration.service.ts` ~L1062): 3 historical GraphQL calls per active trip per 30s through a single-concurrency worker.
3. **Sequential warm/cold reconciliation over ALL DIMO vehicles** (`trip-reconciliation.scheduler.ts` L70–124): `for await reconcileWindow(...)` — at 2s/vehicle, 5,000 vehicles ≈ 2.8h *per pass*, colliding with its own next tick.
4. **Unchunked HF query**: `fetchHighFrequency` issues one `signals(interval:"1s")` for the entire trip window (contrast: driving-events fetch *is* chunked+retried). Long trips → huge payloads/timeouts.
5. **Frontend-triggered writes**: route GET re-fetches DIMO + rewrites waypoints on every trip open (no stored-waypoint short-circuit); `enrichTrip` runs route+temperature+performance+Mapbox synchronously in request context. No Mapbox map-match cache (only 100-coordinate sampling).
6. **Postgres**: `VehicleLatestState` lacks indexes on the reconciliation filter columns; `DimoPollLog` growth; otherwise trip/event indexes are good.
7. **DIMO call volume**: idle connected vehicle ≈ 120 GraphQL/h (snapshot) + reconciliation; actively driving ≈ 480/h. No rate limiter, no backpressure.

What already scales well (reuse, don't rebuild): jobId dedup discipline, monotonic snapshot guard, Battery V2 batching (25) + DLQ, driving-events pagination, retention batching, bounded driving-analysis reconciliation (50 orgs, capped actions), ClickHouse TTL mirrors.

---

## 16. 1,000-Vehicle Scenario

`LIKELY` (derived from confirmed cadences)

- **Snapshot:** 1,000 jobs/30s = 33 jobs/s arrival; at c=5 the per-job budget is 150 ms — unrealistic for JWT+GraphQL+upsert+FSM-eval (real ≈1.5–3s). The queue falls permanently behind; the 30s enqueue tick itself (2N Redis ops + full-table `findMany`) approaches tick length. **Fails without sharding/concurrency/cadence changes.**
- **DIMO volume:** ~120,000 calls/h baseline; +360/h per actively driving vehicle. Provider throttling becomes plausible; there is no client-side limiter to degrade gracefully.
- **Active trips:** 5–15% driving share → 50–150 concurrent trips × 3 calls/30s through a c=1 worker → ticks slip, ends detected late, gap-splits misfire.
- **Warm reconciliation:** 1,000 sequential vehicles × (segments + energy fetch) every 4h ≈ 35–60 min serial wall-clock per pass inside the shared event loop — tolerable but degrading; **cold** (7-day windows) runs multi-hour.
- **Postgres:** `DimoPollLog` ≈ 2.9M rows/day; VLS scans without indexes start to hurt.
- **Enrichment:** trip-completion bursts (commute peaks) pile onto c=1 behavior enrichment + c=1 impact; UI fallback enrichment fires visibly often (the user-reported symptom, amplified).

---

## 17. 5,000-Vehicle Scenario

`LIKELY`

Nothing in the current single-process topology survives:

- Snapshot arrival 167 jobs/s vs c=5; enqueue tick alone cannot complete in 30s.
- ~600,000 DIMO calls/h baseline — certain throttling territory; without a limiter, failures cascade as retries.
- Warm pass ≥ 2.8h serial (overlapping its own 4h cadence); cold pass effectively never completes in its day.
- One Node event loop shared by API + all workers + all schedulers starves; PM2 restarts amplify the resume-backfill stampede (sequential reconcile of all vehicles).
- Redis job churn (2N ops/30s + retention sets) and `DimoPollLog` (~14M rows/day) become operational problems on their own.

The fix profile is architectural but within the existing stack (Section 26): event-driven triggers + tiered adaptive polling, queue-based batched reconciliation, worker process separation, applied concurrency, and rate limiting. Kafka/streaming is **not** required at these scales; PostgreSQL + Redis/BullMQ used correctly are sufficient.

---

## 18. Failure Modes

| # | Failure mode | Evidence | Effect |
|---|---|---|---|
| 1 | Invalid GraphQL vs live DIMO schema → HTTP 422 treated as empty/failed silently | recharge client (current), `safetySystem*` (2026-04, self-documented in code) | Silent, fleet-wide, months-long data loss — **happened twice** |
| 2 | Shared fetch coupling: one mechanism's failure aborts sibling mechanisms | `fetchEnergyEventSegments` loop + rethrowing recharge client | Refuel dies because recharge is broken |
| 3 | catch → warn → return empty pattern throughout DIMO fetchers | `dimo-segments.service.ts` (8+ call sites), `energy-events.service.ts` | Callers cannot distinguish "no data" from "provider failed"; no durable failure record |
| 4 | Prune-on-empty deletes persisted events | `pruneStaleSubSegments` with empty keep-set | Data destruction once 422 is fixed; cold tier's 7-day window maximizes blast radius |
| 5 | Detector-default blindness | live-verified: default refuel config misses real refuels | Events missing even with healthy pipeline |
| 6 | Single-process contention | PM2 topology | API latency degrades under worker load; restarts trigger sequential backfill stampede |
| 7 | Queue backlog → UI fallback fires → users perceive "enrichment only on open" | c=1 enrichment queues | The reported UX problem |
| 8 | GET-that-writes route endpoint | `getRouteForTrip` | Concurrent opens race on delete+create waypoints; unnecessary DIMO load |
| 9 | Reconciliation without locks/queue | inline schedulers | Overlapping passes possible when a pass exceeds its interval |
| 10 | Capability probe using invalid `limit` arg | `buildRechargeSegmentsProbeQuery` `LIKELY` | Recharge capability misreported, fallback logic misdirected |

---

## 19. Data Consistency Risks

- **Energy-event window pruning vs DIMO nondeterminism:** re-detection over a window trusts the latest DIMO response completely; any transiently missing segment deletes history (no soft-delete, no status transition).
- **Waypoint rewrite on read:** two concurrent route GETs interleave deleteMany/createMany; stored route can transiently vanish or duplicate.
- **Trip merge/reopen vs downstream consumers:** `COMPLETED → ONGOING` reopen can orphan already-computed impact/analyses until recompute (fingerprints mitigate, ordering is not transactional).
- **Dual charging representations** (`VehicleEnergyEvent` RECHARGE vs `HvChargeSession`) with no cross-consistency check — once both run, the same physical charge can appear once, twice, or inconsistently.
- **VLS monotonic guard vs reconciliation writes:** snapshot provenance protects live state, but repaired trips can rewrite history that dashboards already aggregated (accepted design, worth documenting).
- **Legacy `VehicleTrip.drivingScore` mirror drift** vs `TripDrivingImpact` (watched by a Prometheus drift metric — good).

---

## 20. Idempotency Risks

Strong where it exists: unique `dimoSegmentId` (trips + energy events), provider fingerprints (driving events, braking ledger), org-scoped idempotency keys (DI jobs, battery), jobId discipline, coalesced deterministic keys, `HvChargeSession` double unique.

Gaps:

- **Energy detection is not idempotent in effect** because of prune-on-empty: repeated runs with differing DIMO responses do not converge — they oscillate/destroy.
- **Coalescing key instability:** the coalesced id derives from the earliest sub-segment start; if DIMO later reports an earlier fragment, the key changes → old row pruned, new row created (id churn visible to consumers/links).
- **Reconciliation tiers have no run-level lock or cursor** — a slow pass can overlap the next; per-vehicle progress is not persisted (a crash mid-pass silently skips the tail until next tier).
- **Manual triggers overlap scheduled ones** (Sync button vs fast tier) with no window-level dedup; safe today only because underlying upserts are keyed.

---

## 21. Observability Gaps

Can we answer the required questions from logs/DB?

| Question | Today |
|---|---|
| "Why was this trip not enriched?" | **Mostly yes** — `behaviorEnrichmentStatus/attempts/error`, `tripAnalysisStatus`, `analysisStagesJson`, `analysisFailedReason`, Prometheus enrichment gauges |
| "Why did this trip produce N driving events?" | **Partly** — events carry source/severity/fingerprints; HF path deletes+recreates so per-run provenance is lost; DIMO-native thresholds are provider-side (unknowable) |
| "Why was this refueling event missed?" | **No** — fetch failure = log warning only; no persisted failure state, no per-vehicle energy cursor, no miss ledger. The current outage was only findable via PM2 log grep |
| "Why was this charging event rejected?" | **No** for `VehicleEnergyEvent` (filter drops silently); **yes** for `HvChargeSession` (quality states) |
| "Which detector version processed this trip?" | **Partly** — driving impact (`modelVersion` v1.2.0), DI-V2 pipeline, rental analyses are versioned; HF behavior enrichment and **energy events have no version stamp** |
| "Which DIMO data was used?" | **Partly** — `rawDetectionMeta`, `DimoPollLog`, tracking runs; raw GraphQL responses aren't retained; the 422's GraphQL error body is swallowed by axios (only "status code 422" is logged — the actual validation message never appears anywhere) |

Structural gaps: no energy-event run/audit table (contrast `DrivingIntelligenceJob`/`BatteryV2JobDeadLetter`); `onEnrichmentFailure` is a log-only stub; route-enrichment failure marked `skipped` not `failed`; `MONITORED_QUEUES` metrics omit DTC/driving-impact/CH-retry; no per-vehicle "last successful energy detection at" watermark; DIMO fetch layers uniformly swallow error bodies.

---

## 22. Test Coverage Gaps

Inventory: ~1,400 backend spec files. **Strong:** trip detection FSM (`trip-detection.spec.ts` — start/end/idle/CUSUM/CH-assist), HF detectors (`hf-abuse.spec.ts`), speeding (`mapbox-speeding.spec.ts`), driving impact + driver-score aggregation, rental analysis versioning, HV charge-session persist/quality/reconcile, recharge client unit tests (pagination/429-retry/source-filter fallback — but with **mocked responses and substring assertions**, which is exactly why the invalid query shipped), telemetry freshness.

**Production-critical gaps (ranked):**

1. **`EnergyEventsService`: zero specs** — no coverage of persist gate, coalescing, confidence, **prune-on-empty**, or the silent-empty-on-error contract.
2. **No DIMO GraphQL schema-shape validation tests** — neither `buildEnergyEventSegmentsQuery` nor the recharge query is validated against a schema snapshot/introspection fixture. A CI check validating all `queries/**` + `recharge-segments/**` against a committed DIMO SDL would have caught both historical 422 regressions.
3. **No `TripEnrichmentOrchestrator` / `TripReconciliationService` specs** — retries, duplicate enrichment, `SKIPPED_NO_HF_DATA`, repair-then-enrich flows untested.
4. **No end-to-end pipeline test** (segment → finalize → enrich → score → energy timeline).
5. **No duplicate/out-of-order/delayed snapshot ingest tests** into the FSM.
6. **No fuel-noise/false-positive suite**; no energy-vs-HvChargeSession consistency test; offline/gap handling only partially covered.

---

## 23. Regression / Git History Findings

`CONFIRMED FROM GIT HISTORY + PRODUCTION`

| When | Commit | Event |
|---|---|---|
| 2026-04-28 | `f54cbece40` | Energy events introduced (service, refuel/recharge queries, migration, reconciliation Step 5). Worked in production — 130 events accumulated Apr–Jul |
| 2026-06-14 | `03a6cdfe94` | Coalescing + `pruneStaleSubSegments` added — introduced the prune-on-empty hazard (latent) |
| 2026-07-16 17:15 | `899157e4` | **Last working parent** |
| 2026-07-16 17:20 | **`79e381069`** | **Breaking commit** — "feat(dimo): robust recharge segments client with pagination and retry" (draft PR #302 branch). Recharge fetch delegated to `DimoRechargeSegmentsClient` with schema-invalid query (`id` field, `limit`/`after` args); its executor **rethrows** non-retryable errors (422 ∉ {429, 5xx}, and the axios message "Request failed with status code 422" matches none of the source-filter fallback patterns) |
| 2026-07-17 | `e707ce3e8` | Reached `main` via the Battery-V2 audit-remediation merge (PR #346 lineage) and deployed |
| 2026-07-16 05:52 / 2026-07-17 00:02 | — | Last REFUEL / last RECHARGE rows created in production — timeline matches deploy exactly |

**Failure chain (all steps confirmed from code):** `fetchEnergyEventSegments(['refuel','recharge'])` fetches refuel first (schema-valid, per-mechanism catch → `[]`), then calls `rechargeSegmentsClient.fetchForToken` → 422 → throw → the exception escapes, discarding the already-collected refuel segments → `detectEnergyEvents` catches, warns, returns empty → nothing persisted, prune skipped. The refuel query itself was **never modified** — refuel detection died purely by coupling.

Answering Part E's suspicion directly: **yes, this is a regression** — previously working behavior (both mechanisms persisting through mid-July) broke with `79e381069`. Nothing was removed; no worker/cron was deleted (verified `--diff-filter=D`); the UI read path is intact. The pattern repeats 2026-04's `safetySystem*` incident: invalid GraphQL + silent 422 swallowing + no schema tests.

---

## 24. Existing Components We Should Reuse

- **`TripDecisionEngine` + FSM + `TripReconciliationService`** — the canonical trip engine; ownership invariant is healthy. Do not build a parallel trip engine.
- **`TripEnrichmentOrchestratorService` → impact chain** — correct automatic post-trip design; needs concurrency + durability, not replacement.
- **`VehicleEnergyEvent` + `EnergyEventsService` coalescing/upsert** — keep and extend (versioning, lifecycle status, safe pruning).
- **`energy-event-segments.query.ts`** — the schema-valid template for rewriting the recharge query.
- **Battery-V2 job pattern** (typed jobs, idempotency keys, Postgres DLQ, bounded reconcile batches, structured skip logging) — the template for hardening energy detection and reconciliation.
- **`HvFallbackChargeSessionDetectorService` policy** — a ready snapshot-based charging detector once flags/capability data justify enabling it.
- **DI-V2 envelope** (`DrivingAnalysisRun/Stage`, `DrivingIntelligenceJob`) — the versioned, auditable processing-state pattern the energy domain lacks.
- **Existing watermarks** (`VehicleTripDetectionState.last*ProcessedAt`, VLS provenance) — extend the same pattern to energy detection cursors.
- Driving-events pagination/chunk/retry helper — apply to the HF fetch.

---

## 25. Components That Should Be Deprecated

- **`buildDimoRechargeSegmentsQuery` in its current form** — rewrite against the live schema (drop `id`, `limit`, `after`; align signal selection with the refuel query). The client shell (retry/window/dedupe) can stay.
- **Pagination scaffolding built on `after`/`limit`** (`DIMO_RECHARGE_SEGMENT_*` page constants, `afterIso` threading) — the API does not support it; windowing alone must bound result size.
- **Prune-on-empty semantics** — replace hard delete with status transition or persisted-set-aware guard.
- **`GET …/route` as a mutating endpoint** — short-circuit to stored waypoints; move DIMO refresh behind an explicit action or the enrichment job.
- **UI auto-enrich hooks as a load-bearing path** — keep short-term as safety net; retire once queue reliability makes them dead code (measure fallback-fire rate first).
- **Unused `WORKER_TRIP_TRACKING_CONCURRENCY` config + `WORKERS_ENABLED` doc mismatch** — wire up or remove.
- **`fetchDrivingEventsLegacySingleShot`** and the `DetectedTrip` legacy type — marked deprecated already; remove after confirming no callers.
- **Frontend `detectEnergyEvents` API client** — dead from UI; keep endpoint for ops, drop client or wire intentionally.

---

## 26. Recommended Target Architecture

The proposed conceptual target (telemetry → cursor → active processor → finalization → enrichment → events → score contribution → aggregates; parallel energy detector with candidate → confirm) is **largely already implemented** for trips. Assessment against the codebase:

- **RAW/NORMALIZED TELEMETRY** — exists (snapshot → VLS + CH mirror). Keep poll-first for now, add DIMO trigger subscriptions (fuel/SOC/ignition) to *prioritize* polling rather than replace it in one step.
- **PROCESSING CURSOR / WATERMARK** — exists for trips (`last*ProcessedAt`); **missing for energy** → add per-vehicle energy detection cursor (`lastEnergyDetectionAt`, last-window, last-error).
- **ACTIVE TRIP PROCESSOR / FINALIZATION / ENRICHMENT / EVENTS / SCORE** — exist; fix throughput (applied concurrency, chunked HF, worker separation), not shape.
- **DRIVER SCORE AGGREGATES** — on-read today; materialize per-subject aggregates only when product needs near-live scores (Phase E4), reusing `VehicleDrivingImpactCurrent`'s rolling pattern.
- **ENERGY EVENT DETECTOR → CANDIDATE → CONFIRMATION → EVENT** — partially exists. Add lifecycle `status` (CANDIDATE/CONFIRMED/REJECTED/SUPERSEDED) + `detectorVersion` to `VehicleEnergyEvent`; DIMO-native segments (with tuned config) remain the detector; the snapshot-based fallback (Battery-V2 policy) becomes the secondary evidence source for confirmation, per the "don't trust a single delta" rule.
- **"Telemetry creates domain state; UI only reads domain state"** — correct target and ~90% true already; the violations are exactly the route GET write and the two fallback POSTs. Adopt the principle; kill the violations once queue reliability is proven.

**Scheduling model (Part L):** replace uniform O(N) sweeps with tiering derived from data already in VLS/FSM: ACTIVE (in-trip FSM cadence), RECENTLY_ACTIVE (fast tier), PARKED (warm, batched via queue), SOFT-OFFLINE (cold only), HARD-OFFLINE (no polling; reactivate on webhook/connectivity signal). Reconciliation moves from inline sequential loops to batched queue jobs (Battery-V2 pattern: bounded batch, per-vehicle jobId, DLQ). Add BullMQ limiters for DIMO-bound queues. No Kafka — Postgres + Redis/BullMQ suffice at 5k vehicles when fan-out is queued and bounded.

---

## 27. Recommended Migration Strategy

1. **Restore correctness before scale** — the energy fix (Phase E1) is a contained query rewrite + decoupling; ship alone, verify against live DIMO (a one-off introspection check in CI), backfill.
2. **Guard against the failure class** — schema-shape tests + energy-event specs land with (not after) the fix.
3. **Make failure visible before making pipeline faster** — cursor + failure persistence + metrics (E3) precede scheduling changes, so tier tuning is measurable.
4. **Scale in safe increments** — apply existing-but-unused concurrency knobs first (config-only), then queue-ify reconciliation, then split worker process in PM2 (deploy-level, no code semantics change), then tiered polling.
5. **UI decoupling last** — remove fallback hooks and the route-GET write only after fallback-fire-rate metrics show ~0; until then they protect users.
6. Every phase is independently deployable and rollback-safe (flags/config for behavior switches; additive migrations only).

---

## 28. Risk Matrix

| Risk | Likelihood | Impact | Current mitigation | Needed |
|---|---|---|---|---|
| Energy events remain broken (422) | **Certain (ongoing)** | High — user-visible data loss | none | Phase E1 |
| Prune deletes restored/backfilled events after fix | High (once E1 ships without E2) | High — silent destruction | fetch-failure early-return (accidental) | E1 includes prune guard |
| Missed refuels at default DIMO config | High | Medium | none | E2 config tuning |
| Another invalid-GraphQL regression ships | Medium (happened twice) | High | none | E1 schema tests in CI |
| Snapshot/tracking backlog at fleet growth | High ≥300–500 vehicles | High — trips late/missed, UI fallback storms | jobId dedup only | E5 |
| Reconciliation overlap/starvation ≥1k | High | Medium-High | none | E5 queue-ification |
| DIMO rate limiting | Unknown threshold | High | none | E5 limiters; confirm limits with DIMO |
| DimoPollLog / Redis growth | Medium | Medium | retention cron | verify enabled + tune (E3) |
| Dual charging models diverge | Medium (when flags enabled) | Medium | none | E6 linkage + consistency check |
| Single-process event-loop contention | Medium today, High ≥1k | Medium | none | E5 process split |

---

## 29. Prioritized Findings

**P0 — production-broken now**

1. Recharge GraphQL query invalid → HTTP 422 → **all refuel + recharge detection dead fleet-wide since 2026-07-16/17** (`79e381069`; 8,817 warnings/day; last events 07-16/07-17).
2. Failure coupling: recharge exception aborts refuel persistence in `fetchEnergyEventSegments`; outer catch converts to silent empty.
3. Prune-on-empty in `pruneStaleSubSegments` — data-destructive the moment P0-1 is fixed; must ship together.

**P1 — will bite immediately or at first growth**

4. DIMO default refuel-detector config misses real refuels (KS MX 23-Aug proven live); no `config` tuning, no fallback evidence path.
5. Zero test coverage for energy events + no GraphQL schema-shape validation (this class of regression shipped twice).
6. No energy-detection observability: no cursor, no persisted failure, no detectorVersion, error bodies swallowed.
7. Snapshot fan-out (c=5) + trip tracking (c=1, unused config knob) + unchunked HF fetch — first scale cliffs (~300–1,000 vehicles).
8. Sequential inline warm/cold reconciliation over all vehicles (also the only energy trigger — cadence couples energy freshness to trip repair).

**P2 — architectural debt**

9. UI-triggered mutations: route GET rewrites waypoints every open; fallback auto-enrich hooks mask queue failures (measure, then retire).
10. `VehicleEnergyEvent` lacks lifecycle status/detectorVersion/org column; recharge duplicated across two models without linkage.
11. Missing VLS indexes on reconciliation filter columns; `DimoPollLog` volume; no BullMQ rate limiters; `WORKERS_ENABLED` doc/runtime mismatch.
12. Battery capability probe uses unsupported `limit` arg (`LIKELY` failing) — misreports recharge capability.

**P3 — hygiene**

13. Dead code: legacy single-shot event fetch, `DetectedTrip`, frontend `detectEnergyEvents` client, unused pagination scaffolding.
14. No persisted driver daily/weekly aggregates (only needed if product wants near-live scores).
15. DIMO Segments "canonical boundaries" rule vs live-FSM reality — document the actual dual-source architecture.
16. `.cursor/mcp.json` references non-existent `mcp-dimo@1.5.5` — DIMO MCP unusable as configured.

---

## 30. Recommended Implementation Phases

**Phase E1 — Restore energy-event detection (P0)**
*Scope:* Rewrite `buildDimoRechargeSegmentsQuery` against the live schema (mirror `energy-event-segments.query.ts`: no `id`/`limit`/`after`; correct signal selection); remove `after`-based pagination (window-splitting stays); decouple mechanisms in `fetchEnergyEventSegments` (per-mechanism error isolation returning per-mechanism outcome, so refuel persists even if recharge fails — and vice versa); make `detectEnergyEvents` skip prune when any mechanism fetch failed, and never prune down to zero from an empty persisted set; surface GraphQL error bodies into logs. Add CI schema-shape tests for all DIMO queries (introspection fixture) + full `EnergyEventsService` spec suite (persist gate, coalesce, prune safety).
*Files:* `recharge-segments/dimo-recharge-segments.{query,client,graphql,normalizer,types}.ts`, `dimo-segments.service.ts`, `energy-events.service.ts`, new specs.
*DB/API changes:* none. *Workers:* none.
*Migration:* deploy → verify live (one vehicle, then fleet) → 30–60-day backfill via existing `POST …/energy-events/detect` per vehicle (batched script).
*Tests:* as above + live smoke against DIMO. *Rollback:* revert commit; no schema change. *Risk:* low; prune guard is the critical review point.

**Phase E2 — Detection sensitivity + evidence (P1)**
*Scope:* Pass tuned `config` (e.g. `minIncreasePercent`) on refuel/recharge segment queries, calibrated against the KS MX case + historical events; on refuel-segment absence with observed fuel-rise in snapshots, record a CANDIDATE (no auto-confirm) — reusing the Battery-V2 fallback policy shape; respect the "fuel delta alone is not enough" rule via stationary + duration corroboration. Add `detectorVersion` + lifecycle `status` (CANDIDATE/CONFIRMED/REJECTED/SUPERSEDED) columns to `VehicleEnergyEvent` (additive migration; existing rows backfilled CONFIRMED); prune becomes `SUPERSEDED` transition instead of delete.
*Dependencies:* E1. *Files:* energy-events module, energy query builders, Prisma migration, timeline DTO (status-aware). *API:* additive fields. *Rollback:* config values revertible; migration additive. *Risk:* threshold tuning needs a validation pass over historical DIMO data before enabling fleet-wide.

**Phase E3 — Energy/enrichment observability (P1)**
*Scope:* Per-vehicle energy-detection cursor (last attempt/success window, last error code) — new small table or VLS-adjacent model following `VehicleTripDetectionState` pattern; Prometheus counters for energy fetch failures/creates/prunes and enrichment fallback-fire rate (instrument the UI-fallback POST endpoints to measure how often the safety net fires); implement `onEnrichmentFailure` durably (flag trip for repair); add missing queues to `MONITORED_QUEUES`; alert rule on "zero energy events created fleet-wide in 24h" (would have caught this outage in one day instead of six weeks).
*Dependencies:* E1. *Rollback:* observability-only. *Risk:* minimal.

**Phase E4 — Dedicated energy scheduling (P1/P2)**
*Scope:* Move energy detection out of trip-reconciliation Step 5 onto its own bounded BullMQ job family (Battery-V2 pattern: batch fan-out, per-vehicle jobId with window bucket, DLQ), cadence driven by the E3 cursor + vehicle activity tier (active/recent vehicles hourly-class, parked daily, offline none); optionally subscribe DIMO fuel/SOC triggers to enqueue immediate detection for affected vehicles.
*Dependencies:* E1–E3. *DB:* none beyond E3 cursor. *Workers:* new queue + processor; reconciliation Step 5 removed behind a config flag first. *Rollback:* flag back to Step 5. *Risk:* medium — cadence changes need the E3 metrics to validate coverage didn't regress.

**Phase E5 — Fleet-scale throughput (P1)**
*Scope:* Apply `WORKER_TRIP_TRACKING_CONCURRENCY` to the processor (exists, unused); raise snapshot concurrency + make the enqueue tick batched (single `addBulk`, indexed vehicle query); add missing `VehicleLatestState` indexes (`lastSeenAt`, `providerFetchedAt`, `dimoTokenId`); chunk `fetchHighFrequency` using the existing pagination helper; add BullMQ limiters on DIMO-bound queues; convert warm/cold reconciliation to batched queue jobs with run-level lock + progress cursor; split workers into a separate PM2 process (`WORKERS_ENABLED` made real); short-circuit route GET to stored waypoints.
*Dependencies:* E3 metrics to verify. *DB:* index migrations only. *Rollback:* per-knob config. *Risk:* medium — DIMO limits should be confirmed before raising concurrency (Section 10.10).

**Phase E6 — Charging-session consolidation (P2)**
*Scope:* Enable Battery-V2 HV session flags once E1 makes segment ingest work; link `HvChargeSession ↔ VehicleEnergyEvent` (shared `dimoSegmentId`/fingerprint reference + consistency check job); decide the single UI source of truth for "Laden" cards.
*Dependencies:* E1, E2. *Risk:* low-medium; flag-gated.

**Phase E7 — Backfill / reconciliation of the outage window (P1, runs after E1/E2)**
*Scope:* Controlled fleet backfill 2026-07-16 → present (refuel + recharge), tiered and rate-limited; report created/skipped/low-confidence per vehicle; explicitly verify KS MX 23-Aug event appears.
*Rollback:* events carry detectorVersion + status → identifiable cohort. *Risk:* DIMO load — run off-peak, batched.

**Phase E8 — UI decoupling (P2)**
*Scope:* Once E3 shows fallback-fire rate ≈ 0 and E5 keeps queues drained: remove `useAutoTripEnrichment`/auto behavior-enrich hooks (keep manual buttons), make route GET pure-read, enforce "UI only reads domain state".
*Dependencies:* E3 + E5 evidence. *Risk:* low with the metric gate; do not do this first.

**Phase E9 — Load validation (P2)**
*Scope:* Synthetic fleet load test (queue-injection harness, no real DIMO) validating snapshot/tracking/enrichment throughput at 1k/5k-vehicle profiles; document measured limits vs Section 16–17 estimates; near-live driver-score design decision (materialized subject aggregates) taken only after this data exists.

---

*Rule-compliance note: no production code was modified during this audit; this document is the only change. `Synqdrive Code → Changes`/`Architektur` records: no architecture change was made, so no Architektur update is required; this audit document itself is the change record.*
