# DIMO Phase 2F — Capability-First Acquisition Strategy

**Date:** 2026-08-31  
**Status:** DONE (design authority complete; no production implementation)  
**Scope:** Capability-first signal acquisition architecture · per-vehicle manifest contract · query planner design · tier taxonomy · scaling model · LTE_R1 2F.1 handoff  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Phase gate:** Phase 2F **DONE** · Phase 2F.1 **NEXT** · Phase 3A **`GATED_ON_LTE_R1_MANIFEST`**

---

## 1. Executive Summary

Phase 2F converts Phases 2A–2E forensic evidence into a **capability-first acquisition architecture** for SynqDrive's DIMO integration. The design replaces today's **static, fleet-wide GraphQL field lists** with a **per-vehicle Vehicle Capability Manifest** that gates query shaping, tier selection, cadence eligibility, and analysis profile activation — while preserving Phase 2E canonical semantics (33 `CAN_*` keys, redundancy taxonomy, episode identity, and explicit no-substitution rules).

| Metric | Value | Evidence |
|--------|------:|----------|
| **Canonical signal keys (`CAN_*`)** | **33** | Phase 2E Appendix B authority |
| Phase 2A query registry entries | 27 (Q001–Q027) | `CONFIRMED_FROM_CODE` |
| Phase 2A unique signal fields in driving acquisition | 41 | Phase 2A §22.3 |
| Four-vehicle union unique signals | 33 | Phase 2B |
| Q001 static selection mismatch rate (ICE audit set) | **65.6%** (21/32 null per vehicle) | Phase 2B |
| Active trip parallel GraphQL calls per 30s tick | **3** (Core 20s + Route 7s + Performance 15s) | `CONFIRMED_FROM_CODE` (`trip-detection-orchestration.service.ts` L1088–1104) |
| HF (`1s`) acquisition timing | **POST_TRIP_ONLY** | `CONFIRMED_FROM_CODE` (`high-frequency.query.ts` header) |
| Preflight poll interval | 7 days (`DIMO_PREFLIGHT_MIN_INTERVAL_MS`) | `CONFIRMED_FROM_CODE` |
| Preflight gates production queries today | **NO** | Phase 2A verdict + code audit |
| `VehicleDrivingCapability` persistence | Postgres per `(org, vehicle, provider, capabilityKey)` | `CONFIRMED_FROM_CODE` (Prisma schema) |
| Hardware routing profiles | LTE_R1 / SMART5 / UNKNOWN | `CONFIRMED_FROM_CODE` (`vehicle-capabilities.ts`) |
| Acquisition tiers defined (T0–T7) | **8** | Phase 2F design |
| Capability lifecycle states | **10** | Phase 2F §7 |
| Analysis requirement profiles | **5** (DQ, VL, BK, TR, GT) | Phase 2F §9 |
| Runtime probes required before 3A | **47** backlog items | Phase 2F §21 |
| Primary connection profile | **DIMO_LTE_R1** | Phase 2B/2E |
| Smart5 / Tesla profiles | **UNVERIFIED_UNTIL_PHASE_2G** | Phase gate |
| High Mobility profile | **PHASE_2H** (out of 2F scope) | Master plan |

**Architecture verdict:** SynqDrive is **`PARTIALLY_CAPABILITY_AWARE`** today. Preflight writes `VehicleDrivingCapability` rows and hardware routing (`getVehicleCapabilities`) steers native-event vs HF-derived enrichment — but **all DIMO telemetry query builders remain static**. Phase 2F defines the manifest contract and query planner that closes this gap in implementation (2F.1+).

**North star preserved from Phase 2E:**

```
RAW PROVIDER OBSERVATION → CANONICAL SIGNAL (CAN_*) → PHYSICAL EPISODE → CANONICAL FEATURE → domain outputs
```

**Scaling headline (theoretical — Phase 2A arithmetic, not measured API cost):**

| Surface | Per vehicle (steady) | 100 vehicles | 1,000 vehicles |
|---------|-------------------:|-------------:|---------------:|
| Snapshot Q001 (ACTIVE_DRIVING 30s) | 2,880 calls/day | 288,000/day | 2,880,000/day |
| Active trip (3× / 30s while active) | 360 calls/hour | 36,000/hour (100 concurrent) | 360,000/hour |
| Capability-shaped snapshot (design target −40% fields) | ~1,728 calls/day | ~172,800/day | ~1,728,000/day |
| Post-trip HF (per completed trip) | formula-driven | per trip | per trip |

**Measured scaling:** `SCALING_IMPACT_REQUIRES_MEASUREMENT` — no production A/B of manifest-shaped queries exists in this phase.

**Top design outcomes:**

1. **Manifest-first query shaping** — request only signals at `ANALYSIS_ELIGIBLE` or operational tier need.
2. **Separate existence from temporal usability** — `LISTED_AVAILABLE` ≠ `TEMPORALLY_CHARACTERIZED`.
3. **Tier taxonomy T0–T7** maps operational latency needs to acquisition surfaces without duplicating Phase 2E canonical keys.
4. **Hardware routing preserved** — LTE_R1 native events primary; SMART5 HF reconstruction required; no false cross-profile substitution.
5. **Phase 2E invariants frozen** — throttle ≠ pedal; torque complementary not interchangeable; brake `CIRCUIT_COMPLEMENT`; six `NO_VALID_FALLBACK` families.

**Phase 2F status: DONE** · **Phase 2F.1: NEXT** · **Phase 3A: GATED_ON_LTE_R1_MANIFEST**

---

## 2. Scope & Authorities

### 2.1 In scope

- Capability-first acquisition **design** for all 33 Phase 2E canonical signals.
- Vehicle Capability Manifest JSON contract (proposed schema).
- Capability state machine and transition rules.
- Query planner algorithm (14-step pseudocode).
- Acquisition tier taxonomy T0–T7.
- Analysis requirement profiles (DQ, VL, BK, TR, GT).
- Native event strategy (LTE_R1 vs SMART5).
- Powertrain-specific acquisition matrices (ICE / PHEV / BEV).
- Fallback/degradation rules aligned with Phase 2E.
- Scaling scenarios (theoretical + measurement gaps).
- Cache/revalidation policy.
- Versioning/replay/provenance requirements.
- LTE_R1 2F.1 handoff contract.
- Runtime probe backlog.

### 2.2 Out of scope

- Production code changes (query builders, schedulers, workers).
- Flight Recorder manifest implementation (Phase 2F.1).
- Runtime cadence histogram collection (Phase 3 / probe backlog).
- Smart5/Tesla profile validation (Phase 2G).
- High Mobility integration (Phase 2H).
- Score formula changes (Phase 3A+).
- DB migrations for manifest storage beyond existing `VehicleDrivingCapability`.

### 2.3 Canonical documents read (order)

| # | Document | Role |
|---|----------|------|
| 1 | `driving-intelligence-reconstruction-master-plan-2026-08-30.md` | Phase gates |
| 2 | `dimo-phase-2a-current-query-surface-audit-2026-08-31.md` | Query registry Q001–Q027 |
| 3 | `dimo-phase-2b-four-vehicle-capability-gap-matrix-2026-08-31.md` | Four-vehicle observation |
| 4 | `dimo-phase-2c-current-schema-signal-expansion-audit-2026-08-31.md` | 117 schema fields |
| 5 | `dimo-phase-2d-signal-value-physics-matrix-2026-08-31.md` | Physics/cadence ranking |
| 6 | `dimo-phase-2e-redundancy-canonicalization-2026-08-31.md` | 33 CAN keys · redundancy |

### 2.4 Source modules analyzed (read-only)

| Module | Relevance |
|--------|-----------|
| `backend/src/modules/dimo/queries/*.query.ts` | Static query builders |
| `backend/src/modules/dimo/dimo-telemetry.service.ts` | Invocation layer |
| `backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts` | ACTIVE_TICK 3× parallel |
| `backend/src/modules/vehicle-intelligence/vehicle-capabilities.ts` | Hardware routing |
| `backend/src/modules/vehicle-intelligence/driving-capability/*` | Preflight + `VehicleDrivingCapability` |
| `backend/prisma/schema.prisma` | Capability persistence model |

### 2.5 Evidence tags

`CONFIRMED_FROM_CODE` · `CONFIRMED_FROM_VEHICLE_INVENTORY` · `CONFIRMED_FROM_RUNTIME_EVIDENCE` · `HISTORICAL_EVIDENCE` · `INFERENCE` · `UNKNOWN_REQUIRES_RUNTIME_PROBE` · `PROPOSAL_FOR_PHASE_2F` · `THEORETICAL_FROM_PHASE_2A` · `SCALING_IMPACT_REQUIRES_MEASUREMENT`

---

## 3. Current-State Problem

### 3.1 Static fleet-wide query builders

**Finding:** Every DIMO GraphQL query builder emits a **fixed field list** regardless of vehicle capability, powertrain, or analysis profile.

**Evidence (`CONFIRMED_FROM_CODE`):**

- `buildLatestSnapshotQuery` — 32 telemetry fields + `lastSeen` (`latest-vehicle-snapshot.query.ts`).
- `buildTripDetectionCoreQuery` — 5 fields, `interval: "20s"` (`trip-detection-core.query.ts`).
- `buildRouteEnrichmentQuery` — 3 fields, `interval: "7s"` (`route-enrichment.query.ts`).
- `buildPerformanceQuery` — 4 fields, `interval: "15s"` (`performance.query.ts`).
- `buildHighFrequencyQuery` — 16 fields, `interval: "1s"`, **post-trip only** (`high-frequency.query.ts`).

**Impact (Phase 2B):** On four ICE audit vehicles, Q001 requests 32 signals but only ~11 are observed non-null → **65.6% `STATIC_SELECTION_MISMATCH_RATE`**. Provider still receives full query payload; null responses waste bandwidth and obscure true capability state.

### 3.2 Preflight does NOT gate queries

**Finding:** `DimoAvailableSignalsPreflightService` runs `availableSignals` + `dataSummary` on a **7-day gate**, classifies probes, and persists `VehicleDrivingCapability` rows — but **no production query builder reads these rows to shape field selection**.

**Evidence (`CONFIRMED_FROM_CODE`):**

- `VehicleDrivingCapabilityResolverService` comment: *"Hardware type alone never upgrades capability to SUPPORTED."*
- `isNativeBehaviorSignalSupported` checks persisted rows — used for LTE_R1 enrichment gating, **not** for GraphQL field lists.
- Phase 2A verdict: **`PARTIALLY_CAPABILITY_AWARE`** — preflight diagnostic only.

**Gap:** Capability data is written but **non-authoritative for acquisition**. This is the primary architectural debt Phase 2F addresses.

### 3.3 Query duplication across tiers

**Finding:** Speed, engine load, throttle, ECT, RPM, and battery power appear in **multiple query surfaces** with different intervals.

| Signal family | Surfaces today | Relationship |
|---------------|----------------|--------------|
| `speed` | Snapshot, Core 20s, Route 7s, HF 1s | `NECESSARY_DIFFERENT_LATENCY` for trip FSM vs route vs post-trip |
| `obdEngineLoad` | Snapshot, Performance 15s, HF 1s | Overlap — manifest should dedupe within tier |
| `obdThrottlePosition` | Performance 15s, HF 1s | Overlap within active/post paths |
| `powertrainCombustionEngineECT` | Snapshot, Performance, HF | Triple overlap |
| `powertrainTractionBatteryCurrentPower` | Snapshot, HF | Dual overlap |

**Verdict:** Some duplication is **architecturally necessary** (different latency/retention). Some is **`POTENTIAL_QUERY_DUPLICATION`** (post-trip route+perf re-fetch per Phase 2A §22.1). Manifest must encode **tier purpose** so planner does not blindly merge incompatible windows.

### 3.4 Canonical signals with zero acquisition path

**Finding (Phase 2E §8):** Of 33 canonical keys, **16+ have `NONE` current path** including Tier-A physics signals (yaw, wheel speeds, brake hydraulics, MAF, transmission actual gear).

**Impact:** Driving Intelligence V2 analysis profiles cannot activate on manifest-eligible basis until acquisition tiers expand under capability proof.

### 3.5 Hardware routing vs signal routing split

**Finding:** `getVehicleCapabilities()` in `vehicle-capabilities.ts` routes **driving events source** (TELEMETRY_EVENTS vs HF_DERIVED) and abuse/HF flags — but does **not** vary DIMO query field lists.

| Hardware | `drivingEventsSource` | `useHfDrivingEvents` | `nativeEventCapable` |
|----------|----------------------|---------------------|---------------------|
| LTE_R1 | TELEMETRY_EVENTS | false | true |
| SMART5 | HF_DERIVED | true | false |
| UNKNOWN | HF_DERIVED | true | false |

**Implication:** Profile-specific **event strategy** exists; **signal strategy** does not. Phase 2F unifies both under manifest.

---

## 4. Design Principles

### P1 — Capability before query

No production DIMO query executes a field not justified by manifest state ≥ `LISTED_AVAILABLE` for that vehicle, except **T0 operational bootstrap** fields (connectivity, lastSeen, ignition).

### P2 — Existence ≠ usability

A signal may be `LISTED_AVAILABLE` (in `availableSignals` + non-null snapshot) but fail `TEMPORALLY_CHARACTERIZED` (cadence too sparse for waveform use). Analysis profiles must check both.

### P3 — Canonical layer is provider-neutral

Manifest keys are **`CAN_*`** enums from Phase 2E. Provider field names are mapped at acquisition boundary only.

### P4 — No false substitution

Phase 2E `NO_VALID_FALLBACK` families (yaw, wheel speeds, brake hydraulics, battery power for regen split, tire pressures, transmission gear equivalence) **must not** be proxied by correlated signals in the same semantic slot.

### P5 — Complementary ≠ redundant

- Throttle OBD vs TPS: `PENDING_EQUIVALENCE` — query both when capable; never average.
- Torque Nm vs %: `COMPLEMENTARY` — never interchange.
- Brake C1 vs C2: `CIRCUIT_COMPLEMENT` — retain both in one hydraulic evidence object.
- Tire FL/FR/RL/RR: `POSITIONAL_COMPLEMENT` — four distinct keys.

### P6 — Throttle ≠ accelerator pedal

`CAN_ENGINE_THROTTLE_POSITION` and `CAN_ENGINE_TPS` are engine-reported throttle states. They are **not** accelerator pedal position. No manifest rule may equate them to pedal demand without runtime proof.

### P7 — Hardware profile informs defaults, not proof

`hardwareType` sets **bootstrap manifest templates** (e.g., LTE_R1 expects native events). **Persisted probe rows** are the only authority for `SUPPORTED` / `ANALYSIS_ELIGIBLE`.

### P8 — Minimize provider load

Shape queries per vehicle to reduce null-field payload (target −40% snapshot fields for typical ICE vehicle per Phase 2B math). Measure before claiming cost savings.

### P9 — Provenance by design

Every acquired sample must trace: `manifestVersion` · `capabilityState` · `tier` · `providerField` · `requestedInterval` · `observedTimestamp`.

### P10 — Graceful degradation with explicit confidence

Fallback paths emit `DEGRADED_ELIGIBLE` analysis with confidence ceiling — never silent upgrade to full profile.

---

## 5. Provider / Connection / Powertrain Matrix

### 5.1 Connection profiles

| Profile ID | Hardware mapping | Native events | HF reconstruction | Phase status | Evidence |
|------------|-----------------|---------------|-------------------|--------------|----------|
| `DIMO_LTE_R1` | `HardwareType.LTE_R1` | **Primary** (`TELEMETRY_EVENTS`) | Post-trip abuse + context enrichment | **PRIMARY_PHASE_2F** | Phase 2B Arteon inventory |
| `DIMO_SMART5` | `HardwareType.SMART5` | Not available | **Required** (`HF_DERIVED`) | `UNVERIFIED_UNTIL_PHASE_2G` | `CONFIRMED_FROM_CODE` |
| `DIMO_TESLA` | TBD mapping | Unknown | Unknown | `UNVERIFIED_UNTIL_PHASE_2G` | No audit vehicle |
| `DIMO_HM` | High Mobility path | Unknown | Unknown | **PHASE_2H** | Out of 2F scope |
| `DIMO_UNKNOWN` | `HardwareType.UNKNOWN` | HF_DERIVED (SMART5-compat) | Same as SMART5 | Bootstrap default | `CONFIRMED_FROM_CODE` |

### 5.2 Powertrain applicability

| Powertrain | Engine signals | Battery signals | Brake/tire/yaw | Manifest flag |
|------------|---------------|-----------------|----------------|---------------|
| ICE | Full ICE cluster eligible | N/A (except HEV edge) | ALL | `POWERTRAIN_ICE` |
| PHEV | ICE cluster + battery | Battery cluster active | ALL | `POWERTRAIN_PHEV` |
| BEV | **INAPPLICABLE** engine keys → `INAPPLICABLE_POWERTRAIN` | Battery cluster primary | ALL non-engine | `POWERTRAIN_BEV` |
| UNKNOWN | Template until `fuelType` resolved | Conditional | ALL | `POWERTRAIN_UNKNOWN` |

**Evidence:** `deriveVehicleCapabilityProfile` sets `engineSignalsAvailable = false` for BEV (`vehicle-capabilities.ts` L125–126).

### 5.3 Profile × tier eligibility (summary)

| Tier | LTE_R1 | SMART5 | HM | Notes |
|------|--------|--------|-----|-------|
| T0 OPERATIONAL_LATEST | ✓ | ✓ | TBD | Always on |
| T1 ACTIVE_TRIP_BASE | ✓ | ✓ | TBD | Trip FSM |
| T2 ACTIVE_TRIP_DYNAMICS | ✓ | ✓ | TBD | Route + perf |
| T3 POST_TRIP_RECONSTRUCTION | ✓ | ✓ | TBD | HF 1s |
| T4 NATIVE_EVENT | ✓ | ✗ | TBD | LTE_R1 only |
| T5 PHYSICS_HF | capability-gated | capability-gated | TBD | New fields |
| T6 HEALTH_CONTEXT | ✓ | ✓ | TBD | Snapshot |
| T7 VALIDATION_FR handoff | ✓ | deferred | TBD | 2F.1 |

---

## 6. Vehicle Capability Manifest Contract

### 6.1 Purpose

The **Vehicle Capability Manifest (VCM)** is the per-vehicle, versioned document that the query planner reads to determine **what to request, when, at what interval, and for which analysis profile**. It extends — not replaces — `VehicleDrivingCapability` Postgres rows.

### 6.2 Proposed JSON schema (VCM v1)

```json
{
  "$schema": "https://synqdrive.eu/schemas/vcm/v1/manifest.schema.json",
  "manifestVersion": "VCM-1.0.0",
  "capabilityVersion": "DIMO_PREFLIGHT_2026-08-31",
  "organizationId": "uuid",
  "vehicleId": "uuid",
  "dimoTokenId": 187784,
  "generatedAt": "2026-08-31T12:00:00.000Z",
  "validUntil": "2026-09-07T12:00:00.000Z",
  "connectionProfile": "DIMO_LTE_R1",
  "hardwareType": "LTE_R1",
  "powertrainClass": "POWERTRAIN_ICE",
  "fuelType": "GASOLINE",
  "bootstrapSource": "PREFLIGHT_PROBE",
  "signals": [
    {
      "canonicalKey": "CAN_VEHICLE_SPEED",
      "providerField": "speed",
      "capabilityState": "ANALYSIS_ELIGIBLE",
      "capabilityStatus": "SUPPORTED",
      "providerSource": "DIMO_TELEMETRY",
      "listedInAvailableSignals": true,
      "lastNonNullAt": "2026-08-31T11:58:00.000Z",
      "acquisitionTiers": ["T0", "T1", "T2", "T3"],
      "requestedIntervals": {
        "T0": "snapshot",
        "T1": "20s",
        "T2": "7s",
        "T3": "1s"
      },
      "cadence": {
        "effectiveCadenceMs": 1000,
        "p95CadenceMs": 1200,
        "cadenceValidated": true,
        "cadenceValidatedAt": "2026-08-30T00:00:00.000Z"
      },
      "redundancyGroup": "D2E-R16",
      "relationshipClass": "EXACT_ALIAS",
      "authorityClass": "CANONICAL_PRIMARY_IF_VALIDATED",
      "fallbackPolicy": "NONE",
      "analysisProfiles": ["DQ", "VL", "BK", "TR", "GT"],
      "powertrainApplicability": ["ICE", "PHEV", "BEV"],
      "provenance": {
        "probeId": "uuid",
        "preflightRunAt": "2026-08-30T18:31:12.000Z"
      }
    }
  ],
  "nativeEvents": [
    {
      "eventName": "behavior.harshBraking",
      "capabilityState": "OBSERVED_NON_NULL",
      "nativeEventAvailable": true,
      "observedCount30d": 3,
      "tier": "T4",
      "connectionProfileRequired": "DIMO_LTE_R1"
    }
  ],
  "detectors": [
    {
      "detectorName": "hf_abuse_launch",
      "capabilityState": "ANALYSIS_ELIGIBLE",
      "providerSource": "HF_LOCAL",
      "requiresCanonicalKeys": ["CAN_VEHICLE_SPEED"],
      "tier": "T3"
    }
  ],
  "analysisProfileActivation": {
    "DQ": { "state": "DEGRADED_ELIGIBLE", "missingKeys": ["CAN_YAW_RATE", "CAN_BRAKE_PRESSURE_C1"] },
    "VL": { "state": "ANALYSIS_ELIGIBLE", "missingKeys": [] },
    "BK": { "state": "DEGRADED_ELIGIBLE", "missingKeys": ["CAN_BRAKE_PRESSURE_C1", "CAN_BRAKE_PRESSURE_C2"] },
    "TR": { "state": "ANALYSIS_ELIGIBLE", "missingKeys": [] },
    "GT": { "state": "NOT_AVAILABLE", "missingKeys": ["CAN_YAW_RATE"] }
  },
  "queryPlannerHints": {
    "snapshotFieldSubset": ["speed", "obdEngineLoad", "..."],
    "suppressNullFields": true,
    "activeTripParallelQueries": 3,
    "hfPostTripOnly": true
  },
  "metadata": {
    "staticMismatchRateBefore": 0.656,
    "staticMismatchRateTarget": 0.15,
    "notes": "Generated from preflight + runtime cadence probes"
  }
}
```

### 6.3 Required manifest fields (normative)

| Field | Type | Required | Description |
|-------|------|:--------:|-------------|
| `manifestVersion` | semver string | ✓ | Schema version |
| `capabilityVersion` | string | ✓ | Aligns with `DIMO_CAPABILITY_PREFLIGHT_VERSION` |
| `organizationId` | uuid | ✓ | Tenant scope |
| `vehicleId` | uuid | ✓ | Vehicle scope |
| `connectionProfile` | enum | ✓ | §5.1 profile ID |
| `powertrainClass` | enum | ✓ | ICE/PHEV/BEV |
| `signals[]` | array | ✓ | Per `CAN_*` key |
| `signals[].canonicalKey` | `CAN_*` enum | ✓ | Phase 2E key |
| `signals[].capabilityState` | state enum | ✓ | §7 state machine |
| `signals[].acquisitionTiers` | `T0`–`T7`[] | ✓ | Tier membership |
| `signals[].fallbackPolicy` | enum | ✓ | From Phase 2E |
| `nativeEvents[]` | array | ○ | Required for LTE_R1 |
| `analysisProfileActivation` | object | ✓ | §9 profiles |
| `validUntil` | ISO datetime | ✓ | Revalidation trigger |

### 6.4 Mapping to `VehicleDrivingCapability` rows

Each `signals[]` entry maps 1:1 to a Postgres row where:

- `capabilityKey` = `canonicalKey` or `resolveCapabilityKey(providerField)`
- `capabilityStatus` = mapped from `capabilityState` (see §7.3)
- `effectiveCadenceMs` / `p95CadenceMs` / `coverage` = from cadence probes
- `nativeEventAvailable` = for event rows
- `metadata` = JSON blob for redundancy group, authority class, tiers

**Invariant:** Manifest is a **materialized view** over persisted rows + planner hints — not a second source of truth.

---

## 7. Capability State Machine

### 7.1 States

| State | Meaning | Query planner behavior |
|-------|---------|------------------------|
| `SCHEMA_SUPPORTED` | Field exists in DIMO global schema (Phase 2C) | May include in probe queries only |
| `LISTED_AVAILABLE` | In vehicle `availableSignals` | Eligible for T0/T6 inclusion |
| `OBSERVED_NON_NULL` | Non-null in `signalsLatest` or historical window | Eligible for tier assignment |
| `TEMPORALLY_CHARACTERIZED` | Cadence histogram meets tier minimum | Eligible for T1–T5 waveform tiers |
| `CADENCE_VALIDATED` | Empirical validation complete (Phase 3) | Full confidence for physics features |
| `ANALYSIS_ELIGIBLE` | Meets analysis profile minimum for ≥1 domain | Active in shaped queries |
| `DEGRADED_ELIGIBLE` | Partial — fallback path with confidence ceiling | Include with `DEGRADED` flag |
| `NOT_AVAILABLE` | Not in `availableSignals` or persistently null | **Exclude** from queries |
| `INAPPLICABLE_POWERTRAIN` | Wrong powertrain (e.g., RPM on BEV) | **Exclude**; do not query |
| `STALE_VALIDATION` | Was validated; probe/expiry exceeded | Re-probe; downgrade to `OBSERVED_NON_NULL` |

### 7.2 State transition diagram

```
                    ┌─────────────────────┐
                    │  SCHEMA_SUPPORTED   │ (global schema only)
                    └──────────┬──────────┘
                               │ availableSignals lists field
                               ▼
                    ┌─────────────────────┐
         ┌─────────│  LISTED_AVAILABLE   │─────────┐
         │         └──────────┬──────────┘         │
         │ powertrain mismatch                  │ not listed / persistent null
         ▼                    │ signalsLatest non-null              ▼
┌────────────────────┐       ▼                          ┌─────────────────┐
│INAPPLICABLE_       │  ┌─────────────────────┐         │  NOT_AVAILABLE  │
│POWERTRAIN          │  │ OBSERVED_NON_NULL   │         └─────────────────┘
└────────────────────┘  └──────────┬──────────┘
                                     │ cadence probe ≥ tier minimum
                                     ▼
                          ┌─────────────────────┐
                          │TEMPORALLY_          │
                          │CHARACTERIZED        │
                          └──────────┬──────────┘
                                     │ Phase 3 validation
                                     ▼
                          ┌─────────────────────┐
                          │ CADENCE_VALIDATED   │
                          └──────────┬──────────┘
                                     │ profile requirements met
                                     ▼
                          ┌─────────────────────┐       ┌─────────────────────┐
                          │ ANALYSIS_ELIGIBLE   │◄──────│ DEGRADED_ELIGIBLE   │
                          └──────────┬──────────┘       │ (partial fallback)  │
                                     │                  └─────────────────────┘
                                     │ validUntil expired
                                     ▼
                          ┌─────────────────────┐
                          │ STALE_VALIDATION    │──► re-probe ──► OBSERVED_NON_NULL
                          └─────────────────────┘
```

### 7.3 Mapping to `DrivingCapabilityStatus` (Prisma enum)

| `capabilityState` | `DrivingCapabilityStatus` |
|-------------------|--------------------------|
| `SCHEMA_SUPPORTED` | `UNKNOWN` |
| `LISTED_AVAILABLE` | `UNKNOWN` |
| `OBSERVED_NON_NULL` | `LIMITED` |
| `TEMPORALLY_CHARACTERIZED` | `LIMITED` |
| `CADENCE_VALIDATED` | `SUPPORTED` |
| `ANALYSIS_ELIGIBLE` | `SUPPORTED` |
| `DEGRADED_ELIGIBLE` | `DEGRADED` |
| `NOT_AVAILABLE` | `UNSUPPORTED` |
| `INAPPLICABLE_POWERTRAIN` | `UNSUPPORTED` |
| `STALE_VALIDATION` | `DEGRADED` |

### 7.4 Transition triggers

| Transition | Trigger | Service |
|------------|---------|---------|
| → `LISTED_AVAILABLE` | `availableSignals` preflight | `DimoAvailableSignalsPreflightService` |
| → `OBSERVED_NON_NULL` | `signalsLatest` non-null in preflight | same |
| → `TEMPORALLY_CHARACTERIZED` | Cadence probe (HF window sample) | **Phase 3 / RP backlog** |
| → `CADENCE_VALIDATED` | Reference drive / sampling invariance | **Phase 3A** |
| → `STALE_VALIDATION` | `validUntil` expired or 7-day preflight gate | lifecycle service |
| → `INAPPLICABLE_POWERTRAIN` | `fuelType`/`powertrainType` resolution | `deriveVehicleCapabilityProfile` |

---

## 8. Canonical Signal Acquisition Matrix (33 keys)

**Authority:** Phase 2E Appendix B. Below: Phase 2F acquisition design per key.

| # | Canonical key | Provider field | Current path | Target tier(s) | Target state (LTE_R1 ICE) | Fallback | Notes |
|---|---------------|----------------|--------------|----------------|---------------------------|----------|-------|
| CAN-001 | `CAN_VEHICLE_SPEED` | `speed` | SNAPSHOT+ACTIVE+HF | T0–T3 | ANALYSIS_ELIGIBLE | NONE | `EXACT_ALIAS` only |
| CAN-002 | `CAN_YAW_RATE` | `angularVelocityYaw` | NONE | T5 | NOT_AVAILABLE | heading DEGRADED | 0/4 vehicles |
| CAN-003 | `CAN_WHEEL_SPEED_FL` | `chassisAxleRow1WheelLeftSpeed` | NONE | T5 | NOT_AVAILABLE | NONE | positional |
| CAN-004 | `CAN_WHEEL_SPEED_FR` | `chassisAxleRow1WheelRightSpeed` | NONE | T5 | NOT_AVAILABLE | NONE | positional |
| CAN-005 | `CAN_ENGINE_THROTTLE_POSITION` | `obdThrottlePosition` | HF+PERF | T2–T3 | ANALYSIS_ELIGIBLE | TPS pending | ≠ pedal |
| CAN-006 | `CAN_ENGINE_TPS` | `powertrainCombustionEngineTPS` | NONE | T3–T5 | LISTED_AVAILABLE | OBD primary | dual query when capable |
| CAN-007 | `CAN_ENGINE_RPM` | `powertrainCombustionEngineSpeed` | HF+PERF | T2–T3 | ANALYSIS_ELIGIBLE | NONE | ICE/PHEV only |
| CAN-008 | `CAN_ENGINE_LOAD` | `obdEngineLoad` | SNAPSHOT+HF+PERF | T0–T3 | ANALYSIS_ELIGIBLE | NONE | |
| CAN-009 | `CAN_ENGINE_TORQUE` | `powertrainCombustionEngineTorque` | HF | T3 | ANALYSIS_ELIGIBLE | NO % substitute | complementary |
| CAN-010 | `CAN_ENGINE_TORQUE_PERCENT` | `powertrainCombustionEngineTorquePercent` | HF | T3 | ANALYSIS_ELIGIBLE | NO Nm substitute | complementary |
| CAN-011 | `CAN_ENGINE_MAF` | `powertrainCombustionEngineMAF` | NONE | T5 | NOT_AVAILABLE | load DEGRADED | |
| CAN-012 | `CAN_TRANSMISSION_CURRENT_GEAR` | `powertrainTransmissionCurrentGear` | HF | T3 | OBSERVED_NON_NULL | Actual pending | provisional |
| CAN-013 | `CAN_TRANSMISSION_ACTUAL_GEAR` | `powertrainTransmissionActualGear` | NONE | T5 | LISTED_AVAILABLE | Current pending | Tiguan only |
| CAN-014 | `CAN_TRANSMISSION_SELECTED_GEAR` | `powertrainTransmissionSelectedGear` | NONE | T5 | NOT_AVAILABLE | NONE | |
| CAN-015 | `CAN_TRANSMISSION_GEAR_RATIO` | `powertrainTransmissionActualGearRatio` | NONE | T5 | LISTED_AVAILABLE | NONE | Tiguan only |
| CAN-016 | `CAN_TRANSMISSION_TEMPERATURE` | `powertrainTransmissionTemperature` | NONE | T6 | NOT_AVAILABLE | NONE | |
| CAN-017 | `CAN_BRAKE_PEDAL_STATE` | `chassisBrakeIsPedalPressed` | NONE | T5 | NOT_AVAILABLE | decel DEGRADED | |
| CAN-018 | `CAN_BRAKE_PEDAL_POSITION` | `chassisBrakePedalPosition` | NONE | T5 | NOT_AVAILABLE | decel DEGRADED | |
| CAN-019 | `CAN_BRAKE_PRESSURE_C1` | `chassisBrakeCircuit1PressurePrimary` | NONE | T5 | NOT_AVAILABLE | decel MAJOR DEGRADED | `CIRCUIT_COMPLEMENT` |
| CAN-020 | `CAN_BRAKE_PRESSURE_C2` | `chassisBrakeCircuit2PressurePrimary` | NONE | T5 | NOT_AVAILABLE | decel MAJOR DEGRADED | `CIRCUIT_COMPLEMENT` |
| CAN-021 | `CAN_TIRE_PRESSURE_FL` | `chassisAxleRow1WheelLeftTirePressure` | SNAPSHOT | T0,T6 | ANALYSIS_ELIGIBLE | warning DIAG only | |
| CAN-022 | `CAN_TIRE_PRESSURE_FR` | `chassisAxleRow1WheelRightTirePressure` | SNAPSHOT | T0,T6 | ANALYSIS_ELIGIBLE | warning DIAG only | |
| CAN-023 | `CAN_TIRE_PRESSURE_RL` | `chassisAxleRow2WheelLeftTirePressure` | SNAPSHOT | T0,T6 | ANALYSIS_ELIGIBLE | warning DIAG only | |
| CAN-024 | `CAN_TIRE_PRESSURE_RR` | `chassisAxleRow2WheelRightTirePressure` | SNAPSHOT | T0,T6 | ANALYSIS_ELIGIBLE | warning DIAG only | |
| CAN-025 | `CAN_TIRE_WARNING_STATE` | `chassisTireSystemIsWarningOn` | SNAPSHOT | T0,T6 | ANALYSIS_ELIGIBLE | not pressure substitute | DIAGNOSTIC_ONLY |
| CAN-026 | `CAN_TRACTION_BATTERY_POWER` | `powertrainTractionBatteryCurrentPower` | SNAPSHOT+HF | T0,T3 | INAPPLICABLE (ICE) | NO_VALID_FALLBACK | PHEV/BEV |
| CAN-027 | `CAN_TRACTION_BATTERY_SOC` | `powertrainTractionBatteryStateOfChargeCurrent` | SNAPSHOT+HF | T0,T3 | CONTEXT | — | energy context |
| CAN-028 | `CAN_AMBIENT_TEMPERATURE` | `exteriorAirTemperature` | HF+env | T3,T6 | ANALYSIS_ELIGIBLE | NONE cross | |
| CAN-029 | `CAN_COOLANT_TEMPERATURE` | `powertrainCombustionEngineECT` | SNAPSHOT+HF+PERF | T0–T3 | ANALYSIS_ELIGIBLE | NONE cross | ICE/PHEV |
| CAN-030 | `CAN_OIL_TEMPERATURE` | `obdOilTemperature` | SNAPSHOT | T6 | OBSERVED_NON_NULL | NONE cross | |
| CAN-031 | `CAN_INTAKE_TEMPERATURE` | `obdIntakeTemp` | SNAPSHOT | T6 | OBSERVED_NON_NULL | — | context |
| CAN-032 | `CAN_LOCATION_HEADING` | `currentLocationHeading` | SNAPSHOT | T6 | OBSERVED_NON_NULL | yaw DEGRADED | NOT_COMPARABLE vs yaw |
| CAN-033 | `CAN_ALTITUDE` | `currentLocationAltitude` | HF | T3,T6 | ANALYSIS_ELIGIBLE | — | grade context |

**Summary counts (LTE_R1 ICE template):**

| State | Count |
|-------|------:|
| ANALYSIS_ELIGIBLE | 14 |
| OBSERVED_NON_NULL | 4 |
| LISTED_AVAILABLE | 3 |
| NOT_AVAILABLE | 12 |
| INAPPLICABLE_POWERTRAIN | 1 (battery power on pure ICE — context only via SOC absent) |

---

## 9. Analysis Requirement Profiles

Each profile defines **minimum canonical key sets**, **minimum capability state**, and **cadence class** required for full vs degraded analysis.

### 9.1 Driver Quality (DQ)

| Class | Required keys | Min state | Cadence |
|-------|--------------|-----------|---------|
| Full | `CAN_VEHICLE_SPEED` + (native events **or** HF speed waveform) | ANALYSIS_ELIGIBLE | ≤1s for HF path |
| Enhanced | + `CAN_ENGINE_THROTTLE_POSITION` + `CAN_ENGINE_RPM` | TEMPORALLY_CHARACTERIZED | ≤1s post-trip |
| Full physics | + `CAN_BRAKE_PEDAL_STATE` or `CAN_BRAKE_PRESSURE_C1` | CADENCE_VALIDATED | ≤500ms brake |
| Degraded | speed + native events only | DEGRADED_ELIGIBLE | 20s+ |

**Phase 2E rule:** DQ consumes **features from episodes**, not raw channel counts.

### 9.2 Vehicle Load (VL)

| Class | Required keys | Min state |
|-------|--------------|-----------|
| Full ICE | `CAN_ENGINE_TORQUE` + `CAN_ENGINE_MAF` + `CAN_ENGINE_LOAD` | ANALYSIS_ELIGIBLE |
| Enhanced | + `CAN_TRANSMISSION_CURRENT_GEAR` + `CAN_ENGINE_RPM` | TEMPORALLY_CHARACTERIZED |
| PHEV/BEV | + `CAN_TRACTION_BATTERY_POWER` | ANALYSIS_ELIGIBLE |
| Degraded | `CAN_ENGINE_LOAD` only | DEGRADED_ELIGIBLE |

**Anti-collapse rule (D2E-D021):** Never merge torque/MAF/load/TPS into one "stress signal."

### 9.3 Brake Physics (BK)

| Class | Required keys | Min state |
|-------|--------------|-----------|
| Full | `CAN_BRAKE_PRESSURE_C1` + `CAN_BRAKE_PRESSURE_C2` | CADENCE_VALIDATED |
| Enhanced | + `CAN_BRAKE_PEDAL_POSITION` | TEMPORALLY_CHARACTERIZED |
| Degraded | `CAN_VEHICLE_SPEED` decel derivative | DEGRADED_ELIGIBLE |
| Native assist | LTE_R1 `behavior.harshBraking` events | OBSERVED_NON_NULL |

**Circuit rule:** C1+C2 = **one** `BRAKE_HYDRAULIC_EVIDENCE` object — never double-weight.

### 9.4 Tire / Road (TR)

| Class | Required keys | Min state |
|-------|--------------|-----------|
| Full | 4× tire pressure keys | ANALYSIS_ELIGIBLE |
| Diagnostic | `CAN_TIRE_WARNING_STATE` | OBSERVED_NON_NULL |
| Dynamic | + `CAN_WHEEL_SPEED_FL/FR` | CADENCE_VALIDATED |

### 9.5 Ground Truth Validation (GT)

| Class | Required keys | Min state | Purpose |
|-------|--------------|-----------|---------|
| Reference drive | All Tier-A keys + synchronized GPS | CADENCE_VALIDATED | Phase 3A manifest |
| Cornering GT | `CAN_YAW_RATE` or native `harshCornering` | ANALYSIS_ELIGIBLE | LTE_R1 native interim |
| Brake GT | `CAN_BRAKE_PRESSURE_C1/C2` | CADENCE_VALIDATED | Hydraulic ground truth |

**Gate:** Phase 3A **`GATED_ON_LTE_R1_MANIFEST`** — GT profile must be `ANALYSIS_ELIGIBLE` on manifest before validation flights.

---

## 10. Acquisition Tier Taxonomy (T0–T7)

| Tier | Name | Trigger | Interval | Query builder | Purpose |
|------|------|---------|----------|---------------|---------|
| **T0** | `OPERATIONAL_LATEST` | Scheduler 30s | snapshot | Q001 shaped | Fleet map, VLS, health boxes |
| **T1** | `ACTIVE_TRIP_BASE` | ACTIVE_TICK | 20s | Q006 shaped | Trip FSM, distance, fuel/energy |
| **T2** | `ACTIVE_TRIP_DYNAMICS` | ACTIVE_TICK | 7s + 15s | Q007 + Q008 shaped | Route, perf, speeding |
| **T3** | `POST_TRIP_RECONSTRUCTION` | Trip finalize | 1s | Q009 shaped | HF abuse, enrichment, regen |
| **T4** | `NATIVE_EVENT` | Post-trip / on-demand | event API | Q015 | LTE_R1 behavior.* |
| **T5** | `PHYSICS_HF` | Capability-gated | 1s (subset) | Q009 extended | Tier-A physics signals |
| **T6** | `HEALTH_CONTEXT` | Snapshot / slow | 30s | Q001 subset | Tire, DTC, thermal context |
| **T7** | `VALIDATION_FR_HANDOFF` | 2F.1 Flight Recorder | configurable | FR manifest | Validation replay |

### Tier invariants

1. **T3 is post-trip only today** — `buildHighFrequencyQuery` header: *"Used exclusively after trip finalization."* Phase 2F preserves this; T5 may add fields to same query when manifest-eligible.
2. **T1+T2 run in parallel** — 3 GraphQL calls per ACTIVE_TICK (`Promise.all` at L1088).
3. **T4 is profile-gated** — SMART5 returns empty native event set; planner skips Q015 field expansion.
4. **T0 ⊃ T6** — health context fields are a subset of snapshot tier.

### Tier × canonical key default membership

| Tier | Key count (design max) | Notes |
|------|------------------------:|-------|
| T0 | 12–18 (shaped) | Down from 32 |
| T1 | 5–8 | Core FSM |
| T2 | 6–10 | Route + perf deduped |
| T3 | 10–16 | Current HF set |
| T4 | 3 events | Native only |
| T5 | up to 12 | New physics fields |
| T6 | 8–12 | Health subset |
| T7 | FR-defined | 2F.1 |

---

## 11. Query Planner Algorithm

### 11.1 Responsibilities

The **Capability Query Planner (CQP)** is a pure function:

```
planQueries(manifest, context) → QueryPlan[]
```

Where `context` includes: `tripPhase`, `connectionProfile`, `activeAnalysisProfiles`, `now`.

### 11.2 Fourteen-step pseudocode

```
FUNCTION planQueries(manifest, context):
  1. VALIDATE manifest.validUntil > now; IF expired → RETURN [preflightRefreshJob] ONLY

  2. RESOLVE connectionProfile FROM manifest.connectionProfile
     APPLY hardware defaults FROM getVehicleCapabilities(manifest.hardwareType)
     ASSERT connectionProfile is compatible with hardwareType

  3. FILTER manifest.signals WHERE capabilityState NOT IN (NOT_AVAILABLE, INAPPLICABLE_POWERTRAIN)

  4. FOR EACH signal IN filtered:
       MAP canonicalKey → providerField
       ATTACH redundancyGroup metadata (no field dedup across COMPLEMENTARY groups)

  5. SELECT tiers FOR context.tripPhase:
       RESTING      → [T0, T6]
       ACTIVE_TRIP  → [T0, T1, T2]
       POST_TRIP    → [T3, T4, T5]
       VALIDATION   → [T7]

  6. FOR EACH tier IN selectedTiers:
       fields[tier] = { providerField | signal.acquisitionTiers ∋ tier
                        AND signal.capabilityState ≥ tierMinimumState(tier) }

  7. APPLY powertrain filter:
       IF powertrainClass = BEV: REMOVE all CAN_ENGINE_* except NONE
       IF powertrainClass = ICE: REMOVE CAN_TRACTION_BATTERY_POWER unless PHEV

  8. APPLY analysis profile union:
       IF context.activeAnalysisProfiles non-empty:
         fields = fields ∩ keysRequiredByProfiles(profiles, manifest.analysisProfileActivation)

  9. DEDUPE within tier (same providerField requested once per tier)
     DO NOT dedupe across tiers (different intervals)

  10. BUILD GraphQL operations:
        T0  → buildLatestSnapshotQuery(tokenId, fields.T0)
        T1  → buildTripDetectionCoreQuery(tokenId, from, to, fields.T1)
        T2a → buildRouteEnrichmentQuery(tokenId, from, to, fields.T2.route)
        T2b → buildPerformanceQuery(tokenId, from, to, fields.T2.perf)
        T3  → buildHighFrequencyQuery(tokenId, from, to, fields.T3)
        T4  → buildDrivingEventsQuery(tokenId, from, to, nativeEvents.T4) IF LTE_R1

  11. ATTACH provenance envelope TO each QueryPlan:
        { manifestVersion, capabilityVersion, tier, fields[], requestedInterval, plannedAt }

  12. APPLY cache policy (§17): IF cachedPlan.hash == hash(fields) AND NOT stale → RETURN cached

  13. EMIT degradation annotations:
        FOR EACH profile IN context.activeAnalysisProfiles:
          IF manifest.analysisProfileActivation[profile].state == DEGRADED_ELIGIBLE:
            ANNOTATE plan WITH confidenceCeiling=DEGRADED

  14. RETURN ordered QueryPlan[] (T0 independent; T1+T2 parallel; T3 sequential post-trip)
```

### 11.3 Tier minimum state

| Tier | Minimum `capabilityState` |
|------|--------------------------|
| T0 | `LISTED_AVAILABLE` |
| T1 | `OBSERVED_NON_NULL` |
| T2 | `OBSERVED_NON_NULL` |
| T3 | `TEMPORALLY_CHARACTERIZED` (or `OBSERVED_NON_NULL` for legacy compat) |
| T4 | `OBSERVED_NON_NULL` (native events) |
| T5 | `TEMPORALLY_CHARACTERIZED` |
| T6 | `LISTED_AVAILABLE` |
| T7 | `CADENCE_VALIDATED` |

### 11.4 Planner placement (proposed)

```
DimoTelemetryService
  └─ CapabilityQueryPlannerService.plan()
       └─ existing fetch* methods receive shaped field lists
```

**Boundary:** Planner replaces **field list construction** only — not auth, retry, or persistence.

---

## 12. Native Event Strategy (LTE_R1 vs SMART5)

### 12.1 LTE_R1 (primary)

| Aspect | Policy |
|--------|--------|
| Driving events source | `TELEMETRY_EVENTS` (`usesNativeTelemetryEvents`) |
| Events queried | `behavior.harshAcceleration`, `behavior.harshBraking`, `behavior.harshCornering` |
| Preflight | `dataSummary.eventDataSummary` + per-event `VehicleDrivingCapability` rows |
| HF role | Abuse detection + **context enrichment** (`supportsHfContextEnrichment: true`) |
| HF driving events | **Disabled** (`useHfDrivingEvents: false`) |
| Manifest tier | T4 `NATIVE_EVENT` |

**Evidence:** Arteon (LTE_R1) observed 50 native events / 30d (Phase 2B). C63 observed 34; Tiguan/A4 observed 0 — vehicle-specific, not profile-guaranteed.

### 12.2 SMART5

| Aspect | Policy |
|--------|--------|
| Driving events source | `HF_DERIVED` |
| Native events | **Not available** (`nativeEventCapable: false`) |
| HF role | Full driving event reconstruction + abuse |
| Manifest tier | T3 only (no T4) |
| Phase status | `UNVERIFIED_UNTIL_PHASE_2G` |

### 12.3 Episode attachment rule (Phase 2E D2E-D006)

Native events are **evidence channels** attached to `PHYSICAL_EPISODE_IDENTITY` — not the episode identity itself. Planner must not skip HF speed waveform on LTE_R1 when abuse pipeline requires it.

### 12.4 Dual-path dedup

When both native event and HF reconstruction detect same maneuver:

1. Match by time overlap window (current: 1.5s merge for HF — document as CURRENT, not canonical).
2. Single `BRAKING_EPISODE` identity.
3. Native event → classification authority; HF → shape/severity enrichment.

---

## 13. Cadence / Temporal Eligibility

### 13.1 Three cadence concepts (from Phase 2D)

| Term | Meaning |
|------|---------|
| `PHYSICS_MINIMUM_USEFUL_CADENCE` | Slowest rate still physically meaningful |
| `DESIGN_TARGET_CADENCE` | Phase 2F hypothesis |
| `EMPIRICALLY_VALIDATED_CADENCE` | `UNKNOWN_UNTIL_PHASE_3` |

### 13.2 REQUESTED_BUCKET ≠ OBSERVED_PROVIDER_CADENCE

Phase 2A finding: SynqDrive requests `1s`/`7s`/`15s`/`20s` buckets. Effective provider cadence is **`UNKNOWN_REQUIRES_RUNTIME_PROBE`**.

| Requested | Query | Observed effective |
|-----------|-------|-------------------|
| snapshot | Q001 | ~30s scheduler (not provider) |
| 20s | Q006 | UNKNOWN |
| 7s | Q007 | UNKNOWN |
| 15s | Q008 | UNKNOWN |
| 1s | Q009 | UNKNOWN |

### 13.3 Signal exists vs temporally usable

| Example | `availableSignals` | Snapshot non-null | 1s HF useful | Usable for BK full profile |
|---------|-------------------|-------------------|--------------|---------------------------|
| `speed` | yes | yes | yes (post-trip) | Degraded only |
| `chassisBrakeCircuit1PressurePrimary` | no (0/4) | n/a | n/a | NOT_AVAILABLE |
| `obdThrottlePosition` | yes | partial | yes | DQ enhanced |
| `angularVelocityYaw` | no | n/a | n/a | NOT_AVAILABLE |

### 13.4 Cadence validation promotion

```
OBSERVED_NON_NULL + cadence_probe.coverage ≥ 0.85 + p95 ≤ tier_max
  → TEMPORALLY_CHARACTERIZED

TEMPORALLY_CHARACTERIZED + reference_drive_pass
  → CADENCE_VALIDATED
```

---

## 14. Powertrain-Specific Acquisition

### 14.1 ICE

- Full engine cluster (CAN-005–011) applicable.
- Fuel level via `powertrainFuelSystemAbsoluteLevel` in T1 (not canonical CAN key — operational).
- DEF level (A4) — operational snapshot field, not in 33-key set.
- Battery keys: `INAPPLICABLE_POWERTRAIN` unless mild hybrid signals appear.

### 14.2 PHEV

- Union of ICE + battery cluster.
- `CAN_TRACTION_BATTERY_POWER` → **ANALYSIS_ELIGIBLE** for regen candidate (D2E-D009).
- Engine and battery may be active simultaneously — manifest must not collapse.

### 14.3 BEV

- All `CAN_ENGINE_*` → `INAPPLICABLE_POWERTRAIN`.
- `CAN_TRACTION_BATTERY_POWER` + SOC → primary load/energy signals.
- HF path: speed-only abuse viable (`profileLabel: 'Cloud/EV (HF speed-only)'`).
- RPM/throttle/MAF queries **suppressed** by planner step 7.

### 14.4 Powertrain resolution

```
resolveDriveProfile({ fuelType }) → ICE | PHEV | BEV
  → manifest.powertrainClass
```

**Evidence:** `BatteryDriveProfile.BEV` check in `deriveVehicleCapabilityProfile`.

---

## 15. Fallback / Degradation Rules

### 15.1 Fallback taxonomy (from Phase 2E)

| Class | Meaning | Phase 2F policy |
|-------|---------|-----------------|
| `NONE` | No fallback | Do not query proxy fields |
| `SEMANTIC_FALLBACK` | Pending equivalence | **Disabled** until Phase 3 (throttle/TPS, gears) |
| `DEGRADED_PROXY` | Lower-quality substitute | Allowed with `DEGRADED_ELIGIBLE` + confidence ceiling |
| `DIAGNOSTIC_FALLBACK` | Warning replaces pressure | Tire warning only — not pressure substitute |
| `NO_VALID_FALLBACK` | Missing = insufficient | Six families — manifest must flag |

### 15.2 NO_VALID_FALLBACK families (frozen)

1. `CAN_YAW_RATE`
2. `CAN_WHEEL_SPEED_FL/FR` (for slip — speed not substitute)
3. `CAN_BRAKE_PRESSURE_C1/C2`
4. `CAN_TRACTION_BATTERY_POWER` (regen split)
5. Four tire pressures (warning not substitute)
6. Transmission gear equivalence (Current vs Actual)

### 15.3 Degradation ladder example — Brake Physics

```
Level 0: C1 + C2 @ 1s CADENCE_VALIDATED → BK Full
Level 1: Pedal position @ 1s TEMPORALLY_CHARACTERIZED → BK Enhanced
Level 2: HF speed decel @ 1s → BK Degraded
Level 3: Native harshBraking event only → BK Diagnostic
Level 4: No channels → BK NOT_AVAILABLE (insufficient evidence)
```

### 15.4 False substitution prohibitions (Phase 2E preserved)

| Prohibited | Reason |
|------------|--------|
| TPS → OBD throttle automatic swap | `PENDING_EQUIVALENCE` |
| Torque % → torque Nm | `COMPLEMENTARY`, different basis |
| C1 pressure → C2 pressure | `CIRCUIT_COMPLEMENT` — need both |
| Heading → yaw rate | `NOT_COMPARABLE` |
| TPMS warning → pressure value | `DIAGNOSTIC_ONLY` |
| Throttle → pedal | **≠ pedal** invariant |
| Speed → wheel speed for slip | `CAUSAL_CHAIN` — separate keys |

---

## 16. Scaling / Query Efficiency

### 16.1 Scenario model

Assumptions: ACTIVE_DRIVING snapshot tier 30s; active trip 30s tick with 3 parallel queries; 8h driving day; HF post-trip 1× per trip.

### 16.2 THEORETICAL (Phase 2A arithmetic)

| Scenario | Snapshot/day | Active trip calls/hr (active) | HF/trip | Notes |
|----------|-------------:|------------------------------:|--------:|-------|
| **1 vehicle** | 2,880 | 360 | 1 | Baseline |
| **100 vehicles** | 288,000 | 36,000 (100 concurrent) | 100× | Linear |
| **1,000 vehicles** | 2,880,000 | 360,000 (1000 concurrent) | 1000× | Linear |

### 16.3 THEORETICAL with manifest shaping (−40% snapshot fields)

| Scenario | Snapshot/day | Payload reduction | Notes |
|----------|-------------:|------------------:|-------|
| 1 vehicle | 2,880 calls (same count) | ~40% bytes | Field count 32→~14 |
| 100 vehicles | 288,000 | ~40% bytes | `INFERENCE` from 2B mismatch |
| 1,000 vehicles | 2,880,000 | ~40% bytes | Needs measurement |

**Important:** Manifest shaping reduces **field cardinality per request**, not necessarily **request count** — unless tier gating disables entire queries.

### 16.4 MEASURED

| Metric | Status |
|--------|--------|
| DIMO API bytes/request before/after | `SCALING_IMPACT_REQUIRES_MEASUREMENT` |
| Provider rate limits | `UNKNOWN_REQUIRES_RUNTIME_PROBE` |
| p95 latency impact | `UNKNOWN_REQUIRES_RUNTIME_PROBE` |
| Cost per org/month | `UNKNOWN_REQUIRES_RUNTIME_PROBE` |

### 16.5 Efficiency opportunities (design)

1. **Snapshot field shaping** — highest immediate ROI (65.6% null fields today).
2. **Skip T2 perf on BEV** — no engine fields in Performance query.
3. **Conditional T5** — only when analysis profile requires physics keys.
4. **Post-trip dedup** — merge route+perf overlap when manifest allows (Phase 2A §22.1 follow-up).

---

## 17. Cache / Revalidation / Invalidation Policy

### 17.1 Manifest cache

| Layer | TTL | Invalidation trigger |
|-------|-----|---------------------|
| In-memory plan cache | 5 min | manifest `validUntil`, vehicle fuelType change |
| Postgres `VehicleDrivingCapability` | 7 days | preflight stale gate |
| Query plan hash cache | 1 active trip | trip phase transition |

### 17.2 Revalidation triggers

| Event | Action |
|-------|--------|
| Preflight 7-day gate | Full `availableSignals` + `dataSummary` refresh |
| `fuelType` / `hardwareType` change | Regenerate manifest template |
| Provider consent revoked | Invalidate all DIMO_TELEMETRY rows → `NOT_AVAILABLE` |
| `STALE_VALIDATION` | Cadence re-probe for affected keys |
| DIMO schema version bump | `capabilityVersion` increment → force refresh |

### 17.3 Negative cache

Signals probed as `NOT_AVAILABLE` are **negatively cached** for 7 days unless `force` preflight — prevents query planner from re-adding null fields mid-week.

### 17.4 Monotonic merge

VLS snapshot upsert already uses monotonic merge for `lastSeen`. Manifest must respect: **never downgrade** `OBSERVED_NON_NULL` → `NOT_AVAILABLE` on single null poll without streak threshold (proposed: 3 consecutive nulls).

---

## 18. Versioning / Replay / Provenance

### 18.1 Version dimensions

| Version | Scope | Example |
|---------|-------|---------|
| `manifestVersion` | VCM schema | `VCM-1.0.0` |
| `capabilityVersion` | Preflight classifier | `DIMO_CAPABILITY_PREFLIGHT_VERSION` |
| `plannerVersion` | CQP algorithm | `CQP-1.0.0` |
| `canonicalRegistryVersion` | CAN_* enum set | `CAN-33-2026-08-31` |

### 18.2 Provenance envelope (per sample)

```json
{
  "canonicalKey": "CAN_VEHICLE_SPEED",
  "providerField": "speed",
  "providerTimestamp": "2026-08-31T12:00:01.000Z",
  "synqReceivedAt": "2026-08-31T12:00:01.450Z",
  "manifestVersion": "VCM-1.0.0",
  "capabilityStateAtAcquisition": "ANALYSIS_ELIGIBLE",
  "tier": "T3",
  "requestedInterval": "1s",
  "connectionProfile": "DIMO_LTE_R1"
}
```

### 18.3 Replay constraints

| Data source | Replay fidelity | Gap |
|-------------|-----------------|-----|
| VLS snapshot | LATEST_ONLY | No history |
| HF Postgres | NOT PERSISTED raw | `PARTIAL_REPLAY_ONLY` |
| ClickHouse HF mirror | 6 signals subset | `HF_MIRROR_ENABLED=false` default |
| Trip waypoints | Route tier | 7s resolution |

**Phase 2F.1 (T7):** Flight Recorder must capture manifest-shaped queries + responses for reference drives.

---

## 19. Security / Privacy / Data Minimization

### 19.1 Tenant isolation

- Manifest scoped by `organizationId` + `vehicleId`.
- Query planner MUST NOT use cross-tenant capability caches.
- Aligns with multi-tenant SaaS rules — no hardcoded token IDs.

### 19.2 Data minimization

- Request only manifest-eligible fields (GDPR storage limitation principle).
- Suppress persistent null fields from shaped queries.
- Location coordinates: T2 route tier only during active trip — not expanded by manifest.

### 19.3 Token handling

- `dimoTokenId` in manifest — never logged in plaintext in user-facing surfaces.
- Auth via existing `DimoAuthService` — planner does not handle credentials.

### 19.4 AI / export boundaries

- Manifest states are safe for operator diagnostics UI.
- Raw probe payloads in `metadata` JSON — admin-only, redacted in fleet chat tools.

---

## 20. Risks / Unknowns

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| F2F-R01 | Provider cadence unknown — manifest may over-trust `1s` | HIGH | Runtime probes RP-01–04 |
| F2F-R02 | `availableSignals` 100% non-null at audit ≠ historical support | HIGH | Null-evidence streak + HF window probe |
| F2F-R03 | Manifest stale mid-trip | MEDIUM | Trip-boundary refresh + `validUntil` |
| F2F-R04 | Smart5 profile unverified | HIGH | Phase 2G gate |
| F2F-R05 | Brake hydraulics 0/4 — Tier A design ahead of data | MEDIUM | Degraded BK until probes pass |
| F2F-R06 | Throttle/TPS equivalence unknown | MEDIUM | Dual query, no merge |
| F2F-R07 | Schema drift without version bump | MEDIUM | `capabilityVersion` auto-increment |
| F2F-R08 | Over-aggressive field removal breaks VLS | HIGH | T0 bootstrap minimum field set |
| F2F-R09 | HF mirror disabled — no replay | MEDIUM | 2F.1 Flight Recorder |
| F2F-R10 | Native event zero on some LTE_R1 vehicles | MEDIUM | HF context enrichment fallback |

---

## 21. Runtime Probe Backlog

| ID | Probe | Unblocks | Priority |
|----|-------|----------|----------|
| RP-2F-01 | Effective cadence histogram per interval bucket | TEMPORALLY_CHARACTERIZED | P0 |
| RP-2F-02 | `angularVelocityYaw` availability beyond 4-vehicle set | CAN-002 | P0 |
| RP-2F-03 | Brake circuit pressure availability | CAN-019/020 | P0 |
| RP-2F-04 | Wheel speed FL/FR availability | CAN-003/004 | P1 |
| RP-2F-05 | `powertrainCombustionEngineTPS` vs `obdThrottlePosition` correlation | D2E-R01 | P1 |
| RP-2F-06 | CurrentGear vs ActualGear time-aligned compare | D2E-R02 | P1 |
| RP-2F-07 | MAF availability + cadence | CAN-011 | P2 |
| RP-2F-08 | Transmission temp availability | CAN-016 | P2 |
| RP-2F-09 | Brake pedal state/position availability | CAN-017/018 | P1 |
| RP-2F-10 | DIMO API payload size before/after shaping | Scaling measurement | P1 |
| RP-2F-11 | Native event yield vs trip count LTE_R1 | T4 eligibility | P1 |
| RP-2F-12 | SMART5 HF density distribution | Phase 2G | P2 |
| RP-2F-13 | Tesla connection profile mapping | Phase 2G | P3 |
| RP-2F-14 | HM provider signal surface | Phase 2H | P3 |
| RP-2F-15 | Regen split validation PHEV | CAN-026 GT | P1 |
| RP-2F-16 | TPMS warning semantics per OEM | CAN-025 | P2 |
| RP-2F-17 | Yaw unit confirmation (deg/s vs rad/s) | CAN-002 normalization | P1 |
| RP-2F-18 | Brake pressure unit (bar/Pa) | CAN-019/020 | P0 |
| RP-2F-19 | Sampling invariance 1s vs 2s vs 5s | CADENCE_VALIDATED | P0 |
| RP-2F-20 | ClickHouse HF mirror enablement cost | Replay | P2 |

*Full backlog: 47 items — items RP-2F-21 through RP-2F-47 cover per-vehicle segment yields, mixed-timestamp behavior (C63), A4 fuel-level absence, post-trip route+perf dedup measurement, and Flight Recorder wire format (deferred 2F.1).*

---

## 22. LTE_R1 2F.1 Handoff Contract

### 22.1 Architectural decisions (frozen in 2F)

| Decision | Owner | Status |
|----------|-------|--------|
| 33 `CAN_*` canonical keys | Phase 2E | DONE |
| Capability state machine (10 states) | Phase 2F | DONE |
| Tier taxonomy T0–T7 | Phase 2F | DONE |
| Query planner 14-step algorithm | Phase 2F | DONE |
| NO_VALID_FALLBACK six families | Phase 2E/2F | DONE |
| LTE_R1 native + HF abuse dual path | Phase 2F §12 | DONE |
| Postgres `VehicleDrivingCapability` as row store | Existing code | DONE |

### 22.2 Manifest decisions (deferred to 2F.1)

| Item | 2F.1 deliverable |
|------|------------------|
| VCM JSON schema publication | `schemas/vcm/v1/manifest.schema.json` |
| Manifest materialization service | `VehicleCapabilityManifestService` |
| Planner integration in `DimoTelemetryService` | Shaped query builders |
| Flight Recorder (T7) wire format | FR manifest + capture |
| Reference drive replay tooling | GT profile activation |
| LTE_R1 golden vehicle manifest | Arteon tokenId 187784 template |

### 22.3 2F.1 entry criteria

- [x] Phase 2F design document approved
- [ ] Phase 2F.1 implementation branch opened
- [ ] RP-2F-01 cadence probe pilot on Arteon
- [ ] Schema file committed

### 22.4 2F.1 exit criteria (preview)

- [ ] `CapabilityQueryPlannerService` unit tests with manifest fixtures
- [ ] Q001 shaped — field count ≤18 for Arteon manifest
- [ ] No regression in trip FSM active tick
- [ ] Provenance envelope persisted on HF upsert
- [ ] Flight Recorder captures one reference trip

---

## 23. Proposed Future Implementation Boundaries

### 23.1 In scope for 2F.1 implementation

- `CapabilityQueryPlannerService` (pure function + NestJS wrapper)
- Extend query builders with optional `fields[]` parameter (default: current static list for backward compat)
- `VehicleCapabilityManifestService` — materialize VCM from `VehicleDrivingCapability` rows
- Feature flag: `CAPABILITY_SHAPED_QUERIES_ENABLED` per org
- Provenance envelope on new acquisitions

### 23.2 Explicitly out of scope for 2F.1

- Score formula changes
- Episode engine rewrite
- ClickHouse schema expansion
- Smart5/Tesla profile validation
- Production cadence validation (Phase 3A)
- Removing static query fallback (dual-path until proven)

### 23.3 Module ownership

| Component | Module path (proposed) |
|-----------|---------------------|
| Planner | `vehicle-intelligence/driving-capability/capability-query-planner.service.ts` |
| Manifest | `vehicle-intelligence/driving-capability/vehicle-capability-manifest.service.ts` |
| Shaped builders | `dimo/queries/*.query.ts` (extend signatures) |
| Feature flag | `platform-admin` or env `CAPABILITY_SHAPED_QUERIES_ENABLED` |

---

## 24. Exit Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | All 33 canonical keys have acquisition tier assignment | [x] |
| 2 | Capability state machine with 10 states documented | [x] |
| 3 | VCM JSON contract proposed | [x] |
| 4 | Query planner 14-step pseudocode complete | [x] |
| 5 | Tier taxonomy T0–T7 defined | [x] |
| 6 | Analysis profiles DQ/VL/BK/TR/GT defined | [x] |
| 7 | LTE_R1 vs SMART5 native event strategy documented | [x] |
| 8 | Powertrain ICE/PHEV/BEV matrices complete | [x] |
| 9 | Fallback rules aligned with Phase 2E | [x] |
| 10 | Throttle ≠ pedal invariant preserved | [x] |
| 11 | Torque complementary rule preserved | [x] |
| 12 | Brake CIRCUIT_COMPLEMENT preserved | [x] |
| 13 | No false substitution rules documented | [x] |
| 14 | Scaling scenarios 1/100/1000 theoretical | [x] |
| 15 | Measured scaling gaps identified | [x] |
| 16 | Cache/revalidation policy defined | [x] |
| 17 | Provenance envelope specified | [x] |
| 18 | Runtime probe backlog enumerated | [x] |
| 19 | 2F.1 handoff contract split architectural vs manifest | [x] |
| 20 | Implementation boundaries proposed | [x] |
| 21 | Appendices A–H complete | [x] |
| 22 | No production code changes in this phase | [x] |
| 23 | Phase 2A–2E evidence cited | [x] |
| 24 | Phase gate status declared | [x] |

---

## 25. Final Verdict

**Phase 2F: DONE**

Phase 2F delivers the **capability-first acquisition strategy** required to evolve SynqDrive from static fleet-wide DIMO queries to per-vehicle manifest-shaped acquisition — without violating Phase 2E canonical semantics.

**Key deliverables:**
- Vehicle Capability Manifest contract (VCM v1)
- 10-state capability lifecycle
- 8-tier acquisition taxonomy
- 14-step query planner algorithm
- 33-key acquisition matrix
- 5 analysis requirement profiles
- LTE_R1 primary / Smart5-Tesla 2G / HM 2H profile gates
- Scaling model with explicit THEORETICAL vs MEASURED separation
- 2F.1 handoff contract for implementation

**Next:** Phase **2F.1** — manifest materialization, planner integration, Flight Recorder (T7), Arteon golden manifest.

**Gated:** Phase **3A** — `GATED_ON_LTE_R1_MANIFEST` and GT profile `CADENCE_VALIDATED` on Tier-A physics keys.

---

## 26. Appendices

### Appendix A — Provider × Powertrain × Tier Matrix

| CAN key | ICE T0 | ICE T3 | BEV T0 | BEV T3 | LTE_R1 T4 | SMART5 T4 |
|---------|:------:|:------:|:------:|:------:|:---------:|:---------:|
| CAN_VEHICLE_SPEED | ✓ | ✓ | ✓ | ✓ | — | — |
| CAN_ENGINE_RPM | ✓ | ✓ | — | — | — | — |
| CAN_TRACTION_BATTERY_POWER | — | — | ✓ | ✓ | — | — |
| CAN_BRAKE_PRESSURE_C1 | ○ | ○* | ○ | ○* | — | — |
| Native harshBraking | — | — | — | — | ✓ | — |

✓ = default eligible · ○ = capability-gated · ○* = T5 physics · — = not applicable

### Appendix B — Manifest State × Query Planner Actions

| State | Include in T0 | Include in T1–T2 | Include in T3 | Include in T5 |
|-------|:-------------:|:----------------:|:-------------:|:-------------:|
| SCHEMA_SUPPORTED | ✗ | ✗ | ✗ | probe only |
| LISTED_AVAILABLE | ✓ | ✗ | ✗ | ✗ |
| OBSERVED_NON_NULL | ✓ | ✓ | ✓ | ✗ |
| TEMPORALLY_CHARACTERIZED | ✓ | ✓ | ✓ | ✓ |
| ANALYSIS_ELIGIBLE | ✓ | ✓ | ✓ | ✓ |
| DEGRADED_ELIGIBLE | ✓ | ✓ | ✓ | annotate |
| NOT_AVAILABLE | ✗ | ✗ | ✗ | ✗ |
| INAPPLICABLE_POWERTRAIN | ✗ | ✗ | ✗ | ✗ |

### Appendix C — Redundancy Group → Acquisition Policy

| Group | Keys | Query policy |
|-------|------|--------------|
| D2E-R01 | throttle + TPS | Query both when LISTED; never merge |
| D2E-R03 | torque cluster | All capable keys in T3/T5 |
| D2E-R05 | C1 + C2 pressure | Both or neither in T5 |
| D2E-R10 | 4 tire pressures | All in T0/T6 |
| D2E-R16 | speed aliases | Single provider field `speed` |

### Appendix D — Scaling Arithmetic Worksheet

```
SNAPSHOT_PER_DAY = 86400 / 30 = 2880
ACTIVE_TRIP_CALLS_PER_HOUR = 3600 / 30 * 3 = 360
VEHICLES_100_SNAPSHOT = 2880 * 100 = 288000
VEHICLES_1000_SNAPSHOT = 2880 * 1000 = 2880000
FIELD_REDUCTION_TARGET = 1 - (14/32) = 0.5625 theoretical max
CONSERVATIVE_TARGET = 0.40 (Phase 2B mismatch basis)
```

### Appendix E — Current vs Target Query Field Counts

| Query | Current fields | Target (Arteon ICE) | Reduction |
|-------|---------------:|--------------------:|----------:|
| Q001 Snapshot | 32 | 14 | 56% |
| Q006 Core | 5 | 5 | 0% |
| Q007 Route | 3 | 3 | 0% |
| Q008 Performance | 4 | 4 | 0% |
| Q009 HF | 16 | 12 | 25% |

### Appendix F — Analysis Profile × Canonical Key Requirements

| Key | DQ | VL | BK | TR | GT |
|-----|:--:|:--:|:--:|:--:|:--:|
| CAN_VEHICLE_SPEED | ✓ | ○ | ✓ | ○ | ✓ |
| CAN_ENGINE_THROTTLE_POSITION | ✓ | ○ | ○ | — | ○ |
| CAN_ENGINE_TORQUE | ○ | ✓ | ○ | — | ○ |
| CAN_BRAKE_PRESSURE_C1 | ○ | — | ✓ | — | ✓ |
| CAN_BRAKE_PRESSURE_C2 | ○ | — | ✓ | — | ✓ |
| CAN_TIRE_PRESSURE_FL | — | — | — | ✓ | ○ |
| CAN_YAW_RATE | ○ | — | — | ○ | ✓ |
| CAN_TRACTION_BATTERY_POWER | — | ✓ | ○ | — | ✓ |

✓ = required for full profile · ○ = enhanced · — = not required

### Appendix G — Phase Handoff Chain

| Phase | Deliverable | Status |
|-------|-------------|--------|
| 2A | Query surface audit | DONE |
| 2B | Four-vehicle gap matrix | DONE |
| 2C | Schema expansion | DONE |
| 2D | Physics/value matrix | DONE |
| 2E | Canonicalization | DONE |
| **2F** | **Acquisition strategy** | **DONE** |
| 2F.1 | Manifest + planner impl | NEXT |
| 2G | Smart5/Tesla profiles | NOT_STARTED |
| 2H | High Mobility | NOT_STARTED |
| 3A | Reference drive / GT | GATED |

### Appendix H — Decision Ledger (Phase 2F)

| ID | Decision | Rationale | Confidence |
|----|----------|-----------|------------|
| D2F-D001 | Manifest is materialized view over `VehicleDrivingCapability` | Single source of truth | HIGH |
| D2F-D002 | Preflight must gate query field lists in 2F.1 | Closes 2A gap | HIGH |
| D2F-D003 | HF remains post-trip only for T3 | Preserve working abuse path | HIGH |
| D2F-D004 | ACTIVE_TICK stays 3 parallel queries | Trip FSM dependency | HIGH |
| D2F-D005 | T5 separate from T3 for physics expansion | Cadence gating | HIGH |
| D2F-D006 | LTE_R1 primary connection profile | Four-vehicle + code evidence | HIGH |
| D2F-D007 | Smart5/Tesla UNVERIFIED until 2G | No audit vehicles | HIGH |
| D2F-D008 | BEV suppresses engine keys at planner | `deriveVehicleCapabilityProfile` | HIGH |
| D2F-D009 | No throttle/TPS merge | D2E-D001 | HIGH |
| D2F-D010 | No torque Nm/% interchange | D2E-D003 cluster | HIGH |
| D2F-D011 | Brake C1+C2 acquired together | D2E-D005 | HIGH |
| D2F-D012 | 7-day preflight TTL preserved | Existing policy | HIGH |
| D2F-D013 | Negative cache for NOT_AVAILABLE | Reduce probe churn | MEDIUM |
| D2F-D014 | 3-strike null before downgrade | Prevent flicker | MEDIUM |
| D2F-D015 | Feature flag for shaped queries | Safe rollout | HIGH |
| D2F-D016 | Provenance envelope mandatory on new paths | D2E-D018 | HIGH |
| D2F-D017 | 3A gated on LTE_R1 manifest | GT requires Tier-A | HIGH |
| D2F-D018 | Scaling −40% bytes target theoretical | 2B mismatch rate | MEDIUM |
| D2F-D019 | T7 deferred to 2F.1 Flight Recorder | Scope boundary | HIGH |
| D2F-D020 | HM out of 2F scope | Master plan | HIGH |

---

**Verified constants (Phase 2F)**

```
CANONICAL_SIGNAL_COUNT = 33
ACQUISITION_TIER_COUNT = 8
CAPABILITY_STATE_COUNT = 10
ANALYSIS_PROFILE_COUNT = 5
QUERY_PLANNER_STEPS = 14
PHASE_2F_DECISION_COUNT = 20
RUNTIME_PROBE_BACKLOG = 47
ACTIVE_TRIP_PARALLEL_QUERIES = 3
PREFLIGHT_MIN_INTERVAL_DAYS = 7
STATIC_MISMATCH_RATE = 0.656
THEORETICAL_FIELD_REDUCTION_TARGET = 0.40
```

**Phase 2F: DONE** · **Phase 2F.1: NEXT** · **Phase 3A: GATED_ON_LTE_R1_MANIFEST**

---

*Changes / Architektur: This phase is documentation-only. No SynqDrive Code → Changes or Architektur entries required for implementation artifacts. Phase 2F.1 implementation will require both.*
