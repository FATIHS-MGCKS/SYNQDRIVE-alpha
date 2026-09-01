# Battery V2 — Open Questions

Stable gap IDs (`BAT-V2-GAP-*`). Machine nodes in `graph/nodes.yaml`.

Phase 3 note: HV authority and primary consumer paths are **SUBSTANTIALLY reconstructed** (Phase 2 + Phase 3). Remaining questions focus on production frequency, enablement, and edge cases — not "is there any code?"

## Liveness / lifecycle

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | Do orphan RUNNING rows exist in production DB from non-git path? | HISTORICAL — no git writer |
| `BAT-V2-GAP-SKIPPED-REST-001` | Is SKIPPED ever needed or should enum be deprecated? | HISTORICAL — no git writer |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | Production frequency of collectionLastSeenAt/providerFetchedAt-only LV timestamps entering REST eval? | CONFIRMED code reachability; UNKNOWN frequency |

## Trip binding / bridge

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Is ±120s bridge fallback still necessary; mis-bind risk under clustered trips? | CONFIRMED reachability; product necessity UNKNOWN |
| `BAT-V2-GAP-HV-AUTHORITY-001` | PHEV mixed-powertrain edge cases; production fleet HV capability mix | INFERRED — core paths traced |
| `BAT-V2-GAP-CONSUMER-READ-001` | Will master/operator battery panels be wired to canonical? | INFERRED — rental path traced |

## Execution / policy

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Redis lock fail-open rationale on Battery V2 enqueue paths | CONFIRMED behavior; rationale UNKNOWN |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Provenance for physical/policy thresholds | UNKNOWN |

## Publication / readiness / HV

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-PUB-READINESS-001` | When will publication/readiness flags be enabled in production? | CONFIRMED defaults OFF; enablement UNKNOWN |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | Should REST completion enqueue publication update? | CONFIRMED gap — not wired |
| `BAT-V2-GAP-HEV-IS-EV-001` | Should HEV receive canonical HV slice? | CONFIRMED `isEv=false`; product decision UNRESOLVED |
| `BAT-V2-GAP-HEV-SNAPSHOT-ORPHAN-001` | Production frequency of HEV orphan HV snapshot rows | CONFIRMED code path; UNKNOWN frequency |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | Should `hvPipelineAllowed` gate producers or be removed? | CONFIRMED dead metadata |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | Production frequency of VLS-only SOH without evidence timestamp | CONFIRMED code path; UNKNOWN frequency |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | Production frequency of winner-unusable despite alternate candidate | CONFIRMED code path; UNKNOWN frequency |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | Should `canonical.hv.providerSoh` be renamed? | CONFIRMED naming debt |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | Will SESSION_CHARGE_CAPACITY get compute? | UNKNOWN |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | Will GROSS_CAPACITY get compute? | UNKNOWN |

## Contradictions

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | Production impact of timestamp fallback on REST evidence semantics | CONTRADICTED / UNRESOLVED |
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | Which layer should govern HEV HV eligibility? | CONTRADICTED / UNRESOLVED — partially reachable |
