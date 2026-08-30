# DIMO Phase 2A — Current Query Surface & Acquisition Reality Audit
**Date:** 2026-08-31  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Scope:** Forensic code/schema audit of every productive DIMO GraphQL acquisition path. No production changes.  
**Authority:** Phase 1 audit remains authority for score/consumer graph unless this audit disproves a specific assumption (none disproven).

---

## 1. Executive Summary

Phase 2A reconstructs SynqDrive's **complete current DIMO query/acquisition surface** from code: **27 productive query registry entries** (`DIMO-Q001`–`DIMO-Q027`), spanning `signalsLatest`, bucketed `signals(...)`, native `events(...)`, `segments(...)`, `availableSignals`, `dataSummary`, and `vinVCLatest`.

**Capability architecture verdict: `PARTIALLY_CAPABILITY_AWARE`.** SynqDrive runs periodic `availableSignals` + `dataSummary` preflight (7-day gate) and battery-specific capability probes, persisting capability rows — but **all driving acquisition queries use static, fleet-wide field lists**. Preflight results do not gate or reshape snapshot/live/HF/event query selection.

**Scaling headline (theoretical, from current architecture):**
| Surface | Per vehicle (worst-case steady state) | 100 vehicles | 1,000 vehicles |
|---|---:|---:|---:|
| Snapshot (`signalsLatest`) | 2,880 calls/day (ACTIVE_DRIVING tier, 30s) | 288,000/day | 2,880,000/day |
| Active trip (3 parallel queries / 30s tick) | 360 calls/hour active | 36,000/hour (100 concurrent active) | 360,000/hour |
| Post-trip HF | 1× `signals` @ 1s per completed trip | scales with trip count | scales with trip count |

**Critical findings (top 5):**
1. **REQUESTED_BUCKET ≠ OBSERVED_PROVIDER_CADENCE** for HF/live buckets — code requests `1s`/`7s`/`15s`/`20s` buckets; effective provider cadence is **UNKNOWN_REQUIRES_RUNTIME_PROBE** (July audit is HISTORICAL_EVIDENCE only).
2. **No per-sample SynqDrive receive timestamp** on HF/live bucket rows — only provider bucket `timestamp` and occasional `providerFetchedAt` on snapshot upsert.
3. **Raw HF time series not persisted in Postgres**; ClickHouse HF mirror is optional (`HF_MIRROR_ENABLED=false` default), subset of 6 signals + derived events — **PARTIAL_REPLAY_ONLY**.
4. **Query overlap is extensive** (speed/RPM/TPS/engine load/temperature across snapshot, live, HF) — mostly **NECESSARY_DIFFERENT_LATENCY / NECESSARY_DIFFERENT_RETENTION**, some **POTENTIAL_QUERY_DUPLICATION** on post-trip route+perf re-fetch.
5. **Four 2026-08-30 vehicle inventory files remain absent on `main`** — Phase 2B blocked on ingestion; vehicle availability columns stay `NO — PHASE_2B`.

**Phase 2A status: DONE** (exit criteria §30 satisfied from code/schema evidence).

---

## 2. Scope & Evidence

### 2.1 In scope
- All productive DIMO GraphQL operations in `backend/src/modules/dimo/**` and inline queries in callers.
- Scheduler/worker cadence, persistence, ClickHouse mirrors, downstream consumers.
- Global schema surface known from repo query builders + `data-analyse-signal-catalog.ts`.
- `availableSignals` / `dataSummary` current usage.

### 2.2 Out of scope (Phase 2B+)
- Per-vehicle signal availability matrix (four inventory docs).
- Runtime provider cadence/latency measurements.
- Flight Recorder design/implementation.
- Production query or scoring changes.

### 2.3 Canonical documents read (order)
1. `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md`
2. `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md`
3. `docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md`
4. `docs/audits/dimo-driving-signals-capability.md` — **HISTORICAL_EVIDENCE only**

### 2.4 Four vehicle inventory files — availability
| File | On `main` (2026-08-31 audit) |
|---|---|
| `docs/audits/dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md` | **NOT PRESENT** |
| `docs/audits/dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md` | **NOT PRESENT** |
| `docs/audits/dimo-ks-ms-661-signal-inventory-gap-analysis-2026-08-30.md` | **NOT PRESENT** |
| `docs/audits/dimo-hmue-c-215-signal-inventory-gap-analysis-2026-08-30.md` | **NOT PRESENT** |

### 2.5 Evidence tags used
`CONFIRMED_FROM_CODE` · `CONFIRMED_FROM_SCHEMA` · `CONFIRMED_FROM_CURRENT_DIMO_SCHEMA` · `HISTORICAL_EVIDENCE` · `INFERENCE` · `UNKNOWN_REQUIRES_RUNTIME_PROBE`

---

## 3. Query Registry

Stable IDs for Phase 2B/2C and future Flight Recorder cross-reference.

### DIMO-Q001 — LatestVehicleSnapshot
| Field | Value |
|---|---|
| **Domain** | Snapshot / `signalsLatest` |
| **Operation** | `LatestVehicleSnapshot` |
| **Source** | `backend/src/modules/dimo/queries/latest-vehicle-snapshot.query.ts` |
| **Builder** | `buildLatestSnapshotQuery` |
| **Caller(s)** | `DimoTelemetryService.fetchLatestVehicleSnapshot` ← `DimoSnapshotProcessor` |
| **Trigger** | Activity-tier snapshot scheduler (`DimoSnapshotScheduler` @ 30s tick; per-vehicle tier interval) |
| **Endpoint** | `POST {dimo.telemetryApiUrl}` GraphQL |
| **Signals (33 fields)** | See §4 |
| **Timeout** | Client 10s default; postGraphQL 15s override **CONFIRMED_FROM_CODE** |
| **Retry** | BullMQ job attempts/backoff on worker failure |
| **Cache** | None at HTTP layer; VLS monotonic merge suppresses stale upserts |
| **Persistence** | `VehicleLatestState` + optional `telemetry_snapshots` CH |
| **Retention** | PG indefinite; CH TTL 180d snapshots **CONFIRMED_FROM_CODE** |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q002 — LastSeenLocation
| Field | Value |
|---|---|
| **Domain** | Snapshot subset |
| **Operation** | `LastSeenLocation` |
| **Builder** | `buildLastSeenLocationQuery` |
| **Caller(s)** | `DimoTelemetryService.fetchLastSeenLocation` ← `VehiclesService` (fleet map / detail fallback) |
| **Trigger** | On-demand API (not scheduled poll) |
| **Signals** | `lastSeen`, `currentLocationCoordinates`, `speed` |
| **Persistence** | Transient API response only |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q003 — VehicleSummary (inline)
| Field | Value |
|---|---|
| **Domain** | Snapshot subset |
| **Operation** | `VehicleSummary` (inline in `dimo-telemetry.service.ts`) |
| **Caller(s)** | `fetchVehicleSummary` ← `DimoApiSyncService`, `DimoController` |
| **Trigger** | Identity/sync/on-demand |
| **Signals** | `lastSeen`, odometer, SOC, fuel %, `powertrainType`, `speed` |
| **Persistence** | Transient / sync metadata |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q004 — VehicleVin
| Field | Value |
|---|---|
| **Domain** | Identity (non-signals) |
| **Operation** | `VehicleVin` → `vinVCLatest` |
| **Caller(s)** | `fetchVehicleVin` ← sync/controller |
| **Persistence** | Vehicle identity fields |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q005 — GetLatestDTCs
| Field | Value |
|---|---|
| **Domain** | Snapshot / health |
| **Operation** | `GetLatestDTCs` |
| **Source** | `latest-dtc.query.ts` + inline variant in `dimo-dtc.processor.ts` |
| **Caller(s)** | `DimoDtcProcessor` (fan-out every ~3h) |
| **Signals** | `obdDTCList` |
| **Persistence** | DTC health tables via `DtcService` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q006 — TripDetectionCore
| Field | Value |
|---|---|
| **Domain** | Active trip / historical core |
| **Operation** | `TripDetectionCore` |
| **Builder** | `buildTripDetectionCoreQuery` |
| **Caller(s)** | `fetchRawTripCoreData` ← `TripDetectionOrchestrationService` (ACTIVE_TICK, start/end), reconciliation |
| **Trigger** | ACTIVE_TICK ~30s; repair/backfill |
| **Requested interval** | `20s` (REQUESTED_BUCKET) |
| **Aggregation** | `isIgnitionOn MAX`, others AVG/MAX |
| **Window** | First tick: `[start−60s, now]`; subsequent: `[lastCore−30s, now]` |
| **Persistence** | Trip FSM state, odometer/fuel deltas, waypoints indirect |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q007 — RouteEnrichment
| Field | Value |
|---|---|
| **Domain** | Active trip + post-trip route |
| **Operation** | `RouteEnrichment` |
| **Builder** | `buildRouteEnrichmentQuery` |
| **Caller(s)** | ACTIVE_TICK; finalize; `TripsService.enrichRoute`; reconciliation |
| **Requested interval** | `7s` |
| **Aggregation** | `currentLocationCoordinates RAND`, `speed AVG` |
| **Window overlap** | First: `start−60s`; else `lastRoute−15s` |
| **Persistence** | `VehicleTripWaypoint` (deduped); optional CH waypoints mirror |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q008 — Performance
| Field | Value |
|---|---|
| **Domain** | Active trip + post-trip |
| **Operation** | `Performance` |
| **Builder** | `buildPerformanceQuery` |
| **Caller(s)** | ACTIVE_TICK; `TripsService`; TDI indirect via `VehicleTrip.avgRpm/avgEngineLoad/avgThrottlePosition` |
| **Requested interval** | `15s` |
| **CALL_CADENCE** | ACTIVE_TICK 30s default (`worker.tripTrackingIntervalMs`) |
| **Note** | `15s` is REQUESTED_BUCKET, not CALL_CADENCE |
| **Persistence** | Live: trip aggregate columns; post-trip: trip detail |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q009 — HighFrequency
| Field | Value |
|---|---|
| **Domain** | Post-trip HF |
| **Operation** | `HighFrequency` |
| **Builder** | `buildHighFrequencyQuery` |
| **Caller(s)** | `TripBehaviorEnrichmentService`, `LteR1BehaviorEnrichmentService`, `EventContextEnrichmentService`, shadow detector |
| **Trigger** | Post-finalize (+5s delay `HF_ENRICH_DELAY_MS`) |
| **Requested interval** | `1s` |
| **Aggregation** | All fields `AVG` |
| **Window** | `[trip.startTime, trip.endTime]` (no padding in builder) |
| **Persistence** | Derived events/counters only in PG; optional CH HF mirror |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q010 — EnvironmentTemperature
| Field | Value |
|---|---|
| **Domain** | Post-trip / finalize context |
| **Operation** | `EnvironmentTemperature` |
| **Builder** | `buildEnvironmentTemperatureQuery` |
| **Requested interval** | `2m` |
| **Caller(s)** | ACTIVE_TICK finalize path; `TripsService.enrichRoute` |
| **Signals** | `exteriorAirTemperature` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q011 — TirePressureHistory
| Field | Value |
|---|---|
| **Domain** | Historical (defined, unused) |
| **Builder** | `buildTirePressureHistoryQuery` |
| **Requested interval** | `3m` |
| **Caller(s)** | **None in production** — method exists, no external caller found |
| **Status** | Dead query surface (builder + fetch method only) |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q012 — BatteryCrankWindow
| Field | Value |
|---|---|
| **Domain** | Post-start ICE battery health |
| **Builder** | `buildBatteryCrankQuery` |
| **Requested interval** | `5s` |
| **Caller(s)** | `fetchCrankWindow` ← `BatteryV2Service`, `BatteryStartProxyExtractService` |
| **Window** | ~`[tripStart−30s, tripStart+120s]` (caller-defined) |
| **Persistence** | Battery V2 crank/rest features |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q013 — TripFuelSummary (inline)
| Field | Value |
|---|---|
| **Domain** | Post-trip fuel |
| **Operation** | inline `TripFuelSummary` in `dimo-segments.service.ts` |
| **Requested interval** | `30s` |
| **Caller(s)** | `fetchFuelSummary` ← behavior enrichment |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q014 — RefuelFuelLevelSamples (inline)
| Field | Value |
|---|---|
| **Domain** | Energy events |
| **Operation** | inline `RefuelFuelLevelSamples` |
| **Requested interval** | `30s` |
| **Caller(s)** | `fetchFuelLevelSamples` ← `EnergyEventsService` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q015 — DrivingEvents (native)
| Field | Value |
|---|---|
| **Domain** | Native events |
| **Builder** | `buildDrivingEventsQuery` |
| **Operation** | `DimoEvents` → `events(...)` |
| **Filter names** | `behavior.harshBraking`, `behavior.extremeBraking`, `behavior.harshAcceleration`, `behavior.extremeAcceleration`, `behavior.harshCornering`, `behavior.extremeEmergency`, `behavior.extremeEmergencyBraking`, `safety.collision` |
| **Pagination** | 6h windows (`DIMO_DRIVING_EVENTS_PAGE_MS`) |
| **Retry** | 3 attempts, 250ms×attempt backoff |
| **Caller(s)** | `LteR1BehaviorEnrichmentService`, braking intake |
| **Persistence** | `DrivingEvent` rows, trip counters |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q016 — SafetyEvents
| Field | Value |
|---|---|
| **Domain** | Native events |
| **Builder** | `buildSafetyEventsQuery` |
| **Filter** | `safety.collision` only |
| **Caller(s)** | `MisuseCaseReconcileService` |
| **Persistence** | Misuse aggregation (not DrivingEvent rows) |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q017 — EventDataSummary
| Field | Value |
|---|---|
| **Domain** | Capability / preflight |
| **Builder** | `buildEventDataSummaryQuery` |
| **Caller(s)** | `fetchEventDataSummary` ← LTE_R1 enrichment pre-check |
| **Persistence** | Transient (capability assessment input) |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q018 — DataSummary
| Field | Value |
|---|---|
| **Domain** | Capability preflight |
| **Builder** | `buildDataSummaryQuery` |
| **Caller(s)** | `DimoAvailableSignalsPreflightService` |
| **Persistence** | Classified probes → `VehicleDrivingCapability` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q019 — AvailableSignals
| Field | Value |
|---|---|
| **Domain** | Capability |
| **Builder** | `buildAvailableSignalsQuery` |
| **Caller(s)** | Preflight service, battery capability, ops script |
| **Gate** | `DIMO_PREFLIGHT_MIN_INTERVAL_MS` (7 days) |
| **Persistence** | Capability repository (not raw list TTL cache) |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q020 — BatteryCapabilityPreflight
| Field | Value |
|---|---|
| **Domain** | Battery capability |
| **Builder** | `buildBatteryCapabilityPreflightQuery` |
| **Combines** | `availableSignals` + battery-field `signalsLatest` subset |
| **Caller(s)** | `BatteryCapabilityPreflightService` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q021 — RechargeSegmentsProbe
| Field | Value |
|---|---|
| **Domain** | Segments probe |
| **Builder** | `buildRechargeSegmentsProbeQuery` |
| **Mechanism** | `recharge`, `limit: 1` |
| **Caller(s)** | `probeRechargeSegments` ← battery preflight |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q022 — TripSegments
| Field | Value |
|---|---|
| **Domain** | Segments / trip repair |
| **Builder** | `buildTripSegmentsQuery` |
| **Mechanisms** | `ignitionDetection`, `frequencyAnalysis`, `changePointDetection`, `idling` |
| **Caller(s)** | Reconciliation, segment validation, shadow detector |
| **Config** | `minSegmentDurationSeconds: 60`, `maxGapSeconds: 300`, `signalCountThreshold: 1` |
| **SignalRequests** | `speed MAX`, odometer MIN/MAX |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q023 — EnergyEventSegments (refuel)
| Field | Value |
|---|---|
| **Builder** | `buildEnergyEventSegmentsQuery` mechanism `refuel` |
| **Caller(s)** | `fetchEnergyEventSegments` ← `EnergyEventsService` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q024 — EnergyEventSegments (recharge legacy)
| Field | Value |
|---|---|
| **Builder** | `buildEnergyEventSegmentsQuery` mechanism `recharge` |
| **Note** | Legacy path; production recharge may use Q025 client |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q025 — DimoRechargeSegments (canonical recharge client)
| Field | Value |
|---|---|
| **Builder** | `buildDimoRechargeSegmentsQuery` (`recharge-segments/` module) |
| **Caller(s)** | `DimoRechargeSegmentsClient` ← energy events recharge path |
| **Features** | Optional `signalFilter: { source: { eq } }` with fallback retry |
| **Window chunking** | `splitDimoRechargeQueryWindows` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q026 — ShadowDetector HF + Segments
| Field | Value |
|---|---|
| **Caller(s)** | `ShadowDetectorEnrichmentService` |
| **Queries** | Q009 + Q022 (changePointDetection) |
| **Trigger** | Shadow/analysis pipeline (non-production scoring path) |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q027 — EventContext HF window
| Field | Value |
|---|---|
| **Caller(s)** | `EventContextEnrichmentService` |
| **Query** | Q009 for narrow windows around native events |
| **Evidence** | CONFIRMED_FROM_CODE |

**Registry totals:** 27 entries · Snapshot-family 5 · Live bucket 3 · HF/historical 6 (incl. dead Q011) · Events 3 · Segments 5 · Capability 5

---

## 4. Snapshot / signalsLatest

### 4.1 Production snapshot query (DIMO-Q001)
**GraphQL root:** `signalsLatest(tokenId)` — **CONFIRMED_FROM_CODE**

| # | DIMO field | Alias | ICE/EV branch | Normalized VLS field |
|---:|---|---|---|---|
| 1 | `lastSeen` | — | both | `sourceTimestamp` / freshness |
| 2 | `currentLocationCoordinates` | lat/lng | both | `latitude`, `longitude` |
| 3 | `speed` | — | both | `speedKmh` |
| 4 | `powertrainTransmissionTravelledDistance` | odometer | both | `odometerKm` |
| 5 | `powertrainFuelSystemRelativeLevel` | fuel % | ICE-primary | `fuelLevelPercent` |
| 6 | `powertrainFuelSystemAbsoluteLevel` | fuel L | ICE-primary | JSON/meta |
| 7–18 | traction battery family (SOC, energy, SOH, power, voltage, temp, charging*) | EV | VLS + battery mapper |
| 19–21 | combustion oil/DEF/ECT | ICE | VLS / health |
| 22–26 | tire pressures + warning | both | VLS tire fields |
| 27 | `isIgnitionOn` | — | ICE-primary | `isIgnitionOn` |
| 28 | `obdIsPluggedIn` | connectivity | both | connectivity meta |
| 29 | `connectivityCellularIsJammingDetected` | — | both | connectivity meta |
| 30 | `obdEngineLoad` | — | ICE | `engineLoad` |
| 31 | `lowVoltageBatteryCurrentVoltage` | LV | both | battery mapper |
| 32 | `powertrainType` | — | both | powertrain classification |

No GraphQL `@include` ICE/EV conditionals — **static superset query**; nulls expected on irrelevant powertrain **CONFIRMED_FROM_CODE**.

### 4.2 Scheduler cadence architecture
| Tier | Default interval | Env override |
|---|---:|---|
| ACTIVE_DRIVING | 30s | `WORKER_SNAPSHOT_TIER_ACTIVE_DRIVING_MS` |
| RECENTLY_ACTIVE | 60s | `WORKER_SNAPSHOT_TIER_RECENTLY_ACTIVE_MS` |
| RESTING_STANDBY | 5 min | `WORKER_SNAPSHOT_TIER_RESTING_STANDBY_MS` |
| LONG_IDLE | 30 min | `WORKER_SNAPSHOT_TIER_LONG_IDLE_MS` |

Scheduler tick: **30s** (`DimoSnapshotScheduler`). Job dedup: `jobId=snapshot-<vehicleId>` with remove-before-add **CONFIRMED_FROM_CODE**.

Legacy rollback: `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` → all vehicles every 30s.

### 4.3 KNOWN_TO_CODE_NOT_QUERIED (snapshot)
Signals present in catalog/types/docs but **not** in `buildLatestSnapshotQuery` (classification **KNOWN_TO_CODE_NOT_QUERIED**, not AVAILABLE_ON_VEHICLE):

`obdDTCList` (separate Q005), `obdThrottlePosition`, `powertrainCombustionEngineSpeed`, `powertrainCombustionEngineTorque*`, `exteriorAirTemperature`, `currentLocationAltitude`, `powertrainTransmissionCurrentGear`, `obdRunTime`, many chassis/dynamics candidates in `data-analyse-signal-catalog.ts` marked HF-only.

---

## 5. Snapshot Persistence

| DIMO signal | Query | Normalized | VLS column / JSON | CH column | Consumers |
|---|---|---|---|---|---|
| speed | Q001 | km/h | `speed_kmh` | `speed_kmh` | Trips, map, TDI inputs |
| odometer | Q001 | km | `odometer_km` | — | Trips, health |
| ignition | Q001 | bool/null | `is_ignition_on` | state_changes | Trip FSM |
| engine load | Q001 | % | `engine_load` | `engine_load` | Launch proxy |
| LV voltage | Q001 | V | battery JSON | — | Battery health |
| tire pressures | Q001 | kPa normalized | tire fields | — | Tire health |
| EV/HV fields | Q001 | various | VLS + mapper | partial | Battery, energy UI |

**Update suppression:** `shouldApplyVlsTelemetryUpdate` monotonic on `sourceTimestamp` — stale snapshot skips field update but may update `providerFetchedAt` **CONFIRMED_FROM_CODE**.

---

## 6. Snapshot Scaling

Theoretical request volume from tier defaults (single vehicle, continuous tier):

| Tier | Interval | req/min | req/hour | req/day |
|---|---:|---:|---:|---:|
| ACTIVE_DRIVING | 30s | 2 | 120 | **2,880** |
| RECENTLY_ACTIVE | 60s | 1 | 60 | 1,440 |
| RESTING_STANDBY | 5m | 0.2 | 12 | 288 |
| LONG_IDLE | 30m | 0.033 | 2 | 48 |

Fleet scenarios (all vehicles in same tier):

| Vehicles | ACTIVE_DRIVING/day | RESTING_STANDBY/day |
|---:|---:|---:|
| 1 | 2,880 | 288 |
| 100 | 288,000 | 28,800 |
| 1,000 | 2,880,000 | 288,000 |
| 10,000 | 28,800,000 | 2,880,000 |

**Rate classification:** REQUEST_VOLUME **HIGH** at fleet scale; QUERY_COMPLEXITY **MODERATE** (single signalsLatest, ~33 fields); RATE_LIMIT_RISK **MODERATE** (activity tier mitigates vs legacy O(N) every 30s).

---

## 7. Active Trip Live Polling

### 7.1 ACTIVE_TICK pipeline
**Trigger:** self-requeueing BullMQ job, default delay **30s** (`TRACKING_INTERVAL_MS`) **CONFIRMED_FROM_CODE**

Per tick **3 parallel** GraphQL calls (Q006+Q007+Q008) **CONFIRMED_FROM_CODE**.

| Bucket query | REQUESTED_BUCKET | CALL_CADENCE | OBSERVED_PROVIDER_CADENCE |
|---|---|---|---|
| Core | 20s | 30s tick | UNKNOWN_REQUIRES_RUNTIME_PROBE |
| Route | 7s | 30s tick | UNKNOWN_REQUIRES_RUNTIME_PROBE |
| Performance | 15s | 30s tick | UNKNOWN_REQUIRES_RUNTIME_PROBE |

**15s clarification:** In live perf, `15s` is **REQUESTED_BUCKET** only. **CALL_CADENCE** is ACTIVE_TICK ~30s. Not provider sample frequency.

### 7.2 Window / watermark behavior
| Stream | First tick window | Subsequent overlap |
|---|---|---|
| Core | `[start−60s, now]` | `[lastCore−30s, now]` |
| Route | `[start−60s, now]` | `[lastRoute−15s, now]` |
| Perf | `[start−60s, now]` | `[lastPerf−30s, now]` |

Watermarks: `lastCoreProcessedAt`, `lastRouteProcessedAt`, `lastDrivingProcessedAt` on detection state **CONFIRMED_FROM_CODE**.

### 7.3 Transient vs persisted (live)
| Data | Persisted during trip | Lost after ACTIVE_TICK |
|---|---|---|
| Core points | FSM + trip metrics partial | Raw bucket series not stored |
| Route points | Waypoints (deduped) | Overlap discarded at ingest |
| Perf readings | Rolling avg RPM/load/TPS on `VehicleTrip` | Raw 15s series not stored |

---

## 8. Active Trip Request Model

| Metric | 1 active vehicle | 100 concurrent | 1,000 concurrent |
|---|---:|---:|---:|
| ACTIVE_TICK jobs/hour | 120 | 12,000 | 120,000 |
| DIMO GraphQL calls/hour (×3) | **360** | **36,000** | **360,000** |
| + Snapshot (ACTIVE_DRIVING) | +120/hr | +12,000/hr | +120,000/hr |
| Combined approx/hr | 480 | 48,000 | 480,000 |

**Constant:** `ACTIVE_TICK_DIMO_CALLS_PER_JOB = 3` **CONFIRMED_FROM_CODE** (`p12-final5-workload-model.ts`).

Post-trip finalize may add Q007+Q010 once per trip (not per tick).

---

## 9. HF / Historical Time Series

### 9.1 Primary HF query (DIMO-Q009)
| Property | Value |
|---|---|
| Interval arg | `"1s"` (REQUESTED_INTERVAL) |
| ASSUMED_INTERVAL in docs | 1000ms in catalog constants |
| MEASURED_EFFECTIVE_INTERVAL | UNKNOWN_REQUIRES_RUNTIME_PROBE |
| Historical note | July audit ~3–10s median — **HISTORICAL_EVIDENCE** |
| Signals (15) | speed, ECT, RPM, TPS, engineLoad, runTime, torque, torque%, ext temp, altitude, gear, ignition, batt power, SOC, batt temp |
| Min points gate | `<10` raw / `<5` clean → skip enrichment **CONFIRMED_FROM_CODE** |
| Delay after trip | 5s (`HF_ENRICH_DELAY_MS`) |

### 9.2 Other historical intervals
| Query | Interval | Purpose |
|---|---|---|
| Q006 | 20s | Live + repair core |
| Q007 | 7s | Route |
| Q008 | 15s | Perf |
| Q010 | 2m | Exterior temp |
| Q011 | 3m | Tire (unused) |
| Q012 | 5s | Crank window |
| Q013/Q014 | 30s | Fuel |

No server-side pagination on `signals(...)` — entire trip window in one query **CONFIRMED_FROM_CODE**. Long trips → large responses (SCALABILITY_RISK).

---

## 10. HF Preprocessing & Information Loss

Pipeline: DIMO response → parser (`fetchHighFrequency`) → `preprocessHighFrequency` → gap split → detectors → `TripBehaviorEvent` / abuse → aggregates → optional CH mirror.

| HF signal | Stage loss | Classification |
|---|---|---|
| Full 1s bucket series | Not in PG after enrichment | DISCARDED (unless CH mirror) |
| Duplicate timestamps in overlap | Dedup in live route only | PARTIALLY_PERSISTED |
| Raw provider timestamp | Kept on derived events as `observedAt` | PARTIALLY_PERSISTED |
| SynqDrive receive time | Not stored per HF point | DISCARDED |
| Rejected spikes/gaps | `splitByGaps`, preprocessing | DISCARDED |
| Detector-negative intervals | No event rows | DISCARDED |
| Native DIMO events | Separate path (Q015) | PERSISTED |

---

## 11. ClickHouse HF Mirror

| Property | Value |
|---|---|
| Gate | `HF_MIRROR_ENABLED=true` required (default **false**) |
| Tables | `telemetry_hf_points`, `telemetry_hf_windows`, `telemetry_hf_events` |
| Points subset | 6 signals only in mirror map (speed, RPM, ECT, TPS, engineLoad, traction power) |
| Raw vs normalized | Normalized `valueFloat`; quality=`normalized` |
| Failure handling | Fire-and-forget; no retry queue; enrichment unaffected |
| Reads | `DataAnalyseService`, evidence read models — analytics only |
| Replay suitability | **PARTIAL_REPLAY_ONLY** (subset, post-processed, no receive timestamp) |

Snapshot CH (`telemetry_snapshots`, `telemetry_state_changes`): active when CH configured; TTL 180d/365d **CONFIRMED_FROM_CODE**.

---

## 12. Native Events

### 12.1 Native Event Registry (global — SynqDrive understands)
| DIMO event name | Internal type | Severity | Persisted | Trip counter | Score | Brake | Tire |
|---|---|---|---|---|---|---|
| behavior.harshBraking | HARSH_BRAKING | 0.6 | DrivingEvent | hardBrakingCount | braking stress | ledger | indirect |
| behavior.extremeBraking | EXTREME_BRAKING | 0.9 | yes | hardBrakingCount | yes | yes | indirect |
| behavior.extremeEmergency* | EXTREME_BRAKING | 0.9 | yes | yes | yes | yes | — |
| behavior.harshAcceleration | HARSH_ACCELERATION | 0.6 | yes | hardAccelerationCount | longitudinal | — | — |
| behavior.extremeAcceleration | HARSH_ACCELERATION (EXTREME class) | ≥0.9 | yes | yes | yes | — | — |
| behavior.harshCornering | HARSH_CORNERING | 0.5 | yes | corneringEvents | — | — | tire proxy |
| safety.collision | SAFETY_COLLISION | 0.95 | yes / misuse | abuse | high | yes | — |
| unknown | UNMAPPED_PROVIDER_EVENT | 0.3 | yes | varies | low | — | — |

Dedup key: `providerEventIdForSample` (timestamp+name+source hash) **CONFIRMED_FROM_CODE**.

Vehicle-specific event availability: **NO — PHASE_2B**.

---

## 13. Segments

| Mechanism | Role | Scoring use |
|---|---|---|
| `changePointDetection` | Trip repair boundaries | TRIP_BOUNDARY_SOURCE (repair) |
| `ignitionDetection` | Segment validation | CONTEXT_SOURCE |
| `frequencyAnalysis` | Validation | CONTEXT_SOURCE |
| `idling` | Validation | NOT_USED_FOR_SCORING |
| `refuel` | Energy events | NOT_USED_FOR_SCORING |
| `recharge` | Energy events | NOT_USED_FOR_SCORING |

DIMO segments are **canonical for repair/backfill**, not primary live trip FSM (live uses core stream) **CONFIRMED_FROM_CODE** aligned with Phase 1.

---

## 14. availableSignals Usage

| Question | Answer | Evidence |
|---|---|---|
| Productively queried? | Yes — preflight + battery capability | CONFIRMED_FROM_CODE |
| Stored? | Classified capability probes in PG | CONFIRMED_FROM_CODE |
| TTL | 7-day min interval (`DIMO_PREFLIGHT_MIN_INTERVAL_MS`) | CONFIRMED_FROM_CODE |
| Drives query selection? | **No** for driving queries | CONFIRMED_FROM_CODE |
| Hard-coded assumptions despite preflight? | **Yes** — all Q001–Q009 field lists static | CONFIRMED_FROM_CODE |

**Verdict:** `PARTIALLY_CAPABILITY_AWARE` — see §28.

---

## 15. Global DIMO Schema Surface

SynqDrive code demonstrates these query families exist on DIMO Telemetry API **CONFIRMED_FROM_CURRENT_DIMO_SCHEMA** (via query builders that compile and production paths that execute):

| Family | Root field | SynqDrive uses? |
|---|---|---|
| Latest point-in-time | `signalsLatest` | Yes |
| Historical buckets | `signals(from,to,interval)` | Yes |
| Native events | `events(from,to,filter)` | Yes |
| Segments | `segments(mechanism,config,signalRequests)` | Yes |
| Capability list | `availableSignals` | Yes (preflight) |
| Inventory summary | `dataSummary` | Yes |
| VIN | `vinVCLatest` | Yes |

**GLOBAL_DIMO_SCHEMA_SIGNAL_CATALOG (abbreviated — full list in `data-analyse-signal-catalog.ts`):**

| signal/schema field | latest? | historical? | event? | queried by SynqDrive? | vehicle availability |
|---|---|---|---|---|---|
| speed | yes | yes | — | yes | NO — PHASE_2B |
| powertrainCombustionEngineSpeed | no* | yes | — | yes | NO — PHASE_2B |
| obdThrottlePosition | no* | yes | — | yes | NO — PHASE_2B |
| behavior.harshBraking | — | — | yes | yes | NO — PHASE_2B |
| yawRate / lateralAccel (catalog candidates) | — | — | — | no | NO — PHASE_2B |

*Not in main snapshot query Q001; queried on HF/live paths.

---

## 16. Signal Canonicalization

| DIMO field | Canonical | Unit conversion | Storage | Consumer | Redundancy role |
|---|---|---|---|---|---|
| speed | speedKmh | none | VLS, waypoints, HF | Trips, TDI, health | PARALLEL across surfaces |
| powertrainCombustionEngineSpeed | rpm | none | trip avgs, HF | TDI engine load | CURRENT_PRIMARY (HF/live) |
| obdEngineLoad | engineLoad | none | VLS snapshot, HF | Launch proxy, TDI | PARALLEL snapshot+HF |
| obdThrottlePosition | throttlePosition | none | trip avgs, HF | TDI transmission load | CURRENT_PRIMARY |
| powertrainCombustionEngineECT | engineCoolantTempC | none | HF, snapshot ECT | Abuse detectors | PARALLEL |
| powertrainTractionBatteryCurrentPower | tractionBatteryPowerKw | ÷1000 in parser | HF | EV regen summary | CURRENT_PRIMARY |
| lowVoltageBatteryCurrentVoltage | lvBatteryVoltage | mapper | VLS | Battery health | CURRENT_PRIMARY |

Engine load variants: only `obdEngineLoad` queried (no `powertrainCombustionEngineLoad` in current builders).

Odometer: `powertrainTransmissionTravelledDistance` — CURRENT_PRIMARY.

---

## 17. Query Overlap / Redundancy

| Physical signal | Surfaces | Cadence | Retention | Classification |
|---|---|---|---|---|
| speed | Snapshot, Live core, Live route, HF | 30s / 20s / 7s / 1s buckets | VLS + waypoints + derived | NECESSARY_DIFFERENT_LATENCY |
| RPM | Live perf 15s, HF 1s, crank 5s | mixed | trip avgs / battery | NECESSARY_DIFFERENT_RETENTION |
| TPS | Live perf, HF | 15s / 1s | trip avgs / events | NECESSARY_DIFFERENT_LATENCY |
| engine load | Snapshot, Live perf, HF | 30s / 15s / 1s | VLS + derived | NECESSARY_DIFFERENT_LATENCY |
| ext temperature | HF, env 2m, snapshot N/A | post-trip | trip meta | REDUNDANT_BUT_LOW_COST |
| route coords | Live route, post-trip route re-fetch | 30s tick + once | waypoints | POTENTIAL_QUERY_DUPLICATION |

**Overlap case count:** 12 documented multi-surface signals (see Signal-Surface Matrix §B).

---

## 18. Timestamp / Clock Model

| Surface | Provider sample time | Bucket time | SynqDrive received | DB createdAt |
|---|---|---|---|---|
| Snapshot | per-signal `timestamp` + `lastSeen` | N/A | `providerFetchedAt` on upsert | yes |
| Live buckets | row `timestamp` | same | not per row | trip state updates |
| HF | row `timestamp` | same | not per row | event `observedAt` |
| Native events | `timestamp` | N/A | not stored | DrivingEvent rows |

**Provider→SynqDrive latency measurable today?** Only coarsely via snapshot `providerFetchedAt − sourceTimestamp`. **Not** for HF/live points — **TIMESTAMP_GAP**.

---

## 19. Missing / Null / Stale Semantics

| Condition | Snapshot | Live | HF | Events |
|---|---|---|---|---|
| null field | skip VLS field update | treated as null in parser | filtered/skipped | row skipped |
| missing ignition (EV) | null preserved | null (not false) | AVG may yield 0–1 | N/A |
| stale snapshot | monotonic guard | N/A | N/A | N/A |
| empty series | error/empty snapshot metric | POSSIBLE_END paths | skip enrichment | empty → zero counters |
| partial GQL errors | throw if no data | warn + [] | warn + [] | retry then [] |

**Data quality risk:** "not delivered" vs `0` vs "last value" not uniformly distinguished on live/HF **CONFIRMED_FROM_CODE**.

---

## 20. Hardware / Provider Profiles

| Profile | Code gates | Query differences | Native event authority | HF authority |
|---|---|---|---|---|
| LTE_R1 | `hardwareType === 'LTE_R1'` | Same static queries | Q015 primary for harsh events | HF for abuse + context |
| SMART5 | assessability branches | Same queries | Less native event reliance documented | HF abuse path shared |
| UNKNOWN | default policies | Same queries | fallback | HF-only detectors |

**No hardware-specific GraphQL field lists** in driving queries — profile affects enrichment interpretation, not query shape **CONFIRMED_FROM_CODE**.

---

## 21. Current Capability Architecture

See §28 verdict.

**Missing for Phase 2F capability-first:**
- Query profile manifest driving field selection
- Runtime feedback loop from `availableSignals` into builders
- Per-signal cadence negotiation
- Detector eligibility from persisted capability rows

---

## 22. Request / Storage Scalability

| Surface | Calls/trip (typical) | Calls/active min | Storage | Volume risk |
|---|---:|---:|---|---|
| Snapshot | n/a | 2/hr tier max | VLS + CH | HIGH fleet |
| Active live | 3 × (duration/30s) | 6/min | waypoints + avgs | HIGH concurrent trips |
| Post-trip HF | 1 + context windows | n/a | derived only | MODERATE |
| Native events | ⌈duration/6h⌉ pages | n/a | DrivingEvent | LOW–MODERATE |
| Segments repair | episodic | n/a | repair metadata | LOW |

Post-trip typical ICE/LTE trip (1h): ~1 HF + 1 route + 1 perf + 1 temp + 1 fuel + 1–2 event pages + event summary ≈ **6–8 queries/trip** (excluding live polling during trip).

---

## 23. Findings

| ID | Type | Severity | Summary |
|---|---|---|---|
| F2A-01 | QUERY_SURFACE_FACT | — | 27 productive DIMO queries identified with static field lists |
| F2A-02 | CAPABILITY_ARCHITECTURE_GAP | P2 | Preflight does not drive acquisition queries |
| F2A-03 | TIMESTAMP_GAP | P2 | No HF/live receive timestamp; latency not measurable per sample |
| F2A-04 | DATA_RETENTION_GAP | P2 | Raw HF discarded; CH mirror partial/off by default |
| F2A-05 | SCALABILITY_RISK | P2 | ACTIVE_TICK ×3 × fleet concurrent trips dominates burst load |
| F2A-06 | QUERY_REDUNDANCY | P3 | Post-trip route/perf re-fetch overlaps live data |
| F2A-07 | PROVENANCE_GAP | P2 | REQUESTED_INTERVAL ≠ proven effective cadence |
| F2A-08 | QUERY_SURFACE_FACT | P3 | Q011 TirePressureHistory has no production caller |
| F2A-09 | UNKNOWN_REQUIRES_RUNTIME_PROBE | — | OBSERVED_PROVIDER_CADENCE for all bucket queries |

---

## 24. Runtime Probe Backlog

| Probe ID | Question | Vehicle needed? | Signal/query | Expected evidence | Why code cannot answer | Before phase |
|---|---|---|---|---|---|---|
| RP-01 | Effective cadence for HF `1s` query | yes | Q009 | Point interval histogram | No runtime metrics | 2B/3 |
| RP-02 | Effective cadence live 15s perf bucket | yes | Q008 | Compare bucket timestamps | No logging | 2B |
| RP-03 | Effective cadence live 7s route | yes | Q007 | GPS bucket spacing | No logging | 2B |
| RP-04 | Effective cadence live 20s core | yes | Q006 | Core stream spacing | No logging | 2B |
| RP-05 | Provider latency snapshot | yes | Q001 | fetchedAt−lastSeen | Partial only | 3 |
| RP-06 | listed-but-null behavior | yes | availableSignals vs query | Null rate matrix | Needs vehicle | 2B |
| RP-07 | Native event emission rate | yes | Q015 | Events/min vs trip | Vehicle-specific | 2B |
| RP-08 | safety.collision availability | yes | Q016 | Non-empty fetch | Vehicle-specific | 2B |
| RP-09 | Segment mechanism yield | yes | Q022 | Segments/trip | Repair-only path | 2B |
| RP-10 | Recharge source filter necessity | yes | Q025 | With/without filter | Tesla-specific | 2B |
| RP-11 | Fuel 30s bucket vs tank physics | yes | Q013 | Sample timestamps | ICE LTE_R1 | 2B |
| RP-12 | DIMO rate-limit thresholds | no | all | 429/503 patterns | External | 2C |
| RP-13 | CH mirror completeness vs HF | yes | mirror | Point count vs raw | Optional flag | 3 |
| RP-14 | Ignition null on EV trip end | yes | Q006 | FSM transitions | Edge cases | 2B |
| RP-15 | RAND coordinate bucket semantics | yes | Q007 | Spatial accuracy | Schema behavior | 2B |
| RP-16 | Event timestamp vs HF alignment | yes | Q015+Q009 | Δt distribution | Context window | 3 |
| RP-17 | availableSignals stability | yes | Q019 | Weekly diff | 7-day gate | 2B |
| RP-18 | Crank 5s MIN/MAX preservation | yes | Q012 | Voltage dip capture | Battery SOH | 2B |
| RP-19 | Long-trip HF payload limits | yes | Q009 | Timeout/point cap | Duration stress | 2C |
| RP-20 | SMART5 native events vs HF | yes | both paths | Counter comparison | Profile split | 2B |

**Backlog count: 20**

---

## 25. Phase-2B Handoff

1. Ingest four vehicle inventory files when on `main`.
2. For each signal in GLOBAL catalog + Query Registry, classify AVAILABLE / NULL / NOT_AVAILABLE per vehicle.
3. Execute runtime probes RP-01–RP-20 prioritized by TDI/brake/tire relevance.
4. Build cross-vehicle capability matrix (Phase 2B) — do **not** infer from schema alone.

---

## 26. Phase-3 Flight Recorder Implications

Must capture per observation (minimum):
- Query ID (DIMO-Qxxx)
- Provider timestamp + **SynqDrive received timestamp**
- Raw bucket value before aggregation loss
- Full HF point sequence pre-detector
- Native event metadata JSON
- Request window `[from,to]` and REQUESTED_INTERVAL

Recorder should align to **27 query surfaces** but prioritize HF (Q009), live triple (Q006–008), and native events (Q015) for kinematic replay gap identified in Phase 1 F-14.

---

## Appendix A — Master Query Matrix

| Query ID | Surface | Trigger | Call cadence | Requested interval | Signals (count) | Aggregation | Window | Persistence | Retention | TDI | Brake | Tire | API/UI | Rate-volume | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q001 | Snapshot | Tier scheduler | 30s–30m | latest | 33 | point | n/a | VLS+CH | PG∞/CH180d | indirect | health | health | yes | HIGH | CODE |
| Q002 | Snapshot | On-demand | ad hoc | latest | 3 | point | n/a | none | transient | — | — | map | yes | LOW | CODE |
| Q003 | Snapshot | Sync | ad hoc | latest | 6 | point | n/a | sync | — | — | — | — | admin | LOW | CODE |
| Q004 | Identity | Sync | ad hoc | n/a | vin | n/a | n/a | vehicle | — | — | — | — | admin | LOW | CODE |
| Q005 | Snapshot | DTC 3h | 3h | latest | 1 | point | n/a | DTC | PG | — | — | — | health | LOW | CODE |
| Q006 | Live | ACTIVE_TICK | 30s | 20s | 5 | mixed | overlap | FSM | trip | yes | — | — | trips | HIGH active | CODE |
| Q007 | Live | ACTIVE_TICK | 30s | 7s | 2 | RAND/AVG | overlap | waypoints | trip | yes | — | — | map | HIGH active | CODE |
| Q008 | Live | ACTIVE_TICK | 30s | 15s | 4 | AVG | overlap | trip avgs | trip | yes | — | — | trips | HIGH active | CODE |
| Q009 | HF | Post-finalize | per trip | 1s | 15 | AVG | trip | derived | transient | yes | abuse | abuse | analyse | MOD | CODE |
| Q010 | HF | Finalize/enrich | per trip | 2m | 1 | AVG | trip | trip meta | trip | context | — | — | trips | LOW | CODE |
| Q011 | HF | — | unused | 3m | 4 | AVG | — | none | — | — | tire | tire | — | — | CODE |
| Q012 | HF | Trip start | per start | 5s | 2 | MIN/MAX | 150s | battery | PG | — | — | — | battery | LOW | CODE |
| Q013 | HF | Post-trip | per trip | 30s | 2 | AVG | trip | fuel fields | trip | — | — | — | trips | LOW | CODE |
| Q014 | HF | Energy | per event | 30s | 2 | AVG | window | energy | PG | — | — | — | energy | LOW | CODE |
| Q015 | Events | Post-trip LTE | per trip | n/a | 8 names | n/a | 6h pages | DrivingEvent | PG | yes | yes | indirect | trips | MOD | CODE |
| Q016 | Events | Misuse | reconcile | n/a | 1 | n/a | trip | misuse | PG | — | — | — | internal | LOW | CODE |
| Q017 | Events | Pre-enrich | per trip | n/a | summary | n/a | n/a | transient | — | yes | yes | — | — | LOW | CODE |
| Q018 | Capability | Preflight 7d | 7d | n/a | summary | n/a | n/a | capability | PG | — | — | — | internal | LOW | CODE |
| Q019 | Capability | Preflight 7d | 7d | n/a | list | n/a | n/a | capability | PG | — | — | — | internal | LOW | CODE |
| Q020 | Capability | Battery | on demand | latest+list | battery set | point | n/a | capability | PG | — | batt | — | battery | LOW | CODE |
| Q021 | Segments | Battery probe | on demand | n/a | recharge | n/a | probe | transient | — | — | batt | — | battery | LOW | CODE |
| Q022 | Segments | Repair | episodic | n/a | 3 req | MIN/MAX | lookback | repair | PG | boundary | — | — | internal | LOW | CODE |
| Q023 | Segments | Energy | scheduled | periodic | refuel | MIN/MAX | window | energy | PG | — | — | — | energy | LOW | CODE |
| Q024 | Segments | Energy | legacy | periodic | recharge | MIN/MAX | window | energy | PG | — | — | — | energy | LOW | CODE |
| Q025 | Segments | Energy | recharge client | windowed | recharge+10 | MIN/MAX | chunked | energy | PG | — | — | — | energy | MOD | CODE |
| Q026 | HF+Seg | Shadow | analysis | per run | mixed | mixed | trip | shadow | transient | research | — | — | internal | LOW | CODE |
| Q027 | HF | Event context | per event batch | 1s | 15 | AVG | ±window | context | PG | yes | yes | — | internal | MOD | CODE |

---

## Appendix B — Signal-Surface Matrix (queried signals)

| DIMO signal | Snapshot | Live Core | Live Route | Live Perf | HF | Native Event | Persisted where | Consumer | Canonical field |
|---|---|---|---|---|---|---|---|---|---|
| speed | ✓ | ✓ | ✓ | — | ✓ | — | VLS/waypoints/HF-derived | Trips/TDI | speedKmh |
| isIgnitionOn | ✓ | ✓ | — | — | ✓ | — | VLS/FSM | Trip FSM | isIgnitionOn |
| powertrainTransmissionTravelledDistance | ✓ | ✓ | — | — | — | — | VLS/trip | Trips | odometerKm |
| powertrainFuelSystemAbsoluteLevel | ✓ | ✓ | — | — | — | — | trip fuel | Energy | liters |
| powertrainTractionBatteryStateOfChargeCurrentEnergy | ✓ | ✓ | — | — | — | — | trip EV | Energy | kWh |
| currentLocationCoordinates | ✓ | — | ✓ | — | — | — | waypoints | Map | lat/lng |
| powertrainCombustionEngineECT | ✓ | — | — | ✓ | ✓ | — | trip/HF | Abuse | engineCoolantTempC |
| powertrainCombustionEngineSpeed | — | — | — | ✓ | ✓ | — | trip avg/HF | TDI | rpm |
| obdThrottlePosition | — | — | — | ✓ | ✓ | — | trip avg/HF | TDI | throttlePosition |
| obdEngineLoad | ✓ | — | — | ✓ | ✓ | — | VLS/trip/HF | TDI/launch | engineLoad |
| obdRunTime | — | — | — | — | ✓ | — | HF-derived | Abuse | engineRuntimeSec |
| powertrainCombustionEngineTorque | — | — | — | — | ✓ | — | HF-derived | Abuse | engineTorqueNm |
| powertrainCombustionEngineTorquePercent | — | — | — | — | ✓ | — | HF-derived | Abuse | engineTorquePct |
| exteriorAirTemperature | — | — | — | — | ✓ | ✓(2m) | trip meta | Context | exteriorAirTempC |
| currentLocationAltitude | — | — | — | — | ✓ | — | HF-derived | Context | altitudeM |
| powertrainTransmissionCurrentGear | — | — | — | — | ✓ | — | HF-derived | Abuse | currentGear |
| powertrainTractionBatteryCurrentPower | ✓ | — | — | — | ✓ | — | VLS/HF | EV regen | tractionBatteryPowerKw |
| powertrainTractionBatteryStateOfChargeCurrent | ✓ | — | — | — | ✓ | — | VLS/HF | Battery | socPct |
| powertrainTractionBatteryTemperatureAverage | ✓ | — | — | — | ✓ | — | VLS/HF | Battery | tractionBatteryTemperatureC |
| chassisAxleRow* TirePressure (×4) | ✓ | — | — | — | — | — | VLS | Tire health | tire kPa |
| lowVoltageBatteryCurrentVoltage | ✓ | — | — | — | — | — | VLS/battery | Battery | lv voltage |
| powertrainFuelSystemRelativeLevel | ✓ | — | — | — | — | — | VLS/trip | Fuel | fuel % |
| powertrainTractionBattery* (charging fields) | ✓ | — | — | — | — | — | VLS | Energy UI | various |
| powertrainCombustionEngine* (oil/DEF) | ✓ | — | — | — | — | — | VLS | Service | various |
| obdDTCList | Q005 | — | — | — | — | — | DTC tables | Health | codes |
| behavior.* / safety.collision | — | — | — | — | — | ✓ | DrivingEvent | TDI/brakes | mapped enum |

**Matrix rows:** 26 signal groups (multi-wheel tires counted as one row family).

---

## Appendix C — Information-Loss Matrix

| Stage | Data available before | Data retained after | Lost information | Replay impact |
|---|---|---|---|---|
| DIMO response | Full bucket rows + timestamps | parsed arrays | HTTP envelope, GraphQL errors detail | HIGH |
| parser | All numeric fields per bucket | typed points | non-numeric, malformed | MOD |
| preprocess | Raw HF sequence | clean points | spikes, gaps, OOO | HIGH |
| detector | clean series | abuse/event candidates | non-triggering samples | HIGH |
| TripBehaviorEvent | candidate episodes | PG event rows | sub-threshold motion | MOD |
| DrivingEvent | native + mapped | PG rows | unmapped metadata facets | MOD |
| VehicleTrip counters | events | aggregate counts | per-event detail | MOD |
| TripDrivingImpact | features | score inputs | intermediate kinematics | HIGH |
| ClickHouse mirror | HF readings + abuse | 6-signal points | 9+ HF signals, raw buckets | HIGH |

---

## Appendix D — Phase 2A Exit Criteria Checklist

| Criterion | Status |
|---|---|
| Every productive DIMO query identified | ✓ 27 |
| Exact signal selection documented | ✓ |
| Trigger/cadence/window known | ✓ (OBSERVED cadence flagged UNKNOWN) |
| Persistence/retention known | ✓ |
| Surfaces separated | ✓ |
| availableSignals usage clarified | ✓ PARTIALLY_CAPABILITY_AWARE |
| Query overlaps documented | ✓ 12 cases |
| Theoretical request volume calculated | ✓ §6, §8, §22 |
| Runtime backlog for unknowns | ✓ 20 probes |

**Phase 2A: DONE**
