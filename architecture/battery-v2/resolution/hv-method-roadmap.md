# HV Method Roadmap — Resolution Dossier (Phase 4)

**Gaps:** `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001`, `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001`  
**Priority:** P3  
**Readiness:** DEFERRED

## SESSION_CHARGE_CAPACITY

| Question | Answer |
|----------|--------|
| Valuable? | Potentially — independent charge-boundary capacity |
| Signal authority reliable? | **UNKNOWN** — DIMO session boundaries vs native recharge |
| Duplicates M2/M3? | Partial overlap |
| Recommendation | **PLANNED** — remove from **advertised/supported runtime method eligibility** until compute exists |
| Status | DEFERRED / RESEARCH_REQUIRED |

## GROSS_CAPACITY_REFERENCE

| Question | Answer |
|----------|--------|
| Valuable? | Reference calibration use case |
| Signals? | Requires verified reference workflow |
| Recommendation | **PLANNED** — not IMPLEMENTATION_READY |
| Alternative | Document as future workshop-ingest path |

## DESIGN ALTERNATIVE

Remove unimplemented methods from **advertised/supported runtime method eligibility** (`BAT-V2-AUTH-HV-METHOD-PROFILE-001` materialization). Phase 2 proved method-profile eligibility — **not** necessarily direct customer UI exposure unless consumer trace confirms it.

## NON-EFFECTS

M2/M3/cross-session paths unchanged.
