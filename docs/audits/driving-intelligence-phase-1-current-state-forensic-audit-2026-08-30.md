# SynqDrive Driving Intelligence — Phase 1 Current-State Forensic Audit

**Date:** 2026-08-30  
**Workstream:** Driving Intelligence Reconstruction — Phase 1.1  
**Authority:** `docs/audits/driving-intelligence-reconstruction-master-plan-2026-08-30.md`  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Branch audited:** `main` (as of 2026-08-30)  
**Scope:** Read-only forensic reconstruction. No production code changed.

---

## 1. Executive Summary

This audit reconstructs the full current-state calculation and data-flow chain from provider signals through trip scores, rolling aggregates, brake/tire health, API, and UI on `main`.

**Canonical semantic truth (CONFIRMED_FROM_CODE):** `drivingStressScore` is **vehicle mechanical load / Fahrbelastung** (0–100, higher = more load). It is **not** driver quality. The composite excludes `thermalBrakeStressScore` and deprecated `safetyScore`.

**Production score path:** Single active composite via `computeDrivingStressScore()` in `driving-impact-scorer.ts` → persisted on `TripDrivingImpact` → distance-weighted rolling on `VehicleDrivingImpactCurrent` → consumed by brake health (per-trip TDI), tire health (rolling VDIC), subject aggregation (`DriverScoreService`), rental analysis, trip assessment, and UI stress panels.

**Key findings:**

| Severity | Count | Headline |
|----------|-------|----------|
| P0 | 1 | `DriverScoreService` + `/trips/driver-score` API name implies driver evaluation but aggregates vehicle stress (**SEMANTIC_DEFECT**) |
| P1 | 2 | Dead `profilesComparable()` branch (**CONFIRMED_DEFECT**); notification/i18n "Fahrbewertung" drift (**SEMANTIC_DEFECT**) |
| P2 | 7 | Correlated feature exposure; tire composite double-exposure; brake/tire input asymmetry; no guaranteed raw HF replay storage; rolling/subject quality gates; API legacy aliases |
| P3 | 3 | Unused config anchors; dead frontend API client methods; stale dev documentation |

**Audit coverage (this document):**

| Metric | Count |
|--------|------:|
| Acquisition paths documented | 11 |
| Event / detector paths | 19 |
| Feature metrics documented | 28 |
| Score formulas (Formula Book) | 14 |
| `drivingStressScore` file references (repo-wide) | 78 |
| Production-code consumers (excl. tests/docs) | 42 |
| Brake health consumer hops | 6 |
| Tire health consumer hops | 5 |
| API endpoints exposing driving intelligence | 9 |
| UI component surfaces | 14 |
| Legacy / duplicate score paths classified | 16 |
| Current-State dependency matrix rows (§25) | 22 |

**Evidence review (2026-08-30):** Raw HF replay retention, active-trip→TDI path, and dependency matrix completeness verified against current `main` before merge of PR #1454.

---

## 2. Scope & Method

### In scope

Scopes A–P from Phase 1.1 assignment: acquisition, normalization, events, features, scorer decomposition, correlation map, load components, persistence, driver/subject aggregation, rolling, brake/tire consumers, API/UI, legacy paths, tests.

### Out of scope

- Phase 2 DIMO capability matrix (four vehicle inventories not on `main` at audit time)
- Production changes, scoring tuning, Flight Recorder, V2 models
- Runtime probes or DIMO live queries

### Method

1. Read canonical master plan.
2. Repo-wide symbol search for listed identifiers.
3. Read primary producer/consumer modules and Prisma schema.
4. Cross-check with existing audit `docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md` (HISTORICAL_EVIDENCE where not re-verified in code).
5. Classify every material claim per Evidence Classification (§3).

---

## 3. Evidence Classification

| Tag | Meaning |
|-----|---------|
| **CONFIRMED_FROM_CODE** | Directly verified in current `main` source |
| **CONFIRMED_FROM_SCHEMA** | Prisma/DTO/API schema |
| **CONFIRMED_FROM_EXISTING_RUNTIME_EVIDENCE** | Existing repo audit/fixture with runtime claim |
| **HISTORICAL_EVIDENCE** | Older audit; may be stale |
| **INFERENCE** | Logical conclusion, not directly executed |
| **PROPOSAL** | Future improvement only |

### Provenance / value-type tags (used in §6, §12, §25)

| Tag | Meaning |
|-----|---------|
| **DIRECT_MEASUREMENT** | On-vehicle measured signal used directly |
| **PROVIDER_CLASSIFIED** | Provider-assigned event/classification |
| **DERIVED_FROM_MEASUREMENT** | Computed from measured samples (e.g. HF speed→decel) |
| **RECONSTRUCTED** | SynqDrive detector output from telemetry |
| **ESTIMATED_PROXY** | Proxy when direct kinematics unavailable |
| **DERIVED_CONTEXT** | Route/map/context inference (not a vehicle sensor) |
| **CONFIGURED** | Static config anchor or weight |
| **CALIBRATED** | Anchored to real measurement over time |

### Finding-type tags (§22)

| Tag | Meaning |
|-----|---------|
| **CONFIRMED_DEFECT** | Code behaves contrary to apparent intent |
| **SEMANTIC_DEFECT** | Naming/UI/API contradicts documented domain semantics |
| **CONFIRMED_ARCHITECTURAL_ASYMMETRY** | Confirmed structural difference; defect status requires product intent |
| **CONFIRMED_CORRELATED_FEATURE_EXPOSURE** | One episode feeds multiple score terms (not yet quantified) |
| **CONFIRMED_DOUBLE_EXPOSURE** | Same information enters a formula more than once |
| **MODEL_RISK_REQUIRES_SENSITIVITY_VALIDATION** | Architectural/correlation concern needing replay/sensitivity proof |

---

## 4. End-to-End Architecture

```mermaid
flowchart TB
  subgraph acquire [Acquisition]
    SL[signalsLatest ~30s]
    HF[signals interval 1s post-trip]
    EV[DIMO behavior events]
    SEG[Segments / trip boundaries]
    MB[Mapbox route enrich]
  end

  subgraph enrich [Trip Enrichment]
    TBE[TripBehaviorEnrichmentService]
    LTE[LteR1BehaviorEnrichmentService]
    TR[TripsService.enrichRoute]
  end

  subgraph store [Storage]
    VT[(VehicleTrip counters)]
    TBEv[(TripBehaviorEvent)]
    DE[(DrivingEvent)]
    TDI[(TripDrivingImpact)]
    VDIC[(VehicleDrivingImpactCurrent)]
  end

  subgraph score [Scoring]
    DIS[DrivingImpactService.computeForTrip]
    SC[driving-impact-scorer.ts]
    LC[driving-impact-load-components.ts]
  end

  subgraph consume [Consumers]
    DS[DriverScoreService]
    BH[BrakeHealthService]
    TH[TireWearModelService]
    RDA[RentalDrivingAnalysisService]
    API[vehicle-intelligence API]
    UI[Frontend stress panels]
  end

  SL --> TBE
  HF --> TBE
  EV --> LTE
  SEG --> VT
  MB --> VT
  TBE --> TBEv
  LTE --> DE
  TBE --> VT
  LTE --> VT
  VT --> DIS
  TBEv --> DIS
  DE --> DIS
  TR --> VT
  DIS --> SC --> LC --> TDI
  TDI --> VDIC
  TDI --> BH
  VDIC --> TH
  TDI --> DS
  TDI --> RDA
  VDIC --> API
  TDI --> API
  API --> UI
```

**Orchestration (CONFIRMED_FROM_CODE):** `TripEnrichmentOrchestrator` → behavior enrich → route enrich → `DrivingImpactProcessor` / `DrivingImpactService.computeForTrip` → rolling upsert → optional brake recalc enqueue + health publish job.

---

## 5. Acquisition Surfaces

| # | Acquisition path | Provider | Entry function | Query / service | Trigger | Intended cadence | Key input signals | Raw units | Timestamp source | Persisted? | Storage target | Downstream consumer | Fallback | Provenance marker |
|---|------------------|----------|----------------|-----------------|---------|------------------|-------------------|-----------|------------------|------------|----------------|---------------------|----------|-------------------|
| 1 | Snapshot polling | DIMO | `DimoSnapshotProcessor` | `buildLatestSnapshotQuery()` — `latest-vehicle-snapshot.query.ts` | Worker scheduler ~30s | ~30 s | speed, location, SOC, tire pressure, engine load, ignition, odometer, EV battery fields (see query file) | SignalFloat `{timestamp,value}` | Provider signal timestamp | Yes | `VehicleLatestState`, ClickHouse mirror | Connectivity, battery, tire pressure health; **not direct driving score input** | Last known value | `hardwareProfile` on vehicle |
| 2 | HF post-trip behavioral | DIMO | `TripBehaviorEnrichmentService.enrichTrip()` | `buildHighFrequencyQuery()` — `high-frequency.query.ts` | Post-trip job after `HF_ENRICH_DELAY_MS=5000` | Requested `1s`; effective often sparse | speed, ECT, RPM, TPS, engine load, torque, gear, EV power, SOC, altitude, ext temp | Aggregated AVG buckets | Bucket timestamp | Yes (events) | `TripBehaviorEvent`, HF cleanup stats on trip | HF detectors → impact counts → TDI | Skip if `<10` raw or `<5` clean HF points | `measurementCoverage`, `hfEventCount` |
| 3 | Native behavior events | DIMO | `LteR1BehaviorEnrichmentService` | `buildDrivingEventsQuery()` — `driving-events.query.ts` | Post-trip per segment window | Event-time | `behavior.harsh*`, `behavior.extreme*`, `behavior.harshCornering`, emergency variants | Provider-classified | Event timestamp | Yes | `DrivingEvent`, trip counters on `VehicleTrip` | Native authority on LTE_R1 for harsh accel/brake/cornering | HF reconstruction for same classes on non-LTE | `nativeEventCount`, `providerClassifiedShare` |
| 4 | Segments / trip boundaries | DIMO | `DimoSegmentsService` | Segments API | Trip detection / finalize | Segment-based | start/end, distance | — | Segment timestamps | Yes | `VehicleTrip` | All trip-scoped pipelines | Local trip heuristics (out of DI scope) | Trip `source` metadata |
| 5 | Route / Mapbox context | Mapbox | `TripsService.enrichRoute()` → `MapboxService` | Directions + speed-limit analysis | Post-trip route job | Per trip once | GPS polyline, road class, speed limits | km/h, % shares | Route point timestamps | Yes | `VehicleTrip.citySharePercent`, `highwaySharePercent`, `countrySharePercent`, speeding fields | Stop-go stress, brake/tire usage factors, deprecated safety inputs | Null shares → scorer uses `0` fallback | `hasRouteEnrichment` gate in load components |
| 6 | Active-trip live polling (`ACTIVE_TICK`) | DIMO | `TripDetectionOrchestrationService.processActiveTick()` | `fetchRawTripCoreData()` (`buildTripDetectionCoreQuery`), `fetchRouteEnrichment()`, `fetchPerformance()` (`buildPerformanceQuery`, **15s** interval) — `dimo-segments.service.ts` | `TripTrackingProcessor` every ~30s while FSM `ACTIVE_TRIP`/`IDLE_WITHIN_TRIP` | ~30s job; perf buckets 15s | core: speed, ignition, odometer; route: lat/lon/speed; perf: RPM, TPS, engine load, ECT | Provider buckets | Provider timestamp | Partial | `VehicleTrip` (distance, avgRpm, avgEngineLoad, avgThrottlePosition, waypoints), detection state cursors | **See §5.1 — not event-counter path** | Post-trip HF/native for events | No DI provenance at live stage |
| 7 | ClickHouse HF mirror (optional) | ClickHouse | `HfMirrorService.mirrorTripHf()` | `insertHfPoints/Events/Windows` | Post-trip after HF enrich; **only if `HF_MIRROR_ENABLED=true`** | Mirror of in-memory HF batch | Subset: speed, RPM, ECT, TPS, engine load, EV power + derived abuse events | Normalized | Provider timestamp | **Best-effort optional** | `telemetry_hf_*` CH tables | Analytics / cadence reads; **not** Postgres canonical | Re-fetch DIMO HF on re-enrich | Postgres remains canonical |
| 8 | VehicleLatestState | Internal | `DimoSnapshotProcessor` persist | N/A | Every snapshot | ~30 s | Normalized latest signals | Internal | `lastSeen` | Yes | Postgres + optional CH | Operational state, not trip scoring | — | — |
| 9 | Braking event ledger | Internal | `BrakingEventLedgerService` | Canonical intake from native/HF | Post enrich | Per event | Braking episodes | m/s² proxy | Event time | Yes | Ledger tables | `brakesPer100Km`, stop density, p95, energy | Trip counters | `brakingProvenance.proxyKinematicShare` |
| 10 | Event context HF window | DIMO | Event-context jobs | HF `1s` around native anchors | Post native event | 1s requested | speed, accel proxies | — | Aligned window | Partial | Context stats | Enrichment quality, not direct score | — | Cadence caveat in `event-context-stats.ts` |
| 11 | Shadow detectors | DIMO HF | `shadow-detector/` orchestrator | Parallel HF | Shadow runs | 1–10s effective | throttle/RPM/torque enriched kickdown-like | — | — | No (blocked) | Metrics only | **Not production DI** | — | `publicationBlocked: true` |

**Phase-2 handoff (INFERENCE):** Snapshot query selects operational/health signals but **not** throttle/RPM/yaw for driving score at snapshot cadence; HF query is the primary kinematic surface. Exact per-path field inventory deferred to Phase 2A.

### 5.1 Active-trip live polling → TDI resolution (**CONFIRMED_FROM_CODE**)

**Entry:** `TripDetectionOrchestrationService.processActiveTick()` (`trip-detection-orchestration.service.ts` ~L1041) triggered by `TripTrackingProcessor` on `ACTIVE_TICK` (~30s while trip active).

**Live query chain:**

```
ACTIVE_TICK
  → fetchRawTripCoreData (trip core signals)
  → fetchRouteEnrichment (GPS/route points → VehicleTripWaypoint)
  → fetchPerformance (15s RPM/TPS/engine load/ECT buckets)
  → VehicleTrip.update (distance, avgRpm, avgEngineLoad, avgThrottlePosition, speed stats)
  → (no TripBehaviorEvent / DrivingEvent / TripDrivingImpact writes during live tick)
```

**Post-trip (separate path):** behavior enrichment re-fetches HF `1s` + native events → counters/events → `DrivingImpactService.computeForTrip()` → TDI.

| Live-persisted artifact | Written during ACTIVE_TICK? | Consumed by TDI? | TDI field / component |
|-------------------------|----------------------------|------------------|------------------------|
| `hardAccelerationCount`, `kickdownCount`, braking counters | **No** (post-trip enrich only) | Yes (post-trip) | per-100km → stress components |
| `TripBehaviorEvent` / `DrivingEvent` | **No** | Yes (post-trip) | p95, energy, classified rows |
| `avgRpm`, `avgEngineLoad`, `avgThrottlePosition` on `VehicleTrip` | **Yes** (rolling mean from live `fetchPerformance`) | Yes | `loadComponentsJson` engine/transmission load only |
| `citySharePercent` / highway shares | **No** during live tick (post-trip Mapbox) | Yes | stop-go / high-speed stress |
| `VehicleTripWaypoint` | Yes | No direct TDI | route context only |

**Overall classification:** **`INDIRECT_TDI_INPUT`**

- Event-based composite inputs (longitudinal/braking/stop-go/high-speed stress): **`LIVE_ONLY_NO_TDI_EFFECT`** during active trip — populated only by post-trip enrichment.
- Engine load sub-scores: **`INDIRECT_TDI_INPUT`** — live `fetchPerformance` → `VehicleTrip.avg*` → `buildEngineLoad()` / `buildTransmissionLoad()` in load components (**not** composite `drivingStressScore` weights directly).

**Not `UNRESOLVED_REQUIRES_RUNTIME`:** code path from live poll → `VehicleTrip` → TDI engine signals is fully traceable; live poll does **not** write behavior event counters consumed by composite stress.

---

## 6. Signal Normalization

| Provider/raw field | Internal field | Raw unit | Internal unit | Normalization function | Missing/null handling | Consumer |
|--------------------|----------------|----------|---------------|------------------------|----------------------|----------|
| `speed.value` (HF) | `speedKmh` | km/h | km/h | `preprocessHighFrequency()` spike filter `MAX_ACCEL_MS2=25` if `dt<3s`; smooth window 3 | Drop spike points | HF accel/brake detectors |
| Speed delta pairs | `accelMs2` / decel | — | m/s² | `(v2-v1)/dt` from consecutive HF points | Segment split at 5s gap | Event detectors |
| DIMO native event names | `DrivingEventType` | — | enum | `normalizeDimoNativeEventKey()` + `mapDimoNativeDrivingEvent()` | Unmapped → skip | LTE enrichment |
| Native severity | classification HARD/EXTREME | 0–1 | tier | Floors: HARD 0.6, EXTREME 0.9 | Default MODERATE | Impact counts |
| Native brake speed | decel proxy | km/h | m/s² | `synthesizeNativeBrakeDecelProxy()` Harsh: `min(9,4.5+5×sev)` Extreme: `min(12,7.5+4×sev)` | END_SPEED_PROXY_FACTOR 0.72 | Braking stats |
| Event counts | `*Per100Km` | count | events/100km | `normalizeEventsPer100Km()` cap 200; min distance 2km | null if unreliable distance | Scorer inputs |
| Stop count / distance | `stopDensity` | stops/km | stops/km | `normalizeStopDensityPerKm()` cap 12 | 0 if no distance | Stop-go stress |
| Brake energy sum | `meanBrakeEnergyPerKm` | m²/s² | m²/s²/km | `normalizeEnergyPerKm()` cap 2000; `sumBrakeEnergy()` uses `0.5×(v1²-v2²)` | 0 if empty | Thermal stress |
| Decel samples | `p95NegativeDecel` | m/s² | m/s² | `percentile95()` floor index 0.95 | 0 if empty | Braking + thermal stress |
| Brake rows | `highSpeedBrakeShare` | count ratio | 0–1 | `normalizeEventShare()` cap 100% | 0 | High-speed + thermal |
| `citySharePercent` | `citySharePct` | % | 0–100 | Pass-through from `VehicleTrip` | null → scorer uses 0 | Stop-go stress |
| Mapbox road-class shares | `citySharePct`, `highwaySharePct`, `countryRoadSharePct` | % | 0–100 | `MapboxService.deriveRoadTypeDistribution()` | null → 0 in scorer | Stop-go, high-speed, brake/tire usage factors |
| `obdEngineLoad` / RPM / TPS (HF) | engine signals | % / rpm / % | same | `mapDimoProviderSignalToCanonical()` | null | Engine load component |
| EV `powertrainTractionBatteryCurrentPower` | kW→W | kW | W | `KW_TO_W=1000` in canonical mapper | null | HF abuse / future regen (not in composite) |
| Location (snapshot) | lat/lon | deg | deg | `SignalLocation` parse | null | Route enrich input chain |

**Provenance classification per value type:**

| Value | Classification |
|-------|----------------|
| HF speed-derived accel/brake | RECONSTRUCTED / DERIVED_FROM_MEASUREMENT |
| DIMO `behavior.*` | PROVIDER_CLASSIFIED |
| Mapbox road shares | **DERIVED_CONTEXT** (GPS + map provider road class — not an on-vehicle sensor) |
| Native decel proxy | ESTIMATED_PROXY |
| Kickdown/launch from HF throttle/RPM | RECONSTRUCTED |
| Trip counters from native | PROVIDER_CLASSIFIED |

---

## 7. Event Detection Inventory

| Event | Source | Detector / function | Inputs | Thresholds | Window | Duration | Cadence req | Native/reconstructed | Downstream use |
|-------|--------|---------------------|--------|------------|--------|----------|-------------|----------------------|----------------|
| Hard acceleration | Reconstructed | `detectAccelerationEvents()` `hf-acceleration.ts` | HF speed | Entry 1.5, continue 1.2, HARD ≥3.5 m/s², Δv≥4 km/h, ≥2 samples | Merge 2000ms | ≥2 samples | ~1s HF | Reconstructed | `hardAccelPer100Km`, longitudinal stress |
| Hard acceleration | Native | `mapDimoNativeDrivingEvent()` | `behavior.harshAcceleration` | severity ≥0.6 | Instant | — | Event | Native | `VehicleTrip.hardAccelerationCount`, LTE authority |
| Extreme acceleration | Reconstructed | same | HF | EXTREME ≥5.0 m/s² | Merge 2000ms | ≥2 | ~1s HF | Reconstructed | `extremeAccelPer100Km` |
| Extreme acceleration | Native | same | `behavior.extremeAcceleration` | severity ≥0.9 | Instant | — | Event | Native | extreme count LTE |
| Kickdown | Reconstructed | `detectKickdown()` `hf-abuse.ts` | TPS, speed | prev<40%, entry>90%, ≤3s, speed>20 km/h | 3-point | instant | ~1s HF | Reconstructed | `kickdownPer100Km`, engine/trans load proxy |
| Launch-like | Reconstructed | `detectLaunchLikeStart()` | speed, TPS, accel | start≤3 km/h, TPS≥80%, accel≥3.5, gain≥20 km/h | up to 10 samples | burst | ~1s HF | Reconstructed | `launchLikePer100Km` |
| Hard braking | Reconstructed | `detectBrakingEvents()` `hf-braking.ts` | HF speed | Entry 1.5, continue 1.2, HARD 4.5, Δv≥3, ≥2 samples | Merge 1500ms | ≥2 | ~1s HF | Reconstructed | `hardBrakePer100Km` |
| Hard braking | Native | native mapper | `behavior.harshBraking` | severity 0.6 | Instant | — | Event | Native | counters, ledger |
| Extreme braking | Reconstructed | HF braking | decel | EXTREME 7.0 m/s² | Merge 1500ms | ≥2 | ~1s HF | Reconstructed | `extremeBrakePer100Km` |
| Extreme braking | Native | native mapper | extreme/emergency names | severity 0.9 | Instant | — | Event | Native | abuse KPI, ledger |
| Full braking | Reconstructed | `detectFullBrakingAndImpact()` | decel | ≥7.5 m/s², hysteresis 6.0, start≥20 km/h, Δv≥6 | mini-window | ≥2 | ~1s HF | Reconstructed | `fullBrakingPer100Km`, thermal stress |
| High-speed braking tag | Reconstructed | `hf-braking.ts` | start speed | ≥80 km/h (`HIGH_SPEED_BRAKE_THRESHOLD_KMH`) | per event | — | per event | Tag on brake event | `highSpeedBrakeShare`, high-speed stress |
| Harsh cornering | Native only | native mapper | `behavior.harshCornering` | severity 0.5 | Instant | — | Event | Native | `harshCornerCount`, tire trip usage |
| Stop (for density) | Feature | `computeBrakingStatistics()` | brake end speed | end `<5 km/h` trustworthy end speed | per brake | — | — | Derived | `stopDensity`, stop-go |
| Stop-go stress | Feature | `computeStopGoStressScore()` | city%, stopDensity, brakes/100km | blend 0.40/0.35/0.25 | trip | — | route+brakes | Derived | `stopGoStressScore` |
| Speed exposure | Route | `MapboxService.analyzeSpeedingSections()` | limit×1.05 tolerance | section gaps | trip | — | route | Measured route | deprecated safety only |
| Cold/high-RPM abuse (etc.) | Reconstructed | `detectAbuseEvents()` | ECT,RPM,TPS | see hf-abuse.ts | various | 1.5s–180s | ~1s HF | Reconstructed | misuse cases, not composite |
| Provider behavior (aggregate) | Native | `buildDrivingEventsQuery()` | filtered behavior names | name whitelist | trip window | — | paginated | Native | unified behavior read model |

**Event source precedence (CONFIRMED_FROM_CODE):** On LTE_R1, native events own harsh accel/brake/cornering trip counters; HF still runs for kickdown, launch-like, full braking, abuse tiers. Unified read model dedup bucket `TIMESTAMP_BUCKET_MS=2000`.

**Unused events (INFERENCE):** Abuse tiers (cold engine, long idle, etc.) feed misuse detection but not `drivingStressScore` composite directly.

---

## 8. Feature Inventory

| Feature | Formula / definition | Inputs | Unit | Normalization | Clamp | Fallback | Missing | Consumers |
|---------|---------------------|--------|------|---------------|-------|----------|---------|-----------|
| `hardAccelPer100Km` | `normalizeEventsPer100Km(hardAccelCount)` | count, distanceKm | /100km | cap 200 | cap | 0 via metricValueOrZero | null if distance unreliable | Longitudinal stress |
| `extremeAccelPer100Km` | same | extreme count | /100km | cap 200 | cap | 0 | null | Longitudinal |
| `kickdownPer100Km` | same | kickdown count | /100km | cap 200 | | 0 | null | Longitudinal, engine load |
| `launchLikePer100Km` | same | launch count | /100km | cap 200 | | 0 | null | Longitudinal, transmission load |
| `hardBrakePer100Km` | same | hard brake count | /100km | cap 200 | | 0 | null | Braking stress, brake health |
| `extremeBrakePer100Km` | same | extreme count | /100km | cap 200 | | 0 | null | Braking stress |
| `fullBrakingPer100Km` | same | full braking count | /100km | cap 200 | | 0 | null | Braking + thermal stress |
| `brakesPer100Km` | same | total brakes | /100km | cap 200 | | 0 | null | Braking + stop-go |
| `stopDensity` | stops / distanceKm | stop count, km | stops/km | cap 12 | cap | 0 | null | Stop-go stress, brake pads |
| `highSpeedBrakeShare` | HS brakes / all brakes | brake rows | 0–1 | cap 100% | [0,1] | 0 | null | High-speed + thermal |
| `meanBrakeEnergyPerKm` | sum brake energy / km | HF/native rows | m²/s²/km | cap 2000 | cap | 0 | null | Thermal stress |
| `p95NegativeDecel` | 95th percentile decel magnitudes | decel samples | m/s² | none | — | 0 | empty→0 | Braking + thermal |
| `citySharePct` | from trip | Mapbox | % | none | — | 0 in scorer | null→0 | Stop-go; load assessability |
| `highwaySharePct` | from trip | Mapbox | % | none | — | 0 | null→0 | High-speed stress |
| `measurementCoverage` | hfClean/hfTotal | HF stats | 0–1 | round3 | [0,1] | null | null | Provenance, data quality |
| `speedingExposurePct` | speeding distance / total | Mapbox | % | — | — | — | null | deprecated safety only |
| `nativeEventCount` | count native | events | count | — | — | 0 | — | Provenance |
| `hfEventCount` | count HF behavior | events | count | — | — | 0 | — | Provenance |
| `proxyKinematicShare` | proxy brakes / all | braking provenance | 0–1 | — | — | 0 | — | Braking load assessability |
| `sourceCompleteness` | weighted checklist | trip inputs | 0–1 | thresholds 0.35/0.25/0.30/0.10 | — | 0 | — | analysisStatus PARTIAL gate |
| `authoritativeDistanceKm` | trip.distanceKm at compute | VehicleTrip | km | — | — | trip distance | null | Brake/tire wear distance budget |
| `distanceDiscrepancyKm` | abs drift | stored vs current | km | tolerance 0.5 | — | — | — | STALE status |
| `assignmentCoveragePct` | scored/total trips | subject trips | % | round2 | — | — | — | DriverScore API |
| `hasEnoughData` | trips≥3 AND km≥50 | aggregation | bool | — | — | false | — | DriverScore API |
| `dataConfidence` | band rules | scored trips, km | enum | — | — | none | — | DriverScore API |
| `stressLevel` | classifyStressLevel(score) | stress score | enum | bands 25/50/75 | — | null | null score | API/UI |
| `behaviorFactor` (tire) | interpolate weighted stress | rolling scores | multiplier | clamp 0.97–1.35 | cap | 1.0 | no rolling | Tire wear |
| `usageFactor` (tire/brake) | road-type weighted blend | city/highway/country | multiplier | clamp | cap | 33/34/33 default | null shares | Tire + brake wear |

---

## 9. Current Driving Impact Formula Book

Model version: **`v1.2.0`** (`DRIVING_IMPACT_CONFIG.MODEL_VERSION`)

Shared helpers (`driving-impact-scorer.ts`):
- `capLinear(v, ref) = min(100, max(0, v/ref×100))` for v≥0
- `sat(v, ref) = min(1, max(0, v/ref))`
- `round1(n) = round(n×10)/10`

---

### 9.1 Longitudinal Stress Score

| Field | Value |
|-------|-------|
| **Name** | `longitudinalStressScore` |
| **Purpose** | Powertrain/transmission stress from aggressive acceleration |
| **Source file** | `driving-impact-scorer.ts` |
| **Function** | `computeLongitudinalStressScore()` |
| **Inputs** | `hardAccelPer100Km`, `extremeAccelPer100Km`, `kickdownPer100Km`, `launchLikePer100Km` |
| **Formula** | `raw = 1.0×hard + 1.8×extreme + 1.2×kickdown + 2.0×launch`; `score = round1(capLinear(raw, 20))` |
| **Clamp** | 0–100 via `LONGITUDINAL_RAW_MAX=20` |
| **Unit** | dimensionless 0–100 |
| **Missing-data** | Inputs default to 0 via normalizer |
| **Confidence** | Model profile gating may reduce (`applyModelProfileToStressScores`) |
| **Consumers** | Composite, `longitudinalLoad`, tire load (30%), tire behavior factor |

---

### 9.2 Braking Stress Score

| Field | Value |
|-------|-------|
| **Name** | `brakingStressScore` |
| **Purpose** | Brake/tire stress from aggressive braking |
| **Function** | `computeBrakingStressScore()` |
| **Inputs** | `hardBrakePer100Km`, `extremeBrakePer100Km`, `fullBrakingPer100Km`, `brakesPer100Km`, `p95NegativeDecel` (m/s²) |
| **Formula** | `raw = 1.0×hard + 1.8×extreme + 2.2×full + 0.4×brakes + 0.8×p95`; `score = round1(capLinear(raw, 30))` |
| **Clamp** | `BRAKING_RAW_MAX=30` |
| **Note** | Config comment mentions p95/reference division; **code multiplies raw p95 by 0.8 directly** |
| **Consumers** | Composite, `brakingLoad`, tire load (35%), brake health harsh multiplier, tire behavior factor |

---

### 9.3 Stop-Go Stress Score

| Field | Value |
|-------|-------|
| **Name** | `stopGoStressScore` |
| **Function** | `computeStopGoStressScore()` |
| **Inputs** | `citySharePct`, `stopDensity`, `brakesPer100Km` |
| **Formula** | `cityF=sat(city,100)`; `stopF=sat(stopDensity,3)`; `brakeF=sat(brakes,30)`; `raw=0.40×cityF+0.35×stopF+0.25×brakeF`; `score=round1(raw×100)` |
| **Clamp** | Implicit 0–100 via sat factors |
| **Missing** | city/highway null → 0 in service |
| **Consumers** | Composite, `stopGoLoad`, tire load (35%) |

---

### 9.4 High-Speed Stress Score

| Field | Value |
|-------|-------|
| **Name** | `highSpeedStressScore` |
| **Function** | `computeHighSpeedStressScore()` |
| **Inputs** | `highwaySharePct`, `highSpeedBrakeShare` (0–1) |
| **Formula** | `raw = 0.50×sat(highway,100) + 0.50×clamp(HSshare,0,1)`; `score=round1(raw×100)` |
| **Consumers** | Composite, `speedLoad` |

---

### 9.5 Thermal Brake Stress Score

| Field | Value |
|-------|-------|
| **Name** | `thermalBrakeStressScore` |
| **Function** | `computeThermalBrakeStressScore()` |
| **Inputs** | `highSpeedBrakeShare`, `fullBrakingPer100Km`, `meanBrakeEnergyPerKm`, `p95NegativeDecel` |
| **Formula** | `raw = 0.30×HSshare + 0.30×sat(full,5) + 0.25×sat(energy,500) + 0.15×sat(p95,9)`; `score=round1(raw×100)` |
| **Not in composite** | Used by brake health disc thermal factor, not `drivingStressScore` |
| **Consumers** | `thermalLoad`, `BrakeHealthService` discThermalFactor |

---

### 9.6 Composite Driving Stress Score

| Field | Value |
|-------|-------|
| **Name** | `drivingStressScore` |
| **Purpose** | Vehicle load / Fahrbelastung |
| **Function** | `computeDrivingStressScore()` |
| **Formula** | `round1(0.30×long + 0.35×brake + 0.20×stopGo + 0.15×highSpeed)` |
| **Clamp** | 0–100 |
| **Confidence** | Persisted after model-profile gating as gated scores |
| **Consumers** | TDI, rolling, DriverScore, rental analysis, trip assessment, UI (see §17–18) |

---

### 9.7 Tire Load (trip)

| Field | Value |
|-------|-------|
| **Name** | `tireLoad.score` in `loadComponentsJson` |
| **Function** | `buildTireLoad()` |
| **Formula** | `round1(0.35×brakingLoad + 0.35×stopGoLoad + 0.30×longitudinalLoad)` |
| **Missing** | null if any essential behavioral component `INSUFFICIENT_DATA` |
| **Lateral/pressure/temp** | **Not used** at trip load layer (CONFIRMED_FROM_CODE) |
| **Consumers** | JSON persistence; indirect via stress components into tire health rolling behavior factor |

---

### 9.8 Vehicle Load Summary

| Field | Value |
|-------|-------|
| **Function** | `buildVehicleLoadSummary()` |
| **Formula** | When all 4 essentials assessable: `score = computeDrivingStressScore()` (same as legacy composite) |
| **Partial** | Renormalized weighted average over assessable essentials |
| **Coverage** | `sum(weights assessable)/1.0` |

---

### 9.9 Engine Load / Transmission Load

| Component | Formula |
|-----------|---------|
| Engine | Priority: avgEngineLoad capLinear(.,100); else avg(RPM cap 4500, throttle cap 100); else proxy `capLinear(1.2×kickdown+2.0×launch, 12)` |
| Transmission | proxy `capLinear(1.2×kickdown+2.0×launch, 10)` if counts>0 |
| EV | `assessability=UNSUPPORTED`, score null |

---

### 9.10 Deprecated Safety Score

| Field | Value |
|-------|-------|
| **Function** | `computeSafetyScore()` @deprecated |
| **Formula** | `100 - min(55, exposure×0.8) - min(35, maxOver×0.7+avgOver×0.6) - min(10, sections×1.5)` |
| **Writes** | **`safetyScore: null`** on new TDI rows (`driving-impact.service.ts`) |

---

## 10. Correlated / Duplicate Penalty Map

### Cluster A — Single hard brake episode

| Stage | Metrics touched |
|-------|-----------------|
| Physical episode | One HF/native hard brake decel episode |
| Derived observations | `hardBrakePer100Km`, possibly `extremeBrakePer100Km`, `fullBrakingPer100Km`, `brakesPer100Km`, `p95NegativeDecel`, `highSpeedBrakeShare`, `meanBrakeEnergyPerKm`, stop if end<5 km/h |
| Score paths | `brakingStressScore` (up to 5 terms), `stopGoStressScore` (brake factor), `highSpeedStressScore` (if start≥80), `thermalBrakeStressScore` (up to 4 terms), composite (via braking+stopGo+highSpeed) |
| Classification | **CONFIRMED_CORRELATED_FEATURE_EXPOSURE** — not a quantified scoring error without sensitivity analysis |
| Composite exposure | Same episode can influence composite **up to 3 component scores** (braking, stop-go, high-speed) plus tire load blend |

### Cluster B — Launch-like maneuver

| Metrics | longitudinal raw (launch weight 2.0), kickdown may also fire separately |
| Classification | **PARTIALLY_CORRELATED** (launch vs kickdown detectors differ but co-occur) |
| Composite | longitudinal once; engine/transmission proxy loads separate |

### Cluster C — City driving context

| Metrics | `citySharePct` drives stop-go; also brake health `padUsageFactor` / tire `usageFactor` |
| Classification | **INDEPENDENT_SIGNAL** for context vs **STRONGLY_CORRELATED** for stop-go+usage |

### Cluster D — `drivingStressScore` in tire behavior factor

| Path | Tire `behaviorFactor` uses 0.50×longitudinal + 0.35×braking + 0.15×**drivingStressScore** (composite of largely the same trip stress components) |
| Classification | **CONFIRMED_DOUBLE_EXPOSURE** / **MODEL_RISK_REQUIRES_SENSITIVITY_VALIDATION** — correlation confirmed; quantitative wear bias not proven in Phase 1 |

### Summary table

| Cluster | Physical episode | Classification | Composite hits |
|---------|------------------|----------------|----------------|
| Hard brake | Brake decel | STRONGLY_CORRELATED | 2–3 components |
| Full brake ≥7.5 | Full braking | DERIVED_FROM_SAME_EVENT | braking + thermal + possibly HS |
| Stop from brake | Near-stop | DERIVED_FROM_SAME_EVENT | stop-go + brake count |
| Launch | Standstill launch | PARTIALLY_CORRELATED | longitudinal (+ proxies) |
| Tire behavior blend | Trip stress | STRONGLY_CORRELATED | implicit double count |

---

## 11. Load Components

**File:** `driving-impact-load-components.ts` — version `impact-load-components-v1`

| Component | Score source | Assessability rules | Evidence |
|-----------|--------------|---------------------|----------|
| `longitudinalLoad` | longitudinalStressScore | STANDARD behavioral | provenance shares |
| `brakingLoad` | brakingStressScore | LIMITED if proxyKinematicShare≥0.5 | `BRAKING_PROXY_KINEMATICS` |
| `stopGoLoad` | stopGoStressScore | LIMITED without route enrichment | |
| `speedLoad` | highSpeedStressScore | LIMITED without route enrichment | |
| `thermalLoad` | thermalBrakeStressScore | behavioral rules | brake health |
| `engineLoad` | engine formula | EV UNSUPPORTED | |
| `transmissionLoad` | transmission proxy | LIMITED, LOW evidence | |
| `tireLoad` | 0.35/0.35/0.30 blend | null if essentials missing | no lateral/pressure |
| `dataQuality` | measurementCoverage | inverted stress level | |
| `vehicleLoad` | composite or renormalized | INSUFFICIENT if essential missing | |

**Tire load today:** exclusively derived from other stress scores — **no direct tire physics signals** (CONFIRMED_FROM_CODE).

---

## 12. TripDrivingImpact Persistence

**Schema:** `TripDrivingImpact` — `backend/prisma/schema.prisma` ~L13522

| Persisted field | Producer | Formula/source | Primary consumer |
|-----------------|----------|----------------|------------------|
| `drivingStressScore` | `DrivingImpactService` | composite formula | All downstream |
| Component scores | same | scorer functions | API, health, rolling |
| Per-100km metrics | normalizer | event counts / distance | scorer |
| Provenance columns | `buildDrivingImpactSourceProvenance()` | share math | health eligibility |
| `loadComponentsJson` | `buildDrivingImpactLoadComponents()` | load builders | readers, audit |
| `modelVersion` | config `v1.2.0` | constant | cohort filter |
| `sourceFingerprint` | hash of inputs | idempotent guard | skip recompute |
| `analysisStatus` | coverage domain | completeness rules | brake wear gate |
| `authoritativeDistanceKm` | trip distance | wear models | brake/tire |

**Write path:** `DrivingImpactService.computeForTrip()` upsert by `tripId`.

**Recompute behavior (CONFIRMED_FROM_CODE):**
- Skipped if fingerprint unchanged unless status `STALE`
- Trips `<2 km` skipped
- Can overwrite prior row (upsert) — **not append-only**
- Model version stored per row — rolling filters mismatched versions
- **`DrivingImpactService` recompute reads Postgres only** — does not re-call DIMO during impact recompute

**Determinism:** Fingerprint + sorted rolling cohort → deterministic for same persisted inputs (CONFIRMED_FROM_CODE: rolling manifest `recomputeDeterministic: true`).

### 12.1 Storage & replay retention verification (**CONFIRMED_FROM_CODE** / **CONFIRMED_FROM_SCHEMA**)

Distinction between artifact layers:

| Layer | Examples | Postgres | ClickHouse | Re-fetch DIMO on re-enrich? |
|-------|----------|----------|------------|----------------------------|
| Original DIMO HF/time-series samples | `signals(interval:"1s")` rows | **Not stored** (no HF raw table in Prisma) | Optional mirror subset if `HF_MIRROR_ENABLED=true` | **Yes** — `fetchHighFrequency()` on behavior re-enrich |
| Preprocessed HF points | `preprocessHighFrequency()` output | **Not stored** (in-memory only) | Not stored separately | Requires HF re-fetch + re-preprocess |
| Derived events | `TripBehaviorEvent`, `DrivingEvent` | **Yes** | Optional derived-event mirror | Native events paginated again on re-enrich; HF events re-derived from new HF fetch |
| Braking ledger | `BrakingEventLedger` rows | **Yes** | — | Rebuilt from canonical events on re-intake |
| Trip aggregates | `VehicleTrip` counters, `avgRpm`, `behaviorSummaryJson` | **Yes** | — | Counters rewritten on re-enrich |
| Scored outputs | `TripDrivingImpact`, `VehicleDrivingImpactCurrent` | **Yes** | — | Recomputable from persisted trip inputs via fingerprinted upsert |
| Route context | Mapbox shares, waypoints | **Yes** (`VehicleTrip`, `VehicleTripWaypoint`) | — | Route job re-run if re-enriched |

#### A. Are full original HF samples persistently stored in Postgres?

**No (CONFIRMED_FROM_SCHEMA).** Prisma has no raw HF/time-series sample model. Post-trip enrichment holds HF readings in memory, then persists **derived** `TripBehaviorEvent` rows and summary stats (`behaviorSummaryJson.hfPointsTotal`, `hfPointsCleaned`) only.

#### B. Are they fully stored in ClickHouse?

**Only partially, and only when enabled (CONFIRMED_FROM_CODE).** `HfMirrorService` mirrors a **subset** of signals (speed, RPM, ECT, TPS, engine load, EV power) plus derived abuse events/windows. Disabled by default (`HF_MIRROR_ENABLED !== 'true'`). Not a complete DIMO HF payload archive.

#### C. Is ClickHouse persistence guaranteed?

**No — optional / best-effort (CONFIRMED_FROM_CODE).** `hf-mirror.service.ts` documents: disabled by default; never throws into enrichment; Postgres is canonical; insert failures are logged and swallowed.

#### D. Which raw/intermediate artifacts actually remain after enrichment?

**Persisted (Postgres):** `TripBehaviorEvent`, `DrivingEvent`, braking ledger (when enabled), `VehicleTrip` behavior counters + engine averages + `behaviorSummaryJson`, route shares/waypoints, `TripDrivingImpact`.

**Not persisted:** original DIMO HF bucket array, preprocessed HF point series, in-flight detector intermediate arrays.

**Optional (ClickHouse):** normalized HF points/events/windows when mirror enabled.

#### E. Which scores are deterministically recomputable from persisted data alone?

**CONFIRMED_FROM_CODE:** `DrivingImpactService.computeForTrip()` reads `VehicleTrip`, `TripBehaviorEvent`/`DrivingEvent`, ledger summary, route shares — **no DIMO call**. Given unchanged persisted inputs, TDI upsert is fingerprint-idempotent.

**Requires re-enrichment / provider re-read if:** behavior events or trip counters must be regenerated (e.g. detector threshold change, HF re-fetch, native event re-pagination).

#### F. Where is provider re-read or a future Flight Recorder required?

| Need | Why persisted storage is insufficient |
|------|--------------------------------------|
| Raw HF cadence replay at degraded sampling | No guaranteed Postgres raw series; CH mirror optional/partial |
| Detector re-run on original kinematic series without DIMO | No canonical raw archive |
| Sampling-invariance laboratory (Phase 6) | Needs captured evidence store (Phase 3 Flight Recorder) |
| Full signal-surface audit of unused DIMO fields | Requires live/paged queries (Phase 2) |

**Corrected statement:** Prior draft claim *"Raw HF/events remain for replay"* is **misleading**. **Derived events and trip aggregates persist; original HF time series does not persist in Postgres and is not guaranteed in ClickHouse.**

---

## 13. DriverScore / Subject Aggregation

**File:** `driver-score.service.ts`

| Rule | Value |
|------|-------|
| Trip status | `COMPLETED` |
| Privacy | `isPrivateTrip: false` |
| Assignment | matching `assignmentSubjectType/Id` |
| Booking customers | `bookingLinkSource=EXPLICIT`, assigned booking |
| MIN_SCORED_TRIPS | **3** |
| MIN_DISTANCE_KM | **50** |
| Weighting | `Σ(score×distance)/Σ(distance)` scored trips only |
| Confidence high | ≥10 trips AND ≥250 km |
| Output | `DriverScoreSummary` with `drivingStressScore`, **not driver quality** |

**Semantic exposure:** Endpoint `GET .../trips/driver-score`, service name `DriverScoreService`, customer list fields — all expose vehicle stress under driver naming.

---

## 14. Rolling / High-Timeframe Aggregation

**Window:** 30 days (`ROLLING_WINDOW_DAYS`)  
**File:** `driving-impact-rolling.ts`, writer `DrivingImpactService.updateRollingCurrent()`

| Mechanism | Behavior |
|-----------|----------|
| Cohort key | `modelProfile::behavioralIngestionPath` |
| Winner | Largest total distance cohort |
| Exclusions | MODEL_VERSION_MISMATCH, MODEL_PROFILE_VERSION_MISMATCH, PROFILE_INCOMPATIBLE |
| Aggregation | Distance-weighted average per scalar field |
| `notDriverEvaluation` | `true` in manifest |
| Health eligibility merge | distance-weighted HIGH/LOW rules |

### `selectRollingCohort()` / `profilesComparable()` audit

**CONFIRMED_FROM_CODE:** Lines 151–155 — both branches push `PROFILE_INCOMPATIBLE`. Function `profilesComparable()` is **dead code** for inclusion decisions. All non-winning cohort trips excluded regardless of comparability result.

**Impact (P1):** Compatible profile trips from non-dominant cohorts never contribute to rolling — may under-represent mixed-profile fleets.

**Additional gap (P2):** Rolling input does **not** filter `analysisStatus`; brake wear per-trip path requires COMPLETE/PARTIAL.

---

## 15. Brake Health Dependency Graph

```
TripDrivingImpact (analysisStatus COMPLETE|PARTIAL)
  → allocateTripDistancesToOdometerBudget(authoritativeDistanceKm)
  → per trip modifiers:
      padUsageFactor(city/highway/country shares)
      padStopDensityFactor(stopDensity)
      padHardBrakeFactor → harshBrakeWearMultiplier(hardBrakePer100Km) bands {1.0,1.15,1.35,1.6}
      padFullBrakingFactor(fullBrakingPer100Km stepped)
      padRekuFactor(fuelType)
      discUsageFactor, discHighSpeedFactor(highSpeedBrakeShare)
      discHardBrakeFactor (same harsh bands)
      discFullBrakingFactor, discThermalFactor(thermalBrakeStressScore interpolated)
      discRekuFactor
  → wornMm += allocatedKm × effectiveWearPerKm × kFactor
```

| Quantity | Tag |
|----------|-----|
| TDI metrics | DERIVED |
| Config anchors | CONFIGURED |
| `harshBrakeWearMultiplier` | CONFIGURED (active) |
| `padHardBrakeAnchors` / `discHardBrakeAnchors` | CONFIGURED but **UNUSED** (P3) |
| Tread/pad measurements | MEASURED (calibration anchors) |
| kFactor calibration | CALIBRATED |

**Display/confidence:** Also reads `VehicleDrivingImpactCurrent` rolling 30d.

---

## 16. Tire Health Dependency Graph

**Trip tire load (today):** 35/35/30 stress blend — PROXY, no lateral/pressure at trip layer.

**Lifecycle wear model (`tire-wear-model.service.ts`):**

```
VehicleDrivingImpactCurrent (30d rolling)
  → usageFactor (road blend clamp 0.93–1.15)
  → behaviorFactor = interpolate(0.50×long + 0.35×brake + 0.15×drivingStressScore)
  → temperatureFactor (heat stress; drivingComponent=0 when DI available)
  → pressureFactor, loadFactor, seasonMismatch, axle/drivetrain bias, kFactor, regen, interactionPenalty
  → effectiveWearMmPerKm
```

| Input layer | Source |
|-------------|--------|
| Trip `TireTripUsageLedger.drivingImpactSummary` | Snapshot for fingerprint only — **not wear formula** |
| Wear formula | Rolling VDIC only |

**Asymmetry (P1):** Brake wear uses **per-trip TDI** since anchor; tire wear uses **30d rolling** behavior.

---

## 17. API Surface

| API/DTO field | Internal source | Actual meaning | Name accurate? |
|---------------|-----------------|----------------|----------------|
| `drivingStressScore` | TDI composite | Vehicle load | Yes |
| `drivingScore` | alias | Same | Misleading legacy |
| `drivingStyleScore` | alias | Same | **No** — deprecated name |
| `avgDrivingStressScore` | stats aggregate | Vehicle load mean | Yes |
| `avgDrivingScore` / `avgDrivingStyleScore` | mirrors | Same | Legacy |
| `DriverScoreSummary.drivingStressScore` | distance-weighted TDI | Vehicle load | **No** — endpoint says driver |
| `stressLevel` | classifyStressLevel | Load band | Yes |
| `rolling.drivingStressScore` | VDIC | 30d load | Yes |
| `rolling.notDriverEvaluation` | manifest | explicit false driver eval | Yes |
| `tripAssessment.signals.drivingStressScore` | TDI | One assessment signal | Yes (context) |
| `rentalDrivingAnalysis.vehicleStressSummary` | recompute | Vehicle stress | Yes |
| `booking.usage.drivingStressScore` | analysis row `drivingScore` column | Vehicle load | Column name legacy |
| `booking.usage.stressLevel` | mapper | **always null** | Gap |

**Routes (CONFIRMED_FROM_CODE):** `vehicle-intelligence.controller.ts` — trips list/detail/stats, `driver-score`, `driving-impact/rolling`, `driving-assessment-quality`; customers list; rental-driving-analyses; booking detail.

---

## 18. UI Semantic Surface

| Route/Component | API field | Visible label | Semantics aligned? |
|-----------------|-----------|-----------------|-------------------|
| `VehicleStressPanel` | stress prop | "Fahrbelastung" | Yes |
| `CustomersView` | customer stress | "Fahrbelastung" | Yes (data is stress aggregate) |
| `CustomerDrivingTab` | customer + analysis | "Fahrbelastung (Kunde)" | Yes |
| `CustomerDetailSummaryGrid` | stress | "Fahrbelastung" | Yes |
| `TripTimelineExpanded` | trip stress | stress panel | Yes |
| `RentalStressAnalysisCard` | analysis summary | mechanical copy | Yes |
| `dashboardNotificationAdapter` | device quality | **"Fahrbewertung …"** | **No (P1)** |
| i18n pl/nl/it/fr/es/cs | driverScore keys | "driver score" variants | **No (P1)** |
| i18n de `dashboard.drivingScores` | — | "Fahrbewertungen" vs "Fahrbelastung" elsewhere | **No (P1)** |
| `PerformanceLogicView` | — | dual canonical style+safety | **No (P1 stale)** |

**Score direction:** Higher stress = worse load (more mechanical burden) — consistent in stress panels.

**Confidence visibility:** Customer/driver summary shows `dataConfidence`; trip panels vary.

---

## 19. Legacy / Duplicate Paths

| Path | Classification |
|------|----------------|
| `computeDrivingStressScore()` | ACTIVE_PRODUCTION |
| `computeDrivingStyleScore` alias | DEPRECATED alias, ACTIVE_PRODUCTION |
| `computeSafetyScore()` | DEPRECATED; writes null |
| `DriverScoreService` | ACTIVE_PRODUCTION (misnamed) |
| `VehicleTrip.drivingScore` fallback | LEGACY_REACHABLE |
| `rental_driving_analyses.drivingScore` | LEGACY_REACHABLE |
| API aliases on trip mapper | LEGACY_REACHABLE |
| `api.vehicleIntelligence.driverScore()` frontend | DEAD_CODE (no callers) |
| `api.vehicleIntelligence.drivingImpactRolling()` frontend | DEAD_CODE |
| `PerformanceLogicView` dual score docs | LEGACY_REACHABLE |
| Shadow kickdown detector | TEST_ONLY / shadow metrics |
| `abuseScore` in behavior enrich | ACTIVE_PRODUCTION (separate domain) |
| `entityMappers drivingScore: null` | DEAD_CODE |

**Conclusion:** One canonical composite production path; multiple **legacy naming mirrors** remain reachable.

---

## 20. Test & Replay Coverage

| Domain | Test files | Coverage notes |
|--------|-----------|----------------|
| Scorer | `driving-impact.service.spec.ts`, `stress-level.util.spec.ts` | Component + composite weights |
| Load components | `driving-impact-load-components.spec.ts`, reader specs | Tire blend, assessability |
| Provenance | `driving-impact-provenance.spec.ts`, braking provenance specs | Eligibility, shares |
| Rolling | `driving-impact-rolling.spec.ts` | Cohort selection, PROFILE_INCOMPATIBLE |
| Model profile | `driving-impact-model-profile.spec.ts` | Gating |
| Driver score | `driver-score.service.spec.ts` | Thresholds 3/50, weighting |
| Trip assessment | `trip-assessment.service.spec.ts`, frontend semantics tests | Assessment not driver quality |
| HF detectors | `hf-abuse.spec.ts`, `trip-detection.spec.ts` | Threshold regression |
| Behavior enrich | `lte-r1-behavior-enrichment.service.spec.ts`, unified behavior specs | Native vs HF |
| Brake health | extensive `brake-health*.spec.ts` | Modifier bands |
| Tire health | `tire-health.spec.ts`, `tire-wear-model*.spec.ts` | behaviorFactor, usage |
| Rental analysis | `rental-driving-analysis.*.spec.ts` | Fingerprint, recompute |
| Coverage audit | `trip-driving-impact-coverage.spec.ts` | analysisStatus |
| Replay fixtures | `energy-events` fixtures, shadow fixtures | Partial; **no raw HF series fixtures** |

**Gaps (CONFIRMED_FROM_CODE):** No end-to-end sampling-invariance replay; **no guaranteed persisted raw HF time series** for detector replay (§12.1 F-14). TDI fingerprint recompute from Postgres aggregates only.

---

## 21. Data Provenance / Confidence Architecture

| Layer | Mechanism |
|-------|-----------|
| Trip provenance | `buildDrivingImpactSourceProvenance()` — measured/provider/reconstructed/proxy shares |
| Primary source | `resolvePrimarySource()` — MIXED if native+HF |
| Health eligibility | `computeHealthEligibility()` — coverage + share thresholds |
| Braking downgrade | `reduceHealthEligibilityForBrakeProxy()` when proxy kinematic share high |
| Load assessability | per-component LIMITED/INSUFFICIENT_DATA rules |
| Analysis status | PENDING/COMPLETE/PARTIAL/UNSUPPORTED/FAILED/STALE |
| Rolling manifest | merges source quality distance-weighted; `notDriverEvaluation: true` |
| Subject confidence | separate trip-count/distance bands in DriverScoreService |

---

## 22. Confirmed Problems / Risks

| ID | Severity | Type | Finding | Evidence |
|----|----------|------|---------|----------|
| F-01 | **P0** | SEMANTIC_DEFECT | Driver-facing API/service naming for vehicle stress aggregate | `driver-score.service.ts`, `/trips/driver-score` |
| F-02 | **P1** | CONFIRMED_DEFECT | `profilesComparable()` dead; both branches push `PROFILE_INCOMPATIBLE` for all non-winning cohorts | `driving-impact-rolling.ts:151-155` |
| F-03 | **P2** | CONFIRMED_ARCHITECTURAL_ASYMMETRY | Brake wear uses per-trip TDI since anchor; tire wear behavior uses 30d rolling VDIC | `brake-health.service.ts` vs `tire-wear-model.service.ts` — not proven unintentional |
| F-04 | **P2** | CONFIRMED_DOUBLE_EXPOSURE / MODEL_RISK | Tire `behaviorFactor` adds 0.15× composite atop 0.50×long + 0.35×brake | `tire-wear-model.service.ts` — quantitative bias unproven |
| F-05 | **P1** | SEMANTIC_DEFECT | UI/i18n "Fahrbewertung"/"driver score" vs mechanical load | notifications, i18n keys |
| F-06 | **P2** | CONFIRMED_CORRELATED_FEATURE_EXPOSURE | Single brake episode feeds multiple score terms (§10) | scorer + normalizer — weighting not yet sensitivity-validated |
| F-07 | **P2** | CONFIRMED_ARCHITECTURAL_FACT | Rolling lacks `analysisStatus` filter; brake wear requires COMPLETE/PARTIAL | driving-impact.service vs brake-health |
| F-08 | **P2** | CONFIRMED_ARCHITECTURAL_FACT | Subject aggregation lacks analysisStatus / model cohort gates | driver-score.service.ts |
| F-09 | **P2** | SEMANTIC_DEFECT (legacy) | Legacy API aliases (`drivingStyleScore`) still emitted | trip-api.mapper.ts |
| F-10 | **P2** | CONFIRMED_ARCHITECTURAL_FACT | Booking detail `stressLevel` always null | bookings.service mapper |
| F-11 | **P3** | CONFIRMED_ARCHITECTURAL_FACT | `padHardBrakeAnchors`/`discHardBrakeAnchors` unused; harsh bands used instead | brake-health.config vs service |
| F-12 | **P3** | CONFIRMED_ARCHITECTURAL_FACT | Dead frontend API client methods for driver-score/rolling | frontend api.ts |
| F-13 | **P3** | CONFIRMED_ARCHITECTURAL_FACT | Config comment vs code on p95 decel in braking score | driving-impact.config vs scorer |
| F-14 | **P2** | CONFIRMED_ARCHITECTURAL_FACT | No guaranteed persistence of original HF time series for replay | No Prisma HF table; CH mirror optional/partial (`hf-mirror.service.ts`) |

---

## 23. Open Questions

1. Was PROFILE_INCOMPATIBLE always intended to exclude all non-dominant cohorts regardless of comparability? (Product decision — F-02)
2. Should subject aggregation filter `analysisStatus` and model profile like rolling? (F-08)
3. Should tire behavior factor drop composite term to avoid double exposure? (F-04 — sensitivity validation first)
4. When will four 2026-08-30 vehicle signal inventories land on `main`?
5. Is brake-vs-tire per-trip/rolling split intentional product architecture? (F-03)

**Resolved in evidence review:** Active-trip live polling → **`INDIRECT_TDI_INPUT`** for engine load sub-scores only; event/composite inputs are post-trip (§5.1).

---

## 24. Phase-2 Handoff Items

1. Full snapshot query field inventory vs available-but-not-selected signals (`buildLatestSnapshotQuery`).
2. HF query field inventory + effective cadence per vehicle (`buildHighFrequencyQuery`).
3. Native events pagination + per-vehicle availability matrix.
4. Active-trip live poll **field/cadence matrix** (Phase 2A detail — TDI impact class resolved in §5.1).
5. ClickHouse mirror column map for HF/snapshot when mirror enabled.
6. Merge four vehicle gap-analysis docs when available on `main`.
7. Candidate signals not in current DI path: yaw, steering, lateral accel, wheel speeds, brake pedal.
8. **Flight Recorder / Phase 3:** capture raw HF because Postgres does not guarantee kinematic replay (F-14, §12.1).

---

## 25. Complete Current-State Dependency Map

### Master dependency matrix — all production driving-impact inputs (22 rows)

Legend: **Comp** = composite `drivingStressScore` contribution. **LC** = load component (may not affect composite). **—** = not consumed on that hop.

| # | Input / feature family | Provider / source | Acquisition | Normalization | Persisted representation | Detector / feature | TDI field | Score component | Comp | Rolling / subject | Brake Health | Tire Health | API | UI |
|---|------------------------|-------------------|-------------|---------------|-------------------------|-------------------|-----------|-----------------|------|-----------------|--------------|-------------|-----|-----|
| 1 | Hard acceleration | Native: `behavior.harshAcceleration`; HF: speed deltas | Native events post-trip; HF `1s` post-trip | per100km cap 200; native severity ≥0.6 | `VehicleTrip.hardAccelerationCount`, `DrivingEvent` or HF `TripBehaviorEvent` | native mapper / `detectAccelerationEvents` HARD | `hardAccelPer100Km` | longitudinal | 0.30×long | VDIC, DriverScore | harsh bands (indirect) | behaviorFactor (via long) | trips | stress |
| 2 | Extreme acceleration | Native: `behavior.extremeAcceleration`; HF EXTREME class | Same | per100km; EXTREME ≥0.9 / ≥5 m/s² | counts + event rows | native / HF accel | `extremeAccelPer100Km` | longitudinal | 0.30×long | same | — | via long | trips | — |
| 3 | Kickdown | HF TPS pattern | HF post-trip | per100km | `VehicleTrip.kickdownCount`, `TripBehaviorEvent` ABUSE | `detectKickdown()` | `kickdownPer100Km` | longitudinal | 0.30×long | same | — | engine proxy LC | — | — |
| 4 | Launch-like | HF standstill burst | HF post-trip | per100km | `TripBehaviorEvent` LAUNCH_* | `detectLaunchLikeStart()` | `launchLikePer100Km` | longitudinal | 0.30×long | same | — | trans proxy LC | — | — |
| 5 | Hard braking | Native harsh brake; HF HARD | Native + HF post-trip | per100km | counters, `DrivingEvent`/`TripBehaviorEvent`, ledger | native / `detectBrakingEvents` | `hardBrakePer100Km` | braking | 0.35×brake | VDIC | `harshBrakeWearMultiplier` | behaviorFactor | trips | assessment |
| 6 | Extreme braking | Native extreme; HF EXTREME | Same | per100km | counts + rows | native / HF | `extremeBrakePer100Km` | braking | 0.35×brake | same | harsh bands | via brake | trips | — |
| 7 | Full braking | HF abuse tier ≥7.5 m/s² | HF post-trip | per100km | `fullBrakingCount`, FULL_BRAKING events | `detectFullBrakingAndImpact()` | `fullBrakingPer100Km` | braking + thermal | brake+thermal | same | fullBrake anchors | via stress | — | — |
| 8 | Brakes total / brakesPer100Km | Ledger or classified rows | Post-trip | per100km cap 30 ref | ledger / `TripBehaviorEvent` count | `computeBrakingStatistics` | `brakesPer100Km` | braking + stop-go | 0.35×brake + 0.20×stopGo | VDIC | stop density input | — | trips | — |
| 9 | p95NegativeDecel | HF/native brake row decels | Post-trip | percentile95 | TDI column + braking stats | braking stats | `p95NegativeDecel` | braking + thermal | 0.35×brake + thermal | VDIC | — | — | — | — |
| 10 | highSpeedBrakeShare | Brake row start speed ≥80 km/h | Post-trip | share 0–1 | derived | tag on brake rows | `highSpeedBrakeShare` | high-speed + thermal | 0.15×HS + thermal | VDIC | discHighSpeedFactor | — | — | — |
| 11 | meanBrakeEnergyPerKm | Speed deltas on brake rows | Post-trip | energy/km cap | TDI + stats | `sumBrakeEnergy`/km | `meanBrakeEnergyPerKm` | thermal | thermal only | VDIC | discThermal (indirect) | — | — | — |
| 12 | stopDensity | Stops from brake end speed <5 km/h | Post-trip | cap 12/km | TDI | stop filter on rows | `stopDensity` | stop-go | 0.20×stopGo | VDIC | padStopDensityFactor | — | — | — |
| 13 | cityShare | Mapbox road class | Post-trip route enrich | DERIVED_CONTEXT % | `VehicleTrip.citySharePercent` | `deriveRoadTypeDistribution` | `citySharePct` | stop-go | 0.20×stopGo | VDIC | pad/disc usage | usageFactor | trips | — |
| 14 | highwayShare | Mapbox | Post-trip | DERIVED_CONTEXT % | `highwaySharePercent` | same | `highwaySharePct` | high-speed | 0.15×HS | VDIC | usage factors | usageFactor | trips | — |
| 15 | countryRoadShare | Mapbox | Post-trip | DERIVED_CONTEXT % | `countrySharePercent` | same | `countryRoadSharePct` | — (not in composite blend) | — | VDIC | pad/disc usage | usageFactor | — | — |
| 16 | avgEngineLoad | OBD engine load | Live `fetchPerformance` 15s + post-trip HF context | capLinear 100 | `VehicleTrip.avgEngineLoad` | mean of perf buckets | LC `engineLoad` | LC only | — | — | — | — | — | — |
| 17 | avgRpm | Engine speed | Live perf + HF | capLinear 4500 | `VehicleTrip.avgRpm` | mean perf / HF | LC engine | LC only | — | — | — | — | — | — |
| 18 | avgThrottlePosition | OBD TPS | Live perf + HF | capLinear 100 | `VehicleTrip.avgThrottlePosition` | mean perf | LC engine | LC only | — | — | — | — | — | — |
| 19 | harshCornering | Native `behavior.harshCornering` | Native post-trip | count | `VehicleTrip.harshCornerCount`, `DrivingEvent` | native mapper | — (not in TDI composite) | — | — | — | — | tire trip usage ledger | trips | behavior |
| 20 | measurementCoverage / provenance | HF clean/total; event counts | Post-trip enrich | shares 0–1 | TDI provenance cols, `behaviorSummaryJson` | `buildDrivingImpactSourceProvenance` | `measurementCoverage`, shares, `healthEligibility` | assessability / gates | confidence | merged rolling | publish gate | — | quality API | — |
| 21 | authoritativeDistanceKm | Finalized trip distance | Trip finalize | km | TDI + trip | coverage domain | `authoritativeDistanceKm`, `distanceKm` | normalizer divisor | all per100km | wear allocation | ledger km | — | — |
| 22 | Composite output | Derived from rows 1–15 | `DrivingImpactService` | model `v1.2.0` | `TripDrivingImpact.drivingStressScore` | `computeDrivingStressScore` | `drivingStressScore` | composite | 1.0 | VDIC, DriverScore, RDA | indirect via per-trip metrics | behaviorFactor 0.15× | all trip APIs | stress panels |

Phase 2 will extend this matrix with **AVAILABLE_NOT_QUERIED** DIMO signals and per-vehicle capability classes. Phase 1 scope is **production inputs only** (table above).

---

## 26. Phase-1 Remaining Work

| Item | Status after evidence review (2026-08-30) |
|------|-------------------------------------------|
| Exhaustive call/formula/consumer inventory | **DONE** |
| Every `drivingStressScore` consumer identified | **DONE** |
| All score formulas documented | **DONE** (Formula Book §9) |
| All **production** scoring inputs in dependency matrix | **DONE** (22 rows, §25) |
| Active-trip → TDI relationship | **DONE** — `INDIRECT_TDI_INPUT` (§5.1) |
| Storage / replay claims verified | **DONE** — corrected §12.1 |
| Brake/tire consumer graphs | **DONE** (§15–16) |
| API/UI semantic audit | **DONE** (§17–18) |
| Legacy path search | **DONE** (§19) |
| Test inventory | **DONE** (§20) |
| Phase 1 exit: no hidden scoring path | **DONE** |
| Phase 2 items (DIMO surface, cadence, unused signals, four vehicle inventories) | **OUT OF SCOPE** — not blockers for Phase 1 DONE |

**Phase 1 overall status: DONE** — forensic call graph complete for all production inputs; remaining work is Phase 2+.

---

## Appendix A — `drivingStressScore` Consumer Search Results

**Repo-wide file references:** 78 files.

**Production backend (25):** `driving-impact.service.ts`, `driving-impact-rolling/*`, `driving-impact-model-profile/*`, `driver-score.service.ts`, `trip-api.mapper.ts`, `trip-analytics-canonical.service.ts`, `trip-assessment.*`, `trip-decision-summary.service.ts`, `trips.service.ts`, `vehicle-intelligence.controller.ts`, `health-summary.service.ts`, `tires/tire-wear-model.service.ts`, `tires/tire-trip-usage*.ts`, `customers.service.ts`, `bookings.service.ts`, `rental-driving-analysis/*`, `business-insights/detectors/return-needs-inspection.detector.ts`, `prisma/schema.prisma`

**Production frontend (17):** `api.ts`, `scoreFormat.ts`, `customer-list-ui.ts`, `VehicleStressPanel.tsx`, `RentalStressAnalysisCard.tsx`, `CustomerDrivingTab.tsx`, `CustomersView.tsx`, `CustomerDetailView.tsx`, `CustomerDetailModal.tsx`, `CustomerDecisionCards.tsx`, `NewBookingView.tsx`, `CustomerStep.tsx`, `BookingUsageMisuseTab.tsx`, `trips.types.ts`, `trips-map.types.ts`, `customerDetailTypes.ts`, `ChangesView.tsx`, `ArchitekturView.tsx`

**Worker:** `driving-impact.processor.ts`, `driving-health-impact-publish.handler.ts`

**Tests (13+)** and **docs (11+)** also reference the symbol.

---

## Appendix B — Required symbol search (summary)

| Symbol | Primary hits |
|--------|-------------|
| `drivingStressScore` | 78 files — see Appendix A |
| `drivingStyleScore` | alias in mapper, customers, stats, deprecated |
| `computeDrivingStressScore` | scorer + service |
| `computeDrivingStyleScore` | deprecated alias |
| `TripDrivingImpact` | schema + driving-impact module + workers |
| `driverScore` | service, controller route, frontend types |
| `tireLoad` | load-components JSON |
| `brakeLoad` | brakingLoad component (not separate DB column) |
| `thermalBrakeStress` | scorer + TDI + brake discThermal |
| `hardBrake` / `extremeBrake` / `fullBraking` | HF + native + scorer weights |
| `kickdown` / `launch` | hf-abuse + longitudinal weights |
| `harshAcceleration` / `harshBraking` / `harshCornering` | native DIMO names |

---

*End of Phase 1.1 forensic audit.*
