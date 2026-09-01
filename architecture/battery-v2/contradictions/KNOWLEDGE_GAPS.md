# Battery V2 — Knowledge Gaps

Stable gap IDs (`BAT-V2-GAP-*`). See also [research/OPEN_QUESTIONS.md](../research/OPEN_QUESTIONS.md).

| ID | Summary | Epistemic status | Reconstruction maturity |
|----|---------|------------------|-------------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | RUNNING enum blocks reschedule; no current writer | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-SKIPPED-REST-001` | SKIPPED enum only; no writer — likely unused debt | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge trip resolution without authoritative finalized trip | INFERRED | PARTIAL |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV remaining unknowns (PHEV shapes, unimplemented methods) | INFERRED | PARTIAL |
| `BAT-V2-GAP-CONSUMER-READ-001` | Remaining consumer surfaces not exhaustively mapped | INFERRED | PARTIAL |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Fail-open behavior confirmed; rationale UNKNOWN | CONFIRMED | PARTIAL |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV timestamp fallback production reachability | UNKNOWN | PARTIAL |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Threshold values cataloged; calibration rationale UNKNOWN | UNKNOWN | PARTIAL |
| `BAT-V2-GAP-PUB-READINESS-001` | Publication/readiness production enablement gates | INFERRED | PARTIAL |
| `BAT-V2-GAP-HEV-IS-EV-001` | HEV fuelType vs canonical isEv gate (within `BAT-V2-CONTRA-HEV-HV-AUTHORITY-001`) | UNKNOWN | PARTIAL |
| `BAT-V2-GAP-HV-PROVIDER-SOH-LATESTSTATE-TIMESTAMP-001` | LatestState SOH value without evidence observedAt | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SOH-WINNER-USABILITY-001` | Winner fails usability — no second-candidate reselection | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SELECTED-SOH-DTO-NAMING-001` | Selected SOH uses `providerSoh`-named DTO carrier | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-SESSION-CHARGE-METHOD-001` | SESSION_CHARGE_CAPACITY eligibility only — no compute | CONFIRMED | SUBSTANTIAL |
| `BAT-V2-GAP-HV-GROSS-CAPACITY-METHOD-001` | GROSS_CAPACITY eligibility only — no compute | CONFIRMED | SUBSTANTIAL |

All indexed gap IDs must exist as machine nodes in `graph/nodes.yaml`.
