# Driving Intelligence — Coverage Matrix

Workstream topic completion status. Uses **IMPLEMENTATION** vs **REFERENCE_VALIDATION** vs **PRODUCTION_VALIDATION** where topics can be implemented but not scientifically closed.

| Topic | Forensic audit | Code mapped | Experiment | Reference GT | Prod validated | Documented | Impl status | Ref validation | Prod validation | Open gap |
|-------|----------------|-------------|------------|--------------|----------------|------------|-------------|----------------|-----------------|----------|
| Current architecture | ✓ | ✓ | ✓ | — | Partial | ✓ | SUBSTANTIAL | — | Partial | V2 E2E at scale |
| DIMO signal surface | ✓ | ✓ | ✓ | RD002/003 | Partial | ✓ | COMPLETE | Partial | Partial | Per-vehicle variance |
| Signal inventory | ✓ | ✓ | ✓ | RD002/003 | Partial | ✓ | COMPLETE | Partial | Partial | — |
| Signal cadence | ✓ | ✓ | ✓ | RD002/003/004 | Partial | ✓ | COMPLETE | **SUBSTANTIAL** (ref drives) | **INCOMPLETE** | Cross-vehicle prod cadence |
| Flight Recorder | ✓ | ✓ | ✓ | RD001–003 | Partial | ✓ | COMPLETE | COMPLETE (canary) | Partial | Live block-poll cal |
| Reference drive methodology | ✓ | ✓ | ✓ | RD001–004 | Partial | ✓ | COMPLETE | COMPLETE | Partial | RD004-G pending |
| RD003 | ✓ | ✓ | ✓ | 9 video clips | Partial | ✓ | COMPLETE | PARTIAL | — | GT not validated |
| RD004 | ✓ | ✓ | ✓ | Seg A/B video | Partial | ✓ | COMPLETE | PARTIAL | — | Live 8/6 calibration |
| Temporal alignment | ✓ | ✓ | ✓ | Video GT | NO | ✓ | COMPLETE | PARTIAL | NO | Independent accuracy |
| HF detectors (prod) | ✓ | ✓ | Partial | RD003 | NO | ✓ | COMPLETE | PARTIAL | NO | Cadence sensitivity |
| Native DIMO events | ✓ | ✓ | ✓ | RD002 (NOT_OBSERVED) | Partial | ✓ | COMPLETE (policy) | PARTIAL | Partial | Per-vehicle observation |
| Episode V2 | ✓ | Design | — | RD003 contract | NO | ✓ | DESIGN ONLY | — | NO | Not implemented |
| Driving Impact V1 | ✓ | ✓ | ✓ | — | Partial | ✓ | COMPLETE | — | Partial | Fleet distribution |
| Driver quality semantics | ✓ | ✓ | — | — | N/A | ✓ | COMPLETE | — | N/A | Naming debt |
| Vehicle load | ✓ | ✓ | ✓ | — | Partial | ✓ | COMPLETE | — | Partial | — |
| Brake load | ✓ | ✓ | Partial | — | Partial | ✓ | COMPLETE | — | Partial | Physics adequacy |
| Tire load | ✓ | ✓ | Partial | — | Partial | ✓ | COMPLETE | — | Partial | Physics adequacy |
| High-timeframe analytics | ✓ | ✓ | Partial | — | Partial | ✓ | PARTIAL | — | Partial | Daily/weekly trends |
| HF Recovery V2 | ✓ | ✓ | ✓ | RD004-B replay | CODE only | ✓ | COMPLETE | PARTIAL | **OFF** | Live validation |
| Block polling | ✓ | ✓ | Designed | — | NO | ✓ | COMPLETE | **NOT STARTED** | NO | 10/20/30/60 live |
| 10/20/30/60 calibration | ✓ | ✓ | ✓ | — | Partial | ✓ | COMPLETE (machinery) | **PARTIAL** (EXP-019 N=1 + replay) | **INCOMPLETE** | Counterbalanced drive + video GT |
| Multi-replica safety | Partial | ✓ | Tests + GATE 2 | — | Partial | ✓ | PARTIAL | — | **PARTIAL** (GATE 2 obs) | Live cal N=2 motion |
| Production rollout | ✓ | ✓ | ✓ | — | Partial | ✓ | CODE_DEPLOYED | — | RC infra ON | HF V2 OFF |
| API semantics | ✓ | ✓ | — | — | Partial | ✓ | PARTIAL | — | Partial | Field naming |
| UI semantics | Partial | ✓ | — | — | Partial | ✓ | PARTIAL | — | Partial | Stress vs driver |

**Legend:** ✓ = substantively done | Partial = incomplete | — = not applicable

Do **not** read "COMPLETE" in Impl status as "all scientific questions closed" — check Ref/Prod validation columns.
