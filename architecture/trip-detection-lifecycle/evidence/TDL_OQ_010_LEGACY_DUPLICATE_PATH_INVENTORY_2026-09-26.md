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

**Bounded debt (not runtime defects):** duplicate **route provider fetch** and **driving-impact compute** can occur on the same COMPLETED trip (bounded write safety — see Phase 6). **`TripEnrichmentOrchestratorService` header over-claims** global canonicality vs V2. **Legacy route stack** (`ROUTE_MAP_MATCHER`, `MapboxRouteMatcherService`, `MapboxService.mapMatchRoute`) has **no productive reachability**; **FMM** remains scaffold-only.

**Canonical Route V2 chain (Production):** `TripRouteChunkedMatcherService` → `MapboxChunkMatchingClientService.matchChunk` → `MapboxService.matchMapboxChunkDetailed`. **`MapboxService`** (service class) stays **ACTIVE_CANONICAL** for chunk matching and speeding analysis; only **`mapMatchRoute()`** is legacy-dead.

Pre-V2 **segment detectors** (`IgnitionSegmentDetector`, `MotionSegmentDetector`, `ActivityWindowDetector`) remain **ACTIVE_REPAIR** (reconciliation + overlap), not dead legacy.

---

## Classification legend

Each path has one **primary** class: `ACTIVE_CANONICAL` | `ACTIVE_COMPATIBILITY` | `ACTIVE_RECOVERY` | `ACTIVE_REPAIR` | `ACTIVE_SHADOW` | `ACTIVE_DUPLICATE` | `SCAFFOLD_NOT_RUNTIME` | `TEST_ONLY` | `DEAD_NO_PRODUCTIVE_CALLSITE` | `SUPERSEDED_BUT_RETAINED`.

Cross-flags: `CAN_WRITE_CANONICAL_TRIP`, `CAN_WRITE_TRIP_ANALYSIS`, `CAN_CALL_PROVIDER`, `PRODUCTION_EXECUTION`.

---

## Phase 1 — Productive runtime path matrix (auditable count)

**Scope:** one row per **productive** trip lifecycle / enrichment / route / queue / HTTP / recovery entrypoint on repository baseline @ `79102e516…`. Excludes `TEST_ONLY`, `DEAD_NO_PRODUCTIVE_CALLSITE`, `SCAFFOLD_NOT_RUNTIME` (listed in [Non-productive appendix](#non-productive-appendix-dead--scaffold)).

**Callsite proof — `MapboxService.mapMatchRoute`:** repository-wide grep shows **definition** in `mapbox.service.ts` and **sole call** in `mapbox-route-matcher.service.ts` → `MapboxRouteMatcherService.matchRoute` → port `ROUTE_MAP_MATCHER`. **No `@Inject(ROUTE_MAP_MATCHER)`** consumer in repo. **Not** invoked by `TripRouteChunkedMatcherService` / `MapboxChunkMatchingClientService` (those use **`matchMapboxChunkDetailed`**).

| ID | PATH / ENTRYPOINT | TRIGGER | PRIMARY_CLASSIFICATION | PRODUCTIVE_CALLSITE | CAN_WRITE_CANONICAL_TRIP | CAN_WRITE_TRIP_ANALYSIS | CAN_CALL_PROVIDER | PRODUCTION_EXECUTION | NOTES |
|----|-------------------|---------|------------------------|---------------------|--------------------------|-------------------------|-------------------|----------------------|-------|
| P001 | `DimoSnapshotProcessor` → `TripDetectionOrchestrationService` FSM tick | `dimo.snapshot.poll` job | ACTIVE_CANONICAL | `dimo-snapshot.processor.ts` | NO | NO | YES | YES | Live trip detection ingress |
| P002 | `SnapshotWakeHandoffProcessor` (R9 successor dispatch) | `snapshot.wake.handoff` | ACTIVE_CANONICAL | wake handoff processor | NO | NO | YES | YES | Coalesced canonical snapshot fetch |
| P003 | `TripTrackingProcessor` ACTIVE_TRIP continuity | `dimo.trip-tracking` | ACTIVE_CANONICAL | `trip-tracking.processor.ts` | NO | NO | YES | YES | End validation / finalize jobs |
| P004 | `TripDecisionEngine` lifecycle commits | FSM / repair via orchestration | ACTIVE_CANONICAL | `trip-decision.engine.ts` | **YES** | NO | NO | YES | Sole `tripStatus` / create authority |
| P005 | `TripDetectionOrchestrationService` ongoing trip writes | ACTIVE_TRIP ticks | ACTIVE_CANONICAL | `trip-detection-orchestration.service.ts` | NO | NO | YES | YES | Metrics / waypoints / tracking runs |
| P006 | Live FSM detector policy bundle (speed / ignition / CUSUM / …) | `processActiveTick` | ACTIVE_CANONICAL | policy + detectors under `trips/` | NO | NO | NO | YES | Read-only detectors; commits via P004 |
| P007 | `TripPostFinalizeAnalysisProducer` → DI V2 init | COMPLETED persist (FSM + repair) | ACTIVE_CANONICAL | `trip-post-finalize-analysis.producer.ts` | NO | YES | NO | YES | `DrivingAnalysisInitService` |
| P008 | `TripEnrichmentOrchestratorService.enqueueBehaviorEnrichment` | COMPLETED persist / repair / backfill | ACTIVE_DUPLICATE | `trip-enrichment-orchestrator.service.ts` | NO | YES | NO | YES | Legacy HF queue fan-out ∥ DI |
| P009 | `TripBehaviorEnrichmentProcessor` → orchestrator HF pipeline | `trip.behavior.enrichment` | ACTIVE_DUPLICATE | `trip-behavior-enrichment.processor.ts` | NO | YES | YES | YES | Stable jobId `hf-enrich-{tripId}` |
| P010 | Orchestrator `runRouteSafetyEnrichment` → `TripsService.enrichTrip` | After HF success in worker | ACTIVE_DUPLICATE | `trip-enrichment-orchestrator.service.ts` | NO | YES | YES | YES | Route enrich entry **1/3** |
| P011 | `DrivingImpactProcessor` → `DrivingImpactService` | `trip.driving-impact.compute` | ACTIVE_DUPLICATE | `driving-impact.processor.ts` | NO | YES | NO | YES | Legacy impact queue ∥ DI impact stage |
| P012 | `TripAnalysisCoordinatorService` legacy analysis stages | HF / route / impact coordination | ACTIVE_COMPATIBILITY | `trip-analysis-coordinator.service.ts` | NO | YES | NO | YES | `tripAnalysisStatus` |
| P013 | `DrivingAnalysisInitService.initializeForCompletedTrip` | Post-finalize producer | ACTIVE_CANONICAL | `driving-analysis-init.service.ts` | NO | YES | NO | YES | Durable `DrivingAnalysisRun` |
| P014 | DI `DRIVING_ROUTE_ENRICH` → `TripsService.enrichTrip` | `driving.intelligence.jobs` | ACTIVE_DUPLICATE | `driving-route-enrich.handler.ts` | NO | YES | YES | YES | Route enrich entry **2/3**; ~124 jobs / 7d |
| P015 | DI `DRIVING_NATIVE_EVENTS_INGEST` → `LteR1BehaviorEnrichmentService` | DI stage job | ACTIVE_CANONICAL | `driving-native-events-ingest.handler.ts` | NO | YES | YES | YES | Complements HF native events |
| P016 | DI `DRIVING_IMPACT_COMPUTE` → `DrivingImpactService` | DI stage job | ACTIVE_DUPLICATE | `driving-impact-compute.handler.ts` | NO | YES | NO | YES | Overlaps P011 |
| P017 | DI `DRIVING_MISUSE_RECONCILE` | DI stage job | ACTIVE_COMPATIBILITY | misuse reconcile handler | NO | YES | NO | YES | Overlaps orchestrator misuse |
| P018 | DI `DRIVING_ASSESSABILITY_COMPUTE` | DI stage job | ACTIVE_CANONICAL | assessability handler | NO | YES | NO | YES | |
| P019 | DI `DRIVING_ATTRIBUTION_RESOLVE` | DI stage job | ACTIVE_CANONICAL | attribution handler | NO | YES | NO | YES | |
| P020 | DI `DRIVING_DECISION_SUMMARY_COMPUTE` | DI stage job | ACTIVE_CANONICAL | decision summary handler | NO | YES | NO | YES | |
| P021 | DI `DRIVING_HEALTH_IMPACT_PUBLISH` | DI stage job | ACTIVE_CANONICAL | health impact publish handler | NO | YES | NO | YES | |
| P022 | DI `DRIVING_EVENT_CONTEXT_ENRICH` | DI stage job | ACTIVE_CANONICAL | event context handler | NO | YES | NO | YES | |
| P023 | DI `RENTAL_DRIVING_ANALYSIS_RECOMPUTE` | DI stage job | ACTIVE_CANONICAL | rental recompute handler | NO | YES | NO | UNKNOWN | Rental-scoped |
| P024 | `TripReconciliationService` repair window execution | Scheduler / manual / event tiers | ACTIVE_REPAIR | `trip-reconciliation.service.ts` | NO | NO | YES | YES | Routes lifecycle via P004 |
| P025 | `IgnitionSegmentDetector` | Reconciliation / overlap evidence | ACTIVE_REPAIR | `detector.registry.ts` | NO | NO | NO | YES | Not standalone live trip engine |
| P026 | `MotionSegmentDetector` | Reconciliation / EV assist evidence | ACTIVE_REPAIR | detector registry | NO | NO | NO | YES | |
| P027 | `ActivityWindowDetector` | Reconciliation corroboration | ACTIVE_REPAIR | detector registry | NO | NO | NO | YES | |
| P028 | `TripCoverage` / overlap utils | Repair scans | ACTIVE_REPAIR | `trip-coverage.util.ts` | NO | NO | NO | YES | |
| P029 | DIMO segment fetch in reconciliation repair | Repair apply paths | ACTIVE_REPAIR | reconciliation + `DimoSegmentsService` | NO | NO | YES | YES | Evidence for repair only |
| P030 | `TripAssignmentService` trip metadata | Post-finalize / assignment | ACTIVE_CANONICAL | assignment service | NO | NO | NO | YES | Not boundary authority |
| P031 | `BoundaryRefreshLifecycleService` | Boundary refresh meta | ACTIVE_CANONICAL | boundary refresh service | NO | NO | NO | YES | |
| P032 | `TireTripUsageService` | Trip tire ledger | ACTIVE_CANONICAL | tire usage service | NO | NO | NO | YES | |
| P033 | `DriverAttributionService` | Trip attribution fields | ACTIVE_CANONICAL | driver attribution | NO | YES | NO | YES | |
| P034 | `POST …/trips/:tripId/enrich` → `TripsService.enrichTrip` | Manual HTTP | ACTIVE_COMPATIBILITY | `vehicle-intelligence.controller.ts` | NO | YES | YES | YES | Route-only; bypasses HF orchestrator **by design** |
| P035 | `POST …/trips/:tripId/behavior-enrich` → `runEnrichmentSync` | Manual HTTP | ACTIVE_COMPATIBILITY | controller → orchestrator | NO | YES | YES | YES | Uses HF orchestrator |
| P036 | `backfillUnenrichedTrips` | Admin / script entry | ACTIVE_COMPATIBILITY | orchestrator backfill | NO | YES | NO | YES | Enqueues P008 |
| P037 | `TripTrackingRecoveryScheduler` | Recovery tick | ACTIVE_RECOVERY | tracking recovery scheduler | NO | NO | NO | UNKNOWN | Rare |
| P038 | `TripAnalysisRecoveryScheduler` | Analysis recovery | ACTIVE_RECOVERY | analysis recovery scheduler | NO | YES | NO | UNKNOWN | Rare |
| P039 | `DrivingAnalysisReconciliationService` DI retry | Reconciliation / ops | ACTIVE_CANONICAL | DI reconciliation service | NO | YES | NO | YES | V2 canonical retry |
| P040 | `MisuseCaseAggregatorService` via orchestrator | Post-HF inline | ACTIVE_COMPATIBILITY | orchestrator schedule | NO | YES | NO | YES | Overlaps DI misuse stage |
| P041 | `LteR1BehaviorEnrichmentService.enrichTrip` (HF pipeline branch) | HF enrichment + DI native overlap | ACTIVE_CANONICAL | `lte-r1-behavior-enrichment.service.ts` | NO | YES | YES | YES | Invoked from P009 / P015 |

### Category counts (derived from matrix — not hand-entered)

| Metric | Count | Matrix IDs |
|--------|------:|------------|
| **`PRODUCTIVE_TRIP_RUNTIME_PATH_COUNT`** | **41** | P001–P041 |
| ACTIVE_CANONICAL | 21 | P001–P007, P013, P015, P018–P023, P030–P033, P039, P041 |
| ACTIVE_DUPLICATE | 6 | P008–P011, P014, P016 |
| ACTIVE_COMPATIBILITY | 6 | P012, P017, P034–P036, P040 |
| ACTIVE_REPAIR | 6 | P024–P029 |
| ACTIVE_RECOVERY | 2 | P037–P038 |
| ACTIVE_SHADOW | 0 | *(FSM shadow observability only — not a separate productive trip processing path in this inventory)* |

### Non-productive appendix (dead / scaffold — excluded from productive count)

| Component | CLASS | Reachability |
|-----------|-------|--------------|
| `FmmRouteMatcherService` | SCAFFOLD_NOT_RUNTIME | Registered; `matchRoute` returns null |
| `MapboxRouteMatcherService` + `ROUTE_MAP_MATCHER` | DEAD_NO_PRODUCTIVE_CALLSITE | No inject consumer |
| `MapboxService.mapMatchRoute()` | DEAD_NO_PRODUCTIVE_CALLSITE | Only called from dead matcher; legacy ≤100 stride global matcher |

**`MAPBOX_MAP_MATCH_ROUTE_CLASSIFICATION=DEAD_NO_PRODUCTIVE_CALLSITE`**

**`MAPBOX_CANONICAL_METHOD=matchMapboxChunkDetailed`** (via `MapboxChunkMatchingClientService.matchChunk`)

**`DEAD_NO_PRODUCTIVE_CALLSITE_COUNT=2`** (legacy matcher **service path** + **`mapMatchRoute()` method** — same unreachable tree, counted as service port + method for removal planning)

**`SCAFFOLD_NOT_RUNTIME_COUNT=1`** (`FmmRouteMatcherService`)

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
| `TripRouteChunkedMatcherService` | YES | `TripRouteArtifactMaterializerService` ← `TripsService.enrichTrip` / DI `DRIVING_ROUTE_ENRICH` | ACTIVE_CANONICAL | **YES** — DI jobs 124/7d |
| `MapboxChunkMatchingClientService` → `MapboxService.matchMapboxChunkDetailed` | YES | Chunked matcher only | ACTIVE_CANONICAL | YES |
| `MapboxService` (service) | YES | Chunk match + speeding analysis on enrich path | ACTIVE_CANONICAL | YES |
| `MapboxService.mapMatchRoute()` | YES (method) | **Only** `MapboxRouteMatcherService` (dead port) | DEAD_NO_PRODUCTIVE_CALLSITE | NOT_OBSERVABLE |
| `MapboxRouteMatcherService` / `ROUTE_MAP_MATCHER` | YES | **No `@Inject(ROUTE_MAP_MATCHER)` consumers** | DEAD_NO_PRODUCTIVE_CALLSITE | NOT_OBSERVABLE |
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

**`DUPLICATE_PROVIDER_FETCH_POSSIBLE=YES`** (DIMO segment route fetch + Mapbox chunk match may run twice close together on the same trip)

**Duplicate route execution safety (Phase 12 — separate claims):**

| Surface | Evidence | Classification |
|---------|----------|----------------|
| Route **artifact** persistence | `TripRouteArtifactMaterializerService` + repository: matching input fingerprint + algorithm version → **`UNCHANGED`** skips paid Mapbox work | Idempotent / safe |
| **Waypoint** persistence | `TripsService.storeWaypoints`: `deleteMany` by `tripId` then `createMany` — deterministic replace, not append corruption | **Wasteful but safe** on repeat |
| **Trip enrichment fields** on `vehicleTrip` | `enrichTrip` overwrites geo shares / temp / perf / coords from recomputed inputs — no monotonic counter corruption; duplicate run may re-fetch providers | **Wasteful but safe** if inputs unchanged; not fully provable without provider stability |

**`DUPLICATE_ROUTE_EXECUTION_SAFETY=DUPLICATE_EXECUTION_WASTEFUL_BUT_SAFE`** (aggregate — **does not** claim all `enrichTrip` side effects are cheap; artifact fingerprint does **not** short-circuit DIMO segment fetch or waypoint delete/recreate)

**Duplicate write safety (other pairs):** driving impact dual path → **`DUPLICATE_EXECUTION_SAFE`** (same service, trip-scoped compute); HF vs native events → **`COMPLEMENTARY`** (different sources).

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

| Entry | Path | HF orchestrator bypass? |
|-------|------|-------------------------|
| `POST …/behavior-enrich` | `TripEnrichmentOrchestratorService.runEnrichmentSync` | **NO** — uses HF orchestrator |
| `backfillUnenrichedTrips` | orchestrator `enqueueBehaviorEnrichment` | **NO** |
| `POST …/enrich` (route) | `TripsService.enrichTrip` direct | **YES by design** — route-only; still uses canonical `TripsService.enrichTrip` / Route V2 materializer |
| Platform admin / reconciliation repair | orchestrator + post-finalize producer | **NO** |
| `DrivingAnalysisReconciliationService` | DI init retry | **NO** (V2 canonical) |

**`MANUAL_BEHAVIOR_PATH_BYPASSES_HF_ORCHESTRATOR=NO`**

**`MANUAL_ROUTE_PATH_BYPASSES_HF_ORCHESTRATOR=YES_BY_DESIGN`**

**`MANUAL_ROUTE_PATH_BYPASSES_ROUTE_CANONICAL_SERVICE=NO`** (still `TripsService.enrichTrip`)

**`MANUAL_PATH_BYPASSES_CANONICAL_ORCHESTRATOR=PARTIAL_ROUTE_ONLY`** (compatibility aggregate field)

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
| `ROUTE_MAP_MATCHER` + `MapboxRouteMatcherService` + `MapboxService.mapMatchRoute()` | DEAD_NO_PRODUCTIVE_CALLSITE | Port + legacy global matcher method | **SAFE_RUNTIME_REMOVAL_FOLLOWUP** (single cleanup **slice**) | Confirm zero inject + delete method with port | Low |
| `trip.behavior.enrichment` stack | ACTIVE_DUPLICATE | HF not fully in DI stages | **REQUIRES_MIGRATION** | V2 absorbs HF + coordinator retired | Medium — fleet analytics |
| Legacy `trip.driving-impact.compute` | ACTIVE_DUPLICATE | Chained after HF | **REQUIRES_MIGRATION** | DI-only impact stage proven | Medium |
| Orchestrator `runRouteSafetyEnrichment` | ACTIVE_DUPLICATE | Post-HF route | **REQUIRES_MIGRATION** | DI ROUTE-only after HF deprecation | Wasteful provider fetch today |
| Segment detectors | ACTIVE_REPAIR | Reconciliation evidence | **MUST_RETAIN** | Repair architecture replacement | High |
| `TripDecisionEngine` | ACTIVE_CANONICAL | Lifecycle authority | **MUST_RETAIN** | — | — |
| DI V2 job graph | ACTIVE_CANONICAL | Durable analysis | **MUST_RETAIN** | — | — |

**Removal planning counts (distinct from productive-path matrix):**

| Metric | Count | Notes |
|--------|------:|-------|
| **`SAFE_RUNTIME_REMOVAL_COMPONENT_COUNT`** | **4** | FMM service; `ROUTE_MAP_MATCHER` token; `MapboxRouteMatcherService`; `mapMatchRoute()` method |
| **`SAFE_RUNTIME_REMOVAL_SLICE_COUNT`** | **2** | (1) FMM scaffold slice; (2) legacy Mapbox port + matcher + `mapMatchRoute()` bundle |

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

**NEXT_ACTION=** Optional follow-up runtime PRs: (slice 1) remove FMM scaffold; (slice 2) remove legacy Mapbox port + matcher + `mapMatchRoute()`; consolidate route enrich to DI-only after HF migration; refresh orchestrator header comment when V2 subsumes HF.
