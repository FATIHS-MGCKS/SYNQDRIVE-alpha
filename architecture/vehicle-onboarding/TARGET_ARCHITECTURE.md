# Vehicle Onboarding / Vehicle Registry — Target Architecture (VO-1)

| Field | Value |
|-------|-------|
| **Status** | Architecture contract — **not implemented** |
| **Decision slice** | VO-1 + **VO-1.1 consistency seal** (2026-09-30) |
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

### Canonical `Vehicle` creation timing (VO-1.1)

| Rule | Target |
|------|--------|
| **`DOES_CANONICAL_VEHICLE_EXIST_BEFORE_ACTIVATION`** | **NO** |
| **Pre-activation authority** | **OnboardingCase** (+ provider mirrors for discovery) |
| **At activation** | **Create** `Vehicle` row atomically with `registryLifecycle=ACTIVE` |
| **After activation** | OnboardingCase `COMPLETED` → `vehicleId` |

Pre-activation identity, draft admin/technical baselines, readiness, and validation live **only** on **OnboardingCase**. No canonical `Vehicle.id` exists for downstream modules until activation succeeds.

| Pre-activation concern | Target |
|------------------------|--------|
| Downstream module visibility | **None** — trips, billing, telemetry attachment, health modules require `vehicleId` created at activation |
| Billable | **NO** — no `Vehicle` → no billable provision |
| Telemetry attach | **NO** to canonical vehicle — provider mirror sync may continue under provider/VDC rules |
| Failed/cancelled case | Case `CANCELLED`/`EXPIRED` — **no** `Vehicle` row created |
| Telemetry on cancel | N/A for canonical vehicle; mirror unchanged |

**Onboarding** is a **case lifecycle** (`OnboardingCase.status`), not a persisted `Vehicle.registryLifecycle` value.

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

Base rule (insufficient alone): mirror not bound by an **active** link to an **ACTIVE** canonical `Vehicle`.

**Candidate eligibility (VO-1.1)** — a mirror is **not** a normal onboarding candidate when:

| Condition | Effect |
|-----------|--------|
| Historical link to **OFFBOARDED** or **ARCHIVED** `Vehicle` for same org (or platform correlation) | **Suppress** from default candidate lists |
| **OFFBOARD_SOLD** / **REMOVE_FROM_PRODUCT** completed for that physical identity in org | **Suppress** — requires **RE_ONBOARD** authorized action |
| **ARCHIVED** terminal registry state on linked vehicle | **Suppress** — no automatic rediscovery |
| **TRANSFER_ORGANIZATION** in progress or completed | Eligibility only via **explicit transfer/adoption** workflow + provider account scope |

| Operation | Candidate re-appearance |
|-----------|-------------------------|
| **DISCONNECT_PROVIDER** | **Allowed** — may reconnect to **same ACTIVE** `Vehicle` (not a new onboarding candidate) |
| **OFFBOARD_SOLD** | **Not allowed** as passive candidate for former org |
| **ARCHIVED** | **Not allowed** as normal candidate |
| **TRANSFER_ORGANIZATION** | **Governed** — destination org adoption workflow only |
| **RE_ONBOARD** (explicit) | **Allowed** after identity/history review + authorization |

**`OFFBOARDED_CANDIDATE_AUTO_REAPPEAR_ALLOWED=NO`** for ordinary discovery UX.

- **DIMO:** eligible only if passes suppression rules above (today's `getNonRegisteredVehicles()` is **incomplete**).
- **HM:** clearance rows without active vehicle binding + same suppression rules.
- **Manual:** no mirror; case starts with `sourceType=MANUAL`.

### Durable **OnboardingCase** (target persisted semantic)

One case per attempted onboarding into an **organization** (tenant-scoped), referencing:

- `organizationId` (target tenant)
- `sourceType` ∈ `DIMO` \| `HIGH_MOBILITY` \| `MANUAL` \| `COMPOSITE`
- `sourceRefs[]` — stable provider keys (`dimoVehicleId`, `hmVehicleReference`, etc.)
- `caseStatus` ∈ `OPEN` \| `IN_PROGRESS` \| `READY_FOR_ACTIVATION` \| `COMPLETED` \| `CANCELLED` \| `EXPIRED` (onboarding lifecycle on **case**, not on `Vehicle`)
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

### Persisted registry lifecycle (`registryLifecycle` on `Vehicle` — exists only **after** activation)

| State | Meaning |
|-------|---------|
| **ACTIVE** | Canonical vehicle in tenant product operation |
| **OFFBOARDED** | Left active product; history retained; candidate suppression applies |
| **ARCHIVED** | Long-retention terminal; no active ops; suppressed from normal candidates |

**Persisted count:** **3** (no `ONBOARDING` on `Vehicle` — see §1.1)

### Onboarding lifecycle (on `OnboardingCase`, not `Vehicle`)

| State | Classification |
|-------|----------------|
| **onboarding** (case open → ready) | **PERSISTED on OnboardingCase** |
| **discovered** | **DERIVED** — provider mirror, no case |
| **inactive** (ops) | **OPERATIONAL STATE** — `VehicleStatus` on **ACTIVE** vehicles only |
| **disconnected** | **PROVIDER/LINK STATE** |
| **transferred/sold** | **EVENT/HISTORY** — may OFFBOARD + later RE_ONBOARD case |
| **hard deleted** | **EVENT/HISTORY ONLY** — compliance |

**Derived registry-facing concepts:** **5** (discovered, inactive-ops, disconnected, telemetry-stale, transfer-pending)

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

### Organization transfer — **FAIL_CLOSED** (VO-1.1)

**`ORG_TRANSFER_FAIL_CLOSED=YES`** · **`EVENT_TIME_TENANT_OWNERSHIP_REQUIRED=YES`**

Production **organization reassignment** on an existing `Vehicle.id` is **forbidden** until every tenant-private domain proves **immutable event-time organization attribution** (or equivalent assignment-safe access). `Vehicle.organizationId` **must not** be the sole authorization source for pre-transfer historical facts.

Conceptual audit domains (must pass before transfer enablement):

| Domain | Requirement |
|--------|-------------|
| Telemetry / snapshots | Facts scoped by org at ingest time |
| Trips | Org at trip boundary |
| Bookings / contracts | Org at booking/contract time |
| Documents / damages / maintenance | Org at record creation |
| Battery / driving / health evidence | Org at measurement/conclusion time |
| Invoices/payments (if vehicle-linked) | Org at billing event time |
| Tasks / audits | Org at creation |

If **any** domain cannot prove isolation → transfer workflow **blocks** (no silent move). Alternative product path: **OFFBOARD** origin + **RE_ONBOARD** in destination with new case (may still share platform correlation internally).

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

### Single DB transaction (registry mutation + durable facts)

All rows below commit or roll back **together**:

| Step | Class |
|------|-------|
| **Create** `Vehicle` with `registryLifecycle=ACTIVE` | **TRANSACTIONAL** |
| OnboardingCase → `COMPLETED` + `vehicleId` | **TRANSACTIONAL** |
| `VehicleOrganizationAssignment` open row | **TRANSACTIONAL** |
| Active `VehicleDataSourceLink`(s) + consent linkage | **TRANSACTIONAL** |
| Required admin baseline on `Vehicle` | **TRANSACTIONAL** |
| Required reference technical baselines | **TRANSACTIONAL** |
| `readinessSnapshot` version persisted | **TRANSACTIONAL** |
| Audit event record | **TRANSACTIONAL** |
| **Lifecycle fact / outbox row** (`vehicle.activated` payload) | **TRANSACTIONAL** |

**`ACTIVATION_FACT_DURABLE_WITH_STATE_CHANGE=YES`**

**Mechanism:** transactional **outbox** (or repository-equivalent durable event table) written in the **same** DB transaction as `registryLifecycle` change. Consumers (Billing, analytics) read outbox with **idempotent** handlers (**VO-INV-ACTIVATION-EVENT-001**).

**`BILLING_UPDATE_TRANSACTIONAL_WITH_VEHICLE_DB_TX=NO`** — Stripe/quantity side effects run **outside** the DB transaction as **POST_COMMIT_IDEMPOTENT_CONSUMER** of `vehicle.activated` / `vehicle.offboarded`.

Offboarding: same pattern — `registryLifecycle` change + `vehicle.offboarded` outbox row atomically.

Idempotency: same `idempotencyKey` → same `vehicleId` (**VO-INV-ACTIVATION-001**).

### Post-commit idempotent consumers

| Consumer / job | Class |
|----------------|-------|
| Billing quantity update (`onVehicleProvisioned` successor) | **POST_COMMIT_IDEMPOTENT_CONSUMER** |
| Capability refresh | **POST_COMMIT_IDEMPOTENT** |
| `VehicleEnrichmentJob` | **POST_COMMIT_IDEMPOTENT** |
| Battery capability refresh | **POST_COMMIT_IDEMPOTENT** |
| Snapshot / telemetry init | **OPTIONAL_ASYNC** |

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

### `DEACTIVATE_VEHICLE` vs `OFFBOARD_VEHICLE` (VO-1.1)

| Action | Registry | Ops | Billing |
|--------|----------|-----|---------|
| **DEACTIVATE_VEHICLE** | Stays **ACTIVE** | `VehicleStatus` / fleet availability only; reversible | **No** automatic deprovision unless Billing product policy says otherwise |
| **OFFBOARD_VEHICLE** | → **OFFBOARDED** | Leaves active tenant product | **`vehicle.offboarded`** fact → Billing consumer |

Do **not** use one action for both meanings.

| Operation | Retains Vehicle? | Registry | Provider links | Candidate suppression | History |
|-----------|------------------|----------|--------------|----------------------|---------|
| **DISCONNECT_PROVIDER** | YES | ACTIVE | Deactivate link | N/A (reconnect same vehicle) | YES |
| **DEACTIVATE_VEHICLE** | YES | ACTIVE | Optional | N/A | YES |
| **REMOVE_FROM_PRODUCT** | YES | OFFBOARDED | May disconnect | **Suppress** passive rediscovery | YES |
| **TRANSFER_ORGANIZATION** | YES | ACTIVE until OFFBOARD+adopt | Re-evaluate | **Workflow-only** | Event-time isolated |
| **OFFBOARD_SOLD** | YES | OFFBOARDED | Disconnect typical | **Suppress** for org | YES |
| **ARCHIVE** | YES | ARCHIVED | Inactive | **Suppress** | YES |
| **RE_ONBOARD** | YES (same or new case) | → ACTIVE via new activation | New link episode | Explicit auth only | YES |
| **HARD_DELETE** | DELETE | — | Audit | — | Compliance only |

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
