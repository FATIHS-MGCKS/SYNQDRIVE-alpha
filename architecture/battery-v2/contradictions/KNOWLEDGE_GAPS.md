# Battery V2 — Knowledge Gaps

Stable gap IDs (`BAT-V2-GAP-*`). See also [research/OPEN_QUESTIONS.md](../research/OPEN_QUESTIONS.md).

| ID | Summary | Epistemic status | Reconstruction maturity |
|----|---------|------------------|-------------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING enum — reader exists; no writer in audited history | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED enum — no audited writer/lifecycle | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge fallback — anchor identity divergence; CODE-CONDITIONAL duplicates | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV/PHEV remaining unknowns (unimplemented methods) | INFERRED | SUBSTANTIAL |
| `BAT-V2-GAP-CONSUMER-READ-001` | Master/operator panels UNCONSUMED | INFERRED | SUBSTANTIAL |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Fail-open confirmed; rationale UNKNOWN | CONFIRMED | PARTIAL |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV timestamp fallback CODE REACHABLE_AND_CONFLICTING | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Threshold rationale UNKNOWN | UNKNOWN | PARTIAL |
| `BAT-V2-GAP-PUB-READINESS-001` | Publication/readiness flags default OFF | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-LV-CANONICAL-ASSESSMENT-HANDOFF-001` | Canonical REST complete → assessment enqueue missing | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-LV-PUBLICATION-HANDOFF-001` | Assessment complete → publication enqueue missing | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | Canonical LV pipeline not e2e reachable (umbrella) | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HEV-IS-EV-001` | HEV fuelType vs canonical isEv | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HEV-SIDE-EFFECT-READ-DIVERGENCE-001` | HEV side-effect writes vs canonical read absence | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | `hvPipelineAllowed` no runtime consumer (repo audit) | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | LatestState SOH without evidence timestamp | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | No second-candidate reselection | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | Selected SOH `providerSoh` naming debt | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE_CAPACITY no compute | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY no compute | CONFIRMED | SUBSTANTIAL |

All indexed gap IDs must exist as machine nodes in `graph/nodes.yaml`.
