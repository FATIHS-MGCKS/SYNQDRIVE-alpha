# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-01 (Phase 3 decision surfaces & reachability pass)  
**Graph:** 114 nodes / 98 edges / 11 invariants (validated 2026-09-01, Phase 3 reachability pass)  
**Knowledge maturity:** Bootstrap + Phase 2 HV/persistence/consumer reconstruction + Phase 3 reachability/enablement reconstruction

## Executive summary

Battery V2 Stage 1 LV REST shadow pipeline remains the strongest reconstructed area. Phase 2 mapped HV signals, methods, persistence, canonical read, and primary consumers. Phase 3 traces **what can actually execute** under current flags and gates: publication/readiness default OFF, LV publication job chain incomplete, HEV HV compute partially reachable but hidden from canonical read, PHEV full parallel LV+HV when enabled, task generation canonical but non-blocking for rental availability.

## Strong-confidence areas (CONFIRMED)

- LV REST lifecycle, liveness, ICE opening split (#1383/#1393/#1445 — VALIDATED not PRODUCTION_VALIDATED)
- HV capability preflight registry (13 entries) and DIMO mapper inventory (12 HV + 1 LV)
- HV method profile (capability-driven eligibility); M2/M3 shadow formulas; cross-session capacity (≥3 sessions)
- Native recharge segment supersedes fallback sessions
- HV SOH evidence-strength + freshness conflict policy; selected SOH vs `sohAssessment` separation
- Selected HV SOH carrier: `canonical.hv.providerSoh` (check `.source`)
- Primary API + rental health tab → canonical read model
- REST_60M ±15 min / REST_6H ±30 min quality windows
- Phase 3 reachability matrix (`purpose/runtime-reachability-matrix.md`)
- RUNNING/SKIPPED enum: HISTORICAL — introduced 6cbd9a9c, no git writer ever
- LV timestamp fallback: REACHABLE_AND_CONFLICTING in code (`BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`)

## Partially reconstructed (INFERRED / PARTIAL maturity)

- SOH gate internal assessment (SUBSTANTIAL code trace; publication consumer PARTIAL)
- Publication/readiness flag wiring (SUBSTANTIAL; production enablement UNKNOWN)
- Consumer map (SUBSTANTIAL; master/operator battery panels UNCONSUMED)
- Threshold calibration rationale (values cataloged; rationale UNKNOWN)
- HEV HV authority (`BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` — PARTIALLY REACHABLE)
- Bridge ±120s fallback (SUBSTANTIAL; product necessity UNKNOWN)
- Post-#1445 production soak (`BAT-V2-HYP-POST-1445-SOAK-001` — AWAITING)

## Unresolved gaps (explicit)

| ID | Summary |
|----|---------|
| `BAT-V2-GAP-HEV-IS-EV-001` | HEV fuelType vs canonical isEv (within HEV contradiction) |
| `BAT-V2-GAP-HEV-SNAPSHOT-ORPHAN-001` | HEV HV snapshots/sessions without canonical.hv consumer |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | `hvPipelineAllowed` metadata has no runtime consumer |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | REST→assessment→publication enqueue not wired |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | LatestState SOH without evidence timestamp |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | No second-candidate reselection after winner fails usability |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | Selected SOH uses `providerSoh`-named DTO carrier |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE_CAPACITY no compute |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY no compute |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV timestamp production frequency UNKNOWN |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Threshold rationale |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Fail-open rationale (behavior confirmed) |
| `BAT-V2-GAP-PUB-READINESS-001` | Publication/readiness enablement gates |
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING enum — HISTORICAL unused state |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED enum — HISTORICAL unused state |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge without finalized trip |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV/PHEV remaining unknowns |
| `BAT-V2-GAP-CONSUMER-READ-001` | Remaining consumer surfaces |

## Contradictions

| ID | Status |
|----|--------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | UNRESOLVED — REACHABLE_AND_CONFLICTING in code; production frequency UNKNOWN |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | UNRESOLVED — PARTIALLY REACHABLE: compute hidden from canonical read |

## Production validation maturity

| Decision | Status |
|----------|--------|
| #1383, #1393, #1445 | VALIDATED (code + tests); post-change production behavioral validation **UNKNOWN** |
| PR #1480 | Documentation evolution only — **NOT** production validation (`BAT-V2-EVID-PR-1480-001`) |
| `BAT-V2-HYP-POST-1445-SOAK-001` | AWAITING soak evidence |

## Profile coverage

ICE / PHEV / BEV reachability traced in Phase 3. HEV: LV REST ✓, HV measurements UNSUPPORTED_PROFILE, HV jobs/snapshots can run, `canonical.hv=null`. See `purpose/runtime-reachability-matrix.md` and `purpose/profile-matrix.md`.

## Signal inventory

| Inventory | Count |
|-----------|-------|
| Capability preflight registry | 13 (1 LV + 11 hv.* + dimo.segments.recharge) |
| DIMO mapper | 1 LV + 12 HV |

## Explicit non-claims

Battery V2 is **not complete**. Phase 3 did **not** implement runtime fixes, enable Stage 2, or validate production soak. Reachability documentation describes **current code paths**, not intended product behavior.
