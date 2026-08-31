# DIMO Phase 2D — Signal Value / Physics Matrix

**Date:** 2026-08-31  
**Status:** DONE  
**Scope:** Signal value · physics/information-gain · cadence · multi-domain ranking (documentation only)  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Phase gate:** Phase 2D **DONE** · Phase 2E **NEXT** · Phase 2F/2F.1 **NOT_STARTED** · Phase 3A **`GATED_ON_LTE_R1_MANIFEST`**

---

## 1. Executive Summary

Phase 2D evaluates **20** Phase-2C main-track candidates + **7** secondary + **3** commercial-only fields across **five independent dimensions** (Driver Quality · Vehicle Load · Brake Physics · Tire Dynamic Load · Data Confidence). **No summed mega-score.**

| Metric | Count |
|--------|------:|
| Main-track candidates | **20** |
| Secondary candidates | **7** |
| Commercial-only | **3** |
| Tier A Foundational | **8** |
| Tier B High value | **11** |
| Tier C Context/validation | **8** |
| Tier D Defer | **3** |
| Pareto candidates | **8** |
| Cadence-critical | **6** |
| Latency-critical | **2** |
| Target cadence ≤1s | **8** |

**Top physics gaps:** no direct long/lat accel; brake hydraulics highest incremental gain (0/4 coverage); yaw/wheel speeds enable derived lateral/slip (0/4); battery power foundational for PHEV/BEV regen split.

**Primary profile:** `DIMO_LTE_R1`. Other connection profiles **UNVERIFIED** in this phase.

---

## 2. Scope & Authorities

Documentation-only analysis. Authorities: Master Plan · Phase 2A/2B/2C audits · Phase 1 forensic audit. Source modules read for incremental-gain context only — **unchanged**.

---

## 3. Methodology

Reconcile Phase 2C IDs → score 0–5 per domain (not summed) → incremental gain vs today → cadence/latency/sync → powertrain/connection applicability → tiers without weighted sum → Phase 2E handoff.

---

## 4. Candidate Registry

### 4.1 Main track (20)

| ID | DIMO field | Family ID |
|----|------------|-----------|
| D2D-001 | `angularVelocityYaw` | `FAM-YAW` |
| D2D-002 | `chassisAxleRow1WheelLeftSpeed` | `FAM-WHEEL-SPEED` |
| D2D-003 | `chassisAxleRow1WheelRightSpeed` | `FAM-WHEEL-SPEED` |
| D2D-004 | `powertrainCombustionEngineTPS` | `FAM-THROTTLE` |
| D2D-005 | `powertrainTransmissionActualGear` | `FAM-GEAR` |
| D2D-006 | `powertrainTransmissionActualGearRatio` | `FAM-GEAR` |
| D2D-007 | `powertrainTransmissionSelectedGear` | `FAM-GEAR` |
| D2D-008 | `powertrainCombustionEngineTorque` | `FAM-TORQUE` |
| D2D-009 | `powertrainCombustionEngineTorquePercent` | `FAM-TORQUE` |
| D2D-010 | `powertrainCombustionEngineMAF` | `FAM-AIRFLOW` |
| D2D-011 | `powertrainTransmissionTemperature` | `FAM-TRANS-TEMP` |
| D2D-012 | `chassisBrakeIsPedalPressed` | `FAM-BRAKE-PEDAL` |
| D2D-013 | `chassisBrakePedalPosition` | `FAM-BRAKE-PEDAL` |
| D2D-014 | `chassisBrakeCircuit1PressurePrimary` | `FAM-BRAKE-PRESSURE` |
| D2D-015 | `chassisBrakeCircuit2PressurePrimary` | `FAM-BRAKE-PRESSURE` |
| D2D-016 | `chassisAxleRow1WheelLeftTirePressure` | `FAM-TIRE-PRESSURE` |
| D2D-017 | `chassisAxleRow1WheelRightTirePressure` | `FAM-TIRE-PRESSURE` |
| D2D-018 | `chassisAxleRow2WheelLeftTirePressure` | `FAM-TIRE-PRESSURE` |
| D2D-019 | `chassisAxleRow2WheelRightTirePressure` | `FAM-TIRE-PRESSURE` |
| D2D-020 | `powertrainTractionBatteryCurrentPower` | `FAM-BATT-POWER` |

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

**Highest scores (≥4):** DQ — TPS, brake pedal/pressure, yaw · VL — torque, MAF, trans temp, battery power · BK — pedal, pressure, battery power · TR — yaw, wheel speeds, tire pressure ×4 · VA — brake pressure, battery power, health/diagnostic fields.

---

## 6. Incremental Information Gain

| Gain | Candidates |
|------|------------|
| VERY_HIGH | D2D-012–015 brake hydraulics · D2D-020 battery power (PHEV/BEV) |
| HIGH | D2D-001 yaw · D2D-002/003 wheel speeds |
| MODERATE | D2D-004 TPS · D2D-008–011 · D2D-016–019 (queried, 0/4) |
| LOW | D2D-006 · secondary context |

---

## 7. Physics Directness

DIRECT_SYSTEM_INPUT: brake, TPS, torque, battery power · DIRECT_PHYSICAL_MEASUREMENT: yaw, wheel speed, tire pressure, MAF · DIRECT_STATE: gear, trans temp · VALIDATION_ONLY: secondary health/diagnostic.

---

## 8. Cadence Requirements

Appendix B. **CRITICAL:** D2D-012–015, D2D-002/003 · **HIGH:** D2D-001, D2D-020, torque · **LOW:** tire pressure, thermal context. **CURRENT_PROVIDER_CADENCE = UNKNOWN_REQUIRES_RUNTIME_PROBE** (Phase 2A buckets ≠ proven effective cadence).

---

## 9. Latency / Alignment Requirements

Appendix E. Latency-critical: brake pressure, pedal, yaw, wheel speed, battery power.

---

## 10. Driver Quality Analysis

Signals enable acceleration/braking quality, smoothness, cornering, cycling, sympathy. Brake pressure + pedal highest hydraulic-behaviour value. Hard braking ≠ automatically bad DQ — context deferred.

---

## 11. Vehicle Load Analysis

Independent first-class track: propulsion (torque/MAF/TPS/RPM) · transmission · thermal · stop-go · high-speed · chassis (yaw/wheel). Not residual from Brake/Tire.

---

## 12. Brake Physics Analysis

Chain §38. Pedal/pressure score 5 for BK. Pressure ≠ friction energy — REQUIRES_CALIBRATION. Battery power: regen candidate (positive into battery during synchronized decel).

---

## 13. Tire Dynamic Load Analysis

Yaw + wheel speeds + tire pressure ×4 primary. No tire temperature in schema.

---

## 14. Data Confidence / Validation Value

Orthogonal. LOW CONFIDENCE ≠ bad driving/load. Brake hydraulics + battery power improve MEASURED vs RECONSTRUCTED provenance.

---

## 15. Powertrain Applicability

Appendix C. Battery power: N/A ICE · PRIMARY PHEV/BEV. ICE propulsion fields N/A BEV.

---

## 16. Connection-Profile Applicability

DIMO_LTE_R1 primary · Smart5/Tesla UNVERIFIED · High Mobility OUT_OF_SCOPE for DIMO runtime claims.

---

## 17–22. Derived Dynamics & Reconstruction

**Longitudinal (§18):** a_x≈Δv/Δt from speed — PROPOSAL_FOR_VALIDATION; HIGH confidence at ≤1s, LOW at 30s-only.

**Lateral (§19):** a_y≈v·yawRate — planar assumptions; validation required; yaw 0/4.

**Brake hydraulic (§20):** VERY_HIGH unlock from D2D-012–015 + speed.

**Regen (§21):** D2D-020 VERY HIGH PHEV/BEV; positive power = into battery.

**Powertrain/transmission (§22):** D2D-008–011 moderate incremental gain.

---

## 23. Native Events vs Raw Signals

Q015 8 filters; 0/34/0/50 events on four vehicles. Strength: classified events. Weakness: sparse, no Smart5, opaque thresholds. Use as evidence/validation — not sole ground truth.

---

## 24. Redundancy / Correlation

Throttle pair · gear parallel fields · brake episode multi-path · RPM/torque/load cluster · tire pressure vs warning → Phase 2E canonicalization.

---

## 25. Feature Unlock Matrix

Brake pressure: onset, ramp, peak, integral, release. Yaw: cornering intensity, curve dynamics, lateral proxy. Tire pressure: deviation, imbalance, load conditioning.

---

## 26. Event / Maneuver Shape Value

ONSET/PEAK/DURATION/RAMP/DOSE critical for brake hydraulics; HIGH for yaw/wheel/battery/TPS.

---

## 27. High-Timeframe Value

Brake pressure → tail + cumulative dose · yaw → cornering distribution · trans temp → thermal dose · tire pressure → out-of-range exposure.

---

## 28. Provenance Value

Hydraulic brake moves episodes toward MEASURED system input vs speed-only reconstruction.

---

## 29. Coverage Reality

Separate PHYSICS_VALUE from FOUR_VEHICLE_COVERAGE. High value + 0/4: brake, yaw, wheel speed, MAF, trans temp, selected gear, battery on ICE set.

---

## 30. Acquisition / Storage Cost

HIGH: ≥1Hz brake/yaw/wheel · MODERATE: 1–2s propulsion · LOW: slow context.

---

## 31. Priority Tiers

| Tier | Count | IDs |
|------|------:|-----|
| A Foundational | 8 | `D2D-001`, `D2D-002`, `D2D-003`, `D2D-012`, `D2D-013`, `D2D-014`, `D2D-015`, `D2D-020` |
| B High value | 11 | torque, MAF, gear, TPS, tire pressure ×4, … |
| C Context | 8 | secondary + gear ratio |
| D Defer | 3 | commercial axle weights |

No weighted sum used.

---

## 32. Pareto Candidates

`D2D-014`, `D2D-015`, `D2D-012`, `D2D-013`, `D2D-001`, `D2D-002`, `D2D-003`, `D2D-020`

---

## 33. Flight Recorder Implications (advisory)

MUST_CONSIDER: Tier A · SHOULD_CONSIDER: Tier B · Final LTE_R1 manifest = Phase 2F.1.

---

## 34. Phase 2E Handoff

Groups: throttle/TPS · gear fields · brake pedal/pressure/decel/events · wheel speed vs vehicle speed · tire pressure vs warning · battery/regen · temperatures.

---

## 35. Findings

F2D-01 FOUNDATIONAL brake hydraulics P1 · F2D-02 yaw P1 · F2D-03 wheel speeds P1 · F2D-04 battery power P1 · F2D-05 derived long/lat gap P1 · F2D-06 pressure≠friction energy P1 · F2D-07 cadence-critical P1 · F2D-08 latency-critical P1 · F2D-09 coverage-limited P2 · F2D-10 redundancy P2 · F2D-11 double-counting P2 · F2D-12 powertrain-specific P2 · F2D-13 connection unverified P2 · F2D-14 runtime validation P2 · F2D-15 tire pressure gap P2 · F2D-16 context P3.

---

## 36–42. Signal Chains & Double-Counting

### Brake chain (§38)
Demand → pedal (MEASURED 0/4) → pressure (MEASURED 0/4) → decel (DERIVED) → ΔE_kin (DERIVED, mass) → regen/engine/friction (DERIVED) → thermal (DERIVED) → wear dose.

### Tire chain (§39)
Long/lat/combined demand (derived) → pressure (DIRECT, 0/4) → no tire temp → wear dose.

### Vehicle Load chain (§40)
Propulsion/transmission/thermal/stop-go/high-speed/chassis — independent output.

### Driver Quality chain (§41)
Control → response → manoeuvre → context → feature → DQ dimension.

### Double-counting (§42 / Appendix F)
One braking episode via native event + decel + pedal + pressure + stop-go — **HIGH** risk; Phase 2E + scoring design must model single episodes.

---

# Appendices

## Appendix A — Core Matrix

| ID | Field | Physics | DQ | VL | BK | TR | VA | Gain | Target | Lat | 0-4 | Q | Tier |
|----|-------|---------|:--:|:--:|:--:|:--:|:--:|------|--------|-----|-----|---|------|
| D2D-001 | `angularVelocityYaw` | DIRECT_PHYSICAL_MEAS | 4 | 3 | 1 | 4 | 2 | HIGH | 500ms | HIGH | 0 | no | A |
| D2D-002 | `chassisAxleRow1WheelLeftSpeed` | DIRECT_PHYSICAL_MEAS | 3 | 2 | 2 | 3 | 2 | HIGH | 500ms | HIGH | 0 | no | A |
| D2D-003 | `chassisAxleRow1WheelRightSpeed` | DIRECT_PHYSICAL_MEAS | 3 | 2 | 2 | 3 | 2 | HIGH | 500ms | HIGH | 0 | no | A |
| D2D-004 | `powertrainCombustionEngineTPS` | DIRECT_SYSTEM_INPUT | 4 | 4 | 1 | 2 | 2 | MODERATE | 2s | MODERATE | 4 | no | B |
| D2D-005 | `powertrainTransmissionActualGear` | DIRECT_STATE | 3 | 3 | 1 | 1 | 2 | MODERATE | 2s | LOW | 1 | no | B |
| D2D-006 | `powertrainTransmissionActualGearRatio` | DIRECT_STATE | 2 | 3 | 1 | 1 | 2 | LOW | 2s | LOW | 1 | no | C |
| D2D-007 | `powertrainTransmissionSelectedGear` | DIRECT_STATE | 3 | 3 | 1 | 1 | 2 | MODERATE | 2s | LOW | 0 | no | B |
| D2D-008 | `powertrainCombustionEngineTorque` | DIRECT_SYSTEM_INPUT | 3 | 4 | 2 | 3 | 2 | MODERATE | 2s | MODERATE | 0 | yes | B |
| D2D-009 | `powertrainCombustionEngineTorquePercent` | DIRECT_SYSTEM_INPUT | 2 | 4 | 2 | 2 | 2 | LOW | 2s | MODERATE | 0 | yes | B |
| D2D-010 | `powertrainCombustionEngineMAF` | DIRECT_PHYSICAL_MEAS | 2 | 4 | 1 | 1 | 2 | MODERATE | 5s | LOW | 0 | no | B |
| D2D-011 | `powertrainTransmissionTemperature` | DIRECT_STATE | 1 | 4 | 1 | 1 | 2 | MODERATE | 10s | LOW | 0 | no | B |
| D2D-012 | `chassisBrakeIsPedalPressed` | DIRECT_SYSTEM_INPUT | 4 | 2 | 5 | 1 | 3 | VERY_HIGH | 500ms | HIGH | 0 | no | A |
| D2D-013 | `chassisBrakePedalPosition` | DIRECT_SYSTEM_INPUT | 4 | 2 | 5 | 1 | 3 | VERY_HIGH | 500ms | HIGH | 0 | no | A |
| D2D-014 | `chassisBrakeCircuit1PressurePrimary` | DIRECT_SYSTEM_INPUT | 4 | 2 | 5 | 1 | 4 | VERY_HIGH | 250ms | CRITICAL | 0 | no | A |
| D2D-015 | `chassisBrakeCircuit2PressurePrimary` | DIRECT_SYSTEM_INPUT | 4 | 2 | 5 | 1 | 4 | VERY_HIGH | 250ms | CRITICAL | 0 | no | A |
| D2D-016 | `chassisAxleRow1WheelLeftTirePressure` | DIRECT_PHYSICAL_MEAS | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0 | yes | B |
| D2D-017 | `chassisAxleRow1WheelRightTirePressure` | DIRECT_PHYSICAL_MEAS | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0 | yes | B |
| D2D-018 | `chassisAxleRow2WheelLeftTirePressure` | DIRECT_PHYSICAL_MEAS | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0 | yes | B |
| D2D-019 | `chassisAxleRow2WheelRightTirePressure` | DIRECT_PHYSICAL_MEAS | 1 | 2 | 1 | 5 | 3 | MODERATE | 10s | LOW | 0 | yes | B |
| D2D-020 | `powertrainTractionBatteryCurrentPower` | DIRECT_SYSTEM_INPUT | 2 | 5 | 5 | 1 | 4 | VERY_HIGH | 500ms | HIGH | 0 | yes | A |
| D2D-S01 | `currentLocationHeading` | CONTEXT | 2 | 1 | 0 | 1 | 3 | LOW | 10s | LOW | 4 | no | C |
| D2D-S02 | `obdIntakeTemp` | CONTEXT | 0 | 3 | 0 | 1 | 3 | LOW | 10s | LOW | 4 | no | C |
| D2D-S03 | `obdOilTemperature` | CONTEXT | 0 | 4 | 0 | 1 | 3 | LOW | 10s | LOW | 4 | no | C |
| D2D-S04 | `obdBarometricPressure` | CONTEXT | 0 | 2 | 0 | 0 | 3 | LOW | 10s | LOW | 4 | no | C |
| D2D-S05 | `obdStatusDTCCount` | VALIDATION_ONLY | 0 | 0 | 0 | 0 | 4 | LOW | 30s | LOW | 4 | no | C |
| D2D-S06 | `obdDistanceWithMIL` | VALIDATION_ONLY | 0 | 0 | 0 | 0 | 3 | LOW | 30s | LOW | 4 | no | C |
| D2D-S07 | `chassisTireSystemIsWarningOn` | VALIDATION_ONLY | 0 | 0 | 0 | 2 | 4 | LOW | 10s | LOW | 0 | yes | C |
| D2D-C01 | `chassisAxleRow3Weight` | DIRECT_PHYSICAL_MEAS | 0 | 3 | 2 | 2 | 2 | LOW | 10s | LOW | 0 | no | D |
| D2D-C02 | `chassisAxleRow4Weight` | DIRECT_PHYSICAL_MEAS | 0 | 3 | 2 | 2 | 2 | LOW | 10s | LOW | 0 | no | D |
| D2D-C03 | `chassisAxleRow5Weight` | DIRECT_PHYSICAL_MEAS | 0 | 3 | 2 | 2 | 2 | LOW | 10s | LOW | 0 | no | D |

## Appendix B — Cadence Matrix

| ID | Min useful | Target | Degraded | Failure | Sensitivity |
|----|------------|--------|----------|---------|-------------|
| D2D-001 | 2s | 500ms | 5s | 30s | HIGH |
| D2D-002 | 2s | 500ms | 5s | 30s | CRITICAL |
| D2D-003 | 2s | 500ms | 5s | 30s | CRITICAL |
| D2D-004 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | MODERATE |
| D2D-005 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | MODERATE |
| D2D-006 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-007 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | MODERATE |
| D2D-008 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | HIGH |
| D2D-009 | 5s | 2s | 30s | STATIC_OR_TRIP_CONTEXT | HIGH |
| D2D-010 | 10s | 5s | 30s | STATIC_OR_TRIP_CONTEXT | MODERATE |
| D2D-011 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-012 | 2s | 500ms | 5s | 30s | CRITICAL |
| D2D-013 | 2s | 500ms | 5s | 30s | CRITICAL |
| D2D-014 | 500ms | 250ms | 2s | 10s | CRITICAL |
| D2D-015 | 500ms | 250ms | 2s | 10s | CRITICAL |
| D2D-016 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-017 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-018 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-019 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-020 | 1s | 500ms | 5s | 30s | HIGH |
| D2D-S01 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-S02 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-S03 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-S04 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-S05 | STATIC_OR_TRIP_CONTEXT | 30s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-S06 | STATIC_OR_TRIP_CONTEXT | 30s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-S07 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-C01 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-C02 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |
| D2D-C03 | 30s | 10s | STATIC_OR_TRIP_CONTEXT | STATIC_OR_TRIP_CONTEXT | LOW |

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

| Feature | Inputs | Min cadence | Primary domain | Confidence ceiling |
|---------|--------|-------------|----------------|-------------------|
| Longitudinal accel | speed | 1s | DQ·VL | HIGH at ≤1s; LOW at 30s |
| Jerk | speed | 500ms | DQ | CRITICAL sensitivity |
| Lateral proxy | speed·yaw | 500ms–1s | DQ·TR | MODERATE until yaw validated |
| Wheel slip proxy | wheel·speed | 500ms | TR | LOW–MODERATE |
| Hydraulic intensity | pedal·pressure | 250–500ms | BK | HIGH if available |
| Regen candidate | batt power·decel | 500ms–1s | BK·VL | UNKNOWN |
| Kinetic energy | speed·mass | 1s | BK·VL | MODERATE |

## Appendix E — Synchronization Matrix

| Candidate | Sync with |
|-----------|-----------|
| D2D-014/015 | speed · pedal · battery (PHEV/BEV) |
| D2D-001 | speed · heading · wheel speeds |
| D2D-020 | speed · brake · SOC |
| D2D-008/009 | RPM · throttle · gear · speed |

## Appendix F — Double-Counting Map

| Episode | Signals | Risk |
|---------|---------|------|
| Hard braking | native · decel · pedal · pressure · stop-go | HIGH |
| Hard accel | native · HF TPS · speed accel | HIGH |
| Cornering | native · yaw | MODERATE |
| Tire issue | pressure ×4 · warning | MODERATE |

---

**Phase 2D: DONE** · **Phase 2E: NEXT** · **Phase 3A: GATED_ON_LTE_R1_MANIFEST**

