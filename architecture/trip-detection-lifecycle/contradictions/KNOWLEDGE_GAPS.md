# Trip Detection & Lifecycle — Knowledge Gaps (Phase 0–2)

Gaps are **explicit unknowns** — not planned improvements disguised as facts.

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **TDL-GAP-001** | COMPLETED → Driving Intelligence handoff | UNKNOWN | `tripAnalysisStatus` fields exist on `VehicleTrip`; exact queue/API contract to DI V2 not fully reconstructed |
| **TDL-GAP-002** | `drive-profile/` module ownership | UNKNOWN | Physically adjacent to trips; Battery-oriented resolver — not proven trip FSM owner |
| **TDL-GAP-003** | Full fleet FSM row coverage | INFERRED | Production shows 6 detection states vs ~2000 trips — cohort/telematics subset unclear |
| **TDL-GAP-004** | Route artifact coverage (~4.7%) | CONFIRMED aggregate | Why 94/1994 completed trips have artifacts — root cause not proven |
| **TDL-GAP-005** | ClickHouse trip-assist runtime | UNKNOWN | Flag present on Production; mirror contents not queried |
| **TDL-GAP-006** | DIMO segment reconciliation vs live FSM | PARTIAL | `TripReconciliationService` + `dimoSegmentId` exist; segment authority split with DIMO Integration not documented |
| **TDL-GAP-007** | Complete feature-flag matrix | UNKNOWN | Only trip-adjacent env keys sampled on Production |
| **TDL-GAP-008** | Mapbox/FMM failure recovery paths | UNKNOWN | Route V2 pipeline referenced in code; failure taxonomy not reconstructed |
| **TDL-GAP-009** | R8 observability on Production | CONFIRMED drift | R8 on `main` only until deploy |
| **TDL-GAP-010** | Machine-readable FSM graph | UNKNOWN | No `graph/*.yaml` yet — Phase 4 |
| **TDL-GAP-011** | Decision register / WHY reconstruction | UNKNOWN | Phase 3 outstanding |
| **TDL-GAP-012** | Legacy duplicate trip paths | INFERRED | Reconciliation-heavy repair counts suggest historical gaps; dead paths not fully catalogued |

## Standard-1.0 files not yet created

- `KNOWLEDGE_GRAPH.md`, `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`
- `decisions/DECISION_REGISTER.md`
- Module validators under `scripts/`
- Promotion evaluation record
