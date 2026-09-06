# Driving Intelligence — Current State

**Reconstruction maturity:** SUBSTANTIAL (code + audits; HF live calibration incomplete)  
**Audited code baseline:** workspace `main` at authority bootstrap (2026-09-06)

## Executive summary

SynqDrive Driving Intelligence today is a **dual-path post-trip enrichment system** anchored on **DIMO Segment-backed `VehicleTrip` rows**. Production scoring uses **Driving Impact Engine V1** (`drivingStressScore` = vehicle operational load 0–100). A **V2 durable pipeline** exists behind `DRIVING_INTELLIGENCE_V2_ENABLED` (default **false**). **Reference Capture** provides an isolated HF recovery / block-polling laboratory (default **off**, not deployed).

**ARCHITECTURE IMPLEMENTED ≠ HF SCALABILITY HYPOTHESIS VALIDATED.**

## System boundary (confirmed)

| Inside DI | Outside DI (interface only) |
|-----------|----------------------------|
| Post-trip HF fetch + detectors | Trip FSM / `TripDetectionOrchestrationService` |
| `TripBehaviorEvent`, `DrivingEvent` | DIMO segment canonical boundaries |
| `TripDrivingImpact`, load components | Energy Event Detection (REFUEL) |
| V2 stage orchestrator + jobs | Tankstellenerkennung |
| Rental driving analysis | Mapbox route matching (route artifact consumer) |
| Reference capture HF testbed | Raw DIMO auth/token layer |

## Production path today (CONFIRMED)

### 1. Trip completion trigger

```
DIMO segments + Trip FSM
  → VehicleTrip status COMPLETED (persisted)
  → TripEnrichmentOrchestratorService (legacy, always)
  → TripPostFinalizeAnalysisProducer (V2 when master flag on)
```

Sources: `trip-enrichment-orchestrator.service.ts`, `trip-post-finalize-analysis.producer.ts`

### 2. Legacy behavior enrichment (always active)

| Step | Component | Detail |
|------|-----------|--------|
| Queue | `trip.behavior.enrichment` | BullMQ |
| Worker | `trip-behavior-enrichment.processor.ts` | |
| HF fetch | `DimoSegmentsService.fetchHighFrequency()` | DIMO `signals(interval:"1s")` over trip window |
| Preprocess | `hf-preprocessing.ts` | Gap split, clean points |
| Detectors | `hf-acceleration.ts`, `hf-braking.ts`, `hf-abuse.ts` | Point-pair kinematics |
| Native events | `lte-r1-behavior-enrichment.service.ts` | DIMO behavior events for LTE_R1 |
| Persist | `TripBehaviorEvent`, `VehicleTrip` counters | `harshBrakeCount`, `kickdownCount`, etc. |
| Optional mirror | `hf-mirror.service.ts` | ClickHouse when `HF_MIRROR_ENABLED` |

**Skip reasons:** `CAPABILITY`, `INSUFFICIENT_POINTS` (<10 raw / <5 clean), `NO_HF_DATA`

### 3. Legacy impact compute (always active after enrichment)

| Step | Component | Detail |
|------|-----------|--------|
| Queue | `trip.driving-impact.compute` | Also V2 job type `DRIVING_IMPACT_COMPUTE` |
| Service | `DrivingImpactService.computeForTrip()` | Model version `v1.2.0` |
| Scorer | `driving-impact-scorer.ts` | Longitudinal, braking, stop-go, high-speed, thermal, composite |
| Load components | `driving-impact-load-components.ts` | `tireLoad`, `brakingLoad`, etc. — **proxies** |
| Persist | `TripDrivingImpact`, `VehicleDrivingImpactCurrent` | 30-day rolling window |

### 4. V2 pipeline (flag-gated, default OFF)

| Flag | Default |
|------|---------|
| `DRIVING_INTELLIGENCE_V2_ENABLED` | `false` |
| `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED` | `false` |
| `DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED` | `true` (requires master) |
| `DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED` | `true` (requires master) |

When enabled: `DrivingAnalysisInitService` creates `DrivingAnalysisRun` + stages, enqueues `driving.intelligence.jobs`. Stage DAG documented in `KNOWLEDGE_GRAPH.md`. Reconciliation scheduler runs every 10 minutes (leader-gated).

## Signal cadence reality (CONFIRMED from reference drives)

| Concept | Value | Notes |
|---------|-------|-------|
| DIMO query aggregation | `interval:"1s"` | Requested, not observed 1 Hz |
| Observed HF bucket median | **~2s** (RD002/003) | `1s ≠ 1Hz` |
| RD004 sealed median spacing | **~10.6s** | Capture/watermark gaps, not physics |
| Active-trip live poll | ~30s | `ACTIVE_TICK` |
| Reference capture runner | 5s default | `REFERENCE_CAPTURE_CYCLE_INTERVAL_MS` |
| V2 block poll (testbed) | 30s provisional | `HF_HISTORICAL_POLL_INTERVAL_MS` — **NOT VALIDATED** |

Production detectors still assume ~1 Hz in comments (`hf-window-producer.ts`). **Known semantic debt** — not fixed in production path.

## Driving events (CONFIRMED types)

### HF-derived (`TripBehaviorEvent` / abuse)

From `hf-abuse.ts`: `COLD_ENGINE_HIGH_RPM`, `COLD_ENGINE_FULL_THROTTLE`, `ENGINE_SHUTDOWN_WHILE_DRIVING`, `ENGINE_REV_IN_IDLE`, `HIGH_RPM_CONSTANT`, `KICKDOWN`, `LAUNCH_LIKE_START`, `OVERHEATING_ENGINE`, `LONG_IDLE`, `POSSIBLE_IMPACT`, `FULL_BRAKING`

From `hf-acceleration.ts` / `hf-braking.ts`: hard/extreme acceleration and braking classifications

### Native (`DrivingEvent`)

DIMO LTE_R1 `behavior.*` events via `dimo-native-driving-events/`; dedup `(organizationId, providerFingerprint)`

**LTE_R1 authority split (CONFIRMED):** Whole-trip HF pass is **Trip Signal Summary** — sparse for LTE_R1 (median 3–6s). Short-event misuse authority is **native-event-anchored** + event-context enrichment, not HF point-pair alone.

## Driving score / stress model (CONFIRMED V1)

| Output | Semantics |
|--------|-----------|
| `TripDrivingImpact.drivingStressScore` | Composite vehicle load 0–100 |
| `DriverScoreService` | Distance-weighted aggregation of `drivingStressScore` — **misnamed** (vehicle stress, not driver quality) |
| `RentalDrivingAnalysis.drivingScore` | Booking-period aggregate |

Formula: weighted stress dimensions → `capLinear` normalization → composite `computeDrivingStressScore`. Weights in `driving-impact.config.ts`. Rounded to 1 decimal.

**Future V2 episode score (DI-EV-0034F):** NOT IMPLEMENTED in production.

## Tire / brake load (CONFIRMED)

**Operational load proxies — NOT measured wear.**

| Component | Derivation |
|-----------|------------|
| `brakingLoad` | From `brakingStressScore` + braking provenance; may downgrade to `LIMITED` when proxy kinematics dominate |
| `tireLoad` | Composite: `0.35×braking + 0.35×stopGo + 0.30×longitudinal` when assessable |
| `thermalLoad` | From `thermalBrakeStressScore` |

Downstream: `DRIVING_HEALTH_IMPACT_PUBLISH` → `BrakeHealthService.recalculate`, `TireHealthService.recalculate`

## Persistence (CONFIRMED)

| Store | Role |
|-------|------|
| **PostgreSQL** | Canonical: trips, events, impact, V2 runs/jobs/stages, assessability, evidence, rental analysis |
| **ClickHouse** | Optional analytics mirror (`telemetry_hf_*`, waypoints) — not canonical |
| **Redis/BullMQ** | Async orchestration; durable state in `DrivingIntelligenceJob` |

**No raw HF time series in Postgres** (CONFIRMED). Optional CH mirror only.

## API / UI consumers (CONFIRMED)

| Surface | Data |
|---------|------|
| `vehicle-intelligence.controller.ts` | Trips, impact, events, assessability, driver scores |
| `rental-driving-analysis.controller.ts` | Booking analyses |
| `RentalStressAnalysisCard`, `VehicleStressPanel` | Stress display |
| `CustomerDrivingTab`, `BookingUsageMisuseTab` | Rental driving context |
| Grafana `synqdrive-driving-intelligence-v2.json` | Ops metrics |

## HF / reference capture status (DI-EV-0035C)

| Item | Status |
|------|--------|
| V2 recovery policy (8s settlement, 6s overlap) | IMPLEMENTED in reference-capture; default OFF |
| Block polling 30s (C.1) | IMPLEMENTED testbed; `HF_30S_BLOCK_POLLING_VALIDATED = NO` |
| Multi-cadence calibration (C.1c–e) | IMPLEMENTED; live canary not executed |
| Production post-trip HF | **UNCHANGED** — still whole-trip `fetchHighFrequency` |

## Multi-tenancy (CONFIRMED)

- V2 tables: direct `organizationId`
- `DrivingEvent`, `TripDrivingImpact`: nullable `organizationId`; effective scope via `vehicle.organizationId`
- `VehicleTrip`: scoped via vehicle join; repositories assert org
- ClickHouse: `org_id` on all mirror tables

## Known limitations

1. HF assumed ~1 Hz in production detectors; runtime ~2s median
2. No Postgres raw HF replay — re-enrichment re-fetches DIMO
3. V2 pipeline not production-validated at fleet scale
4. `DriverScoreService` naming contradicts vehicle-stress semantics
5. `profilesComparable()` rolling aggregate defect (pre-existing, open)
6. Fleet HF request rate / cost: **NOT BENCHMARKED**

## Unresolved validation items

- Live 10/20/30/60s HF calibration phases on operator-selected vehicle
- `HF_RECOVERY_POLICY_V2_ENABLED` production canary
- V2 full stage DAG under production load
- Natural fleet-scale block polling density proof

## Coverage classification

| Area | Status |
|------|--------|
| Legacy enrichment + impact | CONFIRMED |
| V2 code paths | CONFIRMED (flag off) |
| HF recovery runtime | PARTIALLY RECONSTRUCTED |
| Episode V2 scoring | NOT IMPLEMENTED |
| Fleet scalability numbers | UNKNOWN |
| Production V2 E2E | NOT YET PRODUCTION-VALIDATED |
