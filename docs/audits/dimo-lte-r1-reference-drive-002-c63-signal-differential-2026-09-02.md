# Reference Drive #002 — C63 Signal Inventory + Differential (Aug 2026 / RD002 / RD001)

**Date:** 2026-09-02  
**Evidence ID:** DI-EV-0026  
**Reference Drive ID:** `DIMO_LTE_R1_REFERENCE_DRIVE_002`  
**Session ID:** `e095d273-eb03-4bc9-aa2b-d0d709abd9bc`  
**Vehicle:** Mercedes-Benz C 63 AMG — KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)  
**DIMO tokenId:** `187336`  
**Connection profile:** `DIMO_LTE_R1` · **Powertrain:** `ICE_GASOLINE`

**Sources:**
- **A** — Aug 2026 C63 baseline: `docs/audits/dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md`
- **B** — RD002 PRE-ARM + runtime: session `e095d273-…` (DI-EV-0024)
- **C** — RD002 observed fields: DI-EV-0025 metrics
- **D** — RD001 Tiguan comparison: session `06638509-…` (DI-EV-0016) + WOB inventory audit

**Maturity:** CONFIRMED_FROM_VEHICLE_OBSERVATION (RD002 runtime) + CONFIRMED_FROM_CODE (surface assignment)

---

## Executive summary

| Metric | Value |
|--------|-------|
| `C63_CURRENT_AVAILABLE_SIGNALS` | **29** |
| `C63_RD002_OBSERVED_SIGNALS` | **29** |
| `NEW_SIGNALS_VS_AUGUST_C63` | **0** |
| `LOST_SIGNALS_VS_AUGUST_C63` | **0** |
| RD001 Tiguan discovered (WOB L 7503) | **31** (vehicle-specific — **not** cross-vehicle parity) |
| C63-only vs Tiguan | **−2** transmission gear fields absent on C63 |
| `NATIVE_EVENT_OBSERVED_IN_RD002` | **NO** |
| `HF_REQUESTED_1S_EQUALS_OBSERVED_1HZ` | **NO** |

---

## 1. Inventory authority layers

| Layer | C63 count | Source | Notes |
|-------|-----------|--------|-------|
| Aug 2026 `availableSignals` | 29 | Inventory audit A | Parked snapshot, 2026-08-30 |
| RD002 PRE-ARM `availableSignals` | 29 | DI-EV-0024 | Matches Aug baseline |
| RD002 actually observed | 29 | DI-EV-0025 | All preflight fields produced rows |
| RD001 Tiguan discovered | 31 | DI-EV-0016 | Different vehicle — comparison context only |

---

## 2. Per-field classification (all 29 C63 fields)

**Legend:**
- **Availability vs Aug C63:** `STILL_AVAILABLE` | `NEWLY_AVAILABLE` | `NO_LONGER_AVAILABLE`
- **RD002 observation:** `OBSERVED_NON_NULL` (all 29 fields)
- **Surface:** `HF_ACTIVE` = HF_HISTORICAL + LATEST; `LATEST_ONLY` = LATEST_LIVE + LATEST_SLOW only

| # | Provider field | Aug C63 | RD002 PRE-ARM | RD002 observed | Availability | Surface (RD002) |
|---|----------------|---------|---------------|----------------|--------------|-------------------|
| 1 | `currentLocationAltitude` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 2 | `currentLocationCoordinates` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 3 | `currentLocationHeading` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 4 | `exteriorAirTemperature` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 5 | `isIgnitionOn` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 6 | `lowVoltageBatteryCurrentVoltage` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 7 | `obdBarometricPressure` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 8 | `obdDistanceWithMIL` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 9 | `obdEngineLoad` | YES | YES | YES | STILL_AVAILABLE | HF_ACTIVE |
| 10 | `obdFuelRailPressure` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 11 | `obdFuelTypeName` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 12 | `obdIntakeTemp` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 13 | `obdIsPluggedIn` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 14 | `obdLongTermFuelTrim1` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 15 | `obdLongTermFuelTrim2` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 16 | `obdMAP` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 17 | `obdMaxMAF` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 18 | `obdOilTemperature` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 19 | `obdRunTime` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 20 | `obdStatusDTCCount` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 21 | `obdThrottlePosition` | YES | YES | YES | STILL_AVAILABLE | HF_ACTIVE |
| 22 | `powertrainCombustionEngineECT` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 23 | `powertrainCombustionEngineSpeed` | YES | YES | YES | STILL_AVAILABLE | HF_ACTIVE |
| 24 | `powertrainCombustionEngineTPS` | YES | YES | YES | STILL_AVAILABLE | HF_ACTIVE |
| 25 | `powertrainFuelSystemAbsoluteLevel` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 26 | `powertrainFuelSystemRelativeLevel` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 27 | `powertrainTransmissionTravelledDistance` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 28 | `powertrainType` | YES | YES | YES | STILL_AVAILABLE | LATEST_ONLY |
| 29 | `speed` | YES | YES | YES | STILL_AVAILABLE | HF_ACTIVE |

**Summary:** 29/29 `STILL_AVAILABLE` · 0 `NEWLY_AVAILABLE` · 0 `NO_LONGER_AVAILABLE` · 29/29 `OBSERVED_NON_NULL`.

---

## 3. HF cadence finding (major Driving Intelligence result)

`HF_HISTORICAL` is **ACTIVE** on C63 under motion, but **requested 1s DIMO aggregation ≠ observed 1 Hz bucket cadence**.

| Field | HF rows | Δt P50 (s) | Δt P90 (s) | Δt P95 (s) | Δt MAX (s) |
|-------|---------|------------|------------|------------|------------|
| `speed` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `obdEngineLoad` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `obdThrottlePosition` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `powertrainCombustionEngineTPS` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `powertrainCombustionEngineSpeed` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |

| Flag | Value | Maturity |
|------|-------|----------|
| `REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ` | **NO** | CONFIRMED_FROM_VEHICLE_OBSERVATION |
| `HF_HISTORICAL_OBSERVATION_TYPE` | `HF_AGGREGATE_BUCKET_OBSERVATION` | CONFIRMED_FROM_CODE |
| DIMO aggregation definition | AVG, 1s bucket | CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE |
| Provider/upstream bucket availability | sparse / irregular under motion | CONFIRMED_FROM_VEHICLE_OBSERVATION |

**Critical interpretation:** `HF_HISTORICAL` names the **historical aggregate acquisition surface**. It must **not** be read as proven high-frequency physical LTE_R1 sampling. The 355 HF rows are aggregate-bucket observations (`physicalSampleFingerprint` = V2 bucket identity), not raw physical source samples.

---

## 4. LATEST_LIVE vs provider update cadence

For motion-critical fields (example: `speed` on `LATEST_LIVE`):

| Cadence type | P50 | P95 | Notes |
|--------------|-----|-----|-------|
| Recorder retrieval (`requestStartedAt` Δt) | **~5.85 s** | **~6.25 s** | BullMQ cycle poll |
| Provider timestamp update (unique timestamps) | **~15 s** | **~27 s** | Upstream sample freshness |

| Flag | Value |
|------|-------|
| `POLLING_FREQUENCY_EQUALS_PROVIDER_SAMPLE_FREQUENCY` | **NO** |

This distinction is required for future Driver Quality, Vehicle Load, Brake Physics, Tire Dynamic Load, and sampling-confidence calculations. **No score changes in this evidence pass.**

---

## 5. C63-specific missing high-value physics signals

These signals are **not** in C63 `availableSignals` for this vehicle/token. **Do not infer provider-wide absence** from one vehicle.

| Signal class | Examples | C63 RD002 | Tiguan RD001 |
|--------------|----------|-----------|--------------|
| Transmission actual gear | `powertrainTransmissionActualGear*` | **ABSENT** | present (2 fields) |
| Yaw / lateral dynamics | `chassisYawRate`, angular velocity | **ABSENT** | not in 31-field set |
| Wheel speed | per-wheel speed signals | **ABSENT** | not in 31-field set |
| Direct brake evidence | pedal / hydraulic pressure | **ABSENT** | not in 31-field set |
| Tire pressure | TPMS per-wheel | **ABSENT** | not in 31-field set |

---

## 6. Physics / assessability semantics (RD002 scope boundary)

RD002 validates **recorder + HF acquisition mechanics** under real motion. It does **not** prove C63 LTE_R1 cadence is sufficient for fine-grained vehicle dynamics reconstruction.

| Assessment | RD002 result | Maturity |
|------------|--------------|----------|
| `HIGH_RESOLUTION_JERK_RECONSTRUCTION` | **NOT_VALIDATED** | INFERENCE |
| `HIGH_RESOLUTION_BRAKE_PHYSICS` | **NOT_AVAILABLE** | CONFIRMED_FROM_VEHICLE_OBSERVATION |
| `DIRECT_BRAKE_SIGNAL` | **ABSENT** | CONFIRMED_FROM_VEHICLE_OBSERVATION |
| `YAW_SIGNAL` | **ABSENT** | CONFIRMED_FROM_VEHICLE_OBSERVATION |
| `WHEEL_SPEED_SIGNAL` | **ABSENT** | CONFIRMED_FROM_VEHICLE_OBSERVATION |

Speed/RPM/throttle/load remain useful **vehicle-specific evidence**. Suitability for scoring must be assessed later under sampling-invariance and Ground Truth validation. **Do not penalize scores** for unavailable signals — this affects assessability/confidence only.

---

## 7. Native event semantics

| Flag | Value | Maturity |
|------|-------|----------|
| `NATIVE_EVENT_COUNT` | **0** | CONFIRMED_FROM_RUNTIME |
| `NATIVE_EVENT_PATH_AVAILABLE_FROM_CAPABILITY` | **YES** | CONFIRMED_FROM_CODE |
| `NATIVE_EVENT_OBSERVED_IN_RD002` | **NO** | CONFIRMED_FROM_RUNTIME |
| `NATIVE_EVENT_RUNTIME_DELIVERY_VALIDATED_BY_RD002` | **NO / NOT_OBSERVED** | NOT_OBSERVED |

Aug 2026 C63 inventory recorded **34** historical `behavior.*` events (30d). These remain **historical evidence only** — RD002 did not observe native events during the capture window. **Not** an event-capture failure.

---

## 8. Late-arrival recovery semantics

| Flag | Value | Maturity |
|------|-------|----------|
| `HF_LATE_ARRIVAL_RECOVERY_RUNTIME` | **NOT_OBSERVED_IN_RD002** | NOT_OBSERVED |

No concrete late-arriving provider bucket was observed and recovered during RD002. This does **not** invalidate `PHASE_3A3_2_PRODUCTION_VALIDATED=YES`.

RD002 **did** prove under real motion:
- HF_HISTORICAL acquisition active
- Per-field watermark + query coverage state
- AGGREGATE_BUCKET_V2 identity
- Durable DB uniqueness (0 duplicate fingerprints)
- Clean retries/runtime continuity
- Clean STOP

---

## 9. Cross-reference: RD001 vs RD002 vs RD003 Ground Truth states

| Drive | Video GT state | Meaning |
|-------|----------------|---------|
| **RD001** | `NOT_AVAILABLE` | Incident — ARM workflow delay prevented video capture |
| **RD002** | `NOT_PLANNED_BY_PROTOCOL` | Intentional — motion HF canary only |
| **RD003** | Planned | First **video Ground Truth** reference drive (not started) |

Do **not** conflate these three states.

---

## Related evidence

| Evidence ID | Artifact |
|-------------|----------|
| DI-EV-0023 | Capture report (includes VIDEO_GROUND_TRUTH protocol note) |
| DI-EV-0024 | Session summary JSON |
| DI-EV-0025 | Signal quality metrics JSON + CSV |
| DI-EV-0026 | This differential |
