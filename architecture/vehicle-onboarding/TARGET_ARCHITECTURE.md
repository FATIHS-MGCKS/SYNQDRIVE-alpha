# Vehicle Onboarding / Vehicle Registry — Target Architecture (VO-1)

| Field | Value |
|-------|-------|
| **Status** | Architecture contract — **not implemented** |
| **Decision slice** | VO-1 (2026-09-30) |
| **Repository anchor** | `265168d3deec4175d5659ed849be5e4063f10291` (post VO-0B merge) |
| **Authority** | `AUDIT_IN_PROGRESS` — VO-1 does not promote to `AUTHORITY_ACTIVE` |
| **Current behavior** | [CURRENT_STATE.md](./CURRENT_STATE.md) (VO-0A/0B seal) |

VO-1 defines the **minimum semantic contract** and **durable lifecycle** required before implementation (VO-2+). No Prisma, API, or runtime changes are implied by this document alone.

---

## 1. Identity model

### Canonical operational identity

- **`Vehicle.id`** (UUID) remains the **only** canonical tenant-operational vehicle identifier.
- **No** replacement `Vehicle` model and **no** provider table ID as canonical PK.

### Real-world and administrative identifiers

| Identifier | Role | Target rule |
|------------|------|-------------|
| **VIN** | Real-world identity signal | May be **unknown at discovery**; must not store synthetic DIMO tokens as verified VIN |
| **License plate** | Mutable administrative identity | Current projection on `Vehicle`; **temporal history** required (see §7) |
| **DIMO** `DimoVehicle.externalId` / token | Provider mapping | Mirror + `VehicleDataSourceLink` / `Vehicle.dimoVehicleId` |
| **HM** `hmVehicleReference` / VIN | Provider mapping | `HighMobilityVehicle` + links |
| **Device / integration family** | Telemetry routing | **VDC** (`resolveTelemetrySourceFamily`); onboarding may seed hints only |
| **Organization** | Tenant scope | Current FK `Vehicle.organizationId` + **assignment history** (see §6) |

### VIN contract (target)

| Flag | Target |
|------|--------|
| `VIN_NULLABLE_UNTIL_KNOWN` | **YES** — nullable or explicit `UNKNOWN` provenance until verified |
| `VIN_REQUIRES_PROVENANCE` | **YES** — every non-null VIN records source (provider, manual, document, admin) |
| `VIN_REQUIRES_VERIFICATION_STATE` | **YES** — at minimum `UNVERIFIED` \| `VERIFIED` \| `CONFLICT` |
| `SYNTHETIC_DIMO_VIN_ALLOWED` | **NO** — retire `DIMO-{externalId}` in `Vehicle.vin`; use internal correlation on mirror/link only |

**Current defect:** `registerFromDimo` uses `dimoVehicle.vin || \`DIMO-${externalId}\`` (`vehicles.service.ts`) — **VO-GAP-002**; target uses surrogate correlation without polluting VIN semantics.

### Platform physical identity (duplicate prevention)

- Introduce a **platform-internal physical vehicle correlation key** (`PhysicalVehicleCorrelation` — name TBD at implementation), **not tenant-visible**.
- Populated only when **verified VIN** or **admin-confirmed merge** with audit.
- Used for **cross-provider** and **cross-tenant collision detection** without exposing Org B data to Org A (see §11).

---

## 2. Candidate / source model (Decision A)

**Decision:** **C — Provider-native mirrors + durable onboarding case** (reject standalone `VehicleCandidate` table as primary truth).

| Approach | Verdict |
|----------|---------|
| A — Durable provider-neutral `VehicleCandidate` entity | **REJECTED** — duplicates mirror truth; parallel lifecycle |
| B — Projection only | **INSUFFICIENT** — no resumability (VO-GAP-013) |
| C — Mirrors + **OnboardingCase** | **SELECTED** |
| D — N/A | — |

### Provider-neutral **candidate projection** (derived, not persisted as entity)

- **DIMO:** `DimoVehicle` where no active `Vehicle`/`VehicleDataSourceLink` binds it (today: `getNonRegisteredVehicles()`).
- **HM:** HM clearance rows without `synqdriveVehicleId` / eligible clearance APIs.
- **Manual:** no mirror; case starts with `sourceType=MANUAL`.

### Durable **OnboardingCase** (target persisted semantic)

One case per attempted onboarding into an **organization** (tenant-scoped), referencing:

- `organizationId` (target tenant)
- `sourceType` ∈ `DIMO` \| `HIGH_MOBILITY` \| `MANUAL` \| `COMPOSITE`
- `sourceRefs[]` — stable provider keys (`dimoVehicleId`, `hmVehicleReference`, etc.)
- `registryLifecyclePhase` ∈ onboarding workflow (see §4)
- Draft administrative + technical baseline payloads (validated DTOs, not health conclusions)
- `readinessSnapshot` (versioned checklist result)
- `validationFindings[]`, `actor`, timestamps
- `idempotencyKey` / `concurrencyToken`
- Terminal: `COMPLETED` → binds `vehicleId`; `CANCELLED` \| `EXPIRED`

**Concurrency:** two admins same DIMO candidate → single case per `(organizationId, sourceType, primarySourceRef)` + advisory lock pattern reused from `vehicleDimoBindingLockKey`.

---

## 3. Onboarding session semantics (Decision D)

**`DURABLE_ONBOARDING_SESSION_REQUIRED=YES`**

Responsibilities listed in task §7 — implementation deferred to VO-2 schema design.

Without a case, abandoned multi-step enrichment, async capability discovery, and audit trail cannot meet VO-GAP-013/007 targets.

---

## 4. Vehicle Registry lifecycle (Decision E)

**Separate from** `VehicleStatus` (`AVAILABLE`, `RENTED`, `IN_SERVICE`, `OUT_OF_SERVICE`, `RESERVED`) — rental/ops only (**VO-INV-LIFECYCLE-001**).

### Persisted registry lifecycle (`registryLifecycle` on `Vehicle` or 1:1 extension — TBD)

| State | Classification |
|-------|----------------|
| **ONBOARDING** | **PERSISTED** — pre-activation or partial `Vehicle` draft (implementation choice) |
| **ACTIVE** | **PERSISTED** — normal operational registry membership |
| **OFFBOARDED** | **PERSISTED** — tenant removed vehicle from product; history retained |
| **ARCHIVED** | **PERSISTED** — long-retention terminal; no active ops |

**Count persisted:** **4**

### Derived / other classifications

| Concept | Classification |
|---------|----------------|
| **discovered** | **DERIVED** — from provider mirror sync, no case |
| **inactive** (ops) | **OPERATIONAL STATE** — `VehicleStatus` / fleet rules |
| **disconnected** | **PROVIDER/LINK STATE** — `DimoConnectionStatus`, HM streaming, VDC |
| **transferred/sold** | **EVENT/HISTORY** — closes assignment; may trigger OFFBOARDED + new case elsewhere |
| **hard deleted** | **EVENT/HISTORY ONLY** — rare; not normal offboarding |

**Derived registry-facing concepts:** **6** (discovered, inactive-ops, disconnected, telemetry-stale, transferred, pending-activation)

---

## 5. Provider connectivity ≠ registry lifecycle (Decision F)

| Layer | Owns |
|-------|------|
| DIMO mirror | `DimoVehicle.connectionStatus`, sync |
| HM | clearance / streaming on `HighMobilityVehicle` |
| **VDC** | connectivity interpretation, freshness, `resolveTelemetrySourceFamily` |
| **VO / Registry** | whether tenant **chooses** to keep an **ACTIVE** vehicle while provider is disconnected |

**Rules:**

- Provider disconnected **≠** vehicle `OFFBOARDED`.
- Provider link deactivated **≠** `Vehicle` hard delete.
- UI may **compose** VDC freshness + link state for display; VO does not redefine freshness (**VO-GAP-012** remains **CROSS_MODULE** with VDC).

---

## 6. Organization assignment (Decision G)

**`ORGANIZATION_ASSIGNMENT_HISTORY_REQUIRED=YES`**

Target **`VehicleOrganizationAssignment`** history (new persistence in VO-2+):

- `vehicleId`, `organizationId`, `validFrom`, `validTo`, `reason`, `actor`, `approvalSource`, `status`

**`VEHICLE_SURVIVES_ORG_REASSIGNMENT=YES`** — same `Vehicle.id` may move **only** via controlled **transfer** workflow.

**Historical visibility (mandatory):**

- Trips, bookings, contracts, documents, damages, service, battery/driving/health evidence, audit: **remain attributed to the organization active at event time**.
- Destination org sees **post-transfer** operational data plus explicit **handover package** if product enables — **never** full silent import of prior tenant private history.
- Platform may use `PhysicalVehicleCorrelation` internally for fraud/duplicate prevention **without** tenant disclosure (**VO-INV-TENANT-001**).

**Compatibility:** `Vehicle.organizationId` remains **current assignment projection** for queries until migration completes.

---

## 7. License plate history (Decision H)

**`LICENSE_PLATE_HISTORY_REQUIRED=YES`**

Target **`VehicleLicensePlateAssignment`** (temporal): plate, jurisdiction, `validFrom`/`validTo`, source, actor.

Not part of physical identity; used for admin, handover, and historical document references.

---

## 8. Provider mapping history (Decision I)

**`PROVIDER_MAPPING_HISTORY_REQUIRED=YES`**

**Reuse-first:**

- Extend **`VehicleDataSourceLink`** as canonical mapping row: `activatedAt`, `deactivatedAt`, `supersededByLinkId`, provider, external refs.
- **`VehicleProviderConsent`** — consent episodes tied to link lifecycle.
- **`DimoVehicle` / `HighMobilityVehicle`** — mirrors retained; never deleted on offboard.

**`Vehicle.dimoVehicleId`:** target **current primary DIMO binding projection**; history via links. Hardware swap (R1→Smart5) = **deactivate old link + activate new** with audit event.

---

## 9. Technical baseline contract (Decision J)

| Class | Meaning | Examples | Owner at onboarding |
|-------|---------|----------|---------------------|
| **STATIC / REFERENCE SPEC** | Approved design/reference | Tire size 235/45 R18, nominal kWh | VO seeds into `VehicleTireSetup`, `VehicleBatterySpec`, brake refs |
| **CURRENT INSTALLED CONFIG** | What is on the vehicle now | Mounted tire SKU, pad material | Tire/brake modules |
| **MEASUREMENT** | Observed reading | Tread depth, SOC | Telemetry / health modules |
| **HEALTH CONCLUSION** | Interpreted status | Worn, SOH% | Vehicle Health, Battery V2 |
| **SERVICE EVENT** | Work performed | Oil change | `VehicleServiceEvent` |

Onboarding **establishes reference baselines** where product requires; **must not** write health conclusions (**VO-INV-HEALTH-001**, **VO-INV-BATTERY-001**).

---

## 10. Readiness contract (Decision K)

Readiness = **versioned checklist** stored on `OnboardingCase.readinessSnapshot` + optional persisted on `Vehicle` at activation.

### Input classes

| Class | Examples |
|-------|----------|
| `MANDATORY_FOR_IDENTITY` | Org scope, source ref, conflict resolution |
| `MANDATORY_FOR_TENANT_ASSIGNMENT` | `organizationId`, station baseline if product requires |
| `MANDATORY_FOR_SELECTED_PRODUCT` | Rental fleet vs telematics-only |
| `MANDATORY_FOR_SAFETY/REGULATION` | TÜV/BOKraft flags when jurisdiction requires |
| `OPTIONAL_ENRICHMENT` | Exterior images, notes |
| `CAPABILITY_UNKNOWN_ALLOWED` | HM/DIMO signal groups not yet probed |

### Activation predicates (by use case — not generic)

| Question | Target |
|----------|--------|
| `CAN_VEHICLE_ACTIVATE_WITH_UNKNOWN_CAPABILITIES` | **CONDITIONAL** — YES for non-blocking modules; NO if selected product **requires** that capability (e.g. HM health add-on without clearance) |
| `CAN_VEHICLE_ACTIVATE_WITHOUT_VIN` | **CONDITIONAL** — YES for provider-discovered **UNVERIFIED** with case flag; NO for manual fleet entry when org policy requires VIN |
| `CAN_VEHICLE_ACTIVATE_WITHOUT_LICENSE_PLATE` | **YES** default; jurisdiction/product may require |
| `CAN_VEHICLE_ACTIVATE_WITHOUT_TIRE_BASELINE` | **CONDITIONAL** — rental fleet YES only if product profile allows deferred baseline |
| `CAN_VEHICLE_ACTIVATE_WITHOUT_BRAKE_BASELINE` | **CONDITIONAL** — same |
| `CAN_VEHICLE_ACTIVATE_WITHOUT_HV_BATTERY_REFERENCE` | **CONDITIONAL** — BEV rental typically NO; ICE YES |
| `CAN_VEHICLE_ACTIVATE_WHILE_PROVIDER_TELEMETRY_PENDING` | **YES** — activation ≠ first snapshot; VDC reports freshness separately |

**`CAPABILITY_UNKNOWN_ALLOWED_AT_ACTIVATION=CONDITIONAL`** (product matrix).

---

## 11. Capability profiling (Decision L)

**Reuse:** `VehicleDrivingCapability`, `VehicleBatteryCapability`, existing refresh jobs.

| Phase | Allowed |
|-------|---------|
| Pre-activation | Probe **optional**; results inform readiness only |
| At activation | Persist **known** capability rows; `UNKNOWN` ≠ `UNSUPPORTED` |
| Post-activation | Async refresh; module-specific gates (e.g. trip scoring waits on driving capability) |

Onboarding orchestrates **trigger** only; DI/Battery authorities own conclusions.

---

## 12. Activation transaction (Decision M)

### Transactional core (must succeed atomically)

- Finalize `Vehicle` (or promote draft) with `registryLifecycle=ACTIVE`
- Close `OnboardingCase` → `COMPLETED`
- `VehicleOrganizationAssignment` open row
- Active `VehicleDataSourceLink`(s) + consent linkage
- Required admin baseline fields
- Required **reference** technical baselines per readiness profile
- `readinessSnapshot` version + audit event
- Idempotency: same `idempotencyKey` → same `vehicleId` (**VO-INV-ACTIVATION-001**)

### Post-commit idempotent (existing side effects — classify)

| Side effect | Class |
|-------------|-------|
| `billingQuantity.onVehicleProvisioned` | **TRANSACTIONAL_REQUIRED** today — target: emit on **ACTIVATION** fact (align VO-Q-013) |
| Capability refresh | **POST_COMMIT_IDEMPOTENT** |
| `VehicleEnrichmentJob` | **POST_COMMIT_IDEMPOTENT** |
| Battery capability refresh | **POST_COMMIT_IDEMPOTENT** |
| Snapshot / telemetry init | **OPTIONAL_ASYNC** — VDC owns ongoing freshness |

---

## 13. Billing boundary (Decision N)

Billing owns quantity, SKU, Stripe.

**VO emits facts:**

| Event | Billing consumption (target) |
|-------|------------------------------|
| `vehicle.onboarding.started` | Optional metering — **not** billable quantity default |
| `vehicle.activated` | **Primary billable provision trigger** (matches current `onVehicleProvisioned` timing) |
| `vehicle.offboarded` | Deprovision / quantity decrease |
| Provider connect/disconnect | **No** automatic billing change |

Current: provision at register (`vehicles.service.ts` `onVehicleProvisioned`) — **same boundary**, explicit activation event in target contract.

---

## 14. Offboarding semantics (Decision O)

| Operation | Retains Vehicle? | Provider links | History | Reversible |
|-----------|------------------|----------------|---------|------------|
| **DISCONNECT_PROVIDER** | YES | Deactivate link | YES | YES |
| **DEACTIVATE_VEHICLE** | YES | Optional | YES | YES — ops `VehicleStatus` |
| **REMOVE_FROM_PRODUCT** | YES → OFFBOARDED | May disconnect | YES | Limited |
| **TRANSFER_ORGANIZATION** | YES | Re-evaluate | Isolated per org | Audit |
| **OFFBOARD_SOLD** | YES OFFBOARDED | Disconnect typical | YES | NO |
| **ARCHIVE** | YES ARCHIVED | Inactive | YES | NO |
| **HARD_DELETE** | DELETE | Audit only | **Legal/compliance only** | NO |

**`NORMAL_OFFBOARDING_DELETES_VEHICLE=NO`**

**Hard delete:** platform-admin + compliance ticket only; never default for sale/disconnect.

Current `deregister` hard-deletes — **VO-GAP-006** target contradicts current.

---

## 15. Provider-neutral orchestration contract (Decision P)

### `OnboardingSourceSnapshot` (conceptual DTO — not provider fields on `Vehicle`)

| Field category | Content |
|----------------|---------|
| `providerType` | `DIMO` \| `HIGH_MOBILITY` \| `MANUAL` \| … |
| `connectionScope` | Org-linked developer account / HM fleet scope |
| `externalVehicleIdentity` | Provider-stable id |
| `identityAttributes` | VIN (if known), make/model/year, plate hint |
| `provenance` | Sync time, actor, raw ref pointer |
| `declaredCapabilities` | Optional provider hints |
| `evidenceTimestamps` | discoveredAt, lastSeenAt |
| `rawSourceRef` | `{ mirrorTable, id }` |

**Adapters:** DIMO registration service, HM registration service, manual create — all call **Vehicle Onboarding Orchestrator** (future) with this snapshot.

---

## 16. Manual creation (Decision 20)

**`MANUAL_CREATION_USES_CANONICAL_ONBOARDING=YES`**

`sourceType=MANUAL`; same case, readiness, activation, audit. No bypass of identity/org rules.

---

## 17. Concurrency & idempotency (Decision 21)

| Scenario | Outcome |
|----------|---------|
| Two admins, same DIMO candidate | Second receives **case exists** or joins case |
| HM_ONLY + DIMO same VIN | **HARD_CONFLICT** until admin merge workflow |
| Provider sync vs register race | Advisory lock + link uniqueness |
| Retry activation | Idempotent on `idempotencyKey` |
| Reconnect during onboarding | Update `sourceRefs`; case continues |

Reuse: `vehicleDimoBindingLockKey`, partial unique `dimo_vehicle_id`.

---

## 18. Security / tenant isolation (Decision 22)

- Candidates visible only within **provider account scope** entitled to org.
- Adoption requires org admin permission.
- Cross-tenant VIN match: **platform-internal flag only** — response `IDENTITY_COLLISION_REVIEW` without revealing other tenant name/data.
- Offboard/hard-delete: elevated roles + audit.

---

## 19. Multi-provider identity resolution (Decision C)

| Rule | Policy |
|------|--------|
| `AUTO_MATCH_ALLOWED_WHEN` | Same org + **VERIFIED** VIN match + no active conflict |
| `MANUAL_CONFIRMATION_REQUIRED_WHEN` | Unverified VIN, plate-only, model/year, second provider |
| `HARD_CONFLICT_WHEN` | Two **ACTIVE** vehicles same org + same verified VIN; or exclusive global DIMO binding violation |
| `CROSS_TENANT_MATCH_BEHAVIOR` | Internal correlation only; **no data disclosure** |

**`MULTI_PROVIDER_MATCH_STRATEGY=TIERED_VIN_AND_ADMIN`**

---

## 20. Downstream boundaries (unchanged ownership)

Telemetry/VDC, Trip FSM, DI, Battery, Health, Booking, Billing, Maintenance, Documents — per [governance/AUTHORITY_BOUNDARIES.md](./governance/AUTHORITY_BOUNDARIES.md).

---

## 21. Compatibility / migration principles

1. Extend protected models before new parallel tables.
2. Backfill `registryLifecycle=ACTIVE` for existing vehicles.
3. Replace synthetic VIN with migration script + provenance.
4. Deprecate `deregister` delete path behind `OFFBOARD` API.
5. VO-2 implements schema; VO-3+ slices per implementation sequence.

---

## 22. Recommended implementation sequence (high level)

1. **VO-2** — `OnboardingCase` + registry lifecycle + org/plate/link history schema
2. **VO-3** — Orchestrator + provider-neutral snapshot; unify register paths
3. **VO-4** — Readiness engine + activation idempotency
4. **VO-5** — Offboard/transfer; retire destructive deregister
5. **VO-6** — Physical correlation + cross-tenant collision service
6. **Cross-module** — VDC presentation alignment (VO-GAP-012), VDC-GAP-013 device identity
