# Trip Detection & Lifecycle — Open Questions

| OQ ID | Question | Priority | Blocking promotion? | Status (2026-09-25) |
|-------|----------|----------|---------------------|---------------------|
| **TDL-OQ-001** | What is the exact durable handoff from `TripDecisionEngine.finalizeTrip()` COMPLETED to Driving Intelligence analysis (`tripAnalysisStatus`, `driving.intelligence.jobs`)? | High | No — contract + org invariant closed | **RESOLVED** — see §TDL-OQ-001 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-002** | Does `backend/src/modules/vehicle-intelligence/drive-profile/` belong to Trip Detection, Battery V2, or a shared profile layer? | High | Yes (boundary) | **RESOLVED** — see §TDL-OQ-002 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-003** | Why does Production have only a small number of `vehicle_trip_detection_states` rows while tracking runs are in the thousands? | Medium | No | **RESOLVED** — see §TDL-OQ-003 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-004** | What is the target route-artifact coverage policy and current bottleneck (Mapbox, FMM, eligibility gates)? | Medium | No | **RESOLVED** — see §TDL-OQ-004 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-005** | Should Prisma `TripDetectionState.ENDED` be removed or repurposed? | Low | No | OPEN |
| **TDL-OQ-006** | How do DIMO Segments reconcile with live FSM boundaries when both exist — which wins in conflict? | High | No — boundary contract documented | **RESOLVED** — see §TDL-OQ-006 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-007** | Are R1–R8 behaviors validated on Production post-deploy, or only on `main` via tests? | Medium | Yes for PRODUCTION_VALIDATED claims | **RESOLVED** — see §TDL-OQ-007 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-008** | What is the complete trip-related feature-flag matrix and default values per environment? | Medium | No | **RESOLVED** — see §TDL-OQ-008 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-009** | Does tiered snapshot polling match the documented R9 provider-wake ingress model on current `main` and Production? | Medium | No | **RESOLVED** — see §TDL-OQ-009 below | **CLOSED** (2026-09-26) |
| **TDL-OQ-010** | What dead/legacy trip code paths remain (pre-V2 segmentation, duplicate enrichment)? | Medium | No | OPEN |

## TDL-OQ-003 — resolution (2026-09-25)

**Evidence:** [TDL_OQ_003_DETECTION_STATE_CARDINALITY_LIFECYCLE_2026-09-25.md](../evidence/TDL_OQ_003_DETECTION_STATE_CARDINALITY_LIFECYCLE_2026-09-25.md) (TDL-EVID-OQ003-CARDINALITY-001) @ Production `99d722b4…`.

**Verdict:** **`RESOLVED_EXPECTED_CARDINALITY`** (TDL-DEC-OQ003-001) — one lazy FSM row per vehicle (unique `vehicleId`); tracking runs append-only during Vehicle lifetime (cascade-delete on Vehicle delete); scheduler-eligible cohort **6/6** has state rows; **3** non-DIMO fleet vehicles correctly have zero rows; **0** eligible-without-state; comparing run count to state count is not a coverage metric.

**Status:** **RESOLVED** — historical H1 **`PARTIALLY_CONFIRMED`** (H1a cohort **CONFIRMED**; H1b “most fleet … until connected” **NOT CONFIRMED**).

## TDL-OQ-007 — resolution (2026-09-25, OQ-007.1 passive closure)

**Evidence:**

- [TDL_OQ_007_R1_R8_PRODUCTION_VALIDATION_COVERAGE_2026-09-25.md](../evidence/TDL_OQ_007_R1_R8_PRODUCTION_VALIDATION_COVERAGE_2026-09-25.md) (TDL-EVID-OQ007-R1R8-COV-001)
- [TDL_OQ_007_1_PASSIVE_PRODUCTION_EVIDENCE_CLOSURE_2026-09-25.md](../evidence/TDL_OQ_007_1_PASSIVE_PRODUCTION_EVIDENCE_CLOSURE_2026-09-25.md) (TDL-EVID-OQ007-1-PASSIVE-CLOSURE-001)

**Verdict:** **`RESOLVED_BY_SCOPE_REDUCTION`** (TDL-DEC-OQ007-001) — all **14** active contracts now **PRODUCTION_VALIDATED** or **VALIDATED_BY_CURRENT_EQUIVALENT**; **0** active **PRODUCTION_PRESENT_NOT_VALIDATED**.

**OQ-007.1 closed the four former gaps:**

| ID | Result |
|----|--------|
| R1-BEH-003 | PRODUCTION_VALIDATED (movement anchor vs waypoint event times) |
| R3-BEH-002 | VALIDATED_BY_CURRENT_EQUIVALENT (persisted PS errors + fail→ACTIVE_TRIP chains; BullMQ attempt **PARTIAL**) |
| R4-BEH-001 | PRODUCTION_VALIDATED — explicit two-phase start contract (candidate vs confirmation phase, freshness authority, anchor consistency; **not** identical scoring) |
| R8-BEH-001 | PRODUCTION_VALIDATED (authorized metrics scrape; non-zero recognition histograms) |

**Status:** **RESOLVED** — OQ-007 closed. QS acceptance remains **`PASS_WITH_EVIDENCE_GAPS`** (separate surface).

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

**Status:** **RESOLVED** for authority; promotion to `AUTHORITY_ACTIVE` still blocked by other open OQs (e.g. TDL-OQ-005, TDL-OQ-010).

## TDL-OQ-008 — resolution (2026-09-25)

**Evidence:** [TDL_OQ_008_FEATURE_FLAG_RUNTIME_MATRIX_2026-09-25.md](../evidence/TDL_OQ_008_FEATURE_FLAG_RUNTIME_MATRIX_2026-09-25.md) (TDL-EVID-OQ008-FLAG-MATRIX-001) @ `origin/main` `6af181bf9…`, Production @ `8a1d9c658…` / `20260925182907_v4994`.

**Verdict:** **`RESOLVED_COMPLETE_MATRIX`** — 10 mode + 1 scope allowlist + 28 lifecycle knobs; Production effective values read-only from shared `backend.env`; **`REPLICA_CONFIG_SOURCE_CONSISTENT=YES`**; **`REPLICA_EFFECTIVE_FLAG_STATE_CONSISTENT=INFERRED_NOT_DIRECTLY_INTROSPECTED`**; FSM shadow **observability-only**; repair **`shadow`** mode (legacy overlap authority); snapshot **`ACTIVITY_TIERED`**.

**Status:** **RESOLVED**

## TDL-OQ-009 — resolution (2026-09-26)

**Evidence:** [TDL_OQ_009_TIERED_POLLING_R9_INGRESS_2026-09-26.md](../evidence/TDL_OQ_009_TIERED_POLLING_R9_INGRESS_2026-09-26.md) (TDL-EVID-OQ009-R9-INGRESS-001) @ `origin/main` `47a3b42b8…`, Production @ `8a1d9c658…`.

**Verdict:** **`RESOLVED_INGRESS_CONTRACT_ALIGNED`** — R9 **present** on current Production (ancestor `4bef6046…`); **ACTIVITY_TIERED** polling + shared `snapshot-{vehicleId}` coordinator aligned with code; provider wake **RESTING-only**; tier fallback nominal 30s/60s/5m/30m; **R9 authorized cohort 5/5 subscribed (100%)**; **1** stale former-fleet scheduler mirror (DIM-GAP-005, not R9 defect); recent operational wake counters **INSUFFICIENT_EVIDENCE**.

**Status:** **RESOLVED**

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

- **H1a:** Six detection-state rows = current scheduler-eligible DIMO live-FSM cohort — **CONFIRMED** @ `2026-09-25` (TDL-OQ-003).
- **H1b:** “Most fleet vehicles lack live FSM rows until connected” — **NOT CONFIRMED** (6/9 have rows; 3 non-DIMO only).
- **H2:** High `MISSING_TRIP` repair PROPOSED count is reconciliation scanning historical DIMO gaps, not live FSM failure.
- **H3:** Route artifact gap is eligibility/timing (post-finalize pipeline) rather than Mapbox outage — **PARTIALLY_CONFIRMED** @ `2026-09-25` (TDL-OQ-004): **7d** **100%**; **observed materialization era** **374/374**; exact Route-V2 **30d policy** **NOT_EXACTLY_COMPUTABLE** (R2 deploy **UNKNOWN**); **33** missing = **26** pre-R2-merge execution + **7** unknown runtime.

## TDL-OQ-004 — resolution (2026-09-25)

**Evidence:** [TDL_OQ_004_ROUTE_ARTIFACT_COVERAGE_POLICY_2026-09-25.md](../evidence/TDL_OQ_004_ROUTE_ARTIFACT_COVERAGE_POLICY_2026-09-25.md) (TDL-EVID-OQ004-ROUTE-COV-001) @ `origin/main` `55fcbe7a…`, Production @ `8a1d9c658…` / `20260925182907_v4994`.

**Verdict:** **`RESOLVED_WITH_BOUNDED_GAPS`** (TDL-DEC-OQ004-001) — three-tier coverage policy; **R2 Production deploy anchor UNKNOWN**; **33** rows reclassified (**0** post-first-artifact handler-gap proof); **`CURRENT_CODE_CONTRACT_GAP`** structural only (**not** observed post-anchor in Production).

**Status:** **RESOLVED**
