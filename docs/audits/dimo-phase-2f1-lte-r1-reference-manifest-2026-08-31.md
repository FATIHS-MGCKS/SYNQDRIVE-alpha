# DIMO Phase 2F.1 — LTE_R1 Reference / Flight Recorder Manifest Freeze

**Date:** 2026-08-31  
**Status:** DONE (frozen reference contract; no production implementation)  
**Scope:** `DIMO_LTE_R1` reference capture manifest · timestamp contract · native-event contract · Ground Truth sync · probe reclassification  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Machine-readable artifact:** `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json`  
**Phase gate:** Phase 2F.1 **DONE** · Phase 3A **READY / UNGATED_TO_START** (not started)

---

## 1. Executive Summary

Phase 2F.1 **freezes** the **`DIMO_LTE_R1` reference manifest** — the normative capture contract for Phase 3A Flight Recorder / reference-program work. This phase produces **documentation and a frozen JSON contract only**. It does **not** implement the Flight Recorder, run reference drives, modify query builders, or execute runtime probes.

| Metric | Value | Evidence |
|--------|------:|----------|
| Connection profile | **`DIMO_LTE_R1`** only | Master Plan §1.6 |
| Canonical registry version | **`CAN-33-2026-08-31`** | Phase 2E Appendix B |
| Manifest version | **`1.0.0`** | This deliverable |
| Canonical signals assessed | **33 / 33** | Explicit decision per `CAN_*` |
| Full reference manifest signals | **33** | All keys in full set |
| Minimum viable manifest signals | **17** | Pareto core + brake/tire attempt |
| Optional high-value extensions | **14** | Physics/context enrichments |
| Native-event contract | **Frozen** | T4 · PROVIDER_CLASSIFIED |
| Timestamp contract | **Frozen** | Receive-time requirement explicit |
| Raw + normalized retention | **Frozen** | Architectural requirement |
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

- Full + minimum + optional-extension manifest sets for `DIMO_LTE_R1`
- Per-signal normative contract for all 33 `CAN_*` keys
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

## 3. North Star (Preserved)

```
RAW PROVIDER OBSERVATION → CANONICAL SIGNAL (CAN_*) → PHYSICAL EPISODE → CANONICAL FEATURE
→ independent domains: Driver Quality · Vehicle Load · Brake Physics · Tire Dynamic Load
+ orthogonal Data Confidence / Assessability
```

**Invariants preserved from Phase 2E:**

- One physical maneuver → one physical episode → multiple evidence channels  
- Native events = **PROVIDER_CLASSIFIED**; reconstructed = **SYNQDRIVE_DERIVED** — compare, do not blindly sum  
- Throttle ≠ pedal · torque Nm ≠ torque % (complementary) · brake C1/C2 = **CIRCUIT_COMPLEMENT**  
- Heading ≠ yaw · tire warning ≠ pressure · battery power alone ≠ friction/regen split  
- Positive traction-battery power = energy **into** battery (Phase 2C/2D)

---

## 4. Manifest Design Principles

1. **Scientific sufficiency, not query maximalism** — capture what Phase 3A needs to measure cadence, latency, dynamics, native vs reconstructed episodes, and GT alignment.  
2. **Capability-first shaping** — do not force all 33 fields into every vehicle query; record **if capability exists** where appropriate.  
3. **Powertrain independence** — ICE-only fields must not penalize BEV confidence; BEV-only fields must not penalize ICE.  
4. **Existence ≠ temporal usability** — requested `interval:"1s"` is **not** observed 1 Hz.  
5. **Raw evidence for replay** — retain provider + normalized forms; never persist only final scores.  
6. **Connection profile scoped** — this manifest is **`DIMO_LTE_R1` only**; Smart5/Tesla/HM have separate tracks.

---

## 5. Frozen Manifest Metadata

| Field | Value |
|-------|-------|
| `manifestId` | `DIMO_LTE_R1_REFERENCE_MANIFEST` |
| `manifestVersion` | `1.0.0` |
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

## 6. Capture Class Taxonomy

| Class | Meaning | Manifest decision |
|-------|---------|-------------------|
| `CORE_REFERENCE_REQUIRED` | Minimum scientifically necessary on LTE_R1 reference sessions | **record** |
| `CAPABILITY_CONDITIONAL` | Record when vehicle capability confirms delivery | **record_if_capability_exists** |
| `POWERTRAIN_CONDITIONAL` | Applicable only to listed powertrain profiles | **record_only_for_specific_powertrain** |
| `PHYSICS_HIGH_FREQUENCY` | Waveform-grade physics (brake/yaw/wheel) | **record_if_capability_exists** @ T5/T7 |
| `NATIVE_EVENT_EVIDENCE` | Provider behavior events (T4) | **record** (channel-level) |
| `CONTEXT_ONLY` | Thermal/heading/altitude context | **record** (lower cadence OK) |
| `DIAGNOSTIC_ONLY` | Warning/selected gear — not primary physics | **diagnostic_only** |
| `GROUND_TRUTH_SYNC` | Session/video sync metadata | **record** (session envelope) |
| `EXCLUDED_FROM_REFERENCE_CAPTURE` | Not part of LTE_R1 reference capture | **excluded** |

No canonical key is silently omitted — see §8 and JSON `canonicalSignals[]`.

---

## 7. Manifest Sets: Full · Minimum · Optional Extensions

### 7.1 Full LTE_R1 reference manifest

**Count: 33 canonical keys** — all assessed; none excluded from assessment.

Includes capability-conditional physics signals (yaw, wheel speeds, brake hydraulics) **in the capture plan** so Phase 3A can measure availability and cadence when vehicles support them.

### 7.2 Minimum viable reference manifest (Pareto)

**Count: 17 canonical keys**

| Key | Rationale |
|-----|-----------|
| CAN-001 speed | Core kinematics, all domains |
| CAN-005 throttle | ICE/PHEV modulation evidence |
| CAN-007 RPM | ICE/PHEV load context |
| CAN-008 engine load | Vehicle load / modulation |
| CAN-012 current gear | Shift/load context |
| CAN-017–020 brake cluster | Brake physics baseline attempt |
| CAN-021–024 tire pressures | Tire load baseline attempt |
| CAN-028 ambient | Thermal/context normalization |
| CAN-029 coolant | ICE/PHEV thermal exposure |
| CAN-032 heading | Cornering/context (not yaw substitute) |
| CAN-033 altitude | Grade/brake energy context |

**Plus (not CAN keys):** supplemental operational fields `currentLocationLatitude`, `currentLocationLongitude`, `isIgnitionOn`, `lastSeen` — `CONFIRMED_FROM_CODE` as trip/FSM/GT necessities.

**Plus:** native-event channel T4 (behavior.* filters) when provider emits.

**Powertrain overlay adjustments:**

- **BEV minimum:** replace CAN-005/007/008/029 with CAN-026/027; suppress ICE keys — see JSON `manifestSets.powertrainOverlays.BEV`  
- **PHEV minimum:** union ICE core + CAN-026/027  
- **PHEV/BEV GT:** `PENDING_REFERENCE_VEHICLE`

### 7.3 Optional high-value extensions (14 keys)

CAN-002, CAN-003, CAN-004, CAN-006, CAN-009, CAN-010, CAN-011, CAN-013, CAN-014, CAN-015, CAN-016, CAN-025, CAN-030, CAN-031

These enrich physics validation when capability exists but are not required for minimum Pareto reference capture.

---

## 8. All 33 Canonical Keys — LTE_R1 Manifest Decisions

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

## 9. Acquisition Tier & Surface Mapping

| Tier | Surface | Manifest usage |
|------|---------|----------------|
| T0 | Snapshot ~30s (Q001 shaped) | Speed, load, tire, thermal context |
| T1 | Active trip 20s (Q006 shaped) | Trip FSM, distance, fuel/energy |
| T2 | Active trip 7s/15s (Q007/Q008 shaped) | Route, perf dynamics |
| T3 | Post-trip HF 1s (Q009 shaped) | Waveform reconstruction |
| T4 | Native events (Q015) | Provider-classified behavior |
| T5 | Future physics HF query | Yaw, wheel, brake hydraulics when capable |
| T6 | Health/context snapshot | Tire warning, slow thermal |
| T7 | Flight Recorder session | **Full manifest capture per this contract** |

**Design-only mapping:** existing queries are **reference surfaces** to extend/shape in Phase 3A — **no builder changes in 2F.1**.

---

## 10. Timestamp Contract (Frozen)

**Problem (CONFIRMED_FROM_CODE):** Current pipeline lacks consistent `synqReceivedAt` on HF points — blocks precise provider→SynqDrive latency analysis.

**Frozen requirement — every captured observation where technically possible:**

| Field | Role |
|-------|------|
| `providerTimestamp` | Provider sample time |
| `synqReceivedAt` | SynqDrive ingress receive time (**REQUIRED**) |
| `requestStartedAt` | Query/request start |
| `responseReceivedAt` | Query response complete |
| `decodeNormalizedAt` | Optional normalization timestamp |
| `requestCorrelationId` | Tie request/response pairs |
| `captureSessionId` | Reference session identity |
| `tripOrRunId` | Trip/run binding |
| `vehicleId` | Tenant-scoped vehicle |
| `manifestVersion` | Reproducibility |
| `connectionProfile` | `DIMO_LTE_R1` |
| `powertrainProfile` | ICE/PHEV/BEV overlay |
| `acquisitionTier` | T0–T7 |
| `requestedInterval` | Requested bucket — **not observed cadence** |

**Three-clock distinction (mandatory documentation):**

1. **PROVIDER SAMPLE TIME** — when provider claims sample occurred  
2. **SYNQDRIVE RECEIVE TIME** — when SynqDrive received payload  
3. **QUERY/RESPONSE TIMING** — API round-trip only  

---

## 11. Raw + Normalized Retention (Frozen)

Reference capture **must retain:**

| Layer | Content |
|-------|---------|
| A | Raw provider representation (as returned) |
| B | Canonical normalized representation (`CAN_*` mapping) |
| C | Full timestamp envelope (§10) |
| D | Provenance envelope (manifest version, tier, capability state, fallback) |
| E | Query/request identity |
| F | Manifest/version identity |

**Must NOT persist only:** final event counters, composite scores, precomputed episode labels.

**TTL:** `PROPOSAL_TO_BE_FROZEN_BEFORE_PRODUCTION` — but raw reference data **must survive** capture → validation → replay → sampling-invariance → calibration cycle.

---

## 12. Native DIMO Events — LTE_R1 (Frozen)

| Attribute | Requirement |
|-----------|-------------|
| Tier | T4 |
| Provenance | `PROVIDER_CLASSIFIED` |
| Required fields | event name/type, provider timestamp, synqReceivedAt, metadata payload, vehicle, captureSessionId, trip association, manifestVersion |
| Minimum filters | behavior.acceleration/braking/cornering/extremeBraking/harsh* /speeding (see JSON) |
| Episode rule | Same maneuver may appear as native event **and** reconstructed waveform — **one episode, multiple channels** |
| Reconciliation | Phase 3A compares native vs reconstructed — **no blind summation** |

**Four-vehicle native yield (30d, CONFIRMED_FROM_VEHICLE_INVENTORY):** Tiguan 0 · C63 34 · A4 0 · Arteon 50 — vehicle-specific, not guaranteed.

---

## 13. Driver Quality Evidence Requirements (Frozen)

Reference manifest must preserve evidence to later validate (weights **not** defined here):

- Longitudinal smoothness · braking quality · acceleration modulation · jerk  
- Cornering behavior (yaw/heading/speed context — yaw preferred when capable)  
- Accel→brake reversals · unnecessary cycling · speed behavior · anticipation proxies  
- Consistency · mechanical sympathy · context normalization  

**Minimum manifest coverage:** speed, throttle, RPM, load, gear, brake cluster attempt, heading, ambient.

---

## 14. Vehicle Load Evidence Requirements (Frozen)

Preserve evidence for: longitudinal load · braking load · stop-go exposure · high-speed exposure · powertrain load · engine/electrical load · transmission load · thermal exposure · dynamic maneuver load.

**Road type ≠ automatic vehicle load** — context fields support normalization only.

---

## 15. Brake Physics Evidence Requirements (Frozen)

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

## 16. Tire Dynamic Load Evidence Requirements (Frozen)

Preserve: longitudinal/lateral demand proxies · combined demand · wheel-speed consistency/slip proxy · tire pressures · speed exposure · brake/accel episodes · driven axle context · ambient/thermal · vehicle/tire spec · mass context.

**Do NOT claim:** road-tire μ from proxies alone. Lateral accel not in DIMO schema — document reconstruction limits (speed + yaw/heading context).

---

## 17. Powertrain-Specific Overlays (Frozen)

| Profile | Additional required | Suppressed | GT status |
|---------|--------------------|-----------:|-----------|
| ICE_GASOLINE | CAN-005–008, CAN-029 | CAN-026/027 | 4-vehicle audit set |
| ICE_DIESEL | Same + DEF operational field (non-CAN) | CAN-026/027 | A4 reference |
| PHEV | ICE core + CAN-026/027 | — | `PENDING_REFERENCE_VEHICLE` |
| BEV | CAN-001, CAN-026/027, CAN-012, CAN-028, CAN-032/033 | ICE engine cluster | `PENDING_REFERENCE_VEHICLE` |

**Regen rule:** positive battery power = into battery; synchronized decel context required; no ICE regen assumptions.

---

## 18. Ground Truth Synchronization Contract (Frozen)

Phase 3A must be able to compute latency, onset error, duration error, MAE, RMSE, bias, timestamp offset/drift.

**Session metadata (frozen):**

- captureSessionId · sessionStartUtc · sessionEndUtc · vehicleId  
- connectionProfile · powertrainProfile · manifestVersion  
- referenceVideoIdentifier · synchronizationMarkerEvent · telemetryTimelineAnchor  
- providerTimestamps + synqReceivedAt series  
- clockOffsetEstimationMethod · driftEstimationRequirement  

**Instrument-cluster video:** reference channel — not assumed perfect ground-truth sensor.

---

## 19. Runtime Probe Backlog Reclassification (47 items)

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

## 20. Manifest-Shaped vs Static Query A/B (Design Only)

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

## 21. Phase 2F Consistency Corrections

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

## 22. Proposed Phase 3A Implementation Boundaries (Preview Only)

Phase 3A **may** implement (not started):

- Flight Recorder capture service conforming to JSON manifest  
- Receive-timestamp injection at ingress  
- T7 capture sessions with provenance envelope  
- Reference drive + GT sync per §18  
- Native vs reconstructed episode comparison harness  

Phase 3A **must not** change production scoring formulas without later phase gates.

---

## 23. Exit Criteria

| # | Criterion | Status |
|---|-----------|:------:|
| 1 | LTE_R1 reference manifest complete | ✓ |
| 2 | All 33 CAN_* explicit decisions | ✓ |
| 3 | Machine-readable JSON exists | ✓ |
| 4 | Full + minimum/Pareto defined | ✓ |
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

**Phase 2F.1: DONE** · **Phase 3A: READY / UNGATED_TO_START** (not started)

---

## 24. Final Verdict

The **`DIMO_LTE_R1` reference manifest v1.0.0** is **frozen** as the authoritative capture contract for Phase 3A. All 33 canonical signals have explicit LTE_R1 decisions; minimum Pareto set (17 keys) preserves scientific sufficiency without query maximalism; timestamp, retention, native-event, and GT contracts are explicit; 47 runtime probes are reclassified so Flight Recorder work measures what should be measured rather than blocking on manual pre-work.

**Next phase:** Phase **3A** — implement LTE_R1 Flight Recorder / reference program **using this manifest** (do not start in this task).

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
