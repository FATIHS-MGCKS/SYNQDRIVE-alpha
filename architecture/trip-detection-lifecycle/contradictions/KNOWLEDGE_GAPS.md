# Trip Detection & Lifecycle — Knowledge Gaps

Gaps are **explicit unknowns** — not planned improvements disguised as facts.

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **TDL-GAP-001** | COMPLETED → Driving Intelligence handoff | UNKNOWN | `tripAnalysisStatus` fields exist on `VehicleTrip`; exact queue/API contract to DI V2 not fully reconstructed |
| **TDL-GAP-002** | `drive-profile/` module ownership | UNKNOWN | Physically adjacent to trips; Battery-oriented resolver — not proven trip FSM owner |
| **TDL-GAP-003** | Full fleet FSM row coverage | INFERRED | Production shows 6 detection states vs ~2000 trips — cohort/telematics subset unclear |
| **TDL-GAP-004** | Route artifact coverage (~4.7%) | CONFIRMED aggregate | Why 94/1994 completed trips have artifacts — root cause not proven |
| **TDL-GAP-005** | ClickHouse trip-assist runtime | UNKNOWN | Flag present on Production; mirror contents not queried |
| **TDL-GAP-006** | DIMO segment reconciliation vs live FSM | PARTIAL | `TripReconciliationService` + `dimoSegmentId` exist; segment authority split documented partially via [DIMO Integration](../../dimo-integration/) `AUDIT_IN_PROGRESS` bootstrap |
| **TDL-GAP-007** | Complete feature-flag matrix | UNKNOWN | Only trip-adjacent env keys sampled on Production |
| **TDL-GAP-008** | Mapbox/FMM failure recovery paths | UNKNOWN | Route V2 pipeline referenced in code; failure taxonomy not reconstructed |
| **TDL-GAP-009** | Pre-R9 deploy drift (R8/R9) | **HISTORICAL** | At `01541c2ab…` R8/R9 NOT_ON_PRODUCTION; resolved @ `0ba96e03…` |
| **TDL-GAP-013** | Natural R9 webhook wake end-to-end delivery | **OPEN** | Provider wiring 5/5 validated; no observed Production wake — cross-ref [DIMO Integration](../../dimo-integration/) DIM-GAP-006 |
| **TDL-GAP-010** | Machine-readable FSM graph | PARTIAL | Phase 4 partial — R9 wake subgraph in `graph/*.yaml` + [KNOWLEDGE_GRAPH.md](../KNOWLEDGE_GRAPH.md); full FSM graph incomplete |
| **TDL-GAP-011** | Decision register / WHY reconstruction | PARTIAL | Phase 4 partial — [decisions/DECISION_REGISTER.md](../decisions/DECISION_REGISTER.md) includes R9 wake decisions; full Phase 3 reconstruction ongoing |
| **TDL-GAP-012** | Legacy duplicate trip paths | INFERRED | Reconciliation-heavy repair counts suggest historical gaps; dead paths not fully catalogued |

## Standard-1.0 files — partial (Phase 4 in progress)

| Artifact | Status |
|----------|--------|
| `KNOWLEDGE_GRAPH.md`, `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml` | **Partial** — R9 wake subgraph indexed; full FSM graph incomplete |
| `decisions/DECISION_REGISTER.md` | **Partial** — R9 wake decisions registered |
| `scripts/validate-graph.sh` | **Created** |
| Promotion evaluation record | **Not yet created** |
