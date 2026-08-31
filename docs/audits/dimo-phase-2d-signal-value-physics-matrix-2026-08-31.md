# DIMO Phase 2D — Signal Value / Physics Matrix

**Date:** 2026-08-31  
**Status:** DONE (final consistency / evidence / physics QA pass)  
**Scope:** Signal value · physics/information-gain · cadence · multi-domain ranking (documentation only)  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Phase gate:** Phase 2D **DONE** · Phase 2E **NEXT** · Phase 2F/2F.1 **NOT_STARTED** · Phase 3A **`GATED_ON_LTE_R1_MANIFEST`**

---

## 1. Executive Summary

Phase 2D evaluates **20** Phase-2C main-track candidates + **7** secondary + **3** commercial-only fields (**30** total candidate rows) across **five independent dimensions** (Driver Quality · Vehicle Load · Brake Physics · Tire Dynamic Load · Data Confidence). **No summed mega-score.**

**Authority:** Appendix A and Appendix B candidate rows are the count authority. Summary tables below are recomputed from those rows — not copied from prior PR text.

| Metric | Count | Authority IDs / note |
|--------|------:|---------------------|
| Main-track candidates | **20** | D2D-001…D2D-020 |
| Secondary candidates | **7** | D2D-S01…D2D-S07 |
| Commercial-only | **3** | D2D-C01…D2D-C03 |
| **Total candidate rows** | **30** | exclusive registry |
| Tier A Foundational | **8** | `D2D-001`, `D2D-002`, `D2D-003`, `D2D-012`, `D2D-013`, `D2D-014`, `D2D-015`, `D2D-020` |
| Tier B High value | **11** | see §31 |
| Tier C Context/validation | **8** | see §31 |
| Tier D Defer | **3** | `D2D-C01`, `D2D-C02`, `D2D-C03` |
| Pareto candidates | **8** | see §32 |
| Cadence-critical (`CadSens=CRITICAL`) | **6** | D2D-002, D2D-003, D2D-012–015 |
| Latency-critical (`LatSens=CRITICAL`) | **2** | `D2D-014`, `D2D-015` only |
| Latency HIGH or CRITICAL | **8** | D2D-001–003, D2D-012–015, D2D-020 |
| **`TARGET_LE_1S_EXACT_COUNT`** | **8** | design target ≤1s: D2D-001–003, D2D-012–015, D2D-020 |
| Target cadence ≤500ms | **8** | includes 250ms brake circuits |
| 30s-sufficient (`CadSens=LOW`) | **16** | slow/context candidates |
| Four-vehicle coverage 0/4 | **21** | high physics value + zero audit observation |

**Top physics gaps:** no direct long/lat accel; brake hydraulics highest incremental gain (0/4 coverage); yaw/wheel speeds enable derived lateral / wheel-speed-consistency proxies (0/4); battery power foundational for PHEV/BEV regen candidate analysis.

**Primary profile:** `DIMO_LTE_R1`. Other connection profiles **UNVERIFIED** in this phase.

---

## 2. Scope & Authorities

Documentation-only analysis. Authorities: Master Plan · Phase 2A/2B/2C audits · Phase 1 forensic audit. Source modules read for incremental-gain context only — **unchanged**.

**Explicitly out of scope for Phase 2D:** production logic · query changes · runtime probes · new signals · score implementation · Flight Recorder manifest selection.

---

## 3. Methodology

1. Reconcile Phase 2C candidate IDs (30 exclusive rows).
2. Score 0–5 per domain independently (**not summed**).
3. Classify physics directness with sharpened taxonomy (§7).
4. Assign three-level identity: provider field · signal family · physical information source (§7.1).
5. Assign cadence sensitivity per row; distinguish physics minimum · design target · empirically validated cadence (§8).
6. Assign latency sensitivity per row (§9) — family names are **not** candidate counts.
7. Verify acquisition path vs Phase 2A/2B (Appendix A `CURRENT_ACQUISITION_PATH`).
8. Apply documented Tier rules (§31) and Pareto dominance rules (§32).
9. Hand off redundancy / episode identity questions to Phase 2E (§34).

---

## 4. Candidate Registry

### 4.1 Main track (20)

| ID | DIMO field | Family ID | Physical information source |
|----|------------|-----------|----------------------------|
| D2D-001 | `angularVelocityYaw` | `FAM-YAW` | YAW_RATE |
| D2D-002 | `chassisAxleRow1WheelLeftSpeed` | `FAM-WHEEL-SPEED` | WHEEL_ROTATIONAL_SPEED (FL) |
| D2D-003 | `chassisAxleRow1WheelRightSpeed` | `FAM-WHEEL-SPEED` | WHEEL_ROTATIONAL_SPEED (FR) |
| D2D-004 | `powertrainCombustionEngineTPS` | `FAM-THROTTLE` | ENGINE_THROTTLE_POSITION |
| D2D-005 | `powertrainTransmissionActualGear` | `FAM-GEAR` | TRANSMISSION_GEAR |
| D2D-006 | `powertrainTransmissionActualGearRatio` | `FAM-GEAR` | TRANSMISSION_GEAR_RATIO |
| D2D-007 | `powertrainTransmissionSelectedGear` | `FAM-GEAR` | TRANSMISSION_SELECTED_GEAR |
| D2D-008 | `powertrainCombustionEngineTorque` | `FAM-TORQUE` | REPORTED_ENGINE_TORQUE |
| D2D-009 | `powertrainCombustionEngineTorquePercent` | `FAM-TORQUE` | REPORTED_TORQUE_PERCENT |
| D2D-010 | `powertrainCombustionEngineMAF` | `FAM-AIRFLOW` | AIR_MASS_FLOW |
| D2D-011 | `powertrainTransmissionTemperature` | `FAM-TRANS-TEMP` | TRANSMISSION_TEMPERATURE |
| D2D-012 | `chassisBrakeIsPedalPressed` | `FAM-BRAKE-PEDAL` | BRAKE_PEDAL_SWITCH |
| D2D-013 | `chassisBrakePedalPosition` | `FAM-BRAKE-PEDAL` | BRAKE_PEDAL_POSITION |
| D2D-014 | `chassisBrakeCircuit1PressurePrimary` | `FAM-BRAKE-PRESSURE` | HYDRAULIC_BRAKE_PRESSURE (circuit 1) |
| D2D-015 | `chassisBrakeCircuit2PressurePrimary` | `FAM-BRAKE-PRESSURE` | HYDRAULIC_BRAKE_PRESSURE (circuit 2) |
| D2D-016 | `chassisAxleRow1WheelLeftTirePressure` | `FAM-TIRE-PRESSURE` | TIRE_PRESSURE_FL |
| D2D-017 | `chassisAxleRow1WheelRightTirePressure` | `FAM-TIRE-PRESSURE` | TIRE_PRESSURE_FR |
| D2D-018 | `chassisAxleRow2WheelLeftTirePressure` | `FAM-TIRE-PRESSURE` | TIRE_PRESSURE_RL |
| D2D-019 | `chassisAxleRow2WheelRightTirePressure` | `FAM-TIRE-PRESSURE` | TIRE_PRESSURE_RR |
| D2D-020 | `powertrainTractionBatteryCurrentPower` | `FAM-BATT-POWER` | TRACTION_BATTERY_POWER |

### 4.2 Secondary (7)

| ID | Field |
|----|-------|
| D2D-S01 | `currentLocationHeading` |
| D2D-S02 | `obdIntakeTemp` |
| D2D-S03 | `obdOilTemperature` |
| D2D-S04 | `obdBarometricPressure` |
| D2D-S05 | `obdStatusDTCCount` |
| D2D-S06 | `obdDistanceWithMIL` |
| D2D-S07 | `chassisTireSystemIsWarningOn` |

### 4.3 Commercial-only (3)

| ID | Field |
|----|-------|
| D2D-C01 | `chassisAxleRow3Weight` |
| D2D-C02 | `chassisAxleRow4Weight` |
| D2D-C03 | `chassisAxleRow5Weight` |

---

## 5. Multi-Domain Value Matrix

Independent 0–5 scores per domain — **not additive**. Full table: **Appendix A**.

**Highest scores (≥4):** DQ — brake pedal/pressure, yaw (TPS capped at 3 — see §10) · VL — torque, MAF, trans temp, battery power · BK — pedal, pressure, battery power · TR — yaw, wheel speeds, tire pressure ×4 · VA — brake pressure, battery power, health/diagnostic fields.

---

## 6. Incremental Information Gain

| Gain | Candidates |
|------|------------|
| VERY_HIGH | D2D-012–015 brake hydraulics · D2D-020 battery power (PHEV/BEV) |
| HIGH | D2D-001 yaw · D2D-002/003 wheel speeds |
| MODERATE | D2D-004 TPS · D2D-008–011 · D2D-016–019 (snapshot-queried, 0/4 observed) |
| LOW | D2D-006 · secondary context · commercial axle weights |

---

## 7. Physics Directness Taxonomy

**Deprecated in Phase 2D QA:** blanket `DIRECT_SYSTEM_INPUT`. Each candidate row uses one primary class:

| Class | Meaning | Examples |
|-------|---------|----------|
| `DRIVER_CONTROL_INPUT` | Human control channel when proven | *(none standalone in current 30 — brake pedal is chassis-reported)* |
| `SYSTEM_CONTROL_INPUT` | ECU/commanded setpoints | *(not claimed without provider proof — torque may be reported, not commanded)* |
| `DIRECT_PHYSICAL_MEASUREMENT` | Sensor measurement of physical quantity | yaw, wheel speed, tire pressure, MAF |
| `DIRECT_REPORTED_POWERTRAIN_STATE` | Provider-reported powertrain state | gear, torque, TPS |
| `DIRECT_REPORTED_CHASSIS_STATE` | Provider-reported chassis state | brake pedal switch/position |
| `DIRECT_REPORTED_HYDRAULIC_STATE` | Hydraulic brake circuit pressure | D2D-014/015 |
| `DIRECT_REPORTED_ENERGY_STATE` | Traction battery power flow | D2D-020 |
| `DIRECT_REPORTED_THERMAL_STATE` | Thermal state | D2D-011 |
| `PROVIDER_CLASSIFIED_EVENT` | Native event filters | out of 30-row registry; see §23 |
| `DERIVED_KINEMATIC_ENABLER` | Enables derived kinematics | speed (not in 30-row set) |
| `CONTEXT` | Environmental/context modifier | heading, barometric, intake temp |
| `DIAGNOSTIC` | Health/diagnostic indicator | DTC count, MIL distance, TPMS warning |
| `PROXY` | Indirect behavioral proxy | derived accel/jerk proposals |

**Specific assignments (QA corrections):**

- `chassisBrakeIsPedalPressed` / `chassisBrakePedalPosition` → `DIRECT_REPORTED_CHASSIS_STATE` (not generic system input).
- `chassisBrakeCircuit1/2PressurePrimary` → `DIRECT_REPORTED_HYDRAULIC_STATE` / physical source `HYDRAULIC_BRAKE_PRESSURE`.
- `powertrainTractionBatteryCurrentPower` → `DIRECT_REPORTED_ENERGY_STATE`.
- `powertrainCombustionEngineTorque` → `DIRECT_REPORTED_POWERTRAIN_STATE` unless code/provider evidence proves commanded torque (not established in Phase 2D).
- `powertrainCombustionEngineTPS` → `DIRECT_REPORTED_POWERTRAIN_STATE` / `ENGINE_THROTTLE_POSITION` — **not** accelerator pedal position (§10).
- `powertrainCombustionEngineMAF` → `DIRECT_PHYSICAL_MEASUREMENT` (air mass flow).
- Gear fields → `DIRECT_REPORTED_POWERTRAIN_STATE`.

### 7.1 Three-Level Identity Model

| Level | Name | Example |
|------:|------|---------|
| **L1** | `PROVIDER_FIELD` | `chassisBrakeCircuit1PressurePrimary`, `chassisBrakeCircuit2PressurePrimary` |
| **L2** | `SIGNAL_FAMILY` | `FAM-BRAKE-PRESSURE` |
| **L3** | `PHYSICAL_INFORMATION_SOURCE` | `HYDRAULIC_BRAKE_DEMAND` |

**Redundancy warning:** two L1 provider fields do **not** automatically mean two independent L3 information sources. Phase 2E must evaluate agreement, differential pressure, failure behavior, and canonical raw evidence need.

**Examples:**

| L1 fields | L2 family | L3 source | Independence note |
|-----------|-----------|-----------|-------------------|
| Circuit1 + Circuit2 pressure | `FAM-BRAKE-PRESSURE` | `HYDRAULIC_BRAKE_DEMAND` | correlated hydraulic paths — not double independent evidence |
| FL/FR/RL/RR tire pressure | `FAM-TIRE-PRESSURE` | wheel-position tire state | **distinct** positions — not redundant duplicates |
| Torque + torque percent | `FAM-TORQUE` | engine load | correlated — Phase 2E canonicalization |
| Left/right front wheel speed | `FAM-WHEEL-SPEED` | wheel rotational speed | distinct wheels; slip proxy needs extra context |

---

## 8. Cadence Requirements

Appendix B is authoritative. For every dynamic candidate distinguish:

| Term | Meaning |
|------|---------|
| `PHYSICS_MINIMUM_USEFUL_CADENCE` | Slowest cadence still physically meaningful for the signal class |
| `DESIGN_TARGET_CADENCE` | Phase 2F design hypothesis — **not** proof of sufficiency |
| `EMPIRICALLY_VALIDATED_CADENCE` | **`UNKNOWN_UNTIL_PHASE_3`** (Reference Drive / sampling invariance) |

**Cadence-critical (`CadSens=CRITICAL`, n=6):** D2D-002, D2D-003, D2D-012, D2D-013, D2D-014, D2D-015.

**HIGH cadence sensitivity:** D2D-001, D2D-008, D2D-009, D2D-020.

**LOW / 30s-sufficient (`CadSens=LOW`, n=16):** tire pressure ×4, thermal/context secondary fields, gear ratio, commercial weights, diagnostic slow fields.

`CURRENT_PROVIDER_CADENCE = UNKNOWN` — Phase 2A interval buckets do not prove effective cadence.

---

## 9. Latency / Alignment Requirements

**Per-row latency sensitivity** (Appendix A `LatSens` column). Family-level shorthand is **not** a candidate count.

| LatSens | Count | Candidate rows |
|---------|------:|----------------|
| CRITICAL | **2** | `D2D-014`, `D2D-015` |
| HIGH | **6** | `D2D-001`, `D2D-002`, `D2D-003`, `D2D-012`, `D2D-013`, `D2D-020` |
| MODERATE | **3** | `D2D-004`, `D2D-008`, `D2D-009` |
| LOW | **19** | remaining rows |

**`LATENCY_CRITICAL_CANDIDATE_COUNT = 2`** (CRITICAL only).

**`LATENCY_HIGH_OR_CRITICAL_COUNT = 8`**.

Brake pedal (`D2D-012/013`) and yaw/wheel/battery are **HIGH**, not CRITICAL — synchronized alignment matters, but hydraulic pressure onset/resolution is the strictest latency class.

Appendix E lists pairwise sync requirements for reconstruction chains.

---

## 10. Driver Quality Analysis

Driver Quality remains an **independent output dimension** — not a residual of Vehicle Load or Brake Physics.

**Severity ≠ behavior quality:** strong brake pressure describes a **severe braking maneuver**, not automatically poor driving. Later DQ needs necessity/context, anticipation, smoothness, ramp, release, sequence, accel→brake reversal, consistency.

### 10.1 Throttle / TPS semantics (mandatory)

**`THROTTLE_POSITION != ACCELERATOR_PEDAL_POSITION`** unless vehicle/provider evidence establishes equivalence (not established in Phase 2D).

Applies to:

- `powertrainCombustionEngineTPS` (`D2D-004`)
- `obdThrottlePosition` (Phase 2C parallel field — not separate 2D row)

TPS may serve as **acceleration intent proxy**, **engine demand context**, or **modulation proxy** — not a perfect driver-pedal measurement.

**DQ score correction:** `D2D-004` Driver Quality = **3** (not 4) — value is moderate proxy/context, not direct pedal input.

---

## 11. Vehicle Load Analysis

Vehicle Load remains a **full independent chain** — must not collapse into "engine telemetry score."

| Subcomponent | Current evidence | Candidate signal contribution | Remaining gap |
|--------------|-------------------|------------------------------|---------------|
| `LONGITUDINAL_DYNAMIC_LOAD` | speed-derived accel only | torque, TPS, MAF, battery power | no direct long accel |
| `POWERTRAIN_LOAD` | RPM/torque HF post-trip on some paths | D2D-008–010 | 0/4 for torque/MAF on audit set |
| `TRANSMISSION_LOAD` | partial gear on 1/4 | D2D-005–007, D2D-011 | selected gear 0/4 |
| `THERMAL_LOAD` | sparse | D2D-011, S02/S03 | trans temp 0/4 |
| `STOP_GO_CYCLING` | native events + speed | pedal, pressure, battery | hydraulic 0/4 |
| `HIGH_SPEED_EXPOSURE` | speed | context heading | — |
| `CHASSIS_DYNAMIC_LOAD` | derived yaw proxy | D2D-001–003 | yaw/wheel 0/4 |

Powertrain-specific applicability: ICE-G · ICE-D · PHEV · BEV (Appendix C).

---

## 12. Brake Physics Analysis

Brake Physics remains **independent** from Driver Quality and Vehicle Load.

**Chain:** demand → pedal (MEASURED 0/4) → pressure (MEASURED 0/4) → decel (DERIVED) → ΔE_kin (DERIVED) → regen/engine/friction (DERIVED) → thermal/wear dose (DERIVED).

### 12.1 Brake circuit double-evidence

`D2D-014` and `D2D-015` are two **provider fields** (L1), one **family** (L2), one **hydraulic demand class** (L3). Phase 2E must test agreement/differential/redundancy/failure — **do not** treat two circuits as double independent evidence for a single brake event load.

### 12.2 Brake energy — mass and grade

Retain kinetic energy reduction:

`ΔE_kin = 0.5 * m * (v_before² - v_after²)`

**Limitations:**

- Vehicle mass is **not** a generic DIMO passenger-car signal today — later use vehicle-spec/VIN/configured curb mass + payload assumptions.
- Separate **kinetic energy reduction** from **friction brake energy** and from **regen energy**.
- Grade potential `m*g*Δh` may materially affect deceleration/energy accounting; altitude/GPS resolution may limit this.
- Do **not** claim exact aero/rolling subtraction yet.

Pressure ≠ friction energy — **`REQUIRES_CALIBRATION`**.

### 12.3 Regen semantics (retained)

**Positive** `powertrainTractionBatteryCurrentPower` = energy **into** battery.

Positive pack power during deceleration is a **`REGEN_CANDIDATE`**, not proof that all positive power is regenerative braking. Later needs: speed derivative, brake context, powertrain state, charging sanity, timestamp alignment. No exact friction/regen split until validation.

---

## 13. Tire Dynamic Load Analysis

Tire Dynamic Load remains **independent**.

**Four tire pressure fields:** FL / FR / RL / RR are **distinct wheel-position states** — not redundant duplicates.

**Tire pressure alone ≠ dynamic tire load.** Pressure supports condition modifier, imbalance, under/over-pressure exposure, wear/load conditioning, confidence/context. Dynamic tire load still needs vehicle motion / longitudinal / lateral / torque / braking context.

**Wheel speed physics limit:** `wheel_speed - vehicle_speed` is **`WHEEL_SPEED_CONSISTENCY_PROXY`**, not measured slip ratio, without: effective rolling radius, driven axle knowledge, vehicle speed reference quality, cornering geometry, tire deformation, sensor synchronization.

Yaw + wheel speeds + tire pressure ×4 remain primary TR contributors. No tire temperature in current schema.

---

## 14. Data Confidence / Validation Value

Data Confidence remains **orthogonal** to Driver Quality and Vehicle Load.

**`LOW CONFIDENCE ≠ bad driving ≠ high load`.**

Brake hydraulics + battery power improve MEASURED vs RECONSTRUCTED provenance when available.

---

## 15. Powertrain Applicability

Appendix C. Battery power: N/A ICE · PRIMARY PHEV/BEV. ICE propulsion fields N/A BEV.

---

## 16. Connection-Profile Applicability

`DIMO_LTE_R1` primary · Smart5/Tesla **`UNVERIFIED_UNTIL_PHASE_2G`** · High Mobility OUT_OF_SCOPE for DIMO runtime claims in this audit.

---

## 17–22. Derived Dynamics & Reconstruction

Phase 2D evaluates **reconstruction potential**, not empirically proven accuracy.

### §18 Longitudinal reconstruction

`a_x ≈ Δv/Δt` from speed — **`RAW_FINITE_DIFFERENCE`** vs future **`FILTERED_DERIVATIVE_ESTIMATE`** must be distinguished.

Future requirements (Phase 3+ design, no production filter chosen):

- monotonic provider timestamp
- duplicate handling
- irregular Δt handling
- gap rejection
- smoothing/filter selection
- quantization handling
- edge treatment

**Jerk** (second derivative) is substantially more noise-sensitive.

| Property | Value |
|----------|-------|
| `RECONSTRUCTION_POTENTIAL` | HIGH at sufficiently clean ≤1s timestamps |
| `THEORETICAL_CONFIDENCE_CEILING` | HIGH |
| `EMPIRICAL_CONFIDENCE` | **`UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION`** |

### §19 Lateral demand approximation

`a_y ≈ v * yawRate` — kinematic approximation only.

**Units:** v in m/s · yawRate in rad/s → a_y in m/s².

**Assumptions:** approximately planar motion · small sideslip · CG velocity aligned ~ body axis · no banking compensation · synchronized timestamps.

**Not** tire force, friction utilization, or μ. May later normalize `a_y / g` — still kinematic demand, not tire-road friction coefficient.

| Property | Value |
|----------|-------|
| `RECONSTRUCTION_POTENTIAL` | MODERATE–HIGH if yaw validated |
| `EMPIRICAL_CONFIDENCE` | **`UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION`** |

### §20 Brake hydraulic reconstruction

VERY_HIGH incremental unlock from D2D-012–015 + speed context.

| Property | Value |
|----------|-------|
| `RECONSTRUCTION_POTENTIAL` | HIGH if hydraulics available |
| `EMPIRICAL_CONFIDENCE` | **`UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION`** |

### §21 Regen candidate reconstruction

D2D-020 VERY HIGH for PHEV/BEV split analysis.

| Property | Value |
|----------|-------|
| `RECONSTRUCTION_POTENTIAL` | HIGH for regen **candidate** detection |
| `EMPIRICAL_CONFIDENCE` | **`UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION`** |

### §22 Powertrain/transmission

D2D-008–011 moderate incremental gain; HF post-trip acquisition path for torque (Appendix A).

---

## 23. Native Events vs Raw Signals

Q015 8 filters; 0/34/0/50 events on four vehicles. Strength: classified events. Weakness: sparse, no Smart5, opaque thresholds. Use as **`PROVIDER_CLASSIFIED_EVENT`** evidence/validation — not sole ground truth.

---

## 24. Redundancy / Correlation

Parallel groups for Phase 2E: throttle/TPS · gear fields · brake episode multi-path · RPM/torque/load cluster · tire pressure vs warning · two hydraulic circuits · left/right wheel speed.

---

## 25. Feature Unlock Matrix

Brake pressure: onset, ramp, peak, integral, release. Yaw: cornering intensity, curve dynamics, lateral proxy. Tire pressure: deviation, imbalance, load conditioning.

---

## 26. Event / Maneuver Shape Value

ONSET/PEAK/DURATION/RAMP/DOSE critical for brake hydraulics; HIGH for yaw/wheel/battery/TPS proxy.

---

## 27. High-Timeframe Value Taxonomy

Do not use vague "high-timeframe useful." Prefer:

| Pattern | Examples |
|---------|----------|
| `DISTRIBUTION` / `TAIL` | brake pressure P95/P99 |
| `EVENT_RATE` | hard-brake rate |
| `CUMULATIVE_DOSE` / `THERMAL_DOSE` | brake energy exposure · trans temp time-above-threshold |
| `TIME_OUT_OF_RANGE` | tire underpressure exposure |
| `TREND` / `CALIBRATION` | pressure drift · context calibration |

No thresholds chosen in Phase 2D.

---

## 28. Provenance Value

Hydraulic brake moves episodes toward **MEASURED** system-reported input vs speed-only reconstruction.

---

## 29. Coverage Reality

Separate **PHYSICS_VALUE** from **`FOUR_VEHICLE_OBSERVED_COUNT`**. High value + 0/4: brake hydraulics, yaw, wheel speed, MAF, trans temp, selected gear, battery on ICE audit set, torque HF path 0/4 observed.

TPS **4/4** observed but still proxy semantics (§10.1).

---

## 30. Acquisition / Storage Cost

HIGH: ≥1Hz brake/yaw/wheel · MODERATE: 1–2s propulsion · LOW: slow context.

Appendix A **`CURRENT_ACQUISITION_PATH`** replaces boolean Q — see §30.1.

### 30.1 Acquisition path taxonomy

| Value | Meaning |
|-------|---------|
| `SNAPSHOT` | ~30s snapshot query path |
| `ACTIVE_TRIP` | active-trip driving acquisition |
| `HF_POST_TRIP` | HF mirror / post-trip historical path |
| `NATIVE_EVENT` | events API |
| `OPTIONAL_CH_MIRROR` | optional ClickHouse mirror |
| `MULTIPLE` | more than one path (document which in Phase 2F) |
| `NONE` | not in current driving acquisition |
| `UNKNOWN` | insufficient audit evidence |

Examples: torque → `HF_POST_TRIP` · tire pressure ×4 → `SNAPSHOT` · battery power → `MULTIPLE` · brake/yaw/wheel → `NONE` on current LTE_R1 driving path.

---

## 31. Priority Tiers (transparent rules)

**Rules (exclusive, one tier per candidate row):**

| Tier | Rule |
|------|------|
| **A — `TIER_A_FOUNDATIONAL`** | Model-changing for ≥1 core domain AND HIGH/VERY-HIGH incremental gain AND not context-only |
| **B — `TIER_B_HIGH_VALUE`** | Strong useful information but constrained by coverage/redundancy/directness/urgency |
| **C — `TIER_C_CONTEXT_VALIDATION`** | Context/confidence/calibration secondary role |
| **D — `TIER_D_DEFER`** | Little current Driving Intelligence value or out-of-scope profile |

| Tier | Count | IDs |
|------|------:|-----|
| A Foundational | **8** | `D2D-001`, `D2D-002`, `D2D-003`, `D2D-012`, `D2D-013`, `D2D-014`, `D2D-015`, `D2D-020` |
| B High value | **11** | `D2D-004`, `D2D-005`, `D2D-007`, `D2D-008`, `D2D-009`, `D2D-010`, `D2D-011`, `D2D-016`, `D2D-017`, `D2D-018`, `D2D-019` |
| C Context | **8** | `D2D-006`, `D2D-S01`, `D2D-S02`, `D2D-S03`, `D2D-S04`, `D2D-S05`, `D2D-S06`, `D2D-S07` |
| D Defer | **3** | `D2D-C01`, `D2D-C02`, `D2D-C03` |

**Verification:** 8+11+8+3 = **30** ✓

No weighted sum used.

---

## 32. Pareto Candidates (transparent dominance rule)

**Dimensions (ordinal qualitative assessment — no hidden numeric addition):**

1. incremental information gain vs today's SynqDrive stack
2. physics directness / provenance
3. domain value profile (any core domain ≥4)
4. cadence feasibility at design target
5. four-vehicle schema support (not observation)
6. acquisition/storage burden (lower better)
7. Phase 3 validation value

**Dominance rule:** candidate A dominates B if A is ≥ on all dimensions and strictly better on ≥1. **Pareto set** = non-dominated candidates after pairwise comparison.

**Re-run result:** **8** candidates — unchanged under documented rule:

`D2D-001`, `D2D-002`, `D2D-003`, `D2D-012`, `D2D-013`, `D2D-014`, `D2D-015`, `D2D-020`

---

## 33. Flight Recorder Implications (advisory only)

MUST_CONSIDER: Tier A · SHOULD_CONSIDER: Tier B · Final `DIMO_LTE_R1` manifest = Phase **2F.1** (not Phase 2D).

---

## 34. Phase 2E Handoff

### 34.1 Parallel-signal groups

Throttle/TPS · gear fields · brake pedal/pressure/decel/events · wheel speed vs vehicle speed · tire pressure vs warning · battery/regen · temperatures · torque pair · hydraulic circuits.

### 34.2 `PHYSICAL_EPISODE_IDENTITY` (critical)

One real maneuver may be observed through multiple **evidence channels**:

- native provider event
- speed-derived deceleration
- brake pedal
- brake pressure circuit 1
- brake pressure circuit 2
- wheel speed consistency
- stop-go classification

These are **evidence channels for one physical episode** — Phase 2E must prepare canonical evidence hierarchy; later feature reconstruction must emit **one episode**, not seven independent behavioral offenses.

Same principle applies to acceleration/cornering episodes.

---

## 35. Findings

F2D-01 FOUNDATIONAL brake hydraulics P1 · F2D-02 yaw P1 · F2D-03 wheel speeds P1 · F2D-04 battery power P1 · F2D-05 derived long/lat gap P1 · F2D-06 pressure≠friction energy P1 · F2D-07 cadence-critical P1 · F2D-08 latency-critical (n=2) P1 · F2D-09 coverage-limited P2 · F2D-10 redundancy P2 · F2D-11 episode double-counting P2 · F2D-12 powertrain-specific P2 · F2D-13 connection unverified P2 · F2D-14 empirical confidence deferred P2 · F2D-15 tire pressure context-not-load P2 · F2D-16 TPS≠pedal P2 · F2D-17 acquisition-path qualifier P2 · F2D-18 physical-episode handoff P2.

---

## 36–42. Signal Chains & Double-Counting

### §38 Brake chain
Demand → pedal → pressure → decel → ΔE_kin → regen/engine/friction → thermal → wear dose.

### §39 Tire chain
Long/lat/combined demand (derived) → pressure (direct, 0/4) → no tire temp → wear dose.

### §40 Vehicle Load chain (independent)
Propulsion · transmission · thermal · stop-go · high-speed · chassis dynamic load.

### §41 Driver Quality chain (independent)
Control proxy → response → manoeuvre severity → context → feature → DQ dimension (severity ≠ quality).

### §42 Double-counting (Appendix F)
One braking episode via native event + decel + pedal + pressure + stop-go — **HIGH** risk; Phase 2E + scoring design must model **`PHYSICAL_EPISODE_IDENTITY`**.

---

# Appendices

## Appendix A — Core Matrix (count authority)

Columns: L2 family · L3 physical source · sharpened physics class · domain scores · gain · design target cadence · latency sensitivity · four-vehicle observed count · **`CURRENT_ACQUISITION_PATH`** · tier.

| ID | Field | Family | PhysClass | PhysSource | DQ | VL | BK | TR | VA | Gain | DesignTarget | LatSens | 0-4 | AcqPath | Tier |
|----|-------|--------|-----------|------------|:--:|:--:|:--:|:--:|:--:|------|--------------|---------|-----|---------|------|
| D2D-001 | `angularVelocityYaw` | FAM-YAW | DIRECT_PHYSICAL_MEAS | YAW_RATE | 4 | 3 | 1 | 4 | 2 | HIGH | 500ms | HIGH | 0/4 | NONE | A |
| D2D-002 | `chassisAxleRow1WheelLeftSpeed` | FAM-WHEEL-SPEED | DIRECT_PHYSICAL_MEAS | WHEEL_ROTATIONAL_SPEED | 3 | 2 | 2 | 3 | 2 | HIGH | 500ms | HIGH | 0/4 | NONE | A |
| D2D-003 | `chassisAxleRow1WheelRightSpeed` | FAM-WHEEL-SPEED | DIRECT_PHYSICAL_MEAS | WHEEL_ROTATIONAL_SPEED | 3 | 2 | 2 | 3 | 2 | HIGH | 500ms | HIGH | 0/4 | NONE | A |
| D2D-004 | `powertrainCombustionEngineTPS` | FAM-THROTTLE | DIRECT_REPORTED_PT | ENGINE_THROTTLE_POSITION | 3 | 4 | 1 | 2 | 2 | MODERATE | 2s | MODERATE | 4/4 | NONE | B |
| D2D-005 | `powertrainTransmissionActualGear` | FAM-GEAR | DIRECT_REPORTED_PT | TRANSMISSION_GEAR | 3 | 3 | 1 | 1 | 2 | MODERATE | 2s | LOW | 1/4 | NONE | B |
| D2D-006 | `powertrainTransmissionActualGearRatio` | FAM-GEAR | DIRECT_REPORTED_PT | TRANSMISSION_GEAR_RATIO | 2 | 3 | 1 | 1 | 2 | LOW | 2s | LOW | 1/4 | NONE | C |
| D2D-007 | `powertrainTransmissionSelectedGear` | FAM-GEAR | DIRECT_REPORTED_PT | TRANSMISSION_SELECTED_GEAR | 3 | 3 | 1 | 1 | 2 | MODERATE | 2s | LOW | 0/4 | NONE | B |
| D2D-008 | `powertrainCombustionEngineTorque` | FAM-TORQUE | DIRECT_REPORTED_PT | REPORTED_ENGINE_TORQUE | 3 | 4 | 2 | 3 | 2 | MODERATE | 2s | MODERATE | 0/4 | HF_POST_TRIP | B |
| D2D-009 | `powertrainCombustionEngineTorquePercent` | FAM-TORQUE | DIRECT_REPORTED_PT | REPORTED_TORQUE_PERCENT | 2 | 4 | 2 | 2 | 2 | LOW | 2s | MODERATE | 0/4 | HF_POST_TRIP | B |
| D2D-010 | `powertrainCombustionEngineMAF` | FAM-AIRFLOW | DIRECT_PHYSICAL_MEAS | AIR_MASS_FLOW | 2 | 4 | 1 | 1 | 2 | MODERATE | 5s | LOW | 0/4 | NONE | B |
| D2D-011 | `powertrainTransmissionTemperature` | FAM-TRANS-TEMP | DIRECT_REPORTED_THERM | TRANSMISSION_TEMPERATURE | 1 | 4 | 1 | 1 | 2 | MODERATE | 10s | LOW | 0/4 | NONE | B |
| D2D-012 | `chassisBrakeIsPedalPressed` | FAM-BRAKE-PEDAL | DIRECT_REPORTED_CH | BRAKE_PEDAL_SWITCH | 4 | 2 | 5 | 1 | 3 | VERY_HIGH | 500ms | HIGH | 0/4 | NONE | A |
| D2D-013 | `chassisBrakePedalPosition` | FAM-BRAKE-PEDAL | DIRECT_REPORTED_CH | BRAKE_PEDAL_POSITION | 4 | 2 | 5 | 1 | 3 | VERY_HIGH | 500ms | HIGH | 0/4 | NONE | A |
| D2D-014 | `chassisBrakeCircuit1PressurePrimary` | FAM-BRAKE-PRESSURE | DIRECT_REPORTED_HYD | HYDRAULIC_BRAKE_PRESSURE | 4 | 2 | 5 | 1 | 4 | VERY_HIGH | 250ms | CRITICAL | 0/4 | NONE | A |
| D2D-015 | `chassisBrakeCircuit2PressurePrimary` | FAM-BRAKE-PRESSURE | DIRECT_REPORTED_HYD | HYDRAULIC_BRAKE_PRESSURE | 4 | 2 | 5 | 1 | 4 | VERY_HIGH | 250ms | CRITICAL | 0/4 | NONE | A |
| D2D-016 | `chassisAxleRow1WheelLeftTirePressure` | FAM-TIRE-PRESSURE | DIRECT_PHYSICAL_MEAS | TIRE_PRESSURE_FL | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0/4 | SNAPSHOT | B |
| D2D-017 | `chassisAxleRow1WheelRightTirePressure` | FAM-TIRE-PRESSURE | DIRECT_PHYSICAL_MEAS | TIRE_PRESSURE_FR | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0/4 | SNAPSHOT | B |
| D2D-018 | `chassisAxleRow2WheelLeftTirePressure` | FAM-TIRE-PRESSURE | DIRECT_PHYSICAL_MEAS | TIRE_PRESSURE_RL | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0/4 | SNAPSHOT | B |
| D2D-019 | `chassisAxleRow2WheelRightTirePressure` | FAM-TIRE-PRESSURE | DIRECT_PHYSICAL_MEAS | TIRE_PRESSURE_RR | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0/4 | SNAPSHOT | B |
| D2D-020 | `powertrainTractionBatteryCurrentPower` | FAM-BATT-POWER | DIRECT_REPORTED_ENERGY | TRACTION_BATTERY_POWER | 2 | 5 | 5 | 1 | 4 | VERY_HIGH | 500ms | HIGH | 0/4 | MULTIPLE | A |
| D2D-S01 | `currentLocationHeading` | FAM-CONTEXT | CONTEXT | ENVIRONMENT_CONTEXT | 2 | 1 | 0 | 1 | 3 | LOW | 10s | LOW | 4/4 | SNAPSHOT | C |
| D2D-S02 | `obdIntakeTemp` | FAM-CONTEXT | CONTEXT | ENVIRONMENT_CONTEXT | 0 | 3 | 0 | 1 | 3 | LOW | 10s | LOW | 4/4 | SNAPSHOT | C |
| D2D-S03 | `obdOilTemperature` | FAM-CONTEXT | CONTEXT | ENVIRONMENT_CONTEXT | 0 | 4 | 0 | 1 | 3 | LOW | 10s | LOW | 4/4 | SNAPSHOT | C |
| D2D-S04 | `obdBarometricPressure` | FAM-CONTEXT | CONTEXT | ENVIRONMENT_CONTEXT | 0 | 2 | 0 | 0 | 3 | LOW | 10s | LOW | 4/4 | SNAPSHOT | C |
| D2D-S05 | `obdStatusDTCCount` | FAM-HEALTH | DIAGNOSTIC | DIAGNOSTIC_DTC_COUNT | 0 | 0 | 0 | 0 | 4 | LOW | 30s | LOW | 4/4 | SNAPSHOT | C |
| D2D-S06 | `obdDistanceWithMIL` | FAM-HEALTH | DIAGNOSTIC | DIAGNOSTIC_MIL_DISTANCE | 0 | 0 | 0 | 0 | 3 | LOW | 30s | LOW | 4/4 | SNAPSHOT | C |
| D2D-S07 | `chassisTireSystemIsWarningOn` | FAM-TIRE-DIAG | DIAGNOSTIC | TPMS_WARNING | 0 | 0 | 0 | 2 | 4 | LOW | 10s | LOW | 0/4 | SNAPSHOT | C |
| D2D-C01 | `chassisAxleRow3Weight` | FAM-COMM-AXLE | DIRECT_PHYSICAL_MEAS | COMMERCIAL_AXLE_LOAD | 0 | 3 | 2 | 2 | 2 | LOW | 10s | LOW | 0/4 | NONE | D |
| D2D-C02 | `chassisAxleRow4Weight` | FAM-COMM-AXLE | DIRECT_PHYSICAL_MEAS | COMMERCIAL_AXLE_LOAD | 0 | 3 | 2 | 2 | 2 | LOW | 10s | LOW | 0/4 | NONE | D |
| D2D-C03 | `chassisAxleRow5Weight` | FAM-COMM-AXLE | DIRECT_PHYSICAL_MEAS | COMMERCIAL_AXLE_LOAD | 0 | 3 | 2 | 2 | 2 | LOW | 10s | LOW | 0/4 | NONE | D |

## Appendix B — Cadence Matrix (count authority for cadence targets)

| ID | PhysicsMinUseful | DesignTarget | Degraded | FailureMode | EmpiricallyValidated | CadSens |
|----|------------------|--------------|----------|-------------|----------------------|---------|
| D2D-001 | 2s | 500ms | 5s | 30s | UNKNOWN_UNTIL_PHASE_3 | HIGH |
| D2D-002 | 2s | 500ms | 5s | 30s | UNKNOWN_UNTIL_PHASE_3 | CRITICAL |
| D2D-003 | 2s | 500ms | 5s | 30s | UNKNOWN_UNTIL_PHASE_3 | CRITICAL |
| D2D-004 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | MODERATE |
| D2D-005 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | MODERATE |
| D2D-006 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-007 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | MODERATE |
| D2D-008 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | HIGH |
| D2D-009 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | HIGH |
| D2D-010 | 10s | 5s | 30s | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | MODERATE |
| D2D-011 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-012 | 2s | 500ms | 5s | 30s | UNKNOWN_UNTIL_PHASE_3 | CRITICAL |
| D2D-013 | 2s | 500ms | 5s | 30s | UNKNOWN_UNTIL_PHASE_3 | CRITICAL |
| D2D-014 | 500ms | 250ms | 2s | 10s | UNKNOWN_UNTIL_PHASE_3 | CRITICAL |
| D2D-015 | 500ms | 250ms | 2s | 10s | UNKNOWN_UNTIL_PHASE_3 | CRITICAL |
| D2D-016 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-017 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-018 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-019 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-020 | 1s | 500ms | 5s | 30s | UNKNOWN_UNTIL_PHASE_3 | HIGH |
| D2D-S01 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-S02 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-S03 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-S04 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-S05 | STATIC_OR_TRIP_CONTEXT | 30s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-S06 | STATIC_OR_TRIP_CONTEXT | 30s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-S07 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-C01 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-C02 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |
| D2D-C03 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | UNKNOWN_UNTIL_PHASE_3 | LOW |

## Appendix C — Powertrain Matrix

| ID | ICE-G | ICE-D | PHEV | BEV |
|----|:-----:|:-----:|:----:|:---:|
| D2D-001 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-002 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-003 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-004 | PRIMARY | PRIMARY | SECONDARY | NOT_APPLICABLE |
| D2D-005 | PRIMARY | PRIMARY | PRIMARY | UNKNOWN |
| D2D-006 | PRIMARY | PRIMARY | PRIMARY | UNKNOWN |
| D2D-007 | PRIMARY | PRIMARY | PRIMARY | UNKNOWN |
| D2D-008 | PRIMARY | PRIMARY | SECONDARY | NOT_APPLICABLE |
| D2D-009 | PRIMARY | PRIMARY | SECONDARY | NOT_APPLICABLE |
| D2D-010 | PRIMARY | PRIMARY | SECONDARY | NOT_APPLICABLE |
| D2D-011 | PRIMARY | PRIMARY | PRIMARY | UNKNOWN |
| D2D-012 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-013 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-014 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-015 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-016 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-017 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-018 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-019 | PRIMARY | PRIMARY | PRIMARY | PRIMARY |
| D2D-020 | NOT_APPLICABLE | NOT_APPLICABLE | PRIMARY | PRIMARY |

## Appendix D — Derived Physics Matrix

| Feature | Inputs | DesignTarget | Primary domain | Theoretical ceiling | Empirical confidence |
|---------|--------|--------------|----------------|---------------------|---------------------|
| Longitudinal accel | speed | 1s | DQ·VL | HIGH at clean ≤1s timestamps | **UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION** |
| Jerk | speed | 500ms | DQ | HIGH sensitivity | **UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION** |
| Lateral kinematic demand | speed·yaw | 500ms–1s | DQ·TR | MODERATE–HIGH if yaw validated | **UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION** |
| Wheel-speed consistency proxy | wheel·vehicle speed | 500ms | TR | LOW–MODERATE | **UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION** |
| Hydraulic intensity | pedal·pressure | 250–500ms | BK | HIGH if available | **UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION** |
| Regen candidate | batt power·decel | 500ms–1s | BK·VL | MODERATE–HIGH | **UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION** |
| Kinetic energy delta | speed·mass | 1s | BK·VL | MODERATE (mass external) | **UNKNOWN_UNTIL_GROUND_TRUTH_VALIDATION** |

## Appendix E — Synchronization Matrix

| Candidate | Sync with |
|-----------|-----------|
| D2D-014/015 | speed · pedal · battery (PHEV/BEV) |
| D2D-001 | speed · heading · wheel speeds |
| D2D-020 | speed · brake · SOC |
| D2D-008/009 | RPM · throttle · gear · speed |

## Appendix F — Double-Counting / Episode Map

| Episode | Evidence channels (not independent offenses) | Risk |
|---------|-----------------------------------------------|------|
| Hard braking | native event · speed decel · pedal · pressure C1 · pressure C2 · stop-go | **HIGH** |
| Hard accel | native event · TPS proxy · speed accel | **HIGH** |
| Cornering | native event · yaw kinematic demand | MODERATE |
| Tire issue | pressure FL/FR/RL/RR · TPMS warning | MODERATE |

**Phase 2E must assign canonical hierarchy under `PHYSICAL_EPISODE_IDENTITY`.**

---

## Verified Count Constants (QA pass 2026-08-31)

```
MAIN_TRACK_COUNT = 20
SECONDARY_COUNT = 7
COMMERCIAL_COUNT = 3
TOTAL_CANDIDATE_ROWS = 30
TIER_A = 8; TIER_B = 11; TIER_C = 8; TIER_D = 3
PARETO_COUNT = 8
CADENCE_CRITICAL_COUNT = 6
LATENCY_CRITICAL_CANDIDATE_COUNT = 2
LATENCY_HIGH_OR_CRITICAL_COUNT = 8
TARGET_LE_1S_EXACT_COUNT = 8
TARGET_LE_500MS_EXACT_COUNT = 8
THIRTY_S_SUFFICIENT_LOW_CAD_SENS = 16
FOUR_VEHICLE_ZERO_OBSERVED = 21
```

**Phase 2D: DONE** · **Phase 2E: NEXT** · **Phase 2F/2F.1: NOT_STARTED** · **Phase 3A: GATED_ON_LTE_R1_MANIFEST**
