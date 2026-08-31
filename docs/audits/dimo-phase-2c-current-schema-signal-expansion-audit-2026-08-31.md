# DIMO Phase 2C — Current Schema Signal Expansion Audit

**Date:** 2026-08-31  
**Status:** DONE  
**Scope:** CURRENT PROVIDER SCHEMA FORENSICS + SIGNAL/EVENT/SEGMENT SURFACE EXPANSION (documentation only)  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Phase gate:** Phase 2C **DONE** · Phase 2D **NEXT** · Phase 3 Flight Recorder **GATED**

---

## 1. Executive Summary

Phase 2C establishes a three-layer separation:

| Layer | Meaning |
|-------|---------|
| **GLOBAL_PROVIDER_SCHEMA_CAPABILITY** | Current official DIMO Telemetry GraphQL schema (Tier-1 introspection + official docs) |
| **SYNQDRIVE_CURRENT_QUERY_SURFACE** | 41 signal fields SynqDrive selects (Phase 2A) |
| **FOUR_VEHICLE_OBSERVED_CAPABILITY** | 33-signal union (Phase 2B inventories) |

**Headline counts (exact):**

| Metric | Count |
|--------|------:|
| Current DIMO telemetry signal fields (`SignalCollection`, excl. metadata) | **117** |
| SynqDrive currently queries | **41** |
| Schema signals not queried by SynqDrive | **76** |
| Observed on four audit vehicles | **33** |
| Current schema signals not observed on any of four | **84** |
| SynqDrive-referenced fields missing from current schema | **0** |
| Vehicle-observed alias fields not queried | **15** |
| Current official segment mechanisms | **6** |
| SynqDrive-filtered native event names | **8** |
| High-value Phase 2D technical candidates | **24** |
| New runtime probes (RP-32–RP-39) | **8** |

**Authority quality:** **HIGH** — read-only GraphQL introspection at `https://telemetry-api.dimo.zone/query` on 2026-08-31 succeeded without vehicle-data mutation.

**Physics ceiling (global schema vs four vehicles):**

| Domain | Global schema ceiling | Four-vehicle ceiling |
|--------|----------------------|----------------------|
| Driver Quality | **MODERATE** | **LOW–MODERATE** |
| Vehicle Load | **MODERATE** | **MODERATE** |
| Brake Physics | **MODERATE** | **LOW** |
| Tire Physics | **MODERATE** | **LOW** |

**Top findings:** (1) **117** schema fields vs **41** queried — large expansion surface; (2) **no** longitudinal/lateral acceleration or steering-angle fields in current schema; (3) **six** brake + **yaw/wheel-speed** fields in schema, **zero** on four vehicles; (4) **CurrentGear vs ActualGear** alias gap confirmed in schema; (5) SDK **1.6.0** vs npm **1.7.0** — no embedded schema types in either version.

---

## 2. Scope & Evidence

Documentation-only audit. No production changes, no vehicle runtime probes, no SDK upgrade.

**Evidence tags:** `CONFIRMED_FROM_CURRENT_DIMO_SCHEMA`, `CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS`, `CONFIRMED_FROM_CURRENT_DIMO_SDK`, `CONFIRMED_FROM_SYNQDRIVE_CODE`, `CONFIRMED_FROM_PHASE2B_VEHICLE_EVIDENCE`, `HISTORICAL_EVIDENCE`, `INFERENCE`, `UNKNOWN_CURRENT_PROVIDER_SUPPORT`.

**Canonical inputs:** Master plan, Phase 2A/2B/Phase 1 audits, four vehicle inventories on `main`, July capability doc (**HISTORICAL_EVIDENCE only**).

---

## 3. Current DIMO Provider Baseline

| Field | Value |
|-------|-------|
| Telemetry endpoint | `https://telemetry-api.dimo.zone/query` |
| Schema discovery | Read-only GraphQL introspection (2026-08-31) |
| SynqDrive SDK | `@dimo-network/data-sdk` **1.6.0** (locked) |
| Latest npm SDK | **1.7.0** (2026-04-08) — dev-env removal only |
| Embedded SDK schema types | **None** |
| Deprecated telemetry fields | **0** |

---

## 4. Schema/SDK Sources

| Source | URL | Retrieved | Role |
|--------|-----|-----------|------|
| Telemetry introspection | https://telemetry-api.dimo.zone/query | 2026-08-31 | Tier 1 primary |
| Vehicle Signals docs | https://www.dimo.org/docs/api-references/telemetry-api/signals | 2026-08-31 | Tier 2 |
| Vehicle Events docs | https://www.dimo.org/docs/api-references/telemetry-api/events | 2026-08-31 | Tier 2 |
| Vehicle Segments docs | https://www.dimo.org/docs/api-references/telemetry-api/segments | 2026-08-31 | Tier 2 |
| Telemetry API intro | https://dimo.org/docs/api-references/telemetry-api/introduction | 2026-08-31 | Tier 2 |
| data-sdk npm / GitHub v1.7.0 | https://www.npmjs.com/package/@dimo-network/data-sdk | 2026-08-31 | Tier 2 SDK lag |
| SynqDrive query builders | `backend/src/modules/dimo/queries/` | 2026-08-31 | Tier 3 |
| July audit | `docs/audits/dimo-driving-signals-capability.md` | 2026-07-16 | HISTORICAL only |

---

## 5. GraphQL Query Surface

Query roots: `signals`, `signalsLatest`, `availableSignals`, `signalsSnapshot`, `dataSummary`, `events`, `segments`, `dailyActivity`, `vinVCLatest`, `attestations`.

`SignalCollection`: **117** telemetry fields + metadata (`lastSeen`, `availableSignals` on `signalsLatest` only).

`FloatAggregation`: AVG, MED, MAX, MIN, RAND, FIRST, LAST. `DetectionMechanism`: 6 values (matches Phase 2A).

---

## 6. Current Global Signal Catalog

See **§31 appendix** (117 rows). Families include OBD (28), cabin (15), EV/HV (15), ICE (12), transmission (9), chassis brake (6), tire (4), wheel speed (2), yaw (1), axle weight (3), etc.

---

## 7. SynqDrive vs Current Schema

| Set | Count | Description |
|-----|------:|-------------|
| SET 1 — schema ∩ SynqDrive queried | 41 | All Phase 2A fields exist in schema |
| SET 2 — schema not queried | **76** | Expansion opportunity |
| SET 3 — schema not on four vehicles | **84** | Global vs vehicle gap |
| SET 4 — vehicle alias not queried | **15** | See list below |
| SET 5 — SynqDrive refs missing in schema | **0** | No stale field references |

SET 4 fields:
- `currentLocationHeading`
- `obdBarometricPressure`
- `obdDistanceWithMIL`
- `obdFuelRailPressure`
- `obdFuelTypeName`
- `obdIntakeTemp`
- `obdLongTermFuelTrim1`
- `obdLongTermFuelTrim2`
- `obdMAP`
- `obdMaxMAF`
- `obdOilTemperature`
- `obdStatusDTCCount`
- `powertrainCombustionEngineTPS`
- `powertrainTransmissionActualGear`
- `powertrainTransmissionActualGearRatio`

---

## 8. Four-Vehicle Reality vs Current Schema

Queried + observed: **26**. Queried + not observed on four: **15**. Observed + not queried: **15**. Schema existence ≠ vehicle delivery; absence on four ≠ global unsupported.

---

## 9. Newly Present / Newly Discovered vs July

**94** schema fields not in July historical ICE subset. Label: **NEWLY_PRESENT_IN_CURRENT_SCHEMA_VS_JULY_AUDIT** — not "DIMO newly introduced" without release date.

Representative additions vs July: brake cluster, yaw, wheel speeds, axle weights, cabin/body/service signals, expanded OBD PIDs, `powertrainTransmissionActualGear`.

---

## 10. Longitudinal Dynamics

No dedicated longitudinal acceleration/deceleration fields in schema. Proxies: `speed`, signed `powertrainTractionBatteryCurrentPower`, torque, native braking events.

---

## 11. Lateral Dynamics

No `lateralAcceleration`. **`angularVelocityYaw`** exists (not queried, not on four). `behavior.harshCornering` event exists.

---

## 12. Steering / Wheel Dynamics

`chassisAxleRow1WheelLeftSpeed`, `chassisAxleRow1WheelRightSpeed` in schema (front pair only). No steering-angle or wheel-slip fields.

---

## 13. Driver Inputs

Both **`obdThrottlePosition`** and **`powertrainCombustionEngineTPS`** active. Both **`powertrainTransmissionCurrentGear`** and **`powertrainTransmissionActualGear`** (+ ratio) active with distinct semantics — SynqDrive queries CurrentGear only (**ALIAS_GAP**).

---

## 14. Brake System

Six schema fields: pedal pressed, pedal position, circuit pressures ×2, ABS warning, parking brake. None observed on four ICE inventories. Native `behavior.*` braking events partial.

---

## 15. Stability Systems

ABS **warning** signal only. No ESC/ESP/traction-control state signals in schema.

---

## 16. ICE Powertrain

Full ICE cluster in schema; SynqDrive uses RPM/load/throttle/torque subset. Many OBD/engine fields available but not queried.

---

## 17. EV / Hybrid / Regen

15 HV/charging fields. Regen: **indirect** via negative `powertrainTractionBatteryCurrentPower`; no dedicated regen signal. Segment `recharge` mechanism confirmed.

---

## 18. Thermal

ECT, EOT, oil/intake temps, transmission temp, HV battery temp, exterior air — mostly unqueried beyond ECT/exterior.

---

## 19. Tire / Chassis

Four tire-pressure fields + warning in schema (DIRECT_TIRE). No tire temperature. Wheel speeds = DYNAMIC_TIRE_PROXY. Axle weights = CONTEXT_SIGNAL.

---

## 20. Vehicle Mass / Load

`chassisAxleRow3/4/5Weight` in schema (kg). No curb/GVW/payload telemetry fields. `obdEngineLoad` indirect proxy already used.

---

## 21. Environment / Context

GPS, altitude, heading, exterior temp native. No road grade, weather, speed-limit, or road-class signals in telemetry schema.

---

## 22. Current Event Catalog

R1 LTE documented tags: `behavior.harshAcceleration`, `behavior.harshBraking`, `behavior.harshCornering`, `safety.collision` (+ ExtremeBraking in glossary). SynqDrive Q015 filters **8** names. See §32 appendix.

---

## 23. Event Payload Capabilities

Confirmed Event fields: `timestamp`, `name`, `source`, `durationNs`, `metadata` (opaque String). No guaranteed speed/accel/location in schema — **UNKNOWN** without runtime samples.

---

## 24. Current Segment Catalog

Six mechanisms confirmed in schema enum. See §33 appendix. Vehicle yield on four remains UNKNOWN (Phase 2B).

---

## 25. availableSignals Semantics

Official docs: names with **stored data** for tokenId. Stale-listing/TTL behavior **UNKNOWN**. Not equivalent to full 117-field schema catalog.

---

## 26. Latest vs Historical Queryability

Float/location fields: `signalsLatest` + `signals` with aggregations. String fields may be latest-oriented. Events/segments separate surfaces.

---

## 27. Aggregations / Interval Semantics

FloatAggregation enum confirmed. Interval on `signals` uses duration strings — **REQUESTED_BUCKET ≠ PROVIDER_SAMPLE_RATE**.

---

## 28. Deprecations / Renames / Schema Drift

| Old/current field | Current status | Replacement / parallel | SynqDrive uses | Migration risk |
|---|---|---|---|---|
| `powertrainTransmissionCurrentGear` | ACTIVE | `powertrainTransmissionActualGear` | Q009 CurrentGear | ALIAS_GAP |
| `obdThrottlePosition` | ACTIVE | `powertrainCombustionEngineTPS` | HF OBD throttle | ALIAS_OR_RENAMED |
| `powertrainCombustionEngineEngineOilLevel` | ACTIVE | `…EngineOilRelativeLevel` | Q001 RelativeLevel | PARALLEL_SEMANTICS |
| Segment example `HarshBraking` | DOC_EXAMPLE | `behavior.harshBraking` | Q015 dotted names | INFERENCE |

Deprecated telemetry fields: **0**.

---

## 29. SDK Lag Analysis

1.6.0 → 1.7.0: no schema/type changes documented. Introspection + official docs remain authoritative over SDK for catalog purposes.

---

## 30. Gold Signals Matrix

| Signal | Exists current DIMO schema? | SynqDrive currently queries? | Four vehicles observed? | Latest | Historical | Event | Required for |
|---|---|---|---|---|---|---|---|
| Longitudinal acceleration | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Driver quality, brake physics |
| Lateral acceleration | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Cornering, tire load |
| Yaw rate | YES_CONFIRMED | no | no | BOTH | BOTH | no | Cornering validation |
| Steering angle | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Lateral dynamics |
| Wheel speeds (FL/FR) | YES_CONFIRMED | no | no | BOTH | BOTH | no | Slip proxy |
| Wheel slip | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Traction |
| Brake pedal pressed | YES_CONFIRMED | no | no | BOTH | BOTH | no | Brake load direct |
| Brake pressure (circuit 1) | YES_CONFIRMED | no | no | BOTH | BOTH | no | Brake load direct |
| ABS warning | YES_CONFIRMED | no | no | BOTH | BOTH | no | Stability context |
| ESC / ESP | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Stability |
| Traction control | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Stability |
| Accelerator / throttle | ALIAS_OR_RENAMED | partial | partial | BOTH | BOTH | no | Driver input |
| Engine RPM | YES_CONFIRMED | partial | yes | BOTH | BOTH | no | Load proxy |
| Engine torque | YES_CONFIRMED | partial | no | BOTH | BOTH | no | Load |
| Requested torque | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Load |
| Current gear | YES_CONFIRMED | partial | no | BOTH | BOTH | no | Context |
| Actual gear | YES_CONFIRMED | no | partial | BOTH | BOTH | no | ALIAS_GAP Tiguan |
| Transmission temperature | YES_CONFIRMED | no | no | BOTH | BOTH | no | Thermal/load |
| Battery power (HV) | YES_CONFIRMED | partial | no | BOTH | BOTH | no | EV/regen indirect |
| Battery current (AC charge) | YES_CONFIRMED | no | no | BOTH | BOTH | no | EV charging |
| Battery voltage (HV) | YES_CONFIRMED | partial | no | BOTH | BOTH | no | EV context |
| Regen (via HV power sign) | YES_CONFIRMED | partial | no | BOTH | BOTH | no | Indirect regen |
| Tire pressure (per wheel) | YES_CONFIRMED | partial | no | BOTH | BOTH | no | Direct tire |
| Tire temperature | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Tire thermal |
| Vehicle mass / axle load | YES_CONFIRMED | no | no | BOTH | BOTH | no | Load context |

---

## 31. Schema vs Vehicle Reality Matrix (key fields)

| Signal | Current DIMO schema | SynqDrive | Tiguan | C63 | A4 | Arteon | Interpretation |
|---|---|---|---|---|---|---|---|
| `angularVelocityYaw` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `chassisAxleRow1WheelLeftSpeed` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `chassisBrakeIsPedalPressed` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `chassisBrakePedalPosition` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `powertrainTransmissionCurrentGear` | yes | yes | no | no | no | no | SCHEMA_EXISTS_BUT_UNUSED_ON_FOUR |
| `powertrainTransmissionActualGear` | yes | no | yes | no | no | no | VEHICLE_ALIAS_GAP |
| `obdThrottlePosition` | yes | yes | yes | yes | yes | yes | SCHEMA_EXISTS_AND_USED |
| `powertrainCombustionEngineTPS` | yes | no | yes | yes | yes | yes | VEHICLE_ALIAS_GAP |
| `chassisAxleRow1WheelLeftTirePressure` | yes | yes | no | no | no | no | SCHEMA_EXISTS_BUT_UNUSED_ON_FOUR |
| `powertrainTractionBatteryCurrentPower` | yes | yes | no | no | no | no | SCHEMA_EXISTS_BUT_UNUSED_ON_FOUR |
| `chassisAxleRow3Weight` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |

---

## 32. High-Value Phase-2D Candidates

**24** technical candidates (schema exists, SynqDrive not queried): yaw, wheel speeds, brake cluster, tire pressures, TPS/torque/gears, axle weights, heading/OBD context signals, native events context. **No value scores** — Phase 2D scope.

---

## 33. Physics Ceiling Verdict

| Domain | GLOBAL_SCHEMA_CEILING | CURRENT_FOUR_VEHICLE_CEILING |
|--------|----------------------|-------------------------------|
| Driver Quality | MODERATE | LOW–MODERATE |
| Vehicle Load | MODERATE | MODERATE |
| Brake Physics | MODERATE | LOW |
| Tire Physics | MODERATE | LOW |

---

## 34. Runtime Probe Additions

| ID | Objective | Priority |
|---|---|---|
| RP-32 | Confirm `angularVelocityYaw` delivery on compatible OEM/provider | P1 |
| RP-33 | Confirm wheel speed pair on OEM paths | P1 |
| RP-34 | Brake pedal/pressure fields — null vs permission vs not-listed | P1 |
| RP-35 | `powertrainTransmissionCurrentGear` vs `ActualGear` alias probe | P1 |
| RP-36 | Tire pressure schema fields — vehicle delivery vs NO_DIMO inventory | P2 |
| RP-37 | Axle weight signals applicability to passenger fleet | P2 |
| RP-38 | Regen via signed HV power on EV/HV vehicle | P2 |
| RP-39 | Event payload `metadata` JSON schema for behavior.* | P2 |

Phase 2B probes RP-21, RP-25, RP-26, RP-29, RP-31 remain open.

---

## 35. Findings

| ID | Type | Summary |
|----|------|---------|
| F2C-01 | CURRENT_SCHEMA_FACT | 117 telemetry fields in live schema |
| F2C-02 | SCHEMA_EXPANSION_OPPORTUNITY | 76 fields not queried |
| F2C-03 | GLOBAL_VS_VEHICLE_CAPABILITY_GAP | 84 schema fields absent from four-vehicle union |
| F2C-04 | ALIAS_GAP | CurrentGear/ActualGear; TPS/obdThrottlePosition |
| F2C-05 | DRIVING_DYNAMICS_OPPORTUNITY | Yaw + wheel speeds in schema; long/lat accel absent |
| F2C-06 | BRAKE_OBSERVABILITY_GAP | Six brake schema fields; zero four-vehicle observation |
| F2C-07 | TIRE_OBSERVABILITY_GAP | TPMS schema fields; zero four-vehicle observation |
| F2C-08 | EVENT_SURFACE_EXPANSION | Generic events API; R1 behavior subset documented |
| F2C-09 | SEGMENT_SURFACE_EXPANSION | Six mechanisms confirmed |
| F2C-10 | SDK_LAG | 1.6.0 vs 1.7.0 — no schema impact |
| F2C-11 | SCHEMA_DRIFT | Zero deprecated fields |
| F2C-12 | UNKNOWN_REQUIRES_RUNTIME_PROBE | Event metadata, availableSignals staleness |

---

## 36. Phase-2D Handoff

Phase 2D scores **24** candidates + events/segments on value, cadence, redundancy, coverage, cost. Inputs: appendices below, Gold Signals §30, SET diffs §7–8, RP-32–39 §34.

---

## Appendix A — Global Signal Catalog

| dimoField | family | type | unit | latest | historical | aggregation | deprecated | queriedBySynqDrive | observedPhase2B | evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| angularVelocityYaw | motion | SignalFloat | degrees/s | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| bodyLightsIsAirbagWarningOn | body | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| bodyLockIsLocked | body | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| bodyTrunkFrontIsOpen | body | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| bodyTrunkRearIsOpen | body | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow1DriverSideIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow1DriverSideWindowIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow1PassengerSideIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow1PassengerSideWindowIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow2DriverSideIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow2DriverSideWindowIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow2PassengerSideIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinDoorRow2PassengerSideWindowIsOpen | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinSeatRow1DriverSideIsBelted | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinSeatRow1PassengerSideIsBelted | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinSeatRow2DriverSideIsBelted | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinSeatRow2MiddleIsBelted | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinSeatRow2PassengerSideIsBelted | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinSeatRow3DriverSideIsBelted | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| cabinSeatRow3PassengerSideIsBelted | cabin | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow1WheelLeftSpeed | wheel | SignalFloat | km/h | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow1WheelLeftTirePressure | tire | SignalFloat | kPa | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow1WheelRightSpeed | wheel | SignalFloat | km/h | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow1WheelRightTirePressure | tire | SignalFloat | kPa | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow2WheelLeftTirePressure | tire | SignalFloat | kPa | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow2WheelRightTirePressure | tire | SignalFloat | kPa | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow3Weight | mass_load | SignalFloat | kg | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow4Weight | mass_load | SignalFloat | kg | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisAxleRow5Weight | mass_load | SignalFloat | kg | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisBrakeABSIsWarningOn | chassis_brake | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisBrakeCircuit1PressurePrimary | chassis_brake | SignalFloat | kPa | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisBrakeCircuit2PressurePrimary | chassis_brake | SignalFloat | kPa | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisBrakeIsPedalPressed | chassis_brake | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisBrakePedalPosition | chassis_brake | SignalFloat | percent | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisParkingBrakeIsEngaged | chassis_brake | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| chassisTireSystemIsWarningOn | tire | SignalFloat |  | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| connectivityCellularIsJammingDetected | connectivity | SignalFloat |  | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| currentLocationAltitude | position | SignalFloat | m | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| currentLocationApproximateCoordinates | position | SignalLocation |  | YES | YES | SignalLocation | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| currentLocationCoordinates | position | SignalLocation |  | YES | YES | SignalLocation | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| currentLocationHeading | position | SignalFloat | degrees | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| exteriorAirTemperature | environment | SignalFloat | celsius | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| isIgnitionOn | powertrain_meta | SignalFloat |  | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| lowVoltageBatteryCurrentVoltage | electrical | SignalFloat | V | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdBarometricPressure | obd | SignalFloat | kPa | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdCommandedEGR | obd | SignalFloat | percent | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdCommandedEVAP | obd | SignalFloat | percent | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdDTCList | obd | SignalString |  | YES | LATEST_ONLY | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdDistanceSinceDTCClear | obd | SignalFloat | km | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdDistanceWithMIL | obd | SignalFloat | km | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdEngineLoad | obd | SignalFloat | percent | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdEthanolPercent | obd | SignalFloat | percent | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdFuelPressure | obd | SignalFloat | kPa | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdFuelRailPressure | obd | SignalFloat | kPa | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdFuelRate | obd | SignalFloat | l/h | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdFuelTypeName | obd | SignalString |  | YES | LATEST_ONLY | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdIntakeTemp | obd | SignalFloat | celsius | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdIsEngineBlocked | obd | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdIsPTOActive | obd | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdIsPluggedIn | obd | SignalFloat |  | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdLongTermFuelTrim1 | obd | SignalFloat | percent | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdLongTermFuelTrim2 | obd | SignalFloat | percent | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdMAP | obd | SignalFloat | kPa | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdMaxMAF | obd | SignalFloat | g/s | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdO2WRSensor1Voltage | obd | SignalFloat | V | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdO2WRSensor2Voltage | obd | SignalFloat | V | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdOilTemperature | obd | SignalFloat | celsius | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdRunTime | obd | SignalFloat | s | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdShortTermFuelTrim1 | obd | SignalFloat | percent | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdStatusDTCCount | obd | SignalFloat |  | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdThrottlePosition | obd | SignalFloat | percent | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| obdWarmupsSinceDTCClear | obd | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineDieselExhaustFluidCapacity | ice | SignalFloat | l | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineDieselExhaustFluidLevel | ice | SignalFloat | percent | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineECT | ice | SignalFloat | celsius | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineEOP | ice | SignalFloat | kPa | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineEOT | ice | SignalFloat | celsius | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineEngineOilLevel | ice | SignalString |  | YES | LATEST_ONLY | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineEngineOilRelativeLevel | ice | SignalFloat | percent | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineMAF | ice | SignalFloat | g/s | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineSpeed | ice | SignalFloat | rpm | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineTPS | ice | SignalFloat | percent | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineTorque | ice | SignalFloat | Nm | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainCombustionEngineTorquePercent | ice | SignalFloat | percent | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainFuelSystemAbsoluteLevel | fuel | SignalFloat | l | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainFuelSystemAccumulatedConsumption | fuel | SignalFloat | l | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainFuelSystemRelativeLevel | fuel | SignalFloat | percent | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainFuelSystemSupportedFuelTypes | fuel | SignalString |  | YES | LATEST_ONLY | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainRange | powertrain_meta | SignalFloat | km | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryChargingAddedEnergy | ev_hv | SignalFloat | kWh | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryChargingChargeCurrentAC | ev_hv | SignalFloat | A | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryChargingChargeLimit | ev_hv | SignalFloat | percent | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryChargingChargeVoltageUnknownType | ev_hv | SignalFloat | V | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryChargingIsCharging | ev_hv | SignalFloat |  | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryChargingIsChargingCableConnected | ev_hv | SignalFloat |  | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryChargingPower | ev_hv | SignalFloat | kW | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryCurrentPower | ev_hv | SignalFloat | W | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryCurrentVoltage | ev_hv | SignalFloat | V | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryGrossCapacity | ev_hv | SignalFloat | kWh | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryRange | ev_hv | SignalFloat | km | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryStateOfChargeCurrent | ev_hv | SignalFloat | percent | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryStateOfChargeCurrentEnergy | ev_hv | SignalFloat | kWh | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryStateOfHealth | ev_hv | SignalFloat | percent | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTractionBatteryTemperatureAverage | ev_hv | SignalFloat | celsius | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionActualGear | transmission | SignalFloat |  | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionActualGearRatio | transmission | SignalFloat |  | YES | YES | NONE | no | no | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionCurrentGear | transmission | SignalFloat |  | YES | YES | NONE | no | yes | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionIsClutchSwitchOperated | transmission | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionRetarderActualTorque | transmission | SignalFloat | percent | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionRetarderTorqueMode | transmission | SignalString |  | YES | LATEST_ONLY | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionSelectedGear | transmission | SignalFloat |  | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionTemperature | transmission | SignalFloat | celsius | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainTransmissionTravelledDistance | transmission | SignalFloat | km | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| powertrainType | powertrain_meta | SignalString |  | YES | LATEST_ONLY | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| serviceDistanceToService | service | SignalFloat | km | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| serviceTimeToService | service | SignalFloat | s | YES | YES | NONE | no | no | no | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| speed | kinematics | SignalFloat | km/h | YES | YES | NONE | no | yes | yes | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |

---

## Appendix B — Event Catalog

| eventName | family | currentOfficial | queriedBySynqDrive | observedPhase2B | payloadFields | evidence |
|---|---|---|---|---|---|---|
| behavior.harshBraking | behavior | yes | Arteon historical | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| behavior.extremeBraking | behavior | yes | C63/Arteon 30d | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| behavior.harshAcceleration | behavior | yes | Tiguan/C63/Arteon | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| behavior.extremeAcceleration | behavior | partial | none 30d four | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_SYNQDRIVE_CODE |
| behavior.harshCornering | behavior | yes | Tiguan/C63/Arteon | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| behavior.extremeEmergency | behavior | partial | none 30d four | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_SYNQDRIVE_CODE |
| behavior.extremeEmergencyBraking | behavior | partial | none 30d four | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_SYNQDRIVE_CODE |
| safety.collision | safety | yes | UNKNOWN four | timestamp,name,source,durationNs,metadata | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |

---

## Appendix C — Segment Catalog

| mechanism | currentOfficial | inputs | outputs | SynqDriveQuery | vehicleEvidence | evidence |
|---|---|---|---|---|---|---|
| changePointDetection | yes | signalRequests, eventRequests | start/end, duration, aggregates | Q022 | UNKNOWN four | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| ignitionDetection | yes | isIgnitionOn transitions | start/end, duration, aggregates | Q022 | UNKNOWN four | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| frequencyAnalysis | yes | signal frequency windows | start/end, duration, aggregates | Q022 | UNKNOWN four | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| idling | yes | RPM idle range | start/end, duration, aggregates | Q022 | UNKNOWN four | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| refuel | yes | fuel level rise | start/end, duration, aggregates | Q023 | UNKNOWN four | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |
| recharge | yes | charging + SOC | start/end, duration, aggregates | Q025 | UNKNOWN four | CONFIRMED_FROM_CURRENT_DIMO_SCHEMA |

---

## Appendix D — Difference Counts (exact)

| Count | Value |
|-------|------:|
| Total current DIMO telemetry signal fields | **117** |
| Currently queried by SynqDrive | **41** |
| Schema signals not queried | **76** |
| Observed in four vehicles | **33** |
| Schema signals not on any of four | **84** |
| Vehicle-observed aliases not queried | **15** |
| SynqDrive refs missing/deprecated in schema | **0** |
| Driving-dynamics-related schema fields | **20** |
| Brake-related schema fields | **6** |
| Tire/chassis pressure+warning fields | **5** |
| EV/HV/regen-related schema fields | **15** |
| SynqDrive-tracked native event filter names | **8** |
| Current official segment mechanisms | **6** |
| High-value Phase-2D candidates | **24** |
| New runtime probes RP-32–RP-39 | **8** |
| Newly present vs July historical subset | **94** |

---

**Phase 2C status: DONE** · **Phase 2D: NEXT** · **Phase 3: GATED**
