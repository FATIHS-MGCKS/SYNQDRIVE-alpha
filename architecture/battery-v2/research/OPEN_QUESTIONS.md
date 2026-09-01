# Battery V2 — Open Questions

## Liveness / lifecycle

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | Do orphan RUNNING rows exist in production DB from unknown origin? | CONFIRMED current enum+reader; INFERRED orphan hypothesis |
| `BAT-V2-GAP-SKIPPED-REST-001` | Should SKIPPED be implemented or deprecated? | CONFIRMED — no audited writer |

## Publication / LV handoffs

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` | Should REST target completion enqueue assessment? | CONFIRMED gap |
| `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` | Should assessment completion enqueue publication? | CONFIRMED gap |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | What wiring establishes e2e canonical pipeline? | CONFIRMED not e2e today |
| `BAT-V2-GAP-PUB-READINESS-001` | Production enablement timing | CONFIRMED defaults OFF |

## HEV / PHEV

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | Production frequency of HEV side-effect rows with absent canonical.hv | CONFIRMED code path; UNKNOWN frequency |
| `BAT-V2-GAP-HEV-IS-EV-001` | Should HEV receive canonical HV slice? | Product decision UNRESOLVED |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | Will SESSION_CHARGE_CAPACITY get compute? | UNKNOWN |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | Will GROSS_CAPACITY get compute? | UNKNOWN |

## Contradictions

| ID | Question | Epistemic status |
|----|----------|------------------|
| `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001` | Which layer governs HEV HV? | CONTRADICTED / UNRESOLVED |
| `BAT-V2-CONTRA-LV-TIMESTAMP-PROVENANCE-001` | Production impact of timestamp fallback | CONTRADICTED / UNRESOLVED |
