# KG-ATE Independent Authority Review — Phase 2A.1

**Date:** 2026-09-01  
**Reviewer role:** Independent adversarial authority gate (not implementation agent)  
**Target:** PR #1484 — `architecture/knowledge-graphs/automatic-trip-enrichment/`

## Baseline

| Field | Value |
|-------|-------|
| **MAIN_SHA** | `d6884ce6030cafcb9a39fa422359eb8345496913` |
| **PR_1484_HEAD_SHA (pre-review)** | `99026658e23d95881bf0df16578444288951491b` |
| **REVIEW_SHA (post-corrections)** | _(see commit on branch after this review)_ |
| **REVIEW_TIMESTAMP** | 2026-09-01T09:52Z (UTC) |

**Methodology:** Independent code search and file reads on application sources at PR branch (docs-only PR; runtime code matches `origin/main` at review time). Discovery documents and KG YAML used only as comparison targets, not as evidence sources. Validator run executed but treated as necessary-not-sufficient.

---

## 1. Independent implementation reconstruction

### Primary automatic path (CONFIRMED)

```
TripDetectionOrchestrationService.processFinalize (LIVE_FINALIZE | MID_GAP_SPLIT)
  → await TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion (DI V2 init)
  → fire-and-forget TripEnrichmentOrchestratorService.enqueueBehaviorEnrichment
      → VehicleTrip.behaviorEnrichmentStatus = PENDING
      → BullMQ trip.behavior.enrichment job hf-enrich-${tripId} (5s delay default)
  → TripBehaviorEnrichmentProcessor.process
      → runWithDimoRequestContext(POST_TRIP_ENRICHMENT)
      → TripEnrichmentOrchestratorService.runEnrichmentSync
          → IN_PROGRESS
          → TripBehaviorEnrichmentService.enrichTrip (SMART5 HF | LTE_R1 native+abuse)
          → COMPLETED | SKIPPED_NO_HF_DATA | FAILED_*
          → on COMPLETED: TripsService.enrichTrip (route/safety)
          → scheduleMisuseCaseAggregation (fire-and-forget)
          → enqueueDrivingImpact → trip.driving-impact.compute
```

**Evidence:** `trip-detection-orchestration.service.ts` (~2464–2474), `trip-enrichment-orchestrator.service.ts`, `trip-behavior-enrichment.processor.ts`

### Parallel tracks (CONFIRMED, under-documented in initial PR)

1. **DI V2 durable pipeline** — `DrivingAnalysisInitService.initializeForCompletedTrip` stages jobs on `driving.intelligence.jobs`, including `DRIVING_IMPACT_COMPUTE` handler calling the same `DrivingImpactService.computeForTrip`.
2. **Reconciliation repair** — `TripReconciliationService.reconcileWindow` (mutex + `runWithDimoRequestContext`) → repairs via `TripDecisionEngine` → `enqueueRepairEnrichment` → orchestrator enqueue.
3. **Boundary repair refresh** — `refreshEnrichmentAfterBoundaryRepair(force=true)` after partial boundary repair (missing from initial graph).
4. **Admin backfill** — `backfillUnenrichedTrips` re-enqueues `null` and `FAILED_TRANSIENT` trips (90d / 200 cap).
5. **UI fallback** — `useTripBehaviorEvents` POSTs when `behaviorEnrichmentStatus` is null on COMPLETED trip; client patches optimistic `IN_PROGRESS`.

### Reconciliation window steps (CONFIRMED)

1. repairStaleOngoingTrips  
2. retryPendingBoundaryRefreshes  
3. detectAndRepairMissingTrips  
4. repairMissingEnds  
5. repairIntraTripGapSplits  
6. **energyEventsService.detectEnergyEvents** (isolated try/catch — EED semantics)  
7. eventTripAssociationService.reconcileUnresolvedWindow  

**Evidence:** `trip-reconciliation.service.ts` `executeReconcileWindow`

### Scheduler / liveness (CONFIRMED)

- `TripReconciliationScheduler` fast/warm/cold — `shouldRun(trip_reconciliation_*)`
- `DimoSnapshotScheduler` — `shouldRun(dimo_snapshot_tick|janitor)` (disproves discovery OQ-03 concern)
- `ReconciliationExecutionMutexService` — per-vehicle lock; **may be disabled** via config (`RECONCILIATION_EXECUTION_MUTEX_ENABLED=false`)

### behaviorEnrichmentStatus FSM (reconstructed)

| Transition | Trigger |
|------------|---------|
| null → PENDING | enqueueBehaviorEnrichment (before queue add) |
| PENDING → IN_PROGRESS | runEnrichmentSync → markEnrichmentStarted |
| IN_PROGRESS → COMPLETED | enrichTrip success |
| IN_PROGRESS → SKIPPED_NO_HF_DATA | enrichTrip skip |
| IN_PROGRESS → FAILED_TRANSIENT / FAILED_PERMANENT | exception + isTransientError |
| FAILED_TRANSIENT → (re-enqueue) | backfill or new enqueue (not terminal for enqueue) |
| PENDING stuck | **canEnqueueQueue false after PENDING write** (runtime defect) |
| null + UI open | client optimistic IN_PROGRESS (not server-authoritative) |
| terminal bypass | `force=true` on enqueue (boundary refresh) |

**FSM_COMPLETE:** NO — missing explicit graph edges for FAILED_TRANSIENT re-enqueue and worker-disabled stuck PENDING (added in review corrections).  
**FSM_CONTRADICTIONS:** 1 (initial graph omitted FAILED_TRANSIENT re-enqueue semantics)  
**FSM_MISSING_TRANSITIONS:** 3 (force re-enrich, backfill re-enqueue, stuck PENDING)

---

## 2. Ownership audit

| Claimed ATE ownership | Verdict | Evidence |
|----------------------|---------|----------|
| Post-finalize behavior orchestration | **CONFIRMED_OWNER** | orchestrator + FSM |
| trip.behavior.enrichment / hf-enrich | **CONFIRMED_OWNER** | queue-names, processor |
| behaviorEnrichmentStatus FSM | **CONFIRMED_OWNER** | orchestrator status methods |
| Hardware routing SMART5/LTE_R1 | **CONFIRMED_OWNER** | trip-behavior-enrichment.service.ts |
| Route/safety enrichment stage | **CONFIRMED_OWNER** | runRouteSafetyEnrichment |
| Misuse trigger | **CONFIRMED_OWNER** | scheduleMisuseCaseAggregation |
| Driving-impact **enqueue** (legacy queue) | **CONFIRMED_OWNER** | enqueueDrivingImpact |
| Driving-impact **scoring** | **EXTERNAL_AUTHORITY** | DrivingImpactService / DI |
| Reconciliation repair → enrichment | **SHARED_AUTHORITY** | ATE owns enqueue; TripDecisionEngine owns trip mutations |
| Scheduler liveness for reconcile | **SHARED_AUTHORITY** | ATE uses; Scaling Process owns leader algorithm |
| Mutex during reconcile | **SHARED_AUTHORITY** | ATE uses; Scaling Process owns semantics |
| DIMO budget/gateway | **EXTERNAL_AUTHORITY** | provider-budget module |
| Energy detect step 5 | **EXTERNAL_AUTHORITY** (MAY_TRIGGER only) | energy-events.service |
| DI V2 init / staged jobs | **EXTERNAL_AUTHORITY** | driving-analysis-init |
| Trip timeline UI layout | **AMBIGUOUS** | frontend spans EED/DI/ATE; not a single ATE module |
| TripPostFinalizeAnalysisProducer | **SHARED_AUTHORITY** | ATE pipeline hook; DI V2 content external |

**Initial PR defect:** `ATE-SVC-003` claimed orchestrator owns `enqueueRepairEnrichment` — **INCORRECT_OWNER** (method is private on `TripReconciliationService`). **Corrected in review.**

---

## 3. Authority firewall audit

| Boundary | Status | Notes |
|----------|--------|-------|
| KG-EED / REFUEL-RECHARGE semantics | **BOUNDARY_CORRECT** | ATE-EXT-006, MAY_TRIGGER edge, ATE-INV-EED-BOUNDARY-001 |
| Driving Intelligence scoring | **BOUNDARY_CORRECT** | ATE-INV-DI-BOUNDARY-001; dual TDI path now documented |
| Scaling Process leader/mutex/budget | **BOUNDARY_CORRECT** | external authority nodes; not algorithm owner |
| DimoSegmentsService | **BOUNDARY_CORRECT** | shared infrastructure reference |
| TripDecisionEngine | **BOUNDARY_CORRECT** | referenced, not owned |
| Battery V2 | **BOUNDARY_CORRECT** | out of scope |
| ClickHouse evidence mirror | **BOUNDARY_TOO_NARROW** initially — CH mirror used in enrichment (`TripChEvidenceMirrorCoordinator`) but adoption policy correctly OUT_OF_SCOPE |
| UI presentation | **BOUNDARY_TOO_BROAD** initially for "timeline shell" — corrected to AMBIGUOUS |

**AUTHORITY_CONFLICT_COUNT:** 0  
**BOUNDARY_DEFECT_COUNT:** 2 (fixed: timeline shell; dual TDI path gap)

---

## 4. Node audit (post-correction)

| Classification | Count (approx.) | Examples |
|----------------|----------------:|---------|
| SUPPORTED | 54 | orchestrator, processor, queues, schedulers, EED external ref |
| PARTIALLY_SUPPORTED | 5 | TripPostFinalizeAnalysisProducer (DI overlap), CH mirror usage, tripAnalysisStatus coordinator |
| STALE | 0 | — |
| DUPLICATE | 0 | — |
| MISCLASSIFIED | 1 (fixed) | enqueueRepairEnrichment on orchestrator |
| UNSUPPORTED | 0 (after fix) | — |
| MISSING_CRITICAL (added in review) | 4 | boundary refresh, mutex-disable risk, stuck PENDING, dual TDI handler |

**Final graph:** 121 nodes, 70 edges, 14 decisions, 38 evidence, 7 open questions, 9 invariants.

---

## 5. Edge audit

| Issue | Severity | Resolution |
|-------|----------|------------|
| Missing boundary-repair → refresh enrichment | Medium | Added TRIG-005 / SVC-015 edges |
| Missing backfill → orchestrator | Low | Added TRIG-004 → SVC-003 |
| ENQUEUES pointed at processor not queue | Medium | Fixed to ATE-QUE-002 |
| Dual DI/legacy driving impact parallel | Medium | Added PARALLEL_TO SVC-002 → SVC-017 |

**EDGE_CONTRADICTION_COUNT:** 1 (fixed: ENQUEUES target)

---

## 6. Decision audit

| ID | Verdict | Notes |
|----|---------|-------|
| ATE-DEC-001..012 | VERIFIED / RATIONALE_SUPPORTED | Architecture audits + code align |
| ATE-DEC-013 (EED separation) | VERIFIED | reconcile step 5 comment + boundary map |
| ATE-DEC-014 (DI separation) | PARTIALLY_SUPPORTED | Dual TDI paths complicate "supersede" story — OQ-013 added |
| ATE-DEC-011 (single orchestrator) | VERIFIED | All sync paths use runEnrichmentSync |

**DEC-013/014 were in DECISIONS.md but missing from nodes.yaml initially** — corrected.

---

## 7. Evidence audit

| Class | Count |
|-------|------:|
| PROVEN_IN_CODE | 30 |
| PROVEN_IN_TEST | 3 |
| PROVEN_IN_PRODUCTION | 2 (deploy doc, hotfix) |
| HISTORICAL_RECORD | 2 |
| NEGATIVE_RESULT | 1 (DimoSnapshot leader disproves OQ-03) |
| INFERENCE | 1 (discovery baseline) |
| UNVERIFIED | 0 promoted |

**UNSUPPORTED_FACTS_PROMOTED (initial):** 1 — orchestrator owns enqueueRepairEnrichment. **Remediated.**

---

## 8. Open questions audit

| ID | Review classification | Action |
|----|----------------------|--------|
| OQ-01 V2 supersede | STILL_OPEN | Correct |
| OQ-02 cold-tier FAILED_PERMANENT | STILL_OPEN | onEnrichmentFailure log-only |
| OQ-03 DimoSnapshot leader | RESOLVED_BY_CODE | Correctly closed |
| OQ-04 HTTP force | STILL_OPEN | force internal only |
| OQ-05 GET route read-only | RESOLVED_BY_CODE | Correctly closed (not in open nodes) |
| OQ-06 DI/behavior split | RESOLVED_BY_CODE | Correct |
| OQ-07 soak gate | REQUIRES_PRODUCTION_EVIDENCE | Correct |
| OQ-08 CH mirror adoption | OUT_OF_SCOPE | Correct |
| OQ-09 backfill limits | RESOLVED_BY_CODE | Limits exist; sufficiency open |
| OQ-10 EED schedule split | OUT_OF_SCOPE | Correct |
| OQ-11 mutex loss proof | REQUIRES_PRODUCTION_EVIDENCE | Correct |
| OQ-12 UI fallback removal | STILL_OPEN | Correct |
| **OQ-13 (new)** dual TDI paths | STILL_OPEN | Added in review |

**OPEN_QUESTIONS_REOPENED:** 0  
**False closures:** 0

---

## 9. Invariant audit

| Invariant | Enforcement | Class |
|-----------|-------------|-------|
| ATE-INV-AUTO-001 | Auto enqueue on finalize; UI fallback for backlog only | **PARTIALLY_ENFORCED** |
| ATE-INV-IDEMPOTENCY-001 | jobId + terminal guards + tx replace | **ENFORCED** (code) |
| ATE-INV-ORG-SCOPE-001 | org resolution in orchestrator/API | **ENFORCED** (code) |
| ATE-INV-LEADER-001 | shouldRun on schedulers | **ENFORCED** (code) |
| ATE-INV-MUTEX-001 | mutex execute wrapper | **PARTIALLY_ENFORCED** (config can disable) |
| ATE-INV-PROVIDER-001 | runWithDimoRequestContext | **ENFORCED** (code paths reviewed) |
| ATE-INV-TRIP-LOSS-001 | skip ≠ delete | **DOCUMENTED_INTENT** + partial code evidence |
| ATE-INV-EED-BOUNDARY-001 | step 5 isolated | **ENFORCED** (code) |
| ATE-INV-DI-BOUNDARY-001 | enqueue only | **ENFORCED** (code) |

---

## 10. Failure-mode challenge

| Scenario | KG explains? |
|----------|-------------|
| Duplicate enrichment job | Yes — jobId dedup + status guards |
| Worker crash mid-enrichment | Partial — FAILED_TRANSIENT + BullMQ retry; may leave IN_PROGRESS until retry |
| Redis unavailable (queue) | Partial — enqueue revert on exception; **stuck PENDING if workers disabled** (added FM-007) |
| DIMO unavailable | Yes — transient/permanent split |
| DIMO budget exhausted | Partial — deferral via provider infra; not fully specified in ATE graph |
| Missing hardware capability | Yes — SKIPPED + capability code |
| Stale PENDING | **Gap found** — documented in FM-007 |
| Reconciliation overlap | Yes — mutex skip; FM-009 if mutex disabled |
| Two replicas schedulers | Yes — leader guard |
| Two replicas workers | Partial — BullMQ distributes jobs; mutex/leader separate concerns |
| UI + auto overlap | Partial — terminal guards; UI only on null status |
| Driving-impact enqueue fails | Yes — stage skipped |
| EED fails after trigger | Yes — isolated try/catch in reconcile |

**RUNTIME_DEFECTS_DISCOVERED:** 1 — `canEnqueueQueue` false after PENDING write (`trip-enrichment-orchestrator.service.ts:180–189`). Documented, not fixed (out of scope).

**MULTI_REPLICA_ASSUMPTIONS_FOUND:** 3 — leader election for schedulers; mutex for reconcile (configurable); BullMQ job idempotency for enrichment.

---

## 11. Validator review

**Command:** `node architecture/knowledge-graphs/automatic-trip-enrichment/scripts/validate-graph.mjs` → **PASS**

| Dimension | Coverage |
|-----------|----------|
| **STRUCTURAL** | YAML syntax, duplicate IDs, edge refs, required fields, evidence ID format |
| **SEMANTIC** | Low — does not verify CALLS/TRIGGERS against code, FSM completeness, or ownership truth |
| **BLIND_SPOTS** | Runtime behavior, dual parallel paths, config-disabled mutex, false ownership claims, production proof strength, UI client/server FSM divergence |

---

## 12. Corrections made on PR #1484 (this review)

1. Fixed false orchestrator ownership of `enqueueRepairEnrichment`
2. Added nodes: boundary refresh, BoundaryRefreshLifecycle, dual TDI handler, failure modes (stuck PENDING, mutex disabled, UI optimistic state)
3. Added decision nodes ATE-DEC-013/014 to match DECISIONS.md
4. Expanded FSM summary on ATE-ST-001
5. Added open question OQ-013 (dual driving-impact paths)
6. Added evidence ATE-EV-0035–0038
7. Fixed ENQUEUES edge to queue not processor
8. Softened UI timeline ownership to AMBIGUOUS in AUTHORITY_BOUNDARIES.md

---

## 13. Final authority verdict

### **APPROVE_WITH_DOCUMENTED_OPEN_QUESTIONS**

**Rationale:** After independent reconstruction, the KG-ATE candidate materially agrees with the implementation for the primary automatic enrichment path, reconciliation repair chain, scheduler/mutex usage, EED firewall, and DI boundary. Initial PR contained one false ownership claim and several missing critical paths (boundary refresh, dual TDI, stuck PENDING defect). Corrections were applied during this review. Remaining gaps are honestly classified as open questions or runtime defects, not promoted as facts.

**Not approved as merge-to-main without human review** of corrections commit on PR #1484.

**Blockers for full canonical authority maturity (non-merge):**
- OQ-01, OQ-13 dual-path convergence
- OQ-07 production soak gate evidence
- OQ-11 formal trip-loss proof under mutex skip
- Runtime defect FM-007 (workers-disabled stuck PENDING) — document only until runtime fix

---

## Changes / Architektur

- **Changes:** This review record added
- **Architektur:** KG-ATE authority gate review recorded; graph corrections applied on PR branch
