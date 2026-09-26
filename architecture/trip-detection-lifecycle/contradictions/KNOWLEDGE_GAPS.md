# Trip Detection & Lifecycle — Knowledge Gaps

Gaps are **explicit unknowns** — not planned improvements disguised as facts.

| Gap ID | Topic | Epistemic | Notes |
|--------|-------|-----------|-------|
| **TDL-GAP-001** | COMPLETED → Driving Intelligence handoff | **RESOLVED** | TDL-EVID-OQ001-HANDOFF-001 + TDL-EVID-OQ001-1-ORG-001; org orphan **STRUCTURALLY_IMPOSSIBLE** |
| **TDL-GAP-002** | `drive-profile/` module ownership | **RESOLVED** | TDL-EVID-OQ002-DRIVE-PROFILE-001 — **Battery V2 owns**; Trip FSM uses separate `VehicleDetectionProfile`; TDL has **no runtime dependency** |
| **TDL-GAP-003** | Full fleet FSM row coverage | **RESOLVED** | TDL-EVID-OQ003-CARDINALITY-001 — lazy 1:0..1 FSM row vs append tracking runs; Production 6/6 eligible materialized |
| **TDL-GAP-004** | Route artifact coverage (~4.7%) | **RESOLVED** | TDL-EVID-OQ004-ROUTE-COV-001 — eligibility + early rollout window; 7d **100%** eligible; Mapbox = quality not missing rows |
| **TDL-GAP-005** | ClickHouse trip-assist runtime | **PARTIAL** | Production `CLICKHOUSE_TRIP_ASSIST_ENABLED=true` @ `8a1d9c658…` (TDL-EVID-OQ008-FLAG-MATRIX-001); mirror contents not queried |
| **TDL-GAP-006** | DIMO segment reconciliation vs live FSM | **RESOLVED** | TDL-EVID-OQ006-BOUNDARY-001 — live FSM + TripDecisionEngine canonical; DIMO repair evidence only |
| **TDL-GAP-007** | Complete feature-flag matrix | **RESOLVED** | TDL-EVID-OQ008-FLAG-MATRIX-001 — 10 mode + 1 scope + 28 knobs; Production @ `8a1d9c658…` |
| **TDL-GAP-016** | Tiered polling vs R9 provider-wake ingress contract | **RESOLVED** | TDL-EVID-OQ009-R9-INGRESS-001 — shared canonical queue; tier fallback; **R9 authorized cohort 100%** subscribed; stale mirror separate (DIM-GAP-005) |
| **TDL-GAP-008** | Mapbox/FMM failure recovery paths | **PARTIAL** | Failure taxonomy reconstructed in TDL-EVID-OQ004-ROUTE-COV-001; handler artifact contract gap remains follow-up |
| **TDL-GAP-009** | Pre-R9 deploy drift (R8/R9) | **HISTORICAL** | At `01541c2ab…` R8/R9 NOT_ON_PRODUCTION; resolved @ `0ba96e03…` |
| **TDL-GAP-013** | Natural R9 webhook wake end-to-end delivery | **PARTIAL** | Historical start wake KS MS 661 @ `684950419…` / R11 forensics; **recent** fleet wake rates **INSUFFICIENT_EVIDENCE** (OQ-009); cross-ref DIM-GAP-006 |
| **TDL-GAP-014** | Empty-core `no_core_data_keep_open` end block on natural LTE drive | **PARTIAL** | KS MS 661 @ `684950419…` reproduced; R11 merged CI (Scenarios C/I/J); **natural Production revalidation after deploy** — cross-ref TDL-EVID-KS-MS-661-002 |
| **TDL-GAP-015** | VLS single `sourceTimestamp` masks per-field freshness (engine load rejuvenation) | **OPEN** | PROPOSED phase-1 positive TTL decay; phase-2 per-field timestamps (PD-4) |
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
