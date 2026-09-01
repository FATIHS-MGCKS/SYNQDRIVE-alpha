# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-01 (Phase 2 reconstruction)  
**Graph:** 92 nodes / 64 edges / 11 invariants (validated 2026-09-01)  
**Knowledge maturity:** Bootstrap + Phase 2 partial HV/persistence/consumer reconstruction

## Executive summary

Battery V2 Stage 1 LV REST shadow pipeline remains the strongest reconstructed area. Phase 2 added substantial HV signal/method, persistence model, canonical read model, and primary consumer mapping. Publication, readiness, and full production validation remain immature.

## Strong-confidence areas (CONFIRMED)

- LV REST lifecycle, liveness, ICE opening split (#1383/#1393/#1445 — VALIDATED not PRODUCTION_VALIDATED)
- HV DIMO signal catalog and capability preflight
- HV method profile (capability-driven eligibility)
- M2/M3 shadow formulas and gates (flag-gated)
- Native recharge segment supersedes fallback sessions
- Provider SOH canonical read priority
- No fabricated HV SOH / LV-not-SOH invariants
- Primary API + rental health tab → canonical read model
- REST_60M ±15 min / REST_6H ±30 min quality windows

## Partially reconstructed (INFERRED / PARTIAL maturity)

- Cross-session HV capacity assessment
- SOH gate internal assessment
- Publication/readiness flag wiring
- Consumer map (master/admin incomplete)
- Threshold calibration rationale (values cataloged, rationale UNKNOWN)
- LV timestamp fallback production reachability

## Unresolved gaps (explicit)

| ID | Summary |
|----|---------|
| `BAT-V2-GAP-HEV-IS-EV-001` | HEV fuelType vs canonical isEv |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE_CAPACITY no compute |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY no compute |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV timestamp production reachability |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Threshold rationale |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Fail-open rationale (behavior confirmed) |
| `BAT-V2-GAP-PUB-READINESS-001` | Production enablement gates |
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING enum debt / no writer |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED enum debt / no writer |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge without finalized trip |

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | UNRESOLVED — fallback reachable in code; production impact unproven |

## Production validation maturity

| Decision | Status |
|----------|--------|
| #1383, #1393, #1445 | VALIDATED (code + tests); post-change production behavioral validation **UNKNOWN** |
| `BAT-V2-HYP-POST-1445-SOAK-001` | AWAITING soak evidence |

## Profile coverage

ICE / PHEV / BEV partially mapped; HEV canonical path **UNKNOWN**. See `purpose/profile-matrix.md`.

## Explicit non-claims

Battery V2 is **not complete**. Phase 2 did **not** implement runtime fixes, enable Stage 2, or validate production soak.
