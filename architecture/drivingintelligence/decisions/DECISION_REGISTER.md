# Driving Intelligence — Decision Register

Scientific record of major Driving Intelligence architectural decisions.  
Validate graph consistency: `bash architecture/drivingintelligence/scripts/validate-graph.sh`

## DI-DEC-SEGMENTS-CANONICAL-001

| Field | Value |
|-------|-------|
| **TITLE** | DIMO Segments are canonical trip boundaries |
| **ERA** | Core product architecture |
| **STATUS** | VALIDATED |
| **PROBLEM** | Risk of deriving trips from ad-hoc HF segmentation |
| **ALTERNATIVES** | Local signal-based trip detection |
| **DECISION** | VehicleTrip anchored on DIMO Segments; DI consumes COMPLETED trips |
| **RATIONALE** | Consistent trip identity across telematics, energy, and analytics |
| **TRADE-OFFS** | Depends on DIMO segment quality and settlement |
| **CONSEQUENCES** | All DI enrichment scoped to persisted trip windows |
| **IMPLEMENTATION** | `trip-detection-orchestration.service.ts`, DIMO integration |
| **GRAPH NODES** | DI-TRIP-SEGMENTS-001, DI-DEC-SEGMENTS-CANONICAL-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-BOUNDARY-001 |

## DI-DEC-POST-TRIP-HF-001

| Field | Value |
|-------|-------|
| **TITLE** | Post-trip HF enrichment via BullMQ |
| **ERA** | V1 production |
| **STATUS** | VALIDATED |
| **PROBLEM** | Need behavior events and stress metrics after trip completion |
| **ALTERNATIVES** | Live-trip abuse detection on ACTIVE_TICK only |
| **DECISION** | `trip.behavior.enrichment` → whole-trip `fetchHighFrequency` → detectors |
| **RATIONALE** | Complete trip window available; avoids live FSM complexity |
| **TRADE-OFFS** | Re-fetch DIMO each enrichment; no incremental recovery in production |
| **CONSEQUENCES** | Late-settling buckets may be missed (RD004-B) |
| **IMPLEMENTATION** | `trip-enrichment-orchestrator.service.ts`, `trip-behavior-enrichment.service.ts` |
| **GRAPH NODES** | DI-SVC-ENRICH-ORCH-001, DI-QUEUE-BEHAVIOR-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-ENRICH-001 |

## DI-DEC-STRESS-NOT-DRIVER-001

| Field | Value |
|-------|-------|
| **TITLE** | drivingStressScore is vehicle operational load |
| **ERA** | Impact Engine V1 |
| **STATUS** | VALIDATED |
| **PROBLEM** | UI/API naming suggests driver quality |
| **ALTERNATIVES** | Rename to vehicleStressScore everywhere |
| **DECISION** | Score semantics documented as vehicle load; `DriverScoreService` misnamed |
| **RATIONALE** | No driver-conduct inference without attribution evidence |
| **TRADE-OFFS** | Naming debt remains in `DriverScoreService` |
| **CONSEQUENCES** | Rental/insurance UI must not imply driver skill ranking |
| **IMPLEMENTATION** | `driving-impact-scorer.ts`, `driver-score.service.ts` |
| **GRAPH NODES** | DI-MET-STRESS-001, DI-SVC-DRIVER-SCORE-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-SCORE-001 |

## DI-DEC-LOAD-PROXY-001

| Field | Value |
|-------|-------|
| **TITLE** | Tire and brake load are operational proxies |
| **ERA** | P43 load components |
| **STATUS** | VALIDATED |
| **PROBLEM** | Health modules need wear-relevant signals without physical sensors |
| **ALTERNATIVES** | Present as measured wear |
| **DECISION** | `tireLoad`, `brakingLoad` with explicit `sourceQuality` and assessability |
| **RATIONALE** | Honest uncertainty; prevents false precision in health UI |
| **TRADE-OFFS** | Users may misinterpret without UI copy discipline |
| **CONSEQUENCES** | Health recalc gated by `healthEligibility` |
| **IMPLEMENTATION** | `driving-impact-load-components.ts`, `driving-health-impact-publish.handler.ts` |
| **GRAPH NODES** | DI-MET-TIRE-LOAD-001, DI-MET-BRAKE-LOAD-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-LOAD-001 |

## DI-DEC-V2-FLAG-001

| Field | Value |
|-------|-------|
| **TITLE** | V2 durable pipeline behind master flag default off |
| **ERA** | 2026-07+ V2 development |
| **STATUS** | VALIDATED |
| **PROBLEM** | Legacy enrichment lacks idempotent stage orchestration |
| **ALTERNATIVES** | Big-bang replace legacy path |
| **DECISION** | `DRIVING_INTELLIGENCE_V2_ENABLED` default false; parallel legacy path |
| **RATIONALE** | Safe incremental rollout; trip FSM unaffected |
| **TRADE-OFFS** | Dual-path complexity during transition |
| **CONSEQUENCES** | Reconciliation scheduler repairs V2 gaps |
| **IMPLEMENTATION** | `driving-intelligence-v2.config.ts`, `driving-analysis-init.service.ts` |
| **GRAPH NODES** | DI-FLAG-V2-MASTER-001, DI-SVC-ANALYSIS-INIT-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-CODE-V2-FLAG-001 |

## DI-DEC-RC-SEPARATE-001

| Field | Value |
|-------|-------|
| **TITLE** | Reference capture isolated from production HF |
| **ERA** | DI-EV-0035C |
| **STATUS** | VALIDATED |
| **PROBLEM** | HF recovery experiments could alter production scoring |
| **ALTERNATIVES** | Wire recovery V2 directly into trip-behavior-enrichment |
| **DECISION** | Recovery V2 and block polling only in `reference-capture` module |
| **RATIONALE** | Scientific isolation; evidence before cutover |
| **TRADE-OFFS** | Production path retains known late-bucket gap |
| **CONSEQUENCES** | Explicit cutover decision required for production HF migration |
| **IMPLEMENTATION** | `reference-capture-hf-recovery-v2.policy.ts` |
| **GRAPH NODES** | DI-DEC-RC-SEPARATE-001, DI-POL-HF-RECOVERY-V2-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C-RECOVERY-001 |

## DI-DEC-HF-RECOVERY-V2-001

| Field | Value |
|-------|-------|
| **TITLE** | HF recovery V2 for late-arriving buckets |
| **ERA** | DI-EV-0035C (2026-09-04) |
| **STATUS** | EXPERIMENTAL |
| **PROBLEM** | RD004-B: 2s overlap misses late-settling DIMO buckets permanently |
| **ALTERNATIVES** | Increase overlap only; full raw HF persistence |
| **DECISION** | Settlement delay 8s, recovery overlap 6s, triple watermarks, provenance ring |
| **RATIONALE** | Recover late buckets without unbounded re-query |
| **TRADE-OFFS** | Parameters provisional; not production-validated |
| **CONSEQUENCES** | `HF_RECOVERY_POLICY_V2_ENABLED` default false |
| **IMPLEMENTATION** | `reference-capture-hf-recovery-v2.policy.ts` |
| **GRAPH NODES** | DI-POL-HF-RECOVERY-V2-001 |
| **SUPERSEDES** | Legacy 2s overlap-only watermark |
| **EPISTEMIC** | CONFIRMED (implementation); INFERRED (parameter optimality) |
| **EVIDENCE** | DI-EVID-0035C-RECOVERY-001 |

## DI-DEC-BLOCK-POLL-30S-001

| Field | Value |
|-------|-------|
| **TITLE** | 30s HF block polling scalability hypothesis |
| **ERA** | DI-EV-0035C.1–C.1e |
| **STATUS** | PROPOSED |
| **PROBLEM** | 5s runner polling does not scale to fleet HF acquisition cost |
| **ALTERNATIVES** | Keep 5s; live streaming; persist raw HF in Postgres |
| **DECISION** | Test 30s `HF_HISTORICAL` poll with coverage-driven queryFrom; calibration matrix 10/20/30/60s |
| **RATIONALE** | Provider may return dense historical buckets per request |
| **TRADE-OFFS** | Hypothesis unvalidated; live canary required |
| **CONSEQUENCES** | `HF_30S_BLOCK_POLLING_VALIDATED = NO` |
| **IMPLEMENTATION** | `reference-capture-hf-block-polling.policy.ts`, calibration phase API |
| **GRAPH NODES** | DI-POL-HF-BLOCK-POLL-001, DI-HYP-BLOCK-POLL-30S-001 |
| **EPISTEMIC** | INFERRED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-EPISODE-V2-001

| Field | Value |
|-------|-------|
| **TITLE** | Episode-based future driving score (DI-EV-0034F) |
| **ERA** | 2026-09 canonical design |
| **STATUS** | PROPOSED |
| **PROBLEM** | Point-pair HF counting brittle under sparse cadence |
| **ALTERNATIVES** | Tune thresholds only; ignore sparse HF |
| **DECISION** | Driving Episodes with reconstruction vs attribution confidence layers |
| **RATIONALE** | RD003/RD004 evidence supports gap-aware reconstruction |
| **TRADE-OFFS** | Large implementation; not deployed |
| **CONSEQUENCES** | Production still uses Impact V1 scorer |
| **IMPLEMENTATION** | `driving-intelligence-v2-canonical-design.ts` (design artifact only) |
| **GRAPH NODES** | DI-DEC-EPISODE-V2-001 |
| **EPISTEMIC** | INFERRED |
| **EVIDENCE** | DI-EVID-0034F-DESIGN-001 |

## DI-DEC-PROD-DET-UNCHANGED-001

| Field | Value |
|-------|-------|
| **TITLE** | Production HF detectors unchanged after RD003 cadence proof |
| **ERA** | RD003 closeout (2026-09-03) |
| **STATUS** | VALIDATED |
| **PROBLEM** | RD003 proved 1s≠1Hz; production assumes ~1Hz |
| **ALTERNATIVES** | Immediate threshold retune; disable HF detectors |
| **DECISION** | Document semantic debt; defer change until Episode V2 or GT-validated replacement |
| **RATIONALE** | Threshold tweak without GT risks false positives/negatives |
| **CONSEQUENCES** | `DI-CONTRA-HF-1HZ-001` remains active |
| **IMPLEMENTATION** | No production detector code change |
| **GRAPH NODES** | DI-ALGO-HF-ACCEL-001, DI-GAP-HF-CADENCE-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-RD003-CADENCE-001 |

## DI-DEC-PROVIDER-TS-001

| Field | Value |
|-------|-------|
| **TITLE** | providerTimestamp is physical event time authority |
| **ERA** | RD003 signal quality (DI-EV-0034E) |
| **STATUS** | VALIDATED |
| **PROBLEM** | synqReceivedAt proposed as alignment clock |
| **DECISION** | All reconstruction anchors on providerTimestamp with stale-hold awareness |
| **RATIONALE** | Ingress timing unsupported for GT (`INGRESS_TIME_DIAGNOSTIC_SUPPORTED_CLIPS=0`) |
| **CONSEQUENCES** | Alignment workbench multi-clock model |
| **GRAPH NODES** | DI-SIG-HF-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-RD003-CADENCE-001 |

## DI-DEC-CANARY-FAIL-CLOSED-001

| Field | Value |
|-------|-------|
| **TITLE** | HF V2 canary fails closed when allowlist empty |
| **ERA** | C.1a (DI-EV-0035C.1a) |
| **STATUS** | VALIDATED |
| **PROBLEM** | Canary could fail-open without scoped vehicle |
| **DECISION** | Empty allowlist → LEGACY policy; no unscoped V2 activation |
| **RATIONALE** | Prevent accidental fleet-wide experimental HF |
| **CONSEQUENCES** | Production safe with CODE_DEPLOYED + FEATURE_OFF |
| **GRAPH NODES** | DI-POL-HF-RECOVERY-V2-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-OPERATOR-CANARY-001

| Field | Value |
|-------|-------|
| **TITLE** | Operator selects canary vehicle at runtime |
| **ERA** | C.1b (DI-EV-0035C.1b) |
| **STATUS** | VALIDATED |
| **PROBLEM** | Hardcoded KS MX 2024 / token 187336 |
| **DECISION** | Any eligible connected vehicle; operator pre-run selection contract |
| **RATIONALE** | Scientific comparability without fixed production vehicle assumption |
| **CONSEQUENCES** | KS MX 2024 is example evidence only |
| **GRAPH NODES** | DI-SVC-RC-RUNNER-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-PHASE-BOUNDARY-001

| Field | Value |
|-------|-------|
| **TITLE** | Calibration phase changes at safe cycle boundaries |
| **ERA** | C.1c–d |
| **STATUS** | VALIDATED |
| **PROBLEM** | Mid-cycle phase switch causes race and invalid stats |
| **DECISION** | Phase activation at boundary; REQUESTED vs EFFECTIVE semantics |
| **RATIONALE** | Control-plane must not race data-plane acquisition |
| **CONSEQUENCES** | `requestHfCalibrationPhaseAtomic()` in C.1e |
| **GRAPH NODES** | DI-POL-HF-BLOCK-POLL-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-TRANSITION-EXCLUDE-001

| Field | Value |
|-------|-------|
| **TITLE** | Transition windows excluded from primary cadence statistics |
| **ERA** | C.1e |
| **STATUS** | VALIDATED |
| **PROBLEM** | Phase transitions contaminated 10/20/30/60 comparison |
| **DECISION** | Exclude TRANSITION + RECOVERY_SWEEP from primary stats |
| **RATIONALE** | Pure cadence phases require clean measurement windows |
| **CONSEQUENCES** | FAST_LOOP + PHASE_NATIVE primary statistics |
| **GRAPH NODES** | DI-POL-HF-BLOCK-POLL-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-0035C1-BLOCK-001 |

## DI-DEC-DEPLOY-DISABLED-001

| Field | Value |
|-------|-------|
| **TITLE** | Deploy recovery code with features disabled |
| **ERA** | PR #1533 (2026-09-05) |
| **STATUS** | VALIDATED |
| **PROBLEM** | Ship C.1e hardening without altering production HF |
| **DECISION** | Merge to main; keep `HF_RECOVERY_POLICY_V2_ENABLED=false`; empty canary |
| **RATIONALE** | Infrastructure ready; zero production behavior change |
| **CONSEQUENCES** | CODE_DEPLOYED=YES; FEATURE_ENABLED=NO; LEGACY authority |
| **GRAPH NODES** | DI-FLAG-HF-RECOVERY-V2-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-PR-1533-001 |

## DI-DEC-NATIVE-LTE-001

| Field | Value |
|-------|-------|
| **TITLE** | Native DIMO events authoritative for LTE_R1 short misuse |
| **ERA** | Phase 2 + RD002/003 + code reframing |
| **STATUS** | VALIDATED |
| **PROBLEM** | Sparse HF cannot assert short-lived misuse from point-pair |
| **DECISION** | HF pass = Trip Signal Summary; native events = misuse authority |
| **RATIONALE** | Median HF 3–6s on LTE_R1 |
| **CONSEQUENCES** | event-context enrichment on native anchors |
| **GRAPH NODES** | DI-SIG-NATIVE-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-NATIVE-EVENTS-001 |

## DI-DEC-ALIGN-HARD-BOUNDS-001

| Field | Value |
|-------|-------|
| **TITLE** | Reject alignments that violate hard temporal/physical bounds |
| **ERA** | RD003/RD004 alignment chain |
| **STATUS** | VALIDATED |
| **PROBLEM** | Low MAE fits that are physically implausible |
| **DECISION** | Hard bounds gate; MAE alone insufficient for GT claims |
| **RATIONALE** | RD004-A.2; RD003 clock-prior falsification |
| **CONSEQUENCES** | GROUND_TRUTH_VALIDATED=NO until independent holdout passes |
| **GRAPH NODES** | DI-CONTRA-HF-1HZ-001 |
| **EPISTEMIC** | CONFIRMED |
| **EVIDENCE** | DI-EVID-RD004-A-001 |
