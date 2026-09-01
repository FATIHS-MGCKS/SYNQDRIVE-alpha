# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-01 (Phase 3 correction pass)  
**Graph:** 120 nodes / 107 edges / 11 invariants (validated 2026-09-01, Phase 3 correction pass)  
**Knowledge maturity:** Bootstrap + Phase 2 reconstruction + Phase 3 reachability (corrected)

## Executive summary

Battery V2 Stage 1 LV REST shadow remains the strongest reconstructed area. Phase 3 traces execution reachability under current flags. **Correction pass:** PHEV wording narrowed to implemented paths; HEV storage layers distinguished; RUNNING/SKIPPED epistemics fixed; canonical LV assessment/publication handoffs documented; bridge identity semantics corrected; negative claims carry audit provenance.

## Strong-confidence areas (CONFIRMED)

- LV REST lifecycle for ICE/HEV/PHEV (BEV forbidden) when policy gates pass
- HV M2/M3/cross-session **implemented** paths (not all advertised HV methods)
- PHEV: parallel implemented LV+HV when flags+capabilities pass; `isEv=true`
- HEV: write/compute/read divergence — BatteryMeasurement HV blocked; side-effect snapshots/evidence/sessions possible; `canonical.hv` absent
- LV canonical REST → assessment → publication: **NOT e2e reachable** (two missing handoffs)
- RUNNING: current enum + reader; no writer in audited history
- Primary API + rental health → canonical read model

## Unresolved gaps (explicit)

| ID | Summary |
|----|---------|
| `BAT-V2-GAP-HEV-IS-EV-001` | HEV fuelType vs canonical isEv |
| `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | HEV side-effect writes vs canonical read absence |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | `hvPipelineAllowed` no runtime consumer (audited) |
| `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` | REST complete → assessment enqueue missing |
| `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` | Assessment complete → publication enqueue missing |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | Umbrella: canonical LV pipeline not e2e reachable |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE_CAPACITY no compute |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY no compute |
| `BAT-V2-GAP-PUB-READINESS-001` | Publication/readiness enablement |
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING enum — reader exists; no audited writer |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED enum — no audited writer/lifecycle |
| (prior gaps) | See `contradictions/KNOWLEDGE_GAPS.md` |

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | REACHABLE_AND_CONFLICTING; production frequency UNKNOWN |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | PARTIALLY REACHABLE — side-effect/read divergence |

## Explicit non-claims

Battery V2 is **not complete**. Phase 3 corrections are documentation only — no runtime fixes.
