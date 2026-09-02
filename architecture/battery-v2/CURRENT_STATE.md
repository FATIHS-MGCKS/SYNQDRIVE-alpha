# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-02 (D3 single-authority cutover decision)  
**Graph:** 133 nodes / 119 edges / 11 invariants (validated 2026-09-02)  
**Knowledge maturity:** Phase 4 planning complete — 20 open gaps; 1 PROPOSED decision (`BAT-V2-DEC-PH4-LV-PUB-CHAIN-001`); 3 VALIDATED PKG-01 spec decisions (D1, D2, D3)

## Executive summary

Battery V2 authority is substantially reconstructed (Phase 2–3) and Phase 4 defines **how to resolve** remaining gaps without implementing runtime fixes. Highest-priority work: **LV publication chain handoffs** (P0_ACTIVATION_BLOCKER — Stage-2 cutover blockers, **not** proven active production incidents while flags default OFF).

- **PKG-01:** **`IMPLEMENTATION_READY`** — D1 (`inputVersion`), D2 (crash-boundary Hybrid C+), D3 (single-authority configuration invariant) all **VALIDATED**. `IMPLEMENTATION_READY` ≠ activation-ready ≠ cutover-ready ≠ `PRODUCTION_VALIDATED`. Runtime implementation requires **separate explicit authorization**. Legacy/REST_SHADOW retirement **not** authorized by PKG-01 readiness.
- **PKG-02:** **`IMPLEMENTATION_SPEC_REQUIRED`** — remaining blockers: **D4** assessment-track publication authority, **D5** `publicationVersion` authority only.

**Target architecture (D3):** canonical V2 REST + assessment handoff + assessment = mandatory core; `BATTERY_V2_PUBLICATION_ENABLED` = customer effect gate; `REST_SHADOW` + legacy REST = **temporary migration scaffolds** until M4 cutover. `BATTERY_V2_LV_HANDOFF_ENABLED` = **NOT INTRODUCED**.

**Current runtime:** canonical REST still behind `BATTERY_V2_REST_SHADOW_ENABLED`; legacy capture still active per `isBatteryV2LegacyRestCaptureEnabled()`.

Post-#1445 soak is **PRODUCTION_VALIDATION_ONLY** (initial smoke, not strong validation; profile-stratified — ICE/HEV/PHEV as exposed). HEV product authority remains **DECISION_NOT_READY**. Provider LatestState SOH gap is **DECISION_REQUIRED** (current runtime already non-decision-fresh for VLS-only) — **not** IMPLEMENTATION_READY / not PKG-04 scope.

## Planning item accounting

| Set | P0 | P1 | P2 | P3 | Total |
|-----|----|----|----|-----|-------|
| **Open gaps only** (`BAT-V2-GAP-*`) | 3 | 3 | 5 | 9 | **20** |
| **All Phase-4 planning items** (+ 2 contra + 1 hyp) | 3 | 6 | 5 | 9 | **23** |

P0 tier = **P0_ACTIVATION_BLOCKER** for LV handoff gaps (flags default OFF).

## Production validation maturity

| Item | Status |
|------|--------|
| #1383, #1393, #1445 | **VALIDATED** (code + tests) — **not PRODUCTION_VALIDATED** unless post-change evidence exists |
| `BAT-V2-HYP-POST-1445-SOAK-001` | **AWAITING** — natural soak protocol defined; smoke tranche only |
| PR #1488 (merged `b8501bfd`) | Phase 3 authority — documentation only |
| Phase 4 (this branch) | Resolution planning — **not** runtime validation |
| D1/D2/D3 | **VALIDATED** architecture authority — **not** `PRODUCTION_VALIDATED`; **no M4 cutover authorized** |

## Phase 4 planning outputs

See `resolution/` — priority matrix, implementation packages, dependency graph, per-gap dossiers.

## Strong-confidence areas (CONFIRMED)

- LV REST canonical pipeline for ICE/HEV/PHEV (BEV forbidden) when `REST_SHADOW` on (**current runtime gate**)
- Primary REST session opening: trip-finalization anchor — observation-independent (#1383)
- HV M2/M3/cross-session **implemented** paths; SESSION_CHARGE/GROSS_CAPACITY unimplemented
- PHEV parallel implemented LV+HV; `isEv=true`
- HEV: separate write gates vs `isEv` read gate; side-effect / read-model divergence
- LV publication eligibility: evaluated in `BatteryPublicationService` / `evaluateLvPublicationPolicy()`
- HV SOH gate execution under `HV_CAPACITY_SHADOW`; publication-intent separate
- Assessment job identity: `assess:{vehicleId}:{assessmentType}:{inputVersion}` — canonical REST handoff `inputVersion` = `BatteryMeasurement.id` (D1); `sourceEntityId` correlation (D2)
- Publication job identity: `pub:{assessmentId}:v{publicationVersion}`
- Primary API + rental health → canonical read model
- **D3 target:** V2 core mandatory; PUBLICATION = effect gate; HANDOFF flag rejected

## Unresolved gaps

See `contradictions/KNOWLEDGE_GAPS.md` (**20 gaps**) and `research/OPEN_QUESTIONS.md`. **Planning ≠ resolution** — gaps remain open.

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | REACHABLE_AND_CONFLICTING; production frequency UNKNOWN; provenance not directly observable in current schema |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | PARTIALLY REACHABLE — DECISION_REQUIRED |

## Explicit non-claims

Battery V2 runtime gaps are **not fixed** by Phase 4 or D3. No Stage 2 enabled. No publication enabled. No backfill. No legacy/REST_SHADOW removal. No M4 cutover authorized. No current-customer Stage-2 publication outage claimed. Historical provenance distribution not directly measurable in SQL today.
