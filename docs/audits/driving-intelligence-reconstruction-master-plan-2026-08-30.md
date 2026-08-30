# SynqDrive Driving Intelligence Reconstruction — Master Plan & Progress
**Date:** 2026-08-30  
**Status:** ACTIVE — forensic audit / signal-capability expansion phase  
**Scope:** Trip evaluation, driver behaviour, driver quality scoring, vehicle load, high-timeframe analytics, brake load, tire load, telemetry quality, validation and calibration.  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Canonical handoff document:** This file is the single progress/decision handoff for this workstream. Every agent continuing this work should read and update this document first.
---
## 0. North Star
Reconstruct SynqDrive's current driving-analysis stack into a professional, evidence-based **Driving Intelligence Engine** that can answer, separately and explainably:
1. **How well was the vehicle driven?** — Driver Quality / Driver Score.
2. **How much mechanical/dynamic load did the vehicle experience?** — Vehicle Load / Fahrbelastung.
3. **What did that driving imply for brakes and tires?** — component-specific load / wear dose.
4. **How confident are we in those conclusions?** — independent telemetry/data confidence.
5. **How is behaviour/load changing over time?** — high-timeframe trend, distribution, tail risk and cumulative dose, not only averages.
The engine must remain honest under sparse telemetry. If the available cadence/signals cannot support a conclusion, SynqDrive must degrade confidence or return `INSUFFICIENT_DATA` instead of manufacturing false precision.
---
## 1. Agreed Architectural Decisions
These decisions are already agreed for this workstream and should not be reopened without new evidence.
### 1.1 Separate Driver Quality from Vehicle Load
The current `drivingStressScore` is a **vehicle stress/load score**, not driver quality. Future domain semantics must keep these separate:
- **Driver Quality Score:** `100 = excellent driving`.
- **Vehicle Load Score:** `100 = very high vehicle load/stress`.
- **Data Confidence:** separate from both scores.
Do **not** implement `Driver Quality = 100 - Vehicle Load`. Driving context (city/highway/traffic/grade/etc.) can create legitimate vehicle load without implying bad driver behaviour.
### 1.2 No Production Score Tuning Before Signal Reality Is Known
Do not change production weights, thresholds or scoring formulas merely because a current score appears unintuitive. First determine:
- what DIMO signals are currently requested,
- what DIMO can now provide,
- what each real vehicle actually publishes,
- at what effective cadence,
- what is persisted,
- what is consumed,
- and how sampling affects detector outputs.
### 1.3 DIMO Signal-Surface Audit Comes Before the Flight Recorder
The Flight Recorder signal set must be designed **after** the current/possible DIMO signal surface has been audited. This prevents validating an obsolete or unnecessarily narrow signal set.
### 1.4 Ground Truth and Sampling-Invariance Are Mandatory
An instrumented reference drive will be used to compare raw telemetry against external observation (including instrument-cluster video as a time-aligned reference). The same reference telemetry must later be replayed at degraded cadences/dropout levels to test sampling invariance.
### 1.5 High-Timeframe Analytics Must Preserve Distribution and Tail Information
A distance-weighted 30-day mean is useful but insufficient. Future high-timeframe evaluation must preserve at least:
- central tendency,
- distribution,
- P95/P99/tail behaviour,
- extremes,
- trend/recency,
- event rate,
- cumulative component load/wear dose,
- data-quality evolution.
---
## 2. Current-State Findings Already Established
### 2.1 Current Driver Score Is Not Driver Quality
`backend/src/modules/vehicle-intelligence/trips/driver-score.service.ts` explicitly aggregates `drivingStressScore` distance-weighted and documents higher values as higher **vehicle load**, not driver quality.
Current subject aggregation also uses minimum evidence thresholds (currently 3 scored trips / 50 km for enough data; higher confidence at larger cohorts). These thresholds must later be revalidated for the new driver-quality domain.
### 2.2 Current Composite Is Vehicle Stress
`backend/src/modules/vehicle-intelligence/driving-impact/driving-impact-scorer.ts` defines the current composite from:
- longitudinal stress,
- braking stress,
- stop-go stress,
- high-speed stress.
The code explicitly warns not to interpret the result as driver quality or safety compliance.
### 2.3 Current Trip Tire Load Is a Coarse Behavioural Proxy
`backend/src/modules/vehicle-intelligence/driving-impact/driving-impact-load-components.ts` currently derives trip-level tire load approximately from:
- 35% braking load,
- 35% stop-go load,
- 30% longitudinal load.
This is useful as a coarse utilization proxy but is not yet a complete tire-physics/dynamic-load model. Lateral/combined demand, pressure, temperature and road/load context need stronger integration at the trip-load layer.
### 2.4 Tire Health Architecture Is More Mature Than the Trip Tire-Load Input
`backend/src/modules/vehicle-intelligence/tires/tire-health.config.ts` already contains advanced long-term factors such as:
- tire archetype,
- pressure wear,
- heat stress,
- drivetrain/axle bias,
- vehicle load,
- season mismatch,
- multi-stressor interaction,
- calibration from real measurements,
- confidence.
Therefore the main opportunity is to improve the **Driving Impact input** that feeds Tire Health, not to discard the lifecycle/ground-truth architecture.
### 2.5 Brake Health Architecture Is Also Mature but Its Dynamic Inputs Can Improve
`backend/src/modules/vehicle-intelligence/brakes/brake-health.config.ts` already separates pad/disc behavior and incorporates usage profile, hard/full braking, high-speed braking, thermal score, powertrain/regen factors, calibration and confidence.
The next-generation opportunity is to improve the physical interpretation of braking episodes, kinetic energy, regen/friction split and thermal accumulation rather than merely retune static multipliers.
### 2.6 Current HF Assumptions Already Recognize Cadence Limits
`backend/src/modules/data-analyse/data-analyse.constants.ts` currently documents:
- snapshot expected interval: ~30 s,
- HF threshold: <= 2 s,
- conservative launch-detection target: 500 ms.
`backend/src/modules/data-analyse/data-analyse-signal-catalog.ts` also recognizes DIMO telemetry-event/HF paths versus ~30 s snapshot fallback and explicitly notes that snapshot-only telemetry is insufficient for reliable launch-like reconstruction.
### 2.7 Historical DIMO Capability Audit Is Now Potentially Stale
`docs/audits/dimo-driving-signals-capability.md` (2026-07-16) found a then-common 14-signal ICE set and a much smaller EV subset on the sampled LTE_R1 fleet, while effective historical `interval:"1s"` cadence often measured roughly 3–10 s and varied strongly by vehicle.
This is useful historical evidence, but **must not be treated as the final 2026-08-30 capability ceiling**. The explicit purpose of Phase 2 below is to reassess the expanded current DIMO signal surface.
### 2.8 Existing Runtime Has Multiple Telemetry Surfaces
`docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md` documents at least three relevant surfaces:
- regular ~30 s `signalsLatest` snapshot polling,
- active-trip live polling / bucketed core-route-performance reads,
- post-trip native events and historical/HF time-series queries.
The new audit must reconcile these as one capability/consumption graph.
### 2.9 Current High-Timeframe Rolling Is Model-Aware but Average-Dominant
`backend/src/modules/vehicle-intelligence/driving-impact-rolling/driving-impact-rolling.ts` provides useful model/profile cohort separation and distance-weighted aggregation, with an explicit `notDriverEvaluation` marker.
However, a rolling mean alone hides peaks, distributions and temporal clustering. The future engine must retain more information.
**Audit note — CONFIRMED 2026-08-30 (Phase 1.1):** `selectRollingCohort()` classifies all non-winning profile cohorts as `PROFILE_INCOMPATIBLE` regardless of the `profilesComparable(...)` branch result (`driving-impact-rolling.ts:151-155`). `profilesComparable()` is dead code for inclusion. See `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md` §14 (F-02).
### 2.10 Phase 1.1 Confirmed — Single Production Composite Path
Forensic audit confirms one active trip composite: `computeDrivingStressScore()` at model `v1.2.0` (weights 0.30/0.35/0.20/0.15). Deprecated `computeSafetyScore()` retained but new writes set `safetyScore: null`. Legacy API aliases (`drivingStyleScore`, `drivingScore`) remain reachable. Full Formula Book in Phase 1 audit §9.
### 2.11 Phase 1.1 Confirmed — Correlated Feature Exposure (P2, not quantified defect)
A single braking episode can feed multiple score terms (F-06 **CONFIRMED_CORRELATED_FEATURE_EXPOSURE**). Tire `behaviorFactor` includes 0.15× composite atop 0.50× longitudinal + 0.35× braking (**CONFIRMED_DOUBLE_EXPOSURE**, F-04 P2) — sensitivity validation required before treating as scoring defect.
### 2.12 Phase 1.1 Confirmed — Brake vs Tire Input Asymmetry (P2 architectural)
Brake health wear reads per-trip `TripDrivingImpact` since anchor (`analysisStatus IN (COMPLETE, PARTIAL)`). Tire wear behavior reads 30-day rolling `VehicleDrivingImpactCurrent` only (F-03 **CONFIRMED_ARCHITECTURAL_ASYMMETRY** — intent not proven).
### 2.13 Phase 1.1 Confirmed — API/UI Semantic Drift
`DriverScoreService` + `/trips/driver-score` expose vehicle stress under driver naming (**P0 SEMANTIC_DEFECT**). Notifications/i18n still use "Fahrbewertung"/"driver score" (**P1**). See Phase 1 audit §17–18, §22.
### 2.14 Phase 1.1 Confirmed — Active-Trip Live Polling vs TDI
`ACTIVE_TICK` live polling (`fetchPerformance` 15s, core/route reads) updates `VehicleTrip` engine averages and waypoints during the trip but **does not** write behavior event counters or TDI. Classification: **`INDIRECT_TDI_INPUT`** for engine/transmission load components only; composite stress inputs are post-trip (§5.1).
### 2.15 Phase 1.1 Confirmed — No Guaranteed Raw HF Replay Storage (P2)
Original DIMO HF `1s` samples are **not** persisted in Postgres. ClickHouse mirror is optional (`HF_MIRROR_ENABLED`), best-effort, and partial. TDI recompute is deterministic from persisted aggregates/events; **kinematic replay requires DIMO re-fetch or Phase 3 Flight Recorder** (F-14). Critical input for Phase 3 and Phase 13 governance.
---
## 3. New DIMO Vehicle Signal Inventories — Required Inputs
The following 2026-08-30 vehicle-specific audit documents were supplied as the authoritative next evidence set:
1. VW Tiguan — `docs/audits/dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md`
2. C63 AMG — `docs/audits/dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md`
3. Audi A4 — `docs/audits/dimo-ks-ms-661-signal-inventory-gap-analysis-2026-08-30.md`
4. VW Arteon — `docs/audits/dimo-hmue-c-215-signal-inventory-gap-analysis-2026-08-30.md`
### Availability note — 2026-08-30
At creation time of this master document, these exact four paths were **not present on the repository default branch (`main`)**. They must be ingested immediately once pushed/merged or otherwise made available. Do not silently substitute the older July capability audit for these four documents.
---
# 4. Master Workstream
## Phase 1 — Current-State Forensic Driving-Analysis Audit
**Goal:** reconstruct the present calculation and data-flow chain without changing production behavior.
### Scope
- Raw DIMO / provider inputs used today.
- Snapshot, live-trip, native-event and HF/post-trip ingestion paths.
- Normalization functions and units.
- Event detectors and thresholds.
- Feature derivation.
- `TripDrivingImpact` components.
- current `drivingStressScore`.
- current `DriverScoreService` aggregation.
- rolling/high-timeframe aggregation.
- Tire Health and Brake Health consumption paths.
- provenance/assessability/confidence.
- UI/API semantics and naming.
- duplicated/correlated feature penalties.
- versioning and replay behavior.
### Required output
A current-state dependency map:
`provider signal -> acquisition path -> cadence -> normalized field -> storage -> detector/feature -> trip metric -> component score -> aggregate -> tire/brake consumer -> API/UI`
### Exit criteria
- Every current score/metric has a traceable source and formula.
- No unexplained or hidden legacy scoring path remains.
- Every consumer of `drivingStressScore` is identified.
### Status
**DONE** (Phase 1.1 forensic call graph & formula inventory + evidence/completeness review 2026-08-30)
Deliverable: `docs/audits/driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md`. Exit criteria met: all production score inputs traceable (22-row matrix §25), active-trip→TDI resolved (§5.1), storage/replay claims corrected (§12.1), all `drivingStressScore` consumers identified.
---
## Phase 2 — DIMO Signal Surface, Query Inventory & Capability Expansion Audit
**This phase was explicitly inserted before the Flight Recorder.**
**Goal:** determine not only what SynqDrive currently asks DIMO for, but what DIMO and each real vehicle can provide now, what is being left unused, and what added intelligence it could unlock.
### 2A. Current Query-Surface Inventory
Build an exact inventory for each acquisition path.
#### Snapshot / Latest-State
For every production `signalsLatest` request determine:
- exact fields requested,
- query builder/file/function,
- scheduler/worker cadence,
- provider timestamp handling,
- cache behavior,
- null/missing semantics,
- normalization/units,
- `VehicleLatestState` persistence,
- ClickHouse mirror columns,
- downstream consumers,
- fields available but currently not selected.
#### Active-Trip / Live Polling
For each current live trip query/bucket determine:
- exact signal selection,
- intended interval/bucket,
- actual call cadence,
- whether the provider returns new values at that cadence,
- merge/deduplication behavior,
- whether values are retained historically or only projected into trip state,
- cost/rate-limit implications,
- detector/feature consumers.
#### HF / Historical Time Series
For every DIMO historical/HF query determine:
- exact signal set,
- requested interval (`1s`, etc.),
- aggregation mode,
- real effective cadence per signal/vehicle,
- raw vs aggregated semantics,
- native-event relationship,
- retention/window limits,
- pagination/chunking,
- ClickHouse/HF mirror behavior,
- post-trip reconstruction consumers,
- information discarded before scoring.
#### Native DIMO Events / Segments
Inventory separately because provider-classified events are not equivalent to raw signals:
- `behavior.*` events,
- available event names per vehicle,
- event metadata,
- event timestamp accuracy,
- segment mechanisms useful as context,
- source precedence versus reconstructed events.
### 2B. Four-Vehicle Capability Matrix
Once the four 2026-08-30 audit documents are available, build one canonical matrix across:
- VW Tiguan `WOB L 7503`,
- Mercedes C63 AMG `KS MX 2024`,
- Audi A4 `KS MS 661`,
- VW Arteon `HMÜ C 215`.
Every relevant signal should be classified at minimum as:
- `AVAILABLE_AND_QUERIED`
- `AVAILABLE_NOT_QUERIED`
- `QUERIED_NOT_PERSISTED`
- `PERSISTED_NOT_CONSUMED`
- `CONSUMED`
- `LISTED_BUT_NULL`
- `NOT_AVAILABLE_ON_VEHICLE`
- `UNKNOWN_NEEDS_RUNTIME_PROBE`
Do not assume fleet-wide capability from one vehicle.
### 2C. Candidate Signal Families to Reassess
The audit must actively look for newly available signals relevant to:
#### Vehicle dynamics
- speed,
- acceleration / longitudinal acceleration,
- lateral acceleration,
- yaw rate,
- heading,
- steering angle,
- individual wheel speeds,
- traction/stability/ABS interventions,
- movement/ignition state.
#### Driver inputs / propulsion
- throttle / accelerator pedal,
- engine RPM,
- engine load,
- torque / requested torque,
- transmission gear,
- transmission temperature if available,
- clutch/shift context if available.
#### Brakes
- brake pedal pressed,
- pedal position,
- brake pressure / requested braking if exposed,
- deceleration,
- ABS/ESC events,
- speed before/after braking episode.
#### EV / hybrid energy
- traction battery power,
- current,
- voltage,
- SOC,
- regen-relevant power direction,
- battery/drive-unit thermal context if exposed.
#### Tires / chassis
- per-wheel pressure,
- tire temperature if exposed,
- wheel speed/slip signals,
- axle/chassis dynamics,
- payload/load proxies if exposed.
#### Environmental/context
- exterior temperature,
- altitude / grade reconstruction,
- road class,
- speed limit,
- location/heading,
- trip/segment context.
This list is a search framework, not an assumption that DIMO exposes every item on every vehicle.
### 2D. Value/Potential Matrix
For every candidate signal, grade its incremental value for:
- Driver Quality,
- Vehicle Load,
- Brake Load,
- Tire Load,
- trip reconstruction,
- context normalization,
- confidence/provenance.
Also grade:
- expected/observed cadence,
- vehicle coverage,
- stability,
- redundancy/correlation,
- query/storage cost,
- privacy sensitivity if applicable.
### 2E. Signal Redundancy and Canonicalization
Where multiple fields represent similar physical concepts (e.g. OBD throttle vs engine TPS), determine:
- preferred canonical source,
- fallback hierarchy,
- cross-signal consistency checks,
- whether both add information or merely duplicate a penalty.
### 2F. Capability-First Query Strategy
Produce a proposal for per-vehicle/per-provider query profiles rather than a single fleet-wide hard-coded assumption.
A future profile should be able to express:
- vehicle capability manifest,
- signal acquisition tier,
- required/optional signals,
- detector eligibility,
- expected cadence,
- fallback source,
- confidence ceiling.
### 2G. Phase Deliverables
1. Current Snapshot Query Inventory.
2. Current Active-Trip Live Poll Inventory.
3. Current HF/Time-Series Query Inventory.
4. Native Event/Segment Inventory.
5. Four-Vehicle 2026-08-30 Capability Matrix.
6. `available but unused` gap matrix.
7. prioritized signal expansion proposal.
8. query/storage/cost impact assessment.
9. proposed Flight Recorder signal manifest.
### 2H. Gate to Phase 3
**Do not design/freeze the Flight Recorder until Phase 2 is complete.**
### 2A Status — DONE (2026-08-31)
Deliverable: `docs/audits/dimo-phase-2a-current-query-surface-audit-2026-08-31.md`

**Exit criteria met (code/schema audit):** 27 productive DIMO queries registered (`DIMO-Q001`–`DIMO-Q027`); exact signal selections, triggers, cadence, windows, persistence, and overlap documented; theoretical scaling computed; 20 runtime probes backlog.

**Capability architecture verdict:** `PARTIALLY_CAPABILITY_AWARE` — `availableSignals`/`dataSummary` preflight persists capability probes (7-day gate) but does **not** drive snapshot/live/HF/event query field selection; all driving queries remain static fleet-wide profiles.

**Material Phase 2A findings:**
- REQUESTED_BUCKET (`1s`/`7s`/`15s`/`20s`) ≠ proven OBSERVED_PROVIDER_CADENCE — runtime probes required before treating bucket size as sample frequency.
- No per-HF-point SynqDrive receive timestamp; provider→SynqDrive latency not measurable for kinematic replay (Phase 3 blocker input).
- Raw HF not in Postgres; ClickHouse HF mirror optional (`HF_MIRROR_ENABLED=false` default), 6-signal subset — PARTIAL_REPLAY_ONLY.
- ACTIVE_TICK: 3 parallel DIMO calls every ~30s per active trip dominates burst API load at concurrent-trip scale.
- Four 2026-08-30 vehicle inventory files still **not on `main`** — Phase 2B remains blocked on ingestion.

**Phase 2 overall:** IN_PROGRESS (2A done; 2B–2G not started). **Phase 3 remains gated.**

### Status (Phase 2 overall)
**IN_PROGRESS — 2A DONE; 2B BLOCKED ON FOUR VEHICLE INVENTORY FILES**
The older July DIMO capability audit is HISTORICAL_EVIDENCE only. The four exact 2026-08-30 vehicle inventories are still not on `main` as of 2026-08-31.
---
## Phase 3 — Telemetry Flight Recorder
**Goal:** capture raw, timestamped evidence for the signal set selected in Phase 2 without changing scoring behavior.
**Phase 1 input (F-14):** Postgres does not store original DIMO HF time series; ClickHouse HF mirror is optional/partial. Flight Recorder must close the kinematic replay gap for Phase 6 sampling-invariance and Phase 13 governance.
### Recorder requirements
For each observation retain, where available:
- vehicle/provider identity,
- trip/run id,
- signal name,
- provider timestamp,
- SynqDrive received timestamp,
- raw value,
- normalized value,
- unit,
- acquisition path,
- query interval/request id,
- sequence/order metadata,
- provenance/source,
- null/duplicate/out-of-order evidence.
### Per-signal diagnostics
Compute at minimum:
- sample count,
- P50/P95/P99 inter-sample interval,
- fastest/slowest valid cadence,
- max gap,
- jitter,
- duplicate rate,
- out-of-order rate,
- missing/dropout behavior,
- provider-to-SynqDrive latency where measurable,
- quantization/value resolution,
- change latency.
### Constraints
- Read-only observation of telemetry behavior.
- No production scoring threshold changes.
- Bounded capture/retention.
- No assumption that requested `1s` means effective 1 Hz.
### Exit criteria
A measured, per-vehicle/per-signal cadence and reliability report exists and can be used to design detectors.
### Status
**NOT STARTED — waiting for Phase 2 gate**
---
## Phase 4 — Instrumented Reference Drive
**Goal:** create an external reference timeline against which SynqDrive telemetry and detectors can be measured.
### Test composition
Include ordinary, safe examples of:
- standstill/start,
- steady low/medium/high speeds,
- normal acceleration,
- normal deceleration,
- stop-and-go,
- city/country/highway context,
- ordinary curves,
- altitude/grade changes where practical.
Any deliberately extreme braking/acceleration/cornering validation must only be done in an appropriate controlled/safe environment, not created unnecessarily on public roads.
### Reference sources
- instrument-cluster/tachometer video,
- synchronized timestamps/markers,
- optionally phone GNSS/IMU or other independent sensor source if useful later.
The cluster video is a **reference**, not automatically absolute ground truth; display filtering and source differences must be accounted for.
### Status
**NOT STARTED**
---
## Phase 5 — Ground-Truth Alignment & Reconstruction
**Goal:** time-align external reference observations and SynqDrive/DIMO telemetry.
### Outputs
- clock offset/drift estimate,
- speed comparison timeline,
- signal latency,
- event onset/end timing error,
- MAE/RMSE/bias where meaningful,
- observed missed transitions,
- per-signal trust profile.
### Status
**NOT STARTED**
---
## Phase 6 — Detector Validation & Sampling-Invariance Laboratory
**Goal:** prove that event detection measures driving behavior, not merely telemetry cadence.
### Detector validation
Measure per event class:
- precision,
- recall,
- false positives,
- false negatives,
- timing error,
- duration error,
- severity error,
- source agreement/disagreement (native event vs reconstruction).
### Sampling-invariance replay
Replay the same reference telemetry at deliberately degraded conditions, for example:
- native/best available cadence,
- 1 s,
- 2 s,
- 5 s,
- 10 s,
- 30 s,
- irregular cadence,
- controlled dropout rates.
If scores materially change only because samples are removed, the model must either compensate or lower assessability/confidence instead of pretending the output is equivalent.
### Status
**NOT STARTED**
---
## Phase 7 — Driving Feature Reconstruction V2
**Goal:** move from coarse event counters toward explainable continuous driving features.
Candidate feature families, subject to Phase 2/3 signal reality:
### Longitudinal dynamics
- acceleration distribution,
- deceleration distribution,
- positive/negative jerk,
- duration above load thresholds,
- acceleration episode shape,
- braking episode shape,
- start/launch characterization.
### Driver anticipation / unnecessary cycling
- acceleration -> braking reversal windows,
- repeated throttle/brake cycling,
- avoidable kinetic-energy cycles,
- speed oscillation / pacing instability.
### Lateral dynamics
Where signal quality permits:
- lateral acceleration,
- yaw/heading-derived curvature,
- lateral jerk,
- corner entry/exit dynamics,
- combined longitudinal/lateral demand.
### Context normalization
- road class,
- traffic/stop-go context where inferable,
- grade,
- speed limit,
- ambient temperature,
- powertrain,
- vehicle capability/profile.
### Status
**NOT STARTED**
---
## Phase 8 — Driver Quality Score V2
**Goal:** create a genuine driver evaluation separate from mechanical vehicle load.
Candidate dimensions:
- longitudinal smoothness,
- acceleration quality,
- braking quality,
- anticipation,
- cornering quality,
- speed discipline,
- consistency,
- mechanical sympathy,
- context-adjusted behavior.
### Requirements
- `100 = excellent driving`.
- Context-adjusted; city driving is not automatically worse than highway driving.
- Explainable sub-scores.
- Confidence shown independently.
- No score if evidence is insufficient.
- Prevent duplicate punishment of one physical episode through highly correlated counters.
### Status
**NOT STARTED**
---
## Phase 9 — Vehicle Load / Fahrbelastung V2
**Goal:** preserve and improve the valid concept currently represented by `drivingStressScore`.
Target component families:
- longitudinal mechanical load,
- braking load,
- stop-go/load cycling,
- high-speed exposure,
- powertrain load,
- transmission load where assessable,
- tire dynamic load,
- brake mechanical load,
- brake thermal load.
### Requirements
- `100 = very high load`.
- Do not interpret as driver quality.
- Separate context/exposure from behavior where possible.
- Replace road-type proxies with actual physical exposure when signals support it.
- retain provenance and confidence per component.
### Status
**NOT STARTED**
---
## Phase 10 — Brake Load & Brake Physics V2
**Goal:** feed Brake Health with a more physical per-trip load signal.
### Direction
Current kinetic energy factor should evolve toward a mass/context-aware braking energy model where data supports it:
`E_kin = 0.5 * m * (v1^2 - v2^2)`
For EV/HEV/PHEV, friction-brake load must not be equated blindly with vehicle deceleration. Where traction-battery power/current is sufficiently reliable, estimate or constrain the regen share.
### Thermal state
Introduce an explainable normalized brake thermal state/dose accounting for:
- energy per braking episode,
- time between episodes,
- cooling periods,
- speed/airflow context,
- ambient context,
- powertrain/regen.
Avoid claiming exact disc temperature without direct measurement/calibration.
### Status
**NOT STARTED**
---
## Phase 11 — Tire Dynamic Load & Tire Wear Input V2
**Goal:** replace the coarse trip tire-load composite with a richer dynamic load input while retaining the mature Tire Health lifecycle model.
Candidate dimensions:
- longitudinal tire demand,
- lateral tire demand,
- combined demand,
- acceleration/braking episode dose,
- cornering exposure,
- pressure state,
- temperature/heat context,
- speed exposure,
- drivetrain/axle bias,
- vehicle/load context,
- tire archetype sensitivity.
Where `a_x` and `a_y` are defensible, evaluate a combined normalized demand proxy such as:
`combined_demand = sqrt(a_x^2 + a_y^2) / g`
This is a demanded dynamic-load proxy, not a claim of measured tire-road friction coefficient.
### Ground-truth calibration
Use existing real tread-depth measurements / calibration infrastructure to validate whether predicted wear-dose improvements actually improve observed wear prediction.
### Status
**NOT STARTED**
---
## Phase 12 — Multi-Timeframe / High-Timeframe Analytics V2
**Goal:** make 7d/30d/90d/other rolling views diagnostically useful rather than only averaged.
For each major score/load dimension evaluate retaining:
- distance-weighted mean,
- median where relevant,
- P90/P95/P99,
- max/extreme count,
- event rate per distance/time,
- EWMA / recency-weighted trend,
- trend slope,
- variability/consistency,
- cumulative mechanical/thermal/wear dose,
- source-quality/confidence distribution,
- excluded/incompatible cohort evidence.
Potential windows should be considered both by **time** and **distance**, because wear processes often scale more naturally with distance/exposure than calendar time.
### Status
**NOT STARTED**
---
## Phase 13 — Replay, Calibration & Model Governance
**Goal:** make every scoring change reproducible and measurable.
### Requirements
- deterministic replay from stored/raw evidence where available,
- versioned model manifests,
- A/B V1 vs V2 comparison,
- sensitivity analysis of weights/thresholds,
- correlated-feature analysis,
- calibration against measured tire/brake anchors,
- known-reference-drive regression tests,
- cohort compatibility rules,
- explicit migration/cutover strategy,
- no silent reinterpretation of historical scores.
### Status
**NOT STARTED**
---
## Phase 14 — UI/API Semantics & Explainability
**Goal:** make the richer model understandable without presenting false precision.
Target conceptual surfaces:
- **Driver Quality** — good/bad driving quality.
- **Vehicle Load** — mechanical/dynamic burden.
- **Brake Load** — mechanical + thermal interpretation.
- **Tire Load** — longitudinal/lateral/combined/wear-relevant burden.
- **Data Confidence** — clearly separate.
- **Why?** — top contributing factors / evidence provenance.
- **Trend** — meaningful change over time, not a single opaque 30d number.
### Status
**NOT STARTED**
---
# 5. Progress Tracker
Legend: `DONE`, `IN_PROGRESS`, `NEXT`, `BLOCKED`, `NOT_STARTED`.
| Work item | Status | Notes |
|---|---|---|
| Initial repo reconnaissance of driving impact / driver score | DONE | Confirmed current DriverScore is vehicle stress aggregation |
| Initial semantic separation decision | DONE | Driver Quality vs Vehicle Load vs Data Confidence |
| Initial Brake Health architecture review | DONE | Mature lifecycle/config; dynamic input can improve |
| Initial Tire Health architecture review | DONE | Mature lifecycle/config; trip dynamic input is coarse |
| Initial HF/cadence constraint review | DONE | Existing code already distinguishes ~30s snapshot vs HF eligibility |
| Initial rolling/high-timeframe review | DONE | Model-aware rolling exists; average-dominant |
| Phase 1.1 forensic call graph & formula inventory | DONE | Phase 1 audit + evidence review PR #1454 |
| Phase 1 evidence/completeness review (storage, active-trip, matrix) | DONE | §5.1, §12.1, §25 (22 rows) |
| Exhaustive current-state formula/call-graph inventory | DONE | Phase 1 exit criteria satisfied |
| Read 2026-08-30 Tiguan signal gap audit | BLOCKED | exact file not yet on `main` |
| Read 2026-08-30 C63 AMG signal gap audit | BLOCKED | exact file not yet on `main` |
| Read 2026-08-30 Audi A4 signal gap audit | BLOCKED | exact file not yet on `main` |
| Read 2026-08-30 Arteon signal gap audit | BLOCKED | exact file not yet on `main` |
| Snapshot query inventory | DONE | Phase 2A audit §4–6 (27 queries total) |
| Active-trip/live polling query inventory | DONE | Phase 2A audit §7–8 |
| HF/time-series query inventory | DONE | Phase 2A audit §9–10 |
| Native event/segment inventory refresh | DONE | Phase 2A audit §12–13 |
| Phase 2A query-surface audit | DONE | `dimo-phase-2a-current-query-surface-audit-2026-08-31.md` |
| Four-vehicle capability matrix | NOT_STARTED | waits on new audit docs (Phase 2B) |
| Available-but-unused DIMO signal matrix | NOT_STARTED | Phase 2 |
| Prioritized query expansion proposal | NOT_STARTED | no production change yet |
| Flight Recorder manifest | NOT_STARTED | Phase 2 exit deliverable |
| Flight Recorder implementation | NOT_STARTED | gated on Phase 2 |
| Instrumented reference drive | NOT_STARTED | gated on Flight Recorder |
| Ground-truth synchronization | NOT_STARTED | Phase 5 |
| Detector validation | NOT_STARTED | Phase 6 |
| Sampling-invariance replay | NOT_STARTED | Phase 6 |
| Driving Features V2 | NOT_STARTED | Phase 7 |
| Driver Quality V2 | NOT_STARTED | Phase 8 |
| Vehicle Load V2 | NOT_STARTED | Phase 9 |
| Brake Physics V2 | NOT_STARTED | Phase 10 |
| Tire Dynamic Load V2 | NOT_STARTED | Phase 11 |
| High-Timeframe V2 | NOT_STARTED | Phase 12 |
| Replay/calibration/model governance | NOT_STARTED | Phase 13 |
| UI/API semantic cutover | NOT_STARTED | Phase 14 |
---
# 6. Immediate Next Actions
1. ~~Complete Phase 1's exact call/formula/consumer inventory.~~ **Done** — see Phase 1 audit.
2. Make the four 2026-08-30 vehicle signal-inventory files available on `main` and ingest them into this workstream.
3. ~~Execute Phase 2A against current code: exact Snapshot / Live Poll / HF / Events query inventories.~~ **Done** — see Phase 2A audit.
4. Execute Phase 2B: merge Phase 2A code findings with the four vehicle-specific capability inventories (blocked until files on `main`).
5. Produce a prioritized `available but unused` signal list and assess incremental value per driving/brake/tire use case.
6. Only then freeze the Flight Recorder signal manifest and proceed to Phase 3.
---
# 7. Agent Handoff Protocol
Any agent continuing this workstream should:
1. Read this file first.
2. Read the latest linked/source audit docs for the phase being worked.
3. Verify current `main` before relying on historical audit conclusions.
4. Update the Progress Tracker and material decisions in this file when a phase or subphase changes state.
5. Distinguish clearly between `confirmed from code`, `confirmed from runtime/provider`, `inference`, and `proposal`.
6. Do not make production scoring changes before the relevant phase gate is satisfied.
7. Preserve model/version/provenance semantics; never present proxy-derived values as direct measurements.
8. Prefer explicit `INSUFFICIENT_DATA` / lower confidence over invented precision when signal/cadence evidence is inadequate.
---
# 8. Definition of Success
This workstream is complete when SynqDrive can explain, for an individual trip and over rolling timeframes, with traceable evidence:
- how the driver behaved,
- how much the vehicle was loaded,
- which dynamic episodes caused the load,
- how brakes and tires were affected,
- how those effects accumulated over time,
- how confident the system is,
- and how the result changes when telemetry quality changes.
A final score without provenance, uncertainty, context and component decomposition is not considered sufficient for the target professional level.
