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
| Vehicle-observed not in Phase-2A driving acquisition (SET 4) | **15** |
| Current official segment mechanisms | **6** |
| SynqDrive Q015 filter names (not exhaustive event catalog) | **8** |
| Current global event name count | **UNKNOWN_OPEN_ENDED** |
| High-value Phase 2D technical candidates | **20** unique main-track signals |
| New runtime probes (RP-32–RP-39) | **8** |

**Authority quality:** **HIGH** — read-only GraphQL introspection at `https://telemetry-api.dimo.zone/query` on 2026-08-31 succeeded without vehicle-data mutation.

**Schema ceiling — four driving-intelligence output domains (global schema vs four vehicles):**

| Output domain | Global schema ceiling | Four-vehicle ceiling |
|--------|----------------------|----------------------|
| **Driver Quality** | **MODERATE** | **LOW–MODERATE** |
| **Vehicle Load** | **MODERATE** | **MODERATE** |
| **Brake Physics / Brake Load** | **MODERATE** | **LOW** |
| **Tire Dynamic Load** | **MODERATE** | **LOW** |

**Orthogonal (not an output-domain score):** **Data Confidence / Assessability** — limits precision, coverage, and claim strength; does not substitute for or invert any output domain. **LOW CONFIDENCE ≠ bad driving** · **LOW CONFIDENCE ≠ low/high vehicle load**.

**Top findings:** (1) **117** schema fields vs **41** queried — large expansion surface; (2) **no** longitudinal/lateral acceleration or steering-angle fields in current schema; (3) brake hydraulics + yaw + **front wheel-speed pair only** in schema, **zero** on four vehicles; (4) **parallel gear fields** (`CurrentGear` / `ActualGear` / `SelectedGear`) coexist — semantic equivalence **not proven** (RP-35); (5) **REGEN_CANDIDATE** = **positive** `powertrainTractionBatteryCurrentPower` during synchronized deceleration — **not** negative power; (6) event name surface is **open-ended** — Q015’s 8 filters ≠ exhaustive official catalog.

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
| SET 4 — `VEHICLE_OBSERVED_NOT_IN_PHASE2A_DRIVING_ACQUISITION` | **15** | Observed on ≥1 audit vehicle; not in Phase 2A query surface |
| SET 5 — SynqDrive refs missing in schema | **0** | No stale field references |

**SET 4 — full list (15):**

| Field | Subclass |
|-------|----------|
| `currentLocationHeading` | CONTEXT_SIGNAL |
| `obdBarometricPressure` | CONTEXT_SIGNAL |
| `obdDistanceWithMIL` | HEALTH_SIGNAL |
| `obdFuelRailPressure` | ADDITIONAL_SIGNAL |
| `obdFuelTypeName` | ADDITIONAL_SIGNAL |
| `obdIntakeTemp` | CONTEXT_SIGNAL |
| `obdLongTermFuelTrim1` | ADDITIONAL_SIGNAL |
| `obdLongTermFuelTrim2` | ADDITIONAL_SIGNAL |
| `obdMAP` | ADDITIONAL_SIGNAL |
| `obdMaxMAF` | ADDITIONAL_SIGNAL |
| `obdOilTemperature` | CONTEXT_SIGNAL |
| `obdStatusDTCCount` | HEALTH_SIGNAL |
| `powertrainCombustionEngineTPS` | PARALLEL_SEMANTIC_CANDIDATE (vs `obdThrottlePosition`) |
| `powertrainTransmissionActualGear` | PARALLEL_GEAR_FIELD_GAP (vs `powertrainTransmissionCurrentGear`) |
| `powertrainTransmissionActualGearRatio` | PARALLEL_GEAR_FIELD_GAP (companion to ActualGear) |

**Not SET 4 alias blanket:** 12/15 are additional/context/health signals — not naming aliases.

---

## 8. Four-Vehicle Reality vs Current Schema

Queried + observed: **26**. Queried + not observed on four: **15**. Observed + not queried: **15**. Schema existence ≠ vehicle delivery; absence on four ≠ global unsupported.

---

## 9. Newly Present / Newly Discovered vs July

**94** schema fields not in July historical ICE subset. Label: **NEWLY_PRESENT_IN_CURRENT_SCHEMA_VS_JULY_AUDIT** — not "DIMO newly introduced" without release date.

Representative additions vs July: brake cluster, yaw, wheel speeds, axle weights, cabin/body/service signals, expanded OBD PIDs, `powertrainTransmissionActualGear`.

---

## 10. Longitudinal Dynamics

No dedicated longitudinal acceleration/deceleration fields in schema.

**Proxies (none are direct long-accel):** `speed`, native braking events, engine torque context.

**REGEN_CANDIDATE (EV/HV only):** `powertrainTractionBatteryCurrentPower` per official DIMO semantics — **positive** = energy flowing **into** battery; **negative** = energy flowing **out** (e.g. during driving). A **positive** spike during synchronized vehicle deceleration/braking context *may* indicate recuperation, but battery power alone does **not** prove friction-vs-regen allocation. Later validation must synchronize at minimum: speed/deceleration, brake pedal/pressure when available, traction battery power, vehicle/powertrain state — and account for parasitic/other battery flows. **No exact regen fraction without runtime validation.**

---

## 11. Lateral Dynamics

No `lateralAcceleration`. **`angularVelocityYaw`** exists (not queried, not on four). `behavior.harshCornering` event exists.

---

## 12. Steering / Wheel Dynamics

**FRONT_WHEEL_SPEED_PAIR_ONLY:** schema exposes only:

- `chassisAxleRow1WheelLeftSpeed`
- `chassisAxleRow1WheelRightSpeed`

No rear wheel-speed fields in current catalog. No steering-angle or dedicated wheel-slip fields.

**Potential (limited):** wheel-to-vehicle-speed consistency check, limited slip proxy, front-axle asymmetry.

**Not supported by this pair alone:** full four-wheel slip model, guaranteed driven-axle slip, substitute for longitudinal/lateral acceleration.

---

## 13. Driver Inputs — Gear & Throttle Fields

### Parallel gear fields (schema coexistence ≠ interchangeability)

| Field | Official schema semantics (introspection) | SynqDrive queried? | Four-vehicle observed? |
|-------|----------------------------------------|--------------------|------------------------|
| `powertrainTransmissionCurrentGear` | 0=Neutral, ±N=Forward/Reverse | yes (Q009) | no |
| `powertrainTransmissionActualGear` | 0=neutral, 1–15=gear number | no | Tiguan only |
| `powertrainTransmissionSelectedGear` | 0=Neutral, ±N gears, **126=Park** | no | no |
| `powertrainTransmissionActualGearRatio` | Actual transmission gear ratio | no | Tiguan only |

**Classification:** **PARALLEL_GEAR_FIELD_GAP** / **SEMANTIC_EQUIVALENCE_REQUIRES_RUNTIME_PROBE (RP-35)** — not confirmed alias. Phase 2D/2E must later pick canonical source, fallback, cross-signal consistency.

### Parallel throttle signals

| Field | Role | Classification |
|-------|------|----------------|
| `obdThrottlePosition` | OBD PID 11 throttle % | SynqDrive HF path — **queried** |
| `powertrainCombustionEngineTPS` | Engine TPS % | Observed on four — **not queried** |

**Classification:** **PARALLEL_THROTTLE_SIGNALS** — may describe overlapping physical range but different source/PID/semantics/cadence. Interchangeability **unknown** until Phase 2E / runtime evidence.

---

## 14. Brake System

Six brake-related schema fields with **distinct physics roles:**

| Field | Class | Phase-2D role |
|-------|-------|---------------|
| `chassisBrakeIsPedalPressed` | **DYNAMIC / HYDRAULIC BRAKE INPUT** | DIRECT_HYDRAULIC_BRAKE_INPUT |
| `chassisBrakePedalPosition` | **DYNAMIC / HYDRAULIC BRAKE INPUT** | DIRECT_HYDRAULIC_BRAKE_INPUT |
| `chassisBrakeCircuit1PressurePrimary` | **DYNAMIC / HYDRAULIC BRAKE INPUT** | DIRECT_HYDRAULIC_BRAKE_INPUT |
| `chassisBrakeCircuit2PressurePrimary` | **DYNAMIC / HYDRAULIC BRAKE INPUT** | DIRECT_HYDRAULIC_BRAKE_INPUT |
| `chassisBrakeABSIsWarningOn` | **DIAGNOSTIC_ONLY** | validation context — **not** ABS intervention |
| `chassisParkingBrakeIsEngaged` | **PARKING_CONTEXT** | not dynamic brake-load input |

None observed on four ICE inventories. Native `behavior.*` braking events partial.

**Important:** brake pressure/pedal = **DIRECT_HYDRAULIC_BRAKE_INPUT** — **not** direct measured friction brake energy, pad wear, disc temperature, or brake torque without later vehicle/system calibration.

---

## 15. Stability Systems

| Capability | In current schema? |
|------------|-------------------|
| ABS **warning telltale** | yes (`chassisBrakeABSIsWarningOn`) — **DIAGNOSTIC_ONLY** |
| **NO_CONFIRMED_ABS_INTERVENTION_SIGNAL** | — |
| **NO_CONFIRMED_ESC_INTERVENTION_SIGNAL** | — |
| **NO_CONFIRMED_TRACTION_CONTROL_INTERVENTION_SIGNAL** | — |
| `safety.collision` event tag | documented — event surface only |

ABS warning ≠ ABS activity/intervention.

---

## 16. ICE Powertrain

Full ICE cluster in schema; SynqDrive uses RPM/load/throttle/torque subset. Many OBD/engine fields available but not queried.

---

## 17. EV / Hybrid / Regen

**15** HV/charging-related schema fields. Separate semantics:

| Signal class | Representative field | Driving/regen relevance |
|--------------|---------------------|-------------------------|
| **TRACTION_BATTERY_POWER** | `powertrainTractionBatteryCurrentPower` | **REGEN_CANDIDATE** — positive during deceleration context; see §10 |
| **TRACTION_BATTERY_VOLTAGE** | `powertrainTractionBatteryCurrentVoltage` | EV context / validation |
| **AC_CHARGING_CURRENT_ONLY** | `powertrainTractionBatteryChargingChargeCurrentAC` | AC inlet RMS current — **not** pack current while driving; **not** brake/regen input |
| Charging session | `powertrainTractionBatteryChargingPower`, `…IsCharging`, etc. | energy events — not driving regen proxy |

No dedicated regen signal field. Segment `recharge` mechanism confirmed for SOC-increase windows.

---

## 18. Thermal

ECT, EOT, oil/intake temps, transmission temp, HV battery temp, exterior air — mostly unqueried beyond ECT/exterior.

---

## 19. Tire / Chassis

| Class | Fields | Notes |
|-------|--------|-------|
| **DIRECT_TIRE_PRESSURE** | `chassisAxleRow1/2 Wheel* TirePressure` ×4 | per-wheel kPa — not equivalent to warning |
| **DIAGNOSTIC_TIRE_CONTEXT** | `chassisTireSystemIsWarningOn` | TPMS warning telltale — validation/context only |
| **No current schema** | tire temperature | — |
| **FRONT_WHEEL_SPEED_PAIR_ONLY** | `chassisAxleRow1WheelLeft/RightSpeed` | limited slip proxy — see §12 |

---

## 20. Vehicle Mass / Load

| Mass/load concept | Current telemetry schema? | Notes |
|-------------------|--------------------------|-------|
| **Generic passenger vehicle mass / curb weight / payload** | **NO_GENERIC_MASS_SIGNAL_CONFIRMED** | Use vehicle specs / VIN metadata / config until runtime evidence |
| **Commercial/heavy axle-row weight** | **YES_CONFIRMED** | `chassisAxleRow3Weight`, `chassisAxleRow4Weight`, `chassisAxleRow5Weight` — official docs: measured load on axle rows (commercial/heavy bias) |
| Engine load proxy | yes | `obdEngineLoad` — already used; not vehicle mass |

**Do not assume** Row3/4/5 weight = usable passenger-car mass/payload. Critical for **Vehicle Load**, **Brake Physics**, **Tire Load** planning.

---

## 21. Environment / Context

GPS, altitude, heading, exterior temp native. No road grade, weather, speed-limit, or road-class signals in telemetry schema.

---

## 22. Current Event Catalog — Open-Ended Surface

Official DIMO `events` API: `name` is a **String** filter; events are **provider/data-connection defined** — **not enum-exhaustive** in schema.

| Layer | Content | Count |
|-------|---------|------:|
| **OFFICIAL_R1_GLOSSARY_NAMES** | ExtremeBraking, HarshAcceleration, HarshBraking, HarshCornering | 4 |
| **OFFICIAL_DOCUMENTED_EVENT_TAGS** | `behavior.harshAcceleration`, `behavior.harshBraking`, `behavior.harshCornering`, `safety.collision` | 4 |
| **SYNQDRIVE_Q015_FILTER_NAMES** | 8 behavior/safety strings in Q015 filter | 8 |
| **PROVIDER_EVENT_NAME_SURFACE** | Open / not enum-exhaustive | **UNKNOWN_OPEN_ENDED** |
| **CURRENT_GLOBAL_EVENT_NAME_COUNT** | — | **UNKNOWN_OPEN_ENDED** |

Q015’s eight filters are **SynqDrive query surface**, not a complete current official DIMO event catalog. See §32 appendix for crosswalk — not exhaustive enumeration.

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
| `powertrainTransmissionCurrentGear` | ACTIVE | parallel `ActualGear` / `SelectedGear` | Q009 CurrentGear | PARALLEL_GEAR_FIELD_GAP |
| `obdThrottlePosition` | ACTIVE | parallel `powertrainCombustionEngineTPS` | HF OBD throttle | PARALLEL_THROTTLE_SIGNALS |
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
| Wheel speeds (FL/FR front pair) | YES_CONFIRMED | no | no | BOTH | BOTH | no | Limited slip proxy — FRONT_WHEEL_SPEED_PAIR_ONLY |
| Wheel slip | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Traction |
| Brake pedal pressed | YES_CONFIRMED | no | no | BOTH | BOTH | no | DIRECT_HYDRAULIC_BRAKE_INPUT |
| Brake pressure (circuit 1) | YES_CONFIRMED | no | no | BOTH | BOTH | no | DIRECT_HYDRAULIC_BRAKE_INPUT — not friction energy |
| ABS warning | YES_CONFIRMED | no | no | BOTH | BOTH | no | DIAGNOSTIC_ONLY — not intervention |
| ESC / ESP intervention | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Stability |
| Traction control intervention | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Stability |
| Accelerator / throttle | PARALLEL_THROTTLE_SIGNALS | partial | partial | BOTH | BOTH | no | `obdThrottlePosition` queried; TPS observed |
| Engine RPM | YES_CONFIRMED | partial | yes | BOTH | BOTH | no | Vehicle load proxy |
| Engine torque | YES_CONFIRMED | partial | no | BOTH | BOTH | no | Vehicle load |
| Requested torque | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Load |
| Current gear | YES_CONFIRMED | partial | no | BOTH | BOTH | no | PARALLEL_GEAR_FIELD_GAP |
| Actual gear | YES_CONFIRMED | no | partial | BOTH | BOTH | no | PARALLEL_GEAR_FIELD_GAP — RP-35 |
| Selected gear | YES_CONFIRMED | no | no | BOTH | BOTH | no | Includes Park=126 semantics |
| Transmission temperature | YES_CONFIRMED | no | no | BOTH | BOTH | no | Vehicle load thermal |
| Traction battery power (HV) | YES_CONFIRMED | partial | no | BOTH | BOTH | no | REGEN_CANDIDATE — positive=in per DIMO |
| AC charging current (inlet) | YES_CONFIRMED | no | no | BOTH | BOTH | no | AC_CHARGING_CURRENT_ONLY — not driving pack current |
| Traction battery voltage (HV) | YES_CONFIRMED | partial | no | BOTH | BOTH | no | EV context |
| Regen recuperation | REGEN_CANDIDATE | partial | no | BOTH | BOTH | no | Positive HV power in decel context — not proven allocation |
| Tire pressure (per wheel) | YES_CONFIRMED | partial | no | BOTH | BOTH | no | DIRECT_TIRE_PRESSURE |
| Tire temperature | NO_NOT_IN_CURRENT_SCHEMA | no | no | N/A | N/A | N/A | Tire thermal |
| Generic passenger vehicle mass | NO_GENERIC_MASS_SIGNAL_CONFIRMED | no | no | N/A | N/A | N/A | Vehicle load / brake / tire |
| Commercial axle-row weight (Row3/4/5) | YES_CONFIRMED | no | no | BOTH | BOTH | no | Commercial/heavy only — not Pkw payload |

---

## 31. Schema vs Vehicle Reality Matrix (key fields)

| Signal | Current DIMO schema | SynqDrive | Tiguan | C63 | A4 | Arteon | Interpretation |
|---|---|---|---|---|---|---|---|
| `angularVelocityYaw` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `chassisAxleRow1WheelLeftSpeed` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `chassisBrakeIsPedalPressed` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `chassisBrakePedalPosition` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |
| `powertrainTransmissionCurrentGear` | yes | yes | no | no | no | no | SCHEMA_EXISTS_BUT_UNUSED_ON_FOUR |
| `powertrainTransmissionActualGear` | yes | no | yes | no | no | no | PARALLEL_GEAR_FIELD_GAP |
| `obdThrottlePosition` | yes | yes | yes | yes | yes | yes | SCHEMA_EXISTS_AND_USED |
| `powertrainCombustionEngineTPS` | yes | no | yes | yes | yes | yes | PARALLEL_THROTTLE_SIGNALS |
| `chassisAxleRow1WheelLeftTirePressure` | yes | yes | no | no | no | no | SCHEMA_EXISTS_BUT_UNUSED_ON_FOUR |
| `powertrainTractionBatteryCurrentPower` | yes | yes | no | no | no | no | SCHEMA_EXISTS_BUT_UNUSED_ON_FOUR |
| `chassisAxleRow3Weight` | yes | no | no | no | no | no | SCHEMA_EXISTS_VEHICLES_NOT_EXPOSING |

---

## 32. High-Value Phase-2D Candidates

**20 UNIQUE_MAIN_TRACK_CANDIDATES** — distinct signal/event fields after physics/taxonomy correction (schema exists, SynqDrive not queried, semantics validated). **No value scores in Phase 2C.**

The table below uses **primary-domain emphasis** for discovery only. Candidates are **not** exclusively owned by one domain. Phase 2D must evaluate **each unique candidate on all dimensions**: Driver Quality value · Vehicle Load value · Brake Physics value · Tire Load value · validation/assessability · cadence requirement · coverage · redundancy · cost.

| Primary emphasis (non-exclusive) | Count | Fields / notes |
|----------|------:|----------------|
| **DRIVER_QUALITY emphasis** | 7 | `angularVelocityYaw`; front wheel speeds ×2; `powertrainCombustionEngineTPS`; `powertrainTransmissionActualGear`; `ActualGearRatio`; `SelectedGear` |
| **VEHICLE_LOAD emphasis** | 4 | `powertrainCombustionEngineTorque`; `TorquePercent`; `MAF`; `powertrainTransmissionTemperature` |
| **BRAKE_LOAD emphasis** | 4 | `chassisBrakeIsPedalPressed`; `PedalPosition`; `Circuit1PressurePrimary`; `Circuit2PressurePrimary` |
| **TIRE_LOAD emphasis** | 4 | four per-wheel tire pressure fields |
| **REGEN emphasis** | 1 | `powertrainTractionBatteryCurrentPower` |
| **CONTEXT / VALIDATION (secondary track)** | 7 | heading, intake/oil/barometric temp, DTC count, MIL distance, tire warning — assessability/provenance inputs |
| **COMMERCIAL_ONLY (RP-37)** | 3 | `chassisAxleRow3/4/5Weight` — excluded from main **20** |

**Multi-domain value examples (non-exhaustive):**

| Candidate | Also valuable for |
|-----------|-------------------|
| `angularVelocityYaw` | Tire Dynamic Load (cornering dynamics) |
| Brake pedal/pressure fields | Driver Quality (behaviour context) |
| `powertrainTractionBatteryCurrentPower` | Vehicle Load · Brake Physics / regen split |

**Vehicle Load families preserved for Phase 2D:** RPM, engine load (queried), torque, throttle/TPS, gear/shift, transmission temp, coolant/oil temp, battery power, yaw/wheel dynamics, speed exposure, mass/spec context (metadata), stop-go cycling (derived).

---

## 33. Schema Ceiling Verdict — Four Independent Output Domains

**FOUR_INDEPENDENT_ANALYSIS_DOMAINS_RETAINED** — also **FOUR_COEQUAL_OUTPUT_DOMAINS** in the sense of **fachliche Bedeutung / product priority**, **not** numeric weighting. The four domains are **independent first-class outputs**. **No cross-domain weighting or global composite has been defined.**

1. **Driver Quality** — `100 = excellent driving`
2. **Vehicle Load** — `100 = very high vehicle load`
3. **Brake Physics / Brake Load** — `100 = very high brake load / thermal-mechanical dose`
4. **Tire Dynamic Load** — `100 = very high tire dynamic/wear load`

**Do not design** a global mega-score such as `GlobalDrivingScore = DriverQuality + VehicleLoad + BrakeLoad + TireLoad` (or any weighted/inverted variant). Outputs have **different semantics and direction** and must remain separable and explainable.

| Output domain | GLOBAL_SCHEMA_CEILING | CURRENT_FOUR_VEHICLE_CEILING | Key schema limiter |
|--------|----------------------|-------------------------------|-------------------|
| **Driver Quality** | MODERATE | LOW–MODERATE | No long/lat accel; yaw/wheel speeds unobserved; events sparse |
| **Vehicle Load** | MODERATE | MODERATE | Torque/MAF/trans temp in schema; generic mass not in telemetry |
| **Brake Physics / Brake Load** | MODERATE | LOW | Hydraulic inputs in schema; zero on four; no ABS/ESC intervention signals |
| **Tire Dynamic Load** | MODERATE | LOW | DIRECT_TIRE_PRESSURE in schema; zero on four; no tire temp |

**E. DATA CONFIDENCE / ASSESSABILITY (orthogonal)** — independent telemetry/data-confidence dimension. Evaluates measurement vs reconstruction vs provider classification vs proxy; signal coverage; cadence; freshness; dropout; provenance; vehicle capability; reconstruction reliability.

Data Confidence **may**: lower confidence · lower assessability · trigger `INSUFFICIENT_DATA` · limit precision/claim strength.

Data Confidence **must not automatically**: worsen Driver Quality · raise/lower Vehicle Load · raise/lower Brake Load · raise/lower Tire Load **solely because telemetry is sparse or low quality**.

**LOW CONFIDENCE ≠ BAD DRIVING** · **LOW CONFIDENCE ≠ LOW/HIGH VEHICLE LOAD**

---

## 34. Runtime Probe Additions

| ID | Objective | Priority |
|---|---|---|
| RP-32 | Confirm `angularVelocityYaw` delivery on compatible OEM/provider | P1 |
| RP-33 | Confirm wheel speed pair on OEM paths | P1 |
| RP-34 | Brake pedal/pressure fields — null vs permission vs not-listed | P1 |
| RP-35 | Parallel gear fields — time-aligned `CurrentGear` vs `ActualGear` vs `SelectedGear` on one vehicle | P1 |
| RP-36 | Tire pressure schema fields — vehicle delivery vs NO_DIMO inventory | P2 |
| RP-37 | Commercial axle-row weight signals — applicability to passenger fleet | P2 |
| RP-38 | Signed **traction battery power** during known deceleration/braking episodes — test **positive=in / negative=out** DIMO semantics; check positive spikes vs deceleration, latency, cadence, stability; whether brake pedal/pressure separates friction vs regen | P2 |
| RP-39 | Event payload `metadata` JSON schema for behavior.* | P2 |

Phase 2B probes RP-21, RP-25, RP-26, RP-29, RP-31 remain open.

---

## 35. Findings

| ID | Type | Summary |
|----|------|---------|
| F2C-01 | CURRENT_SCHEMA_FACT | 117 telemetry fields in live schema |
| F2C-02 | SCHEMA_EXPANSION_OPPORTUNITY | 76 fields not queried |
| F2C-03 | GLOBAL_VS_VEHICLE_CAPABILITY_GAP | 84 schema fields absent from four-vehicle union |
| F2C-04 | PARALLEL_SIGNAL_GAP | Gear fields + throttle pairs — semantic equivalence unproven (RP-35) |
| F2C-05 | DRIVING_DYNAMICS_OPPORTUNITY | Yaw + front wheel-speed pair; long/lat accel absent |
| F2C-06 | BRAKE_OBSERVABILITY_GAP | Four hydraulic brake inputs in schema; zero four-vehicle observation |
| F2C-07 | TIRE_OBSERVABILITY_GAP | DIRECT_TIRE_PRESSURE in schema; zero four-vehicle observation |
| F2C-08 | OPEN_ENDED_EVENT_NAME_SURFACE | Provider-defined event names; Q015 filters ≠ exhaustive catalog |
| F2C-09 | SEGMENT_SURFACE_EXPANSION | Six mechanisms confirmed |
| F2C-10 | SDK_LAG | 1.6.0 vs 1.7.0 — no schema impact |
| F2C-11 | SCHEMA_DRIFT | Zero deprecated fields |
| F2C-12 | UNKNOWN_REQUIRES_RUNTIME_PROBE | Event metadata, availableSignals staleness |
| F2C-13 | REGEN_SIGN_SEMANTICS | Positive HV power = into battery; regen candidate requires synchronized decel context |
| F2C-14 | ABS_WARNING_NOT_INTERVENTION | `chassisBrakeABSIsWarningOn` diagnostic only |
| F2C-15 | COMMERCIAL_AXLE_WEIGHT_LIMITATION | Row3/4/5 weight — commercial/heavy; not generic Pkw mass |

---

## 36. Phase-2D Handoff

**SynqDrive target causal chain (preserve):**

```
TELEMETRY + CONTEXT
  → DRIVING RECONSTRUCTION
  → DRIVER BEHAVIOUR FEATURES
```

Evaluated in parallel as **four independent driving-intelligence output domains**:

- **A. Driver Quality**
- **B. Vehicle Load**
- **C. Brake Physics / Brake Load**
- **D. Tire Dynamic Load**

Plus **orthogonal**:

- **E. Data Confidence / Assessability**

**Core product question:** *How was the vehicle driven, and what effects did that driving behaviour have on vehicle, brakes, and tires?*

Phase 2D scores **20 unique main-track candidates** (+ commercial axle-weight RP-37 track + 7 secondary assessability/context signals) **per candidate, per dimension** — not as a single blended domain score and **not** as a global composite. Inputs: appendices below, Gold Signals §30, SET diffs §7–8, RP-32–39 §34, Master Plan §2D Value/Potential Matrix.

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

## Appendix B — Event Catalog Crosswalk (not exhaustive)

**Note:** `CURRENT_GLOBAL_EVENT_NAME_COUNT = UNKNOWN_OPEN_ENDED`. Below maps known layers only.

| Layer | Name | Family | SynqDrive Q015? | Observed Phase 2B | Evidence |
|-------|------|--------|-----------------|-------------------|----------|
| OFFICIAL_R1_GLOSSARY | ExtremeBraking | behavior | partial (`behavior.extremeBraking`) | C63/Arteon | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| OFFICIAL_R1_GLOSSARY | HarshAcceleration | behavior | yes | Tiguan/C63/Arteon | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| OFFICIAL_R1_GLOSSARY | HarshBraking | behavior | yes | Arteon historical | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| OFFICIAL_R1_GLOSSARY | HarshCornering | behavior | yes | Tiguan/C63/Arteon | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| OFFICIAL_DOCUMENTED_TAG | `behavior.harshAcceleration` | behavior | yes | Tiguan/C63/Arteon | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| OFFICIAL_DOCUMENTED_TAG | `behavior.harshBraking` | behavior | yes | Arteon historical | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| OFFICIAL_DOCUMENTED_TAG | `behavior.harshCornering` | behavior | yes | Tiguan/C63/Arteon | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| OFFICIAL_DOCUMENTED_TAG | `safety.collision` | safety | yes | UNKNOWN four | CONFIRMED_FROM_CURRENT_DIMO_OFFICIAL_DOCS |
| SYNQDRIVE_Q015_ONLY | `behavior.extremeBraking` | behavior | yes | C63/Arteon 30d | CONFIRMED_FROM_SYNQDRIVE_CODE |
| SYNQDRIVE_Q015_ONLY | `behavior.extremeAcceleration` | behavior | yes | none 30d four | CONFIRMED_FROM_SYNQDRIVE_CODE |
| SYNQDRIVE_Q015_ONLY | `behavior.extremeEmergency` | behavior | yes | none 30d four | CONFIRMED_FROM_SYNQDRIVE_CODE |
| SYNQDRIVE_Q015_ONLY | `behavior.extremeEmergencyBraking` | behavior | yes | none 30d four | CONFIRMED_FROM_SYNQDRIVE_CODE |

Event payload fields (all): `timestamp`, `name`, `source`, `durationNs`, `metadata` (opaque).

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
| Vehicle-observed not in Phase-2A driving acquisition (SET 4) | **15** |
| SynqDrive refs missing/deprecated in schema | **0** |
| Driving-dynamics-related schema fields | **20** |
| Brake-related schema fields | **6** (4 hydraulic + 1 diagnostic + 1 parking) |
| DIRECT_TIRE_PRESSURE fields | **4** |
| DIAGNOSTIC_TIRE_CONTEXT fields | **1** |
| EV/HV-related schema fields | **15** |
| SynqDrive Q015 filter names | **8** |
| Current global event name count | **UNKNOWN_OPEN_ENDED** |
| Current official segment mechanisms | **6** |
| High-value Phase-2D candidates (20 unique main-track signals) | **20** |
| New runtime probes RP-32–RP-39 | **8** |
| Newly present vs July historical subset | **94** |

---

**Phase 2C status: DONE** · **Phase 2D: NEXT** · **Phase 3: GATED**
