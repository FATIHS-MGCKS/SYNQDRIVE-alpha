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
| Recommendation | **PLANNED** — remove from user-facing eligibility until compute exists |
| Status | DEFERRED |

## GROSS_CAPACITY_REFERENCE

| Question | Answer |
|----------|--------|
| Valuable? | Reference calibration use case |
| Signals? | Requires verified reference workflow |
| Recommendation | **PLANNED** — not IMPLEMENTATION_READY |
| Alternative | Document as future workshop-ingest path |

## DESIGN ALTERNATIVE

Remove unimplemented methods from capability advertisement (`BAT-V2-AUTH-HV-METHOD-PROFILE-001` materialization) to prevent false "supported" UX.

## NON-EFFECTS

M2/M3/cross-session paths unchanged.
