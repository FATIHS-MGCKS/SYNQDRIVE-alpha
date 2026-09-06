# Trip Detection & Lifecycle — Open Questions

| OQ ID | Question | Priority | Blocking promotion? |
|-------|----------|----------|-------------------|
| **TDL-OQ-001** | What is the exact durable handoff from `TripDecisionEngine.finalizeTrip()` COMPLETED to Driving Intelligence analysis (`tripAnalysisStatus`, `driving.intelligence.jobs`)? | High | Yes |
| **TDL-OQ-002** | Does `backend/src/modules/vehicle-intelligence/drive-profile/` belong to Trip Detection, Battery V2, or a shared profile layer? | High | Yes (boundary) |
| **TDL-OQ-003** | Why does Production have only 6 `vehicle_trip_detection_states` rows while tracking runs are in the thousands per week? | Medium | No |
| **TDL-OQ-004** | What is the target route-artifact coverage policy and current bottleneck (Mapbox, FMM, eligibility gates)? | Medium | No |
| **TDL-OQ-005** | Should Prisma `TripDetectionState.ENDED` be removed or repurposed? | Low | No |
| **TDL-OQ-006** | How do DIMO Segments reconcile with live FSM boundaries when both exist — which wins in conflict? | High | Yes (cross-module) |
| **TDL-OQ-007** | Are R1–R8 behaviors validated on Production post-deploy, or only on `main` via tests? | Medium | Yes for PRODUCTION_VALIDATED claims |
| **TDL-OQ-008** | What is the complete trip-related feature-flag matrix and default values per environment? | Medium | No |
| **TDL-OQ-009** | Does tiered snapshot polling (pre-R9 on Production) match documented ingress on `main`? | Medium | No until R9 scope |
| **TDL-OQ-010** | What dead/legacy trip code paths remain (pre-V2 segmentation, duplicate enrichment)? | Medium | No |

## Hypotheses (not confirmed)

- **H1:** Six detection-state rows reflect vehicles with active DIMO snapshot polling only — most fleet vehicles lack live FSM rows until connected.
- **H2:** High `MISSING_TRIP` repair PROPOSED count is reconciliation scanning historical DIMO gaps, not live FSM failure.
- **H3:** Route artifact gap is eligibility/timing (post-finalize pipeline) rather than Mapbox outage.

Hypotheses require Phase 3+ evidence — do not treat as CURRENT_STATE facts.
