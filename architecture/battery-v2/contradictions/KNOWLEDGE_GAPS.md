# Battery V2 — Knowledge Gaps

Stable gap IDs (`BAT-V2-GAP-*`). See also [research/OPEN_QUESTIONS.md](../research/OPEN_QUESTIONS.md).

| ID | Summary | Epistemic status |
|----|---------|----------------|
| `BAT-V2-GAP-RUNNING-ORPHAN-001` | `RUNNING` metadata without live Bull job after handler crash — no recovery path verified | CONFIRMED gap |
| `BAT-V2-GAP-SKIPPED-REST-001` | `SKIPPED` REST target semantics and reconciliation behavior | UNKNOWN |
| `BAT-V2-GAP-BRIDGE-FALLBACK-001` | Bridge trip resolution without authoritative finalized trip | PARTIAL |
| `BAT-V2-GAP-HV-AUTHORITY-001` | HV/PHEV authority model | UNKNOWN |
| `BAT-V2-GAP-CONSUMER-READ-001` | UI/API consumer authority (canonical vs legacy) | UNKNOWN |
| `BAT-V2-GAP-LOCK-FAILOPEN-001` | Lock fail-open rationale | UNKNOWN |
| `BAT-V2-GAP-TIMESTAMP-FALLBACK-001` | LV live ingestion timestamp fallbacks | UNKNOWN |
| `BAT-V2-GAP-THRESHOLD-PROVENANCE-001` | Policy threshold provenance (0.5 km/h, 5% load, 30m grace) | PARTIAL |
| `BAT-V2-GAP-PUB-READINESS-001` | Publication/readiness enablement gates | INFERRED |

Gaps are **intentional** first-class knowledge — not documentation debt to be silently filled with guesses.
