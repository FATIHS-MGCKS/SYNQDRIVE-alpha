# Trip Detection & Lifecycle — Open Questions

| OQ ID | Question | Priority | Blocking promotion? | Status (2026-09-25) |
|-------|----------|----------|---------------------|---------------------|
| **TDL-OQ-001** | What is the exact durable handoff from `TripDecisionEngine.finalizeTrip()` COMPLETED to Driving Intelligence analysis (`tripAnalysisStatus`, `driving.intelligence.jobs`)? | High | No — contract + org invariant closed | **RESOLVED** — see §TDL-OQ-001 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-002** | Does `backend/src/modules/vehicle-intelligence/drive-profile/` belong to Trip Detection, Battery V2, or a shared profile layer? | High | Yes (boundary) | **RESOLVED** — see §TDL-OQ-002 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-003** | Why does Production have only 6 `vehicle_trip_detection_states` rows while tracking runs are in the thousands per week? | Medium | No | OPEN (historical aggregate; re-verify on `99d722b4…` when needed) |
| **TDL-OQ-004** | What is the target route-artifact coverage policy and current bottleneck (Mapbox, FMM, eligibility gates)? | Medium | No | OPEN |
| **TDL-OQ-005** | Should Prisma `TripDetectionState.ENDED` be removed or repurposed? | Low | No | OPEN |
| **TDL-OQ-006** | How do DIMO Segments reconcile with live FSM boundaries when both exist — which wins in conflict? | High | No — boundary contract documented | **RESOLVED** — see §TDL-OQ-006 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-007** | Are R1–R8 behaviors validated on Production post-deploy, or only on `main` via tests? | Medium | Yes for PRODUCTION_VALIDATED claims | **PARTIALLY_RESOLVED** — see §TDL-OQ-007 below | **OPEN** (active validation gaps) |
| **TDL-OQ-008** | What is the complete trip-related feature-flag matrix and default values per environment? | Medium | No | OPEN |
| **TDL-OQ-009** | Does tiered snapshot polling (pre-R9 on Production) match documented ingress on `main`? | Medium | No until R9 scope | OPEN |
| **TDL-OQ-010** | What dead/legacy trip code paths remain (pre-V2 segmentation, duplicate enrichment)? | Medium | No | OPEN |

## TDL-OQ-007 — partial resolution (2026-09-25, consistency correction)

**Evidence:** [TDL_OQ_007_R1_R8_PRODUCTION_VALIDATION_COVERAGE_2026-09-25.md](../evidence/TDL_OQ_007_R1_R8_PRODUCTION_VALIDATION_COVERAGE_2026-09-25.md) (TDL-EVID-OQ007-R1R8-COV-001) @ `REPO_CURRENT` `bca9579a1…`, Production @ `99d722b4…`.

**Verdict:** **`PARTIALLY_RESOLVED_ACTIVE_GAPS`** (TDL-DEC-OQ007-001).

**Cardinality (exclusive, 18 contracts):** PRODUCTION_VALIDATED **5** + VALIDATED_BY_CURRENT_EQUIVALENT **5** + PRODUCTION_PRESENT_NOT_VALIDATED **4** + SUPERSEDED **3** + DEAD **1**.

**Closed by scope reduction only:** superseded/dead historical paths (no natural replay required).

**Still open (active, Production-present, not validated):**

- **R1-BEH-003** — event-time `lastMeaningfulMovementAt` trace
- **R3-BEH-002** — PS failure → retry/recovery signature
- **R4-BEH-001** — start candidate/confirm scoring symmetry observable in Production
- **R8-BEH-001** — recognition latency histogram non-zero samples (authorized metrics scrape)

Passive observation can close these gaps; **no physical drive required** for the documented acceptance signatures. **No runtime defect** observed.

**Status:** **PARTIALLY_RESOLVED** — do **not** mark OQ-007 **RESOLVED** until the four active gaps are evidenced or reclassified with proof.

## TDL-OQ-001 — partial resolution (2026-09-25)

**Evidence:** [TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md](../evidence/TDL_OQ_001_COMPLETED_TO_DI_HANDOFF_AUDIT_2026-09-25.md) (TDL-EVID-OQ001-HANDOFF-001) @ `REPO_CURRENT` `f87391f79…`, Production @ `99d722b4…`.

**Resolved (code + read-only Production):**

- Canonical producer: **`TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion`**
- DI ingress: **`DrivingAnalysisInitService.initializeForCompletedTrip`** → **`driving.intelligence.jobs`**
- **`WHEN_IS_TRIP_COMPLETED_DURABLE`:** PostgreSQL commit of `TripDecisionEngine.finalizeTrip()` / `finalizeRepairedTrip()` update (**not** in same transaction as enqueue)
- Persisted handoff intent: **`DrivingAnalysisRun` + `DrivingIntelligenceJob`** before BullMQ
- Recovery: **`DrivingAnalysisReconciliationService`** (`TRIP_WITHOUT_ANALYSIS_RUN`, `PENDING_JOB_RETRY`, 10m leader scheduler)

**Verdict:** **`RESOLVED_WITH_BOUNDED_GAPS`** — not a confirmed handoff-loss defect; non-atomic DB vs enqueue + 14d reconciliation bound accepted.

**Org invariant (TDL-OQ-001.1):** [TDL_OQ_001_1_ORG_INVARIANT_AUDIT_2026-09-25.md](../evidence/TDL_OQ_001_1_ORG_INVARIANT_AUDIT_2026-09-25.md) (TDL-EVID-OQ001-1-ORG-001) — **`STRUCTURALLY_IMPOSSIBLE`** for durable COMPLETED trip with missing vehicle org + unrecoverable DI; producer null-context skip is recoverable via `TRIP_WITHOUT_ANALYSIS_RUN` when vehicle has org.

**Status:** **RESOLVED** — authority question answered; non-atomic enqueue is documented behavior, not an open org orphan defect.

## TDL-OQ-001 / TDL-OQ-006 — sequencing

| OQ | Required state |
|----|----------------|
| **TDL-OQ-001** | **RESOLVED** — TDL-EVID-OQ001-HANDOFF-001 + TDL-EVID-OQ001-1-ORG-001 |
| **TDL-OQ-006** | **RESOLVED** — TDL-EVID-OQ006-BOUNDARY-001 + DIM-EVID-OQ006-BOUNDARY-001 |

## TDL-OQ-006 — resolution (2026-09-25)

**Evidence:** [TDL_OQ_006_DIMO_SEGMENT_FSM_BOUNDARY_AUDIT_2026-09-25.md](../evidence/TDL_OQ_006_DIMO_SEGMENT_FSM_BOUNDARY_AUDIT_2026-09-25.md) (TDL-EVID-OQ006-BOUNDARY-001) @ `origin/main`, Production @ `99d722b4…`.

**Resolved contract:**

- **Live FSM + `TripDecisionEngine`** own canonical trip lifecycle boundaries during detection/finalize.
- **DIMO segments** are provider-fetched **repair/validation evidence** via `TripReconciliationService` — **not** direct `VehicleTrip` writers.
- **Mutations** only through **`TripDecisionEngine`** (`createRepairedTrip`, `finalizeRepairedTrip`, `repairTripBoundariesWithAudit`, `splitTripAtGap`) after overlap/partial-boundary/qualified-stop gates.
- **DIMO alone cannot overwrite** a completed FSM trip — bounded **extension-only** partial repair when containment + single-trip intersection pass.
- Mechanism order in `fetchTripSegments` is **provider fetch fallback**, not live boundary hierarchy.

**Verdict:** **`RESOLVED_WITH_BOUNDED_GAPS`** — JWT-empty vs fetch-failure indistinguishable in reconciliation fetch; overlap coverage default `shadow`.

**Status:** **RESOLVED** for authority; promotion to `AUTHORITY_ACTIVE` still blocked by other open OQs (e.g. TDL-OQ-003).

## TDL-OQ-002 — resolution (2026-09-25)

**Evidence:** [TDL_OQ_002_DRIVE_PROFILE_OWNERSHIP_AUDIT_2026-09-25.md](../evidence/TDL_OQ_002_DRIVE_PROFILE_OWNERSHIP_AUDIT_2026-09-25.md) (TDL-EVID-OQ002-DRIVE-PROFILE-001) @ `origin/main` `51b4590e4…`.

**Resolved contract:**

- **`backend/src/modules/vehicle-intelligence/drive-profile/` is Battery V2–owned** (powertrain classification for `BatteryDriveProfile` → battery policy / measurement sessions).
- **Trip Detection & Lifecycle does not own** this module and has **no productive runtime import** of the resolver (trip FSM uses **`VehicleDetectionProfile`** on detection state — separate concept).
- **Driving Intelligence** consumes **partial** classification only via `deriveVehicleCapabilityProfile` (master `fuelType` layer) for diagnostics — not trip boundary authority.
- **Energy Event Detection** uses **`resolveFleetPowertrainClass`**, not drive-profile resolver.
- Output is **`DERIVED_READ_MODEL`** (on-demand); optional snapshot on **`BatteryMeasurementSession.driveProfile`**.

**Verdict:** **`BATTERY_V2_OWNER`** — folder name is misleading (`LAYERING_SMELL`); optional future relocate/rename slice documented, **not required** for OQ-002 closure.

**Status:** **RESOLVED** for TDL authority boundary; **`AUTHORITY_ACTIVE` promotion** still blocked by other OQs.

## Hypotheses (not confirmed)

- **H1:** Six detection-state rows reflect vehicles with active DIMO snapshot polling only — most fleet vehicles lack live FSM rows until connected.
- **H2:** High `MISSING_TRIP` repair PROPOSED count is reconciliation scanning historical DIMO gaps, not live FSM failure.
- **H3:** Route artifact gap is eligibility/timing (post-finalize pipeline) rather than Mapbox outage.

Hypotheses require Phase 3+ evidence — do not treat as CURRENT_STATE facts.
