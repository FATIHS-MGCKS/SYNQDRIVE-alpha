# TDL-OQ-002 — `drive-profile/` ownership audit

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ002-DRIVE-PROFILE-001 |
| **Cross-ref** | BAT-V2-EVID-OQ002-DRIVE-PROFILE-001 |
| **Audited at (UTC)** | `2026-09-25` |
| **REPO_CURRENT** | `origin/main` @ `51b4590e43d4e9194fd7572e4c629daee54b3a55` |
| **Prerequisite note** | TDL-OQ-006 authority PR **not yet on** `origin/main` at audit start; OQ-002 audit is independent (no code dependency). |
| **Verdict** | **`BATTERY_V2_OWNER`** |
| **Runtime changes** | **NONE** |

## Phase 1 — Surface inventory

| File | Role | Battery deps | Trip FSM | DIMO | Persistence |
|------|------|--------------|----------|------|-------------|
| `drive-profile-resolver.ts` | Pure powertrain classification + battery measurement helpers | `BatteryDriveProfile`, `BatteryChemistry`, `BatteryMeasurement*`, `resolveBatteryPolicy`, `guardMeasurementQualityForPolicy` | **None** | **None** (input types only) | **None** |
| `drive-profile-resolver.service.ts` | Loads `Vehicle` + `VehicleLatestState` + `dimoVehicle`, builds input, calls `resolveDriveProfile` | Via resolver | **None** | Read-only join on `dimoVehicle` | **Read** Prisma only |
| `drive-profile-resolver.input.ts` | Maps DB row → resolver input | **None** | **None** | Provider fields from `dimoVehicle` | **None** |
| `drive-profile-resolver.types.ts` | `DriveProfile = BatteryDriveProfile` alias | Type re-export from `battery-v2-domain` | **None** | Provider input shapes | **None** |
| `index.ts` | Barrel exports | — | — | — | — |
| `drive-profile-resolver.spec.ts` | Unit tests | Battery enums | — | — | — |

**Public exports:** `resolveDriveProfile`, layer resolvers, `isHvMeasurementSupported`, `isLvRestMeasurementSupported` (unused in prod), deprecated `guardLvMeasurementQualityForProfile`, `DriveProfileResolverService`, types.

## Phase 2 — Consumer graph (productive)

| Consumer | Module | Purpose | Runtime | Ownership implication |
|----------|--------|---------|---------|---------------------|
| `BatteryPolicyProfileService` | Battery V2 / `battery-policy-profile` | Resolve drive profile then `resolveBatteryPolicy` | **ACTIVE** | **Primary** battery policy input |
| `BatteryMeasurementSessionService` | Battery V2 / `battery-health` | Default `driveProfile` on session create via `DriveProfileResolverService` | **ACTIVE** | Battery session metadata |
| `battery-policy-profile.resolver` | Battery V2 | `isHvMeasurementSupported(driveProfile)` in policy materialization | **ACTIVE** | Battery HV eligibility |
| `deriveVehicleCapabilityProfile` | `vehicle-capabilities.ts` | Diagnostics: `engineSignalsAvailable` via **master `fuelType` only** (partial resolver) | **ACTIVE** | DI / signal-quality **adjacent**, not trip FSM |
| `trip-behavior-enrichment.service` | Driving Intelligence (trips enrichment) | Uses `deriveVehicleCapabilityProfile` | **ACTIVE** | **Optional DI consumer** of partial classification |
| `driving-detector-capability.service` | Driving capability | Same | **ACTIVE** | DI-adjacent |
| `vehicle-driving-capability-resolver.service` | Driving capability | Same | **ACTIVE** | DI-adjacent |
| `driving-impact-model-profile.ts` | Driving impact | Same | **ACTIVE** | DI-adjacent |
| `engine-context.guards.ts` | Event context | Same | **ACTIVE** | DI-adjacent |
| `signal-quality-read.service` | ClickHouse / signal quality | Same | **ACTIVE** | Observability |

**Test-only:** `drive-profile-resolver.spec.ts`, `vehicle-capabilities.spec.ts`, battery session repository spec mocks.

**Not consumers:** Energy Event Detection (`resolveFleetPowertrainClass` — separate fleet taxonomy). Trip FSM (`VehicleDetectionProfile` on `vehicle_trip_detection_states` — unrelated enum).

## Phase 3 — Trip FSM dependency

| Question | Answer |
|----------|--------|
| Direct resolver use in trip FSM / reconciliation / decision engine? | **NO** — `backend/src/modules/trips/**` and trip FSM services have **zero** imports of `drive-profile` or `BatteryDriveProfile`. |
| Indirect via `BatteryDriveProfile` in trip lifecycle? | **NO** |
| Affects start/end/split semantics? | **NO** |
| Determines trip lifecycle authority? | **NO** |
| Removing resolver breaks FSM unchanged? | **YES** — FSM uses `VehicleDetectionProfile`, not drive-profile resolver. |

**`TDL_RUNTIME_DEPENDENCY=NO_TDL_RUNTIME_DEPENDENCY`**

## Phase 4 — Battery V2 dependency

| Question | Answer |
|----------|--------|
| `BatteryDriveProfile` a Battery V2 domain type? | **YES** — `battery-v2-domain` + Prisma `BatteryDriveProfile` enum |
| Selects LV/HV measurement paths? | **YES** — via `resolveBatteryPolicy` + `isHvMeasurementSupported` |
| Steers battery policy? | **YES** — policy key selection branches on `driveProfile` |
| Measurement eligibility/quality? | **YES** — deprecated wrapper delegates to `guardMeasurementQualityForPolicy` |
| Chemistry coupled in resolver file? | **Only** in deprecated guard wrapper |
| Semantically necessary for battery? | **YES** — profile matrix documented in `architecture/battery-v2/purpose/profile-matrix.md` |

## Phase 5 — General vehicle domain test

| Layer | Classification |
|-------|----------------|
| **Concept** | ICE/HEV/PHEV/BEV/UNKNOWN is a **general vehicle powertrain taxonomy** (propulsion class). |
| **Current implementation** | **`BatteryDriveProfile`-typed**, battery-policy-coupled, introduced as **Battery V2** work (`feat(battery-v2): central DriveProfile resolver`, commit `dc82d3545…`). |
| **Real non-battery consumers** | **Partial only** — `deriveVehicleCapabilityProfile` calls `resolveDriveProfile({ master: { fuelType }})` **without** provider/spec/telemetry layers. |
| **Separate neutral module?** | **Not present** — EED uses `resolveFleetPowertrainClass`, not this resolver. |

**`GENERAL_POWERTRAIN_CONCEPT_PRESENT=YES`**, **`CURRENT_IMPLEMENTATION_BATTERY_SPECIFIC=YES`**

## Phase 6 — Input authority

| Input layer | Source owner | Interpretation owner | Priority |
|-------------|--------------|----------------------|----------|
| Vehicle master `fuelType` | Vehicle master / org-scoped `Vehicle` | **Drive-profile resolver** (Battery-owned stack) | 1 |
| `confirmedDriveProfile` | **Designed** for operator override | Resolver | 1 — **not wired** in `buildDriveProfileResolverInput` today (dead input path except tests) |
| Provider VIN / fuel / powertrain | DIMO Integration (`dimoVehicle` mirror) | **Drive-profile resolver** | 2 |
| Canonical spec (HV/tank capacity) | Vehicle master + battery spec semantics | **Drive-profile resolver** | 3 |
| Telemetry heuristic | DIMO/snapshot → `VehicleLatestState` (transport); boolean signal presence | **Drive-profile resolver** | 4 |

DIMO is **data source**, not profile authority owner.

## Phase 7 — Output authority

| Property | Finding |
|----------|---------|
| Persisted on `Vehicle` as canonical field? | **NO** |
| Cached globally? | **NO** |
| On-demand computed? | **YES** — pure function + Prisma read in services |
| Written to domain state? | **Indirect** — `BatteryMeasurementSession.driveProfile` snapshot at session create (consumer write, not resolver) |
| Classification | **`DERIVED_READ_MODEL`** at vehicle level; **session snapshot** at measurement boundary |

**`DRIVE_PROFILE_MUTATES_DOMAIN_STATE=NO`** (resolver/service do not mutate Vehicle/Trip rows).

## Phase 8 — Conflict semantics

Priority chain resolves **powertrain class for battery policy and battery-adjacent diagnostics**, not fleet identity for all modules.

| Conflict | Behavior |
|----------|----------|
| Master vs provider decisive profiles | **UNKNOWN** + low confidence |
| Provider fuel vs powertrain | **UNKNOWN** |
| Canonical vs provider (both decisive) | **UNKNOWN** |
| Telemetry | Fallback only after master/provider/spec inconclusive |

This is a **battery-oriented powertrain resolution hierarchy**, not Trip Detection canonical identity and not EED fleet taxonomy.

## Phase 9 — Naming audit

**`RESOLVER_NAMING_SEMANTICS=D — Vehicle propulsion profile (powertrain type: BEV/PHEV/HEV/ICE)**

Not A (driving style / Driving Intelligence behavior profile). Not a separate C-only measurement profile — helpers are battery measurement path gates.

Folder name `drive-profile/` is **misleading** vs `VehicleDetectionProfile` (trip start/end detection tuning) and vs Driving Intelligence behavior.

## Phase 10 — Ownership candidates

| Candidate | Result |
|-----------|--------|
| **A — TDL owns** | **Rejected** — no trip FSM runtime dependency |
| **B — Battery V2 owns** | **Selected** — types, primary consumers, policy chain, historical introduction |
| **C — Shared neutral layer** | **Rejected for current code** — no independent shared module; partial DI use is thin |
| **D — Split** | **Not required for authority** — policy already in `battery-policy-profile`; resolver is classification **for battery stack** |

## Phase 11 — Dependency direction

**Actual:**

```
Vehicle master / DIMO mirror / capacities / VehicleLatestState
        ↓
resolveDriveProfile (BatteryDriveProfile)
        ↓
resolveBatteryPolicy + measurement sessions + HV helpers
        ↓
Battery V2 measurements / assessments / publication
```

**DI diagnostics (partial):**

```
Vehicle.fuelType only → resolveDriveProfile (master layer only) → capability diagnostics
```

No shared layer imports Battery **upward** incorrectly; **`drive-profile` imports Battery domain** (correct for battery-owned resolver, **layering smell** for folder placement under generic `vehicle-intelligence/`).

**`LAYERING_STATUS=LAYERING_SMELL`** (path/naming vs domain; not circular).

## Phase 12 — Circularity

No runtime module cycle TDL ↔ drive-profile. Battery policy imports drive-profile helpers — acyclic.

## Phase 13 — Runtime reachability

| Surface | Status |
|---------|--------|
| `DriveProfileResolverService` | **ACTIVE** — session create path |
| `resolveDriveProfile` in `BatteryPolicyProfileService` | **ACTIVE** — many battery services via policy |
| `DriveProfileResolverService` exported from `VehicleIntelligenceModule` | Registered; **no external module** import found outside battery + self |
| `isLvRestMeasurementSupported` | **DEAD_CODE** (export only) |
| `guardLvMeasurementQualityForProfile` | **TEST_ONLY** (deprecated) |

**`DRIVE_PROFILE_RUNTIME_REACHABLE=YES`**

## Phase 14 — Persistence (read-only)

`DriveProfileResolverService` reads: `vehicle`, `vehicleLatestState`, `dimoVehicle` (select-only). No writes.

## Phase 15 — Historical provenance

| Item | Evidence |
|------|----------|
| Introduction | `dc82d3545044625e3a8fbfc16b499689265cf21c` — `feat(battery-v2): central DriveProfile resolver (Prompt 25/78)` |
| Original purpose | Battery V2 central classification for policy/measurement |
| Later | `vehicle-capabilities` adopted **partial** master-layer call for diagnostics |

## Phase 16 — Verdict

**`BATTERY_V2_OWNER`** — Trip Detection has **no ownership** of this resolver; TDL documents **explicit non-ownership** and distinguishes `VehicleDetectionProfile`.

## Phase 17 — Refactor necessity

| Item | Value |
|------|-------|
| Runtime defect from folder location? | **NO** |
| **`DOCS_ONLY_FIX_SUFFICIENT=YES`** for OQ-002 closure |
| **`PHYSICAL_CODE_RELOCATION_RECOMMENDED=YES`** — optional slice: move under `battery-health/` or `battery-policy-profile/` and rename to `powertrain-profile` (out of scope here) |

**`NEW_RUNTIME_DEFECT_FOUND=NO`**

## Phase 18 — TDL-OQ-002 closure

TDL **does not own** `drive-profile/`. TDL is **not a consumer**. Battery V2 owns resolver semantics and primary runtime consumers.
