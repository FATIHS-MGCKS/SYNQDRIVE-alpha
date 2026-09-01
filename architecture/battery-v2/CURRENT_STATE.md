# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-01 (Phase 4 resolution planning)  
**Graph:** 121 nodes / 108 edges / 11 invariants (validated 2026-09-01)  
**Knowledge maturity:** Phase 4 planning complete — 20 open gaps; 1 PROPOSED decision (`BAT-V2-DEC-PH4-LV-PUB-CHAIN-001`)

## Executive summary

Battery V2 authority is substantially reconstructed (Phase 2–3) and Phase 4 defines **how to resolve** remaining gaps without implementing runtime fixes. Highest-priority work: **LV publication chain handoffs** (P0, IMPLEMENTATION_READY). Post-#1445 soak is **PRODUCTION_VALIDATION_ONLY**. HEV product authority remains **DECISION_REQUIRED**.

## Production validation maturity

| Item | Status |
|------|--------|
| #1383, #1393, #1445 | **VALIDATED** (code + tests) — **not PRODUCTION_VALIDATED** unless post-change evidence exists |
| `BAT-V2-HYP-POST-1445-SOAK-001` | **AWAITING** — natural soak protocol defined in Phase 4 |
| PR #1488 (merged `b8501bfd`) | Phase 3 authority — documentation only |
| Phase 4 (this branch) | Resolution planning — **not** runtime validation |

## Phase 4 planning outputs

See `resolution/` — priority matrix, implementation packages, dependency graph, per-gap dossiers.

| Priority | Count |
|----------|-------|
| P0 | 3 (LV handoff gaps) |
| P1 | 6 |
| P2 | 6 |
| P3 | 8 |

## Strong-confidence areas (CONFIRMED)

- LV REST canonical pipeline for ICE/HEV/PHEV (BEV forbidden) when `REST_SHADOW` on
- HV M2/M3/cross-session **implemented** paths; SESSION_CHARGE/GROSS_CAPACITY unimplemented
- PHEV parallel implemented LV+HV; `isEv=true`
- HEV: separate write gates vs `isEv` read gate
- LV publication eligibility: PROVISIONAL or STABLE per policy
- HV SOH gate execution under `HV_CAPACITY_SHADOW`; publication-intent separate
- Primary API + rental health → canonical read model

## Unresolved gaps

See `contradictions/KNOWLEDGE_GAPS.md` (**20 gaps**) and `research/OPEN_QUESTIONS.md`. **Planning ≠ resolution** — gaps remain open.

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | REACHABLE_AND_CONFLICTING; production frequency UNKNOWN |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | PARTIALLY REACHABLE — DECISION_REQUIRED |

## Explicit non-claims

Battery V2 runtime gaps are **not fixed** by Phase 4. No Stage 2 enabled. No publication enabled. No backfill.
