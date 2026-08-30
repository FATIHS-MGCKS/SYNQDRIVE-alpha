# DIMO Phase 2A — Current Query Surface & Acquisition Reality Audit
**Date:** 2026-08-31  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Scope:** Forensic code/schema audit of every DIMO GraphQL query definition and productive invocation context in SynqDrive. No production changes.  
**Authority:** Phase 1 audit remains authority for score/consumer graph unless this audit disproves a specific assumption (none disproven).

---

## 1. Executive Summary

Phase 2A reconstructs SynqDrive's **complete current DIMO query/acquisition surface** from code. The audit maintains **27 registry entries** (`DIMO-Q001`–`DIMO-Q027`) for cross-reference, but distinguishes **22 unique GraphQL query definitions** from **8 invocation contexts that reuse existing definitions** (Q026–Q027) and **1 dead definition** (Q011).

**Registry classification (see §3.0):**
| Count type | N |
|---|---:|
| A. Registry entries | 27 |
| B. Unique GraphQL query definitions | 22 |
| C. Production-active definitions | 16 |
| D. On-demand / diagnostic definitions | 6 |
| E. Shadow-only invocation contexts | 1 (Q026) |
| F. Legacy reachable (not prod recharge path) | 1 (Q024) |
| G. Defined but unused | 1 (Q011) |
| H. Reused invocation contexts | 2 (Q026, Q027) |

**Capability architecture verdict: `PARTIALLY_CAPABILITY_AWARE`.** SynqDrive runs periodic `availableSignals` + `dataSummary` preflight (7-day gate) and battery-specific capability probes, persisting capability rows — but **all driving acquisition queries use static, fleet-wide field lists**. Preflight results do not gate or reshape snapshot/live/HF/event query selection.

**Scaling headline (theoretical, from current architecture):**
| Surface | Per vehicle (worst-case steady state) | 100 vehicles | 1,000 vehicles |
|---|---:|---:|---:|
| Snapshot (`signalsLatest`) | 2,880 calls/day (ACTIVE_DRIVING tier, 30s) | 288,000/day | 2,880,000/day |
| Active trip (3 parallel queries / 30s tick) | 360 calls/hour active | 36,000/hour (100 concurrent active) | 360,000/hour |
| Post-trip (formula-driven) | see §22.1 — not a flat 1× HF/trip | per completed trip | per completed trip |

**Critical findings (top 5):**
1. **REQUESTED_BUCKET ≠ OBSERVED_PROVIDER_CADENCE** for HF/live buckets — code requests `1s`/`7s`/`15s`/`20s` buckets; effective provider cadence is **UNKNOWN_REQUIRES_RUNTIME_PROBE** (July audit is HISTORICAL_EVIDENCE only).
2. **No per-sample SynqDrive receive timestamp** on HF/live bucket rows — only provider bucket `timestamp` and occasional `providerFetchedAt` on snapshot upsert.
3. **Raw HF time series not persisted in Postgres**; ClickHouse HF mirror is optional (`HF_MIRROR_ENABLED=false` default), subset of 6 signals + derived events — **PARTIAL_REPLAY_ONLY**.
4. **Query overlap is extensive** (speed/RPM/TPS/engine load/temperature across snapshot, live, HF) — mostly **NECESSARY_DIFFERENT_LATENCY / NECESSARY_DIFFERENT_RETENTION**, some **POTENTIAL_QUERY_DUPLICATION** on post-trip route+perf re-fetch.
5. **Four 2026-08-30 vehicle inventory files remain absent on `main`** — Phase 2B blocked on ingestion; vehicle availability columns stay `NO — PHASE_2B`.

**Phase 2A status: DONE** (exit criteria Appendix D satisfied from code/schema evidence).

---

## 2. Scope & Evidence

### 2.1 In scope
- All DIMO GraphQL query definitions and invocation contexts in `backend/src/modules/dimo/**` and inline queries in callers (including dead, shadow, legacy, and diagnostic paths).
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
`CONFIRMED_FROM_CODE` · `HISTORICAL_EVIDENCE` · `HISTORICAL_RUNTIME_EVIDENCE` · `INFERENCE` · `UNKNOWN_REQUIRES_RUNTIME_PROBE`

**Evidence discipline (Phase 2A review):** A SynqDrive query builder confirms **what SynqDrive requests/expects** (`CONFIRMED_FROM_CODE`). It does **not** prove current global DIMO provider schema support. Where no current DIMO introspection artifact or official docs were verified in this audit, provider-wide schema claims use **`CURRENT_SYNQDRIVE_REFERENCED_DIMO_SURFACE`** (code-referenced roots/fields), not `CONFIRMED_FROM_CURRENT_DIMO_SCHEMA`. Production paths that successfully call DIMO in deployed code may additionally be noted as **`HISTORICAL_RUNTIME_EVIDENCE`** (inferred from working integrations), without equating that to vehicle-level capability.

---

## 3. Query Registry

Stable IDs for Phase 2B/2C and future Flight Recorder cross-reference.

### 3.0 Registry classification summary

| ID | Name | Classification | Reuses |
|---|---|---|---|
| Q001 | LatestVehicleSnapshot | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q002 | LastSeenLocation | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ON_DEMAND** | — |
| Q003 | VehicleSummary | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ON_DEMAND** | — |
| Q004 | VehicleVin | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ON_DEMAND** | — |
| Q005 | GetLatestDTCs | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** (scheduled ~3h) | — |
| Q006 | TripDetectionCore | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q007 | RouteEnrichment | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q008 | Performance | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q009 | HighFrequency | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q010 | EnvironmentTemperature | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q011 | TirePressureHistory | **UNIQUE_QUERY_DEFINITION** + **DEFINED_BUT_UNUSED** | — |
| Q012 | BatteryCrankWindow | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** (ICE trip-start) | — |
| Q013 | TripFuelSummary | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q014 | RefuelFuelLevelSamples | **INVOCATION_CONTEXT** (same GraphQL shape as Q013) | Q013 |
| Q015 | DrivingEvents | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** (LTE_R1) | — |
| Q016 | SafetyEvents | **INVOCATION_CONTEXT** (same `buildDimoEventsQuery`, different filter) | Q015 builder |
| Q017 | EventDataSummary | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** (LTE_R1 pre-check) | — |
| Q018 | DataSummary | **UNIQUE_QUERY_DEFINITION** + **CAPABILITY_DIAGNOSTIC** | — |
| Q019 | AvailableSignals | **UNIQUE_QUERY_DEFINITION** + **CAPABILITY_DIAGNOSTIC** | — |
| Q020 | BatteryCapabilityPreflight | **UNIQUE_QUERY_DEFINITION** + **CAPABILITY_DIAGNOSTIC** | — |
| Q021 | RechargeSegmentsProbe | **UNIQUE_QUERY_DEFINITION** + **CAPABILITY_DIAGNOSTIC** | — |
| Q022 | TripSegments | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ON_DEMAND** (repair/validation/shadow) | — |
| Q023 | EnergyEventSegments refuel | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q024 | EnergyEventSegments recharge | **LEGACY_REACHABLE** — builder exists; **production recharge uses Q025** (`fetchEnergyEventMechanism` intercepts `recharge`) | Q023 builder |
| Q025 | DimoRechargeSegments | **UNIQUE_QUERY_DEFINITION** + **PRODUCTION_ACTIVE** | — |
| Q026 | ShadowDetector context | **INVOCATION_CONTEXT_REUSING_QUERY** + **SHADOW_ONLY** | Q009 + Q022 |
| Q027 | EventContext HF window | **INVOCATION_CONTEXT_REUSING_QUERY** + **PRODUCTION_ACTIVE** (conditional) | Q009 |

**Terminology:** “Registry entry” ≠ “unique GraphQL operation”. Q014 shares Q013's inline query. Q016 shares Q015's builder. Q024 shares Q023's builder but is bypassed for production recharge. Q026–Q027 add no new GraphQL definitions.

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
| **Signals** | **32 telemetry signal fields** + **`lastSeen` metadata** (see §4.1) |
| **Timeout** | Client 10s default; postGraphQL 15s override **CONFIRMED_FROM_CODE** |
| **Retry** | BullMQ job attempts/backoff on worker failure |
| **Cache** | None at HTTP layer; VLS monotonic merge suppresses stale upserts |
| **Persistence** | `VehicleLatestState` (latest overwrite) + optional `telemetry_snapshots` CH |
| **Retention** | VLS: `LATEST_STATE_UNTIL_OVERWRITTEN`; CH: `HISTORICAL_TTL_180D` when configured |
| **Classification** | UNIQUE_QUERY_DEFINITION · PRODUCTION_ACTIVE |

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
| **Classification** | UNIQUE_QUERY_DEFINITION · PRODUCTION_ON_DEMAND |
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
| **Caller(s)** | **None in production** — `fetchTirePressureHistory` exists, no external caller **CONFIRMED_FROM_CODE** |
| **Classification** | UNIQUE_QUERY_DEFINITION · **DEFINED_BUT_UNUSED** |
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
| **Production path** | **Not used for recharge** — `fetchEnergyEventMechanism` routes `recharge` → `DimoRechargeSegmentsClient` (Q025) **CONFIRMED_FROM_CODE** |
| **Classification** | LEGACY_REACHABLE (builder + private method remain; prod recharge bypasses) |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q025 — DimoRechargeSegments (canonical recharge client)
| Field | Value |
|---|---|
| **Builder** | `buildDimoRechargeSegmentsQuery` (`recharge-segments/` module) |
| **Caller(s)** | `DimoRechargeSegmentsClient` ← energy events recharge path |
| **Features** | Optional `signalFilter: { source: { eq } }` with fallback retry |
| **Window chunking** | `splitDimoRechargeQueryWindows` |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q026 — ShadowDetector invocation context
| Field | Value |
|---|---|
| **Classification** | **INVOCATION_CONTEXT_REUSING_QUERY** · **SHADOW_ONLY** |
| **Caller(s)** | `ShadowDetectorEnrichmentService` |
| **Reuses** | Q009 (`fetchHighFrequency`) + Q022 (`fetchTripSegmentsForMechanism`) |
| **Trigger** | Shadow misuse-case analysis pipeline (non-scoring research path) |
| **Evidence** | CONFIRMED_FROM_CODE |

### DIMO-Q027 — EventContext HF invocation context
| Field | Value |
|---|---|
| **Classification** | **INVOCATION_CONTEXT_REUSING_QUERY** · **PRODUCTION_ACTIVE** (conditional) |
| **Caller(s)** | `EventContextEnrichmentService` via per-event jobs (`DrivingEventContextJobService`) |
| **Reuses** | Q009 — one HF fetch per eligible native event context window (not full trip) |
| **Conditions** | ICE-capable LTE_R1/UNKNOWN ICE via `shouldRunIceEventContextEnrichment`; not SMART5/EV |
| **Evidence** | CONFIRMED_FROM_CODE |

**Registry totals:** 27 entries · 22 unique GraphQL definitions · 16 production-active definitions · 6 on-demand/diagnostic · 1 dead (Q011) · 1 legacy reachable (Q024) · 2 reused invocation contexts (Q026–Q027)

---

## 4. Snapshot / signalsLatest

### 4.1 Production snapshot query (DIMO-Q001)
**GraphQL root:** `signalsLatest(tokenId)` — **CONFIRMED_FROM_CODE**

**Exact field counts** (`latest-vehicle-snapshot.query.ts`):
| Count type | N | Notes |
|---|---:|---|
| `GRAPHQL_SELECTED_FIELDS` | **33** | `lastSeen` + 32 `{ timestamp value }` selections |
| `TELEMETRY_SIGNAL_FIELDS` | **32** | DIMO signal fields under `signalsLatest` |
| `METADATA_FIELDS` | **1** | `lastSeen` (collection freshness, not a telemetry signal) |

| # | DIMO field | Type | Normalized VLS field |
|---:|---|---|---|
| — | `lastSeen` | metadata | `sourceTimestamp` / freshness |
| 1 | `currentLocationCoordinates` | telemetry | `latitude`, `longitude` |
| 2 | `speed` | telemetry | `speedKmh` |
| 3 | `powertrainTransmissionTravelledDistance` | telemetry | `odometerKm` |
| 4 | `powertrainFuelSystemRelativeLevel` | telemetry | `fuelLevelPercent` |
| 5 | `powertrainFuelSystemAbsoluteLevel` | telemetry | fuel meta |
| 6 | `powertrainTractionBatteryStateOfChargeCurrent` | telemetry | SOC |
| 7 | `powertrainTractionBatteryStateOfChargeCurrentEnergy` | telemetry | energy kWh |
| 8 | `powertrainTractionBatteryStateOfHealth` | telemetry | SOH |
| 9 | `powertrainTractionBatteryCurrentPower` | telemetry | HV power |
| 10 | `powertrainTractionBatteryCurrentVoltage` | telemetry | HV voltage |
| 11 | `powertrainTractionBatteryTemperatureAverage` | telemetry | batt temp |
| 12 | `powertrainTractionBatteryChargingIsCharging` | telemetry | charging flag |
| 13 | `powertrainTractionBatteryChargingIsChargingCableConnected` | telemetry | cable flag |
| 14 | `powertrainTractionBatteryChargingPower` | telemetry | charge power |
| 15 | `powertrainTractionBatteryChargingChargeLimit` | telemetry | charge limit |
| 16 | `powertrainTractionBatteryChargingAddedEnergy` | telemetry | added energy |
| 17 | `powertrainTractionBatteryRange` | telemetry | range |
| 18 | `powertrainTractionBatteryGrossCapacity` | telemetry | capacity |
| 19 | `powertrainCombustionEngineEngineOilRelativeLevel` | telemetry | oil level |
| 20 | `powertrainCombustionEngineDieselExhaustFluidLevel` | telemetry | DEF |
| 21 | `powertrainCombustionEngineECT` | telemetry | coolant snapshot |
| 22 | `chassisAxleRow1WheelLeftTirePressure` | telemetry | tire FL |
| 23 | `chassisAxleRow1WheelRightTirePressure` | telemetry | tire FR |
| 24 | `chassisAxleRow2WheelLeftTirePressure` | telemetry | tire RL |
| 25 | `chassisAxleRow2WheelRightTirePressure` | telemetry | tire RR |
| 26 | `chassisTireSystemIsWarningOn` | telemetry | tire warning |
| 27 | `isIgnitionOn` | telemetry | `isIgnitionOn` |
| 28 | `obdIsPluggedIn` | telemetry | connectivity |
| 29 | `connectivityCellularIsJammingDetected` | telemetry | connectivity |
| 30 | `obdEngineLoad` | telemetry | `engineLoad` |
| 31 | `lowVoltageBatteryCurrentVoltage` | telemetry | LV voltage |
| 32 | `powertrainType` | telemetry | powertrain class |

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

**Postgres `VehicleLatestState` semantics:** `POINT_IN_TIME_LATEST_STATE_OVERWRITE` — one current row per vehicle, merged/upserted on each successful snapshot; **not** append-only historical telemetry **CONFIRMED_FROM_CODE**. Stale snapshots may skip field updates via monotonic `sourceTimestamp` guard while still updating `providerFetchedAt`.

**ClickHouse `telemetry_snapshots`:** append-style historical mirror when CH configured; TTL **180d** (`HISTORICAL_TTL_180D`) **CONFIRMED_FROM_CODE**.

| DIMO signal | Query | Normalized | VLS column / JSON | CH column | TDI consumer class | Other consumers |
|---|---|---|---|---|---|---|
| speed | Q001 | km/h | `speed_kmh` | `speed_kmh` | **NO_CURRENT_TDI_CONSUMER** (snapshot) | UI_OPERATIONAL_INPUT, TRIP_FSM_INPUT (indirect via trip start) |
| odometer | Q001 | km | `odometer_km` | — | NO_CURRENT_TDI_CONSUMER | UI_OPERATIONAL_INPUT, trips |
| ignition | Q001 | bool/null | `is_ignition_on` | state_changes | NO_CURRENT_TDI_CONSUMER | **TRIP_FSM_INPUT** |
| engine load | Q001 | % | `engine_load` | `engine_load` | **NO_CURRENT_TDI_CONSUMER** (HF/live used for stress; not snapshot) | UI_OPERATIONAL_INPUT, HEALTH_INPUT (operational display) |
| LV voltage | Q001 | V | battery JSON | — | NO_CURRENT_TDI_CONSUMER | **HEALTH_INPUT** (battery) |
| tire pressures | Q001 | kPa normalized | tire fields | — | NO_CURRENT_TDI_CONSUMER | **HEALTH_INPUT** (tire) |
| EV/HV fields | Q001 | various | VLS + mapper | partial | NO_CURRENT_TDI_CONSUMER | UI_OPERATIONAL_INPUT, HEALTH_INPUT |

Phase 1 authority preserved: composite TDI stress inputs are **post-trip**; live perf (Q008) provides **INDIRECT_TRIP_INPUT** to engine/transmission load only. Snapshot speed/engineLoad must **not** be documented as direct composite score inputs.

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

**Rate classification:** REQUEST_VOLUME **HIGH** at fleet scale; QUERY_COMPLEXITY **MODERATE** (single signalsLatest, 32 telemetry fields); RATE_LIMIT_RISK **MODERATE** (activity tier mitigates vs legacy O(N) every 30s).

---

## 7. Active Trip Live Polling

### 7.1 ACTIVE_TICK pipeline
**Trigger:** self-requeueing BullMQ job, default delay **30s** (`TRACKING_INTERVAL_MS`) **CONFIRMED_FROM_CODE**

**THEORETICAL_MAX (CONFIRMED):** Every ACTIVE_TICK in `ACTIVE_TRIP` / `IDLE_WITHIN_TRIP` executes **`Promise.all([Q006, Q007, Q008])`** with no conditional skip in the hot path **CONFIRMED_FROM_CODE** (`trip-detection-orchestration.service.ts`).

| Model | DIMO calls per ACTIVE_TICK | Notes |
|---|---:|---|
| THEORETICAL_MAX | **3** | core + route + performance always parallel |
| NORMAL_PATH | **3** | same — no lighter branch when trip active |
| CONDITIONAL_PATH | +0–N | Separate branches (e.g. POSSIBLE_END, segment repair) add **additional** queries outside the 3-call tick |

| Bucket query | REQUESTED_BUCKET | CALL_CADENCE | OBSERVED_PROVIDER_CADENCE |
|---|---|---|---|
| Core | 20s | 30s tick | UNKNOWN_REQUIRES_RUNTIME_PROBE |
| Route | 7s | 30s tick | UNKNOWN_REQUIRES_RUNTIME_PROBE |
| Performance | 15s | 30s tick | UNKNOWN_REQUIRES_RUNTIME_PROBE |

**15s clarification:** `15s` is **REQUESTED_BUCKET** on Q008 only. **CALL_CADENCE** is ACTIVE_TICK ~30s. Not provider sample frequency.

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

### 8.1 THEORETICAL_MAX per concurrent active vehicle

Assumptions: `TRACKING_INTERVAL_MS=30s` → 2 ACTIVE_TICK jobs/min; 3 DIMO calls per tick; vehicle also on ACTIVE_DRIVING snapshot tier (30s → 2 snapshot calls/min).

| Concurrent active vehicles | ACTIVE_TICK DIMO calls/hour | + Snapshot Q001/hour (ACTIVE_DRIVING) | Combined DIMO calls/hour |
|---:|---:|---:|---:|
| 1 | 360 | 120 | **480** |
| 10 | 3,600 | 1,200 | **4,800** |
| 100 | 36,000 | 12,000 | **48,000** |
| 1,000 | 360,000 | 120,000 | **480,000** |

Per-minute equivalents (1 active vehicle): **6 DIMO calls/min** live (3 queries × 2 ticks) + **2 snapshot calls/min** = **8 combined**.

**Constant:** `ACTIVE_TICK_DIMO_CALLS_PER_JOB = 3` **CONFIRMED_FROM_CODE** (`p12-final5-workload-model.ts`).

Post-trip route re-fetch (Q007+Q008+Q010 via `TripsService.enrichTrip`) is **outside** ACTIVE_TICK and documented in §22.1.

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

### 12.1 REQUESTED_EVENT_NAMES (query selection)

**Q015 `buildDrivingEventsQuery`** — server-side `name { in: [...] }` filter **CONFIRMED_FROM_CODE**:

| DIMO event name | In Q015 filter | Also Q016 | Mapped internal type |
|---|---|---|---|
| `behavior.harshBraking` | yes | no | HARSH_BRAKING |
| `behavior.extremeBraking` | yes | no | EXTREME_BRAKING |
| `behavior.harshAcceleration` | yes | no | HARSH_ACCELERATION |
| `behavior.extremeAcceleration` | yes | no | HARSH_ACCELERATION (EXTREME class) |
| `behavior.harshCornering` | yes | no | HARSH_CORNERING |
| `behavior.extremeEmergency` | yes | no | EXTREME_BRAKING |
| `behavior.extremeEmergencyBraking` | yes | no | EXTREME_BRAKING |
| `safety.collision` | yes | yes (Q016 only filter) | SAFETY_COLLISION |

**Q016 `buildSafetyEventsQuery`:** requests **`safety.collision` only** — used by `MisuseCaseReconcileService` for misuse aggregation (not persisted as `DrivingEvent` rows) **CONFIRMED_FROM_CODE**.

**Q015 collision overlap:** `safety.collision` may be ingested via LTE_R1 path (Q015) **and** fetched again via Q016 for misuse evaluation — **POTENTIAL_QUERY_DUPLICATION** (different consumers).

### 12.2 MAPPER_FALLBACKS (not query-selected)

| Provider event name | Handling | Persisted? |
|---|---|---|
| Any unlisted `events(...)` name returned despite filter | `UNMAPPED_PROVIDER_EVENT` via `mapDimoNativeDrivingEvent` | yes (preserved, not discarded) |

**Not a REQUESTED_EVENT_NAME** — mapper fallback only. Do not list as DIMO query filter entry.

### 12.3 Native event persistence / consumers

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

**Verdict:** `PARTIALLY_CAPABILITY_AWARE` — see §21.

---

## 15. CURRENT_SYNQDRIVE_REFERENCED_DIMO_SURFACE

SynqDrive code references these DIMO Telemetry API query families in production or diagnostic paths (**CONFIRMED_FROM_CODE**). This documents **what SynqDrive is built to call**, not global provider schema guarantees.

| Family | Root field | SynqDrive uses? | Evidence |
|---|---|---|---|
| Latest point-in-time | `signalsLatest` | Yes | CONFIRMED_FROM_CODE |
| Historical buckets | `signals(from,to,interval)` | Yes | CONFIRMED_FROM_CODE |
| Native events | `events(from,to,filter)` | Yes | CONFIRMED_FROM_CODE |
| Segments | `segments(mechanism,config,signalRequests)` | Yes | CONFIRMED_FROM_CODE |
| Capability list | `availableSignals` | Yes (preflight) | CONFIRMED_FROM_CODE |
| Inventory summary | `dataSummary` | Yes | CONFIRMED_FROM_CODE |
| VIN | `vinVCLatest` | Yes | CONFIRMED_FROM_CODE |

**Signal reference catalog (abbreviated — not provider capability matrix):**

| signal/schema field | SELECTED_IN_Q001 | SELECTED_IN_HISTORICAL | REQUESTED_AS_EVENT | CURRENT_DIMO_LATEST_SCHEMA_SUPPORT | CURRENT_DIMO_HISTORICAL_SCHEMA_SUPPORT |
|---|---|---|---|---|---|
| speed | yes | yes (multiple intervals) | — | UNKNOWN | UNKNOWN |
| powertrainCombustionEngineSpeed | no | yes (HF/live/crank) | — | UNKNOWN | UNKNOWN |
| obdThrottlePosition | no | yes (HF/live) | — | UNKNOWN | UNKNOWN |
| behavior.harshBraking | — | — | yes (Q015) | UNKNOWN | UNKNOWN |
| yawRate (catalog candidate) | no | no | no | UNKNOWN | UNKNOWN |

**Legend:** “SELECTED_IN_Q001=no” means **not chosen in snapshot query**, not “not queryable on provider”. Provider schema support columns remain **UNKNOWN** until Phase 2B runtime/schema artifacts.

---

## 16. Signal Canonicalization

| DIMO field | Canonical | Unit conversion | Storage | Consumer | Redundancy role |
|---|---|---|---|---|---|
| speed | speedKmh | none | VLS, waypoints, HF | **INDIRECT_TRIP_INPUT** / UI | PARALLEL across surfaces |
| powertrainCombustionEngineSpeed | rpm | none | trip avgs, HF | **INDIRECT_TRIP_INPUT** (live avg → engine load) | CURRENT_PRIMARY (HF/live) |
| obdEngineLoad | engineLoad | none | VLS snapshot, HF, live avg | **INDIRECT_TRIP_INPUT** via live/HF; snapshot → UI only | PARALLEL snapshot+HF |
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

See §21 verdict.

**Missing for Phase 2F capability-first:**
- Query profile manifest driving field selection
- Runtime feedback loop from `availableSignals` into builders
- Per-signal cadence negotiation
- Detector eligibility from persisted capability rows

---

## 22. Request / Storage Scalability

### 22.1 Post-trip request model (formula-driven)

Let `P = ceil(tripDurationMs / DIMO_DRIVING_EVENTS_PAGE_MS)` where `DIMO_DRIVING_EVENTS_PAGE_MS = 6h` **CONFIRMED_FROM_CODE**.

Let `E =` count of native driving events eligible for ICE event-context jobs (LTE_R1 ICE-capable, after `shouldRunIceEventContextEnrichment`).

**BASE_POST_TRIP_CALLS** (after behavior enrichment completes, `TripEnrichmentOrchestratorService` → `runRouteSafetyEnrichment` → `TripsService.enrichTrip`):

| Query | Count per completed trip |
|---|---:|
| Q007 RouteEnrichment | 1 |
| Q010 EnvironmentTemperature | 1 |
| Q008 Performance | 1 |
| **Subtotal route/safety base** | **3** |

**Profile-specific behavior enrichment** (`TripBehaviorEnrichmentService.enrichTrip`):

| Profile | Additional queries | Formula |
|---|---|---|
| **SMART5 / HF-driving-events** | Q009 HF | `+1 × Q009` |
| **SMART5 ICE fuel** | Q013 fuel | `+1 × Q013` if not EV |
| **LTE_R1** | Q017 + Q015 pages + Q009 | `+1 × Q017 + P × Q015 + 2 × Q009` |
| **LTE_R1 ICE fuel** | Q013 | `+1 × Q013` if not EV |

**LTE_R1 double HF note (CONFIRMED_FROM_CODE):** `LteR1BehaviorEnrichmentService.enrichTrip` calls Q009 once (`buildHfContextMap`), then `enrichTripLteR1` calls Q009 again for abuse pipeline — **two full-trip HF fetches per LTE_R1 trip**.

**CONDITIONAL_POST_TRIP_CALLS:**

| Condition | Query | Formula |
|---|---|---|
| Misuse reconcile runs | Q016 | `+1 × Q016` |
| ICE event context jobs | Q027 → Q009 | `+E × Q009` (narrow windows, not full trip) |
| Trip-start temperature window | Q010 | `+1 × Q010` (±5 min around start; separate from route enrich) |
| ICE trip-start battery crank | Q012 | `+1 × Q012` per qualifying start |

**SHADOW_ONLY_CALLS:** Q026 → `+1 × Q009 + 1 × Q022` when shadow orchestrator runs (research path).

**Example formulas (not guaranteed typical):**

- **SMART5 ICE 1h trip:** `3 (route base) + 1 (Q009) + 1 (Q013) = 5` DIMO calls.
- **LTE_R1 ICE 1h trip:** `3 + 1 (Q017) + 1 (Q015 page) + 2 (Q009) + 1 (Q013) = 8` DIMO calls, **before** `E` context windows.
- **LTE_R1 7h trip:** `P = 2` → add `+2 × Q015` instead of `+1`.

Do **not** treat “6–8 queries/trip” as canonical — use formulas above.

### 22.2 Ongoing / episodic surfaces

| Surface | Calls/trip or cadence | Storage | Volume risk |
|---|---|---|---|
| Snapshot Q001 | 2/min max (ACTIVE_DRIVING tier) | VLS overwrite + CH TTL | HIGH fleet |
| Active live Q006–Q008 | 6 DIMO calls/min active (3 queries × 2 ticks/min) | waypoints + avgs | HIGH concurrent |
| Post-trip (above) | formula-driven | derived only | MODERATE–HIGH (LTE_R1 double HF) |
| Native events Q015 | `P` pages/trip (LTE_R1) | DrivingEvent | MODERATE |
| Segments repair Q022 | episodic | repair metadata | LOW |
| Energy Q023/Q025 | scheduled windows | energy events | LOW |

### 22.3 Unique signal inventory (exact, from query builders)

| Count type | N |
|---|---:|
| **UNIQUE_SIGNAL_FIELD_NAMES** | **41** |
| **SIGNAL_FAMILIES** (grouped, e.g. 4 tire wheels → 1 family) | **34** |
| **REQUESTED_EVENT_NAMES** (Q015 filter) | **8** |
| **REQUESTED_EVENT_NAMES** (Q016 only) | **1** (`safety.collision`, subset of Q015) |
| **SEGMENT_MECHANISMS** referenced | **6** |
| **METADATA_FIELDS** (Q001 `lastSeen`; not counted in signal fields) | **1** |

---

## 23. Findings

| ID | Type | Severity | Summary |
|---|---|---|---|
| F2A-01 | QUERY_SURFACE_FACT | — | 27 registry entries; 22 unique GraphQL definitions; 16 production-active |
| F2A-10 | QUERY_REDUNDANCY | P2 | LTE_R1 runs **two full-trip Q009 HF fetches** per completed trip |
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

Recorder should align to **27 registry IDs / 22 unique definitions**, prioritizing HF (Q009), live triple (Q006–008), and native events (Q015) for kinematic replay gap identified in Phase 1 F-14.

---

## Appendix A — Master Query Matrix

| Query ID | Classification | Surface | Trigger | Call cadence | Requested interval | Signals (count) | Aggregation | Window | Persistence | Retention | TDI consumer class | Brake | Tire | API/UI | Rate-volume | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Q001 | PROD_ACTIVE | Snapshot | Tier scheduler | 30s–30m | latest | 32 tel + 1 meta | point | n/a | VLS+CH | VLS: `LATEST_STATE_UNTIL_OVERWRITTEN`; CH: `HISTORICAL_TTL_180D` | NO_CURRENT_TDI_CONSUMER (snapshot) | HEALTH_INPUT | HEALTH_INPUT | yes | HIGH | CODE |
| Q002 | ON_DEMAND | Snapshot | On-demand | ad hoc | latest | 3 | point | n/a | none | TRANSIENT | — | — | UI_OPERATIONAL | yes | LOW | CODE |
| Q003 | ON_DEMAND | Snapshot | Sync | ad hoc | latest | 6 | point | n/a | sync | SYNC_METADATA | — | — | — | admin | LOW | CODE |
| Q004 | ON_DEMAND | Identity | Sync | ad hoc | n/a | vin | n/a | n/a | vehicle | VEHICLE_RECORD | — | — | — | admin | LOW | CODE |
| Q005 | PROD_ACTIVE | Snapshot | DTC 3h | 3h | latest | 1 | point | n/a | DTC | LATEST_STATE_UNTIL_OVERWRITTEN | NO_CURRENT_TDI_CONSUMER | — | — | health | LOW | CODE |
| Q006 | PROD_ACTIVE | Live | ACTIVE_TICK | 30s | 20s | 5 | mixed | overlap | FSM | TRIP_DURATION | TRIP_FSM_INPUT | — | — | trips | HIGH active | CODE |
| Q007 | PROD_ACTIVE | Live | ACTIVE_TICK | 30s | 7s | 2 | RAND/AVG | overlap | waypoints | TRIP_DURATION | INDIRECT_TRIP_INPUT | — | — | map | HIGH active | CODE |
| Q008 | PROD_ACTIVE | Live | ACTIVE_TICK | 30s | 15s | 4 | AVG | overlap | trip avgs | TRIP_DURATION | INDIRECT_TRIP_INPUT | — | — | trips | HIGH active | CODE |
| Q009 | PROD_ACTIVE | HF | Post-finalize | per trip/window | 1s | 15 | AVG | trip/±window | derived | TRANSIENT (derived PG) | DIRECT_COMPOSITE_INPUT | abuse | abuse | analyse | MOD | CODE |
| Q010 | PROD_ACTIVE | Historical | Finalize/enrich | per trip | 2m | 1 | AVG | trip | trip meta | TRIP_DURATION | INDIRECT_TRIP_INPUT | — | — | trips | LOW | CODE |
| Q011 | DEAD | Historical | — | unused | 3m | 4 | AVG | — | none | — | — | — | tire (unused) | — | — | CODE |
| Q012 | PROD_ACTIVE | Historical | Trip start | per start | 5s | 2 | MIN/MAX | ~150s | battery | LATEST_STATE_UNTIL_OVERWRITTEN | NO_CURRENT_TDI_CONSUMER | — | — | battery | LOW | CODE |
| Q013 | PROD_ACTIVE | Historical | Post-trip | per trip | 30s | 2 | AVG | trip | fuel fields | TRIP_DURATION | NO_CURRENT_TDI_CONSUMER | — | — | trips | LOW | CODE |
| Q014 | ON_DEMAND | Historical | Energy | per event | 30s | 2 | AVG | window | energy | LATEST_STATE_UNTIL_OVERWRITTEN | NO_CURRENT_TDI_CONSUMER | — | — | energy | LOW | CODE |
| Q015 | PROD_ACTIVE | Events | Post-trip LTE | per trip | n/a | 8 event names | n/a | 6h pages | DrivingEvent | LATEST_STATE_UNTIL_OVERWRITTEN | DIRECT_COMPOSITE_INPUT | yes | indirect | trips | MOD | CODE |
| Q016 | PROD_ACTIVE | Events | Misuse | reconcile | n/a | 1 event name | n/a | trip | misuse | LATEST_STATE_UNTIL_OVERWRITTEN | NO_CURRENT_TDI_CONSUMER | — | — | internal | LOW | CODE |
| Q017 | PROD_ACTIVE | Capability | Pre-enrich | per trip | n/a | summary | n/a | n/a | transient | TRANSIENT | INDIRECT_TRIP_INPUT | yes | — | — | LOW | CODE |
| Q018 | DIAGNOSTIC | Capability | Preflight 7d | 7d | n/a | summary | n/a | n/a | capability | LATEST_STATE_UNTIL_OVERWRITTEN | — | — | — | internal | LOW | CODE |
| Q019 | DIAGNOSTIC | Capability | Preflight 7d | 7d | n/a | list | n/a | n/a | capability | LATEST_STATE_UNTIL_OVERWRITTEN | — | — | — | internal | LOW | CODE |
| Q020 | DIAGNOSTIC | Capability | Battery | on demand | latest+list | battery set | point | n/a | capability | LATEST_STATE_UNTIL_OVERWRITTEN | — | HEALTH_INPUT | — | battery | LOW | CODE |
| Q021 | DIAGNOSTIC | Segments | Battery probe | on demand | n/a | recharge | n/a | probe | transient | TRANSIENT | — | HEALTH_INPUT | — | battery | LOW | CODE |
| Q022 | ON_DEMAND | Segments | Repair | episodic | n/a | 3 req | MIN/MAX | lookback | repair | LATEST_STATE_UNTIL_OVERWRITTEN | TRIP_FSM_INPUT | — | — | internal | LOW | CODE |
| Q023 | PROD_ACTIVE | Segments | Energy | scheduled | periodic | refuel | MIN/MAX | window | energy | LATEST_STATE_UNTIL_OVERWRITTEN | NO_CURRENT_TDI_CONSUMER | — | — | energy | LOW | CODE |
| Q024 | LEGACY | Segments | Energy (bypassed) | legacy reachable | periodic | recharge | MIN/MAX | window | energy | LATEST_STATE_UNTIL_OVERWRITTEN | NO_CURRENT_TDI_CONSUMER | — | — | energy | LOW | CODE |
| Q025 | PROD_ACTIVE | Segments | Energy | recharge client | windowed | recharge+10 | MIN/MAX | chunked | energy | LATEST_STATE_UNTIL_OVERWRITTEN | NO_CURRENT_TDI_CONSUMER | — | — | energy | MOD | CODE |
| Q026 | SHADOW_CTX | HF+Seg | Shadow | analysis | per run | reuses Q009+Q022 | mixed | trip | shadow | TRANSIENT | research | — | — | internal | LOW | CODE |
| Q027 | PROD_CTX | HF | Event context | per event batch | 1s | reuses Q009 (15) | AVG | ±window | context | LATEST_STATE_UNTIL_OVERWRITTEN | DIRECT_COMPOSITE_INPUT | yes | — | internal | MOD | CODE |

---

## Appendix B — Signal-Surface Matrix (queried signals)

**Columns:** ✓ = field selected in that query/surface. Native Events = `events(...)` filter only (Q015/Q016). Historical Context = non-event `signals(...)` at post-trip or episodic intervals (Q010–Q014). Segments = segment `signalRequests` (Q022–Q025).

| DIMO signal / event | Snap Latest | Live Core | Live Route | Live Perf | HF 1s | Hist Context | Native Events | Segments | Persisted where | TDI consumer class | Canonical field |
|---|---|---|---|---|---|---|---|---|---|---|---|
| speed | ✓ | ✓ | ✓ | — | ✓ | — | — | — | VLS/waypoints/HF-derived | INDIRECT_TRIP_INPUT | speedKmh |
| isIgnitionOn | ✓ | ✓ | — | — | ✓ | — | — | ignitionDetection | VLS/FSM | TRIP_FSM_INPUT | isIgnitionOn |
| powertrainTransmissionTravelledDistance | ✓ | ✓ | — | — | — | — | — | — | VLS/trip | NO_CURRENT_TDI_CONSUMER | odometerKm |
| powertrainFuelSystemRelativeLevel | ✓ | — | — | — | — | ✓(30s Q013/Q014) | — | ✓ refuel MIN/MAX | trip fuel/energy | NO_CURRENT_TDI_CONSUMER | fuel % |
| powertrainFuelSystemAbsoluteLevel | ✓ | ✓ | — | — | — | ✓(30s Q013/Q014) | — | ✓ refuel MIN/MAX | trip fuel/energy | NO_CURRENT_TDI_CONSUMER | liters |
| powertrainTractionBatteryStateOfChargeCurrent | ✓ | — | — | — | ✓ | — | — | — | VLS/HF | NO_CURRENT_TDI_CONSUMER | socPct |
| powertrainTractionBatteryStateOfChargeCurrentEnergy | ✓ | ✓ | — | — | — | — | — | — | trip EV | NO_CURRENT_TDI_CONSUMER | kWh |
| powertrainTractionBatteryStateOfHealth | ✓ | — | — | — | — | — | — | — | VLS | HEALTH_INPUT | soh |
| powertrainTractionBatteryCurrentPower | ✓ | — | — | — | ✓ | — | — | recharge seg | VLS/HF | NO_CURRENT_TDI_CONSUMER | tractionBatteryPowerKw |
| powertrainTractionBatteryCurrentVoltage | ✓ | — | — | — | — | — | — | — | VLS | HEALTH_INPUT | hv voltage |
| powertrainTractionBatteryTemperatureAverage | ✓ | — | — | — | ✓ | — | — | — | VLS/HF | HEALTH_INPUT | tractionBatteryTemperatureC |
| powertrainTractionBattery charging fields (×6) | ✓ | — | — | — | — | — | — | recharge seg | VLS/energy | NO_CURRENT_TDI_CONSUMER | various |
| powertrainTractionBatteryRange / GrossCapacity | ✓ | — | — | — | — | — | — | — | VLS | UI_OPERATIONAL_INPUT | range/capacity |
| powertrainCombustionEngineEngineOilRelativeLevel | ✓ | — | — | — | — | — | — | — | VLS | HEALTH_INPUT | oil level |
| powertrainCombustionEngineDieselExhaustFluidLevel | ✓ | — | — | — | — | — | — | — | VLS | HEALTH_INPUT | DEF |
| powertrainCombustionEngineECT | ✓ | — | — | ✓ | ✓ | — | — | — | trip avg/HF/VLS | DIRECT_COMPOSITE_INPUT (HF) | engineCoolantTempC |
| powertrainCombustionEngineSpeed | — | — | — | ✓ | ✓ | ✓(5s Q012) | — | — | trip avg/HF/battery | INDIRECT_TRIP_INPUT | rpm |
| obdThrottlePosition | — | — | — | ✓ | ✓ | — | — | — | trip avg/HF | DIRECT_COMPOSITE_INPUT | throttlePosition |
| obdEngineLoad | ✓ | — | — | ✓ | ✓ | — | — | — | VLS/trip avg/HF | DIRECT_COMPOSITE_INPUT (HF/live); snapshot → UI only | engineLoad |
| obdRunTime | — | — | — | — | ✓ | — | — | — | HF-derived | DIRECT_COMPOSITE_INPUT | engineRuntimeSec |
| powertrainCombustionEngineTorque | — | — | — | — | ✓ | — | — | — | HF-derived | DIRECT_COMPOSITE_INPUT | engineTorqueNm |
| powertrainCombustionEngineTorquePercent | — | — | — | — | ✓ | — | — | — | HF-derived | DIRECT_COMPOSITE_INPUT | engineTorquePct |
| exteriorAirTemperature | — | — | — | — | ✓ | ✓(2m Q010) | — | — | trip meta/HF | INDIRECT_TRIP_INPUT | exteriorAirTempC |
| currentLocationAltitude | — | — | — | — | ✓ | — | — | — | HF-derived | INDIRECT_TRIP_INPUT | altitudeM |
| powertrainTransmissionCurrentGear | — | — | — | — | ✓ | — | — | — | HF-derived | DIRECT_COMPOSITE_INPUT | currentGear |
| currentLocationCoordinates | ✓ | — | ✓ | — | — | — | — | CPD seg | waypoints/VLS | UI_OPERATIONAL_INPUT | lat/lng |
| lowVoltageBatteryCurrentVoltage | ✓ | — | — | — | — | ✓(5s Q012) | — | — | VLS/battery | HEALTH_INPUT | lv voltage |
| chassisAxleRow* TirePressure (×4 wheels) | ✓ | — | — | — | — | ✓(3m Q011 unused) | — | — | VLS | HEALTH_INPUT | tire kPa |
| chassisTireSystemIsWarningOn | ✓ | — | — | — | — | — | — | — | VLS | HEALTH_INPUT | warning flag |
| obdIsPluggedIn | ✓ | — | — | — | — | — | — | — | VLS | NO_CURRENT_TDI_CONSUMER | connectivity |
| connectivityCellularIsJammingDetected | ✓ | — | — | — | — | — | — | — | VLS | NO_CURRENT_TDI_CONSUMER | connectivity |
| powertrainType | ✓ | — | — | — | — | — | — | — | VLS | NO_CURRENT_TDI_CONSUMER | powertrain class |
| obdDTCList | Q005 | — | — | — | — | — | — | — | DTC tables | NO_CURRENT_TDI_CONSUMER | codes |
| behavior.harshBraking / extremeBraking / harshAcceleration / extremeAcceleration / harshCornering / extremeEmergency* | — | — | — | — | — | — | ✓ Q015 | — | DrivingEvent | DIRECT_COMPOSITE_INPUT | mapped enum |
| safety.collision | — | — | — | — | — | — | ✓ Q015 + Q016 | — | DrivingEvent / misuse | DIRECT_COMPOSITE_INPUT (Q015); misuse only (Q016) | SAFETY_COLLISION |

**Matrix rows:** **35** (includes 6-row charging-field family, 4-wheel tire family, 7-row native-event family; **41 unique signal field names** counted individually in §22.3).

**Corrections applied:** `exteriorAirTemperature` is **Historical Context (Q010, 2m)** and **HF 1s (Q009)** — not a Native Event. Snapshot `obdEngineLoad` / `speed` are **not** direct composite TDI inputs (Phase 1 preserved).

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
| All discovered DIMO query definitions and productive invocation contexts classified | ✓ 27 registry / 22 unique / 8 context buckets (§3.0) |
| Exact signal selection documented | ✓ 41 unique signal fields (§22.3) |
| Trigger/cadence/window known | ✓ (OBSERVED cadence flagged UNKNOWN) |
| Persistence/retention known | ✓ VLS overwrite vs CH TTL documented (§5) |
| Surfaces separated | ✓ Appendix B column split |
| availableSignals usage clarified | ✓ PARTIALLY_CAPABILITY_AWARE |
| Query overlaps documented | ✓ 12 cases (§17) |
| Theoretical request volume calculated | ✓ §6, §8, §22 (units verified) |
| Runtime backlog for unknowns | ✓ 20 probes |

**Phase 2A: DONE**
