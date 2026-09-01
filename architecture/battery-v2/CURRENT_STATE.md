# Battery V2 — Current State Snapshot

**Snapshot date:** 2026-09-01 (Phase 2 authority correction pass)  
**Graph:** 105 nodes / 80 edges / 11 invariants (validated 2026-09-01, authority correction pass)  
**Knowledge maturity:** Bootstrap + Phase 2 HV/persistence/consumer reconstruction + authority epistemic correction

## Executive summary

Battery V2 Stage 1 LV REST shadow pipeline remains the strongest reconstructed area. Phase 2 added substantial HV signal/method, persistence model, canonical read model, and primary consumer mapping. Authority correction pass fixed HV SOH evidence-strength semantics, separated selected SOH from SOH gate assessment, elevated HEV multi-layer contradiction, and corrected signal inventory counts. Publication, readiness, and full production validation remain immature.

## Strong-confidence areas (CONFIRMED)

- LV REST lifecycle, liveness, ICE opening split (#1383/#1393/#1445 — VALIDATED not PRODUCTION_VALIDATED)
- HV capability preflight registry (13 entries) and DIMO mapper inventory (12 HV + 1 LV, mapper-only current voltage)
- HV method profile (capability-driven eligibility)
- M2/M3 shadow formulas and gates (flag-gated); M3 VALIDATION_ONLY
- Cross-session HV capacity assessment (≥3 qualified sessions) — **SUBSTANTIAL** reconstruction
- Native recharge segment supersedes fallback sessions
- HV SOH evidence-strength + freshness conflict policy (workshop/document outrank provider at equal freshness)
- Selected HV SOH vs `canonical.hv.sohAssessment` — separate canonical concepts
- No fabricated HV SOH / LV-not-SOH invariants
- Primary API + rental health tab → canonical read model
- REST_60M ±15 min / REST_6H ±30 min quality windows

## Partially reconstructed (INFERRED / PARTIAL maturity)

- SOH gate internal assessment path (code traced SUBSTANTIAL; publication wiring PARTIAL)
- Publication/readiness flag wiring
- Consumer map (master/admin incomplete)
- Threshold calibration rationale (values cataloged, rationale UNKNOWN)
- LV timestamp fallback production reachability
- HEV canonical HV path (contradiction documented; production impact UNKNOWN)

**Maturity note:** Reconstruction maturity measures documentation completeness, not confidence. Cross-session capacity is SUBSTANTIAL because formulas, gates, and persistence are traced; SOH gate assessment is SUBSTANTIAL for the same reason while publication consumer impact remains PARTIAL.

## Unresolved gaps (explicit)

| ID | Summary |
|----|---------|
| `BAT-V2-GAP-HEV-IS-EV-001` | HEV fuelType vs canonical isEv (linked to HEV contradiction) |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | LatestState SOH value without evidence timestamp |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | No second-candidate fallback after winner fails usability |
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
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | UNRESOLVED — hvPipelineAllowed vs HV forbidden types vs isEv; production impact UNKNOWN |

## Production validation maturity

| Decision | Status |
|----------|--------|
| #1383, #1393, #1445 | VALIDATED (code + tests); post-change production behavioral validation **UNKNOWN** |
| `BAT-V2-HYP-POST-1445-SOAK-001` | AWAITING soak evidence |

## Profile coverage

ICE / PHEV / BEV partially mapped; HEV has documented multi-layer authority contradiction (`BAT-V2-CONTRA-HEV-HV-AUTHORITY-001`). See `purpose/profile-matrix.md`.

## Signal inventory (corrected)

| Inventory | Count |
|-----------|-------|
| Capability preflight registry | 13 (1 LV + 11 hv.* + dimo.segments.recharge) |
| DIMO mapper | 1 LV + 12 HV (includes mapper-only `powertrainTractionBatteryCurrentVoltage`) |

## Explicit non-claims

Battery V2 is **not complete**. Phase 2 did **not** implement runtime fixes, enable Stage 2, or validate production soak. Provider SOH does **not** universally win over workshop/document evidence.
