# DIMO Phase 2E — Redundancy / Canonicalization / Evidence Hierarchy

**Date:** 2026-08-31  
**Status:** DONE (final consistency / episode taxonomy / registry arithmetic QA pass)  
**Scope:** Redundancy analysis · canonical signal design · evidence hierarchy · physical episode identity · fallback/provenance design (documentation only)  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Phase gate:** Phase 2E **DONE** · Phase 2F **NEXT** · Phase 2F.1 **NOT_STARTED** · Phase 3A **`GATED_ON_LTE_R1_MANIFEST`**

---

## 1. Executive Summary

Phase 2E resolves Phase-2D handoff groups into a **provider-neutral canonical layer** so multiple observations of the same physical maneuver do not become multiple independent behavioral offenses or load events.

| Metric | Count |
|--------|------:|
| **`CANONICAL_SIGNAL_COUNT`** (Appendix B authority) | **33** |
| Redundancy / correlation groups (`D2E-R01`…`R16`) | **16** |
| `EXACT_ALIAS` (provider `speed` → storage `speedKmh` only) | **1** |
| `PENDING_EQUIVALENCE` groups | **2** |
| `POSITIONAL_COMPLEMENT` groups | **2** |
| `CIRCUIT_COMPLEMENT` groups | **1** |
| `CAUSAL_CHAIN_COMPLEMENT` groups | **3** |
| `NO_SUBSTITUTION` groups | **4** |
| `NO_VALID_FALLBACK` canonical families | **6** |
| Base maneuver episodes | **3** |
| Composite / sequence episodes | **2** |
| Exposure / state intervals | **2** |
| Context subtype classifications (non-peer episodes) | **1** |
| Canonical decisions (`D2E-D001`…`D2E-D024`) | **24** |
| Legacy impact items flagged | **12** |

**Count authority:** Appendix B expanded rows. Summary metrics are derived — not copied from prior PR text.

**North star preserved:** RAW PROVIDER OBSERVATION → CANONICAL SIGNAL → PHYSICAL EPISODE → CANONICAL FEATURE → independent outputs (Driver Quality · Vehicle Load · Brake Physics · Tire Load) + orthogonal Data Confidence.

**Primary profile:** `DIMO_LTE_R1`. Smart5/Tesla **`UNVERIFIED_UNTIL_PHASE_2G`**. High Mobility **OUT_OF_SCOPE** for Phase 2E.

**No production changes performed.**

---

## 2. Scope & Authorities

### 2.1 Authorities read

| Document | Role |
|----------|------|
| `driving-intelligence-reconstruction-master-plan-2026-08-30.md` | Phase gates · architecture |
| `dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md` | 30 candidates · tiers · episode handoff |
| `dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md` | 117 schema fields · parallel groups |
| `dimo-phase-2b-four-vehicle-capability-gap-matrix-2026-08-31.md` | Four-vehicle observation |
| `dimo-phase-2a-current-query-surface-audit-2026-08-31.md` | Query surfaces · acquisition paths |
| `driving-intelligence-phase-1-current-state-forensic-audit-2026-08-30.md` | Current implementation baseline |

### 2.2 Source modules analyzed (read-only)

DIMO query builders · `dimo-snapshot.processor.ts` · `dimo-segments.service.ts` · HF preprocessing/detectors · LTE_R1 native enrichment · Driving Impact · DriverScoreService · Brake Health V2 · Tire Health V2 · canonical/chassis mappers · native event mappers.

### 2.3 Out of scope

Production logic · query changes · scheduler changes · runtime probes · DB migrations · score formulas · detectors · Flight Recorder manifest (2F.1).

---

## 3. Canonicalization Principles

1. **Canonicalization ≠ delete the loser.** Parallel fields may be complementary, positional, causal-chain, or pending equivalence — not automatically redundant.
2. **`SEMANTIC_CANONICAL_SOURCE` ≠ `USE_CASE_ELIGIBLE_SOURCE`.** A semantically excellent signal may be temporally unusable at current cadence.
3. **`SIGNAL_SEMANTIC_QUALITY` vs `TEMPORAL_USABILITY`** remain separate (Phase 2D cadence classes apply).
4. **Raw provenance is never destroyed.** Every future output must trace RAW → CANONICAL → EPISODE → FEATURE → domain contribution.
5. **No unproven provider authority.** Unknown equivalence → `PROVISIONAL_REQUIRES_RUNTIME_VALIDATION`.
6. **Episode identity is provider-neutral.** Native events attach to episodes; they are not the episode identity.
7. **Cross-domain reuse is allowed; within-domain double-counting is not.** Same braking episode may feed DQ, Vehicle Load, Brake Load, and Tire Load with different features — but must not count as four brake offenses in one domain.

---

## 4. Layer Model

| Level | Name | Examples |
|------:|------|----------|
| **L0** | `PROVIDER_OBSERVATION` | Raw DIMO field/event + unit + provider timestamp + acquisition path + connection profile |
| **L1** | `CANONICAL_SIGNAL` | `CAN_VEHICLE_SPEED`, `CAN_BRAKE_PRESSURE_C1`, `CAN_TRACTION_BATTERY_POWER` |
| **L2** | `PHYSICAL_EPISODE` / state | `BRAKING_EPISODE`, `CORNERING_EPISODE`, `THERMAL_EXPOSURE` |
| **L3** | `CANONICAL_FEATURE` | peak deceleration, pressure ramp, regen candidate energy, thermal dose |
| **L4** | `OUTPUT_DOMAIN` | Driver Quality · Vehicle Load · Brake Load · Tire Load (+ orthogonal Data Confidence) |

---

## 5. Relationship Taxonomy

| Class | Meaning | Phase 2E examples |
|-------|---------|-------------------|
| `EXACT_ALIAS` | Same provider field / naming lineage only | `speed` → `speedKmh` code alias |
| `SEMANTIC_EQUIVALENT_PENDING_VALIDATION` | Possibly same semantics — not proven | OBD throttle vs engine TPS; CurrentGear vs ActualGear |
| `COMPLEMENTARY` | Different information, same domain | torque + MAF |
| `POSITIONAL_COMPLEMENT` | Distinct wheel/position addresses, not duplicates | FL/FR wheel speed; FL/FR/RL/RR tire pressure |
| `CIRCUIT_COMPLEMENT` | Parallel hydraulic/system channels, not spatial positions | brake circuit C1 + C2 → one `BRAKE_HYDRAULIC_EVIDENCE` |
| `CAUSAL_CHAIN_COMPLEMENT` | Different stages of one chain | pedal → pressure → deceleration |
| `AGGREGATE_DIAGNOSTIC` | Summary/warning over detailed state | TPMS warning vs four pressures |
| `DERIVED_FROM` | Computed from other observations | speed-derived decel; regen candidate |
| `PROVIDER_CLASSIFICATION` | OEM/provider event label | `behavior.harshBraking` |
| `CONTEXTUAL` | Modifies interpretation | ambient temp, heading |
| `POWERTRAIN_SPECIFIC` | Not comparable across powertrains | engine RPM vs battery power |
| `NOT_COMPARABLE` | Must not be merged or substituted | yaw vs heading derivative |
| `UNKNOWN_REQUIRES_RUNTIME_VALIDATION` | Insufficient evidence to classify further | Smart5 throttle equivalence |

---

## 6. Source Authority Taxonomy

| Status | Meaning |
|--------|---------|
| `CANONICAL_PRIMARY_IF_VALIDATED` | Preferred L1 source once runtime confirms quality |
| `CANONICAL_SECONDARY_FALLBACK` | Allowed fallback with confidence ceiling |
| `COMPLEMENTARY_EVIDENCE` | Keep alongside primary; do not substitute |
| `VALIDATION_ONLY` | Supports confidence/calibration only |
| `CONTEXT_ONLY` | Context modifier |
| `DIAGNOSTIC_ONLY` | Health/diagnostic; not behavior ground truth |
| `NO_SUBSTITUTION_ALLOWED` | Missing primary cannot be replaced by correlated proxy in same semantic slot |
| `PROVISIONAL_REQUIRES_RUNTIME_VALIDATION` | Priority designed; equivalence/quality unproven |
| `NOT_CANONICAL` | Remains L0 only or episode evidence channel |

---

## 7. Canonical Signal Registry

**`CANONICAL_SIGNAL_COUNT = 33`** — fully expanded in **Appendix B** (one row per unique `CAN_*` key; four tire-pressure keys explicit).

Grouped by family:

**Kinematics (6):** `CAN_VEHICLE_SPEED` · `CAN_YAW_RATE` · `CAN_WHEEL_SPEED_FL` · `CAN_WHEEL_SPEED_FR` · `CAN_LOCATION_HEADING` · `CAN_ALTITUDE`

**Powertrain ICE/combustion (7):** `CAN_ENGINE_THROTTLE_POSITION` · `CAN_ENGINE_TPS` · `CAN_ENGINE_RPM` · `CAN_ENGINE_LOAD` · `CAN_ENGINE_TORQUE` · `CAN_ENGINE_TORQUE_PERCENT` · `CAN_ENGINE_MAF`

**Transmission (5):** `CAN_TRANSMISSION_CURRENT_GEAR` · `CAN_TRANSMISSION_ACTUAL_GEAR` · `CAN_TRANSMISSION_SELECTED_GEAR` · `CAN_TRANSMISSION_GEAR_RATIO` · `CAN_TRANSMISSION_TEMPERATURE`

**Brake (4):** `CAN_BRAKE_PEDAL_STATE` · `CAN_BRAKE_PEDAL_POSITION` · `CAN_BRAKE_PRESSURE_C1` · `CAN_BRAKE_PRESSURE_C2`

**Tire (5):** `CAN_TIRE_PRESSURE_FL` · `CAN_TIRE_PRESSURE_FR` · `CAN_TIRE_PRESSURE_RL` · `CAN_TIRE_PRESSURE_RR` · `CAN_TIRE_WARNING_STATE`

**Energy (2):** `CAN_TRACTION_BATTERY_POWER` · `CAN_TRACTION_BATTERY_SOC`

**Thermal/context (4):** `CAN_AMBIENT_TEMPERATURE` · `CAN_COOLANT_TEMPERATURE` · `CAN_OIL_TEMPERATURE` · `CAN_INTAKE_TEMPERATURE`

Keys are **not** created for unavailable schema scope (e.g. no four-wheel speed keys beyond audited front pair in 2D main track).

---

## 8. Current Acquisition Lineage

Mapped from Phase 2A + 2D + read-only code audit (Appendix B/G).

| Canonical family | Current path | Persisted today | Consumer usage |
|------------------|--------------|-----------------|----------------|
| `CAN_VEHICLE_SPEED` | SNAPSHOT + HF_POST_TRIP + ACTIVE_TRIP context | VLS + HF + trip LF max | Detectors, impact, health |
| `CAN_ENGINE_THROTTLE_POSITION` | HF_POST_TRIP (`obdThrottlePosition`) | HF | Accel metadata, performance |
| `CAN_ENGINE_TPS` | NONE (observed 4/4, not queried) | no | none |
| `CAN_ENGINE_RPM` | HF_POST_TRIP | HF | enrichment metadata |
| `CAN_ENGINE_LOAD` | HF_POST_TRIP + SNAPSHOT (`obdEngineLoad`) | HF + VLS | load context |
| `CAN_ENGINE_TORQUE` / `%` | HF_POST_TRIP | HF | not primary consumer |
| `CAN_TRANSMISSION_CURRENT_GEAR` | HF_POST_TRIP | HF (partial) | not primary consumer |
| `CAN_TRANSMISSION_ACTUAL_GEAR` | NONE | no | none |
| `CAN_TRACTION_BATTERY_POWER` | SNAPSHOT + HF_POST_TRIP | VLS + HF | battery/regen context |
| `CAN_TIRE_PRESSURE_*` | SNAPSHOT | VLS (bar) | tire health |
| `CAN_TIRE_WARNING_STATE` | SNAPSHOT | partial | tire health fallback |
| Brake hydraulics / yaw / wheel speed | NONE | no | catalog only |
| Native braking/accel/cornering | NATIVE_EVENT post-trip | `DrivingEvent` | LTE_R1 Driving Impact |
| HF braking/accel | DERIVED from HF speed | `TripBehaviorEvent` | SMART5 impact + abuse |

---

## 9. Speed Group (`D2E-R16`)

**Canonical semantic:** `CAN_VEHICLE_SPEED`  
**Provider field:** `speed` (single DIMO telemetry field; km/h assumed at boundary)

**Lineage:**

```
DIMO signalsLatest.speed / signals.speed
  → normalize numVal → VehicleLatestState.speedKmh
  → HF HighFrequencyReading.speedKmh → CleanHfPoint.speedMs (= km/h ÷ 3.6)
  → trip route/segment enrichment → VehicleTrip.maxSpeedKmh (LF, separate pipeline)
```

**Relationship class:**

| Representation | Class | Notes |
|----------------|-------|-------|
| DIMO `speed` → `speedKmh` | `EXACT_ALIAS` | Same underlying provider sample; naming only |
| `speedKmh` → `speedMs` | `UNIT_CONVERTED_REPRESENTATION` | km/h ÷ 3.6 — not a second provider source |
| Trip `maxSpeedKmh` | `AGGREGATE_DERIVED` | LF route/segment aggregate — not waveform fallback |

**Decision:** Never create a second canonical speed from alias duplication. LF `maxSpeedKmh` is a **trip aggregate**, not a substitute high-frequency speed stream.

**Legacy impact:** `CURRENT_AMBIGUOUS` — LF max vs HF peak may disagree (documented in ops surfaces).

**Authority:** `CAN_VEHICLE_SPEED` from HF when use case needs waveform; snapshot for context; LF max for trip summary only.

---

## 10. Throttle / TPS Group (`D2E-R01`)

**Fields analyzed:**

| Provider field | Schema | Queried | Persisted | Observed 4/4 |
|----------------|--------|---------|-----------|--------------|
| `obdThrottlePosition` | OBD PID % | HF_POST_TRIP, performance | HF | yes |
| `powertrainCombustionEngineTPS` | Engine TPS % | NONE | no | yes |

**Fixed rule preserved:** **`THROTTLE_POSITION != ACCELERATOR_PEDAL_POSITION`**.

**Canonical keys:** `CAN_ENGINE_THROTTLE_POSITION` ← `obdThrottlePosition` (operational primary today) · `CAN_ENGINE_TPS` ← `powertrainCombustionEngineTPS` (parallel combustion-reported state)

**Relationship:** `SEMANTIC_EQUIVALENT_PENDING_VALIDATION` — same *class* (throttle opening), potentially different ECU source, unit both %, not proven interchangeable.

**Authority today:**
- `CAN_ENGINE_THROTTLE_POSITION` → `CANONICAL_PRIMARY_IF_VALIDATED` for acquisition paths that exist
- `CAN_ENGINE_TPS` → `COMPLEMENTARY_EVIDENCE` / `PROVISIONAL_REQUIRES_RUNTIME_VALIDATION`

**Fallback:** `SEMANTIC_FALLBACK` candidate TPS ↔ OBD throttle — **not enabled** until Phase 3 validation.

**Do not average or pick winner without proof.**

**Decision:** `D2E-D001` (Appendix H)

---

## 11. RPM / Engine Load / Torque / MAF Cluster (`D2E-R03`)

| Signal | Canonical key | Physical meaning | Relationship |
|--------|---------------|------------------|--------------|
| RPM | `CAN_ENGINE_RPM` | Rotational state | `COMPLEMENTARY` |
| Engine load | `CAN_ENGINE_LOAD` | Normalized load proxy | `COMPLEMENTARY` |
| Torque | `CAN_ENGINE_TORQUE` | Reported mechanical output | `COMPLEMENTARY` |
| Torque % | `CAN_ENGINE_TORQUE_PERCENT` | Normalized torque proxy | `COMPLEMENTARY` (correlated with torque) |
| MAF | `CAN_ENGINE_MAF` | Airflow / combustion demand | `COMPLEMENTARY` |
| TPS | `CAN_ENGINE_THROTTLE_POSITION` | Throttle state | `COMPLEMENTARY` |

**Verdict:** High correlation **does not** justify collapsing to one "engine stress signal." Each retains distinct canonical semantics.

**Torque pair (corrected):** `CAN_ENGINE_TORQUE` (`REPORTED_ENGINE_TORQUE`) and `CAN_ENGINE_TORQUE_PERCENT` (`REPORTED_TORQUE_PERCENT`) are **`COMPLEMENTARY`** — different physical semantics and potentially different reference bases. **Not** `SEMANTIC_EQUIVALENT_PENDING_VALIDATION` and **not** interchangeable substitutes.

If a deterministic Nm↔% conversion becomes possible later, it requires a known reference basis (e.g. peak torque, ECU reference torque):

**`DERIVABLE_ONLY_IF_REFERENCE_BASIS_KNOWN`**

Absolute torque physics must **not** silently consume percent torque as Nm.

**Phase 2F implication:** HF post-trip already queries torque pair; canonicalization keeps both L0, one episode-level powertrain load feature set later.

---

## 12. Transmission / Gear Group (`D2E-R02`)

| Provider field | Canonical key | Acquisition | 4/4 obs | Notes |
|----------------|---------------|-------------|---------|-------|
| `powertrainTransmissionCurrentGear` | `CAN_TRANSMISSION_CURRENT_GEAR` | HF_POST_TRIP | queried, weak persist | Q009 Active path |
| `powertrainTransmissionActualGear` | `CAN_TRANSMISSION_ACTUAL_GEAR` | NONE | Tiguan 1/4 | parallel to CurrentGear |
| `powertrainTransmissionSelectedGear` | `CAN_TRANSMISSION_SELECTED_GEAR` | NONE | 0/4 | includes Park enum 126 |
| `powertrainTransmissionActualGearRatio` | `CAN_TRANSMISSION_GEAR_RATIO` | NONE | Tiguan 1/4 | companion ratio |

**No alias assumption.** `CurrentGear` vs `ActualGear` → `SEMANTIC_EQUIVALENT_PENDING_VALIDATION`.

**Semantic separation enforced:**
- `TRANSMISSION_ACTUAL_GEAR` — engaged gear state
- `TRANSMISSION_SELECTED_GEAR` — commanded/selector state (may differ during shifts)
- `TRANSMISSION_GEAR_RATIO` — ratio companion, not substitute gear integer

**Authority today:** `CAN_TRANSMISSION_CURRENT_GEAR` → `PROVISIONAL_REQUIRES_RUNTIME_VALIDATION` (only field in active HF query).

**Decision:** `D2E-D002`, `D2E-D003`

---

## 13. Brake Pedal Group (`D2E-R04`)

| Field | Canonical key | Class |
|-------|---------------|-------|
| `chassisBrakeIsPedalPressed` | `CAN_BRAKE_PEDAL_STATE` | `DIRECT_REPORTED_CHASSIS_STATE` |
| `chassisBrakePedalPosition` | `CAN_BRAKE_PEDAL_POSITION` | `DIRECT_REPORTED_CHASSIS_STATE` |

**Relationship:** `COMPLEMENTARY` — switch vs analog position, same causal stage (driver demand).

**Acquisition:** NONE today · 0/4 observed.

**Authority (future):** both `COMPLEMENTARY_EVIDENCE`; position primary for shape if validated; switch useful for onset binary.

**Not substitutable by:** speed deceleration (`DEGRADED_PROXY` only).

---

## 14. Brake Hydraulic Pressure Group (`D2E-R05`)

| Field | Canonical key |
|-------|---------------|
| `chassisBrakeCircuit1PressurePrimary` | `CAN_BRAKE_PRESSURE_C1` |
| `chassisBrakeCircuit2PressurePrimary` | `CAN_BRAKE_PRESSURE_C2` |

**Family:** `FAM_BRAKE_PRESSURE` · L3 source `HYDRAULIC_BRAKE_DEMAND`

**Relationship:** `CIRCUIT_COMPLEMENT` — two parallel hydraulic **system channels**, not spatial/wheel positions. Both map to one future `BRAKE_HYDRAULIC_EVIDENCE` structure.

**Do not assume** which wheel/axle each circuit represents without provider documentation.

**Design concept:** future `BRAKE_HYDRAULIC_EVIDENCE` retains circuit1, circuit2, agreement/delta, availability flags, quality.

**Do NOT:** blind average · permanent circuit-1 winner · double event count.

**Fusion formula:** `DEFER_TO_VALIDATION`.

**If only one circuit exists:** use available circuit with quality flag; no synthetic duplicate.

**If circuits disagree:** retain both; disagreement → validation + confidence flag; no automatic discard.

---

## 15. Brake Multi-Channel Evidence (`D2E-R06`)

**Brake Evidence Hierarchy:**

| Tier | Evidence | Role |
|------|----------|------|
| **A — Driver demand** | pedal state, pedal position | demand onset/shape |
| **B — Hydraulic system** | circuit 1, circuit 2 | system response / measured hydraulic intensity |
| **C — Vehicle response** | speed-derived deceleration | kinematic response |
| **D — Energy / powertrain** | battery power, RPM/gear/retardation context | regen/friction split context |
| **E — Provider classification** | `behavior.harshBraking`, `behavior.extremeBraking`, emergency variants | classified evidence |
| **F — Derived classification** | HF braking detector, FULL_BRAKING abuse | `EPISODE_CLASSIFICATION` / `DERIVED_FEATURE` |
| **Context subtype** | high-speed-brake classification | `EPISODE_CLASSIFICATION` on `BRAKING` — not a separate raw channel |

**These are not eight independent brake offenses.**

**Current production risk (read-only):** LTE_R1 ingests native `DrivingEvent` **and** runs HF abuse/braking detectors on overlapping trips → `CURRENT_DOUBLE_COUNTING_RISK`.

**Canonical episode count for one maneuver:** **1** (`BRAKING_EPISODE`).

**Decision:** `D2E-D004`, `D2E-D005`, `D2E-D006`

---

## 16. Wheel Speed Group (`D2E-R07`, `D2E-R08`)

**Fields:** `chassisAxleRow1WheelLeftSpeed` → `CAN_WHEEL_SPEED_FL` · `chassisAxleRow1WheelRightSpeed` → `CAN_WHEEL_SPEED_FR`

**Relationship:** `POSITIONAL_COMPLEMENT` — do not collapse.

**Derived family (future):** `FRONT_WHEEL_SPEED_CONSISTENCY` — **not** slip ratio.

**vs `CAN_VEHICLE_SPEED`:** `CAUSAL_CHAIN_COMPLEMENT` / kinematic consistency — wheel delta ≠ measured slip without rolling radius, driven axle, sync, cornering geometry.

**Acquisition:** NONE · 0/4.

**Authority:** keep both positions; consistency proxy is L3 derived feature, not L1 merge.

---

## 17. Yaw / Heading / Trajectory (`D2E-R09`)

| Signal | Canonical key | Role |
|--------|---------------|------|
| `angularVelocityYaw` | `CAN_YAW_RATE` | body rotational rate |
| `currentLocationHeading` | `CAN_LOCATION_HEADING` | global orientation |
| GPS coordinates | trajectory context | path curvature context |

**Relationship:** `NOT_COMPARABLE` for automatic equivalence.

**Heading derivative → yaw:** at best `DEGRADED_PROXY` / `CONTEXTUAL` fallback — requires cadence/sync validation.

**Acquisition:** yaw NONE 0/4 · heading SNAPSHOT 4/4.

---

## 18. Tire Pressure Group (`D2E-R10`)

**Canonical keys:** `CAN_TIRE_PRESSURE_FL` · `CAN_TIRE_PRESSURE_FR` · `CAN_TIRE_PRESSURE_RL` · `CAN_TIRE_PRESSURE_RR` (Appendix B: four explicit rows)

**Relationship:** `POSITIONAL_COMPLEMENT` — distinct wheel-position states, not redundant duplicates.

**Derived (later, no thresholds):** front/rear axle imbalance · left/right imbalance · vehicle pressure condition · time-out-of-range exposure.

**Tire pressure alone ≠ tire dynamic load** (Phase 2D preserved).

**Acquisition:** SNAPSHOT · persisted bar in VLS after kPa→bar normalization.

---

## 19. Tire Warning vs Pressure (`D2E-R11`)

| Source | Class | Authority |
|--------|-------|-----------|
| Four pressure fields | physical state | `CANONICAL_PRIMARY_IF_VALIDATED` |
| `chassisTireSystemIsWarningOn` | `AGGREGATE_DIAGNOSTIC` | `DIAGNOSTIC_ONLY` |

**Warning must NOT replace four pressures.**

**Allowed roles for warning:** validate anomaly · OEM threshold event · diagnostic fallback when pressure unavailable.

**No claim:** warning = low pressure unless provider semantics prove it.

---

## 20. Battery Power / Regen Group (`D2E-R12`)

**Canonical raw:** `CAN_TRACTION_BATTERY_POWER` ← `powertrainTractionBatteryCurrentPower`

**Sign convention retained:** **positive = energy into battery** (DIMO/SynqDrive HF comment alignment).

**Do NOT canonicalize:** positive power = regenerative braking.

**Derived feature:** `REGEN_CANDIDATE` requires synchronized battery power + deceleration + brake context + powertrain/charging sanity.

**Powertrain:** ICE `NOT_APPLICABLE` · PHEV/BEV `CANONICAL_PRIMARY_IF_VALIDATED`.

**Acquisition:** MULTIPLE (snapshot + HF) · 0/4 on audit ICE set for field observation.

---

## 21. Temperature Families (`D2E-R13`)

| Field | Canonical key | Domain |
|-------|---------------|--------|
| `exteriorAirTemperature` | `CAN_AMBIENT_TEMPERATURE` | context for all |
| `powertrainCombustionEngineECT` | `CAN_COOLANT_TEMPERATURE` | engine thermal |
| `obdOilTemperature` | `CAN_OIL_TEMPERATURE` | lubrication thermal |
| `obdIntakeTemp` | `CAN_INTAKE_TEMPERATURE` | intake/air thermal |
| `powertrainTransmissionTemperature` | `CAN_TRANSMISSION_TEMPERATURE` | transmission thermal |
| `powertrainTractionBatteryTemperatureAverage` (HF path) | EV battery thermal context | electrified — **not** merged into ambient/coolant |

**Do not collapse** oil vs trans vs coolant vs ambient — missing one **must not** silently substitute another.

---

## 22. Native vs Reconstructed Events (`D2E-R14`)

| Class | Examples | Policy |
|-------|----------|--------|
| `PROVIDER_CLASSIFIED_EVIDENCE` | `behavior.harshBraking`, `extremeBraking`, `harshAcceleration`, `harshCornering`, collision | attach to episode; not ground truth |
| `RECONSTRUCTED_EVIDENCE` | HF braking/accel detectors, abuse FULL_BRAKING | attach to episode; required for Smart5 parity |

**Native events MAY:** help detect · validate reconstruction · enrich provenance · fallback where reconstruction impossible.

**Native events MUST NOT:** be universal ground truth · auto-add second penalty for same episode · be required for canonical behavior · block Smart5 parity.

**Profile neutrality:** `CANONICAL_PHYSICAL_EPISODE` owns evidence channels; provider event is attachment, not identity.

**Current thresholds documented as CURRENT (not future canonical truth):**
- HF context window ±5s (`lte-r1-behavior-enrichment.service.ts`)
- HF gap split >5s · brake merge <1.5s · accel merge <2s
- Native fingerprint exact observedAt + provider fields

---

## 23. Physical Episode Identity

**Core Phase 2E output:** `PHYSICAL_EPISODE_IDENTITY`

### 23.1 Conceptual structure (no implementation)

```
episodeId, tripId, episodeType, startTime, endTime, peakTime,
evidenceChannels[], canonicalFeatures{}, context{}, provenance{}, assessability{}
```

### 23.2 Episode taxonomy (separated concepts)

**Base maneuver episodes (3)** — one physical maneuver identity each:

| Type | Description |
|------|-------------|
| `ACCELERATION` | Positive longitudinal demand maneuver |
| `BRAKING` | Deceleration / brake-demand maneuver |
| `CORNERING` | Lateral-demand maneuver |

**Composite / sequence episodes (2)** — reference base episodes; do not auto-multiply penalties:

| Type | Description | Linkage |
|------|-------------|---------|
| `ACCEL_BRAKE_REVERSAL` | Accel→brake sequence | may reference `sourceAccelerationEpisodeId` + `sourceBrakingEpisodeId` |
| `STOP_GO_CYCLE` | Stop-go cycling pattern | sequence over multiple base episodes |

**Exposure / state intervals (2)** — not behavior offenses by default:

| Type | Description |
|------|-------------|
| `POWERTRAIN_LOAD` | Sustained propulsion/load exposure |
| `THERMAL_EXPOSURE` | Thermal time-above-threshold / dose exposure |

**Context / subtype classification (1)** — enriches a base episode; **not** a peer maneuver count:

| Classification | Preferred attachment |
|----------------|---------------------|
| `HIGH_SPEED_BRAKING` | `BRAKING` episode `context.highSpeed = true` or `classification = HIGH_SPEED_BRAKING` — **not** a second independent braking episode for the same maneuver |

### 23.3 Physical episode identity invariants

**INVARIANT A:** One physical braking maneuver normally owns **one** `BRAKING` base-episode identity.

**INVARIANT B:** Additional evidence channels enrich that identity; they do not multiply it.

**INVARIANT C:** Contextual classifications such as `HIGH_SPEED_BRAKING` do **not** create a second independent maneuver count.

**INVARIANT D:** Composite sequences may reference base episodes without consuming them twice by default (no automatic accel + brake + reversal triple penalty in one domain).

**INVARIANT E:** Exposure states (`POWERTRAIN_LOAD`, `THERMAL_EXPOSURE`) are not automatically behavior offenses.

**INVARIANT F:** The same base episode may feed Driver Quality · Vehicle Load · Brake Load · Tire Load with different features — that is **not** cross-domain double counting.

### 23.4 Matching principles (future — no fixed canonical windows)

Combine: same trip · compatible maneuver type · temporal overlap · causal ordering · sign consistency · shared speed interval · peak neighborhood · compatible context.

**Do not canonize** "within 3 seconds = same episode" unless validated — current production windows listed in §22 as **CURRENT** only.

---

## 24. Acceleration Episode

### Observation channels (`OBSERVATION_CHANNEL`)

- native `behavior.harshAcceleration` / `behavior.extremeAcceleration` (`PROVIDER_CLASSIFIED`)
- vehicle speed time series (`REPORTED_STATE` / kinematic enabler)
- TPS / RPM / torque / load (`REPORTED_STATE` context)

### Derived features / classifications (`DERIVED_FEATURE` / `EPISODE_CLASSIFICATION`)

- HF speed-derived acceleration (`RECONSTRUCTED_KINEMATIC`)
- launch-like / kickdown classifications (detector output)
- smoothness, peak, duration, ramp (L3 features)

**Identity rule:** one physical acceleration maneuver → **one** `ACCELERATION` base episode regardless of channel count.

---

## 25. Braking Episode

### Observation channels (`OBSERVATION_CHANNEL`)

| Channel | Class |
|---------|-------|
| native `behavior.harshBraking` / `extremeBraking` / emergency variants | `PROVIDER_CLASSIFIED` |
| vehicle speed trajectory | `REPORTED_STATE` |
| brake pedal state / position | `REPORTED_STATE` |
| hydraulic pressure C1 / C2 | `REPORTED_STATE` |
| traction battery power | `REPORTED_STATE` |

### Derived features / classifications (`DERIVED_FEATURE` / `EPISODE_CLASSIFICATION`)

| Output | Class | Notes |
|--------|-------|-------|
| speed-derived deceleration | `RECONSTRUCTED_KINEMATIC` | from speed series |
| HF HARD/EXTREME braking detector output | `EPISODE_CLASSIFICATION` | reconstructed severity |
| FULL_BRAKING / abuse classifications | `EPISODE_CLASSIFICATION` | separate threshold bands — CURRENT production |
| `HIGH_SPEED_BRAKING` | `EPISODE_CLASSIFICATION` | **subtype** of `BRAKING` — not raw observation |
| regen candidate · kinetic energy demand · thermal dose | `DERIVED_PHYSICS` | L3 features |

### Sequence / exposure (not raw channels of one maneuver)

- `STOP_GO_CYCLE` → `SEQUENCE_RELATION` / composite pattern over episodes
- preceding acceleration context → linked episode reference, not a raw brake channel

**Identity rule:** **one maneuver → one `BRAKING` base episode** (Appendix E).

---

## 26. Cornering Episode

**LTE_R1 today:** native `behavior.harshCornering` only — no HF yaw detector.

**Future:** yaw-rate kinematic demand + optional native validation.

**Identity rule:** one cornering maneuver → one `CORNERING` episode (native + yaw proxy channels).

---

## 27. Accel→Brake Reversal Episode

**Type:** `ACCEL_BRAKE_REVERSAL` (composite / sequence — not a third peer maneuver by default)

**Structure:** may reference `sourceAccelerationEpisodeId` + `sourceBrakingEpisodeId` + sequence context.

**Not:** automatic accel penalty + brake penalty + reversal penalty inside the same output dimension without an explicit later model decision.

---

## 28. Evidence Channel Model

### 28.1 Layered evidence taxonomy

| Layer | Purpose | Examples |
|-------|---------|----------|
| `OBSERVATION_CHANNEL` | Raw/reported/provider observation attached to episode | speed series, pedal, pressure, native event |
| `DERIVED_FEATURE` | Computed physics/kinematics from observations | decel, regen candidate, kinetic delta |
| `EPISODE_CLASSIFICATION` | Severity/subtype label on an episode | HARD/EXTREME, `HIGH_SPEED_BRAKING` |
| `SEQUENCE_RELATION` | Links episodes in time | accel→brake reversal, stop-go pattern |
| `EXPOSURE_STATE` | Interval/dose state | thermal exposure, powertrain load interval |

### 28.2 Observation channel classes

| Class | Examples |
|-------|----------|
| `MEASURED_DIRECT` | tire pressure, yaw (when available) |
| `REPORTED_STATE` | pedal, gear, battery power, speed |
| `PROVIDER_CLASSIFIED` | native behavior.* |
| `RECONSTRUCTED_KINEMATIC` | speed-derived decel/accel (derived feature source) |
| `DERIVED_PHYSICS` | regen candidate, wheel consistency proxy |
| `CONTEXT` | ambient, heading |
| `DIAGNOSTIC` | TPMS warning, DTC |
| `PROXY` | TPS as intent proxy |

**Per channel retain:** source · field/event · provider timestamp · receive timestamp (when available) · cadence class · quality · connection profile · powertrain applicability.

---

## 29. Source Precedence / Fallback

### 29.1 Fallback policy types

| Type | Meaning |
|------|---------|
| `EXACT_FALLBACK` | Same semantic, alternate path |
| `SEMANTIC_FALLBACK` | Close semantic — pending validation |
| `DEGRADED_PROXY` | Weaker physics stage |
| `CONTEXTUAL_FALLBACK` | Context-only substitute |
| `NO_VALID_FALLBACK` | Absence materially blocks use case |

### 29.2 Counts

| Fallback type | Count |
|---------------|------:|
| `EXACT_FALLBACK` | **1** | same semantic via alternate storage path for `speed` → `speedKmh` only |
| `SEMANTIC_FALLBACK` | **2** | OBD throttle ↔ engine TPS (pending); CurrentGear ↔ ActualGear (pending) |
| `DEGRADED_PROXY` | **5** | pressure→decel; pedal→decel; yaw→heading deriv; MAF/load proxies; warning→pressure context |
| `NO_VALID_FALLBACK` | **6** | hydraulic pressure, yaw, wheel speeds, four tire pressures as group, battery regen HF, native cornering on Smart5 |

Full matrix: Appendix C.

### 29.3 Confidence ceiling (qualitative)

| Fallback | Ceiling |
|----------|---------|
| direct hydraulic → speed-only braking | `MAJOR_DEGRADATION` for Brake Physics |
| throttle semantic fallback | `MINOR_DEGRADATION` pending validation |
| warning → pressure | `INSUFFICIENT_FOR_USE_CASE` for tire state (diagnostic only) |

---

## 30. Unit / Normalization Audit

Appendix F. Principles:

- **Raw unit retained** at L0 where known
- **Canonical normalized value** at L1 where required for physics

| Family | Provider unit | Normalized | Storage | Unknowns |
|--------|---------------|------------|---------|----------|
| Speed | km/h (assumed) | km/h, ms | VLS/HF km/h | provider unit not formally documented |
| Tire pressure | kPa | bar | VLS bar | legacy kPa-in-bar detection |
| Battery power | W | kW | VLS/HF kW | sign convention documented |
| Throttle/TPS | % | % | HF | scale equivalence unproven |
| Gear | enum/float | integer | HF partial | Park=126 on SelectedGear |
| Yaw | °/s in catalog | rad/s future | n/a | not acquired |

**Do not invent provider units.** Unknown → `UNKNOWN`.

---

## 31. Provenance Contract

Conceptual fields (documentation only — Phase 2F/2F.1 persistence decision):

`provider`, `connectionProfile`, `providerField`, `sourceType`, `providerTimestamp`, `receivedTimestamp`, `acquisitionPath`, `canonicalKey`, `normalizationVersion`, `episodeId`, `modelVersion`, `fallbackUsed`, `qualityFlags`

**Complete:** yes — contract defined; implementation deferred.

---

## 32. Powertrain Applicability

Canonical families tagged: `ALL_POWERTRAINS` · `ICE_ONLY` · `ELECTRIFIED_ONLY` · `PHEV_SPECIFIC` · `BEV_SPECIFIC` · `NOT_APPLICABLE`.

Examples: `CAN_ENGINE_RPM` ICE/PHEV combustion · `CAN_TRACTION_BATTERY_POWER` PHEV/BEV · `CAN_BRAKE_PRESSURE_*` all where exposed · tire pressure all.

Appendix B includes applicability column.

---

## 33. Connection Profile Scope

| Profile | Phase 2E stance |
|---------|-----------------|
| `DIMO_LTE_R1` | Primary validation target |
| `DIMO_SMART5` | `UNVERIFIED_UNTIL_PHASE_2G` — canonical semantics allowed, availability not |
| `DIMO_TESLA_DIRECT` | `UNVERIFIED_UNTIL_PHASE_2G` |
| High Mobility | `OUT_OF_SCOPE_PROVIDER` for Phase 2E — provider/OEM audit → **Phase 2H**; cross-provider canonical consolidation → **Phase 2I** |

---

## 34. Double-Counting Control

**RULE 1:** Evidence channels ≠ independent behavior penalties.

**RULE 2:** One physical episode → normally one episode identity.

**RULE 3:** Multiple signals improve confidence/feature richness without multiplying event count.

**RULE 4:** Different output domains may consume different features from the **same** episode — not cross-domain double counting.

**Within-domain double counting** = same physical evidence counted multiple times as independent exposure in one domain.

**Major risk groups:** `D2E-R06` braking multichannel · `D2E-R14` native vs reconstructed · deprecated counter pairs (`hardBrakingCount` vs `harshBrakeCount`).

---

## 35. Cross-Domain Shared Episodes

Example `BRAKING_EPISODE_123`:

| Domain | Feature consumed |
|--------|------------------|
| Driver Quality | smoothness, ramp, necessity/context |
| Vehicle Load | deceleration dynamic load |
| Brake Load | friction/thermal demand |
| Tire Load | longitudinal tire demand |

**Do NOT deduplicate across domains.** **Do deduplicate evidence channels within episode assembly per domain pathway.**

---

## 36. High-Timeframe Implications

Aggregations should operate on **episode features** (rates, distribution, tail, dose) — not re-count overlapping raw channels.

One hard braking maneuver remains **one episode** even if five underlying channels existed.

---

## 37. Legacy Impact Map

| Area | Classification | Notes |
|------|----------------|-------|
| Dual `DrivingEvent` vs `TripBehaviorEvent` | `CURRENT_DOUBLE_COUNTING_RISK` | LTE_R1 native + HF abuse |
| EXTREME HF 7.0 vs FULL_BRAKING 7.5 m/s² | `CURRENT_AMBIGUOUS` | overlapping severity bands |
| Native extremeAccel → HARSH_ACCELERATION enum | `LEGACY_SEMANTIC_DEBT` | taxonomy compression |
| Cornering native-only LTE_R1 | `FALLBACK_GAP` | Smart5 parity |
| TPS not queried while OBD throttle is | `CURRENT_REDUNDANCY_RISK` | parallel throttle unmigrated |
| Chassis brake/yaw/wheel catalog only | `PROVENANCE_GAP` | P31 prep unwired |
| LF maxSpeed vs HF speed | `CURRENT_AMBIGUOUS` | aggregate divergence |
| Tire kPa/bar legacy rows | `UNIT_AMBIGUITY` | detection exists |
| Battery sign convention | `CURRENT_SAFE` | documented + aligned |
| Speed alias lineage | `CURRENT_SAFE` | single DIMO field |
| Native event as sole LTE_R1 impact input | `CURRENT_REDUNDANCY_RISK` | vs reconstructed path |
| Gear Current vs Actual parallel | `CURRENT_AMBIGUOUS` | unpersisted Actual |
| DriverScore stress-only aggregation | `CURRENT_SAFE` | no multi-channel duplicate in score itself |

---

## 38. Phase 2F Handoff

Phase 2F designs **capability-first acquisition**. Phase 2E delivers:

- canonical signal registry (**33** keys)
- provisional source precedence + fallback matrix
- no-substitution rules
- required vs enrichment families (from Phase 2D tiers)
- cadence/use-case eligibility separation
- current acquisition path map
- powertrain + connection-profile uncertainty flags
- evidence/provenance requirements

**Does NOT deliver:** final query profiles · scheduler design · Flight Recorder manifest.

Appendix G.

---

## 39. Flight Recorder Implications (non-binding)

Advisory labels only — **not** Phase 2F.1 manifest.

| Label | Examples |
|-------|----------|
| `RAW_MUST_PRESERVE` | speed, native events, battery power, tire pressure |
| `CANONICAL_MUST_COMPUTE` | episode features, regen candidate |
| `EPISODE_EVIDENCE_MUST_PRESERVE` | braking multichannel when acquired |
| `CONTEXT_RECOMMENDED` | ambient, gear, thermal |
| `NOT_REQUIRED_FOR_REFERENCE` | commercial axle weights |

---

## 40. Findings

| ID | Severity | Finding |
|----|----------|---------|
| F2E-01 | P0 | Braking multichannel → `DOUBLE_COUNTING_RISK` without episode identity |
| F2E-02 | P0 | Native + HF reconstructed coexist on LTE_R1 → duplicate event pathways |
| F2E-03 | P1 | Throttle parallel fields unconsolidated — must stay `PENDING_EQUIVALENCE` |
| F2E-04 | P1 | Gear parallel fields — semantic equivalence unproven |
| F2E-05 | P1 | Hydraulic brake family 0/4 — canonical design ahead of acquisition |
| F2E-06 | P1 | Cornering Smart5 gap — native-only vs reconstructed policy required |
| F2E-07 | P2 | Torque vs torque-% — complementary, not interchangeable; DERIVABLE_ONLY_IF_REFERENCE_BASIS_KNOWN |
| F2E-08 | P2 | Wheel speed vs vehicle speed — slip proxy naming debt |
| F2E-09 | P2 | Warning vs pressure — diagnostic cannot replace state |
| F2E-10 | P2 | Temperature domains must remain separate |
| F2E-11 | P2 | Provenance contract defined but not persisted uniformly |
| F2E-12 | P3 | Legacy counter field pairs deprecated but still referenced in places |

---

## 41. Decisions

24 decisions **`D2E-D001`…`D2E-D024`** — Appendix H summary:

- D001 Throttle/TPS: parallel keys, pending equivalence, no averaging
- D002 Gear: semantic separation Actual/Selected/Ratio
- D003 CurrentGear vs ActualGear: pending validation
- D004 Brake episode: one identity, multichannel evidence
- D005 Hydraulic circuits: `CIRCUIT_COMPLEMENT`; dual retain, no double count
- D006 Native events: evidence not identity
- D007 Smart5: reconstructed required, native optional
- D008 Speed: single canonical, alias lineage only
- D009 Regen: REGEN_CANDIDATE derived, not raw semantic
- D010 Tire pressure positional complement
- D011 TPMS warning diagnostic only
- D012 Wheel speed positional complement
- D013 Yaw vs heading not comparable
- D014 Cross-domain episode reuse allowed
- D015 TEMPORAL_USABILITY separate from semantics
- D016 LTE_R1 current thresholds documented as CURRENT
- D017 NO_VALID_FALLBACK set for six families
- D018 Provenance contract fields frozen conceptually
- D019 HF braking merge 1.5s = CURRENT not canonical
- D020 Driver Quality consumes features not channels
- D021 Vehicle Load anti-correlation-multiplication rule
- D022 Brake Load energy chain from episode not channels
- D023 Tire Load ≠ pressure alone
- D024 Phase 2F acquisition must use eligibility rules

---

## 42. Exit Criteria

| Criterion | Status |
|-----------|--------|
| All Phase-2D handoff groups classified | ✓ |
| Layer model complete | ✓ |
| Canonical registry complete (**33** keys, Appendix B authority) | ✓ |
| Episode taxonomy separated (base / composite / exposure / context) | ✓ |
| Torque vs torque-% not interchangeable | ✓ |
| Brake circuits `CIRCUIT_COMPLEMENT`, not positional | ✓ |
| Observation vs derived feature explicit | ✓ |
| Episode invariants A–F documented | ✓ |
| Speed alias / unit / aggregate semantics separated | ✓ |
| High Mobility → 2H / 2I pointer correct | ✓ |
| No unsupported aliases introduced | ✓ |
| Throttle ≠ accelerator preserved | ✓ |
| Gear semantics distinct | ✓ |
| Brake evidence hierarchy complete | ✓ |
| Circuits not double-counted | ✓ |
| Tire position semantics preserved | ✓ |
| Warning vs pressure separated | ✓ |
| Wheel vs vehicle speed separated | ✓ |
| Yaw/heading separated | ✓ |
| Battery vs regen separated | ✓ |
| Temperatures not collapsed | ✓ |
| Native vs reconstructed policy complete | ✓ |
| PHYSICAL_EPISODE_IDENTITY defined | ✓ |
| Episode evidence/dedup model complete | ✓ |
| Fallback classes complete | ✓ |
| Source authority classes complete | ✓ |
| Unit/normalization audit complete | ✓ |
| Provenance contract complete | ✓ |
| Acquisition lineage mapped | ✓ |
| Double-counting rules complete | ✓ |
| Cross-domain shared episode rule explicit | ✓ |
| Phase 2F handoff complete | ✓ |
| No production implementation | ✓ |

**Phase 2E: DONE**

---

# Appendices

## Appendix A — Redundancy Group Registry

| ID | Group | Fields / channels | Relationship | Canonical semantic(s) | Fallback policy | Double-count risk | Validation | 2F implication |
|----|-------|-------------------|--------------|----------------------|-----------------|---------------|------------|----------------|
| D2E-R01 | THROTTLE_PARALLEL | `obdThrottlePosition`, `powertrainCombustionEngineTPS` | PENDING_EQUIVALENCE | `CAN_ENGINE_THROTTLE_POSITION`, `CAN_ENGINE_TPS` | SEMANTIC_FALLBACK pending | MODERATE | Runtime throttle equivalence | Query both when capable |
| D2E-R02 | GEAR_PARALLEL | Current/Actual/Selected/Ratio | PENDING_EQUIVALENCE + COMPLEMENTARY | `CAN_TRANSMISSION_*` | NO_SUBSTITUTION | LOW | Time-aligned gear audit | HF profile expansion |
| D2E-R03 | TORQUE_LOAD_CLUSTER | RPM, load, torque, %, MAF, TPS | COMPLEMENTARY | distinct CAN keys | CONTEXTUAL only | MODERATE if collapsed | Powertrain validation | Keep all in HF tier |
| D2E-R04 | BRAKE_PEDAL | pressed, position | COMPLEMENTARY | pedal state/position | DEGRADED→decel | LOW | Hydraulic era | Acquire when 2F enables |
| D2E-R05 | BRAKE_PRESSURE_CIRCUITS | C1, C2 | CIRCUIT_COMPLEMENT | `CAN_BRAKE_PRESSURE_C1/C2` | retain both | **HIGH** if double-weighted | Agreement audit | Tier A acquisition |
| D2E-R06 | BRAKING_MULTICHANNEL | native, speed, pedal, pressure, derived decel/classifications | CAUSAL_CHAIN + PROVIDER + DERIVED | `BRAKING` base episode | hierarchy §15 | **HIGH** | Episode matching | Episode engine |
| D2E-R07 | WHEEL_SPEED_PAIR | FL, FR | POSITIONAL_COMPLEMENT | `CAN_WHEEL_SPEED_FL/FR` | both retain | LOW | Consistency proxy | Tier A when enabled |
| D2E-R08 | WHEEL_VS_VEHICLE_SPEED | wheel speeds, vehicle speed | CAUSAL_CHAIN | speed + consistency proxy | NO slip substitution | MODERATE | Slip model OOS | Separate canonical keys |
| D2E-R09 | YAW_HEADING_TRAJECTORY | yaw, heading, GPS | NOT_COMPARABLE | `CAN_YAW_RATE`, `CAN_LOCATION_HEADING` | DEGRADED heading deriv | MODERATE | Cadence/sync | Yaw acquisition |
| D2E-R10 | TIRE_PRESSURE_POSITIONAL | FL, FR, RL, RR | POSITIONAL_COMPLEMENT | four CAN keys | none | LOW | Imbalance features | Snapshot+history |
| D2E-R11 | TIRE_PRESSURE_VS_WARNING | pressures, warning | AGGREGATE_DIAGNOSTIC | pressure primary | DIAGNOSTIC fallback | MODERATE | Warning semantics | Keep both |
| D2E-R12 | BATTERY_POWER_REGEN | traction power, decel, brake | DERIVED_FROM + COMPLEMENTARY | `CAN_TRACTION_BATTERY_POWER`, `REGEN_CANDIDATE` | NO_VALID_FALLBACK for split | MODERATE | Regen validation | PHEV/BEV tier |
| D2E-R13 | TEMPERATURES | ambient, coolant, oil, intake, trans | COMPLEMENTARY / CONTEXT | separate CAN keys | NO cross-substitution | LOW | Plausibility later | Context tier |
| D2E-R14 | NATIVE_VS_RECONSTRUCTED | behavior.*, HF detectors | PROVIDER vs RECONSTRUCTED | episode attachment | profile-specific | **HIGH** | Smart5 parity | Dual-path policy |
| D2E-R15 | ACCEL_MULTICHANNEL | native accel, HF accel, TPS/RPM | CAUSAL_CHAIN | `ACCELERATION` base episode | hierarchy | **HIGH** | Episode matching | Episode engine |
| D2E-R16 | SPEED_ALIASES | speed, speedKmh, speedMs, maxSpeedKmh | EXACT_ALIAS + UNIT_REPRESENTATION + AGGREGATE | `CAN_VEHICLE_SPEED` | path selection only | LOW | LF vs HF peaks | Single provider field |

---

## Appendix B — Canonical Signal Registry Matrix (count authority)

**Invariant:** `CANONICAL_SIGNAL_COUNT = COUNT(DISTINCT fully-expanded CAN_* keys in this appendix)` = **33**.

| Enum | Canonical key | Physical semantic | Provider field(s) | Relation | Current path | Powertrain | Preferred authority | Fallback | Validation | Use cases |
|------|---------------|-------------------|-------------------|----------|--------------|------------|---------------------|----------|------------|-----------|
| CAN-001 | `CAN_VEHICLE_SPEED` | Vehicle speed | `speed` | EXACT_ALIAS_LINEAGE | SNAPSHOT+HF+ACTIVE_TRIP | ALL | CANONICAL_PRIMARY_IF_VALIDATED | NONE | PROVISIONAL | detectors, impact, health |
| CAN-002 | `CAN_YAW_RATE` | Body yaw rate | `angularVelocityYaw` | — | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | heading deriv DEGRADED | UNVALIDATED | cornering proxy |
| CAN-003 | `CAN_WHEEL_SPEED_FL` | Front-left wheel speed | `chassisAxleRow1WheelLeftSpeed` | POSITIONAL_COMPLEMENT | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | NONE | UNVALIDATED | consistency proxy |
| CAN-004 | `CAN_WHEEL_SPEED_FR` | Front-right wheel speed | `chassisAxleRow1WheelRightSpeed` | POSITIONAL_COMPLEMENT | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | NONE | UNVALIDATED | consistency proxy |
| CAN-005 | `CAN_ENGINE_THROTTLE_POSITION` | OBD throttle position % | `obdThrottlePosition` | PENDING_EQUIVALENCE vs TPS | HF_POST_TRIP | ICE/PHEV | CANONICAL_PRIMARY_IF_VALIDATED | TPS SEMANTIC pending | PROVISIONAL | accel context |
| CAN-006 | `CAN_ENGINE_TPS` | Engine-reported TPS % | `powertrainCombustionEngineTPS` | PENDING_EQUIVALENCE vs OBD | NONE | ICE/PHEV | COMPLEMENTARY_EVIDENCE | OBD primary today | UNVALIDATED | future proxy |
| CAN-007 | `CAN_ENGINE_RPM` | Engine rotational speed | `powertrainCombustionEngineSpeed` | COMPLEMENTARY | HF_POST_TRIP | ICE/PHEV | CANONICAL_PRIMARY_IF_VALIDATED | NONE | PROVISIONAL | load context |
| CAN-008 | `CAN_ENGINE_LOAD` | Normalized engine load % | `obdEngineLoad` | COMPLEMENTARY | HF_POST_TRIP+SNAPSHOT | ICE/PHEV | CANONICAL_PRIMARY_IF_VALIDATED | NONE | PROVISIONAL | VLS/HF |
| CAN-009 | `CAN_ENGINE_TORQUE` | Reported engine torque | `powertrainCombustionEngineTorque` | COMPLEMENTARY | HF_POST_TRIP | ICE/PHEV | CANONICAL_PRIMARY_IF_VALIDATED | NO percent substitute | UNVALIDATED | powertrain load |
| CAN-010 | `CAN_ENGINE_TORQUE_PERCENT` | Reported torque percent | `powertrainCombustionEngineTorquePercent` | COMPLEMENTARY; DERIVABLE_ONLY_IF_REFERENCE_BASIS_KNOWN | HF_POST_TRIP | ICE/PHEV | COMPLEMENTARY_EVIDENCE | NO Nm substitution | UNVALIDATED | validation/context |
| CAN-011 | `CAN_ENGINE_MAF` | Air mass flow | `powertrainCombustionEngineMAF` | COMPLEMENTARY | NONE | ICE/PHEV | CANONICAL_PRIMARY_IF_VALIDATED | load proxy DEGRADED | UNVALIDATED | vehicle load |
| CAN-012 | `CAN_TRANSMISSION_CURRENT_GEAR` | Transmission current gear | `powertrainTransmissionCurrentGear` | PENDING_EQUIVALENCE vs Actual | HF_POST_TRIP | ALL | PROVISIONAL_REQUIRES_RUNTIME_VALIDATION | Actual pending | UNVALIDATED | load context |
| CAN-013 | `CAN_TRANSMISSION_ACTUAL_GEAR` | Transmission actual gear | `powertrainTransmissionActualGear` | PENDING_EQUIVALENCE vs Current | NONE | ALL | COMPLEMENTARY_EVIDENCE | Current provisional | UNVALIDATED | shift validation |
| CAN-014 | `CAN_TRANSMISSION_SELECTED_GEAR` | Transmission selected gear | `powertrainTransmissionSelectedGear` | COMPLEMENTARY | NONE | ALL | COMPLEMENTARY_EVIDENCE | NONE | UNVALIDATED | shift context |
| CAN-015 | `CAN_TRANSMISSION_GEAR_RATIO` | Transmission gear ratio | `powertrainTransmissionActualGearRatio` | COMPLEMENTARY | NONE | ALL | COMPLEMENTARY_EVIDENCE | NONE | UNVALIDATED | ratio context |
| CAN-016 | `CAN_TRANSMISSION_TEMPERATURE` | Transmission temperature | `powertrainTransmissionTemperature` | — | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | NONE cross-domain | UNVALIDATED | thermal exposure |
| CAN-017 | `CAN_BRAKE_PEDAL_STATE` | Brake pedal switch | `chassisBrakeIsPedalPressed` | COMPLEMENTARY | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | decel DEGRADED | UNVALIDATED | brake demand |
| CAN-018 | `CAN_BRAKE_PEDAL_POSITION` | Brake pedal position | `chassisBrakePedalPosition` | COMPLEMENTARY | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | decel DEGRADED | UNVALIDATED | brake shape |
| CAN-019 | `CAN_BRAKE_PRESSURE_C1` | Hydraulic brake circuit 1 | `chassisBrakeCircuit1PressurePrimary` | CIRCUIT_COMPLEMENT | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | decel MAJOR DEGRADED | UNVALIDATED | brake physics |
| CAN-020 | `CAN_BRAKE_PRESSURE_C2` | Hydraulic brake circuit 2 | `chassisBrakeCircuit2PressurePrimary` | CIRCUIT_COMPLEMENT | NONE | ALL | CANONICAL_PRIMARY_IF_VALIDATED | decel MAJOR DEGRADED | UNVALIDATED | brake physics |
| CAN-021 | `CAN_TIRE_PRESSURE_FL` | Tire pressure FL | `chassisAxleRow1WheelLeftTirePressure` | POSITIONAL_COMPLEMENT | SNAPSHOT | ALL | CANONICAL_PRIMARY_IF_VALIDATED | warning DIAG only | PROVISIONAL | tire health |
| CAN-022 | `CAN_TIRE_PRESSURE_FR` | Tire pressure FR | `chassisAxleRow1WheelRightTirePressure` | POSITIONAL_COMPLEMENT | SNAPSHOT | ALL | CANONICAL_PRIMARY_IF_VALIDATED | warning DIAG only | PROVISIONAL | tire health |
| CAN-023 | `CAN_TIRE_PRESSURE_RL` | Tire pressure RL | `chassisAxleRow2WheelLeftTirePressure` | POSITIONAL_COMPLEMENT | SNAPSHOT | ALL | CANONICAL_PRIMARY_IF_VALIDATED | warning DIAG only | PROVISIONAL | tire health |
| CAN-024 | `CAN_TIRE_PRESSURE_RR` | Tire pressure RR | `chassisAxleRow2WheelRightTirePressure` | POSITIONAL_COMPLEMENT | SNAPSHOT | ALL | CANONICAL_PRIMARY_IF_VALIDATED | warning DIAG only | PROVISIONAL | tire health |
| CAN-025 | `CAN_TIRE_WARNING_STATE` | TPMS warning aggregate | `chassisTireSystemIsWarningOn` | AGGREGATE_DIAGNOSTIC | SNAPSHOT | ALL | DIAGNOSTIC_ONLY | not pressure substitute | PROVISIONAL | tire diagnostic |
| CAN-026 | `CAN_TRACTION_BATTERY_POWER` | Traction battery power | `powertrainTractionBatteryCurrentPower` | — | SNAPSHOT+HF_POST_TRIP | PHEV/BEV | CANONICAL_PRIMARY_IF_VALIDATED | NO_VALID_FALLBACK | PROVISIONAL | regen candidate input |
| CAN-027 | `CAN_TRACTION_BATTERY_SOC` | Traction battery SOC | `powertrainTractionBatteryStateOfChargeCurrent` | CONTEXT | SNAPSHOT+HF_POST_TRIP | PHEV/BEV | CONTEXT_ONLY | — | PROVISIONAL | energy context |
| CAN-028 | `CAN_AMBIENT_TEMPERATURE` | Ambient/exterior temperature | `exteriorAirTemperature` | CONTEXT | HF_POST_TRIP (+ env query) | ALL | CONTEXT_ONLY | NONE cross | PROVISIONAL | thermal context |
| CAN-029 | `CAN_COOLANT_TEMPERATURE` | Engine coolant / ECT | `powertrainCombustionEngineECT` | — | SNAPSHOT+HF_POST_TRIP | ICE/PHEV | CANONICAL_PRIMARY_IF_VALIDATED | NONE cross | PROVISIONAL | thermal |
| CAN-030 | `CAN_OIL_TEMPERATURE` | Engine oil temperature | `obdOilTemperature` | — | SNAPSHOT | ICE/PHEV | CANONICAL_PRIMARY_IF_VALIDATED | NONE cross | PROVISIONAL | thermal |
| CAN-031 | `CAN_INTAKE_TEMPERATURE` | Intake air temperature | `obdIntakeTemp` | CONTEXT | SNAPSHOT | ICE/PHEV | CONTEXT_ONLY | — | PROVISIONAL | context |
| CAN-032 | `CAN_LOCATION_HEADING` | Location heading | `currentLocationHeading` | NOT_COMPARABLE vs yaw | SNAPSHOT | ALL | CONTEXT_ONLY | yaw DEGRADED | PROVISIONAL | context |
| CAN-033 | `CAN_ALTITUDE` | Location altitude | `currentLocationAltitude` | CONTEXT | HF_POST_TRIP | ALL | CONTEXT_ONLY | — | PROVISIONAL | grade context |

### Expanded enumeration (deterministic)

- **CAN-001** `CAN_VEHICLE_SPEED`
- **CAN-002** `CAN_YAW_RATE`
- **CAN-003** `CAN_WHEEL_SPEED_FL`
- **CAN-004** `CAN_WHEEL_SPEED_FR`
- **CAN-005** `CAN_ENGINE_THROTTLE_POSITION`
- **CAN-006** `CAN_ENGINE_TPS`
- **CAN-007** `CAN_ENGINE_RPM`
- **CAN-008** `CAN_ENGINE_LOAD`
- **CAN-009** `CAN_ENGINE_TORQUE`
- **CAN-010** `CAN_ENGINE_TORQUE_PERCENT`
- **CAN-011** `CAN_ENGINE_MAF`
- **CAN-012** `CAN_TRANSMISSION_CURRENT_GEAR`
- **CAN-013** `CAN_TRANSMISSION_ACTUAL_GEAR`
- **CAN-014** `CAN_TRANSMISSION_SELECTED_GEAR`
- **CAN-015** `CAN_TRANSMISSION_GEAR_RATIO`
- **CAN-016** `CAN_TRANSMISSION_TEMPERATURE`
- **CAN-017** `CAN_BRAKE_PEDAL_STATE`
- **CAN-018** `CAN_BRAKE_PEDAL_POSITION`
- **CAN-019** `CAN_BRAKE_PRESSURE_C1`
- **CAN-020** `CAN_BRAKE_PRESSURE_C2`
- **CAN-021** `CAN_TIRE_PRESSURE_FL`
- **CAN-022** `CAN_TIRE_PRESSURE_FR`
- **CAN-023** `CAN_TIRE_PRESSURE_RL`
- **CAN-024** `CAN_TIRE_PRESSURE_RR`
- **CAN-025** `CAN_TIRE_WARNING_STATE`
- **CAN-026** `CAN_TRACTION_BATTERY_POWER`
- **CAN-027** `CAN_TRACTION_BATTERY_SOC`
- **CAN-028** `CAN_AMBIENT_TEMPERATURE`
- **CAN-029** `CAN_COOLANT_TEMPERATURE`
- **CAN-030** `CAN_OIL_TEMPERATURE`
- **CAN-031** `CAN_INTAKE_TEMPERATURE`
- **CAN-032** `CAN_LOCATION_HEADING`
- **CAN-033** `CAN_ALTITUDE`

---

## Appendix C — Source Precedence Matrix

| Canonical semantic | Candidate source | Authority class | When eligible | When rejected | Fallback relation | Confidence implication |
|--------------------|------------------|-----------------|---------------|---------------|-------------------|------------------------|
| Engine throttle | `obdThrottlePosition` | PRIMARY provisional | HF fresh non-null | unit unknown | TPS semantic pending | baseline |
| Engine throttle | `powertrainCombustionEngineTPS` | COMPLEMENTARY | when acquired | unvalidated equivalence | semantic pending | validation enrich |
| Transmission gear | `CurrentGear` | PROVISIONAL | HF path | not persisted | Actual pending | low |
| Transmission gear | `ActualGear` | COMPLEMENTARY | when acquired | equivalence unproven | Current pending | validation |
| Braking intensity | hydraulic C1/C2 | PRIMARY if validated | waveform use cases | cadence poor | decel DEGRADED | HIGH→MAJOR drop |
| Braking intensity | speed decel | RECONSTRUCTED | HF 1s clean | 30s-only | DEGRADED_PROXY | MATERIAL degradation |
| Braking episode | native behavior.* | PROVIDER_CLASSIFIED | LTE_R1 | Smart5 alone | reconstructed required | profile-specific |
| Braking episode | HF detector | RECONSTRUCTED | SMART5/HF | sparse native | native validates | profile-specific |
| Regen split | battery power + decel | DERIVED | synchronized PHEV/BEV | missing power | NO_VALID_FALLBACK | INSUFFICIENT |
| Tire state | four pressures | PRIMARY | snapshot fresh | missing | warning DIAG only | MAJOR if warning-only |
| Cornering | native harshCornering | PROVIDER | LTE_R1 | no native | yaw future | Smart5 gap |
| Yaw rate | `angularVelocityYaw` | PRIMARY if validated | dynamic use cases | not acquired | heading DEGRADED | MAJOR |

---

## Appendix D — Episode Evidence Matrix

| Episode type | Evidence channel | Directness | Role | Onset | Severity | Shape | Validation | Double-count |
|--------------|------------------|------------|------|:-----:|:--------:|:-----:|------------|:------------:|
| BRAKING | native harsh/extreme | PROVIDER | classify | partial | yes | partial | validate recon | **HIGH** |
| BRAKING | speed decel | RECONSTRUCTED | response | yes | yes | partial | primary Smart5 | **HIGH** |
| BRAKING | pedal state/pos | REPORTED | demand | yes | partial | yes | enrich | **HIGH** |
| BRAKING | pressure C1/C2 | REPORTED | hydraulic | yes | yes | yes | primary BK | **HIGH** if split |
| BRAKING | battery power | REPORTED | energy | partial | partial | partial | regen | MODERATE |
| ACCELERATION | HF accel | RECONSTRUCTED | primary Smart5 | yes | yes | partial | — | **HIGH** |
| ACCELERATION | native harsh/extreme | PROVIDER | LTE_R1 | partial | yes | partial | — | **HIGH** |
| ACCELERATION | TPS/RPM/torque | REPORTED | context | partial | partial | partial | load | LOW |
| CORNERING | native harshCornering | PROVIDER | LTE_R1 | partial | yes | partial | — | MODERATE |
| CORNERING | yaw proxy | DERIVED | future | yes | yes | partial | unvalidated | MODERATE |
| ACCEL_BRAKE_REVERSAL | linked accel+brake | DERIVED | sequence | yes | yes | yes | context | **HIGH** |

---

## Appendix E — Physical Episode Dedup Map

| Physical episode | Observed channels | Canonical episode count | Rule |
|------------------|-------------------|------------------------:|------|
| One braking maneuver | native + speed + pedal + C1 + C2 + derived classifications | **1** | `PHYSICAL_EPISODE_IDENTITY` |
| Stop-go pattern | multiple base episodes linked | **1** `STOP_GO_CYCLE` composite | sequence, not raw brake channel |
| One acceleration | native + HF accel + TPS context | **1** | same |
| One corner | native + yaw (future) | **1** | same |
| Accel→brake reversal | accel episode + brake episode linked | **1** reversal episode | sequence linkage |
| Two circuits same brake | C1 + C2 pressure | **1** hydraulic evidence object | not 2 loads |
| Four tire pressures | FL+FR+RL+RR | **4** state signals, **0–1** pressure exposure episodes | positional |

---

## Appendix F — Unit / Normalization Matrix

| Canonical key | Provider unit | Normalized unit | Storage unit | Physics use | Status |
|---------------|---------------|-----------------|--------------|---------------|--------|
| CAN_VEHICLE_SPEED | km/h assumed | km/h, m/s | km/h | m/s | PROVISIONAL |
| CAN_TIRE_PRESSURE_* | kPa | bar | bar | bar | PROVISIONAL + legacy detect |
| CAN_TRACTION_BATTERY_POWER | W | kW | kW | kW signed | DOCUMENTED |
| CAN_ENGINE_THROTTLE_POSITION | % | % | % | 0–100 | PROVISIONAL |
| CAN_ENGINE_TPS | % | % | — | 0–100 | UNVALIDATED equiv |
| CAN_BRAKE_PRESSURE_* | UNKNOWN bar? | bar pending | — | Pa/bar | UNKNOWN |
| CAN_YAW_RATE | deg/s catalog | rad/s target | — | rad/s | UNKNOWN |
| CAN_TRANSMISSION_* | enum | integer | partial | gear int | PROVISIONAL |

---

## Appendix G — Phase 2F Handoff Matrix

| Handoff item | Phase 2E deliverable | 2F action |
|--------------|---------------------|-----------|
| Tier A signals (yaw, wheel, brake, battery) | canonical keys + NONE path | design acquisition tier |
| Throttle parallel | precedence + pending equivalence | optional dual query |
| Gear parallel | semantic separation | capability-gated HF expansion |
| Braking episode | identity + dedup rules | episode builder + native/HF policy |
| Provenance contract | field list | persistence design |
| NO_VALID_FALLBACK list | six families | do not proxy in manifest |
| Cadence eligibility | Phase 2D classes | profile intervals |
| Connection profile | LTE_R1 primary | Smart5/Tesla later |

---

## Appendix H — Decision Ledger

| ID | Problem | Decision | Confidence | Not claimed | Runtime validation | 2F consequence | 3 consequence |
|----|---------|----------|------------|-------------|-------------------|----------------|---------------|
| D2E-D001 | Parallel throttle fields | Separate CAN keys; OBD primary today; TPS complementary | PROVISIONAL | Pedal equivalence | Throttle A/B correlation | Optional dual acquire | Ground truth |
| D2E-D002 | Parallel gear fields | Distinct Actual/Selected/Ratio semantics | HIGH semantic | Current=Actual | Time-aligned compare | HF expansion | Validation |
| D2E-D003 | CurrentGear vs ActualGear | PENDING_EQUIVALENCE | LOW | Interchangeable | RP-35 style audit | Don't merge queries | — |
| D2E-D004 | Braking multichannel | One BRAKING episode | HIGH architecture | Channel=offense | Episode matcher | Episode engine | Scoring |
| D2E-D005 | Dual brake circuits | `CIRCUIT_COMPLEMENT`; retain C1+C2 in one hydraulic evidence object | HIGH | Independent maneuvers / spatial positions | Agreement study | Both in manifest | BK validation |
| D2E-D006 | Native events | Evidence attachment | HIGH | Ground truth | Smart5 parity test | Profile policy | Reference drive |
| D2E-D007 | Smart5 no native | Reconstructed primary | HIGH policy | LTE_R1 parity | 2G audit | HF required | 3C gate |
| D2E-D008 | Speed aliases | Single CAN_VEHICLE_SPEED | HIGH | Multiple physics sources | LF vs HF peaks | One query field | Sync test |
| D2E-D009 | Battery power sign | Positive=in; REGEN_CANDIDATE derived | HIGH sign | All positive=regen | Regen split validation | Preserve sign | 3A manifest |
| D2E-D010 | Four tire pressures | Positional complement | HIGH | Redundant duplicates | Imbalance features | 4-key snapshot | Tire validation |
| D2E-D011 | TPMS warning | DIAGNOSTIC_ONLY | HIGH | =low pressure | OEM semantics | Keep warning | Diagnostic |
| D2E-D012 | Wheel speed pair | Positional complement | HIGH | Slip ratio | Consistency proxy | FL/FR acquire | — |
| D2E-D013 | Yaw vs heading | NOT_COMPARABLE | HIGH | Equivalence | Cadence/sync | Yaw tier A | Cornering GT |
| D2E-D014 | Cross-domain reuse | Same episode, different features | HIGH | Cross-domain dedup | Domain feature design | Allowed | Scoring model |
| D2E-D015 | Cadence vs semantics | Separate quality dimensions | HIGH | Bad cadence=bad semantics | Sampling invariance | Profile design | Phase 3 |
| D2E-D016 | Production windows | Document as CURRENT | HIGH | Canonical thresholds | Flight Recorder | Don't copy blindly | Validation |
| D2E-D017 | NO_VALID_FALLBACK set | Six families listed §29 | HIGH | Proxy substitution | Acquisition first | Manifest required set | Insufficient data |
| D2E-D018 | Provenance | Conceptual contract §31 | HIGH | Implemented | 2F persistence | Storage schema | Traceability |
| D2E-D019 | HF merge gaps | CURRENT 1.5s/2s/5s | MEDIUM | Optimal windows | Tuning study | Config later | — |
| D2E-D020 | Driver Quality | Features not channels | HIGH | Six penalties | Episode features | DQ redesign | — |
| D2E-D021 | Vehicle Load | Anti-collapse cluster | HIGH | One stress signal | Feature separation | HF cluster keep | — |
| D2E-D022 | Brake Load | Episode energy chain | HIGH | Channel count | Energy validation | BK pipeline | — |
| D2E-D023 | Tire Load | Pressure≠load | HIGH | Pressure-only load | Motion fusion | Context acquire | — |
| D2E-D024 | 2F acquisition | Eligibility rules not boolean | HIGH | Field exists=use | Capability manifest | Profile tiers | — |

---

**Verified constants (derived from appendices)**

```
CANONICAL_SIGNAL_COUNT = 33
REDUNDANCY_GROUP_COUNT = 16
BASE_MANEUVER_EPISODE_COUNT = 3
COMPOSITE_SEQUENCE_EPISODE_COUNT = 2
EXPOSURE_STATE_EPISODE_COUNT = 2
CONTEXT_CLASSIFICATION_COUNT = 1
DECISION_COUNT = 24
EXACT_ALIAS_COUNT = 1
PENDING_EQUIVALENCE_COUNT = 2
POSITIONAL_COMPLEMENT_GROUP_COUNT = 2
CIRCUIT_COMPLEMENT_GROUP_COUNT = 1
CAUSAL_CHAIN_COMPLEMENT_GROUP_COUNT = 3
NO_SUBSTITUTION_GROUP_COUNT = 4
NO_VALID_FALLBACK_COUNT = 6
SEMANTIC_FALLBACK_COUNT = 2
DEGRADED_PROXY_COUNT = 5
EXACT_FALLBACK_COUNT = 1
```

**Phase 2E: DONE** · **Phase 2F: NEXT** · **Phase 2F.1: NOT_STARTED** · **Phase 3A: GATED_ON_LTE_R1_MANIFEST**
