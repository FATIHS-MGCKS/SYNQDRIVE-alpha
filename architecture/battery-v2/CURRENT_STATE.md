# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-01 (Phase 3 graph contract integrity pass)  
**Graph:** 120 nodes / 105 edges / 11 invariants (validated 2026-09-01)  
**Knowledge maturity:** Phase 2+3 substantially reconstructed; open gaps remain

## Executive summary

Battery V2 authority is substantially reconstructed through Phase 2 (HV/persistence/consumers) and Phase 3 (reachability/enablement). LV canonical REST pipeline is traced but **not e2e reachable** to publication due to two missing automatic handoffs. HEV exhibits write/side-effect/read divergence. PHEV supports parallel **implemented** LV+HV paths — not all advertised HV methods have compute.

## Production validation maturity

| Item | Status |
|------|--------|
| #1383, #1393, #1445 | **VALIDATED** (code + tests) — **not PRODUCTION_VALIDATED** unless post-change evidence exists |
| `BAT-V2-HYP-POST-1445-SOAK-001` | **AWAITING** — no qualifying post-change production soak in repository |
| PR #1480 | Documentation/knowledge evolution only — **not** production behavioral validation |
| PR #1488 (this pass) | Documentation/knowledge consistency only — **not** production behavioral validation |

## Strong-confidence areas (CONFIRMED)

- LV REST canonical pipeline for ICE/HEV/PHEV (BEV forbidden) when `REST_SHADOW` on
- HV M2/M3/cross-session **implemented** paths; SESSION_CHARGE/GROSS_CAPACITY unimplemented
- PHEV parallel implemented LV+HV; `isEv=true`
- HEV: separate write gates vs `isEv` read gate (`BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001`)
- LV publication eligibility: PROVISIONAL or STABLE per policy (not STABLE-only)
- Readiness: multiple independent block paths when flag on (does **not** globally require STABLE LV publication)
- HV SOH gate execution: `BATTERY_V2_HV_CAPACITY_SHADOW_ENABLED`; publication-intent flag separate; `publicationEligible: false` always; no HV customer publication path
- Primary API + rental health → canonical read model

## Unresolved gaps

See `contradictions/KNOWLEDGE_GAPS.md` (20 gaps) and `research/OPEN_QUESTIONS.md` (matching set).

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | REACHABLE_AND_CONFLICTING; production frequency UNKNOWN |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | PARTIALLY REACHABLE — side-effect/read divergence |

## Explicit non-claims

Battery V2 is **not complete**. Documentation-only passes do not change runtime behavior.
