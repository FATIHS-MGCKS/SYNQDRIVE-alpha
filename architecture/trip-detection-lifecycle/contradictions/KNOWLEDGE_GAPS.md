# Trip Detection & Lifecycle — Knowledge Gaps

Gaps are **explicit unknowns** — not planned improvements disguised as facts.

**Promotion class** (Phase 5, 2026-09-26 — [TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md](../evidence/TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md)): `RESOLVED` · `HISTORICAL_NON_BLOCKING` · `EXPLICIT_NON_BLOCKING_LIMITATION` · `BLOCKING`. No gap is `BLOCKING`. Per `MODULE_AUTHORITY_STANDARD.md` §6, open product/research gaps with documented current behavior do not block `AUTHORITY_ACTIVE`.

| Gap ID | Topic | Epistemic | Promotion class | Notes |
|--------|-------|-----------|-----------------|-------|
| **TDL-GAP-001** | COMPLETED → Driving Intelligence handoff | **RESOLVED** | RESOLVED | TDL-EVID-OQ001-HANDOFF-001 + TDL-EVID-OQ001-1-ORG-001; org orphan **STRUCTURALLY_IMPOSSIBLE** |
| **TDL-GAP-002** | `drive-profile/` module ownership | **RESOLVED** | RESOLVED | TDL-EVID-OQ002-DRIVE-PROFILE-001 — **Battery V2 owns**; Trip FSM uses separate `VehicleDetectionProfile`; TDL has **no runtime dependency** |
| **TDL-GAP-003** | Full fleet FSM row coverage | **RESOLVED** | RESOLVED | TDL-EVID-OQ003-CARDINALITY-001 — lazy 1:0..1 FSM row vs append tracking runs; Production 6/6 eligible materialized (re-observed @ `2b54a357…`) |
| **TDL-GAP-004** | Route artifact coverage (~4.7%) | **RESOLVED** | RESOLVED | TDL-EVID-OQ004-ROUTE-COV-001 — eligibility + early rollout window; 7d **100%** eligible; Mapbox = quality not missing rows |
| **TDL-GAP-005** | ClickHouse trip-assist runtime | **PARTIAL** | EXPLICIT_NON_BLOCKING_LIMITATION | Production `CLICKHOUSE_TRIP_ASSIST_ENABLED=true` @ `8a1d9c658…` (TDL-EVID-OQ008-FLAG-MATRIX-001), re-observed @ `2b54a357…`; runtime path reconstructed (`tryApplyClickHouseAssistedEnd`, TDL-TR-008/010/011, CUSUM fallback); mirror **contents** not queried |
| **TDL-GAP-006** | DIMO segment reconciliation vs live FSM | **RESOLVED** | RESOLVED | TDL-EVID-OQ006-BOUNDARY-001 — live FSM + TripDecisionEngine canonical; DIMO repair evidence only |
| **TDL-GAP-007** | Complete feature-flag matrix | **RESOLVED** | RESOLVED | TDL-EVID-OQ008-FLAG-MATRIX-001 — 10 mode + 1 scope + 28 knobs; Production @ `8a1d9c658…` |
| **TDL-GAP-016** | Tiered polling vs R9 provider-wake ingress contract | **RESOLVED** | RESOLVED | TDL-EVID-OQ009-R9-INGRESS-001 — shared canonical queue; tier fallback; **R9 authorized cohort 100%** subscribed; stale mirror separate (DIM-GAP-005) |
| **TDL-GAP-008** | Mapbox/FMM failure recovery paths | **PARTIAL** | EXPLICIT_NON_BLOCKING_LIMITATION | Failure taxonomy reconstructed in TDL-EVID-OQ004-ROUTE-COV-001; canonical matcher `matchMapboxChunkDetailed` (TDL-DEC-ROUTE-V2-001); handler artifact contract gap remains follow-up |
| **TDL-GAP-009** | Pre-R9 deploy drift (R8/R9) | **HISTORICAL** | RESOLVED | At `01541c2ab…` R8/R9 NOT_ON_PRODUCTION; resolved @ `0ba96e03…` |
| **TDL-GAP-013** | Natural R9 webhook wake end-to-end delivery | **PARTIAL** | EXPLICIT_NON_BLOCKING_LIMITATION | Historical start wake KS MS 661 @ `684950419…` / R11 forensics; **recent** fleet wake rates **INSUFFICIENT_EVIDENCE** (OQ-009); cross-ref DIM-GAP-006 |
| **TDL-GAP-014** | Empty-core `no_core_data_keep_open` end block on natural LTE drive | **PARTIAL** | EXPLICIT_NON_BLOCKING_LIMITATION | KS MS 661 @ `684950419…` reproduced; R11 merged CI (Scenarios C/I/J); R11/R12 present in live `2b54a357…`; natural LTE empty-core re-drive **not re-observed** — cross-ref TDL-EVID-KS-MS-661-002 |
| **TDL-GAP-015** | VLS single `sourceTimestamp` masks per-field freshness (engine load rejuvenation) | **OPEN** | EXPLICIT_NON_BLOCKING_LIMITATION | Known design limitation; PROPOSED phase-1 positive TTL decay; phase-2 per-field timestamps (PD-4) |
| **TDL-GAP-010** | Machine-readable FSM graph | **RESOLVED** | RESOLVED | Phase 5 (TDL-DEC-PHASE5-001): 5 live states + `ENDED` `SCHEMA_COMPAT_ONLY`; 14 validator-enforced transitions; execution / recovery / boundary graph; OQ-010 P001–P041 mapped (14 graph + 27 boundary, 0 unmapped). Before: Phase 4 partial — R9 wake subgraph only |
| **TDL-GAP-011** | Decision register / WHY reconstruction | **RESOLVED** | RESOLVED | Phase 5: register complete for declared scope — P1 (TDL-DEC-P1-001), R1–R8 (TDL-DEC-R1R8-001), R9–R12, QS V1, OQ-001…010, Route V2 (TDL-DEC-ROUTE-V2-001), promotion. Before: Phase 4 partial — R9 wake decisions only |
| **TDL-GAP-012** | Legacy duplicate trip paths | **RESOLVED** | RESOLVED | TDL-EVID-OQ010-LEGACY-INV-001 — inventory + bounded debt (DI V2 ∥ legacy HF); no unknown lifecycle writer |

## Standard-1.0 files

| Artifact | Status |
|----------|--------|
| `KNOWLEDGE_GRAPH.md`, `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml` | **Complete** (Phase 5) — full live FSM, transitions, execution / recovery / boundary graph. Before: partial (R9 wake subgraph) |
| `decisions/DECISION_REGISTER.md` | **Complete for declared scope** (Phase 5). Before: partial (R9 wake decisions) |
| `scripts/validate-graph.sh` | **Created**; extended Phase 5 (transitions, FSM completeness, OQ-010 mapping, FAIL index, orphans) |
| Promotion evaluation record | **Created** — [TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md](../evidence/TDL_PHASE_5_AUTHORITY_PROMOTION_AUDIT_2026-09-26.md) (Gate A 17/17 PASS) |
