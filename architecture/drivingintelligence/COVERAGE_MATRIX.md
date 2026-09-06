# Driving Intelligence — Coverage Matrix

Workstream topic completion status as of authority bootstrap pass 2 (2026-09-06).

| Topic | Forensic audit | Code mapped | Experiment | Reference GT | Production validated | Documented | Status | Open gap |
|-------|----------------|-------------|------------|--------------|---------------------|------------|--------|----------|
| Current architecture | ✓ | ✓ | ✓ | — | Partial | ✓ | SUBSTANTIAL | V2 E2E at scale |
| DIMO signal surface | ✓ | ✓ | ✓ | RD002/003 | Partial | ✓ | COMPLETED | Per-vehicle variance |
| Signal inventory | ✓ | ✓ | ✓ | RD002/003 | Partial | ✓ | COMPLETED | — |
| Signal cadence | ✓ | ✓ | ✓ | RD002/003/004 | ✓ (reference) | ✓ | COMPLETED | Prod detector debt |
| Flight Recorder | ✓ | ✓ | ✓ | RD001–003 | ✓ (canary) | ✓ | COMPLETED | Live calibration |
| Reference drive methodology | ✓ | ✓ | ✓ | RD001–004 | Partial | ✓ | COMPLETED | RD004-G pending |
| RD003 | ✓ | ✓ | ✓ | 9 video clips | Partial | ✓ | COMPLETED | GT not validated |
| RD004 | ✓ | ✓ | ✓ | Seg A/B video | Partial | ✓ | COMPLETED | Live 8/6 calibration |
| Temporal alignment | ✓ | ✓ | ✓ | Video GT | NO | ✓ | PARTIAL | Independent accuracy |
| HF detectors (prod) | ✓ | ✓ | Partial | RD003 | NO | ✓ | PARTIAL | Cadence sensitivity |
| Native DIMO events | ✓ | ✓ | ✓ | RD002 | Partial | ✓ | COMPLETED | — |
| Episode V2 | ✓ | Design | — | RD003 contract | NO | ✓ | DESIGN ONLY | Not implemented |
| Driving Impact V1 | ✓ | ✓ | ✓ | — | Partial | ✓ | COMPLETED | Fleet distribution |
| Driver quality semantics | ✓ | ✓ | — | — | N/A | ✓ | COMPLETED | Naming debt |
| Vehicle load | ✓ | ✓ | ✓ | — | Partial | ✓ | COMPLETED | — |
| Brake load | ✓ | ✓ | Partial | — | Partial | ✓ | COMPLETED | Physics adequacy |
| Tire load | ✓ | ✓ | Partial | — | Partial | ✓ | COMPLETED | Physics adequacy |
| High-timeframe analytics | ✓ | ✓ | Partial | — | Partial | ✓ | PARTIAL | Daily/weekly trends |
| HF Recovery V2 | ✓ | ✓ | ✓ | RD004-B replay | CODE only | ✓ | EXPERIMENTAL | Live validation |
| Block polling | ✓ | ✓ | Designed | — | NO | ✓ | NOT VALIDATED | 10/20/30/60 live |
| 10/20/30/60 calibration | ✓ | ✓ | — | — | NO | ✓ | NOT STARTED | Operator run |
| Multi-replica safety | Partial | ✓ | Tests only | — | UNKNOWN | ✓ | PARTIAL | Prod PM2 topology |
| Production rollout | ✓ | ✓ | ✓ | — | Partial | ✓ | CODE_DEPLOYED | FEATURE off |
| API semantics | ✓ | ✓ | — | — | Partial | ✓ | PARTIAL | Field naming |
| UI semantics | Partial | ✓ | — | — | Partial | ✓ | PARTIAL | Stress vs driver |

**Legend:** ✓ = substantively done | Partial = incomplete | — = not applicable
