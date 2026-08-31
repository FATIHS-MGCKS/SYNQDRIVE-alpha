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
### 1.6 Connection Profile and Powertrain Profile Are Independent First-Class Axes
SynqDrive Driving Intelligence must model two **independent stratification axes**:

- **A. CONNECTION / ACQUISITION PROFILE** — how telemetry is acquired.
- **B. POWERTRAIN / ENERGY PROFILE** — how the vehicle converts and stores energy.

These axes must **not** be conflated. A single **Provider** label alone is insufficient for capability, provenance, or validation planning.

#### 1.6.1 Connection / Acquisition Profiles
Canonical connection profiles (minimum set):

**`DIMO_LTE_R1`**

| Attribute | Value |
|-----------|-------|
| **Provider** | DIMO |
| **Connection class** | Hardware / OBD dongle (LTE R1) |
| **Current project role** | **PRIMARY DIMO REFERENCE PROFILE** |

Important characteristics:

- Vehicle telemetry through LTE R1 OBD hardware.
- DIMO native behavior events **may** be available (e.g. harsh acceleration/braking/cornering depending on vehicle/provider).
- Current four primary DIMO audit vehicles use this connection profile per project-owner baseline.
- Primary Flight Recorder / ground-truth reference track.

Do **not** assume every event exists on every vehicle. Capability remains vehicle-specific.

**`DIMO_SMART5`**

| Attribute | Value |
|-----------|-------|
| **Provider** | DIMO |
| **Connection class** | Hardwired in-vehicle telematics hardware |

Important characteristics:

- Signal surface expected to be closely related to DIMO LTE R1 — **`UNVERIFIED_UNTIL_PHASE_2G`**.
- **NO native DIMO behavior-event channel** per current project baseline — reconstructed detectors must **not** depend on native events.
- Two digital outputs available for operational/control use (e.g. relay/ignition control).

**Equivalence rule:** Signal equivalence, cadence equivalence, and timestamp equivalence remain **runtime questions**. LTE R1 calibration may provide a useful comparison baseline but **cannot automatically certify Smart5**.

**Control-plane rule:** Digital outputs are **CONTROL-PLANE** capabilities. They are **NOT** driving-score inputs.

Smart5 must **not** receive worse Driver Quality / Vehicle Load scores merely because native behavior events are unavailable. Native-event absence must instead affect **source provenance**, **detector strategy**, and **confidence / assessability** until reconstructed-event equivalence is validated.

Smart5 signal/cadence/timestamp equivalence with LTE R1 must later be **empirically verified** (Phase 2G). Until then: **`UNVERIFIED_UNTIL_PHASE_2G`**.

**`DIMO_TESLA_DIRECT`**

| Attribute | Value |
|-----------|-------|
| **Provider** | DIMO |
| **Connection class** | Software-only direct Tesla integration |

Important characteristics:

- No external DIMO hardware.
- Signal availability/cadence must be audited separately.
- Do **not** inherit LTE R1 or Smart5 signal assumptions.
- Native-event availability unknown until tested.
- Historical/latest/HF behavior must be independently measured.
- A real Tesla is available in the project fleet for the later test workstream.

This is a **separate DIMO acquisition profile**, not a variant of LTE R1.

**`HIGH_MOBILITY_API_MQTT`**

| Attribute | Value |
|-----------|-------|
| **Provider** | High Mobility |
| **Connection class** | Software-only OEM/cloud integration |
| **Transport** | API / MQTT as applicable |

Important characteristics:

- No aftermarket vehicle hardware.
- Highly manufacturer/model dependent.
- Signal availability differs by OEM.
- Update intervals/cadence differ strongly by OEM/signal.
- Permission/scopes may affect availability.
- Latest/state/event behavior may differ from DIMO.
- Must **NOT** inherit DIMO assumptions.

High Mobility requires its **own provider audit** (Phase 2H) before production Driving Intelligence assumptions are made for **High Mobility target profiles**.

**Important:** High Mobility completion is **NOT** a prerequisite for **`DIMO_LTE_R1`** Ground Truth validation. High Mobility is manufacturer/model/scope/cadence dependent and may require substantially more audit work than unrelated DIMO tracks.

#### 1.6.2 Provider ≠ Connection Profile
**Provider alone is insufficient.**

Example — **Provider = DIMO** can mean:

- `DIMO_LTE_R1`
- `DIMO_SMART5`
- `DIMO_TESLA_DIRECT`

Future SynqDrive integration configuration must identify at minimum:

- `provider`
- `connectionProfile`

Do **not** treat all DIMO vehicles as one homogeneous acquisition profile.

#### 1.6.3 Powertrain / Energy Profiles
First-class powertrain profiles:

| Profile | Status |
|---------|--------|
| `ICE_GASOLINE` | Required for current validation program |
| `ICE_DIESEL` | Required for current validation program |
| `PHEV` | Required for current validation program |
| `BEV` | Required for current validation program |
| `HEV` | Optional reserve — not required for current validation program |

Powertrain profile is **independent** of connection profile. Only valid real-world combinations are instantiated, e.g.:

- `DIMO_LTE_R1` + `ICE_GASOLINE`
- `DIMO_LTE_R1` + `ICE_DIESEL`
- `DIMO_SMART5` + `ICE_DIESEL`
- `DIMO_TESLA_DIRECT` + `BEV`
- `HIGH_MOBILITY_API_MQTT` + `PHEV`
- `HIGH_MOBILITY_API_MQTT` + `BEV`

#### 1.6.4 Why Powertrain Stratification Is Required
The four independent Driving Intelligence **output domains** remain:

- **A. Driver Quality**
- **B. Vehicle Load**
- **C. Brake Physics / Brake Load**
- **D. Tire Dynamic Load**

Plus orthogonal:

- **E. Data Confidence / Assessability**

But their **physical inputs differ by powertrain**.

**`ICE_GASOLINE` / `ICE_DIESEL`** may involve: engine RPM, engine load, throttle, torque, engine braking, transmission state, coolant/oil/transmission temperature, fuel/powertrain load.

**`PHEV`** may additionally involve: traction battery power, electrical propulsion, regen, blended friction/regenerative braking, ICE-on / ICE-off state.

**`BEV`** may involve: traction battery power, motor/electrical load, regen, thermal state, friction-vs-regenerative braking split.

Do **not** simply apply static EV multipliers when direct/reconstructed regen evidence becomes available in the future.

#### 1.6.5 Provider-Neutral Canonical Intelligence
**Connection Profile determines:**

- acquisition method,
- available signals,
- timestamps,
- cadence,
- provider events,
- provenance,
- detector eligibility,
- confidence ceiling.

**Connection Profile should NOT directly determine:**

- whether a driver is “good” or “bad”,
- arbitrary score offsets,
- different semantic score directions.

**Future canonical architecture:**

```
Provider / Connection Profile
  → Provider Adapter
  → Canonical Signals
  → Driving Reconstruction
  → Canonical Behaviour / Physics Features
  → independent outputs:
       Driver Quality
       Vehicle Load
       Brake Load
       Tire Load
  + Data Confidence
```

Where a signal is missing: use validated fallback/proxy if available; otherwise lower assessability/confidence. **Do not manufacture equivalent precision.**

#### 1.6.6 Scoring / Physics Implications
- **Driver Quality** should remain as provider-neutral as evidence permits.
- **Vehicle Load** requires powertrain-aware physical subcomponents.
- **Brake Physics** must distinguish ICE/PHEV/BEV, engine braking, regenerative braking, and friction braking where evidence supports it.
- **Tire Dynamic Load** must remain powertrain-aware for mass, driven axle, torque delivery, regen/braking distribution, and vehicle-specific tire configuration — **without** allowing connection method itself to bias the score.

**LOW CONFIDENCE ≠ BAD DRIVING** · **LOW CONFIDENCE ≠ LOW/HIGH VEHICLE LOAD**

#### 1.6.7 SynqDrive Integration Model Requirement (future — not implemented in this amendment)
When a vehicle/integration is onboarded, SynqDrive must know which acquisition/connection method is active.

At minimum persist or derive:

- `provider`
- `connectionProfile`

And maintain separately:

- `powertrainProfile`

**Do not implement this in documentation-only tasks.** Later implementation design must audit the existing integration schema before adding new fields.

#### 1.6.8 Validation Test Matrix Concept
Canonical matrix: **Connection Profile × Powertrain Profile × Vehicle**

Each real tested combination gets an evidence status:

| Status | Meaning |
|--------|---------|
| `UNTESTED` | No runtime evidence |
| `SCHEMA_ONLY` | Provider/schema documentation only |
| `VEHICLE_CAPABILITY_CONFIRMED` | Signals observed on reference vehicle |
| `CADENCE_CONFIRMED` | Effective cadence measured |
| `GROUND_TRUTH_VALIDATED` | Reference-drive alignment completed |
| `CALIBRATED` | Scoring/detector calibration anchored |

This prevents SynqDrive from treating an untested connection/powertrain combination as fully validated.

**Profile-scoped rule:** A `GROUND_TRUTH_VALIDATED` or `CALIBRATED` status applies **only** to the tested `connectionProfile` × `powertrainProfile` × `vehicle`/`modelVersion` context. Do **not** propagate validation automatically to another provider, connection profile, powertrain, or OEM/model.

**Powertrain independence:** Powertrain validation can progress independently. We do **not** need all four powertrain classes available before starting the first LTE R1 reference drive. Example: `DIMO_LTE_R1` + `ICE_DIESEL` may reach `GROUND_TRUTH_VALIDATED` while `HIGH_MOBILITY_API_MQTT` + `PHEV` remains `UNTESTED` — valid and expected. No silent cross-powertrain calibration transfer.

#### 1.6.8a Profile-Scoped Validation Gates (`PROFILE_SCOPED_VALIDATION_GATES`)
There is **no global Phase 3 gate** on full cross-provider closure. Each connection/powertrain validation track may start once the **target-profile prerequisites** for that track are complete — unrelated providers need not wait.

| Validation track | Required gate |
|------------------|---------------|
| **Phase 3A — DIMO LTE_R1** | Phase 2D + 2E + 2F + **`DIMO_LTE_R1` reference manifest (Phase 2F.1)** |
| **Phase 3B — DIMO Tesla Direct** | Tesla Direct capability/cadence audit (Phase 2G) + **`DIMO_TESLA_DIRECT` Flight Recorder manifest** |
| **Phase 3C — DIMO Smart5** | Smart5 capability/cadence audit (Phase 2G) + **`DIMO_SMART5` Flight Recorder manifest** |
| **Phase 3D — High Mobility** | Relevant High Mobility OEM/profile audit (Phase 2H) + **HM profile-specific manifest** |

Powertrain requirements remain an **additional independent dimension** on top of connection-profile gates (e.g. `DIMO_LTE_R1` + `ICE_DIESEL` may validate before `DIMO_LTE_R1` + `PHEV` if reference vehicle pending).

**Phase 3A does NOT require:** Smart5 runtime audit completion · Tesla Direct audit completion · High Mobility audit completion · full cross-provider Phase 2I closure.

All reference-drive / replay / calibration work must tag:

- `connectionProfile`
- `powertrainProfile`
- `vehicle`
- `provider`
- `hardwareProfile` (if applicable)
- `modelVersion`

Required current powertrain test classes: `ICE_GASOLINE`, `ICE_DIESEL`, `PHEV`, `BEV`.

If a physical test vehicle for a class is unavailable, mark that profile **`PENDING_REFERENCE_VEHICLE`**. Do **not** silently generalize calibration from another powertrain. Example: `DIMO_LTE_R1` + `ICE_DIESEL` may be validated first while `DIMO_LTE_R1` + `PHEV` remains pending.

#### 1.6.9 Critical Terminology (do not conflate)
Use consistently and distinctly:

| Term | Meaning |
|------|---------|
| **Provider** | Telemetry platform/vendor (e.g. DIMO, High Mobility) |
| **Connection Profile** | Acquisition path within a provider (e.g. `DIMO_LTE_R1`) |
| **Hardware Profile** | Physical device/installation class where applicable |
| **Powertrain Profile** | Energy conversion class (e.g. `ICE_GASOLINE`, `BEV`) |
| **Vehicle Capability** | What a specific vehicle actually publishes |
| **Signal Capability** | Which signals are available for a vehicle/profile |
| **Cadence Capability** | Effective update frequency for signals |
| **Native Event Capability** | Provider-classified behavior events availability |
| **Data Confidence** | Orthogonal assessability/reliability — not a driving-quality score |
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
### Availability note — updated 2026-08-31 (Phase 2B, PR #1458)
The four inventory documents are **canonical in-repo** under `docs/audits/` (included in PR #1458; **PRESENT_ON_MAIN_AFTER_MERGE**). Source commits: `0bab8a4d3`, `5a440c60d`, `caeaa3aa4`, `c2a0e1c5e`. Do not substitute the older July capability audit (`dimo-driving-signals-capability.md`) for these four documents.
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
### 2D.0. Connection & Powertrain Stratification Baseline
**Goal:** Freeze the provider/connection/powertrain taxonomy before Signal Value / Physics evaluation.

**Required deliverables:**
- canonical connection-profile taxonomy,
- canonical powertrain taxonomy,
- provider vs connection distinction,
- capability/provenance rules,
- validation matrix structure,
- test-profile matrix,
- Flight Recorder profile dimensions.

**Status:** **DONE** (2026-08-31) — architectural baseline established in Master Plan §1.6 via documentation amendment. Runtime capability statements remain subject to provider/vehicle testing.
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
### 2E. DIMO Redundancy / Canonicalization
Where multiple fields represent similar physical concepts (e.g. OBD throttle vs engine TPS), determine:
- preferred canonical source,
- fallback hierarchy,
- cross-signal consistency checks,
- whether both add information or merely duplicate a penalty.
Scope: primarily DIMO connection profiles; do not assume cross-provider equivalence without proof.
### 2F. DIMO Capability-First Acquisition Strategy
Produce a proposal for per-vehicle/per-provider **connection-profile-aware** query profiles rather than a single fleet-wide hard-coded assumption.
A future profile should be able to express:
- vehicle capability manifest,
- connection profile (`DIMO_LTE_R1`, `DIMO_SMART5`, `DIMO_TESLA_DIRECT`),
- signal acquisition tier,
- required/optional signals,
- detector eligibility,
- expected cadence,
- fallback source,
- confidence ceiling.
**No implementation until approved.**

### 2F.1. DIMO LTE_R1 Reference Manifest
**Goal:** Freeze the **`DIMO_LTE_R1`** Flight Recorder / reference-program signal manifest — the first ungating deliverable for Phase 3A.

**Output must specify:**
- canonical signals to record,
- raw provider fields to retain,
- provider timestamp,
- receive timestamp,
- cadence target,
- query/source surface,
- native-event capture,
- required powertrain context,
- fallback/proxy signals,
- provenance,
- retention,
- Ground Truth synchronization fields.

**Prerequisites (LTE_R1 manifest inputs):** Phase 2D Signal Value / Physics Matrix · Phase 2E DIMO Redundancy / Canonicalization · Phase 2F DIMO Capability-First Acquisition Strategy.

**Status:** **NEXT** (Phase 2F design authority complete; manifest freeze pending)

**Gate:** Completion of **2F.1** ungates **Phase 3A only** — not 3B/3C/3D.

### 2G. DIMO Connection Variant Audit
Explicitly audit **`DIMO_SMART5`** and **`DIMO_TESLA_DIRECT`** against **`DIMO_LTE_R1`** (primary DIMO reference baseline):
- signal surface,
- actual values,
- cadence,
- timestamp behavior,
- historical availability,
- provider events / native-event capability,
- detector implications,
- confidence / assessability implications.

LTE R1 remains the **primary DIMO reference baseline**. Neither Smart5 nor Tesla Direct audit blocks LTE R1 Phase 3A.

**Profile-scoped outputs:**

| Profile | Audit output | Manifest | Ungates |
|---------|--------------|----------|---------|
| **Smart5** | Smart5 capability/cadence/timestamp audit vs LTE R1 (equivalence **not assumed**) | `DIMO_SMART5` Flight Recorder manifest | **Phase 3C** |
| **Tesla Direct** | Tesla Direct capability/cadence/latency/HF audit (independent) | `DIMO_TESLA_DIRECT` Flight Recorder manifest | **Phase 3B** |

### 2H. High Mobility Provider Surface / OEM Capability Audit
Perform for **High Mobility** the same class of work already done for DIMO:
- current API/MQTT acquisition surface,
- signal catalog,
- event/state surfaces,
- timestamp semantics,
- effective cadence,
- retention,
- OEM/model variance,
- permission/scope variance,
- vehicle-specific inventories,
- available-but-unused signals,
- query/subscription scaling,
- persistence,
- downstream consumers,
- capability matrix.

**No DIMO assumptions may be reused without proof.**

High Mobility must produce **OEM/profile-specific manifests**. Only **High Mobility target validation tracks** (Phase 3D) are gated by Phase 2H and corresponding manifests.

**High Mobility completion is NOT a prerequisite for `DIMO_LTE_R1` Ground Truth validation.**

### 2I. Cross-Provider Canonical Contract Consolidation / Provider Parity & Governance
**Role correction:** Phase 2I is **not** the universal prerequisite for all Phase 3 reference programs.

After provider-specific knowledge exists, Phase 2I reconciles **`DIMO_LTE_R1`**, **`DIMO_SMART5`**, **`DIMO_TESLA_DIRECT`**, and **High Mobility** for:

- final cross-provider canonical contracts,
- equivalence classes,
- fallback hierarchy across providers,
- cross-provider confidence policy,
- parity gaps,
- common reporting semantics.

Provider-specific reference testing (3A–3D) may **already have started** before complete cross-provider closure. Profile-specific manifests are owned by **2F.1 / 2G / 2H**, not deferred exclusively to 2I.

**Phase 2 deliverables (consolidated):**
1. Current Snapshot Query Inventory. *(2A — DONE)*
2. Current Active-Trip Live Poll Inventory. *(2A — DONE)*
3. Current HF/Time-Series Query Inventory. *(2A — DONE)*
4. Native Event/Segment Inventory. *(2A — DONE)*
5. Four-Vehicle 2026-08-30 Capability Matrix. *(2B — DONE)*
6. Current schema expansion audit. *(2C — DONE)*
7. Signal value/physics matrix. *(2D — DONE)*
8. Connection/powertrain stratification baseline. *(2D.0 — DONE via amendment)*
9. DIMO canonicalization. *(2E — DONE)*
10. DIMO capability-first acquisition strategy. *(2F — DONE)*
11. **`DIMO_LTE_R1` reference manifest.** *(2F.1 — NEXT; ungates 3A)*
12. DIMO connection-variant audits + Smart5/Tesla manifests. *(2G)*
13. High Mobility OEM/profile audits + HM manifests. *(2H)*
14. Cross-provider canonical consolidation / parity governance. *(2I)*
15. Prioritized query expansion proposal + query/storage/cost impact assessment.

### 2J. Profile-Scoped Validation Gates (not a global Phase 3 gate)
Use **`PROFILE_SCOPED_VALIDATION_GATES`** (§1.6.8a). A connection/powertrain combination may start its own Flight Recorder / Reference Program once the **target-profile** provider/signal/physics/manifest work is complete.

**Do not** block **`DIMO_LTE_R1`** Phase 3A on Smart5 audit · Tesla Direct audit · High Mobility audit · or full Phase 2I cross-provider closure.
### 2A Status — DONE (2026-08-31)
Deliverable: `docs/audits/dimo-phase-2a-current-query-surface-audit-2026-08-31.md`

**Exit criteria met (code/schema audit):** All discovered DIMO query definitions and invocation contexts classified — **27 registry entries** (`DIMO-Q001`–`DIMO-Q027`) = **22 UNIQUE_QUERY_DEFINITIONS** (13 production-active + 4 on-demand + 4 diagnostic + 1 dead) + **5 NON_DEFINITION_INVOCATION_CONTEXTS** (3 production + 1 legacy + 1 shadow); **41 unique signal field names** inventoried; TDI consumer taxonomy aligned with Phase 1 (query-level vs signal-level separated); retention classes per domain; formula-driven post-trip request models documented; theoretical scaling recomputed (snapshot ACTIVE_DRIVING = 2 calls/**min**, 120/hour, 2,880/day); **20** runtime probes backlog.

**Capability architecture verdict:** `PARTIALLY_CAPABILITY_AWARE` — `availableSignals`/`dataSummary` preflight persists capability probes (7-day gate) but does **not** drive snapshot/live/HF/event query field selection; all driving queries remain static fleet-wide profiles.

**Material Phase 2A findings:**
- Registry semantics (mutually exclusive): **27 = 22 unique definitions + 5 invocation contexts** (Q014/Q016/Q024/Q026/Q027 reuse Q013/Q015/Q023/Q009/Q022 builders — not separate GraphQL definitions).
- **41 unique signal field names** queried across builders; Q001 = 33 GraphQL selections (32 telemetry + `lastSeen` metadata).
- TDI taxonomy corrected per Phase 1: **DIRECT_COMPOSITE_FEATURE_SOURCE** only for native harsh events + HF detector paths; **LOAD_COMPONENT_ONLY** for live perf avgs; Q027 EventContext = enrichment quality, **not** composite; query-level `QUERY_HAS_COMPOSITE_RELEVANT_OUTPUT` separated from signal-level classes.
- REQUESTED_BUCKET (`1s`/`7s`/`15s`/`20s`) ≠ proven OBSERVED_PROVIDER_CADENCE — runtime probes required before treating bucket size as sample frequency.
- No per-HF-point SynqDrive receive timestamp; provider→SynqDrive latency not measurable for kinematic replay (Phase 3 blocker input).
- Raw HF not in Postgres; ClickHouse HF mirror optional (`HF_MIRROR_ENABLED=false` default), 6-signal subset — PARTIAL_REPLAY_ONLY.
- ACTIVE_TICK: **3 parallel DIMO calls every ~30s** per active trip (THEORETICAL_MAX = NORMAL_PATH, CONFIRMED) dominates burst API load at concurrent-trip scale.
- Snapshot ACTIVE_DRIVING tier: **2 calls/min**, 120/hour, **2,880/day** per vehicle (not 2/hour).
- Post-trip volume is **formula-driven** (not flat 6–8/trip); LTE_R1 runs **two full-trip Q009 HF fetches** per completed trip.
- VehicleLatestState = **LATEST_STATE_UNTIL_OVERWRITTEN** (not append-only snapshot history); ClickHouse optional `HISTORICAL_TTL_180D`.
- Provider schema claims limited to **CURRENT_SYNQDRIVE_REFERENCED_DIMO_SURFACE** + `CONFIRMED_FROM_CODE`; no current DIMO introspection artifact verified in this audit.
- Four vehicle inventory files **PRESENT_ON_MAIN_AFTER_MERGE** (PR #1458); Phase 2B synthesis complete and reproducible from `main`.

**Phase 2 overall:** IN_PROGRESS (2A+2B+2C+2D.0+2D+2E+**2F** done; **2F.1 NEXT**; 2G–2I not started). Validation uses **profile-scoped gates** (§1.6.8a).

### 2B Status — DONE (2026-08-31)
Deliverable: `docs/audits/dimo-phase-2b-four-vehicle-capability-gap-matrix-2026-08-31.md` (+ four vehicle inventory source docs in same PR)

**Exit criteria met (forensic synthesis):** All four vehicle inventories ingested from canonical repo paths; **70-row** cross-vehicle capability matrix; query effectiveness and **static selection mismatch** quantified; `LISTED_NON_NULL_AT_AUDIT` assessed (not over-claimed as full reliability); provider vs score consumption separated for native events; RP-01–RP-20 reconciled + **11** new probes (RP-21–RP-31).

**Material Phase 2B findings (evidence-corrected):**
- Union **33** vehicle signals; **28** common; **15** `AVAILABLE_NOT_IN_PHASE2A_DRIVING_ACQUISITION`.
- Q001 **`STATIC_SELECTION_MISMATCH_RATE` = 65.6%** (21/32 null/inapplicable selections) — **CONFIRMED_ARCHITECTURAL_INEFFICIENCY**; provider/payload cost **UNKNOWN_REQUIRES_MEASUREMENT**.
- `LISTED_NON_NULL_AT_AUDIT` = 100% at audit observation — does **not** prove freshness/cadence/historical support (C63 mixed timestamps).
- Hardware profile → signal capability **NOT_ESTABLISHED_FROM_THIS_FOUR_VEHICLE_SET** (3/4 profiles UNKNOWN).
- Provider native events **0 / 34 / 0 / 50** per 30d; **CURRENT_SCORE_CONSUMPTION** UNKNOWN for C63 (RP-25).
- **NO_DIMO** tire/brake/yaw/lateral/long-accel signals in four inventories (≠ physical vehicle equipment claims).
- Q009: **9/15** vehicle-observed, **3/15** powertrain-inapplicable, **3/15** queried-not-observed (Tiguan exposes `ActualGear` while Q009 queries `CurrentGear` — **PARALLEL_GEAR_FIELD_GAP**, not proven alias).

### 2C Status — DONE (2026-08-31)
Deliverable: `docs/audits/dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md`

**Exit criteria met (schema forensics):** Tier-1 read-only GraphQL introspection at `https://telemetry-api.dimo.zone/query` (2026-08-31); official DIMO docs cross-checked; **117** current telemetry signal fields cataloged; SynqDrive vs schema vs four-vehicle diffs complete; driving/brake/tire/EV/regen intensive search; events/segments/parallel-signal taxonomy/SDK lag assessed; Gold Signals Matrix + **20** Phase-2D technical candidates; RP-32–RP-39 added.

**Material Phase 2C findings:**
- **GLOBAL_PROVIDER_SCHEMA_CAPABILITY = 117** telemetry fields (0 deprecated in introspection snapshot).
- SynqDrive queries **41/117 (35%)**; **76** schema fields never selected; **SET 5 stale references = 0**; **SET 4 = 15** `VEHICLE_OBSERVED_NOT_IN_PHASE2A_DRIVING_ACQUISITION` (not blanket “aliases”).
- Four-vehicle union **33/117**; **84** schema fields not observed on audit set — global schema ≠ vehicle delivery.
- **No** longitudinal/lateral acceleration or steering-angle fields; **`angularVelocityYaw`** + **front wheel-speed pair only** + four **hydraulic** brake inputs in schema — none on four ICE inventories.
- **PARALLEL_GEAR_FIELD_GAP** / **PARALLEL_THROTTLE_SIGNALS** — coexistence in schema ≠ proven interchangeability (RP-35).
- **REGEN_SIGN_SEMANTICS:** `powertrainTractionBatteryCurrentPower` **positive = into battery**; regen candidate requires synchronized decel context — not negative power.
- **NO_GENERIC_MASS_SIGNAL_CONFIRMED** for Pkw; commercial axle-row weights only (`Row3/4/5`).
- **OPEN_ENDED_EVENT_NAME_SURFACE** — Q015 filters (8) ≠ exhaustive event catalog; `CURRENT_GLOBAL_EVENT_NAME_COUNT = UNKNOWN_OPEN_ENDED`.
- SDK **1.6.0** vs **1.7.0** — no embedded schema types; introspection authoritative.
- **Output-domain schema ceiling:** Driver Quality, Vehicle Load, Brake Physics / Brake Load, Tire Dynamic Load each **MODERATE** at schema layer — **LOWER** on four-vehicle layer for brake/tire/driver dynamics. Four **independent** output domains; **no** cross-domain weighting or global composite defined. Data Confidence remains **orthogonal** (Master Plan §1.1).

### 2D.0 Status — DONE (2026-08-31)
**Connection & Powertrain Stratification Baseline** — architectural taxonomy frozen via this Master Plan amendment (§1.6; documentation-only; no runtime validation yet).

**Goal:** Freeze provider/connection/powertrain taxonomy before Signal Value / Physics evaluation.

**Deliverables (this amendment):**
- Canonical connection-profile taxonomy: `DIMO_LTE_R1`, `DIMO_SMART5`, `DIMO_TESLA_DIRECT`, `HIGH_MOBILITY_API_MQTT`
- Canonical powertrain taxonomy: `ICE_GASOLINE`, `ICE_DIESEL`, `PHEV`, `BEV` (+ optional `HEV` reserve)
- Provider vs connection-profile distinction (§1.6.2)
- Capability/provenance rules + provider-neutral canonical intelligence pipeline (§1.6.5)
- Validation matrix structure + evidence statuses (§1.6.8)
- Test-profile matrix dimensions (`connectionProfile` × `powertrainProfile` × `vehicle`)
- Flight Recorder profile dimensions for future Phase 3A–3D tracks
- **`PROFILE_SCOPED_VALIDATION_GATES`** — no global Phase 3 gate on 2I (§1.6.8a)

**Important:** Every runtime capability statement remains subject to provider/vehicle testing. This phase establishes **architecture**, not measured equivalence.

### 2D Status — DONE (2026-08-31)
Deliverable: `docs/audits/dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md`

**Exit criteria met (documentation analysis):** **20** main-track + **7** secondary + **3** commercial candidates reconciled; every unique candidate scored across Driver Quality · Vehicle Load · Brake Physics · Tire Load · Validation (**no mega-score**); incremental information gain · physics directness · cadence/latency/sync · powertrain applicability · derived-feature opportunities · signal chains · double-counting map · priority tiers · Pareto set · **`PHYSICAL_EPISODE_IDENTITY`** handoff · final consistency/evidence/physics QA pass complete.

**Material Phase 2D findings:**
- **Tier A foundational:** **8** (`D2D-001` yaw · `D2D-002/003` wheel speeds · `D2D-012–015` brake hydraulics · `D2D-020` battery power)
- **Cadence-critical:** **6** · **Latency-critical:** **2** (`D2D-014/015` only; `LATENCY_HIGH_OR_CRITICAL_COUNT=8`) · **`TARGET_LE_1S_EXACT_COUNT=8`** · **Target ≤500ms:** **8**
- **Top physics gap:** no direct long/lat accel — speed+yaw derived proposals required
- **Highest incremental gain:** brake hydraulics (**VERY_HIGH**) — SynqDrive has no direct hydraulic input today; **0/4** audit coverage
- **PHEV/BEV regen:** `powertrainTractionBatteryCurrentPower` **PRIMARY** — positive = into battery; synchronized decel context required
- **Double-counting / episode identity:** one braking episode = multiple evidence channels — Phase 2E must canonicalize under **`PHYSICAL_EPISODE_IDENTITY`** (not seven independent offenses)
- **TPS semantics:** `THROTTLE_POSITION != ACCELERATOR_PEDAL_POSITION` — empirical reconstruction confidence **`UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION`**
- **Phase 2E handoff groups:** throttle/TPS · gear parallel fields · brake episode paths · wheel speed hierarchy · tire pressure vs warning · battery/regen · temperatures
- **Phase 3A remains `GATED_ON_LTE_R1_MANIFEST`** — 2D complete is prerequisite **1 of 4** for LTE_R1 manifest path (still requires 2E + 2F + 2F.1)

### 2E Status — DONE (2026-08-31)
Deliverable: `docs/audits/dimo-phase-2e-redundancy-canonicalization-2026-08-31.md`

**Exit criteria met (documentation analysis):** Phase-2D handoff groups classified; L0–L4 layer model; **33** canonical signal keys (Appendix B authority); **16** redundancy groups; relationship + source-authority taxonomies; episode taxonomy separated (3 base · 2 composite · 2 exposure · 1 context subtype); **`PHYSICAL_EPISODE_IDENTITY`** invariants; episode evidence/dedup model; fallback/precedence matrices; provenance contract; acquisition lineage; double-counting + cross-domain rules; legacy impact map; Phase 2F handoff; **24** decisions — **no production changes**.

**Material Phase 2E findings:**
- **Canonical signals:** **33** expanded `CAN_*` keys · **16** redundancy groups (`D2E-R01`…`R16`)
- **Pending equivalences:** **2** (throttle pair · CurrentGear↔ActualGear) — torque vs torque-% **complementary**, not pending equivalence
- **`NO_VALID_FALLBACK` families:** **6**
- **Episode taxonomy:** **3** base maneuvers · **2** composite/sequence · **2** exposure states · **1** context subtype (`HIGH_SPEED_BRAKING` on `BRAKING`, not peer episode)
- **`NO_VALID_FALLBACK` families:** **6** (hydraulic pressure, yaw, wheel speeds, tire pressure group, battery regen HF, native cornering on Smart5)
- **Physical episode types:** **8** — braking multichannel → **1** canonical episode (not 7 offenses)
- **Major double-counting risks:** LTE_R1 native `DrivingEvent` + HF reconstructed/abuse on same trip · brake C1/C2 must not double-weight
- **Throttle rule preserved:** `THROTTLE_POSITION != ACCELERATOR_PEDAL_POSITION`
- **Phase 3A remains `GATED_ON_LTE_R1_MANIFEST`** — 2E complete is prerequisite **2 of 4** (still requires 2F + 2F.1)

### 2F Status — DONE (2026-08-31)
Deliverable: `docs/audits/dimo-phase-2f-capability-first-acquisition-strategy-2026-08-31.md`

**Exit criteria met (documentation design):** VCM contract deterministic; provider/connection/powertrain independently represented; capability state machine (10 states); CAN-001…CAN-033 acquisition matrix; signal existence vs temporal usability separated; acquisition tiers T0–T7; 5 analysis requirement profiles; 14-step query planner; fallback hierarchy explicit; native vs reconstructed evidence strategy; detector/feature eligibility + confidence ceilings; powertrain-specific acquisition; scaling scenarios; cache/revalidation/invalidation; versioning/reproducibility; 2F.1 handoff contract; **47** runtime probes backlog — **no production changes**.

**Material Phase 2F findings:**
- **Vehicle Capability Manifest (VCM v1):** per-vehicle JSON contract extending `VehicleDrivingCapability` — identity, provider capability, temporal capability, acquisition capability, quality, analysis/detector eligibility, fallback, retention
- **Capability state machine:** `UNKNOWN` → `SCHEMA_SUPPORTED` → `LISTED_AVAILABLE` → `OBSERVED_NON_NULL` → `TEMPORALLY_CHARACTERIZED` → `CADENCE_VALIDATED` / `SOURCE_VALIDATED` → `ANALYSIS_ELIGIBLE` | `DEGRADED_ELIGIBLE` | `NOT_AVAILABLE` | `INAPPLICABLE_POWERTRAIN` | `STALE_VALIDATION` — **`availableSignals` alone does not prove cadence or detector suitability**
- **Acquisition tiers T0–T7:** T0 operational latest → T7 validation Flight Recorder (manifest selection deferred to 2F.1)
- **Analysis requirement profiles:** DRIVER_QUALITY · VEHICLE_LOAD · BRAKE_PHYSICS · TIRE_DYNAMIC_LOAD · GROUND_TRUTH_VALIDATION — physical need, not query names
- **Query planner:** 14-step deterministic algorithm — resolve provider/profile/powertrain → load VCM → intersect requirements → source hierarchy → cadence → surface → dedupe → gate detectors → fallbacks → confidence ceiling → acquisition plan
- **Current-state gap (CONFIRMED_FROM_CODE):** static fleet-wide query builders; preflight persists but **does not gate** productive field selection; ACTIVE_TICK = **3 parallel GraphQL calls / ~30s**; HF 1s **POST_TRIP_ONLY**
- **Scaling (theoretical):** Q001-shaped snapshot −40% fields target; measured API cost reduction **`UNKNOWN_REQUIRES_MEASUREMENT`**
- **Phase 2E invariants preserved:** throttle ≠ pedal; torque complementary; brake `CIRCUIT_COMPLEMENT`; six `NO_VALID_FALLBACK` families; native events ≠ physical maneuver identity
- **Phase 3A remains `GATED_ON_LTE_R1_MANIFEST`** — 2F complete is prerequisite **3 of 4** (still requires 2F.1 manifest freeze)

### Status (Phase 2 overall)
**IN_PROGRESS**

| Subphase | Status |
|----------|--------|
| 2A | DONE |
| 2B | DONE |
| 2C | DONE |
| 2D.0 | DONE |
| **2D** | **DONE** |
| **2E** | **DONE** |
| **2F** | **DONE** |
| **2F.1** LTE_R1 manifest | **NEXT** |
| 2G | NOT_STARTED |
| 2H | NOT_STARTED |
| 2I | NOT_STARTED |

The older July DIMO capability audit is HISTORICAL_EVIDENCE only.
---
## Phase 3 — Telemetry Flight Recorder
**Goal:** capture raw, timestamped evidence for the signal set selected in Phase 2 without changing scoring behavior.

**Gating model:** **`PROFILE_SCOPED_VALIDATION_GATES`** (§1.6.8a) — **no global gate** on Phase 2I or High Mobility completion. Each reference program ungates when its **target-profile manifest** is frozen.

**Provider-profile validation tracks:**

### Phase 3A — DIMO LTE_R1 Reference Program
**PRIMARY** calibration/reference workstream · **`GATED_ON_LTE_R1_MANIFEST`**

**May start when:** the **`DIMO_LTE_R1`** target-profile manifest (Phase **2F.1**) is frozen.

**LTE_R1 manifest prerequisites:**
- Phase 2D Signal Value / Physics Matrix
- Phase 2E DIMO Redundancy / Canonicalization
- Phase 2F DIMO Capability-First Acquisition Strategy
- **`DIMO_LTE_R1`-specific Flight Recorder signal manifest (2F.1)**

**Does NOT require:** Smart5 runtime audit · Tesla Direct audit · High Mobility audit · full cross-provider Phase 2I closure.

Use real LTE R1 vehicles for:
- raw telemetry capture,
- cluster/video synchronization,
- cadence measurement,
- event reconstruction,
- native-event comparison,
- sampling invariance.

Current four primary DIMO audit vehicles align with this profile per project baseline.

**Status:** **NOT_STARTED — `GATED_ON_LTE_R1_MANIFEST`**

### Phase 3B — DIMO Tesla Direct Reference Program
**`GATED_ON_TESLA_DIRECT_MANIFEST`**

**May start when:** Tesla Direct capability/cadence audit (Phase 2G) + **`DIMO_TESLA_DIRECT` Flight Recorder manifest** are complete. Does **not** block Phase 3A.

Use real Tesla direct connection (`DIMO_TESLA_DIRECT` + `BEV`). Measure independently: signal set, cadence, latency, historical behavior, EV/regen observability, reconstruction quality. Do **not** inherit LTE R1 assumptions.

**Status:** **NOT_STARTED — `GATED_ON_TESLA_DIRECT_MANIFEST`**

### Phase 3C — DIMO Smart5 Compatibility Program
**`GATED_ON_SMART5_MANIFEST`**

**May start when:** Smart5 capability/cadence audit (Phase 2G) + **`DIMO_SMART5` Flight Recorder manifest** are complete. Does **not** block Phase 3A.

When a Smart5-equipped reference vehicle is available (`DIMO_SMART5`): validate signal/cadence/timestamp divergence vs LTE R1 (equivalence **not assumed**), absence of native events, reconstructed-event performance, confidence/assessability impact (not score penalty for missing native events).

**Status:** **NOT_STARTED — `GATED_ON_SMART5_MANIFEST`**

### Phase 3D — High Mobility OEM-specific Reference Program
**`GATED_ON_HIGH_MOBILITY_PROFILE_MANIFEST`**

**May start when:** relevant High Mobility OEM/profile audit (Phase 2H) + **HM profile-specific manifest** are complete. Does **not** block Phase 3A. High Mobility completion is **NOT** a prerequisite for DIMO LTE R1 Ground Truth validation.

Validation must be **OEM/model-specific** where capabilities differ. No DIMO assumptions without proof.

**Status:** **NOT_STARTED — `GATED_ON_HIGH_MOBILITY_PROFILE_MANIFEST`**

**Phase 1 input (F-14):** Postgres does not store original DIMO HF time series; ClickHouse HF mirror is optional/partial. Flight Recorder must close the kinematic replay gap for Phase 6 sampling-invariance and Phase 13 governance.
### Recorder requirements
For each observation retain, where available:
- vehicle/provider identity,
- **connectionProfile**,
- **powertrainProfile**,
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
### Status (Phase 3 overall)
Each sub-track has its **own profile-scoped gate** (§1.6.8a). See 3A–3D status above. **No single global “Phase 3 gated on 2I” statement.**
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
| Read 2026-08-30 Tiguan signal gap audit | DONE | Phase 2B — git commit `0bab8a4d3` |
| Read 2026-08-30 C63 AMG signal gap audit | DONE | Phase 2B — git commit `5a440c60d` |
| Read 2026-08-30 Audi A4 signal gap audit | DONE | Phase 2B — git commit `caeaa3aa4` |
| Read 2026-08-30 Arteon signal gap audit | DONE | Phase 2B — git commit `c2a0e1c5e` |
| Snapshot query inventory | DONE | Phase 2A audit §4–6 (27 registry entries / 22 unique definitions) |
| Active-trip/live polling query inventory | DONE | Phase 2A audit §7–8 |
| HF/time-series query inventory | DONE | Phase 2A audit §9–10 |
| Native event/segment inventory refresh | DONE | Phase 2A audit §12–13 |
| Phase 2A query-surface audit | DONE | `dimo-phase-2a-current-query-surface-audit-2026-08-31.md` |
| Phase 2B four-vehicle capability matrix | DONE | `dimo-phase-2b-four-vehicle-capability-gap-matrix-2026-08-31.md` + 4 inventory docs |
| Four-vehicle capability matrix | DONE | Phase 2B deliverable (70 rows) |
| Available-but-unused DIMO signal matrix | DONE | Phase 2B §8 — 15 signals (Phase-2A driving acquisition) |
| Phase 2C schema expansion audit | DONE | `dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md` — 117 schema fields |
| Phase 2D.0 connection/powertrain stratification baseline | DONE | Master Plan §1.6 — taxonomy frozen (architecture only) |
| Phase 2D signal value/physics matrix | DONE | `dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md` — Tier A: **8** · cadence-critical: **6** · latency-critical: **2** · `TARGET_LE_1S_EXACT_COUNT=8` · QA pass complete |
| Phase 2E DIMO redundancy / canonicalization | DONE | `dimo-phase-2e-redundancy-canonicalization-2026-08-31.md` — **33** canonical keys · **16** groups · episode taxonomy QA pass |
| Phase 2F DIMO capability-first acquisition | DONE | `dimo-phase-2f-capability-first-acquisition-strategy-2026-08-31.md` — VCM · T0–T7 · 14-step planner · **47** runtime probes |
| Phase 2F.1 DIMO LTE_R1 reference manifest | NEXT | Ungates Phase 3A only |
| Phase 2G DIMO connection-variant audit | NOT_STARTED | Smart5 + Tesla Direct vs LTE R1; profile manifests |
| Phase 2H High Mobility provider/OEM audit | NOT_STARTED | No DIMO assumptions; does not block LTE R1 |
| Phase 2I cross-provider consolidation | NOT_STARTED | Parity/governance after provider-specific knowledge |
| Prioritized query expansion proposal | NOT_STARTED | Phase 2D+ |
| Phase 3A DIMO LTE_R1 reference program | NOT_STARTED | `GATED_ON_LTE_R1_MANIFEST` (2D+2E+2F+2F.1) |
| Phase 3B DIMO Tesla Direct reference program | NOT_STARTED | `GATED_ON_TESLA_DIRECT_MANIFEST` |
| Phase 3C DIMO Smart5 compatibility program | NOT_STARTED | `GATED_ON_SMART5_MANIFEST` |
| Phase 3D High Mobility OEM reference program | NOT_STARTED | `GATED_ON_HIGH_MOBILITY_PROFILE_MANIFEST` |
| Flight Recorder implementation | NOT_STARTED | Profile-scoped; first track: 3A after 2F.1 |
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
2. ~~Merge the four 2026-08-30 vehicle signal-inventory files to `main` under `docs/audits/`.~~ **Done in PR #1458** — PRESENT_ON_MAIN_AFTER_MERGE.
3. ~~Execute Phase 2A against current code.~~ **Done** — see Phase 2A audit.
4. ~~Execute Phase 2B: merge Phase 2A with four vehicle capability inventories.~~ **Done** — see Phase 2B audit.
5. ~~Execute Phase 2C: CURRENT DIMO SIGNAL/SCHEMA EXPANSION AUDIT.~~ **Done** — see Phase 2C audit (`117` schema fields; introspection authority).
6. ~~Execute Phase 2D.0: Connection & Powertrain Stratification Baseline.~~ **Done** — see Master Plan §1.6 (architecture amendment 2026-08-31).
7. ~~Execute Phase 2D: Signal value / physics matrix.~~ **Done** — see Phase 2D audit (`20` main-track candidates scored).
8. ~~Execute Phase 2E: DIMO redundancy / canonicalization (Phase 2D handoff groups).~~ **Done** — see Phase 2E audit (`33` canonical keys, `PHYSICAL_EPISODE_IDENTITY`).
9. ~~**Execute Phase 2F:** DIMO capability-first acquisition strategy (Phase 2E handoff).~~ **Done** — see Phase 2F audit (VCM contract, T0–T7 tiers, query planner, CAN-001…CAN-033 matrix).
10. **Execute Phase 2F.1:** `DIMO_LTE_R1` reference manifest → **ungate Phase 3A** LTE R1 Reference Program.
11. **Execute Phase 3A** (LTE R1) — primary validation/calibration track. **Does not wait** for steps 12–14.
12. **Execute Phase 2G:** Smart5 + Tesla Direct connection-variant audits + profile manifests → ungate 3B/3C when ready.
13. **Execute Phase 2H:** High Mobility OEM/profile audit + manifests → ungate 3D when ready.
14. **Execute Phase 2I:** Cross-provider canonical consolidation / parity governance (after provider-specific knowledge exists).
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
