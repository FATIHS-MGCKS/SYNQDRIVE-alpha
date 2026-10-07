# Driving Intelligence — Current State

**Reconstruction maturity:** SUBSTANTIAL (code + audits; first live multi-cadence calibration executed — cadence conclusion open)  
**Audited code baseline:** workspace `main` at authority bootstrap (2026-09-06)

## Executive summary

SynqDrive Driving Intelligence today is a **dual-path post-trip enrichment system** anchored on **DIMO Segment-backed `VehicleTrip` rows**. Production scoring uses **Driving Impact Engine V1** (`drivingStressScore` = vehicle operational load 0–100). A **V2 durable pipeline** exists behind `DRIVING_INTELLIGENCE_V2_ENABLED` (code default **false**; **Production sets `true`** — read-only env check EXP-021 C1D.10 / C1D.10A, 2026-09-27; 778 V2 `NATIVE_EVENTS` stages COMPLETED in 60 days). **Reference Capture** provides an isolated HF recovery / block-polling laboratory.

**ARCHITECTURE IMPLEMENTED ≠ HF SCALABILITY HYPOTHESIS VALIDATED.**

### Production deployment semantics (post PR #1533, 2026-09-05)

| Term | Value |
|------|-------|
| **CODE_DEPLOYED** | **YES** — HF Recovery policy + C.1a–e on `main` / production binary |
| **REFERENCE_CAPTURE_INFRASTRUCTURE** | **ENABLED** on production (`REFERENCE_CAPTURE_ENABLED=true` post 3A.2) |
| **REFERENCE_CAPTURE_SETTLEMENT_SHADOW** | **ENABLED** on production post EXP-021D (`REFERENCE_CAPTURE_SETTLEMENT_SHADOW_ENABLED=true`, 2026-09-07) — forensic experiment channel only; no auto-start |
| **HF_RECOVERY_V2_FEATURE_ENABLED** | **NO** — `HF_RECOVERY_POLICY_V2_ENABLED=false` |
| **LIVE_CANARY_EXECUTED** | **NO** — empty canary allowlist; zero active calibration sessions (post GATE 2 baseline restored) |
| **DI-DEF-019** | **FIXED_PRODUCTION_VALIDATED** — GATE 1 PG integration + GATE 2 stationary dress rehearsal (2026-09-06) |
| **LIVE_MULTI_CADENCE_CALIBRATION** | **EXP-019 + EXP-020 (2026-09-07)** — video GT + bias-control; **window geometry matrix**: W060–W300 identical union; P50 first-obs ~27s; post-trip P1 optimal; **NO cadence winner** |
| **HF_30S_BLOCK_POLLING_VALIDATED** | **NO** |
| **Production HF authority** | **LEGACY** — whole-trip `fetchHighFrequency`; Recovery V2 **not active** |

Do **not** say "HF Recovery V2 not deployed" — say **code deployed, feature disabled**. Detail: `evidence/production/DEPLOYMENT_STATE.md`.

**Cross-authority handoff (TDL-OQ-001, 2026-09-25):** Trip Detection invokes `TripPostFinalizeAnalysisProducer` after persisted `COMPLETED`; DI owns `initializeForCompletedTrip`, durable runs/jobs, BullMQ `driving.intelligence.jobs`, and `DrivingAnalysisReconciliationService` recovery. Evidence: [TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md](../trip-detection-lifecycle/evidence/TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md) (TDL-EVID-OQ001-HANDOFF-001). Verdict: **`RESOLVED_WITH_BOUNDED_GAPS`** (not DB⊕queue atomic).

### DI V0 shadow pure core (EXP-021 C1D.5 S0/S1 — 2026-09-26)

| Item | State |
|------|-------|
| **Path** | `backend/src/modules/vehicle-intelligence/driving-intelligence/core/` |
| **Runtime caller** | **None** — library only; not registered in Nest workers |
| **Contract** | `DI_SOURCE_QUALITY_CONTRACT_V0_1` + `DI_KINEMATIC_ESTIMATE_V0_1`; calibration `CALIBRATION_UNSET_V0` (injected bundle) |
| **L3** | Centred-path haversine mean × 3.6; support labels **calendar** t−1 s, t, t+1; all FRESH; no hold/release/gap |
| **Invariant** | Driving Intelligence derives claims only from evidence whose availability, temporal semantics, source family and provenance are explicit; unsupported point values are withheld |
| **Shadow persistence (S2)** | `di_v0_shadow_runs` + `di_v0_shadow_intervals` — **library + Prisma only**; tenant identity verified at write boundary; DB CHECK constraints; tx-scoped persistence; completion counts derived from stored intervals; no runtime caller; not customer-facing. **Production schema PRESENT (corrected C1D.10A):** migration `20260926193000_di_v0_shadow_persistence` applied 2026-09-26 23:46:11 UTC by the ordinary deploy of release `20260926234014_v4994` (`1b5a7f6c`, PR #1801 — `vps-deploy-release.sh` always runs `prisma:migrate:deploy`); **0 runs / 0 intervals, 0 inserts ever** (`pg_stat_user_tables`). Schema present ≠ S4 runtime active ≠ shadow runs executed ≠ customer-visible use — DI V0 stays **dormant**. Evidence: [EXP021_C1D10A_AUTHORITY_CORRECTION.md](evidence/EXP021_C1D10A_AUTHORITY_CORRECTION.md); contradiction DI-CONTRA-S2-PROD-MIGRATION-001 (RESOLVED) |
| **Position acquisition (S3A)** | `driving-intelligence/position-acquisition/` — **dormant library only** (C1D.7, **PR #1800 merged**): DIMO `signals(interval:"1s")` `currentLocationCoordinates(agg: AVG)` via shared auth + telemetry transport adapter (not Nest-registered); strict `[from, to)` 1 s grid; PRESENT / SIGNAL_NULL / ROW_ABSENT kept distinct; BUCKET_BOUNDED only; coordinate validation (0,0 valid); duplicate fail-safe; source family via canonical `telemetry-source-family.ts` (never `hardwareType`); SHA-256 **DI_NORMALIZED_INPUT_IDENTITY** → S2 `inputEvidenceVersion` (not a raw provider archive); typed redacted failures, no self-retry; **no runtime caller**, **no DB write**, **no customer effect**. C1G: **DI-GAP-S3A-AGG-001 PARTIALLY_CLOSED** — 26,629/26,629 buckets AVG=FIRST=LAST coordinates (0 m); RUPTELA_R1 multi-vehicle; API_SYNTHETIC n=1; AVG unchanged. **Provider historical mutability observed** (C0 re-query: HDOP/altitude changed); **live re-query ≠ replay** — reproducible DI requires pinned normalized snapshot. Future S4 caller must pass org/vehicle/token from one validated vehicle context. Evidence: [EXP021_C1D7_S3A_INPUT_NORMALIZATION_REPORT.md](evidence/EXP021_C1D7_S3A_INPUT_NORMALIZATION_REPORT.md) |
| **R1 OBD evidence (S3B-A)** | `driving-intelligence/r1-obd-acquisition/` — **dormant library only** (C1D.8, hardened C1D.8B, merged PR #1805; field authority corrected C1D.9A): DIMO HF OBD subset over 1 s grid, query **`DI_V0_R1_OBD_QUERY_V0_3`** — exactly 5 fields, all `agg: AVG`, all **PROVIDER_SCHEMA_VERIFIED** (C1D.9: DIMO telemetry GraphQL introspection + DIMO VSS 4.2 spec + read-only R1 responses): speed km/h, rpm, throttle percent 0..100, engine load percent 0..100, ECT °C (no rescaling, no range thresholds). **`powertrainTransmissionCurrentGear` removed** (signed int8 index — AVG synthesizes non-existent / false-Neutral gears; 0/4 R1 devices expose it) and **`isIgnitionOn` excluded** (boolean exposed as Float). Five-field activation allowlist is architectural authority for future S4 (activates nothing). Provider field authority does **not** upgrade time authority: **INTERVAL_ONLY**; per-signal VALUE_PRESENT / SIGNAL_NULL / ROW_ABSENT / **CONFLICTING_DUPLICATE** (duplicate labels merged per signal — agreement collapses, disagreement withheld with distinct values preserved; no first-row-wins, no averaging); **RUPTELA_R1 only**; no fixed time correction; cannot override S3A→S1 L3 (FULL-R1-002 golden-bound HOLD / RELEASE / post-release tests); SHA-256 R1 snapshot **V0_3** (adapter V0_3; V0_2 identifiers superseded, never aliased). **No runtime caller / DB write.** Evidence: [EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md](evidence/EXP021_C1D8_S3B_R1_OBD_NATIVE_EVENT_ADAPTERS.md), [EXP021_C1D8B_S3B_CONTRACT_HARDENING.md](evidence/EXP021_C1D8B_S3B_CONTRACT_HARDENING.md), [EXP021_C1D9_R1_FIELD_AUTHORITY_V03_CORRECTION.md](evidence/EXP021_C1D9_R1_FIELD_AUTHORITY_V03_CORRECTION.md). Gap: DI-GAP-S3B-R1-FIELD-AUTHORITY-001 **PARTIALLY_CLOSED** (residual: gear) |
| **Native event evidence (S3B-B)** | `driving-intelligence/native-event-evidence/` — **dormant library only** (C1D.8, hardened C1D.8B): normalizes `DrivingEvent`-shaped records; **NATIVE_EVENT_OBSERVATION**; calibration fixed **UNCALIBRATED** max claim **L1** — **not caller-suppliable** (no trusted-authority object exists); expected context (org / vehicle / trip / window / family / provider) passed separately and enforced per record → **CONTEXT_MISMATCH** (L0, audited in snapshot; null org/trip/provider = unprovable); eventId dedup → identical collapse / **CONFLICTING_DUPLICATE** (L0, preserved); source envelope → **NO_EVENT** only for a successful empty read, **EVENT_SOURCE_FAILURE** otherwise (`readDiV0NativeEventSource` = future S4 boundary); unknown types → **UNKNOWN_NATIVE_EVENT**; native-event fusion remains **NEEDS_VALIDATION**. Combined input identity **V0_2** pins all three channels with explicit state (PRESENT / NO_EVENT / SOURCE_FAILURE / NOT_AVAILABLE). **No runtime caller / DB write.** |
| **Next slice** | **S4 shadow runtime orchestration** — worker/caller wiring to pin position + R1 OBD + native snapshots into combined `inputEvidenceVersion` V0_2 (must supply native expected context + source envelope) — **not started, not authorized**. Gates after C1D.9A: design READY; position-only runtime READY; R1 five-field runtime READY_FOR_SHADOW_ORCHESTRATION_DESIGN (not Production/customer activation); native STRUCTURALLY_READY_UNCALIBRATED. **C1D.10A (2026-09-27): S4A contract FROZEN (design only)** — [design/s4a/S4A_CONTRACT_DESIGN.md](design/s4a/S4A_CONTRACT_DESIGN.md), machine contract `design/s4a/s4a-contract.v1.json` (`scripts/validate-s4a-contract.sh`). **AMENDED BY C1D.10C (2026-09-27):** current machine contract is **`design/s4a/s4a-contract.v2.json` (`DI_V0_S4A_CONTRACT_V2`)**; v1 kept as history and rejected by the v2 validator. C1D.10C closes C1D.10B P1-A..P1-D: S2 execution identity `DI_V0_S4_EXECUTION_IDENTITY_V1` (all execution-defining fields → S2 `inputEvidenceVersion`, collision with different identity fails closed); tenancy authority **TRIP_VEHICLE_ORGANIZATION** (`vehicle_trips` → `vehicles.organization_id`; `vehicle_trips.organization_id` does not exist); control plane [design/s4a/S4A_CONTROL_PLANE.md](design/s4a/S4A_CONTROL_PLANE.md) (6 flags default OFF, EMPTY=NONE intersected allowlists, DB kill row missing=KILLED, pipeline registry + retirement); 13-transition state machine with DB-clock lease expiry on every holder write; red-team validator 47 negative / 21 positive cases, 0 false accepts / 0 false rejects. Evidence: [EXP021_C1D10C_AUTHORITY_CLOSURE.md](evidence/EXP021_C1D10C_AUTHORITY_CLOSURE.md). S4A implementation **not authorized** (separate slice); tiny activation blocked (deserializer, provider backpressure gaps OPEN). Native channel **fails closed** (no readiness authority → `NOT_READY`, never `NO_EVENT`; DI-GAP-S4-NATIVE-READINESS-001); PRIMARY after 24 h boundary quiet period + 10-day drift horizon; replay only from pinned normalized snapshots; combined input identity V0_3 (design). **AMENDED BY S4A (2026-09-28, PR #1816 merged `2c321823a`):** dormant execution foundation on `main` from contract v2 — migration `20260927200000_di_v0_s4a_dormant_foundation` + library `driving-intelligence/s4a-foundation/` (**0 runtime call sites**). 175/175 S4A tests incl. 51 real-Postgres race/kill tests. Evidence: [EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md](evidence/EXP021_S4A_DORMANT_FOUNDATION_IMPLEMENTATION.md); decision DI-DEC-V0-S4A-IMPL-001 (PROPOSED). **Deploy gate (2026-09-28):** `S4A_DORMANT_MIGRATION_DEPLOY_GATE=READY_FOR_SEPARATE_OPERATOR_DEPLOY_DECISION` (not deploy-now) — Postgres CI wired [EXP021_S4A_POSTGRES_CI_WIRING.md](evidence/EXP021_S4A_POSTGRES_CI_WIRING.md); prior `DO_NOT_DEPLOY` superseded [EXP021_S4A_POST_MERGE_DEPLOY_GATE.md](evidence/EXP021_S4A_POST_MERGE_DEPLOY_GATE.md). **Next slice:** S4B-1 **discovery + claim orchestration** implemented dormant (`s4b-orchestration/`, `DiV0S4bOrchestrationModule` **not** AppModule-registered; evidence [EXP021_S4B_ENGINEERING_START.md](evidence/EXP021_S4B_ENGINEERING_START.md)); S4C provider acquisition + S4D/E/F **not authorized**; Production S4 execution **not authorized** |

## System boundary (confirmed)

| Inside DI | Outside DI (interface only) |
|-----------|----------------------------|
| Post-trip HF fetch + detectors | Trip FSM / `TripDetectionOrchestrationService` |
| **`DrivingAnalysisInitService` + `driving.intelligence.jobs`** | **`TripDecisionEngine.finalizeTrip()` COMPLETED commit** (TDL owns) |
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

### 4. V2 pipeline (flag-gated, code default OFF — Production ON)

| Flag | Default |
|------|---------|
| `DRIVING_INTELLIGENCE_V2_ENABLED` | `false` (code default, `driving-intelligence-v2.config.ts`); **Production env: `true`** (C1D.10A read-only) |
| `DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED` | `false` |
| `DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED` | `true` (requires master) |
| `DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED` | `true` (requires master) |

When enabled: `DrivingAnalysisInitService` creates `DrivingAnalysisRun` + stages, enqueues `driving.intelligence.jobs`. Stage DAG documented in `KNOWLEDGE_GRAPH.md`. Reconciliation scheduler runs every 10 minutes (leader-gated).

## Signal cadence reality (CONFIRMED from reference drives)

| Concept | Value | Notes |
|---------|-------|-------|
| DIMO query aggregation | `interval:"1s"` | Requested, not observed 1 Hz |
| Observed HF bucket spacing (RD003) | **~2.00s** median new physical samples | `1s ≠ 1Hz`; RD003 signal quality |
| Observed HF bucket spacing (RD002 sealed) | **P50 13.489s** (P95 84.024s; MAX 249.647s) | Sealed 71-row HF_HISTORICAL export — **not** ~2s |
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

**LTE_R1 authority split (CONFIRMED):** Whole-trip HF pass is **Trip Signal Summary** — sparse and **variable** on LTE_R1 (see `evidence/signal-inventory/CADENCE_DENSITY.md`: RD002 sealed P50 **13.489s**; RD003 HF **~2.00s**; do not combine). Short-event misuse authority is **native-event-anchored** + event-context enrichment, not HF point-pair alone.

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

## HF / reference capture status (DI-EV-0035C → C.1e)

| Item | Status |
|------|--------|
| V2 recovery policy (8s settlement, 6s overlap) | CODE on prod binary; **FEATURE OFF** |
| Block polling 30s (C.1) | CODE on prod binary; **NOT VALIDATED** live |
| Multi-cadence calibration (C.1c–e) | CODE on prod binary; **GATE 2 lifecycle validated** (stationary); scientific live cal **NOT EXECUTED** |
| Production post-trip HF | **LEGACY UNCHANGED** — whole-trip `fetchHighFrequency` |
| Operator-selected calibration | Infrastructure ready; **DI-DEF-019 unblocked** — physical 10/20/30/60 drive authorized as separate experiment |

## Multi-tenancy (CONFIRMED)

- V2 tables: direct `organizationId`
- `DrivingEvent`, `TripDrivingImpact`: nullable `organizationId`; effective scope via `vehicle.organizationId`
- `VehicleTrip`: scoped via vehicle join; repositories assert org
- ClickHouse: `org_id` on all mirror tables

## R1 temporal-safety containment — ACTIVE CONTAINMENT (EXP-021 C0.3, 2026-09-24)

**Status:** C0.3 merged/deployed (`e30de759…`, release `20260924201136_v4994`). C0.5 CG-01 extension in draft PR (not deployed). **Not** the final source-quality architecture.

| Constraint | Current behaviour (branch) |
|------------|----------------------------|
| 1. Integration identity | `resolveTelemetrySourceFamily(DimoVehicle.rawJson)` → `RUPTELA_R1` (serial `R1-`) / `API_SYNTHETIC` / `UNKNOWN` (fail closed). `hardwareType` never consulted (Tesla is `LTE_R1`: DI-CONTRA-HARDWARE-TYPE-INTEGRATION-001) |
| 2. No R1 point-deceleration abuse | Future `FULL_BRAKING` / `POSSIBLE_IMPACT` suppressed; existing rows omitted from event list, excluded from ledger summary FULL count, impact, brake wear, counters |
| 3. No R1 OBD-only engine-shutdown claim | `ENGINE_SHUTDOWN_WHILE_DRIVING` not derived for R1 (fail closed; no 2-record ≥3 s proof path) |
| 4. No exact-time context claims for R1 | Presentation nulls anchor-relative values, caps confidence LOW, adds `temporalContainment` marker; persisted assessment unchanged |
| 5. No R1-only misuse escalation | R1 OBD-derived evidence tagged `temporalProvenance`; uncertain-only ≤ WARNING / MEDIUM + proxy-only lifecycle (REVIEW_REQUIRED preserved); mixed capped by independent support |
| 6. CG-01 — no R1 cold+full-throttle conjunction claim | `COLD_ENGINE_FULL_THROTTLE` in contained HF abuse set (C0.5): future suppression, read-model omission, marker-aware counter adjustment; misuse rule skips R1-only full-throttle rows (`COLD_ENGINE_HIGH_RPM` unchanged) |

No historical row, ledger row, misuse case, score or ClickHouse data is modified. Residual consumers: DI-GAP-R1-CONTAINMENT-RESIDUAL-001. Wording debt (12 sites): DI-GAP-R1-OVERCLAIM-WORDING-001. Record: `evidence/reference-capture/EXP_021_C03_R1_TEMPORAL_CONTAINMENT_2026-09-24.md`.

## Known limitations

1. HF assumed ~1 Hz in production detectors; RD003 ~2s median; RD002 sealed P50 13.489s
2. No Postgres raw HF replay — re-enrichment re-fetches DIMO
3. V2 pipeline not production-validated at fleet scale
4. `DriverScoreService` naming contradicts vehicle-stress semantics
5. `profilesComparable()` rolling aggregate defect (pre-existing, open)
6. Fleet HF request rate / cost: **NOT BENCHMARKED**
7. R1 historical OBD record time is uncertain (EXP-021 C0.1); point-in-time claims are **contained**, not corrected (DI-DEF-020 OPEN)

## Unresolved validation items

- Live 10/20/30/60s HF calibration — **EXP-019 + EXP-020 complete**; **EXP-021 UPPER_BOUND_V2** first physical run **2026-09-11**; **EXP-021 CANDIDATE_BRACKET_V3** first physical run **2026-09-12** (KS MS 661; frozen evidence PR #1618) — **code defects confirmed** (transient plan fallback → mixed UPPER_BOUND_V2/V3 provenance; 8 **EXPECTED_SLOTS_NEVER_CREATED**; 90s/60s settlement 9 vs 19 windows; stale `DEGRADED_LOW_MOVEMENT` on 120s despite 454.7s movement); **correction pass 2026-09-12** (PR #1621, deployed `067af8f`) implements durable `calibrationPlanId`/`calibrationPlanVersion` at arm, plan-aware slot init + settlement + scientific-status recompute; **next physical run** = **CANDIDATE_SHORT_AB_90_60** on **WOB L 7503** (`19fedd4b-…`, token **192922**) per frozen PR #1618 minimum experiment (90→60 only, omit 120s anchor); plan registered as `EXP021_CANDIDATE_SHORT_AB_90_60` — **prospective, not yet deployed**; 180s historical evidence only; 90s epistemic **UNKNOWN/PROSPECTIVE** (KS MS 661 UPPER_BOUND_V2 run `d633da9d-…`; corrected forensic evidence `EXP_021_KS_MS_661_UPPER_BOUND_V2_FULL_POST_RUN_FORENSIC_2026-09-11.md` + audit JSON; freeze `EXP_021_KS_MS_661_UPPER_BOUND_V2_EVIDENCE_FREEZE_2026-09-11.md`; **READY_TO_CHOOSE_PRODUCTION_CADENCE=NO**; false physical-end root cause fixed in merged PR #1606); 180/120 **DEGRADED_INSUFFICIENT_REQUESTS** (~4/3 HF polls vs 5 slots); 60/30 invalid (operator stopped ~26.2 min); settlement FIXED_INTERVAL 48/48; gap join 4/44 assessable under legacy A/B geometry (**historical only**); post-run hardening PR #1604 correction pass: **strict deterministic slot-only HF gating** (ISSUED reserved before provider I/O), physical-end-early terminalization preserving completed phases, final-phase wall-clock seal without fresh telemetry, `validMovementDurationMs` persistence, **full-phase overlapping 60s settlement tiles** (62 tiles × 6 ages = **372 queries**; synthetic gap assessability **100%** at ≥10s); legacy 120s-stabilized tiling retained for evidence parse only (25 tiles / 75.76% nominal minutes); WHOLE_TRIP **BLOCKED_BY_EXTERNAL_TRIP_FSM_WORKSTREAM**
- **EXP-021 autonomous orchestrator (PR #1649):** canonical `Exp021AutonomousLifecycleDriver` shared by production orchestrator + controlled-time regression; parallel in-memory harness **removed**; gate **PASS** (55 unit tests); Postgres integration opt-in with compile fix; PR **#1645 merged** (KS MX forensic frozen); **READY_FOR_NEXT_PHYSICAL_90_60_RUN=NO** until human sign-off — authority `EXP_021_AUTONOMOUS_ORCHESTRATOR_SHORT_AB_REGRESSION_2026-09-14.md`
- `HF_RECOVERY_POLICY_V2_ENABLED` production canary
- V2 full stage DAG under production load
- Natural fleet-scale block polling density proof

## 2026-09-19 — EXP-021 multi-vehicle enrollment authority gap (WOB live drive)

Post PR #1694 three-vehicle cohort activation, WOB L 7503 trip `c0889036-db0b-4e95-a1f0-11ecb722ce17` failed at `armOngoingTrip` with `enrollment_not_found` (only KS MX 2024 had `exp021_study_enrollments`). Live activation disabled pending idempotent cohort study-enrollment bootstrap (`EXP_021_COHORT_STUDY_ENROLLMENT_AUTHORITY_CLOSURE_2026-09-19.md`). Failed ledger immutable; no backfill.

### DI V0 S4F observability (EXP-021 S4F-1 — 2026-09-30)

| Item | State |
|------|-------|
| **Path** | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/` |
| **Runtime** | **Dormant** — read-only reconciliation + `DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1`; no AppModule, scheduler, or provider calls |
| **Beyond 10d drift** | Report-only boundary mismatch count (no T11) |
| **Diagnostic pagination** | Keyset authority `SCAN_WATERMARK_CREATED_AT_THEN_SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID` (frozen scan population) |
| **Read DB surface** | `DiV0S4fReadDb` = `$queryRaw` only; F32 READ ONLY on tx client |
| **Provider backpressure** | **DI-GAP-S4-PROVIDER-BACKPRESSURE-001 CLOSED** (S4F-2 remote Redis certification run 36735099353); global cooldown blocks all priorities per P1.3 |
| **Runtime (repo main post S4F-7A)** | `DiV0S4RuntimeModule` via `VehicleIntelligenceModule` — S4B/S4E/S4F wired; one S4C executor registered at bootstrap. **Control-plane dormant** when all S4 env flags OFF + missing/invalid `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` + Production kill row missing/KILLED. **Production** @ `8fa531b27…` still **without** this wiring until a future deploy. |
| **Tiny activation** | Evaluator fail-closed; frozen gates: five non-operator gates **SATISFIED**; **explicit operator authorization NOT_SATISFIED** → **NOT_READY** (5/6). Production env S4 flags off; `di_v0_s4_control` **GLOBAL row KILLED** (explicit fail-closed authority since S4F-7H). NO_BACKFILL: `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` required for PRIMARY discovery. |
| **Dormant deploy preflight (S4F-7B)** | Read-only VPS/DB audit **2026-10-02**: Production @ `8fa531b27…` → target `ee958854…` (**15** commits, **0** new migrations); **DORMANT_DEPLOY_READINESS=PASS** — separate authorization required for exact-SHA deploy ([EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md](evidence/EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md)). |
| **Exact-SHA authorization gate (S4F-7C)** | Read-only gate **2026-10-02**: frozen target `ee958854…` (not `main` `b7d77643…`); Production stayed `8fa531b27…`; **PASS**; deploy **not** authorized in gate ([EXP021_S4F7C_EXACT_SHA_DORMANT_DEPLOY_AUTHORIZATION_GATE.md](evidence/EXP021_S4F7C_EXACT_SHA_DORMANT_DEPLOY_AUTHORIZATION_GATE.md)). |
| **Dormant exact-SHA Production deploy (S4F-7D)** | **2026-10-02**: Human-authorized deploy to **`ee958854…`** only; release **`20261002014651_v4994`**; S4 runtime **registered**, env unchanged, GLOBAL row **missing**, S4 counts **0** — **PASS** ([EXP021_S4F7D_DORMANT_PRODUCTION_DEPLOY_RESULT.md](evidence/EXP021_S4F7D_DORMANT_PRODUCTION_DEPLOY_RESULT.md)). |
| **DB GLOBAL kill init preflight (S4F-7E)** | **2026-10-02** read-only: Production still `ee958854…`; GLOBAL **missing** → **KILLED_FAIL_CLOSED**; initializer semantics **safe**; wrapper missing → **`DB_KILL_INITIALIZATION_READINESS=BLOCKED`** ([EXP021_S4F7E_DB_KILL_INITIALIZATION_PREFLIGHT.md](evidence/EXP021_S4F7E_DB_KILL_INITIALIZATION_PREFLIGHT.md)). |
| **Attestation deploy isolation (S4F-7N)** | 2026-10-03: read-only Production prestate confirmed @ `ee958854…`; main is **not** attestation-only deploy target (Battery migration + unrelated runtime). **Recommend** minimal release = Production SHA + S4F-7M four-file runtime only — separate human authorization required ([EXP021_S4F7N_PRODUCTION_ATTESTATION_DEPLOY_ISOLATION_AUDIT.md](evidence/EXP021_S4F7N_PRODUCTION_ATTESTATION_DEPLOY_ISOLATION_AUDIT.md)). |
| **Minimal attestation RC (S4F-7O)** | 2026-10-03: sealed deploy candidate **`9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4`** (`release/exp021-s4f7o-minimal-attestation-rc1`, parent `ee958854…`, **4 files only**). **Not** merged to main; future dormant attestation deploy must pin this SHA ([EXP021_S4F7O_MINIMAL_ATTESTATION_RELEASE_CANDIDATE_SEAL.md](evidence/EXP021_S4F7O_MINIMAL_ATTESTATION_RELEASE_CANDIDATE_SEAL.md)). |
| **Exact-RC deploy preflight (S4F-7P)** | 2026-10-03: read-only Production preflight merged **#1898** — observations **PASS** for RC `9d286e58a…` @ Production `ee958854…` / `20261002014651_v4994`; attestation metric absent (expected); historical readiness **corrected**: `REPLICA_A_ATTESTATION_GATE_BEFORE_B=NO`, `DEPLOY_WRAPPER_REMEDIATION_REQUIRED=YES`, `EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT_READY=NO`, `FINAL_RESULT=BLOCKED_PENDING_DEPLOY_GUARD_AND_MIGRATION_COMPATIBILITY_PROOF`; **no** deploy authorization ([EXP021_S4F7P_EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT.md](evidence/EXP021_S4F7P_EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT.md)). |
| **Exact-RC deploy guard (S4F-7Q)** | 2026-10-03: merged main @ `7895bdf0…`; opt-in PRESTATE gate + disposable migration rehearsal **PASS** ([EXP021_S4F7Q_EXACT_RC_DEPLOY_GUARD_ENGINEERING.md](evidence/EXP021_S4F7Q_EXACT_RC_DEPLOY_GUARD_ENGINEERING.md)). Post-merge: target-release sourcing left gate unreachable for real RC deploy — **S4F-7R** controller bridge required before Production authorization. |
| **Deploy controller bridge (S4F-7R)** | 2026-10-03: separate immutable **deploy-controller** SHA (`release/exp021-s4f7r-deploy-controller-rc1` @ `8a18bb6e…`); guarded deploy sources orchestration/attestation from `SYNQDRIVE_DEPLOY_CONTROLLER_ROOT` + `EXPECTED_DEPLOY_CONTROLLER_SHA`; runtime RC `9d286e58…` unchanged ([EXP021_S4F7R_IMMUTABLE_DEPLOY_CONTROLLER_AUTHORITY_BRIDGE.md](evidence/EXP021_S4F7R_IMMUTABLE_DEPLOY_CONTROLLER_AUTHORITY_BRIDGE.md)). |
| **Final exact-controller preflight (S4F-7S)** | 2026-10-06: read-only Production preflight — **BLOCKED** (`CURRENT_PRODUCTION_SHA=0c19eb62…`, not frozen `ee958854…`); disposable RC migrate rehearsal **PASS** on 404-row DB; controller CLI preflight **PASS**; **no** deploy authorization ([EXP021_S4F7S_FINAL_EXACT_CONTROLLER_PRODUCTION_DEPLOY_PREFLIGHT.md](evidence/EXP021_S4F7S_FINAL_EXACT_CONTROLLER_PRODUCTION_DEPLOY_PREFLIGHT.md)). S4F-7S frozen contract **not** retroactively passed. |
| **Attestation supersession closure (S4F-7T)** | 2026-10-06: read-only reverify @ `0c19eb62…` / `20261006064327_v4994` — both replicas **PRESTATE** fingerprint `b648908a…`; attestation files byte-identical to S4F-7M + historical RC; runtime RC **`SUPERSEDED_DO_NOT_DEPLOY`**; controller `8a18bb6e…` **not** authorized for execution; `S4F7S_BLOCKER_RESOLUTION=DEPLOY_NO_LONGER_REQUIRED`; **`FINAL_RESULT=PASS_SUPERSEDED_NO_DEPLOY_REQUIRED`** ([EXP021_S4F7T_CURRENT_PRODUCTION_ATTESTATION_SUPERSESSION_CLOSURE.md](evidence/EXP021_S4F7T_CURRENT_PRODUCTION_ATTESTATION_SUPERSESSION_CLOSURE.md)). |
| **Fresh Tiny staging authority (S4F-7U)** | 2026-10-06: read-only Production preflight — PRESTATE attestation **PASS**; fresh `FRESH_TINY_NOT_BEFORE=2026-10-06T18:33:26.610Z` + fingerprint `9abb1a57…` (**v1 `OTHER`**, **expired** — evidence only); old cutoff would expose **14** completed trips; current S4F-7J tooling frozen to S4F-7I cutoff → **`S4F7V_REQUIRED=YES`**; **no** env write ([EXP021_S4F7U_FRESH_TINY_STAGING_AUTHORITY_PREFLIGHT.md](evidence/EXP021_S4F7U_FRESH_TINY_STAGING_AUTHORITY_PREFLIGHT.md)). |
| **Fresh fingerprint Tiny staging tooling (S4F-7V)** | 2026-10-07: engineering-only fresh path `di-v0-s4-stage-tiny-fresh-production.sh` + `di-v0-s4-fresh-tiny-staging-production/*` — pinned fresh authority (≤900 s DB clock), internal nine-key fingerprint, v1 **`OTHER`** primary proof, exact-three-key mutation contract, dry-run + transaction state machine tests; historical S4F-7J wrapper **unchanged**; **no** Production execution; Gate 6 **NOT_SATISFIED** ([EXP021_S4F7V_FRESH_FINGERPRINT_TINY_STAGING_TOOLING_ENGINEERING.md](evidence/EXP021_S4F7V_FRESH_FINGERPRINT_TINY_STAGING_TOOLING_ENGINEERING.md)). |
| **Production kill init wrapper (S4F-7F)** | Merged **#1882** @ `0b0eac19…`. **S4F-7G** dry-run **PASS**; **S4F-7H**: GLOBAL **KILLED** @ `ee958854…`. **S4F-7I** (2026-10-02): read-only Tiny staging preflight — proposed NOT_BEFORE `2026-10-02T05:55:28.839Z` + Tiny allowlists; **no** Production env mutation ([EXP021_S4F7I_NO_BACKFILL_TINY_STAGING_PREFLIGHT.md](evidence/EXP021_S4F7I_NO_BACKFILL_TINY_STAGING_PREFLIGHT.md)). **S4F-7J** (2026-10-02): engineering wrapper `di-v0-s4-stage-tiny-production.sh` + cloud bootstrap — **no** Production execution ([EXP021_S4F7J_TINY_CONFIG_STAGING_WRAPPER_ENGINEERING.md](evidence/EXP021_S4F7J_TINY_CONFIG_STAGING_WRAPPER_ENGINEERING.md)). **S4F-7J.1** (2026-10-02): safety closure on PR **#1888** @ `040170104…` — Ops→S4B import removed, live pre-mutation topology/budget/Redis gates, exact three-key diff, recovery prestate proofs, expanded tests (**47**); still **no** Production execution. **S4F-7K** (2026-10-02): read-only Production **dry-run** `DRY_RUN=1` — guards **PASS** on remediation tool SHA `947a70540…` (frozen merge `04017010` blocked on text `vehicle_id` SQL); **no** env/restart/DB write ([EXP021_S4F7K_PRODUCTION_TINY_STAGING_DRY_RUN.md](evidence/EXP021_S4F7K_PRODUCTION_TINY_STAGING_DRY_RUN.md)). **S4F-7L** (2026-10-02): human-authorized **3-key staging attempt** `DRY_RUN=0` @ `947a70540…` — file mutation + backup **PASS**, Replica A **PRIMARY_STAGING** runtime proof **FAIL** → **full rollback COMPLETE**; Production `backend.env` restored to pre-pin SHA256; **no** Tiny activation ([EXP021_S4F7L_PRODUCTION_TINY_CONFIG_STAGING.md](evidence/EXP021_S4F7L_PRODUCTION_TINY_CONFIG_STAGING.md)). **S4F-7M** (2026-10-02): in-process **nine-key** runtime attestation via authenticated `/api/v1/metrics`; S4F-7J wrapper migrated to metrics proof (proc env removed); **no** Production deploy ([EXP021_S4F7M_IN_PROCESS_RUNTIME_CONFIG_ATTESTATION_ENGINEERING.md](evidence/EXP021_S4F7M_IN_PROCESS_RUNTIME_CONFIG_ATTESTATION_ENGINEERING.md)). |
| **Evidence** | [EXP021_S4F1_OBSERVABILITY_RECONCILIATION.md](evidence/EXP021_S4F1_OBSERVABILITY_RECONCILIATION.md); [EXP021_S4F3_TINY_ACTIVATION_EVIDENCE_AUDIT.md](evidence/EXP021_S4F3_TINY_ACTIVATION_EVIDENCE_AUDIT.md); [EXP021_S4F4_DIMO_GLOBAL_BUDGET_CONFIG_ONLY_OPS.md](evidence/EXP021_S4F4_DIMO_GLOBAL_BUDGET_CONFIG_ONLY_OPS.md); [EXP021_S4F5_PRODUCTION_PREFLIGHT.md](evidence/EXP021_S4F5_PRODUCTION_PREFLIGHT.md); [EXP021_S4F5_1_RELEASE_DELTA_PREFLIGHT.md](evidence/EXP021_S4F5_1_RELEASE_DELTA_PREFLIGHT.md); [EXP021_S4F5_2_PRODUCTION_DEPLOY_RESULT.md](evidence/EXP021_S4F5_2_PRODUCTION_DEPLOY_RESULT.md); [EXP021_S4F6_GLOBAL_BUDGET_PRODUCTION_ROLLOUT_RESULT.md](evidence/EXP021_S4F6_GLOBAL_BUDGET_PRODUCTION_ROLLOUT_RESULT.md); [EXP021_S4F7_TINY_OPERATOR_AUTHORIZATION_PREFLIGHT.md](evidence/EXP021_S4F7_TINY_OPERATOR_AUTHORIZATION_PREFLIGHT.md) (+ S4F-7A addendum); [EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING.md](evidence/EXP021_S4F7A_TINY_EXECUTION_PREREQUISITES_ENGINEERING.md) (**2026-10-01**) |

## Coverage classification

| Area | Status |
|------|--------|
| Legacy enrichment + impact | CONFIRMED |
| V2 code paths | CONFIRMED (flag off) |
| HF recovery runtime | PARTIALLY RECONSTRUCTED |
| Episode V2 scoring | NOT IMPLEMENTED |
| Fleet scalability numbers | UNKNOWN |
| Production V2 E2E | NOT YET PRODUCTION-VALIDATED |
