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
