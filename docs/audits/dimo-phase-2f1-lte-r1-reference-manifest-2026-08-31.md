# DIMO Phase 2F.1 — LTE_R1 Reference / Flight Recorder Manifest Freeze

**Date:** 2026-08-31  
**Status:** DONE (frozen reference contract; no production implementation)  
**Scope:** `DIMO_LTE_R1` reference capture manifest · timestamp contract · native-event contract · Ground Truth sync · probe reclassification  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Machine-readable artifact:** `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json`  
**Phase gate:** Phase 2F.1 **DONE** (v1.1.0 broad-capture amendment) · Phase 3A **READY_TO_START_IMPLEMENTATION** · reference drive **NOT_READY_FOR_REFERENCE_DRIVE**

---

## 1. Executive Summary

Phase 2F.1 **freezes** the **`DIMO_LTE_R1` reference manifest** — the normative capture contract for Phase 3A Flight Recorder / reference-program work. This phase produces **documentation and a frozen JSON contract only**. It does **not** implement the Flight Recorder, run reference drives, modify query builders, or execute runtime probes.

| Metric | Value | Evidence |
|--------|------:|----------|
| Connection profile | **`DIMO_LTE_R1`** only | Master Plan §1.6 |
| Manifest version | **`1.1.0`** (broad-capture amendment) | JSON artifact |
| **Canonical analysis set (`CAN_*`)** | **33** keys | Phase 2E Appendix B — **not** full observation universe |
| **Minimum reference set** | **17** canonical keys | Pareto fallback when broad capture unavailable |
| **Broad reference observation set** | **Dynamic per vehicle** | Capability-discovered provider fields — **not** hard-coded 33 or 117 |
| Global DIMO schema reference | **117** fields | Phase 2C — **not** continuously polled @ 1 Hz |
| Four-vehicle union observed | **33** fields | Phase 2B — example only (N₁≠N₂) |
| Optional high-value canonical extensions | **14** keys | CAN-33 prioritization — non-listed available fields still captured in broad mode |
| Native-event contract | **Frozen** | Known analysis set + **broad provider event observation** |
| Timestamp contract | **Frozen** | Receive-time requirement explicit |
| Raw + normalized + **unmapped provider** retention | **Frozen** | `DIMO::<field>` when `canonicalKey=null` |
| Ground Truth sync contract | **Frozen** | Phase 3A input |
| Runtime probes reclassified | **47** | A/B/C/D taxonomy |
| Production code changed | **0** | Docs + JSON only |

**Canonical phase separation (corrected from Phase 2F §22–23):**

| Phase | Role |
|-------|------|
| **2F** | Capability-first acquisition **architecture** (VCM, tiers, planner design) |
| **2F.1** | **Freeze** LTE_R1 reference manifest + capture contracts |
| **3A** | **Implement** Flight Recorder / reference program **using** frozen manifest |

---

## 2. Scope & Authorities

### 2.1 In scope

- Two-layer manifest: **`CANONICAL_ANALYSIS_SET`** (33) + **`BROAD_REFERENCE_OBSERVATION_SET`** (dynamic per vehicle)
- Per-signal normative contract for all 33 `CAN_*` keys (analysis layer)
- Unmapped provider retention · broad native events · segment observation policies
- Capture class taxonomy
- Timestamp, raw/normalized retention, native-event, GT sync contracts
- Powertrain overlays (ICE gasoline, ICE diesel, PHEV, BEV)
- Driver Quality / Vehicle Load / Brake Physics / Tire Dynamic Load evidence requirements
- Runtime probe backlog reclassification (47 items)
- Phase 2F §22–23 consistency correction
- Master Plan gate update

### 2.2 Out of scope (non-goals)

- Flight Recorder implementation · reference drives · live vehicle probes
- Query builder / scheduler / worker changes · DB migrations · ClickHouse
- Scoring / detector implementation · Smart5 / Tesla / HM audits
- Phase 3A execution

### 2.3 Authority stack

1. Master Plan (phase boundaries)  
2. Phase 2A–2F audits  
3. Phase 2E canonical registry (33 keys)  
4. Phase 2F acquisition architecture  
5. Four LTE_R1 vehicle inventories (observation states only)  
6. This document + JSON artifact  

---

## 3. North Star & Reference Pipeline (Preserved)

```
RAW PROVIDER OBSERVATION → CANONICAL SIGNAL (CAN_*) → PHYSICAL EPISODE → CANONICAL FEATURE
→ independent domains: Driver Quality · Vehicle Load · Brake Physics · Tire Dynamic Load
+ orthogonal Data Confidence / Assessability
```

**Phase 3A reference-program pipeline (distinct from production acquisition):**

```
DISCOVER EVERYTHING AVAILABLE → CAPTURE BROAD → CHARACTERIZE → CANONICALIZE
→ RECONSTRUCT → VALIDATE → SELECT FEATURES → SCORE
```

The **33 `CAN_*` keys** are the **current canonical analysis registry**. They are **not** the complete provider-observation universe for reference capture.

---

## 4. Two Manifest Layers (Critical Distinction)

### 4.1 Layer A — Canonical Analysis Manifest

| Term | Definition |
|------|------------|
| **`CANONICAL_ANALYSIS_SET`** | **33** frozen `CAN_*` keys from Phase 2E |
| Role | Authoritative for **currently understood** Driver Quality, Vehicle Load, Brake Physics, Tire Dynamic Load, and context concepts |
| Scope | Analysis alignment, redundancy rules, episode identity, detector design inputs |
| **Not** | The complete provider telemetry universe · **do not inflate CAN-33** to represent unknown provider fields |

Per-signal normative contracts for all 33 keys remain in JSON `canonicalSignals[]` and §9 below.

### 4.2 Layer B — Broad Reference Observation Manifest

| Term | Definition |
|------|------------|
| **`BROAD_REFERENCE_OBSERVATION_SET`** | All empirically/capability-discovered provider telemetry signals retrievable for the **concrete vehicle/session** on `DIMO_LTE_R1` |
| Count policy | **`DYNAMIC_PER_VEHICLE`** — **must not** hard-code globally as 33 or 117 |
| Hierarchy | 117 schema surface → per-vehicle capability discovery → vehicle-supported fields → **broad capture** → canonical map where exists → raw `DIMO::<field>` where unmapped |

**Includes fields that:**

- Already map to `CAN_*` · do not yet map · appear irrelevant to scoring today  
- Are diagnostic/context/body/service · redundant candidates · unknown scientific value/cadence/stability  

**Purpose:** discovery and future offline analysis — **not** pre-deciding that only today's 33 signals are worth retaining.

### 4.3 Layer C — Minimum Reference Set (Pareto fallback)

| Term | Definition |
|------|------------|
| **`MINIMUM_REFERENCE_SET`** | **17** canonical keys — core Pareto when broad capture is constrained |
| Role | Fallback/science floor — **not** the Phase 3A research capture target |

### 4.4 Optional high-value canonical extensions

**`OPTIONAL_HIGH_VALUE_CANONICAL_EXTENSIONS`** = **14** keys — CAN-33 prioritization for analysis focus. **Must not** imply non-selected **available provider signals** are discarded from broad research capture.

---

## 5. Manifest Design Principles

1. **Broad scientific observation with temporally efficient acquisition** — maximize **information coverage** of the vehicle-supported provider surface; **not** query count or uniform polling frequency. *(Supersedes misread of "scientific sufficiency, not query maximalism" as intentionally narrow reference capture.)*  
2. **Two-layer separation** — CAN-33 = analysis registry; broad observation = Phase 3A research capture surface.  
3. **Capability-driven breadth** — `availableSignals` seeds the broad candidate set; empirical characterization follows in Flight Recorder.  
4. **Cadence ≠ breadth** — retain all available signals; assign **temporal acquisition class** per signal (§6). **Not** 117 fields @ 1 Hz.  
5. **Powertrain independence** — suppress inherently inapplicable fields once known; retain all other available provider fields in broad capture.  
6. **Raw evidence for replay** — retain provider-native unmapped fields (`canonicalKey: null`); never persist only final scores.  
7. **Connection profile scoped** — `DIMO_LTE_R1` only; model extensible to Smart5/Tesla/HM later.

**Master Plan lifecycle (frozen):**

| Mode | Strategy |
|------|----------|
| **REFERENCE MODE** | **BROAD CAPTURE FIRST** |
| **PRODUCTION MODE** | **CAPABILITY-SHAPED MINIMUM/OPTIMAL ACQUISITION AFTER VALIDATION** |

Reference/research capture may intentionally collect **significantly more** data than eventual production acquisition.

---

## 6. Temporal Acquisition Classes (Breadth ≠ Cadence)

Broad observation and acquisition cadence are **separate decisions**.

| Class | Cadence intent | Examples |
|-------|----------------|----------|
| **WAVEFORM_DYNAMICS** | Maximum useful/provider-supported | speed HF, yaw, brake pressure, wheel speeds |
| **POWERTRAIN_DYNAMIC** | High when scientifically useful | RPM, throttle, torque, battery power |
| **SPATIAL_ROUTE** | Route-suitable | lat, lon, heading route buckets |
| **SLOW_PHYSICAL_CONTEXT** | Slow | ambient, coolant snapshot, tire pressure |
| **HEALTH_DIAGNOSTIC** | Slow / on-change | DTC, warnings, fluid levels |
| **EVENT** | Event-driven | native provider events, segment triggers |
| **SESSION_METADATA** | Session / request level | captureSessionId, manifestVersion, request timing |

**Rule:** Requested `interval:"1s"` is **never** observed 1 Hz without empirical validation.

---

## 7. Raw Unmapped Provider Signal Contract

Provider-native fields **without** current `CAN_*` mapping **must** be retained in reference capture.

```
provider = DIMO
providerField = <exact DIMO field>
canonicalKey = null   (when not mapped)
rawIdentity = DIMO::<exact-provider-field>
```

**Do not invent a `CAN_*` key merely because a field is captured.**

Required provenance (minimum): provider · connectionProfile · vehicleId · captureSessionId · providerField · canonicalKey (nullable) · raw value · raw unit · normalized when defined · providerTimestamp · synqReceivedAt · request timing · acquisition surface/tier · capability state · manifestVersion.

---

## 8. `availableSignals` Role & Controlled Probing

**`availableSignals` IS:** capability-discovery evidence for the **initial broad per-vehicle capture candidate set**.

**`availableSignals` IS NOT proof of:** cadence · freshness · historical queryability · waveform quality · detector suitability.

**Flight Recorder must empirically characterize:** observed non-null delivery · P50/P95/P99 Δt · max gap · jitter · duplicates · out-of-order · provider→SynqDrive latency · quantization · null behavior · historical availability · surface differences.

**Controlled direct probe** (schema fields not in `availableSignals` but scientifically high-value): probe **once/diagnostically** where safe — **not** blind continuous polling of all unsupported fields.

| Result state | Meaning |
|--------------|---------|
| `SCHEMA_SUPPORTED` | In global schema |
| `LISTED_AVAILABLE` | In vehicle availableSignals |
| `OBSERVED_NON_NULL` | Empirically delivered |
| `LISTED_BUT_NULL` | Listed but null at observation |
| `DIRECT_PROBE_SUPPORTED` | Probe returned data |
| `DIRECT_PROBE_NULL` | Probe legal but null |
| `NOT_AVAILABLE_ON_VEHICLE` | Confirmed absent |
| `UNKNOWN` | Requires further validation |

Schema existence ≠ vehicle capability.

---

## 9. Native Events — Broad Observation

| Set | Definition |
|-----|------------|
| **`KNOWN_ANALYSIS_EVENT_SET`** | Eight behavior.* names aligned with current Q015 minimum filters |
| **`BROAD_PROVIDER_EVENT_OBSERVATION_SET`** | **All** provider events returned for reference session when API permits |

**Rule:** Do **not** drop events because the name is outside the Q015 filter. Unknown event names remain **provider-native evidence**.

Per-event retention: exact name · full metadata · provider timestamp · synqReceivedAt · session/trip · provenance · manifestVersion.

Episode rule preserved: **one physical maneuver → one episode → multiple evidence channels**; native vs reconstructed compared, not blindly summed.

---

## 10. Segments & Auxiliary Surfaces

If segment/auxiliary DIMO surfaces can be safely queried for the reference session, **retain results for research/validation** even when no current score consumes them. Do **not** promote to `CAN_*` without semantic justification.

---

## 11. Analysis Eligibility vs Reference Capture Eligibility

| Concept | Meaning |
|---------|---------|
| **`analysisEligibility`** | Current use in DQ / VL / BK / TR scoring & detector design |
| **`referenceCaptureEligibility`** | Must retain in Phase 3A broad capture when vehicle/provider permits |

**Rules:**

- `DIAGNOSTIC_ONLY` = current **analysis** use — **not** "do not observe" in reference mode  
- `EXCLUDED_FROM_SCORING` ≠ `EXCLUDED_FROM_REFERENCE_OBSERVATION`  
- Context/diagnostic **available** signals captured at appropriate temporal class  

---

## 12. Frozen Manifest Metadata

| Field | Value |
|-------|-------|
| `manifestId` | `DIMO_LTE_R1_REFERENCE_MANIFEST` |
| `manifestVersion` | **`1.1.0`** (broad-capture amendment) |
| `manifestStatus` | `FROZEN` |
| `frozenAt` | `2026-08-31T00:00:00.000Z` |
| `canonicalRegistryVersion` | `CAN-33-2026-08-31` |
| `provider` | `DIMO` |
| `connectionProfile` | `DIMO_LTE_R1` |
| `hardwareProfile` | `LTE_R1_OBD_DONGLE` |
| `applicablePowertrainProfiles` | `ICE_GASOLINE`, `ICE_DIESEL`, `PHEV`, `BEV` |

**Reference vehicles (observation baseline, all LTE_R1 audit fleet):**

| Vehicle | Token | Powertrain | Inventory |
|---------|------:|------------|-----------|
| Tiguan (WOB L 7503) | 192922 | ICE_GASOLINE | `dimo-wob-l-7503-signal-inventory-gap-analysis-2026-08-30.md` |
| C63 (KS MX 2024) | 187336 | ICE_GASOLINE | `dimo-ks-mx-2024-signal-inventory-gap-analysis-2026-08-30.md` |
| A4 (KS MS 661) | — | ICE_DIESEL | `dimo-ks-ms-661-signal-inventory-gap-analysis-2026-08-30.md` |
| Arteon (HMÜ C 215) | 187784 | ICE_GASOLINE | `dimo-hmue-c-215-signal-inventory-gap-analysis-2026-08-30.md` |

**PHEV/BEV GT tracks:** `PENDING_REFERENCE_VEHICLE` — manifest overlays defined; no reference vehicle in current audit set.

---

## 13. Capture Class Taxonomy (Canonical Analysis Layer)

Capture classes describe **canonical analysis alignment** and default temporal intent. In **reference mode**, `DIAGNOSTIC_ONLY` and `CONTEXT_ONLY` still permit broad capture at appropriate cadence (§11).

| Class | Analysis role | Reference capture |
|-------|---------------|-------------------|
| `CORE_REFERENCE_REQUIRED` | Core analysis anchor | Capture when vehicle permits |
| `CAPABILITY_CONDITIONAL` | Analysis when capable | Broad capture if available |
| `POWERTRAIN_CONDITIONAL` | Powertrain-specific analysis | Broad capture per overlay |
| `PHYSICS_HIGH_FREQUENCY` | Waveform physics | Broad capture @ waveform class |
| `NATIVE_EVENT_EVIDENCE` | Provider events | Broad **all returned events** |
| `CONTEXT_ONLY` | Context normalization | Broad capture @ slow class |
| `DIAGNOSTIC_ONLY` | Not primary analysis input | **Still observe** in reference mode |
| `GROUND_TRUTH_SYNC` | Session sync | Always record in reference sessions |
| `EXCLUDED_FROM_REFERENCE_CAPTURE` | Not in reference plan | Exclude only when justified |

All **33** `CAN_*` keys assessed — see §15 and JSON `canonicalSignals[]`.

---

## 14. Manifest Set Terminology (Corrected)

### 14.1 `CANONICAL_ANALYSIS_SET` — 33 keys

The **current canonical analysis registry** (Phase 2E). Explicit per-key LTE_R1 analysis contracts. **Not** the broad observation universe.

### 14.2 `MINIMUM_REFERENCE_SET` — 17 keys

Pareto science floor when broad capture is constrained:

CAN-001, CAN-005, CAN-007, CAN-008, CAN-012, CAN-017–020, CAN-021–024, CAN-028, CAN-029, CAN-032, CAN-033

**Plus:** supplemental lat/lon/ignition/lastSeen · **`BROAD_PROVIDER_EVENT_OBSERVATION_SET`** · unmapped provider fields when returned.

### 14.3 `BROAD_REFERENCE_OBSERVATION_SET` — dynamic per vehicle

**Count: `DYNAMIC_PER_VEHICLE`** — examples: global schema **117** · four-vehicle union **33** · concrete session **N**.

Includes all capability-discovered/observed provider telemetry + session metadata + segments/events when retrievable.

### 14.4 `OPTIONAL_HIGH_VALUE_CANONICAL_EXTENSIONS` — 14 keys

CAN-33 prioritization for analysis focus. **Does not** authorize discarding other available provider signals from research capture.

---

## 15. All 33 Canonical Keys — Analysis Decisions

**Authority:** JSON `canonicalSignals[]` is normative for field-level contract. Summary:

| ID | Key | Capture class | Decision | Min set | Four-vehicle obs |
|----|-----|---------------|----------|:-------:|------------------|
| CAN-001 | VEHICLE_SPEED | CORE | record | ✓ | 4/4 OBSERVED |
| CAN-002 | YAW_RATE | PHYSICS_HF | record_if_capability | — | 0/4 NOT_OBSERVED |
| CAN-003 | WHEEL_SPEED_FL | PHYSICS_HF | record_if_capability | — | 0/4 |
| CAN-004 | WHEEL_SPEED_FR | PHYSICS_HF | record_if_capability | — | 0/4 |
| CAN-005 | ENGINE_THROTTLE | CORE | record ICE/PHEV | ✓ | 4/4 |
| CAN-006 | ENGINE_TPS | CAPABILITY_COND | record_if_capability | ext | 0/4 |
| CAN-007 | ENGINE_RPM | CORE | record ICE/PHEV | ✓ | 4/4 |
| CAN-008 | ENGINE_LOAD | CORE | record ICE/PHEV | ✓ | 4/4 |
| CAN-009 | ENGINE_TORQUE | CAPABILITY_COND | record_if_capability | ext | 0/4 |
| CAN-010 | ENGINE_TORQUE_% | CAPABILITY_COND | record_if_capability | ext | 0/4 |
| CAN-011 | ENGINE_MAF | CAPABILITY_COND | record_if_capability | ext | 0/4 |
| CAN-012 | TRANS_CURRENT_GEAR | CORE | record | ✓ | 0/4 HF queried |
| CAN-013 | TRANS_ACTUAL_GEAR | CAPABILITY_COND | record_if_capability | ext | Tiguan only |
| CAN-014 | TRANS_SELECTED_GEAR | DIAGNOSTIC | diagnostic_only | ext | 0/4 |
| CAN-015 | TRANS_GEAR_RATIO | CAPABILITY_COND | record_if_capability | ext | Tiguan only |
| CAN-016 | TRANS_TEMPERATURE | CONTEXT | record_if_capability | ext | 0/4 |
| CAN-017 | BRAKE_PEDAL_STATE | PHYSICS_HF | record_if_capability | ✓ | 0/4 |
| CAN-018 | BRAKE_PEDAL_POSITION | PHYSICS_HF | record_if_capability | ✓ | 0/4 |
| CAN-019 | BRAKE_PRESSURE_C1 | PHYSICS_HF | record_if_capability | ✓ | 0/4 |
| CAN-020 | BRAKE_PRESSURE_C2 | PHYSICS_HF | record_if_capability | ✓ | 0/4 |
| CAN-021–024 | TIRE_PRESSURE_* | CORE | record_if_capability | ✓ | 0/4 |
| CAN-025 | TIRE_WARNING | DIAGNOSTIC | diagnostic_only | ext | 0/4 |
| CAN-026 | TRACTION_BATTERY_POWER | POWERTRAIN | PHEV/BEV only | overlay | INAPPLICABLE ICE four |
| CAN-027 | TRACTION_BATTERY_SOC | POWERTRAIN | PHEV/BEV only | overlay | INAPPLICABLE ICE four |
| CAN-028 | AMBIENT_TEMP | CONTEXT | record | ✓ | 4/4 |
| CAN-029 | COOLANT_TEMP | CORE | record ICE/PHEV | ✓ | 4/4 |
| CAN-030 | OIL_TEMP | CONTEXT | record ICE/PHEV | ext | 4/4 |
| CAN-031 | INTAKE_TEMP | CONTEXT | record ICE/PHEV | ext | 4/4 |
| CAN-032 | LOCATION_HEADING | CONTEXT | record | ✓ | 4/4 |
| CAN-033 | ALTITUDE | CONTEXT | record | ✓ | 4/4 |

---

## 16. Acquisition Tier & Surface Mapping

| Tier | Surface | Broad reference usage |
|------|---------|----------------------|
| T0 | Snapshot ~30s | Operational + slow context fields |
| T1 | Active trip 20s | Trip FSM base |
| T2 | Active trip 7s/15s | Route/perf dynamics |
| T3 | Post-trip HF 1s | Waveform reconstruction |
| T4 | Native events | **Broad all returned events** + known analysis set |
| T5 | Future physics HF | Yaw, wheel, brake hydraulics when capable |
| T6 | Health/context | Diagnostic/context @ slow class |
| T7 | Flight Recorder session | **Broad reference observation capture** per vehicle capability |

**Design-only:** existing queries are reference surfaces — **no builder changes in 2F.1**. Broad capture uses capability-discovered field lists, not static Q001 alone.

---

## 17. Timestamp Contract (Frozen — see also JSON)

Unchanged from v1.0.0: `providerTimestamp` · **`synqReceivedAt` REQUIRED** · `requestStartedAt` · `responseReceivedAt` · `requestCorrelationId` · session/trip/vehicle/manifest/tier/requestedInterval.

**Three clocks:** provider sample time · SynqDrive receive time · query/response timing. Requested interval ≠ observed cadence.

---

## 18. Raw + Normalized + Unmapped Retention (Frozen)

Retain: raw provider representation · canonical normalized when mapped · **`DIMO::<field>` unmapped namespace** · full timestamp envelope · provenance · query identity · manifest version.

Must **not** persist only scores/counters/labels. TTL `PROPOSAL_TO_BE_FROZEN_BEFORE_PRODUCTION`; lifecycle must survive capture → calibration cycle.

---

## 19. Native Events Summary (see §9)

`KNOWN_ANALYSIS_EVENT_SET` (8 behavior.*) + **`BROAD_PROVIDER_EVENT_OBSERVATION_SET`** (all returned). Four-vehicle yield: 0/34/0/50 per 30d — not guaranteed.

---

## 20. Driver Quality Evidence Requirements (Frozen)

Reference manifest must preserve evidence to later validate (weights **not** defined here):

- Longitudinal smoothness · braking quality · acceleration modulation · jerk  
- Cornering behavior (yaw/heading/speed context — yaw preferred when capable)  
- Accel→brake reversals · unnecessary cycling · speed behavior · anticipation proxies  
- Consistency · mechanical sympathy · context normalization  

**Broad capture note:** DQ validation may require **unmapped provider fields** discovered during reference sessions — not limited to CAN-33.

---

## 21. Vehicle Load Evidence Requirements (Frozen)

Preserve evidence for: longitudinal load · braking load · stop-go exposure · high-speed exposure · powertrain load · engine/electrical load · transmission load · thermal exposure · dynamic maneuver load.

**Road type ≠ automatic vehicle load** — context fields support normalization only.

---

## 22. Brake Physics Evidence Requirements (Frozen)

Target physics (Phase 3A validation, not 2F.1 scoring):

```
E_kin = 0.5 * m * (v1² - v2²)
E_friction ≈ E_kin - E_regen - E_drag - E_rolling - E_grade   (where evidence permits)
```

**Required evidence classes:**

- Speed before/during/after brake episodes (CAN-001 @ T3/T7)  
- Mass/spec source binding (RP-044 PRE_RECORDER)  
- Grade/altitude (CAN-033)  
- Brake pedal + hydraulic circuits when capable (CAN-017–020)  
- Battery power for PHEV/BEV regen context (CAN-026) — **not** proven friction/regen split alone  
- Duration, cooling interval, repeated braking, high-speed braking context  

**Do NOT claim:** disc/pad temperature °C without measurement · exact friction energy without inputs.

---

## 23. Tire Dynamic Load Evidence Requirements (Frozen)

Preserve: longitudinal/lateral demand proxies · combined demand · wheel-speed consistency/slip proxy · tire pressures · speed exposure · brake/accel episodes · driven axle context · ambient/thermal · vehicle/tire spec · mass context.

**Do NOT claim:** road-tire μ from proxies alone. Lateral accel not in DIMO schema — document reconstruction limits (speed + yaw/heading context).

---

## 24. Powertrain-Specific Overlays (Frozen)

| Profile | Additional required | Suppressed | GT status |
|---------|--------------------|-----------:|-----------|
| ICE_GASOLINE | CAN-005–008, CAN-029 | CAN-026/027 | 4-vehicle audit set |
| ICE_DIESEL | Same + DEF operational field (non-CAN) | CAN-026/027 | A4 reference |
| PHEV | ICE core + CAN-026/027 | — | `PENDING_REFERENCE_VEHICLE` |
| BEV | CAN-001, CAN-026/027, CAN-012, CAN-028, CAN-032/033 | ICE engine cluster | `PENDING_REFERENCE_VEHICLE` |

Distinguish **analysis-required** vs **broad observation** signals per overlay (JSON `powertrainOverlayPolicy`).

---

## 25. Ground Truth Synchronization Contract (Frozen)

Phase 3A must be able to compute latency, onset error, duration error, MAE, RMSE, bias, timestamp offset/drift.

**Session metadata (frozen):**

- captureSessionId · sessionStartUtc · sessionEndUtc · vehicleId  
- connectionProfile · powertrainProfile · manifestVersion  
- referenceVideoIdentifier · synchronizationMarkerEvent · telemetryTimelineAnchor  
- providerTimestamps + synqReceivedAt series  
- clockOffsetEstimationMethod · driftEstimationRequirement  

**Instrument-cluster video:** reference channel — not assumed perfect ground-truth sensor.

---

## 26. Runtime Probe Backlog Reclassification (47 items)

**Rule:** Do not manually resolve weeks of cadence/latency questions before Flight Recorder — classify what FR should measure.

| Class | Count | Meaning |
|-------|------:|---------|
| **A. PRE_RECORDER_BLOCKER** | **5** | Must resolve before FR **implementation** starts safely |
| **B. RECORDER_MEASURED** | **29** | FR / reference drive is intended to measure |
| **C. POST_CAPTURE_VALIDATION** | **11** | Requires captured telemetry ± GT |
| **D. PROFILE_OTHER** | **2** | Smart5 / Tesla / HM — not LTE_R1 Phase 3A |

**PRE_RECORDER_BLOCKER (5):** RP-010 long-trip HF stress · RP-039 receive timestamp injection · RP-040 wire format conformance · RP-044 mass/spec binding · RP-045 retention TTL justification

**PROFILE_OTHER (2):** RP-046 SMART5 · RP-047 Tesla/HM surfaces

Full table: JSON `runtimeProbeBacklog[]` and Appendix A below.

---

## 27. Manifest-Shaped vs Static Query A/B (Design Only)

**Do not execute in 2F.1.** Phase 3A design:

| Metric | Static (today) | Manifest-shaped (target) |
|--------|----------------|--------------------------|
| Fields requested | Q001 32+ selections | Capability-filtered |
| Fields non-null | ~34% effective (2B mismatch) | TBD — **RP-035** |
| Payload bytes | UNKNOWN | **RP-035** |
| Provider latency | Partial RP-005 | FR measured |
| Request count | 3×/30s active + HF×2 post-trip | Shaped tiers |
| API cost | **UNKNOWN_REQUIRES_MEASUREMENT** | **UNKNOWN** |
| Usable samples / detector eligibility | Partial | POST_CAPTURE |

---

## 28. Phase 2F Consistency Corrections

Phase 2F §22.2–§23 incorrectly implied 2F.1 would implement production services. **Corrected separation:**

| Was incorrectly assigned to 2F.1 | Correct owner |
|----------------------------------|---------------|
| `VehicleCapabilityManifestService` | Later implementation workstream (post-3A or parallel engineering) |
| `CapabilityQueryPlannerService` + shaped builders | Phase 3A+ / dedicated implementation |
| Feature flag `CAPABILITY_SHAPED_QUERIES_ENABLED` | Implementation phase |
| Flight Recorder runtime capture | **Phase 3A** |
| Reference drive / one golden trip | **Phase 3A** |
| RP-2F-01 cadence pilot execution | **Phase 3A** (RECORDER_MEASURED) |

**2F.1 deliverables (actual):**

- This markdown audit  
- `dimo-lte-r1-reference-manifest-v1.json`  
- Master Plan gate update  

See corrected Phase 2F §22–23 in same PR.

---

## 29. Proposed Phase 3A Implementation Boundaries (Preview Only)

Phase 3A **may** implement (not started):

- Flight Recorder capture service conforming to JSON manifest  
- Receive-timestamp injection at ingress  
- T7 capture sessions with provenance envelope  
- Reference drive + GT sync per §18  
- Native vs reconstructed episode comparison harness  

Phase 3A **must not** change production scoring formulas without later phase gates.

---

| Gate | Status |
|------|--------|
| Phase 2F.1 two-layer manifest | **DONE** (v1.1.0) |
| Phase 3A implementation start | **READY_TO_START_IMPLEMENTATION** |
| Reference drive execution | **NOT_READY_FOR_REFERENCE_DRIVE** until PRE_RECORDER_BLOCKER items resolved in 3A preflight |

---

## 30. Exit Criteria

| # | Criterion | Status |
|---|-----------|:------:|
| 1 | LTE_R1 reference manifest complete | ✓ |
| 2 | All 33 CAN_* explicit decisions | ✓ |
| 3 | Machine-readable JSON exists | ✓ |
| 4 | Full + minimum/Pareto + **broad dynamic** sets defined | ✓ |
| 5 | Powertrain overlays ICE/PHEV/BEV/diesel | ✓ |
| 6 | Native-event contract frozen | ✓ |
| 7 | Timestamp contract frozen | ✓ |
| 8 | Raw + normalized retention frozen | ✓ |
| 9 | GT sync contract frozen | ✓ |
| 10 | Driver Quality evidence covered | ✓ |
| 11 | Vehicle Load evidence covered | ✓ |
| 12 | Brake Physics evidence covered | ✓ |
| 13 | Tire Dynamic Load evidence covered | ✓ |
| 14 | Phase 2E no-substitution intact | ✓ |
| 15 | Episode identity / no double-count intact | ✓ |
| 16 | 47 probes classified A/B/C/D | ✓ |
| 17 | No unsupported cadence claims | ✓ |
| 18 | Phase 2F handoff corrected | ✓ |
| 19 | Master Plan updated | ✓ |
| 20 | No production code changed | ✓ |

| 21 | CAN-33 ≠ provider observation universe | ✓ |
| 22 | Unmapped provider retention explicit | ✓ |
| 23 | Broad events/segments/diagnostic capture explicit | ✓ |

**Phase 2F.1: DONE (v1.1.0)** · **Phase 3A: READY_TO_START_IMPLEMENTATION** · **Reference drive: NOT_READY**

---

## 31. Final Verdict

The **`DIMO_LTE_R1` reference manifest v1.1.0** freezes a **two-layer contract**: **`CANONICAL_ANALYSIS_SET` (33)** for current analysis semantics, and **`BROAD_REFERENCE_OBSERVATION_SET` (dynamic per vehicle)** for Phase 3A research capture including unmapped provider fields, all returned native events, and auxiliary segments when available — with **temporally efficient acquisition** rather than uniform 1 Hz polling of 117 schema fields.

**Next:** Phase **3A** — implement Flight Recorder **using this manifest** (implementation may start; reference drive awaits PRE_RECORDER_BLOCKER resolution).

---

## Appendix A — Runtime Probe Classification (47)

| ID | Class | Description |
|----|-------|-------------|
| RP-001 | B | Effective cadence histogram all buckets |
| RP-002 | B | Provider→SynqDrive latency distribution |
| RP-003 | B | listed-but-null / availableSignals stability |
| RP-004 | B | Native event rate vs trip LTE_R1 |
| RP-005 | B | safety.collision availability |
| RP-006 | B | Segment mechanism yield |
| RP-007 | B | Fuel 30s bucket spacing |
| RP-008 | B | RAND coordinate semantics |
| RP-009 | B | Crank 5s MIN/MAX preservation |
| RP-010 | A | Long-trip HF timeout stress |
| RP-011 | C | Event vs HF alignment Δt |
| RP-012 | C | ClickHouse mirror vs raw FR |
| RP-013 | C | DIMO rate limits |
| RP-014 | B | A4 zero native events |
| RP-015 | B | Tiguan historical vs 0/30d |
| RP-016 | B | ActualGear/ratio Tiguan |
| RP-017 | C | C63 mixed timestamps FSM |
| RP-018 | C | C63 enrichment path |
| RP-019 | B | Arteon cornering native vs HF |
| RP-020 | B | Hardware profile resolution |
| RP-021 | B | Yaw availability beyond audit set |
| RP-022 | B | Wheel speed pair delivery |
| RP-023 | B | Brake pedal/pressure availability |
| RP-024 | B | Parallel gear field compare |
| RP-025 | B | Tire pressure delivery |
| RP-026 | B | TPS vs OBD throttle |
| RP-027 | B | Torque Nm vs % complementary |
| RP-028 | B | MAF availability |
| RP-029 | B | Transmission temp |
| RP-030 | B | Battery power decel semantics |
| RP-031 | B | Event metadata schema |
| RP-032 | B | Yaw unit deg/s vs rad/s |
| RP-033 | B | Brake pressure unit |
| RP-034 | B | TPMS warning semantics |
| RP-035 | C | Static vs shaped A/B |
| RP-036 | B | Duplicate post-trip HF reads |
| RP-037 | C | Route+perf dedup |
| RP-038 | C | Sampling invariance replay |
| RP-039 | A | Receive timestamp injection |
| RP-040 | A | Wire format conformance |
| RP-041 | C | Video clock offset/drift |
| RP-042 | C | PHEV/BEV regen split GT |
| RP-043 | C | Native vs reconstructed disagreement |
| RP-044 | A | Vehicle mass/spec for E_kin |
| RP-045 | A | Retention TTL justification |
| RP-046 | D | SMART5 HF/native |
| RP-047 | D | Tesla Direct + HM surfaces |

Legend: **A**=PRE_RECORDER_BLOCKER · **B**=RECORDER_MEASURED · **C**=POST_CAPTURE_VALIDATION · **D**=PROFILE_OTHER

---

*Changes / Architektur: Documentation-only phase. No SynqDrive Code → Changes or Architektur implementation entries. Phase 3A Flight Recorder implementation will require both.*
