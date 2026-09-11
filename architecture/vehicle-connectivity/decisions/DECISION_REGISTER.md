# Vehicle Connectivity — Decision Register

## VC-DEC-BOOTSTRAP-001 — Bootstrap authority scope

| Field | Value |
|-------|-------|
| **STATUS** | PROPOSED |
| **DATE** | 2026-09-11 |
| **BEFORE** | Connectivity semantics fragmented across vehicles/, dimo/, AI modules without registry authority |
| **WHY** | Need provider-neutral ownership for freshness, standby/disconnect semantics, and ground-truth methodology |
| **CHANGE** | Establish `architecture/vehicle-connectivity/` at registry status `AUDIT_IN_PROGRESS` |
| **ALTERNATIVES** | Extend DIMO Integration authority only — rejected; HM and cross-provider semantics required |
| **EXPECTED EFFECT** | Agents route connectivity semantics work to VC authority; full audit proceeds in Phase 1–2 |
| **EVIDENCE** | VC-EVID-PROD-BASELINE-001 |
| **VALIDATION** | Registry + graph validators pass; promotion to `AUTHORITY_ACTIVE` explicitly deferred |
| **REMAINING GAPS** | Production baseline, LTE_R1 ground truth, lifecycle canonicalization |
