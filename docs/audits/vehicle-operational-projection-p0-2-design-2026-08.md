# Vehicle Operational Projection — P0.2 Design (August 2026)

| Field | Value |
|-------|-------|
| **Audit ID** | `vehicle-operational-projection-p0-2-design-2026-08` |
| **Status** | Design + contract slice (no consumer migration) |
| **Depends on** | P0.1 `VehicleConnectivityRuntimeState` (PR #1263, #1267, #1269) |
| **Production Processing Gate** | **CONDITIONAL** (unchanged) |

---

## A. Executive Summary

P0.2 introduces **`VehicleOperationalProjection`** — a canonical, multi-dimensional operator contract that **consumes** P0.1 connectivity runtime state without re-deriving connectivity evidence.

It separates:

- **business workflow state** (`vehicles.status` family)
- **operational availability** (operator-facing readiness with verification semantics)
- **connectivity** (P0.1 authority, embedded by reference)
- **health evaluability** (whether health can be presented confidently — not mechanical health itself)
- **attention** and **operator summary** (deterministic semantic codes)

No fleet UI, availability badge, health badge, or `vehicles.status` mutation is in scope.

---

## B. Problem Statement

SynqDrive surfaces independently interpret telemetry freshness, device connectivity, business availability, and health:

| Surface | Today | Problem |
|---------|-------|---------|
| Fleet list availability badge | `deriveFleetStatusContext` → `AVAILABLE` | Ignores >30d telemetry silence |
| Fleet list health badge | `RentalHealthService` | May show module states despite stale telemetry |
| Vehicle Detail connectivity | Live store + telemetry freshness | Not unified with fleet connectivity runtime |
| Fleet → Connectivity | P0.1 runtime | Correct diagnostics but isolated |
| Dashboard readiness | Client `vehicleRuntimeStateBuilder` | Re-derives rules locally |

Example: **WOB L 7503** — `vehicles.status=AVAILABLE` while P0.1 reports `OFFLINE` + `DEVICE_CHECK_REQUIRED`.

---

## C. Current Fragmented State Sources

### A. `vehicles.status`
- **Persistence:** `Vehicle.status` (`AVAILABLE`, `RENTED`, `RESERVED`, `IN_SERVICE`, `OUT_OF_SERVICE`)
- **Backend:** `vehicles.service.ts` → `deriveFleetStatusContext()`
- **DTO:** `FleetVehicleOperationalStateDto` (`fleet-operational-state.util.ts`)
- **Classification:** **BUSINESS_STATE** + **DERIVED** display

### B. Fleet list availability badge
- **Frontend:** `FleetOperatorRow` → `resolveOperationalStatusBadge()` → `selectOperationalStatus()`
- **API:** `GET .../fleet-map`
- **Classification:** **DERIVED** from business/booking context — **not** connectivity-aware

### C. Fleet list health badge
- **Backend:** `RentalHealthService.getVehicleHealth()`
- **API:** `GET .../rental-health/fleet`
- **Frontend:** `resolveHealthDisplay()` in `fleetVehicleDisplay.ts`
- **Classification:** **CANONICAL** rental health; **LEGACY** fallback `Vehicle.healthStatus`

### D. Vehicle Detail connectivity
- **Frontend:** `VehicleConnectionBadge` + `telemetryFreshness.ts`
- **Backend:** `vehicle-state-interpreter.ts`, `VehicleLatestState`
- **Classification:** **DERIVED** freshness — **not** P0.1 runtime on detail header

### E. Vehicle Detail OBD badge
- **Frontend:** `obd-plug-status.ts` — explicit `obdIsPluggedIn === false` only
- **API:** `GET .../fleet-connectivity` snapshot field
- **Classification:** **DERIVED** snapshot signal

### F. Vehicle Detail interruption display
- **API:** `GET .../vehicles/:id/device-connection`
- **Backend:** `buildDeviceConnectionSummary()` + `deriveInterruptionKnowledge()`
- **Classification:** **DERIVED**; `interruptionKnowledge` on API, partial UI adoption

### G. Fleet → Connectivity
- **API:** `GET .../fleet-connectivity`
- **Backend:** `VehicleConnectivityRuntimeProjectionService` + runtime builder
- **Classification:** **CANONICAL** P0.1 runtime

### H. Dashboard readiness
- **Frontend:** `vehicleRuntimeStateBuilder.ts`, `rentalReadiness.ts`
- **Classification:** **DERIVED** client-side

### I. Booking eligibility
- **Backend:** `booking-rental-eligibility.service.ts`, `RentalHealthService.isRentalBlocked()`
- **Classification:** **CANONICAL** rental rules + health gate

### J. Health summary
- **Backend:** `RentalHealthService`, `vehicle-health-tab-summary.service.ts`
- **Classification:** **CANONICAL** module evaluators; orthogonal `availability` pipeline field

---

## D. P0.1 Dependency

```
raw evidence
    ↓
VehicleConnectivityRuntimeStateBuilder   [P0.1 — authority]
    ↓
VehicleOperationalProjectionBuilder       [P0.2 — consumer]
    ↓
consumer presentation (P0.3+)
```

P0.2 **must not** reimplement:
- 48h telemetry thresholds
- webhook ordering
- snapshot-vs-unplug precedence
- `obdIsPluggedIn` physical evidence
- episode reliability inference

Implementation: `connectivity` field embeds full `VehicleConnectivityRuntimeState` by reference.

---

## E. Domain Boundaries

| Dimension | Authority | P0.2 role |
|-----------|-----------|-----------|
| Connectivity evidence | P0.1 runtime | Embed/reference |
| Business workflow | `Vehicle.status` + booking context | `businessState` |
| Operational availability | **P0.2 new** | `operationalAvailability` |
| Health condition | Rental Health V1 | Input snapshot only |
| Health evaluability | **P0.2 new** | `healthEvaluability` |
| Attention | Connectivity primary; business/health can elevate | `attention` |
| History | Device events / episodes APIs | **Excluded** from projection |

---

## F. Business vs Operational Availability

| Concept | Source | Mutated in P0.2? |
|---------|--------|------------------|
| `businessState` | `Vehicle.status` workflow | **No** |
| `operationalAvailability` | P0.2 derivation | N/A (derived read model) |

**Invariant:** `businessState=AVAILABLE` + `telemetryState=offline` + `DEVICE_CHECK_REQUIRED` → `operationalAvailability=NEEDS_VERIFICATION`, **not** plain `AVAILABLE`.

**Invariant:** Offline telemetry alone → **not** `UNAVAILABLE` (vehicle may be parked; operator needs verification, not automatic unusable).

---

## G. Health Condition vs Health Evaluability

| Field | Meaning |
|-------|---------|
| `health.conditionState` | Severity (`good`/`warning`/`critical`/…) — Rental Health domain |
| `healthEvaluability` | Whether assessment is trustworthy now |

### Health Evaluability Authority

**Invariant:** Fresh connectivity is **necessary** for some health signals but is **never sufficient** to prove health evaluability.

| Rule | Behavior |
|------|----------|
| No health input | `UNKNOWN` |
| Health pipeline `unavailable` | `NOT_EVALUABLE` |
| Health input without `generatedAt` | `UNKNOWN` (no proven evaluation timestamp) |
| Pipeline `ready` + no stale modules + `generatedAt` | Health-domain base `EVALUABLE` |
| Pipeline `partial` or some stale modules | `PARTIALLY_EVALUABLE` |
| Broadly stale / unusable health metadata | `NOT_EVALUABLE` |

**Connectivity downgrade-only role:**
- Bad/stale connectivity **may reduce** evaluability when telemetry-dependent modules are in scope or coverage is insufficient.
- Good/live/standby connectivity **cannot create** health evidence or upgrade `UNKNOWN` → `EVALUABLE`.
- Offline connectivity **alone** does not force `NOT_EVALUABLE` when health pipeline is `ready` and modules are current.

**Asymmetry (central invariant):**
```
Connectivity state ≠ Health condition ≠ Health evaluability
```

**Production reference:**
- HMÜ C 215: connectivity proven; health input absent → `healthEvaluability=UNKNOWN` (not `EVALUABLE`).
- WOB L 7503 / 9755: `NOT_EVALUABLE` driven by health `pipelineAvailability=unavailable` + missing `generatedAt`, not merely `overallState=OFFLINE`.

**Does not** infer `critical`/`bad` health from offline connectivity.

---

## H. Attention Model

Uses connectivity `AttentionState` vocabulary: `NONE`, `WATCH`, `ACTION_REQUIRED`, `CRITICAL`.

Elevation rules:
1. Business `IN_SERVICE` / `OUT_OF_SERVICE` → at least `ACTION_REQUIRED`
2. Health `rentalBlocked=true` (pipeline ready) → `CRITICAL`
3. Health `critical` (pipeline ready) → max with connectivity
4. `operationalAvailability=NEEDS_VERIFICATION` → at least `ACTION_REQUIRED`

---

## I. Operator Summary

```typescript
operatorSummary: {
  state: OperationalAvailabilityState;
  reasonCodes: OperationalReasonCode[];
  primaryReason: OperationalReasonCode | null;
  recommendedAction: ConnectivityRecommendedAction;
}
```

Deterministic `primaryReason` precedence documented in builder. No i18n strings.

---

## J. Evidence / Freshness

```typescript
evidence: {
  generatedAt: string;
  latestTelemetryAt: string | null;
  latestConnectivityEvidenceAt: string | null;
  healthEvidenceAt: string | null;
  episodeEvidenceReliable: boolean | null;
}
```

No raw provider payloads. Shared `generatedAt` per batch request.

---

## K. Reason Code Ownership

### Connectivity-owned (preserve verbatim)
`TELEMETRY_*`, `DEVICE_*`, `DATA_COVERAGE_*`, `STATE_CONFLICT`, `PROVIDER_*`, `WEBHOOK_*`, …

### Projection-owned (additive only)
- `BUSINESS_WORKFLOW_BLOCKED`
- `HEALTH_RENTAL_BLOCKED`
- `CONNECTIVITY_CONFIRMED_INTERRUPTION`
- `CONNECTIVITY_VERIFICATION_REQUIRED`
- `INSUFFICIENT_CROSS_DOMAIN_EVIDENCE`

P0.2 must **not** redefine connectivity code meanings.

---

## L. Precedence Rules

1. Business workflow hard-block (`IN_SERVICE`, `OUT_OF_SERVICE`) → `UNAVAILABLE`
2. Health rental hard-block (pipeline `ready` + `rentalBlocked=true`) → `UNAVAILABLE`
3. Confirmed current connectivity interruption → `NEEDS_VERIFICATION`
4. Connectivity verification required (offline, `DEVICE_CHECK_REQUIRED`, …) → `NEEDS_VERIFICATION`
5. Healthy connectivity dimensions → `AVAILABLE`

**Hard block ≠ verification required.** Lower-confidence connectivity never overrides stronger business state.

---

## M. VehicleOperationalProjection Contract

**Location:** `backend/src/modules/vehicles/operational/projection/`

```typescript
interface VehicleOperationalProjection {
  vehicleId: string;
  organizationId: string;
  generatedAt: string;
  projectionVersion: number;

  businessState: BusinessOperationalState;
  connectivity: VehicleConnectivityRuntimeState;  // P0.1 embed
  operationalAvailability: OperationalAvailabilityState;
  healthEvaluability: HealthEvaluabilityState;
  attention: OperatorAttentionLevel;
  operatorSummary: VehicleOperationalOperatorSummary;
  evidence: VehicleOperationalEvidence;
}
```

**Vocabularies:**
- `BusinessOperationalState`: `AVAILABLE` | `RENTED` | `RESERVED` | `IN_SERVICE` | `OUT_OF_SERVICE` | `UNKNOWN`
- `OperationalAvailabilityState`: `AVAILABLE` | `NEEDS_VERIFICATION` | `UNAVAILABLE` | `UNKNOWN`
- `HealthEvaluabilityState`: `EVALUABLE` | `PARTIALLY_EVALUABLE` | `NOT_EVALUABLE` | `UNKNOWN`

---

## N. Batch Projection Strategy

- `buildVehicleOperationalProjection()` — single vehicle
- `buildVehicleOperationalProjectionBatch()` — shared `generatedAt` anchor

**N+1 avoidance:** Batch builder accepts pre-loaded `VehicleConnectivityRuntimeState` per vehicle. No DB access inside builder.

**Future fleet list:** assemble connectivity batch first (existing projection service), then map operational projections in one pass.

**Caching:** Document only — no new cache in P0.2 slice.

---

## O. Current-State vs History Boundary

`VehicleOperationalProjection` describes **current** operational truth.

Historical unplug events, episode timelines, and device-connection event lists remain on:
- `GET .../device-connection`
- Episode/history endpoints

Old unplug events must not dominate current projection when superseded by P0.1 recovery evidence.

---

## P. Episode Reliability Boundary

When `episodeEvidenceReliable=false` (Production Processing Gate **CONDITIONAL**):
- Projection adds `INSUFFICIENT_CROSS_DOMAIN_EVIDENCE`
- Does not infer `known_none` interruption from episode absence
- Preserves P0.1 connectivity attention/reason codes

---

## Q. Production Reference Cases

### HMÜ C 215
- `businessState=AVAILABLE`
- `connectivity`: `PLUGGED_INFERRED`, `standby`, attention `NONE`
- `operationalAvailability=AVAILABLE`
- `healthEvaluability=UNKNOWN` (connectivity-only forensic reference — health not proven)
- Historical July unplug does not block

### WOB L 7503
- `businessState=AVAILABLE`
- `connectivity`: `OFFLINE`, `UNKNOWN` physical, `DEVICE_CHECK_REQUIRED`
- `operationalAvailability=NEEDS_VERIFICATION`
- `healthEvaluability=NOT_EVALUABLE` (health pipeline `unavailable`, not offline alone)

### WOB L 9755
- Same operational outcome as 7503
- `physicalDeviceState=UNKNOWN` (not `UNPLUGGED_CONFIRMED`)
- COMMUNICATION_RECOVERY_ONLY — no false recovery claim

---

## R. Synthetic Contract Cases

| Case | Expected `operationalAvailability` | Expected `healthEvaluability` |
|------|-----------------------------------|------------------------------|
| A — healthy connectivity + business AVAILABLE | `AVAILABLE` | (with synthetic health) `EVALUABLE` |
| B — confirmed current unplug | `NEEDS_VERIFICATION` | — |
| C — >48h silence, no unplug | `NEEDS_VERIFICATION` | — |
| D — recovered after historical unplug | `AVAILABLE` | — |
| E — silence after recovery | `NEEDS_VERIFICATION`, not unplugged | — |
| F — `obdIsPluggedIn=false` fresh comm | `NEEDS_VERIFICATION` | — |
| G — business `IN_SERVICE` | `UNAVAILABLE` | — |
| H — health critical + rental blocked | `UNAVAILABLE` | `EVALUABLE` |

### Health evaluability cases H1–H8

| Case | Expected `healthEvaluability` |
|------|------------------------------|
| H1 — no health + healthy connectivity | `UNKNOWN` |
| H2 — pipeline ready + current evidence | `EVALUABLE` |
| H3 — some module stale | `PARTIALLY_EVALUABLE` |
| H4 — stale/unavailable health + healthy connectivity | `NOT_EVALUABLE` |
| H5 — current health + offline telemetry-dependent | `PARTIALLY_EVALUABLE` |
| H6 — health CRITICAL + current evidence | `EVALUABLE` |
| H7 — health GOOD + stale modules | `PARTIALLY_EVALUABLE` |
| H8 — rentalBlocked + current evidence | `EVALUABLE` (operational `UNAVAILABLE`) |

Tests: `vehicle-operational-projection.builder.spec.ts`

---

## S. Consumer Migration Plan

| Slice | Consumes | Status |
|-------|----------|--------|
| **P0.3 Fleet Availability** | `operationalAvailability`, `operatorSummary` | Not started |
| **P0.4 Health** | `healthEvaluability` + Rental Health condition | Not started |
| **Vehicle Detail** | `connectivity` + `operatorSummary` | Not started |
| **Fleet → Connectivity** | `connectivity` + `attention` (history separate) | Not started |
| **Dashboard** | `operationalAvailability` for readiness KPIs | Not started |

---

## T. Explicit Non-Goals

- Fleet/health/availability UI migration
- `vehicles.status` mutation
- Webhook processing changes
- Production data replay
- Post-cutover unplug reproduction test
- P0.3 / P0.4 implementation
- New DB columns
- Numeric confidence scores

---

## U. Risks / Open Questions

1. **RENTED / RESERVED semantics** — currently not hard-blocked in operational availability; booking context may need P0.3 refinement.
2. **Health input shape** — P0.2 uses minimal `HealthConditionSnapshot`; full `VehicleHealth` adapter TBD at API boundary.
3. **API exposure** — contract exists as domain module; REST endpoint deferred to consumer migration slices.
4. **Episode reliability signal** — caller must pass `episodeEvidenceReliable` from deployment config / P0.1 observability.

---

## V. P0.3 / P0.4 Entry Criteria

**P0.3 Availability migration may start when:**
- P0.2 contract merged and stable
- Fleet-map / list API can attach projection batch without N+1

**P0.4 Health migration may start when:**
- P0.3 operational availability wired
- Health UI consumes `healthEvaluability` before showing confident GOOD

**Production Processing Gate** remains **CONDITIONAL** until natural post-cutover lifecycle observed.

---

## Implementation Files

| File | Role |
|------|------|
| `vehicle-operational-projection.types.ts` | Contract + vocabularies |
| `vehicle-operational-projection.builder.ts` | Pure derivation |
| `vehicle-operational-projection.fixtures.ts` | Semantic reference fixtures |
| `health-evidence.adapter.ts` | `VehicleHealth` → `HealthEvidenceSnapshot` |
| `vehicle-operational-projection.builder.spec.ts` | Contract + reference + H1–H8 tests |
| `business-state.adapter.ts` | Fleet context → `businessState` |
| `vehicle-operational-projection.service.ts` | Application service (batch + single) |
| `vehicle-operational-projection.service.spec.ts` | Service integration + cases I–P |
| `business-state.adapter.spec.ts` | Business adapter unit tests |
| `health-evidence.adapter.spec.ts` | Health adapter unit tests |
| `scripts/ops/shadow-vehicle-operational-projection-readonly.ts` | Read-only legacy vs P0.2 shadow compare |

---

## W. Implementation (August 2026)

### A. Application Service

**Authority:** `backend/src/modules/vehicles/operational/projection/vehicle-operational-projection.service.ts`

| Method | Purpose |
|--------|---------|
| `getVehicleProjection({ organizationId, vehicleId, now? })` | Single-vehicle projection; `NotFoundException` when missing |
| `getVehicleProjections({ organizationId, vehicleIds?, now? })` | Batch projection map keyed by `vehicleId` |

Registered in `VehiclesModule` and exported for future consumer wiring. **No REST/controller exposure** in this slice.

### B. Data Sources

| Dimension | Authoritative loader | Notes |
|-----------|---------------------|-------|
| Business/workflow | `VehiclesService.deriveFleetBusinessContextBatch()` | Reuses `buildBookingContextMap` + `deriveFleetStatusContext`; does not mutate `Vehicle.status` |
| Connectivity (P0.1) | `VehicleConnectivityRuntimeProjectionService.projectForVehicles()` | Embedded by reference — no duplicate telemetry/webhook rules |
| Health evaluability input | `RentalHealthSummaryService.getFleetRowsBatch()` | Cache-aside fleet rows → `healthEvidenceFromVehicleHealth()` |
| Episode reliability | `ConnectivityLifecycleRuntimePolicyService.automaticLifecycleReconciliationEnabled` | `false` → `INSUFFICIENT_CROSS_DOMAIN_EVIDENCE` when no active episode |
| Vehicles | `PrismaService.vehicle.findMany` (org-scoped) | Single bounded read per batch |

### C. Health Adapter

`health-evidence.adapter.ts` maps `VehicleHealth` → `HealthEvidenceSnapshot` only. P0.2 does **not** re-run health modules.

**Failure behavior:** if `getFleetRowsBatch` throws, the service logs `vehicle_operational_projection.health_load_failed` and continues with empty health rows → `healthEvaluability = UNKNOWN` per vehicle (does not crash the batch).

### D. P0.1 Integration

Connectivity runtime objects from `projectForVehicles()` are passed directly into `buildVehicleOperationalProjection()`. Regression test asserts object identity (no re-derivation).

### E. Batch Strategy

Per batch request:

1. One `vehicle.findMany` (org + optional id filter; deduped ids)
2. Parallel: business batch + connectivity batch
3. Health batch (chunked internally by rental-health summary service)
4. In-memory pure builder per vehicle with shared `generatedAt`

Empty `vehicleIds: []` returns immediately without queries.

### F. Tenant Isolation

All queries include `organizationId`. Foreign vehicle IDs return empty map (batch) or `NotFoundException` (single). No cross-tenant existence leak.

### G. Failure Semantics

| Failure | Behavior |
|---------|----------|
| Vehicle not found | Single: `NotFoundException`; batch: omitted from map |
| Health loader failure | Degrade to `healthEvaluability UNKNOWN`; projection continues |
| Connectivity missing for resolved vehicle | Hard error (invariant violation) |
| Business context missing | Hard error (invariant violation) |
| Business booking context unavailable | `businessState UNKNOWN` via existing fleet DTO semantics |

### H. Query Complexity

Service tests assert for 10 and 100 vehicles:

- `vehicle.findMany` × 1
- `deriveFleetBusinessContextBatch` × 1
- `projectForVehicles` × 1
- `getFleetRowsBatch` × 1

Health batch uses internal chunk size 5 but remains **O(vehicles)** with bounded concurrency, not N+1 per domain loader.

### I. Shadow Comparison

**Script:** `backend/scripts/ops/shadow-vehicle-operational-projection-readonly.ts`

Compares legacy `deriveFleetStatusContext` display token vs P0.2 `businessState` / `operationalAvailability` for operator-selected plates or vehicle IDs. Read-only; JSON stdout.

### J. Production Read-Only Validation

Run on VPS with production env:

```bash
cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/shadow-vehicle-operational-projection-readonly.ts \
  --organization-id=<org> --license-plate="WOB L 7503" --license-plate="WOB L 9755" --license-plate="HMÜ C 215"
```

Expected delta for long-offline pair: legacy `AVAILABLE` vs P0.2 `operationalAvailability NEEDS_VERIFICATION` while `businessState AVAILABLE` preserved.

### K. Consumer Migration Readiness

| Gate | Status |
|------|--------|
| Canonical service | ✅ |
| Batch path | ✅ |
| Contract tests A–H + H1–H8 | ✅ |
| Service tests I–P | ✅ |
| No consumer wiring | ✅ |
| No persisted projection table | ✅ |
| No dedicated P0.2 Redis cache | ✅ |

### L. Known Limitations

1. Health batch is the heaviest leg (canonical evaluator per vehicle, chunked).
2. No REST diagnostic endpoint — ops script only.
3. `RENTED` / `RESERVED` not hard-blocked in operational availability (P0.3 scope).
4. Production Processing Gate remains **CONDITIONAL**.

---

## X. Consumer Migration Order (unchanged)

1. **P0.3** — Fleet operational availability badge
2. **P0.4** — Health evaluability / Health badge
3. **P0.5** — Vehicle Detail connectivity presentation
4. **P0.6** — Fleet → Connectivity presentation alignment
5. **P0.7** — Dashboard/readiness consumers

---

## Y. Final Implementation Gate (August 2026)

### Business-state authority

`FleetVehicleOperationalStateDto.dataQualityState` is set **only** by `buildFleetOperationalStateDto()`:

| Value | Cause | Connectivity/Health involved? |
|-------|-------|-------------------------------|
| `RELIABLE` | Normal `deriveFleetStatusContext` success | **No** |
| `UNAVAILABLE` | `bookingContextLoadFailed: true` only | **No** |
| `DEGRADED` | Reserved in type; **not emitted** today | **No** |

`status === 'UNKNOWN'` occurs when booking context load failed or display token is unrecognized — still **business/booking** scope only.

**P0.2 adapter rule (final):**

1. Persisted `IN_SERVICE` / `OUT_OF_SERVICE` → always map to matching `businessState` (authoritative over booking overlay failure).
2. If `dataQualityState === 'UNAVAILABLE'` OR `!isReliable` OR `status === 'UNKNOWN'` → `businessState = UNKNOWN` (booking-dependent vehicles only).
3. Otherwise map `operationalState.status` token (`AVAILABLE`, `ACTIVE_RENTED` → `RENTED`, etc.).

Connectivity uncertainty affects **`operationalAvailability`** only, never `businessState`, when business overlay is reliable.

### Apples-to-apples shadow design

`shadow-vehicle-operational-projection-readonly.ts`:

1. One org-scoped `vehicle.findMany`
2. One `deriveFleetStatusContextBatch()` — shared booking load for legacy + resolved business context
3. One `VehicleOperationalProjectionService.getVehicleProjections()` — exercises canonical P0.1 connectivity via service
4. One `getFleetRowsBatch()` for health shadow metadata (`healthSourceAvailable`)

Legacy and P0.2 `businessState` both derive from the **same** `FleetVehicleOperationalStateDto` produced by the batch loader.

### Production reference results (read-only, F.S Mobility org)

Executed on VPS against production DB via `VehicleOperationalProjectionService` (see PR gate report).

### P0.3 entry decision

**P0.3 may proceed** when Production shadow confirms long-offline pair:

- `businessState = AVAILABLE`
- `operationalAvailability = NEEDS_VERIFICATION`

**Production Processing Gate** remains **CONDITIONAL** (post-cutover unplug lifecycle not reproduced).

### Remaining limitations

- Health batch remains heaviest leg.
- No REST diagnostic endpoint.
- `RENTED`/`RESERVED` operational hard-block deferred to P0.3.
