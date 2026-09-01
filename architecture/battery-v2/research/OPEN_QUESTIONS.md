# Battery V2 — Open Questions

Stable gap IDs (`BAT-V2-GAP-*`). Must match `contradictions/KNOWLEDGE_GAPS.md` set exactly.

## Liveness / lifecycle

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | Do orphan RUNNING rows exist in production DB from unknown origin? | CONFIRMED enum+reader; INFERRED orphan hypothesis |
| `BAT-V2-GAP-SKIPPED-REST-001` | Should SKIPPED be implemented or deprecated? | CONFIRMED — no audited writer |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Production frequency of bridge vs canonical session identity divergence? | CONFIRMED code path; UNKNOWN frequency |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | Production frequency of fallback LV timestamps entering REST eval? | CONFIRMED code reachability; UNKNOWN frequency |

## Authority / consumers / policy

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-HV-AUTHORITY-001` | PHEV mixed-powertrain edge cases; production HV capability mix | INFERRED — core paths traced |
| `BAT-V2-GAP-CONSUMER-READ-001` | Will master/operator battery panels wire to canonical? | INFERRED — rental path traced |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Redis lock fail-open rationale | CONFIRMED behavior; rationale UNKNOWN |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Provenance for physical/policy thresholds | UNKNOWN |

## Publication / LV handoffs

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` | Should REST target completion enqueue assessment? | CONFIRMED gap |
| `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` | Should assessment completion enqueue publication? | CONFIRMED gap |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | What wiring establishes e2e canonical pipeline? | CONFIRMED not e2e today |
| `BAT-V2-GAP-PUB-READINESS-001` | Production enablement timing for publication/readiness | CONFIRMED defaults OFF; enablement UNKNOWN |

## HEV / PHEV / HV methods

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-HEV-IS-EV-001` | Should HEV receive canonical HV slice? | CONFIRMED `isEv=false`; product UNRESOLVED |
| `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | Production frequency of HEV side-effect rows with absent canonical.hv | CONFIRMED code path; UNKNOWN frequency |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | Should `hvPipelineAllowed` gate producers or be removed? | CONFIRMED no runtime consumer (audited) |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | Production frequency of VLS-only SOH without evidence timestamp | CONFIRMED code path; UNKNOWN frequency |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | Production frequency of winner-unusable despite alternate candidate | CONFIRMED control flow; UNKNOWN frequency |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | Should `canonical.hv.providerSoh` be renamed? | CONFIRMED naming debt |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | Will SESSION_CHARGE_CAPACITY get compute? | UNKNOWN |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | Will GROSS_CAPACITY get compute? | UNKNOWN |

## Contradictions (indexed separately in OPEN_CONTRADICTIONS.md)

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | Which layer governs HEV HV? | CONTRADICTED / UNRESOLVED |
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | Production impact of timestamp fallback | CONTRADICTED / UNRESOLVED |
