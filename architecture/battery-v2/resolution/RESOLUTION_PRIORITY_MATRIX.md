# Battery V2 — Resolution Priority Matrix (Phase 4)

**Open gaps (`BAT-V2-GAP-*`):** 20 — derived from `contradictions/KNOWLEDGE_GAPS.md` + graph index  
**Phase-4 planning extras (not gaps):** 2 contradictions + 1 hypothesis in this matrix  
**Total planning items in this matrix:** 23 (= 20 + 2 + 1)

> Planning extras (`BAT-V2-CONTRA-*`, `BAT-V2-HYP-*`) are tracked for resolution work but **do not** count toward the open-gap total of 20.

## Priority tier semantics

| Tier | Meaning |
|------|---------|
| **P0_ACTIVATION_BLOCKER** | Blocks Stage-2+ cutover when canonical REST/publication flags are enabled — **not** a proven active production outage while flags default OFF |
| **P0_ACTIVE_PRODUCTION_INCIDENT** | Confirmed customer-facing harm with feature already enabled in production |
| **P1** | High — decision, validation, or enablement dependency |
| **P2** | Medium — quality, resilience, or secondary chain risk |
| **P3** | Low — debt, deferral, or cosmetic |

**Current LV handoff gaps use `P0_ACTIVATION_BLOCKER` only.** Canonical REST and publication feature flags default **OFF** in code; missing handoffs are confirmed cutover blockers, not proven Stage-2 publication outages for live customers.

Legend — **primary category:** A=runtime defect, B=authority contradiction, C=validation gap, D=product policy, E=observability, F=naming debt, G=calibration, H=historical debt, I=missing method, J=resilience risk.

## Master table

| ID | Title | PRIMARY | SECONDARY | Reachability | Current impact | Production evidence | Code evidence | Priority | Readiness | Recommended action | Dependency | Validation type | Runtime? | Migration? | Flag? | Rollback | Target phase |
|----|-------|---------|-----------|--------------|----------------|---------------------|---------------|----------|-----------|-------------------|------------|-----------------|----------|------------|-------|----------|--------------|
| `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` | REST complete → no assessment enqueue | A | — | CONFIRMED | Stage-2 cutover blocker when flags ON | NONE | CONFIRMED missing enqueue in REST handler | **P0_ACTIVATION_BLOCKER** | IMPLEMENTATION_SPEC_REQUIRED | Hybrid direct enqueue + reconciliation safety net | inputVersion spec (PKG-01) | Integration + flag-gated soak | YES | Maybe (reconcile index) | YES | LOW | Runtime PKG-01 |
| `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` | Assessment complete → no publication enqueue | A | — | CONFIRMED | Publication path incomplete when flags ON | NONE | CONFIRMED handler path when manually invoked | **P0_ACTIVATION_BLOCKER** | IMPLEMENTATION_SPEC_REQUIRED | Publication enqueue after assessment persist; assessment-selection authority required | PKG-01, track + publicationVersion spec | Integration | YES | NO | YES | LOW | Runtime PKG-02 |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | Umbrella: not e2e reachable | A | — | CONFIRMED | No automatic LV pub from canonical REST | NONE | CONFIRMED e2e chain broken | **P0_ACTIVATION_BLOCKER** | IMPLEMENTATION_SPEC_REQUIRED | Resolve via PKG-01 + PKG-02 | PKG-01, PKG-02 | E2E test harness | YES | Maybe | YES | MED | Umbrella |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV timestamp fallback frequency | B | C | REACHABLE | REST may accept non-signal timestamps | UNKNOWN | CONFIRMED fallback code paths | **P1** | DECISION_REQUIRED | Provenance enum + REST **measurement** eligibility rules (not session opening) | Schema design | Post-PKG-03 query + unit | YES | YES | YES | MED | PKG-03 |
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | Fallback vs REST evidence doctrine | B | — | CONFLICTING | Epistemic pollution risk | UNKNOWN | CONFIRMED conflicting doctrine reachability | **P1** | DECISION_REQUIRED | Same as timestamp gap | PKG-03 | Design review | YES | YES | YES | MED | PKG-03 |
| `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | HEV writes vs `canonical.hv` absent | B | D | CONFIRMED | Side-effect / read-model divergence | UNKNOWN | CONFIRMED write/read asymmetry | **P1** | DECISION_REQUIRED | HEV Option A layering (D1 diagnostic; D2/D3/E TBD) | Product decision | Fleet audit | MAYBE | NO | MAYBE | MED | PKG-05 |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | Multi-layer HEV HV contradiction | B | D | PARTIAL | False confidence / ops confusion | UNKNOWN | PARTIAL multi-layer trace | **P1** | DECISION_REQUIRED | Align write gates with read model | PKG-05 | Product + code trace | MAYBE | NO | MAYBE | MED | PKG-05 |
| `BAT-V2-GAP-HEV-IS-EV-001` | Should HEV get `canonical.hv`? | D | — | CONFIRMED | Product question | N/A | N/A | **P1** | DECISION_REQUIRED | Default: NO (Option A) unless fleet audit proves value | PKG-05 | Product workshop | MAYBE | NO | MAYBE | HIGH | PKG-05 |
| `BAT-V2-HYP-POST-1445-SOAK-001` | Post-#1445 REST stall elimination | C | — | UNKNOWN | Liveness confidence | AWAITING | N/A (hypothesis) | **P1** | PRODUCTION_VALIDATION_ONLY | Execute natural soak protocol (initial smoke tranche) | None | Natural trips | NO | NO | NO | N/A | Soak only |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | No 2nd-candidate reselection | A | F | CONFIRMED | Selected SOH null despite usable alt | UNKNOWN | CONFIRMED reachable in code/tests | **P2** | IMPLEMENTATION_READY | Option B: iterate ranked candidates | Independent | Unit + canonical read tests | YES | NO | NO | LOW | PKG-04 |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | VLS SOH without evidence timestamp | A | F | CONFIRMED | VLS-only provider SOH already non-decision-fresh at runtime | UNKNOWN | CONFIRMED: `providerSohObservedAt` from evidence only; VLS-only → `providerSohUsable=false` | **P2** | DECISION_REQUIRED | **Accept current semantics** (Option A): VLS may appear as live/diagnostic; cannot win canonical decision without timestamped evidence. Remaining: production frequency + product tolerance — PRODUCTION_VALIDATION_ONLY / RESEARCH_REQUIRED. **Not** future implementation inside PKG-04 | Independent of PKG-04 winner iteration | Prod frequency query + unit (existing behavior) | YES | NO | NO | LOW | Decision + validation |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge vs canonical session identity | A | H | CODE-CONDITIONAL | Duplicate session risk | UNKNOWN | CODE-CONDITIONAL identity split | **P2** | RESEARCH_REQUIRED | Supersession / alias — no measurement rebinding | Trip anchor stability | Sim + prod sample | YES | NO | YES | MED | PKG-06 |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Redis lock fail-open rationale | J | E | CONFIRMED | Duplicate job risk under Redis outage | UNKNOWN | CONFIRMED fail-open behavior | **P2** | RESEARCH_REQUIRED | DEGRADE_BY_SCOPE — PROPOSED, not validated | Multi-replica | Chaos test plan | MAYBE | NO | NO | LOW | PKG-07 |
| `BAT-V2-GAP-PUB-READINESS-001` | Pub/readiness enablement | C | D | CONFIRMED | Flags default OFF | NONE | CONFIRMED flag wiring (`BAT-V2-EVID-CODE-LV-PUBLICATION-JOB-001`) | **P2** | NOT_READY | Blocked by LV chain + OQ enablement policy | PKG-01/02 | Staged rollout | YES | NO | YES | MED | Stage 2+ |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE no compute | I | — | CONFIRMED | Advertised but dead | N/A | CONFIRMED unimplemented | **P3** | DEFERRED | Mark PLANNED; remove from supported eligibility until signals proven | DIMO audit | Design only | MAYBE | NO | YES | LOW | PKG-08 |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY no compute | I | — | CONFIRMED | Same | N/A | CONFIRMED unimplemented | **P3** | DEFERRED | REJECT implementation until reference model defined | PKG-08 | Design only | MAYBE | NO | YES | LOW | PKG-08 |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Threshold rationale unknown | G | — | UNKNOWN | Calibration risk | N/A | N/A | **P3** | RESEARCH_REQUIRED | Backlog classification only | Domain experts | Offline review | NO | NO | NO | N/A | Calibration |
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING without writer | H | — | INFERRED | Stale metadata risk | UNKNOWN | INFERRED writer absence | **P3** | ACCEPT_RISK | Monitor; Bull liveness if orphans found | Post-soak | Read-only DB query | MAYBE | NO | NO | LOW | Future |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED no lifecycle | H | — | CONFIRMED | Enum debt | N/A | CONFIRMED writer absence | **P3** | DEFERRED | Deprecate or implement — low urgency | Product | Design | MAYBE | NO | NO | LOW | Future |
| `BAT-V2-GAP-HV-AUTHORITY-001` | PHEV/HV unknowns umbrella | C | I | INFERRED | Partial coverage | UNKNOWN | INFERRED partial coverage | **P3** | RESEARCH_REQUIRED | Split into method + fleet audits | PKG-08 | DIMO MCP | NO | NO | NO | N/A | Research |
| `BAT-V2-GAP-CONSUMER-READ-001` | Master/operator panels unbound | E | — | INFERRED | Internal UX gap | N/A | INFERRED consumer gap | **P3** | DEFERRED | Wire to canonical when master UX prioritized | Frontend | UI test | YES | NO | NO | LOW | Frontend |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | `hvPipelineAllowed` dead field | F | — | CONFIRMED | Confusion only | N/A | CONFIRMED dead field | **P3** | DECISION_REQUIRED | Remove vs wire — depends on HEV product authority | PKG-05 | Lint/search | YES | NO | NO | LOW | Cleanup |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | `providerSoh` naming debt | F | — | CONFIRMED | Agent confusion | N/A | CONFIRMED naming debt | **P3** | DEFERRED | Rename in major API version | API compat | Contract test | YES | NO | NO | HIGH | API vNext |

## A) OPEN GAP PRIORITIES (`BAT-V2-GAP-*` only — 20 rows)

| Tier | Count | Gap IDs |
|------|-------|---------|
| **P0_ACTIVATION_BLOCKER** | 3 | `LV-CANONICAL-ASSESSMENT-HANDOFF-001`, `LV-PUBLICATION-HANDOFF-001`, `LV-PUBLICATION-JOB-CHAIN-001` |
| **P1** | 3 | `TIMESTAMP-FALLBACK-001`, `HEV-SIDE-EFFECT-READ-DIVERGENCE-001`, `HEV-IS-EV-001` |
| **P2** | 5 | `HV-SOH-WINNER-USABILITY-001`, `HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001`, `BRIDGE-FALLBACK-001`, `LOCK-FAILOPEN-001`, `PUB-READINESS-001` |
| **P3** | 9 | `HV-SESSION-CHARGE-METHOD-001`, `HV-GROSS-CAPACITY-METHOD-001`, `THRESHOLD-PROVENANCE-001`, `RUNNING-ORPHAN-001`, `SKIPPED-REST-001`, `HV-AUTHORITY-001`, `CONSUMER-READ-001`, `HV-PIPELINE-ALLOWED-DEAD-001`, `HV-SELECTED-SOH-DTO-NAMING-001` |
| **Total** | **20** | |

## B) ALL PHASE-4 PLANNING ITEMS (gaps + contradictions + hypotheses — 23 rows)

| Tier | Count | IDs |
|------|-------|-----|
| **P0_ACTIVATION_BLOCKER** | 3 | LV handoff gaps ×3 |
| **P1** | 6 | `TIMESTAMP-FALLBACK-001`, `CONTRA-LV-TIMESTAMP-PROVENANCE-001`, `HEV-SIDE-EFFECT-READ-DIVERGENCE-001`, `CONTRA-HEV-HV-AUTHORITY-001`, `HEV-IS-EV-001`, `HYP-POST-1445-SOAK-001` |
| **P2** | 5 | HV SOH×2, bridge, lock, pub-readiness |
| **P3** | 9 | Methods×2, threshold, RUNNING/SKIPPED, HV umbrella, consumer, dead field, naming |
| **Total** | **23** | 20 gaps + 2 contra + 1 hyp |

## Priority rationale scorecard (P0 / P1)

Compact assessment against planning dimensions. Scale: **H** high, **M** medium, **L** low, **—** not applicable, **?** unknown.

| ID | Safety | Data integrity | User-facing | Readiness/avail | FP risk | FN risk | Scale/multi-veh | Reach | Flag exposure | Impl complexity | Rollback | Evidence | **Rationale (1 line)** |
|----|--------|----------------|-------------|-----------------|---------|---------|-----------------|-------|---------------|-----------------|----------|----------|------------------------|
| `GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` | M | H | L* | H | L | H | H | CONFIRMED | OFF default | M | L | H code | *User impact only when Stage-2 flags enabled; blocks cutover not live outage |
| `GAP-LV-PUBLICATION-HANDOFF-001` | M | H | L* | H | L | H | H | CONFIRMED | OFF default | M | L | H code | Same activation-blocker semantics; publication handler path exists |
| `GAP-LV-PUBLICATION-JOB-CHAIN-001` | M | H | L* | H | L | H | H | CONFIRMED | OFF default | M | M | H reachability | Umbrella of two handoff gaps; e2e chain unreachable |
| `GAP-TIMESTAMP-FALLBACK-001` | M | H | M | M | M | M | H | REACHABLE | OFF default | H | M | ? prod | Epistemic risk to REST **measurement** quality; not session-opening gate |
| `CONTRA-LV-TIMESTAMP-PROVENANCE-001` | M | H | M | M | M | M | H | CONFLICTING | OFF default | H | M | ? prod | Authority conflict on fallback vs measurement doctrine |
| `GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | L | M | M | L | M | M | ? fleet | CONFIRMED | Partial | M | M | ? fleet | Write/read divergence — side-effect not orphan |
| `CONTRA-HEV-HV-AUTHORITY-001` | L | M | M | L | M | M | ? fleet | PARTIAL | Partial | M | M | ? fleet | Multi-layer contradiction; product authority required |
| `GAP-HEV-IS-EV-001` | L | M | H | M | H | L | ? fleet | CONFIRMED | Partial | H | H | N/A | Product policy: should HEV expose canonical HV? |
| `HYP-POST-1445-SOAK-001` | L | L | L | M | — | M | M | UNKNOWN | REST shadow | — | — | AWAITING | Initial smoke evidence for liveness class only |

*LV P0 user-facing = **L while flags OFF**; becomes **H** at Stage-2 enablement.
