# TDL-OQ-010 — Dead / legacy / duplicate trip runtime path inventory (read-only audit)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ010-LEGACY-INV-001 |
| **Observed at (UTC)** | `2026-09-26` |
| **Repository baseline** | `origin/main` @ `79102e516eeaa4617d98a8437a28f3f681d99716` |
| **Production baseline** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `20260925182907_v4994` |
| **Audit mode** | READ_ONLY |
| **Verdict** | **`RESOLVED_WITH_BOUNDED_DEBT`** |

## Executive summary

Current `main` and Production @ `8a1d9c658…` run a **single canonical trip lifecycle authority** (`TripDecisionEngine` for `vehicleTrip.create` / `tripStatus`). Post-finalize work uses **two intentionally parallel analysis stacks**:

1. **Driving Intelligence V2** — durable `DrivingAnalysisRun` + `driving.intelligence.jobs` stage graph (`TripPostFinalizeAnalysisProducer` → `DrivingAnalysisInitService`).
2. **Legacy HF behavior stack** — `trip.behavior.enrichment` + `trip.driving-impact.compute` (`TripEnrichmentOrchestratorService`), explicitly retained until V2 fully subsumes HF (see producer comment).

**Bounded debt (not runtime defects):** duplicate **route provider fetch** and **driving-impact compute** can occur on the same COMPLETED trip (idempotent / safe writes). **`TripEnrichmentOrchestratorService` header over-claims** global canonicality vs V2. **`FmmRouteMatcherService`** and **`ROUTE_MAP_MATCHER` port** have **no productive consumers** — scaffold / compatibility registration only.

Pre-V2 **segment detectors** (`IgnitionSegmentDetector`, `MotionSegmentDetector`, `ActivityWindowDetector`) remain **ACTIVE_REPAIR** (reconciliation + overlap), not dead legacy.

---

## Classification legend

Each path has one **primary** class: `ACTIVE_CANONICAL` | `ACTIVE_COMPATIBILITY` | `ACTIVE_RECOVERY` | `ACTIVE_REPAIR` | `ACTIVE_SHADOW` | `ACTIVE_DUPLICATE` | `SCAFFOLD_NOT_RUNTIME` | `TEST_ONLY` | `DEAD_NO_PRODUCTIVE_CALLSITE` | `SUPERSEDED_BUT_RETAINED`.

Cross-flags: `CAN_WRITE_CANONICAL_TRIP`, `CAN_WRITE_TRIP_ANALYSIS`, `CAN_CALL_PROVIDER`, `PRODUCTION_EXECUTION`.

---

## Phase 2 — Canonical trip writers

**Authority:** `backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts` + `trip-decision.engine.ts`.

| Writer surface | Creates trip | Changes `tripStatus` | Class | Notes |
|----------------|-------------|----------------------|-------|-------|
| `TripDecisionEngine` | **YES** (sole) | **YES** (sole) | ACTIVE_CANONICAL | `createTrip`, `createRepairedTrip`, `finalizeTrip`, `discardTrip`, `reopenTripForMerge`, split/repair finalize |
| `TripDetectionOrchestrationService` | NO | NO | ACTIVE_CANONICAL | ONGOING metrics / waypoints / tracking runs — enrichment fields only |
| `TripReconciliationService` | NO | NO | ACTIVE_REPAIR | Routes lifecycle via `TripDecisionEngine`; meta `rawDetectionMeta` |
| Enrichment stack (`TripEnrichmentOrchestratorService`, `TripBehaviorEnrichmentService`, `TripsService`, `LteR1BehaviorEnrichmentService`) | NO | NO | ACTIVE_COMPATIBILITY / ACTIVE_DUPLICATE | `behaviorEnrichmentStatus`, counts, geo shares — not lifecycle |
| `TripAnalysisCoordinatorService` | NO | NO | ACTIVE_COMPATIBILITY | Legacy `tripAnalysisStatus` coordination |
| `DrivingImpactService` | NO | NO | ACTIVE_DUPLICATE | Impact fields + `drivingImpactComputedAt` via orchestrator |
| `TripAssignmentService`, `BoundaryRefreshLifecycleService`, `TireTripUsageService`, `DriverAttributionService` | NO | NO | ACTIVE_CANONICAL (metadata) | Assignment / refresh meta / tire ledger — not boundary authority |

**`VEHICLE_TRIP_PRODUCTIVE_WRITER_COUNT=12`** (decision engine + orchestration + enrichment + analysis coordinator + impact + assignment + boundary refresh + tire usage + driver attribution + reconciliation meta + trips route enrich + lte-r1).

**`DIRECT_NON_DECISION_ENGINE_LIFECYCLE_WRITERS=0`** — repository grep: `tripStatus` in `vehicleTrip.update` **data** appears only in `trip-decision.engine.ts` (production code).

---

## Phase 3 — Pre-V2 segmentation

| Path | USED_FOR_LIVE_FSM | USED_FOR_REPAIR | CAN_DIRECTLY_CREATE_TRIP | CAN_DIRECTLY_CHANGE_BOUNDARY | DECISION_ENGINE_REQUIRED | Class |
|------|-------------------|-----------------|--------------------------|------------------------------|--------------------------|-------|
| Live FSM detectors (speed/ignition/CUSUM/…) | YES | — | NO | NO | YES for commits | ACTIVE_CANONICAL |
| `IgnitionSegmentDetector` | NO (not in default live start policy alone) | YES | NO | NO | YES when repair applies | **ACTIVE_REPAIR** |
| `MotionSegmentDetector` | Partial (EV end assist / policy) | YES | NO | NO | YES | **ACTIVE_REPAIR** |
| `ActivityWindowDetector` | Corroboration in policy | YES | NO | NO | YES | **ACTIVE_REPAIR** |
| `TripReconciliationService` + DIMO segments | NO live override | YES | NO | NO | **YES** | **ACTIVE_REPAIR** |
| `TripCoverage` / overlap utils | — | YES | NO | NO | YES | ACTIVE_REPAIR |

**`PRE_V2_SEGMENTATION_RUNTIME_ACTIVE=YES`** (repair/reconciliation, not parallel live trip engine).

---

## Phase 4 — Route matchers

| Component | Registered | Productive callsite | Class | Production |
|-----------|------------|---------------------|-------|------------|
| `TripRouteChunkedMatcherService` | YES | `TripRouteArtifactMaterializerService` → `TripsService.enrichTrip` / DI `DRIVING_ROUTE_ENRICH` | ACTIVE_CANONICAL | **YES** — DI jobs 124/7d |
| `MapboxService.mapMatchRoute` | YES | Used **via chunked matcher**, not legacy port | ACTIVE_CANONICAL | YES |
| `MapboxRouteMatcherService` | YES (`ROUTE_MAP_MATCHER`) | **No `@Inject(ROUTE_MAP_MATCHER)` consumers** in repo | DEAD_NO_PRODUCTIVE_CALLSITE | NOT_OBSERVABLE |
| `FmmRouteMatcherService` | YES | `matchRoute` returns **null** | SCAFFOLD_NOT_RUNTIME | NO |

**`FMM_RUNTIME_ACTIVE=NO`**

**`LEGACY_MAPBOX_MATCHER_RUNTIME_ACTIVE=NO`** (global ≤100 stride port unused; chunked matcher is canonical)

**`ROUTE_MAP_MATCHER_PORT_PRODUCTIVE_CONSUMERS=0`**

**`CAN_LEGACY_MATCHER_WRITE_ROUTE_ARTIFACT=NO`** (never invoked)

---

## Phase 5–6 — Enrichment / analysis pipelines

### Post-finalize fan-out (live FSM finalize)

`TripDetectionOrchestrationService` after persisted COMPLETED:

1. `TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion` → **DI V2** (`DrivingAnalysisInitService.initializeForCompletedTrip` → stage jobs).
2. `TripEnrichmentOrchestratorService.enqueueBehaviorEnrichment` → **`trip.behavior.enrichment`** queue.

Same pattern on repair finalize paths in `TripReconciliationService`.

### Pipeline A — Legacy HF + coordinator

| Step | Trigger | Queue | Stable jobId | DB / provider |
|------|---------|-------|--------------|---------------|
| HF behavior | finalize / repair / manual / backfill | `trip.behavior.enrichment` | `hf-enrich-{tripId}` | DIMO HF signals → `TripBehaviorEvent`; status fields |
| Route safety | after HF success in orchestrator | inline in worker | — | `TripsService.enrichTrip` → DIMO segments + Mapbox chunked match |
| Driving impact V1 | after HF | `trip.driving-impact.compute` | `driving-impact-{tripId}` | `DrivingImpactService` |
| Misuse | orchestrator schedule | inline | — | `MisuseCaseAggregatorService` |
| Analysis coordinator | throughout | — | — | legacy `tripAnalysisStatus` stages |

### Pipeline B — Driving Intelligence V2

| Stage key | Job type | Handler entry | Overlap with A |
|-----------|----------|---------------|----------------|
| `ROUTE` | `DRIVING_ROUTE_ENRICH` | `DrivingRouteEnrichJobHandler` → **`TripsService.enrichTrip`** | **YES** — same method as orchestrator route step |
| `NATIVE_EVENTS` | `DRIVING_NATIVE_EVENTS_INGEST` | `LteR1BehaviorEnrichmentService.enrichTrip` | Complements HF (LTE_R1 native events) |
| `DRIVING_IMPACT` | `DRIVING_IMPACT_COMPUTE` | `DrivingImpactComputeJobHandler` → **`DrivingImpactService`** | **YES** — same service as legacy queue processor |
| Other stages | MISUSE, ASSESSABILITY, ATTRIBUTION, … | DI handlers | Partial overlap with coordinator/misuse paths |

**Production @ 7d (read-only SQL):** `driving_intelligence_jobs` — e.g. `DRIVING_ROUTE_ENRICH` **124**, `DRIVING_NATIVE_EVENTS_INGEST` **124**, `DRIVING_IMPACT_COMPUTE` **124**; `driving_analysis_runs` **233**; COMPLETED trips **109** with `behaviorEnrichmentStatus=COMPLETED` **109**.

**`TRIP_ENRICHMENT_ORCHESTRATOR_RUNTIME_ACTIVE=YES`**

**`DRIVING_INTELLIGENCE_V2_RUNTIME_ACTIVE=YES`**

**`ROUTE_ENRICHMENT_ENTRYPOINT_COUNT=3`** — (1) orchestrator post-HF, (2) DI `DRIVING_ROUTE_ENRICH`, (3) manual HTTP `POST …/enrich` → `TripsService.enrichTrip`.

**`CAN_SAME_TRIP_ROUTE_ENRICH_RUN_FROM_MULTIPLE_PIPELINES=YES`**

**`DUPLICATE_PROVIDER_FETCH_POSSIBLE=YES`** (segment fetch + Mapbox match may run twice close together)

**`DUPLICATE_ROUTE_ARTIFACT_WRITE_SAFE=YES`** — `TripRouteArtifactMaterializerService` fingerprint → action **`UNCHANGED`** when inputs match; waypoints use replace-by-trip patterns.

**Duplicate write safety (Phase 12):** route pair → **`DUPLICATE_EXECUTION_WASTEFUL_BUT_SAFE`**; driving impact dual path → **`DUPLICATE_EXECUTION_SAFE`** (compute idempotent per trip); HF vs native events → **`COMPLEMENTARY`** (different sources).

---

## Phase 7 — Behavior vs DI

| Output | Legacy HF stack | DI V2 | Relation |
|--------|-----------------|-------|----------|
| `TripBehaviorEvent` | HF enrichment | — | **LEGACY_ONLY** (HF path) |
| `DrivingEvent` (native) | LTE_R1 helper in HF | `DRIVING_NATIVE_EVENTS_INGEST` | **SHARED / COMPLEMENTARY** |
| `behaviorEnrichmentStatus` | orchestrator | read by DI init fingerprint | **SHARED** |
| `DrivingAnalysisRun` / stages | — | DI init | **V2_ONLY** |
| Driving impact fields | legacy queue + DI stage | both call same service | **DUPLICATED** (safe) |
| Misuse aggregation | orchestrator + DI stage | overlap | **COMPLEMENTARY** (coordinator + DI) |

**`BEHAVIOR_ENRICHMENT_AND_DI_RELATION=COMPLEMENTARY_WITH_INTENTIONAL_LEGACY_HF_PARALLEL_AND_BOUNDED_DUPLICATE_ROUTE_IMPACT`**

---

## Phase 8 — Manual / backfill

| Entry | Path | Bypass orchestrator? |
|-------|------|----------------------|
| `POST …/behavior-enrich` | `enrichmentOrchestrator.runEnrichmentSync` | **NO** |
| `backfillUnenrichedTrips` | orchestrator `enqueueBehaviorEnrichment` | **NO** |
| `POST …/enrich` (route) | `TripsService.enrichTrip` direct | **Partial** — route-only, not full HF pipeline |
| Platform admin / reconciliation repair | orchestrator + post-finalize producer | **NO** |
| `DrivingAnalysisReconciliationService` | DI init retry | **NO** (V2 canonical) |

**`MANUAL_PATH_BYPASSES_CANONICAL_ORCHESTRATOR=NO`** (behavior manual uses orchestrator; route manual bypasses HF only by design)

**`BACKFILL_PATH_BYPASSES_CANONICAL_ORCHESTRATOR=NO`**

---

## Phase 9 — Trip-related queues (inventory)

| QUEUE_NAME | Producer (representative) | Consumer | Purpose | Class | Stable jobId | Prod 7d / 30d |
|------------|---------------------------|----------|---------|-------|--------------|---------------|
| `dimo.snapshot.poll` | snapshot coordinator / scheduler | `DimoSnapshotProcessor` | Canonical telemetry + FSM tick | ACTIVE_CANONICAL | `snapshot-{vehicleId}` | NOT_OBSERVABLE (Redis) / ACTIVE |
| `snapshot.wake.handoff` | wake coordinator | handoff processor | R9 successor dispatch | ACTIVE_CANONICAL | `wake-handoff-{vehicleId}` | ACTIVE |
| `dimo.trip-tracking` | orchestration | `TripTrackingProcessor` | ACTIVE_TRIP continuity | ACTIVE_CANONICAL | per vehicle/tick | ACTIVE |
| `trip.behavior.enrichment` | orchestrator | `TripBehaviorEnrichmentProcessor` | HF behavior pipeline | ACTIVE_DUPLICATE | `hf-enrich-{tripId}` | ACTIVE (109 trips enriched / 7d) |
| `trip.driving-impact.compute` | orchestrator | `DrivingImpactProcessor` | Impact V1 queue | ACTIVE_DUPLICATE | `driving-impact-{tripId}` | ACTIVE |
| `driving.intelligence.jobs` | DI dispatcher | `DrivingIntelligenceJobProcessor` | V2 stage graph | ACTIVE_CANONICAL | idempotency keys | **124+ / trip stage / 7d** |
| `dimo.trip-tracking` recovery | `TripTrackingRecoveryScheduler` | same | ACTIVE_RECOVERY | — | — | rare |
| Trip analysis recovery | `TripAnalysisRecoveryScheduler` | orchestrator | ACTIVE_RECOVERY | — | — | rare |

(Non-trip queues omitted — DIMO DTC, connectivity, battery, etc.)

---

## Phase 13 — Stale comments

| Location | Claim | Audit |
|----------|-------|-------|
| `TripEnrichmentOrchestratorService` header | “Single canonical entry point for **all** trip behavior enrichment” | **COMMENT_STALE_SCOPE** — true for **legacy HF queue**; **false globally** once DI V2 native events / stages run in parallel |
| `TripPostFinalizeAnalysisProducer` | “Legacy enrichment queues remain separate until fully replaced” | **CURRENT_CORRECT** |
| `MapboxRouteMatcherService` | deprecated; chunked matcher canonical | **CURRENT_CORRECT** |
| `FmmRouteMatcherService` | scaffold, returns null | **CURRENT_CORRECT** |

Docs-only note in this PR; **no runtime comment edits** requested beyond authority cross-ref.

---

## Phase 14 — Removal candidate matrix (excerpt)

| PATH | CLASS | WHY_RETAINED | SAFE_TO_REMOVE_NOW | REMOVAL_PREREQ | RISK |
|------|-------|--------------|--------------------|----------------|------|
| `FmmRouteMatcherService` | SCAFFOLD_NOT_RUNTIME | Future FMM | **SAFE_RUNTIME_REMOVAL_FOLLOWUP** | Product decision + delete Nest provider | Low |
| `ROUTE_MAP_MATCHER` + `MapboxRouteMatcherService` | DEAD_NO_PRODUCTIVE_CALLSITE | Port compat | **SAFE_RUNTIME_REMOVAL_FOLLOWUP** | Confirm zero external inject | Low |
| `trip.behavior.enrichment` stack | ACTIVE_DUPLICATE | HF not fully in DI stages | **REQUIRES_MIGRATION** | V2 absorbs HF + coordinator retired | Medium — fleet analytics |
| Legacy `trip.driving-impact.compute` | ACTIVE_DUPLICATE | Chained after HF | **REQUIRES_MIGRATION** | DI-only impact stage proven | Medium |
| Orchestrator `runRouteSafetyEnrichment` | ACTIVE_DUPLICATE | Post-HF route | **REQUIRES_MIGRATION** | DI ROUTE-only after HF deprecation | Wasteful provider fetch today |
| Segment detectors | ACTIVE_REPAIR | Reconciliation evidence | **MUST_RETAIN** | Repair architecture replacement | High |
| `TripDecisionEngine` | ACTIVE_CANONICAL | Lifecycle authority | **MUST_RETAIN** | — | — |
| DI V2 job graph | ACTIVE_CANONICAL | Durable analysis | **MUST_RETAIN** | — | — |

**`SAFE_RUNTIME_REMOVAL_CANDIDATE_COUNT=2`** (FMM + unused Mapbox port)

**`REQUIRES_MIGRATION_CANDIDATE_COUNT=3`** (legacy HF queue, legacy impact queue, orchestrator route hook consolidation)

**`MUST_RETAIN_COUNT=6+`** (decision engine, live FSM, DI V2, reconciliation, segment repair detectors, trip tracking)

---

## Phase 16 — Defect test

No evidence of **conflicting lifecycle writers**, **non-idempotent corrupting duplicates**, or **TripDecisionEngine bypass** on boundaries.

**`NEW_RUNTIME_DEFECT_FOUND=NO`**

Architectural debt: **parallel post-finalize pipelines** with **wasteful but safe** duplicate route/impact work — tracked as bounded debt, not defect.

---

## Phase 17 — Closure

**`OQ010_STATUS_AFTER=CLOSED`**

**`TDL_OQ_010_AUDIT_RESULT=RESOLVED_WITH_BOUNDED_DEBT`**

**BLOCKERS=NONE**

**NEXT_ACTION=** Optional follow-up PRs: remove FMM/unused Mapbox port; consolidate route enrich to DI-only; migrate HF queue into V2 stages; refresh orchestrator header comment in code when migration lands.

---

## Required output (OQ-010 closure gate)

| Field | Value |
|-------|-------|
| **TDL_OQ_010_AUDIT_RESULT** | **`RESOLVED_WITH_BOUNDED_DEBT`** |
| **STARTING_MAIN_SHA** | `79102e516eeaa4617d98a8437a28f3f681d99716` |
| **FINAL_HEAD_SHA** | `c0e8f6f1a` *(full: `c0e8f6f1a` — see branch head at PR open)* |
| **LIVE_PRODUCTION_SHA** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` |
| **LIVE_RELEASE_ID** | `20260925182907_v4994` |
| **PRODUCTIVE_TRIP_RUNTIME_PATH_COUNT** | **41** (inventoried lifecycle, segmentation-repair, enrichment, route, queue, HTTP, recovery entrypoints — excludes test-only and zero-callsite scaffold) |
| **DEAD_NO_PRODUCTIVE_CALLSITE_COUNT** | **1** (`MapboxRouteMatcherService` / `ROUTE_MAP_MATCHER` port) |
| **ACTIVE_COMPATIBILITY_COUNT** | **4** (`TripAnalysisCoordinatorService`, legacy analysis status, HF stack status fields, manual route-only HTTP enrich partial path) |
| **ACTIVE_RECOVERY_COUNT** | **2** (`TripTrackingRecoveryScheduler`, `TripAnalysisRecoveryScheduler`) |
| **ACTIVE_REPAIR_COUNT** | **6** (ignition/motion/activity segment detectors, reconciliation + DIMO segments, trip coverage/overlap) |
| **ACTIVE_DUPLICATE_COUNT** | **5** (HF behavior queue, legacy impact queue, orchestrator post-HF route, DI ROUTE stage, DI impact stage) |
| **SCAFFOLD_NOT_RUNTIME_COUNT** | **1** (`FmmRouteMatcherService`) |
| **VEHICLE_TRIP_PRODUCTIVE_WRITER_COUNT** | **12** |
| **DIRECT_NON_DECISION_ENGINE_LIFECYCLE_WRITERS** | **0** |
| **FMM_RUNTIME_ACTIVE** | **NO** |
| **LEGACY_MAPBOX_MATCHER_RUNTIME_ACTIVE** | **NO** |
| **ROUTE_MAP_MATCHER_PORT_PRODUCTIVE_CONSUMERS** | **0** |
| **TRIP_ENRICHMENT_ORCHESTRATOR_RUNTIME_ACTIVE** | **YES** |
| **DRIVING_INTELLIGENCE_V2_RUNTIME_ACTIVE** | **YES** |
| **ROUTE_ENRICHMENT_ENTRYPOINT_COUNT** | **3** |
| **CAN_SAME_TRIP_ROUTE_ENRICH_RUN_FROM_MULTIPLE_PIPELINES** | **YES** |
| **DUPLICATE_PROVIDER_FETCH_POSSIBLE** | **YES** |
| **DUPLICATE_ROUTE_ARTIFACT_WRITE_SAFE** | **YES** |
| **BEHAVIOR_ENRICHMENT_AND_DI_RELATION** | **COMPLEMENTARY_WITH_INTENTIONAL_LEGACY_HF_PARALLEL_AND_BOUNDED_DUPLICATE_ROUTE_IMPACT** |
| **MANUAL_PATH_BYPASSES_CANONICAL_ORCHESTRATOR** | **NO** |
| **BACKFILL_PATH_BYPASSES_CANONICAL_ORCHESTRATOR** | **NO** |
| **PRE_V2_SEGMENTATION_RUNTIME_ACTIVE** | **YES** (repair/reconciliation) |
| **IGNITION_SEGMENT_DETECTOR_CLASSIFICATION** | **ACTIVE_REPAIR** |
| **MOTION_SEGMENT_DETECTOR_CLASSIFICATION** | **ACTIVE_REPAIR** |
| **DIMO_SEGMENT_RECONCILIATION_CLASSIFICATION** | **ACTIVE_REPAIR** |
| **SAFE_RUNTIME_REMOVAL_CANDIDATE_COUNT** | **2** |
| **REQUIRES_MIGRATION_CANDIDATE_COUNT** | **3** |
| **MUST_RETAIN_COUNT** | **6+** |
| **NEW_RUNTIME_DEFECT_FOUND** | **NO** |
| **DEFECT_CLASS** | *(n/a)* |
| **OQ010_STATUS_AFTER** | **CLOSED** |
| **RUNTIME_FILES_CHANGED** | **NO** |
| **FRONTEND_FILES_CHANGED** | **NO** *(authority PR; optional SynqDrive Code entry only)* |
| **PRISMA_CHANGED** | **NO** |
| **PRODUCTION_MUTATED** | **NO** |
| **ENV_MUTATED** | **NO** |
| **DEPLOY_EXECUTED** | **NO** |
