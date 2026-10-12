# Open External Evidence (R4.5 final)

Audit closure **allowed** with these gaps — they are **not** validated as complete.

| ID | Blocker | Status | Owner action |
|----|---------|--------|--------------|
| EXT-001 | ClickHouse read-only correlation | **OPEN** / NOT_MEASURED | Ops read-only CH credentials or accept PG-only lineage |
| EXT-002 | R9 T+24 + 24h retrospective | **MEASURED** | [R9_T24_EVALUATION.md](./evidence/R9_T24_EVALUATION.md), [R9_T24_24H_RETROSPECTIVE.md](./evidence/R9_T24_24H_RETROSPECTIVE.md) — natural E2E **NOT_OBSERVED** |
| EXT-003 | HV charging historical session | **OPEN** / NOT_AVAILABLE | Battery V2 / fleet ops |
| EXT-004 | Provider 403 body detail (187336/190497) | **OPEN** | VDC / provider support |
| EXT-005 | Prod UI capture stale-GPS + Live badge | **OPEN** (optional) | Rental QA — code path sufficient for DEF-004 |
| EXT-006 | Per-replica webhook ingress attribution in logs | **NOT_MEASURED** | Optional log field / nginx upstream id |
| EXT-007 | Full 24h PM2 log scan (mid-window) | **PARTIAL** | Oct-11 evening + Oct-12 post-deploy sampled only |

No synthetic provider calls per audit charter.
