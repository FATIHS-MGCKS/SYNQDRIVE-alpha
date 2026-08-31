# DIMO Phase 2B — Four-Vehicle Capability Gap Matrix
**Date:** 2026-08-31  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Scope:** Forensic synthesis — cross-vehicle DIMO signal/event/segment capability vs SynqDrive Phase-2A query surface. Documentation only; no production changes.  
**Authority:** Phase 2A (`dimo-phase-2a-current-query-surface-audit-2026-08-31.md`) for query registry Q001–Q027, 41 unique signal fields, 8 events, 6 segments. Vehicle inventories from git commits `0bab8a4d3`, `5a440c60d`, `caeaa3aa4`, `c2a0e1c5e` (not on `main` at audit time; ingested from `/tmp/phase2b-inventories/`).

---

## 1. Executive Summary

Phase 2B closes the vehicle-capability gap left open in Phase 2A by cross-referencing **four production ICE audit vehicles** against SynqDrive's static query superset. The audit confirms that DIMO delivers a **tight, OBD-centric palette** (union **33** unique vehicle signals) while SynqDrive queries **41** unique signal fields plus **8** native events and **6** segment mechanisms — with **no per-vehicle query shaping**.

| Metric | Value | Evidence |
|--------|------:|----------|
| Audit vehicles | 4 (Tiguan, C63, A4, Arteon) | CONFIRMED_FROM_VEHICLE_INVENTORY |
| Union unique vehicle signals | **33** | CONFIRMED_FROM_VEHICLE_INVENTORY |
| Common to all 4 vehicles | **28** | CONFIRMED_FROM_VEHICLE_INVENTORY |
| On exactly 1 vehicle | **4** (gear×2 Tiguan; `obdDTCList`+DEF A4) | CONFIRMED_FROM_VEHICLE_INVENTORY |
| On exactly 3 vehicles | **1** (`powertrainFuelSystemRelativeLevel` — missing A4) | CONFIRMED_FROM_VEHICLE_INVENTORY |
| Phase-2A queried signal fields | **41** | CONFIRMED_FROM_CODE (Phase 2A §22.3) |
| Available on vehicles, not in any SynqDrive query | **15** | CONFIRMED_FROM_VEHICLE_INVENTORY |
| Master matrix rows | **70** = 41 + 15 + 8 + 6 | arithmetic |
| Q001 snapshot waste (per ICE vehicle) | **32** requested, **11** available, **21** wasted (**65.6%**) | CONFIRMED_FROM_VEHICLE_INVENTORY |
| `availableSignals` listed = working (latest poll) | **100%** all 4 | CONFIRMED_FROM_RUNTIME_EVIDENCE |
| Segments audited in inventories | **0** — all **UNKNOWN** | CONFIRMED_FROM_VEHICLE_INVENTORY |

**Architecture verdicts (Phase 2B):**

| Question | Verdict | Rationale |
|----------|---------|-----------|
| Hardware profile predicts capability? | **PARTIAL** | LTE_R1 Arteon emits native events (50/30d) while SMART5 not in set; gear signals vary within ICE (Tiguan only). Hardware gates enrichment paths, not GraphQL field lists. |
| `availableSignals` alone drives query profiles? | **PARTIAL** | 100% listed→working on latest poll, but static Q001 still requests 21 null fields per ICE vehicle; torque/gear/currentGear queried (Q009) but **NOT_OBSERVED_IN_THESE_FOUR_VEHICLE_INVENTORIES**. |

**Top findings:** (1) **VERY_HIGH** static snapshot waste on every ICE vehicle; (2) high-value driving signals (RPM, TPS/throttle, gear) live on DIMO but absent from VLS snapshot path; (3) native event emission is **vehicle-specific** (0–50/30d) not predictable from hardware alone; (4) segments **not runtime-validated** in inventories; (5) queried-not-persisted HF kinematics and torque/gear fields; (6) persisted-not-consumed odometer/fuel/EV/tire fields on ICE fleet.

**Phase 2B status: DONE** (synthesis complete from authoritative inputs; segment columns remain UNKNOWN until runtime probe).

---

## 2. Sources & Evidence

### 2.1 Canonical inputs

| Source | Role | Tag |
|--------|------|-----|
| `docs/audits/dimo-phase-2a-current-query-surface-audit-2026-08-31.md` | Query registry Q001–Q027, 41 signals, 8 events, 6 segments | CONFIRMED_FROM_CODE |
| `/tmp/phase2b-inventories/tiguan.md` | WOB L 7503, tokenId 192922, live 2026-08-30 | CONFIRMED_FROM_VEHICLE_INVENTORY |
| `/tmp/phase2b-inventories/c63.md` | KS MX 2024, tokenId 187336 | CONFIRMED_FROM_VEHICLE_INVENTORY |
| `/tmp/phase2b-inventories/a4.md` | KS MS 661, tokenId 187361 | CONFIRMED_FROM_VEHICLE_INVENTORY |
| `/tmp/phase2b-inventories/arteon.md` | HMÜ C 215, tokenId 187784, LTE_R1 | CONFIRMED_FROM_VEHICLE_INVENTORY |
| Git commits `0bab8a4d3`, `5a440c60d`, `caeaa3aa4`, `c2a0e1c5e` | Inventory doc provenance (not on `main`) | CONFIRMED_FROM_CODE |

### 2.2 Evidence tags

`CONFIRMED_FROM_CODE` · `CONFIRMED_FROM_VEHICLE_INVENTORY` · `CONFIRMED_FROM_RUNTIME_EVIDENCE` · `HISTORICAL_EVIDENCE` · `INFERENCE` · `UNKNOWN_REQUIRES_RUNTIME_PROBE` · `PROPOSAL_FOR_PHASE_2C`

### 2.3 Status taxonomy (matrix columns)

| Status | Meaning |
|--------|---------|
| `AVAILABLE_AND_QUERIED` | In vehicle `availableSignals` + selected in active SynqDrive query + data observed |
| `AVAILABLE_NOT_QUERIED` | In vehicle inventory, not in relevant SynqDrive query builder |
| `QUERIED_NOT_PERSISTED` | Requested by query; transient or derived-only; raw series discarded |
| `PERSISTED_NOT_CONSUMED` | Stored (VLS/trip) but no current driving-score / TDI consumer |
| `CONSUMED` | Persisted and consumed by production path |
| `LISTED_AND_WORKING` | `availableSignals` + `signalsLatest` non-null (inventory poll) |
| `LISTED_BUT_NULL` | Listed but null at poll (not observed in these four) |
| `NOT_AVAILABLE_ON_VEHICLE` | Not in `availableSignals`; SynqDrive may still query (null) |
| `NOT_OBSERVED_IN_THESE_FOUR_VEHICLE_INVENTORIES` | Queried by SynqDrive but absent from all four inventories |
| `UNKNOWN_NEEDS_RUNTIME_PROBE` | Segments / cadence / mechanism yield not inventory-audited |

### 2.4 Out of scope

Runtime cadence histograms (RP-01–04), segment mechanism yields, Flight Recorder implementation, query code changes.

---

## 3. Vehicle Fact Sheets (4)

### 3.1 WOB L 7503 (Tiguan) — tokenId **192922**

| Field | Value |
|-------|-------|
| vehicleId | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| orgId | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Powertrain | ICE **GASOLINE** (`obdFuelTypeName`) |
| Hardware profile | UNKNOWN (not stated in inventory) |
| Audit mode | **Live** poll 2026-08-30T18:31:12Z (driving: 25 km/h, gear 2) |
| `availableSignals` | **31** listed, **31/31** with values |
| Unique signals | `powertrainTransmissionActualGear`, `powertrainTransmissionActualGearRatio` |
| Native events (30d) | **0** (historical July: harshAccel 404, harshCorner 13) |
| VLS alignment | Live — recovery from Aug-27 stale observation |
| Q001 effectiveness | 32 req / 11 avail / 21 wasted (**65.6%**) |

### 3.2 KS MX 2024 (C63) — tokenId **187336**

| Field | Value |
|-------|-------|
| vehicleId | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| Powertrain | ICE **GASOLINE** |
| Audit mode | Last observation 2026-08-29 (parked); historical trip 2026-08-26 proven |
| `availableSignals` | **29** listed, **29/29** with values |
| Missing vs Tiguan | No gear signals |
| Native events (30d) | **34** (21 harshAccel, 12 harshCorner, 1 extremeBraking) |
| VLS | Aligned 2026-08-29T22:28:19Z; recovery after Aug-26 freeze |
| Mixed timestamps | RPM/fuel older (28.08.) than GPS (29.08.) |
| Q001 effectiveness | 32 req / 11 avail / 21 wasted (**65.6%**) |

### 3.3 KS MS 661 (A4) — tokenId **187361**

| Field | Value |
|-------|-------|
| vehicleId | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| Powertrain | ICE **DIESEL** |
| Audit mode | Trip same day 2026-08-30 13:39–13:57 UTC (4.4 km) |
| `availableSignals` | **30** listed, **30/30** with values |
| Unique signals | `obdDTCList` (**P0675**), `powertrainCombustionEngineDieselExhaustFluidLevel` |
| Missing vs gasoline ICE | `powertrainFuelSystemRelativeLevel` (not listed) |
| Native events (30d) | **0** despite same-day trip |
| DEF in snapshot | **CONSUMED** — mapped to VLS `def_level` |
| Q001 effectiveness | 32 req / 11 avail / 21 wasted (**65.6%**) |

### 3.4 HMÜ C 215 (Arteon) — tokenId **187784**

| Field | Value |
|-------|-------|
| vehicleId | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |
| Powertrain | ICE **GASOLINE** |
| Hardware | **LTE_R1** |
| Audit mode | Last obs 2026-08-29; trip 29.08. 20:52–21:31 (~32 km) |
| `availableSignals` | **29** listed, **29/29** with values |
| Native events (30d) | **50** (46 harshCornering, 1 harshAccel, 3 extremeBraking) |
| No gear, no `obdDTCList` | DTC count only (`obdStatusDTCCount`=0) |
| Connectivity history | July unplug + recovery; `obdIsPluggedIn`=1 at audit |
| Q001 effectiveness | 32 req / 11 avail / 21 wasted (**65.6%**) |

---

## 4. Phase-2A Query Mapping (summary)

Full registry in Phase 2A §3. Registry arithmetic: **27** = 22 unique definitions + 5 invocation contexts.

| Cluster | Query IDs | Vehicle relevance (Phase 2B) |
|---------|-----------|------------------------------|
| Snapshot superset | Q001 | **65.6% waste** on all four ICE vehicles |
| Live active trip | Q006–Q008 | Speed/GPS/ignition/fuel/odometer **AVAILABLE**; overlaps snapshot |
| HF post-trip | Q009 | 15 fields; torque/gear **NOT_OBSERVED** on four vehicles |
| Native events | Q015, Q016 (ctx), Q027 (ctx) | Emission rate **vehicle-specific** (0–50/30d) |
| DTC | Q005 | A4: `obdDTCList` available; others: count-only or absent |
| Capability | Q018–Q021 | Preflight stores capability; **does not gate** Q001–Q009 |
| Segments | Q022–Q025 | **UNKNOWN** yield on four vehicles |
| Energy fuel | Q013, Q014 | Relative fuel **NOT_AVAILABLE_ON_VEHICLE** (A4) |

**Capability architecture (reconfirmed):** `PARTIALLY_CAPABILITY_AWARE` — preflight runs but driving queries use static fleet-wide field lists.

---

## 5. Master Cross-Vehicle Capability Matrix (70 rows)

**Legend — vehicle columns:** `✓` = LISTED_AND_WORKING · `—` = NOT_AVAILABLE_ON_VEHICLE · `∅` = queried by SynqDrive but null/not listed · `?` = UNKNOWN_NEEDS_RUNTIME_PROBE (segments)

| # | Row | Family | Query IDs | Tiguan | C63 | A4 | Arteon | SynqDrive status |
|---|-----|--------|-----------|--------|-----|-----|--------|------------------|
| 1 | `speed` | kinematics | Q001,Q006,Q007,Q009 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; CONSUMED (FSM/UI/HF) |
| 2 | `isIgnitionOn` | powertrain | Q001,Q006,Q009 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; CONSUMED (FSM) |
| 3 | `powertrainTransmissionTravelledDistance` | kinematics | Q001,Q006 | ✓ | ✓ | ✓ | ✓ | QUERIED; PERSISTED_NOT_CONSUMED (odometer) |
| 4 | `powertrainFuelSystemRelativeLevel` | fuel | Q001,Q013,Q014 | ✓ | ✓ | — | ✓ | 3/4 vehicles; A4 ∅; PERSISTED_NOT_CONSUMED |
| 5 | `powertrainFuelSystemAbsoluteLevel` | fuel | Q001,Q006,Q013,Q014 | ✓ | ✓ | ✓ | ✓ | QUERIED; PERSISTED_NOT_CONSUMED |
| 6 | `powertrainTractionBatteryStateOfChargeCurrent` | EV/HV | Q001,Q009 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE (ICE); QUERIED ∅ |
| 7 | `powertrainTractionBatteryStateOfChargeCurrentEnergy` | EV/HV | Q001,Q006 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 8 | `powertrainTractionBatteryStateOfHealth` | EV/HV | Q001 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 9 | `powertrainTractionBatteryCurrentPower` | EV/HV | Q001,Q009,Q025 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 10 | `powertrainTractionBatteryCurrentVoltage` | EV/HV | Q001 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 11 | `powertrainTractionBatteryTemperatureAverage` | EV/HV | Q001,Q009 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 12 | `powertrainTractionBatteryChargingIsCharging` | EV/HV | Q001,Q025 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 13 | `powertrainTractionBatteryChargingIsChargingCableConnected` | EV/HV | Q001,Q025 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 14 | `powertrainTractionBatteryChargingPower` | EV/HV | Q001,Q025 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 15 | `powertrainTractionBatteryChargingChargeLimit` | EV/HV | Q001,Q025 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 16 | `powertrainTractionBatteryChargingAddedEnergy` | EV/HV | Q001,Q025 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 17 | `powertrainTractionBatteryRange` | EV/HV | Q001 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 18 | `powertrainTractionBatteryGrossCapacity` | EV/HV | Q001 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 19 | `powertrainCombustionEngineEngineOilRelativeLevel` | fluids | Q001 | — | — | — | — | NOT_AVAILABLE_ON_VEHICLE; QUERIED ∅ |
| 20 | `powertrainCombustionEngineDieselExhaustFluidLevel` | fluids | Q001 | — | — | ✓ | — | A4 only; AVAILABLE_AND_QUERIED; CONSUMED (DEF) |
| 21 | `powertrainCombustionEngineECT` | thermal | Q001,Q008,Q009 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; ABUSE_OR_CONTEXT |
| 22 | `powertrainCombustionEngineSpeed` | engine | Q008,Q009,Q012 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED (snapshot); QUERIED live/HF |
| 23 | `obdThrottlePosition` | engine | Q008,Q009 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED (snapshot); QUERIED; CONSUMED (load/HF) |
| 24 | `obdEngineLoad` | engine | Q001,Q008,Q009 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; LOAD_COMPONENT |
| 25 | `obdRunTime` | OBD | Q009 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED (snapshot); QUERIED HF |
| 26 | `powertrainCombustionEngineTorque` | engine | Q009 | — | — | — | — | NOT_OBSERVED_IN_THESE_FOUR; QUERIED HF; QUERIED_NOT_PERSISTED |
| 27 | `powertrainCombustionEngineTorquePercent` | engine | Q009 | — | — | — | — | NOT_OBSERVED; QUERIED HF; QUERIED_NOT_PERSISTED |
| 28 | `exteriorAirTemperature` | climate | Q009,Q010 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED (snapshot); QUERIED HF/env |
| 29 | `currentLocationAltitude` | position | Q009 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED (snapshot); QUERIED HF |
| 30 | `powertrainTransmissionCurrentGear` | transmission | Q009 | — | — | — | — | NOT_OBSERVED; QUERIED HF; QUERIED_NOT_PERSISTED |
| 31 | `currentLocationCoordinates` | position | Q001,Q007 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; CONSUMED |
| 32 | `lowVoltageBatteryCurrentVoltage` | electrical | Q001,Q012 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; HEALTH_INPUT |
| 33 | `chassisAxleRow1WheelLeftTirePressure` | tire | Q001,Q011 | — | — | — | — | NOT_AVAILABLE (no TPMS); QUERIED ∅ |
| 34 | `chassisAxleRow1WheelRightTirePressure` | tire | Q001,Q011 | — | — | — | — | NOT_AVAILABLE; QUERIED ∅ |
| 35 | `chassisAxleRow2WheelLeftTirePressure` | tire | Q001,Q011 | — | — | — | — | NOT_AVAILABLE; QUERIED ∅ |
| 36 | `chassisAxleRow2WheelRightTirePressure` | tire | Q001,Q011 | — | — | — | — | NOT_AVAILABLE; QUERIED ∅ |
| 37 | `chassisTireSystemIsWarningOn` | tire | Q001 | — | — | — | — | NOT_AVAILABLE; QUERIED ∅ |
| 38 | `obdIsPluggedIn` | connectivity | Q001 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; connectivity path |
| 39 | `connectivityCellularIsJammingDetected` | connectivity | Q001 | — | — | — | — | NOT_AVAILABLE; QUERIED ∅ |
| 40 | `powertrainType` | meta | Q001 | ✓ | ✓ | ✓ | ✓ | AVAILABLE_AND_QUERIED; raw_payload |
| 41 | `obdDTCList` | health | Q005 | — | — | ✓ | — | A4 only; AVAILABLE via Q005 not Q001 |
| 42 | `currentLocationHeading` | position | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 43 | `obdBarometricPressure` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 44 | `obdDistanceWithMIL` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 45 | `obdFuelRailPressure` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 46 | `obdFuelTypeName` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 47 | `obdIntakeTemp` | thermal | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 48 | `obdLongTermFuelTrim1` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 49 | `obdLongTermFuelTrim2` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 50 | `obdMAP` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 51 | `obdMaxMAF` | OBD | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 52 | `obdOilTemperature` | thermal | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 53 | `obdStatusDTCCount` | health | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED |
| 54 | `powertrainCombustionEngineTPS` | engine | — | ✓ | ✓ | ✓ | ✓ | AVAILABLE_NOT_QUERIED (alias family vs `obdThrottlePosition`) |
| 55 | `powertrainTransmissionActualGear` | transmission | — | ✓ | — | — | — | Tiguan only; AVAILABLE_NOT_QUERIED |
| 56 | `powertrainTransmissionActualGearRatio` | transmission | — | ✓ | — | — | — | Tiguan only; AVAILABLE_NOT_QUERIED |
| 57 | `behavior.harshBraking` | native event | Q015 | HIST | ✓ | — | HIST | Event filter; vehicle-specific emission |
| 58 | `behavior.extremeBraking` | native event | Q015 | — | ✓ | — | ✓ | C63+Arteon 30d |
| 59 | `behavior.harshAcceleration` | native event | Q015 | HIST | ✓ | — | ✓ | |
| 60 | `behavior.extremeAcceleration` | native event | Q015 | — | — | — | — | In Q015 filter; not in 30d samples |
| 61 | `behavior.harshCornering` | native event | Q015 | HIST | ✓ | — | ✓ | Arteon dominant (46/50) |
| 62 | `behavior.extremeEmergency` | native event | Q015 | — | — | — | — | In filter; not in 30d samples |
| 63 | `behavior.extremeEmergencyBraking` | native event | Q015 | — | — | — | — | In filter; not in 30d samples |
| 64 | `safety.collision` | native event | Q015,Q016 | ? | ? | ? | ? | In filter; UNKNOWN emission on four |
| 65 | `changePointDetection` | segment | Q022 | ? | ? | ? | ? | UNKNOWN_NEEDS_RUNTIME_PROBE |
| 66 | `ignitionDetection` | segment | Q022 | ? | ? | ? | ? | UNKNOWN_NEEDS_RUNTIME_PROBE |
| 67 | `frequencyAnalysis` | segment | Q022 | ? | ? | ? | ? | UNKNOWN_NEEDS_RUNTIME_PROBE |
| 68 | `idling` | segment | Q022 | ? | ? | ? | ? | UNKNOWN_NEEDS_RUNTIME_PROBE |
| 69 | `refuel` | segment | Q023 | ? | ? | ? | ? | UNKNOWN_NEEDS_RUNTIME_PROBE |
| 70 | `recharge` | segment | Q025 | — | — | — | — | ICE N/A; mechanism UNKNOWN on ICE |

**HIST** = historical `eventDataSummary` only, 0 in last 30d window.

**Signals NOT observed in any inventory (SynqDrive still queries):** longitudinal/lateral acceleration, yaw (`angularVelocityYaw`), steering angle, wheel speed, brake pedal/pressure, ABS/ESC status, `powertrainCombustionEngineTorque*`, `powertrainTransmissionCurrentGear`.

---

## 6. Current Query Effectiveness Matrix

Rows for production-active / invocation-context queries referenced in Phase 2B scope.

| Query | Surface | Signals/events | Tiguan | C63 | A4 | Arteon | Effectiveness | Waste class |
|-------|---------|----------------|--------|-----|-----|--------|---------------|-------------|
| **Q001** | Snapshot | 32 tel | 11/32 avail | 11/32 | 11/32 | 11/32 | **65.6% wasted** | VERY_HIGH |
| **Q005** | DTC | `obdDTCList` | — | — | ✓ P0675 | — | Partial vehicle fit | LOW |
| **Q006** | Live core | 5 | ✓ core set | ✓ | ✓ | ✓ | HIGH fit | LOW |
| **Q007** | Live route | 2 | ✓ GPS,speed | ✓ | ✓ | ✓ | HIGH fit | LOW |
| **Q008** | Live perf | 4 | ✓ RPM,TPS,load,ECT | ✓ | ✓ | ✓ | HIGH fit (post-trip overlap) | MODERATE |
| **Q009** | HF 1s | 15 | 9/15 observed | 9/15 | 9/15 | 9/15 | **6 fields NOT_OBSERVED** (torque×2, gear, + not in HF list but queried) | HIGH |
| **Q010** | Env 2m | 1 ext temp | ✓ | ✓ | ✓ | ✓ | HIGH fit | LOW |
| **Q012** | Crank 5s | 2 | ✓ LV,RPM | ✓ | ✓ | ✓ | HIGH fit | LOW |
| **Q013** | Fuel 30s | 2 | ✓ rel+abs | ✓ | abs only | ✓ | A4: rel ∅ | MODERATE |
| **Q014** | Refuel ctx | reuses Q013 | ✓ | ✓ | abs only | ✓ | Same as Q013 | MODERATE |
| **Q015** | Native events | 8 names | 0/30d | 34/30d | 0/30d | 50/30d | **Highly variable** | VARIABLE |
| **Q016** | Safety ctx | 1 | ? | ? | ? | ? | UNKNOWN emission | UNKNOWN |
| **Q017** | Event summary | gate | INFERENCE LTE_R1 path | — | — | ✓ Arteon | ENRICHMENT_GATE | LOW |
| **Q023** | Refuel seg | mechanism | ? | ? | ? | ? | UNKNOWN | UNKNOWN |
| **Q025** | Recharge seg | mechanism | — ICE | — | — | — | N/A ICE | N/A |
| **Q027** | Event HF ctx | reuses Q009 | 0 events | 34 eligible | 0 events | 50 eligible | Gated by Q015 yield | VARIABLE |

**Q001 detail (all ICE):** 11 available = coordinates, speed, odometer, fuel (rel or abs+DEF), ECT, ignition, engine load, LV voltage, plugged, type (+ rel fuel except A4 counts DEF instead).

---

## 7. Static Superset Query Waste

| Query pattern | Requested fields | Typical ICE avail | Waste % | Classification |
|---------------|------------------|-------------------|---------|----------------|
| Q001 snapshot | 32 telemetry | 11 | **65.6%** | VERY_HIGH |
| Q001 EV/HV block | 13 | 0 | 100% on ICE | EXPECTED_NULL |
| Q001 tire block | 5 | 0 | 100% (no TPMS) | EXPECTED_NULL |
| Q009 HF torque/gear | 3 | 0 observed | 100% on four | QUERIED_DEAD_FIELDS |
| Q001 oil/DEF/jamming | 3 | 0–1 | 67–100% | PARTIAL (A4 DEF) |

**Verdict:** Fleet-wide static GraphQL field lists dominate request volume; preflight **does not trim** Q001/Q009. Scaling risk from Phase 2A §6 remains **HIGH** at fleet scale with unchanged architecture.

---

## 8. Available But Not Queried (15 rows — FULL)

Signals present on vehicles, **not** in Q001 snapshot (most also absent from entire Phase-2A query surface).

| # | Signal | Tiguan | C63 | A4 | Arteon | In any SynqDrive query? | Priority |
|---|--------|--------|-----|-----|--------|-------------------------|----------|
| 1 | `currentLocationHeading` | ✓ | ✓ | ✓ | ✓ | No (detail API only) | P2 route context |
| 2 | `obdBarometricPressure` | ✓ | ✓ | ✓ | ✓ | No | P3 |
| 3 | `obdDistanceWithMIL` | ✓ | ✓ | ✓ | ✓ | No | P2 health (A4: 3426 km) |
| 4 | `obdFuelRailPressure` | ✓ | ✓ | ✓ | ✓ | No | P3 |
| 5 | `obdFuelTypeName` | ✓ | ✓ | ✓ | ✓ | No | P2 classification |
| 6 | `obdIntakeTemp` | ✓ | ✓ | ✓ | ✓ | No | P2 cold-engine |
| 7 | `obdLongTermFuelTrim1` | ✓ | ✓ | ✓ | ✓ | No | P3 |
| 8 | `obdLongTermFuelTrim2` | ✓ | ✓ | ✓ | ✓ | No | P3 |
| 9 | `obdMAP` | ✓ | ✓ | ✓ | ✓ | No | P3 |
| 10 | `obdMaxMAF` | ✓ | ✓ | ✓ | ✓ | No | P3 |
| 11 | `obdOilTemperature` | ✓ | ✓ | ✓ | ✓ | No | P2 thermal |
| 12 | `obdStatusDTCCount` | ✓ | ✓ | ✓ | ✓ | No | **P1** health |
| 13 | `powertrainCombustionEngineTPS` | ✓ | ✓ | ✓ | ✓ | No (`obdThrottlePosition` in HF/live) | P1 alias gap |
| 14 | `powertrainTransmissionActualGear` | ✓ | — | — | — | No | P1 Tiguan-only |
| 15 | `powertrainTransmissionActualGearRatio` | ✓ | — | — | — | No | P1 Tiguan-only |

**Note:** `powertrainCombustionEngineSpeed`, `obdThrottlePosition`, `exteriorAirTemperature`, `currentLocationAltitude`, `obdRunTime` are available on all four but queried only outside snapshot (HF/live/env) — counted in §5 matrix rows, not this 15-row supplement.

---

## 9. Queried But Underused

### A. QUERIED_NOT_PERSISTED

| Signal / data | Query | Evidence |
|---------------|-------|----------|
| Full HF 1s bucket series | Q009 | Raw series discarded post-detector; CH mirror optional subset |
| `powertrainTransmissionCurrentGear` | Q009 | NOT_OBSERVED on four; never persisted |
| `powertrainCombustionEngineTorque` | Q009 | NOT_OBSERVED; abuse path only if present |
| `powertrainCombustionEngineTorquePercent` | Q009 | NOT_OBSERVED |
| Live core/route raw buckets | Q006,Q007 | Watermark overlap discarded |
| Q027 per-event HF windows | Q027 | DERIVED_ONLY context stats |

### B. PERSISTED_NOT_CONSUMED

| Field | Persistence | Consumer gap |
|-------|-------------|--------------|
| Odometer | VLS, trip | NO_CURRENT_DRIVING_IMPACT_CONSUMER (composite) |
| Fuel relative/absolute | VLS, trip | UI/trip evidence; not stress score |
| EV/HV snapshot fields | VLS | ICE fleet: always null, occasional JSON noise |
| Tire pressures | VLS query | NOT_AVAILABLE_ON_VEHICLE (no TPMS on four) |
| `engine_load` snapshot | VLS | UI only; not HF stress path |

### C. POTENTIAL_QUERY_DUPLICATION

| Pattern | Queries | Notes |
|---------|---------|-------|
| Speed/RPM/TPS/load | Q001+Q006–Q008+Q009 | NECESSARY_DIFFERENT_LATENCY (Phase 2A) |
| Post-trip route+perf | Q007+Q008 vs live | POTENTIAL duplication |
| LTE_R1 double HF | Q009 ×2 | CONFIRMED_FROM_CODE (Arteon path) |
| `safety.collision` | Q015+Q016 | Overlap, different consumers |

### D. ENRICHMENT_GATE_ONLY

| Query | Role |
|-------|------|
| Q017 | LTE_R1 pre-check before Q015 |
| Q018–Q019 | Capability preflight; does not reshape Q001 |

### E. DEFINED_BUT_UNUSED

| Query | Signal |
|-------|--------|
| Q011 | Tire pressure history — no production caller |

---

## 10. Signal Families

| Family | Union signals (33 vehicle) | Queried (41) | Gap pattern |
|--------|---------------------------|--------------|-------------|
| Position/GPS | coords, heading, altitude | coords, altitude (HF) | heading never queried |
| Kinematics | speed, odometer | speed, odometer | odometer under-consumed |
| Engine RPM/load/TPS | RPM, load, TPS, `obdThrottlePosition`, `powertrainCombustionEngineTPS` | RPM, load, `obdThrottlePosition` | TPS alias not queried; snapshot misses RPM |
| Transmission | actual gear×2 (Tiguan), currentGear (queried only) | currentGear (HF) | actual gear not queried |
| Fuel | rel (3/4), abs | rel, abs | A4 diesel abs-only |
| DEF | A4 only | Q001 | CONSUMED on A4 |
| OBD diagnostic | 15+ OBD scalars | DTC list (Q005), engine load | most OBD not queried |
| Thermal | ECT, ext temp, oil, intake | ECT, ext (HF/env) | oil/intake not queried |
| Electrical | LV voltage | LV | CONSUMED health |
| EV/HV | — on four ICE | 13 fields Q001 | 100% waste ICE |
| Tire/chassis | — (no TPMS) | 5 tire Q001 | 100% waste |
| Connectivity | plugged | plugged, jamming | jamming not available |
| Native events | 8 names in filter | 8 | emission 0–50/30d |
| Segments | 6 mechanisms | 6 | UNKNOWN yield |
| **Not observed** | — | torque×2, yaw, brake, wheel speed | dead HF fields |

---

## 11. Potential Scores — Driver Quality

| Signal / event | Tiguan | C63 | Arteon | A4 | Current SynqDrive use | Potential |
|--------------|--------|-----|--------|-----|----------------------|-----------|
| Native harsh events | HIST only | ✓ 34/30d | ✓ 50/30d | — | Q015 → composite (LTE_R1) | **HIGH** where emitted |
| HF speed → detectors | ✓ | ✓ | ✓ | ✓ | Q009 SMART5/HF path | HIGH |
| `obdThrottlePosition` / TPS | ✓ | ✓ | ✓ | ✓ | Live avg + HF | HIGH kickdown/launch |
| RPM | ✓ | ✓ | ✓ | ✓ | Live/HF not snapshot | MODERATE live |
| Gear (Tiguan) | ✓ | — | — | — | Not queried | PROPOSAL_FOR_PHASE_2C |
| **Missing:** yaw, lateral/long accel | — | — | — | — | Not on DIMO four | Gap remains |

---

## 12. Potential Scores — Vehicle Load

| Signal | Availability | Queried | Consumer today | Potential |
|--------|--------------|---------|----------------|-----------|
| `obdEngineLoad` | 4/4 | Q001,Q008,Q009 | LOAD_COMPONENT_ONLY | Already used |
| `powertrainCombustionEngineTPS` | 4/4 | No | — | **HIGH** — parallel to load |
| `powertrainCombustionEngineSpeed` | 4/4 | Q008,Q009 | LOAD_COMPONENT live avg | **HIGH** snapshot gap |
| `powertrainTransmissionActualGear` | Tiguan | No | — | MODERATE (1 vehicle) |
| Torque | NOT_OBSERVED | Q009 | — | LOW on this fleet |

---

## 13. Potential Scores — Brake

| Signal / event | Four-vehicle reality | SynqDrive | Potential |
|----------------|---------------------|-----------|-----------|
| `chassisBrakeIsPedalPressed` | NOT_AVAILABLE | Not queried | — |
| `chassisBrakePedalPosition` | NOT_AVAILABLE | Not queried | — |
| ABS/ESC signals | NOT_AVAILABLE | Not queried | — |
| `behavior.harshBraking` | HIST/sparse | Q015 | HIGH when native |
| `behavior.extremeBraking` | C63, Arteon | Q015 | HIGH LTE_R1 |
| HF speed-only reconstruction | 4/4 | Q009 detectors | MODERATE fallback |

**Verdict:** Brake domain on these four vehicles is **native-event-dependent** (LTE_R1); no pedal pressure path.

---

## 14. Potential Scores — Tire

| Signal | Four vehicles | Q001 | Potential |
|--------|---------------|------|-----------|
| Tire pressures ×4 | NOT_AVAILABLE | Queried ∅ | None without TPMS |
| `chassisTireSystemIsWarningOn` | NOT_AVAILABLE | Queried ∅ | None |
| Q011 tire history | — | DEFINED_BUT_UNUSED | Dead query |

---

## 15. Potential Scores — Context / Validation

| Signal | 4/4 avail | Queried | Use |
|--------|-----------|---------|-----|
| `exteriorAirTemperature` | ✓ | Q010,Q009 | Cold/context abuse |
| `obdIntakeTemp` | ✓ | No | Cold-engine validation |
| `obdRunTime` | ✓ | Q009 | Cold-start windows |
| `obdOilTemperature` | ✓ | No | Thermal validation |
| `currentLocationHeading` | ✓ | No | Cornering validation vs GPS |
| `obdStatusDTCCount` | ✓ | No | Health gate |
| `obdDTCList` | A4 | Q005 | Health (A4 P0675) |
| Segments | ? | Q022 | Trip repair validation UNKNOWN |

---

## 16. Signal Aliases

| Canonical / UI | DIMO variants observed | SynqDrive queries | Gap |
|----------------|------------------------|-------------------|-----|
| `throttlePosition` | `obdThrottlePosition` | Q008, Q009 | ✓ queried |
| `throttlePosition` | `powertrainCombustionEngineTPS` | **Not queried** | **Alias gap** — 4/4 have TPS signal |
| `engineCoolantTempC` | `powertrainCombustionEngineECT` | Q001,Q008,Q009 | ✓ |
| `currentGear` | `powertrainTransmissionCurrentGear` | Q009 only | NOT_OBSERVED |
| `currentGear` | `powertrainTransmissionActualGear` | Not queried | Tiguan only |
| `odometerKm` | `powertrainTransmissionTravelledDistance` | Multiple | ✓ |

**Recommendation (PROPOSAL_FOR_PHASE_2C):** Normalize TPS/throttle in mapper; prefer vehicle-available alias from `availableSignals`.

---

## 17. Common Core vs Vehicle-Specific

| Tier | Count | Members |
|------|------:|---------|
| **Common core (28)** | 28 | All position/OBD/engine scalars except vehicle-specific rows below |
| **Exactly 3 vehicles** | 1 | `powertrainFuelSystemRelativeLevel` (no A4) |
| **Exactly 1 vehicle** | 4 | `powertrainTransmissionActualGear`, `powertrainTransmissionActualGearRatio` (Tiguan); `obdDTCList`, `powertrainCombustionEngineDieselExhaustFluidLevel` (A4) |
| **Union total** | **33** | 28+1+4 |

**Queried superset (41)** minus **vehicle union (33)** = **8+ fields** never observable on these four (EV block, tires, oil, torque, currentGear, jamming) plus **15** vehicle signals never queried.

---

## 18. Hardware Profile vs Capability

| Profile | Vehicle | Events 30d | Gear signals | Verdict |
|---------|---------|------------|--------------|---------|
| UNKNOWN | Tiguan | 0 (HIST) | ✓ ActualGear | Events ≠ hardware-only |
| UNKNOWN | C63 | 34 | — | Events without LTE_R1 label |
| UNKNOWN | A4 | 0 | — | No events despite trip |
| **LTE_R1** | Arteon | **50** | — | Native event authority path |

**Verdict: PARTIAL** — LTE_R1 Arteon shows rich native events, but C63 (34 events) lacks LTE_R1 label in inventory; Tiguan has gear but no recent events. **SMART5 not in audit set** — cannot confirm SMART5 vs LTE_R1 split from these four alone.

**CONFIRMED_FROM_CODE:** Same static GraphQL lists for all hardware profiles; gates affect enrichment services only.

---

## 19. `availableSignals` Reliability

| Vehicle | Listed | Working (latest) | Rate | Historical notes |
|---------|--------|------------------|------|------------------|
| Tiguan | 31 | 31 | **100%** | Live 2026-08-30 |
| C63 | 29 | 29 | **100%** | Mixed per-signal timestamps |
| A4 | 30 | 30 | **100%** | Aligned VLS |
| Arteon | 29 | 29 | **100%** | Recovery post-stale |

**Verdict:** `availableSignals` is a **reliable enumeration** for these vehicles at audit time (listed = working). It does **not** imply SynqDrive queries match list (static superset persists).

**INFERENCE:** 7-day preflight gate may miss short-lived signal changes.

---

## 20. Cadence Evidence (inventories only)

No runtime interval histograms — **HISTORICAL_EVIDENCE / inventory sample counts only.**

| Signal class | Pattern (all four) | Evidence tag |
|--------------|-------------------|--------------|
| GPS coords/heading/altitude | **Highest** sample counts (~277k–867k) | CONFIRMED_FROM_VEHICLE_INVENTORY |
| speed / ignition | Mid (~21k–124k) | CONFIRMED_FROM_VEHICLE_INVENTORY |
| RPM / throttle | Lower (~8k–112k) | CONFIRMED_FROM_VEHICLE_INVENTORY |
| `obdDTCList` (A4) | 511 samples | CONFIRMED_FROM_VEHICLE_INVENTORY |

**REQUESTED_BUCKET vs observed:** Still **UNKNOWN_REQUIRES_RUNTIME_PROBE** for Q006–Q009 (Phase 2A RP-01–04).

---

## 21. Native Events Matrix (8 × 4)

| Event (Q015 filter) | Tiguan 30d | C63 30d | A4 30d | Arteon 30d | Historical note |
|---------------------|------------|---------|--------|------------|-----------------|
| `behavior.harshBraking` | 0 | 0 | 0 | 0 | Arteon 721 total hist |
| `behavior.extremeBraking` | 0 | 1 | 0 | 3 | |
| `behavior.harshAcceleration` | 0 | 21 | 0 | 1 | Tiguan 404 total |
| `behavior.extremeAcceleration` | 0 | 0 | 0 | 0 | In filter only |
| `behavior.harshCornering` | 0 | 12 | 0 | **46** | Tiguan 13; Arteon 3142 total |
| `behavior.extremeEmergency` | 0 | 0 | 0 | 0 | In filter only |
| `behavior.extremeEmergencyBraking` | 0 | 0 | 0 | 0 | In filter only |
| `safety.collision` | ? | ? | ? | ? | UNKNOWN emission |
| **Total 30d** | **0** | **34** | **0** | **50** | |

**A4 anomaly:** Same-day trip 2026-08-30, **0** events — warrants RP-21.

---

## 22. Segments Matrix (6 mechanisms)

**NOT audited** in any of four inventory documents → all **UNKNOWN_NEEDS_RUNTIME_PROBE**.

| Mechanism | Query | Tiguan | C63 | A4 | Arteon | Scoring use (Phase 2A) |
|-----------|-------|--------|-----|-----|--------|------------------------|
| `changePointDetection` | Q022 | ? | ? | ? | ? | Trip repair |
| `ignitionDetection` | Q022 | ? | ? | ? | ? | Context |
| `frequencyAnalysis` | Q022 | ? | ? | ? | ? | Context |
| `idling` | Q022 | ? | ? | ? | ? | Not scoring |
| `refuel` | Q023 | ? | ? | ? | ? | Energy |
| `recharge` | Q025 | — | — | — | — | ICE N/A |

---

## 23. Driving Intelligence Coverage Scorecards

### Tiguan (WOB L 7503)

| Domain | Coverage | Gap |
|--------|----------|-----|
| Kinematics | **Strong** (live GPS, speed) | Heading not queried |
| Engine load/RPM | **Partial** (HF/live only) | Snapshot miss |
| Native events | **Weak recent** (0/30d) | LTE_R1 path may not run |
| Brake | **Weak** | No pedal; no recent native brake events |
| Tire | **None** | No TPMS |
| Health DTC | **Partial** | DTC list not on vehicle |
| Gear context | **Unique** | ActualGear avail, not queried |

### C63 (KS MX 2024)

| Domain | Coverage | Gap |
|--------|----------|-----|
| Kinematics | **Strong** | |
| Engine | **Strong** historical | Snapshot miss |
| Native events | **Moderate** (34/30d) | Not labeled LTE_R1 |
| Brake | **Moderate** native | |
| Tire | **None** | |
| Timestamp freshness | **Risk** | Mixed signal ages |

### A4 (KS MS 661)

| Domain | Coverage | Gap |
|--------|----------|-----|
| Kinematics | **Strong** | |
| Engine | **Strong** (trip proven) | |
| Native events | **None** (0/30d) | **Anomaly** vs trip |
| Health | **Strong** DTC+DEF | DTC not in snapshot |
| Fuel | **Abs only** | No relative fuel signal |
| Diesel | DEF **CONSUMED** | |

### Arteon (HMÜ C 215, LTE_R1)

| Domain | Coverage | Gap |
|--------|----------|-----|
| Kinematics | **Strong** | |
| Engine | **Strong** historical | Snapshot miss |
| Native events | **Strong** (50/30d, cornering) | Q015 primary path |
| Brake | **Moderate** native | |
| Connectivity | **Recovered** | Historical unplug |
| Tire | **None** | |

---

## 24. Runtime Probe Reconciliation

### Phase 2A backlog (RP-01–RP-20) — Phase 2B input

| ID | Phase 2A question | Phase 2B status |
|----|-------------------|-----------------|
| RP-01 | HF effective cadence | **OPEN** — inventories lack histogram |
| RP-02 | Live 15s perf cadence | **OPEN** |
| RP-03 | Live 7s route cadence | **OPEN** |
| RP-04 | Live 20s core cadence | **OPEN** |
| RP-05 | Snapshot latency | **PARTIAL** — VLS/DIMO alignment on 3/4 |
| RP-06 | listed-but-null | **CLOSED** for four vehicles at audit (100% working) |
| RP-07 | Native event rate | **PARTIAL** — 0/34/0/50 documented |
| RP-08 | safety.collision | **OPEN** |
| RP-09 | Segment yield | **OPEN** — not inventory-audited |
| RP-10 | Recharge filter | **N/A** ICE four |
| RP-11 | Fuel 30s bucket | **OPEN** |
| RP-12 | Rate limits | **OPEN** (external) |
| RP-13 | CH mirror | **OPEN** |
| RP-14 | Ignition null EV | **N/A** ICE four |
| RP-15 | RAND coords | **OPEN** |
| RP-16 | Event vs HF alignment | **OPEN** |
| RP-17 | availableSignals stability | **PARTIAL** — 100% at poll |
| RP-18 | Crank 5s | **OPEN** |
| RP-19 | Long-trip HF limits | **OPEN** |
| RP-20 | SMART5 vs HF | **OPEN** — no SMART5 in set |

### New probes (RP-21+)

| ID | Question | Vehicle | Priority |
|----|----------|---------|----------|
| **RP-21** | Why A4 zero native events on 2026-08-30 trip? | A4 | P1 |
| **RP-22** | Tiguan historical events but 0/30d — pipeline or driving style? | Tiguan | P2 |
| **RP-23** | ActualGear correlation with load/HF on Tiguan | Tiguan | P2 |
| **RP-24** | Mixed per-signal `signalsLatest` timestamps (C63) — FSM impact | C63 | P2 |
| **RP-25** | C63 events without LTE_R1 label — which enrichment path runs? | C63 | P1 |
| **RP-26** | Segment mechanism yield all six on one ICE vehicle | any | P1 |
| **RP-27** | `powertrainCombustionEngineTPS` vs `obdThrottlePosition` divergence | 4/4 | P2 |
| **RP-28** | A4 P0675 — `obdDistanceWithMIL` 3426 km correlation | A4 | P2 health |
| **RP-29** | Arteon cornering event rate vs HF-only cornering detection | Arteon | P1 |
| **RP-30** | Dynamic Q001 from `availableSignals` — waste reduction measurement | fleet | P1 Phase 2C |

---

## 25. Findings

| ID | Type | Severity | Summary |
|----|------|----------|---------|
| F2B-01 | CAPABILITY_FACT | — | Union 33 vehicle signals; common core 28 |
| F2B-02 | QUERY_WASTE | **P1** | Q001 **65.6%** field waste on every ICE audit vehicle |
| F2B-03 | QUERY_WASTE | P2 | Q009 queries torque/gear/currentGear **NOT_OBSERVED** on four |
| F2B-04 | ACQUISITION_GAP | **P1** | RPM, throttle/TPS live on DIMO, absent from snapshot/VLS |
| F2B-05 | ACQUISITION_GAP | P2 | 15 signals **AVAILABLE_NOT_QUERIED** including DTC count |
| F2B-06 | EVENT_VARIANCE | **P1** | Native events 0–50/30d; not predicted by hardware alone |
| F2B-07 | EVENT_ANOMALY | P2 | A4 trip same day, **0** events (RP-21) |
| F2B-08 | CAPABILITY_ARCHITECTURE | P2 | `availableSignals` reliable but **does not drive** queries |
| F2B-09 | HARDWARE_VERDICT | — | Hardware predicts capability **PARTIAL** |
| F2B-10 | SEGMENT_UNKNOWN | P2 | All six segment mechanisms **UNKNOWN** on four vehicles |
| F2B-11 | PERSISTENCE_GAP | P2 | HF raw **QUERIED_NOT_PERSISTED**; odometer/fuel **PERSISTED_NOT_CONSUMED** |
| F2B-12 | TIRE_DEAD_PATH | P3 | No TPMS on four; Q001+Q011 tire queries pure waste |
| F2B-13 | EV_WASTE | P2 | 13 EV fields queried on 100% ICE audit set |
| F2B-14 | ALIAS_GAP | P2 | `powertrainCombustionEngineTPS` on 4/4, not queried |
| F2B-15 | VEHICLE_SPECIFIC | P3 | Gear signals Tiguan-only; DEF+DTC A4-only |
| F2B-16 | PROVENANCE | — | Inventory docs not on `main`; commits 0bab8a4d3…c2a0e1c5e |

---

## 26. Exact Counts (Phase 2B exit arithmetic)

| Count | Value | Derivation |
|-------|------:|------------|
| Total unique signals across four vehicles (union) | **33** | Set union of four `availableSignals` lists |
| Signals common to all four vehicles | **28** | Intersection |
| Signals on exactly 1 vehicle | **4** | Tiguan gear×2; A4 `obdDTCList` + DEF |
| Signals on exactly 2 vehicles | **0** | — |
| Signals on exactly 3 vehicles | **1** | `powertrainFuelSystemRelativeLevel` (missing A4 diesel) |
| Signals on exactly 4 vehicles | **28** | ICE common core |
| Signals currently queried by SynqDrive (Phase 2A) | **41** | §22.3 Phase 2A |
| Available-not-queried signals (union, not in 41) | **15** | §8 |
| Queried-not-persisted signal/data paths (§9A rows) | **6** | HF series, currentGear, torque×2, live buckets, Q027 windows |
| Persisted-not-consumed fields (§9B rows) | **5** | odometer, fuel×2, EV snapshot, tire query, engine_load snapshot |
| Native event types in Q015 filter | **8** | Phase 2A §22.3 |
| Native event capability matrix rows | **8** | §21 |
| Segment mechanism rows | **6** | §22 (all UNKNOWN) |
| Master cross-vehicle matrix rows | **70** | 41 + 15 + 8 + 8 events + 6 segments − overlap check: 41+15+8+6=70 |
| Q001 queried-but-null/unsupported per ICE vehicle | **21** | 32 − 11 available |
| Runtime probes RP-01–RP-20 resolved by inventory | **1** | RP-06 CLOSED |
| Runtime probes partially resolved | **3** | RP-05, RP-07, RP-17 |
| Runtime probes no longer relevant (ICE four) | **2** | RP-10, RP-14 |
| Runtime probes still required | **14** | RP-01–04,08–09,11–13,15–16,18–20 |
| New runtime probes RP-21+ | **10** | RP-21–RP-30 |

---

## 27. Phase-2C Handoff

### Top candidates

| Rank | Candidate | Category | Rationale |
|------|-----------|----------|-----------|
| **A** | Dynamic snapshot from `availableSignals` | Architecture | Cut **~65%** Q001 waste; preflight already lists signals |
| **B** | Add RPM + throttle/TPS to snapshot or VLS JSON | Acquisition | **P0** in all inventories; driving behavior |
| **C** | `obdStatusDTCCount` + conditional `obdDTCList` in snapshot/Q005 cadence | Health | A4 active P0675; count on 4/4 |
| **D** | Native event path audit (A4 zero-event, C63 non-LTE_R1) | Runtime | RP-21, RP-25 before scoring reliance |
| **E** | Segment runtime probe pack (RP-26) | Validation | All UNKNOWN; trip repair dependency |

### Deliverables for Phase 2C

1. Query profile manifest keyed by `availableSignals` ∩ org vehicle profile.
2. Execute RP-21, RP-25, RP-26, RP-29, RP-30 first.
3. Merge inventory docs to `docs/audits/` on `main`.
4. TPS/throttle alias normalization in mapper layer.
5. Remove or gate EV/tire fields for ICE capability class.

---

## 28. Phase-3 Implications (Flight Recorder)

Minimum observation record per Phase 2A §26, plus Phase 2B extensions:

| Field | Why (Phase 2B) |
|-------|----------------|
| `availableSignals` snapshot at fetch time | Prove capability vs query mismatch |
| Vehicle-specific null vs not-listed | Distinguish waste classes |
| Native event count per trip window | Correlate with HF-only paths |
| Segment mechanism results | Close UNKNOWN column |
| Alias resolution (`TPS` vs `obdThrottlePosition`) | Parser audit trail |

Recorder should prioritize vehicles with **divergent event profiles** (A4 vs Arteon) and **Q001 waste** measurement before/after dynamic profiles.

---

## Machine-Readable Appendix

**Columns:** `canonicalSignal`, `dimoSignal`, `family`, `currentQueryIds`, `Tiguan`, `C63`, `A4`, `Arteon`, `queriedToday`, `persistedToday`, `consumedToday`, `potentialDriver`, `potentialVehicleLoad`, `potentialBrake`, `potentialTire`, `evidence`

```csv
canonicalSignal,dimoSignal,family,currentQueryIds,Tiguan,C63,A4,Arteon,queriedToday,persistedToday,consumedToday,potentialDriver,potentialVehicleLoad,potentialBrake,potentialTire,evidence
speedKmh,speed,kinematics,Q001;Q006;Q007;Q009,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,yes,HIGH,HIGH,MODERATE,none,CONFIRMED_FROM_VEHICLE_INVENTORY
isIgnitionOn,isIgnitionOn,powertrain,Q001;Q006;Q009,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,yes,MODERATE,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
odometerKm,powertrainTransmissionTravelledDistance,kinematics,Q001;Q006,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,low,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
fuelLevelPct,powertrainFuelSystemRelativeLevel,fuel,Q001;Q013;Q014,LISTED_AND_WORKING,LISTED_AND_WORKING,NOT_AVAILABLE,LISTED_AND_WORKING,yes,yes,low,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
fuelLevelL,powertrainFuelSystemAbsoluteLevel,fuel,Q001;Q006;Q013;Q014,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,low,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
socPct,powertrainTractionBatteryStateOfChargeCurrent,EV,Q001;Q009,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
tractionBatteryEnergyKwh,powertrainTractionBatteryStateOfChargeCurrentEnergy,EV,Q001;Q006,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
sohPct,powertrainTractionBatteryStateOfHealth,EV,Q001,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
tractionBatteryPowerKw,powertrainTractionBatteryCurrentPower,EV,Q001;Q009;Q025,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,LOW,none,none,none,CONFIRMED_FROM_CODE
hvVoltage,powertrainTractionBatteryCurrentVoltage,EV,Q001,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
tractionBatteryTemperatureC,powertrainTractionBatteryTemperatureAverage,EV,Q001;Q009,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
chargingIsCharging,powertrainTractionBatteryChargingIsCharging,EV,Q001;Q025,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
chargingCableConnected,powertrainTractionBatteryChargingIsChargingCableConnected,EV,Q001;Q025,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
chargingPower,powertrainTractionBatteryChargingPower,EV,Q001;Q025,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
chargingChargeLimit,powertrainTractionBatteryChargingChargeLimit,EV,Q001;Q025,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
chargingAddedEnergy,powertrainTractionBatteryChargingAddedEnergy,EV,Q001;Q025,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
rangeKm,powertrainTractionBatteryRange,EV,Q001,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
grossCapacityKwh,powertrainTractionBatteryGrossCapacity,EV,Q001,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
oilLevelPct,powertrainCombustionEngineEngineOilRelativeLevel,fluids,Q001,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
defLevelPct,powertrainCombustionEngineDieselExhaustFluidLevel,fluids,Q001,NOT_AVAILABLE,NOT_AVAILABLE,LISTED_AND_WORKING,NOT_AVAILABLE,yes,yes,yes,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
engineCoolantTempC,powertrainCombustionEngineECT,thermal,Q001;Q008;Q009,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,MODERATE,MODERATE,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
rpm,powertrainCombustionEngineSpeed,engine,Q008;Q009;Q012,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,MODERATE,HIGH,HIGH,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
throttlePosition,obdThrottlePosition,engine,Q008;Q009,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,yes,HIGH,HIGH,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
engineLoad,obdEngineLoad,engine,Q001;Q008;Q009,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,yes,MODERATE,HIGH,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
engineRuntimeSec,obdRunTime,OBD,Q009,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,derived,MODERATE,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
engineTorqueNm,powertrainCombustionEngineTorque,engine,Q009,NOT_OBSERVED,NOT_OBSERVED,NOT_OBSERVED,NOT_OBSERVED,yes,no,no,LOW,MODERATE,none,none,NOT_OBSERVED_IN_THESE_FOUR
engineTorquePct,powertrainCombustionEngineTorquePercent,engine,Q009,NOT_OBSERVED,NOT_OBSERVED,NOT_OBSERVED,NOT_OBSERVED,yes,no,no,LOW,MODERATE,none,none,NOT_OBSERVED_IN_THESE_FOUR
exteriorAirTempC,exteriorAirTemperature,climate,Q009;Q010,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,MODERATE,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
altitudeM,currentLocationAltitude,position,Q009,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,derived,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
currentGear,powertrainTransmissionCurrentGear,transmission,Q009,NOT_OBSERVED,NOT_OBSERVED,NOT_OBSERVED,NOT_OBSERVED,yes,no,no,MODERATE,MODERATE,none,none,NOT_OBSERVED_IN_THESE_FOUR
latitude,currentLocationCoordinates,position,Q001;Q007,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,yes,MODERATE,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
lvBatteryVoltage,lowVoltageBatteryCurrentVoltage,electrical,Q001;Q012,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,yes,yes,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
tirePressureFl,chassisAxleRow1WheelLeftTirePressure,tire,Q001;Q011,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
tirePressureFr,chassisAxleRow1WheelRightTirePressure,tire,Q001;Q011,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
tirePressureRl,chassisAxleRow2WheelLeftTirePressure,tire,Q001;Q011,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
tirePressureRr,chassisAxleRow2WheelRightTirePressure,tire,Q001;Q011,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
tireWarning,chassisTireSystemIsWarningOn,tire,Q001,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
obdPluggedIn,obdIsPluggedIn,connectivity,Q001,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,partial,yes,LOW,none,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
cellularJamming,connectivityCellularIsJammingDetected,connectivity,Q001,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
powertrainClass,powertrainType,meta,Q001,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,yes,raw,low,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
dtcCodes,obdDTCList,health,Q005,NOT_AVAILABLE,NOT_AVAILABLE,LISTED_AND_WORKING,NOT_AVAILABLE,yes,yes,yes,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
headingDeg,currentLocationHeading,position,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,MODERATE,LOW,MODERATE,none,CONFIRMED_FROM_VEHICLE_INVENTORY
barometricPressure,obdBarometricPressure,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
distanceWithMilKm,obdDistanceWithMIL,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
fuelRailPressure,obdFuelRailPressure,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
fuelTypeName,obdFuelTypeName,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
intakeTempC,obdIntakeTemp,thermal,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,MODERATE,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
ltft1,obdLongTermFuelTrim1,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
ltft2,obdLongTermFuelTrim2,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
map,obdMAP,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
maxMaf,obdMaxMAF,OBD,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
oilTempC,obdOilTemperature,thermal,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,MODERATE,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
dtcCount,obdStatusDTCCount,health,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,LOW,LOW,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
throttlePositionTps,powertrainCombustionEngineTPS,engine,none,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,LISTED_AND_WORKING,no,no,no,HIGH,HIGH,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
actualGear,powertrainTransmissionActualGear,transmission,none,LISTED_AND_WORKING,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,no,no,no,MODERATE,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
actualGearRatio,powertrainTransmissionActualGearRatio,transmission,none,LISTED_AND_WORKING,NOT_AVAILABLE,NOT_AVAILABLE,NOT_AVAILABLE,no,no,no,LOW,MODERATE,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
harshBraking,behavior.harshBraking,native_event,Q015,HISTORICAL,HISTORICAL,NOT_30D,HISTORICAL,yes,yes,MODERATE,HIGH,HIGH,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
extremeBraking,behavior.extremeBraking,native_event,Q015,NOT_30D,LISTED_30D,NOT_30D,LISTED_30D,yes,yes,yes,HIGH,HIGH,HIGH,none,CONFIRMED_FROM_VEHICLE_INVENTORY
harshAcceleration,behavior.harshAcceleration,native_event,Q015,HISTORICAL,LISTED_30D,NOT_30D,LISTED_30D,yes,yes,yes,HIGH,HIGH,none,none,CONFIRMED_FROM_VEHICLE_INVENTORY
extremeAcceleration,behavior.extremeAcceleration,native_event,Q015,NOT_30D,NOT_30D,NOT_30D,NOT_30D,yes,no,LOW,HIGH,HIGH,none,none,CONFIRMED_FROM_CODE
harshCornering,behavior.harshCornering,native_event,Q015,HISTORICAL,LISTED_30D,NOT_30D,LISTED_30D,yes,yes,yes,HIGH,MODERATE,MODERATE,none,CONFIRMED_FROM_VEHICLE_INVENTORY
extremeEmergency,behavior.extremeEmergency,native_event,Q015,NOT_30D,NOT_30D,NOT_30D,NOT_30D,yes,no,LOW,HIGH,HIGH,HIGH,none,CONFIRMED_FROM_CODE
extremeEmergencyBraking,behavior.extremeEmergencyBraking,native_event,Q015,NOT_30D,NOT_30D,NOT_30D,NOT_30D,yes,no,LOW,HIGH,HIGH,HIGH,none,CONFIRMED_FROM_CODE
safetyCollision,safety.collision,native_event,Q015;Q016,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,yes,partial,MODERATE,LOW,LOW,HIGH,none,UNKNOWN_REQUIRES_RUNTIME_PROBE
segmentCpd,changePointDetection,segment,Q022,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,yes,partial,LOW,LOW,none,none,UNKNOWN_REQUIRES_RUNTIME_PROBE
segmentIgnition,ignitionDetection,segment,Q022,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,yes,partial,LOW,LOW,none,none,UNKNOWN_REQUIRES_RUNTIME_PROBE
segmentFrequency,frequencyAnalysis,segment,Q022,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,yes,partial,LOW,LOW,none,none,UNKNOWN_REQUIRES_RUNTIME_PROBE
segmentIdling,idling,segment,Q022,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,yes,partial,LOW,LOW,none,none,UNKNOWN_REQUIRES_RUNTIME_PROBE
segmentRefuel,refuel,segment,Q023,UNKNOWN,UNKNOWN,UNKNOWN,UNKNOWN,yes,partial,LOW,LOW,none,none,UNKNOWN_REQUIRES_RUNTIME_PROBE
segmentRecharge,recharge,segment,Q025,NOT_APPLICABLE,NOT_APPLICABLE,NOT_APPLICABLE,NOT_APPLICABLE,yes,no,no,none,none,none,none,CONFIRMED_FROM_CODE
```

---

**Phase 2B exit:** Cross-vehicle capability matrix complete (70 rows). Segment and cadence columns remain **UNKNOWN** until runtime probes. Inventory docs should be merged to `main` under `docs/audits/`.

**Changes / Architektur:** Not updated — documentation-only audit synthesis; no code or architecture implementation change.
