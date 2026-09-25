# Trip Detection & Lifecycle — Open Questions

| OQ ID | Question | Priority | Blocking promotion? | Status (2026-09-25) |
|-------|----------|----------|---------------------|---------------------|
| **TDL-OQ-001** | What is the exact durable handoff from `TripDecisionEngine.finalizeTrip()` COMPLETED to Driving Intelligence analysis (`tripAnalysisStatus`, `driving.intelligence.jobs`)? | High | No — contract + org invariant closed | **RESOLVED** — see §TDL-OQ-001 below | **CLOSED** (2026-09-25) |
| **TDL-OQ-002** | Does `backend/src/modules/vehicle-intelligence/drive-profile/` belong to Trip Detection, Battery V2, or a shared profile layer? | High | Yes (boundary) | OPEN |
| **TDL-OQ-003** | Why does Production have only 6 `vehicle_trip_detection_states` rows while tracking runs are in the thousands per week? | Medium | No | OPEN (historical aggregate; re-verify on `99d722b4…` when needed) |
| **TDL-OQ-004** | What is the target route-artifact coverage policy and current bottleneck (Mapbox, FMM, eligibility gates)? | Medium | No | OPEN |
| **TDL-OQ-005** | Should Prisma `TripDetectionState.ENDED` be removed or repurposed? | Low | No | OPEN |
| **TDL-OQ-006** | How do DIMO Segments reconcile with live FSM boundaries when both exist — which wins in conflict? | High | Yes (cross-module) | **OPEN** — follow **after TDL-OQ-001** contract baseline |
| **TDL-OQ-007** | Are R1–R8 behaviors validated on Production post-deploy, or only on `main` via tests? | Medium | Yes for PRODUCTION_VALIDATED claims | **PARTIALLY_RESOLVED** — see §TDL-OQ-007 below |
| **TDL-OQ-008** | What is the complete trip-related feature-flag matrix and default values per environment? | Medium | No | OPEN |
| **TDL-OQ-009** | Does tiered snapshot polling (pre-R9 on Production) match documented ingress on `main`? | Medium | No until R9 scope | OPEN |
| **TDL-OQ-010** | What dead/legacy trip code paths remain (pre-V2 segmentation, duplicate enrichment)? | Medium | No | OPEN |

## TDL-OQ-007 — partial resolution (2026-09-25)

**Evidence:** [QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md](../evidence/QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md) (TDL-EVID-QS-V1-PROD-ACCEPT-001) @ Production `99d722b4…`.

**What this evidence supports:**

- Current Qualified Stop V1 **SAME_TRIP** semantics on **3/3** natural Production cases (`durationMs <= 300_000`).
- **PRODUCTION_PRESENT** ancestry for post-R12 fix merges including #1627, #1635, #1648, #1674, #1750, #1753 on `99d722b4…`.
- **No** known regression failure signatures in the read-only audit window (`NOT_OBSERVED_IN_AUDIT_WINDOW`).

**What this evidence does NOT support:**

- Per-behavior **PRODUCTION_VALIDATED** seal for **every** historical R1–R8 path.
- Natural Production proof for all end-detection modes, wake paths, or edge cases outside the audit window.
- **`FULLY_PRODUCTION_VALIDATED`** Qualified Stop classification — acceptance remains **`PASS_WITH_EVIDENCE_GAPS`**.

**Status:** **PARTIALLY_RESOLVED** — do not close OQ-007 without path-specific Production evidence or explicit scope reduction.

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
| **TDL-OQ-006** | **OPEN** — may proceed without OQ-001 blocker |

## Hypotheses (not confirmed)

- **H1:** Six detection-state rows reflect vehicles with active DIMO snapshot polling only — most fleet vehicles lack live FSM rows until connected.
- **H2:** High `MISSING_TRIP` repair PROPOSED count is reconciliation scanning historical DIMO gaps, not live FSM failure.
- **H3:** Route artifact gap is eligibility/timing (post-finalize pipeline) rather than Mapbox outage.

Hypotheses require Phase 3+ evidence — do not treat as CURRENT_STATE facts.
