# Battery V2 — Resolution Priority Matrix (Phase 4)

**Open gap count:** 20 (derived from `contradictions/KNOWLEDGE_GAPS.md` + graph index)  
**Contradictions (unresolved):** 2 (`BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001`, `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001`)  
**Open hypotheses:** 3 (including `BAT-V2-HYP-POST-1445-SOAK-001`)

Legend — **primary category:** A=runtime defect, B=authority contradiction, C=validation gap, D=product policy, E=observability, F=naming debt, G=calibration, H=historical debt, I=missing method, J=resilience risk.

| ID | Title | Category | Reachability | Current impact | Prod evidence | Priority | Readiness | Recommended action | Dependency | Validation type | Runtime? | Migration? | Flag? | Rollback | Target phase |
|----|-------|----------|--------------|----------------|---------------|----------|-----------|-------------------|------------|-----------------|----------|------------|-------|----------|--------------|
| `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` | REST complete → no assessment enqueue | A | CONFIRMED | Stage 2+ cutover blocks LV assessment path | None for canonical path | **P0** | IMPLEMENTATION_READY | Hybrid direct enqueue + reconciliation safety net | Timestamp semantics (soft) | Integration + flag-gated soak | YES | Maybe (reconcile index) | YES | LOW | Runtime PKG-01 |
| `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` | Assessment complete → no publication enqueue | A | CONFIRMED | Publication flag alone insufficient | Handler works when invoked | **P0** | IMPLEMENTATION_READY | Hybrid enqueue + publish reconciliation | PKG-01 | Integration | YES | NO | YES | LOW | Runtime PKG-02 |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | Umbrella: not e2e reachable | A | CONFIRMED | No automatic LV pub from canonical REST | CONFIRMED gap | **P0** | IMPLEMENTATION_READY | Resolve via PKG-01 + PKG-02 | PKG-01, PKG-02 | E2E test harness | YES | Maybe | YES | MED | Umbrella |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV timestamp fallback frequency | B,C | REACHABLE | REST may accept non-signal timestamps | UNKNOWN frequency | **P1** | DECISION_REQUIRED | Provenance enum + REST eligibility rules | Schema design | Read-only prod query + unit | YES | YES | YES | MED | PKG-03 |
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | Fallback vs REST evidence doctrine | B | CONFLICTING | Epistemic pollution risk | UNKNOWN | **P1** | DECISION_REQUIRED | Same as timestamp gap | PKG-03 | Design review | YES | YES | YES | MED | PKG-03 |
| `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | HEV writes vs `canonical.hv` absent | B,D | CONFIRMED | Orphan HV side-effects | UNKNOWN fleet mix | **P1** | DECISION_REQUIRED | HEV Option A (LV-only canonical) recommended | Product decision | Fleet audit | MAYBE | NO | MAYBE | MED | PKG-05 |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | Multi-layer HEV HV contradiction | B,D | PARTIAL | False confidence / ops confusion | UNKNOWN | **P1** | DECISION_REQUIRED | Align write gates with read model | PKG-05 | Product + code trace | MAYBE | NO | MAYBE | MED | PKG-05 |
| `BAT-V2-GAP-HEV-IS-EV-001` | Should HEV get `canonical.hv`? | D | CONFIRMED | Product question | N/A | **P1** | DECISION_REQUIRED | Default: NO (Option A) unless fleet audit proves value | PKG-05 | Product workshop | MAYBE | NO | MAYBE | HIGH | PKG-05 |
| `BAT-V2-HYP-POST-1445-SOAK-001` | Post-#1445 REST stall elimination | C | UNKNOWN | Liveness confidence | AWAITING | **P1** | PRODUCTION_VALIDATION_ONLY | Execute natural soak protocol | None | Natural trips | NO | NO | NO | N/A | Soak only |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | No 2nd-candidate reselection | F,A | CONFIRMED | Selected SOH null despite usable alt | UNKNOWN | **P2** | IMPLEMENTATION_READY | Option B: iterate ranked candidates | Independent | Unit + canonical read tests | YES | NO | NO | LOW | PKG-04 |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | VLS SOH without evidence timestamp | A,F | CONFIRMED | Provider SOH unusable / null | UNKNOWN | **P2** | IMPLEMENTATION_READY | Option A: VLS-only never decision-fresh | PKG-04 related | Unit | YES | Maybe | NO | LOW | PKG-04 |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge vs canonical session identity | A,H | CODE-CONDITIONAL | Duplicate session risk | UNKNOWN | **P2** | RESEARCH_REQUIRED | Option D dedupe + bind path | Trip anchor stability | Sim + prod sample | YES | NO | YES | MED | PKG-06 |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Redis lock fail-open rationale | J,E | CONFIRMED | Duplicate job risk under Redis outage | UNKNOWN | **P2** | RESEARCH_REQUIRED | DEGRADE_BY_SCOPE recommendation | Multi-replica | Chaos test plan | MAYBE | NO | NO | LOW | PKG-07 |
| `BAT-V2-GAP-PUB-READINESS-001` | Pub/readiness enablement | C,D | CONFIRMED | Flags default OFF | Partial | **P2** | NOT_READY | Blocked by LV chain + OQ enablement policy | PKG-01/02 | Staged rollout | YES | NO | YES | MED | Stage 2+ |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE no compute | I | CONFIRMED | Advertised but dead | N/A | **P3** | DEFERRED | Mark PLANNED; remove from eligibility until signals proven | DIMO audit | Design only | MAYBE | NO | YES | LOW | PKG-08 |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY no compute | I | CONFIRMED | Same | N/A | **P3** | DEFERRED | REJECT implementation until reference model defined | PKG-08 | Design only | MAYBE | NO | YES | LOW | PKG-08 |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Threshold rationale unknown | G | UNKNOWN | Calibration risk | N/A | **P3** | RESEARCH_REQUIRED | Backlog classification only | Domain experts | Offline review | NO | NO | NO | N/A | Calibration |
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING without writer | H | INFERRED | Stale metadata risk | UNKNOWN | **P3** | ACCEPT_RISK | Monitor; Bull liveness if orphans found | Post-soak | Read-only DB query | MAYBE | NO | NO | LOW | Future |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED no lifecycle | H | CONFIRMED | Enum debt | N/A | **P3** | DEFERRED | Deprecate or implement — low urgency | Product | Design | MAYBE | NO | NO | LOW | Future |
| `BAT-V2-GAP-HV-AUTHORITY-001` | PHEV/HV unknowns umbrella | C,I | INFERRED | Partial coverage | UNKNOWN | **P3** | RESEARCH_REQUIRED | Split into method + fleet audits | PKG-08 | DIMO MCP | NO | NO | NO | N/A | Research |
| `BAT-V2-GAP-CONSUMER-READ-001` | Master/operator panels unbound | E | INFERRED | Internal UX gap | N/A | **P3** | DEFERRED | Wire to canonical when master UX prioritized | Frontend | UI test | YES | NO | NO | LOW | Frontend |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | `hvPipelineAllowed` dead field | F | CONFIRMED | Confusion only | N/A | **P3** | IMPLEMENTATION_READY | Remove or wire — cleanup | PKG-05 | Lint/search | YES | NO | NO | LOW | Cleanup |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | `providerSoh` naming debt | F | CONFIRMED | Agent confusion | N/A | **P3** | DEFERRED | Rename in major API version | API compat | Contract test | YES | NO | NO | HIGH | API vNext |

## Priority summary

| Tier | Count | IDs |
|------|-------|-----|
| **P0** | 3 | LV handoff ×2 + umbrella chain |
| **P1** | 6 | Timestamp×2, HEV×3, post-1445 soak |
| **P2** | 6 | HV SOH×2, bridge, lock, pub-readiness |
| **P3** | 8 | Methods×2, threshold, RUNNING/SKIPPED, consumer, dead field, naming, HV umbrella |
