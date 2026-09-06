# Driving Intelligence — Change Ledger

Scientific evolution record. Not a conventional changelog.

## Evolution 1 — Post-trip HF enrichment (V1 production)

| Phase | Detail |
|-------|--------|
| **Observation** | Trip completion provides full window for behavior analysis |
| **Hypothesis** | DIMO `signals(interval:"1s")` yields adequate HF for harsh event detection |
| **Experiment** | Production deployment with point-pair detectors |
| **Evidence** | DI-EVID-PHASE1-001, DI-EVID-CODE-ENRICH-001 |
| **Decision** | DI-DEC-POST-TRIP-HF-001 |
| **Implementation** | `trip-behavior-enrichment.service.ts`, HF detectors |
| **Validation** | Production operation; reference drives later challenged 1Hz assumption |
| **Remaining uncertainty** | True signal density; late bucket recovery |

## Evolution 2 — Driving Impact Engine V1

| Phase | Detail |
|-------|--------|
| **Observation** | Event counts need normalization to trip distance and context |
| **Hypothesis** | Per-100km rates + capLinear composite yield actionable vehicle load score |
| **Experiment** | Impact scorer v1.2.0 with load components |
| **Evidence** | DI-EVID-CODE-SCORE-001, DI-EVID-CODE-LOAD-001 |
| **Decision** | DI-DEC-STRESS-NOT-DRIVER-001, DI-DEC-LOAD-PROXY-001 |
| **Implementation** | `driving-impact.service.ts`, `driving-impact-scorer.ts` |
| **Validation** | Unit tests; health module integration |
| **Remaining uncertainty** | Fleet-wide score distribution; ICE vs EV parity |

## Evolution 3 — V2 durable pipeline

| Phase | Detail |
|-------|--------|
| **Observation** | Legacy chain lacks idempotent stages, assessability, native event authority |
| **Hypothesis** | Stage DAG + persistent jobs enable safe incremental rollout |
| **Experiment** | V2 behind `DRIVING_INTELLIGENCE_V2_ENABLED` |
| **Evidence** | DI-EVID-CODE-V2-FLAG-001 |
| **Decision** | DI-DEC-V2-FLAG-001 |
| **Implementation** | `driving-analysis-init`, `driving-analysis-stage`, `driving-intelligence-jobs` |
| **Validation** | CI tests; production E2E **NOT VALIDATED** |
| **Remaining uncertainty** | Fleet scale; stage failure recovery under load |

## Evolution 4 — RD003 signal quality (1s ≠ 1Hz)

| Phase | Detail |
|-------|--------|
| **Observation** | Reference drive RD003: median bucket spacing ~2s despite 1s query |
| **Hypothesis** | Provider aggregate resolution differs from request interval |
| **Experiment** | Signal quality analysis, video ground-truth alignment |
| **Evidence** | DI-EVID-RD003-CADENCE-001 |
| **Decision** | Provisional 2.0s max-gap for V2 design (DI-EV-0034F) |
| **Implementation** | Production detectors **unchanged** |
| **Validation** | CONFIRMED on reference vehicles |
| **Remaining uncertainty** | Cross-vehicle/provider variance |

## Evolution 5 — RD004-B late bucket recovery (DI-EV-0035C)

| Phase | Detail |
|-------|--------|
| **Observation** | Late-arriving buckets + 2s watermark overlap → permanent gaps |
| **Hypothesis** | Settlement delay + recovery overlap + separate watermarks recover buckets |
| **Experiment** | RD004-B exact-window replay, recovery policy simulation |
| **Evidence** | DI-EVID-0035C-RECOVERY-001, `rd004-b-findings.md` |
| **Decision** | DI-DEC-HF-RECOVERY-V2-001, DI-DEC-RC-SEPARATE-001 |
| **Implementation** | `reference-capture-hf-recovery-v2.policy.ts` |
| **Validation** | Unit tests; reference capture scope only |
| **Remaining uncertainty** | 8s/6s parameter optimality; production cutover |

## Evolution 6 — Block polling scalability (DI-EV-0035C.1–C.1e)

| Phase | Detail |
|-------|--------|
| **Observation** | 5s runner tick × fleet = unsustainable DIMO API pressure |
| **Hypothesis** | 30s block poll preserves 1s/2s bucket density |
| **Experiment** | Calibration phases 10/20/30/60s in reference capture |
| **Evidence** | DI-EVID-0035C1-BLOCK-001 |
| **Decision** | DI-DEC-BLOCK-POLL-30S-001 (PROPOSED) |
| **Implementation** | C.1 through C.1e: poll interval, canary, phases, atomicity |
| **Validation** | **NOT EXECUTED** live canary |
| **Remaining uncertainty** | `HF_30S_BLOCK_POLLING_VALIDATED = NO` |

## Evolution 7 — Episode V2 design (DI-EV-0034F)

| Phase | Detail |
|-------|--------|
| **Observation** | Point-pair counting fails under sparse HF |
| **Hypothesis** | Episode taxonomy with confidence layers improves reconstruction |
| **Experiment** | Canonical design export, RD004 validation contract |
| **Evidence** | DI-EVID-0034F-DESIGN-001 |
| **Decision** | DI-DEC-EPISODE-V2-001 (PROPOSED) |
| **Implementation** | Design artifact only; `DEPLOYED: NO` |
| **Validation** | Pending implementation |
| **Remaining uncertainty** | Cutover from Impact V1 |

## Evolution 8 — LTE_R1 native event authority split

| Phase | Detail |
|-------|--------|
| **Observation** | LTE_R1 HF sparse (median 3–6s); misuse needs native events |
| **Hypothesis** | Separate Trip Signal Summary from native-event misuse path |
| **Experiment** | Event-context enrichment on native anchors |
| **Evidence** | `trip-behavior-enrichment.service.ts` reframing comments |
| **Decision** | DI-INV-LTE-NATIVE-AUTHORITY-001 |
| **Implementation** | `dimo-native-driving-events/`, `event-context/` |
| **Validation** | CONFIRMED in code |
| **Remaining uncertainty** | RPM webhook candidate integration breadth |
