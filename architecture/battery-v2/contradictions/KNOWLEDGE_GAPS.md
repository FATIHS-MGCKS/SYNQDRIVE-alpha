# Battery V2 — Knowledge Gaps

Stable gap IDs (`BAT-V2-GAP-*`). See also [research/OPEN_QUESTIONS.md](../research/OPEN_QUESTIONS.md).

| ID | Summary | Epistemic status | Reconstruction maturity |
|----|---------|------------------|-------------------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | `RUNNING` metadata without live Bull job after handler crash — no recovery path verified | CONFIRMED | PARTIAL |
| `BAT-V2-GAP-SKIPPED-REST-001` | `SKIPPED` REST target semantics and reconciliation behavior | UNKNOWN | NONE |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge trip resolution without authoritative finalized trip | INFERRED | PARTIAL |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV/PHEV authority model | UNKNOWN | NONE |
| `BAT-V2-GAP-CONSUMER-READ-001` | UI/API consumer authority (canonical vs legacy) | UNKNOWN | NONE |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Lock fail-open rationale | UNKNOWN | NONE |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV live ingestion timestamp fallbacks — production reachability | UNKNOWN | PARTIAL |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Policy threshold provenance (0.5 km/h, 5% load, 30m grace) | UNKNOWN | PARTIAL |
| `BAT-V2-GAP-PUB-READINESS-001` | Publication/readiness enablement gates | INFERRED | PARTIAL |

All indexed gap IDs must exist as machine nodes in `graph/nodes.yaml`.
