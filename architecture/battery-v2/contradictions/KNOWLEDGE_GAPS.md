# Battery V2 — Knowledge Gaps

Stable gap IDs (`BAT-V2-GAP-*`). See also [research/OPEN_QUESTIONS.md](../research/OPEN_QUESTIONS.md).

| ID | Summary | Epistemic status | Reconstruction maturity |
|----|---------|------------------|-------------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING enum — no git writer; defensive reschedule guard only | HISTORICAL | SUBSTANTIAL |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED enum — no git writer; unused design debt | HISTORICAL | SUBSTANTIAL |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge trip resolution without authoritative finalized trip | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV/PHEV remaining unknowns (unimplemented methods, production mix) | INFERRED | SUBSTANTIAL |
| `BAT-V2-GAP-CONSUMER-READ-001` | Master/operator battery panels UNCONSUMED; insight notification path partial | INFERRED | SUBSTANTIAL |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Fail-open behavior confirmed; rationale UNKNOWN | CONFIRMED | PARTIAL |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV timestamp fallback CODE REACHABLE_AND_CONFLICTING; production frequency UNKNOWN | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Threshold values cataloged; calibration rationale UNKNOWN | UNKNOWN | PARTIAL |
| `BAT-V2-GAP-PUB-READINESS-001` | Publication/readiness flags default OFF; dual authority; LV job chain incomplete | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-LV-PUBLICATION-JOB-CHAIN-001` | `BATTERY_PUBLICATION_UPDATE` not enqueued from REST/assessment path | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HEV-IS-EV-001` | HEV fuelType vs canonical isEv — `canonical.hv=null` | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HEV-SNAPSHOT-ORPHAN-001` | HEV HV snapshot/session writes without canonical read | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-PIPELINE-ALLOWED-DEAD-001` | `hvPipelineAllowed` resolved but no runtime consumer | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | LatestState SOH value without evidence observedAt | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | Winner fails usability — no second-candidate reselection | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | Selected SOH uses `providerSoh`-named DTO carrier | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE_CAPACITY eligibility only — no compute | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY eligibility only — no compute | CONFIRMED | SUBSTANTIAL |

All indexed gap IDs must exist as machine nodes in `graph/nodes.yaml`.
