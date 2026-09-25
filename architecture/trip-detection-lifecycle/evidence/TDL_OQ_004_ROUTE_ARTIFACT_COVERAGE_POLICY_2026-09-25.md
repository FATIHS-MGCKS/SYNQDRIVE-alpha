# TDL-OQ-004 — Route Artifact Coverage / Eligibility / Failure Taxonomy (Read-Only)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ004-ROUTE-COV-001 |
| **Audit UTC** | `2026-09-25T21:15:00Z` |
| **STARTING_MAIN_SHA (task anchor)** | `b651cc0e9b8e3e748206454a3e22665a75032311` |
| **REPO_CURRENT (`origin/main` at audit)** | `55fcbe7a229db9858cecc1538b9ec1919ff30fbc` |
| **PRODUCTION_CURRENT** | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` @ `LIVE_RELEASE_ID=20260925182907_v4994` |
| **AUDIT_MODE** | **READ_ONLY** — code trace @ `origin/main` + SSH-local `psql` aggregates; no mutations |

## Question

What is the **target route-artifact coverage policy** and the **actual bottleneck** — Mapbox, FMM, eligibility, post-finalize stage execution, data quality, or another gate?

## Verdict

**`RESOLVED_WITH_BOUNDED_GAPS`**

- **Canonical matcher:** Route V2 **`TripRouteChunkedMatcherService`** (Mapbox Matching API via chunked pipeline). **FMM is scaffold-only** — not a Production bottleneck.
- **Missing artifacts (recent):** **0** in the last **7d** among route-eligible completed trips. **33** bounded historical cases in **30d** — all **`ROUTE` stage COMPLETED** + **`DRIVING_ROUTE_ENRICH` job COMPLETED** + **≥2 waypoints**, **zero artifact**, with trip **`end_time` ∈ [2026-08-27, 2026-08-29 15:47]** (before first persisted artifact @ **2026-08-29 21:21**). Classified as **early Route V2 rollout / handler–artifact contract gap**, not ongoing Mapbox outage.
- **MATCHED vs artifact coverage:** Mapbox quality gates drive **MATCHED → FILTERED** fallback; **artifacts persist**. Dominant FILTERED causes: **`match_confidence_below_threshold`**, **`distance_ratio_out_of_bounds`**, **`tracepoint_coverage_below_threshold`** — a **quality SLO** surface, not missing-row coverage.
- **Handler contract:** **`CAN_ROUTE_JOB_COMPLETE_WITHOUT_ARTIFACT=YES`** — **`DrivingRouteEnrichJobHandler`** does not inspect **`enrichTrip`** return value; processor always **`markCompleted`** → **`ROUTE` stage COMPLETED**. **`ROUTE` ∉ `CRITICAL_STAGE_KEYS`**. Documented as **`CONTRACT_GAP`** / observability debt; **not observed in 7d Production** but structurally allowed.

**OQ004_STATUS_AFTER = `RESOLVED`**

---

## Phase 1 — Coverage taxonomy (denominators)

| Metric ID | Definition (Production SQL cohort) |
|-----------|-------------------------------------|
| **A) COMPLETED_TRIP_COUNT** | `vehicle_trips.trip_status = COMPLETED` with non-null `end_time` |
| **B) ROUTE_PIPELINE_ELIGIBLE_TRIPS** | (A) + vehicle has **`dimo_vehicles.token_id`** + latest **`driving_analysis_runs.analysis_type = TRIP_ENRICHMENT`** per trip |
| **C) ROUTE_STAGE_EXECUTED** | Latest TRIP_ENRICHMENT run has **`driving_analysis_stages.stage_key = ROUTE`** terminal ≠ PENDING |
| **D) ARTIFACT_COVERAGE** | Exists **`vehicle_trip_route_artifacts`** row for `trip_id` |
| **E) CANONICAL_ROUTE_READY** | Artifact **`processed_at IS NOT NULL`** → canonical reader **`ready=true`** |
| **F) MATCHED_COVERAGE** | Artifact **`route_quality = MATCHED`** only |
| **G) USABLE_ROUTE_GEOMETRY** | MATCHED/FILTERED geometry **or** RAW with **`source_point_count ≥ 2`** (renderable via canonical read) |

**Policy:** Never equate **F** with **D** or **E**.

### Eligibility (code-derived, B)

Post-finalize producer → **`DrivingAnalysisInitService.initializeForCompletedTrip`** (TRIP_ENRICHMENT run + stages + durable jobs). **`ROUTE`** depends only on **`SEGMENT_VALIDATE`**. **`TripsService.enrichTrip`** additionally requires org-scoped trip/vehicle and **`vehicle.dimoVehicle.tokenId`**; empty DIMO route fetch still runs materializer (RAW/FILTERED), but **missing token returns `null` without throw**.

---

## Phase 2 — Lifecycle ownership (summary)

| Step | Owner | Can block artifact? | Degrade only? |
|------|-------|---------------------|---------------|
| Trip COMPLETED | `TripDecisionEngine` | No (downstream) | — |
| Post-finalize enqueue | `TripPostFinalizeAnalysisProducer` | Yes (no run → never scheduled) | Recoverable via reconciliation |
| Analysis init | `DrivingAnalysisInitService` | Yes | Reconciliation |
| SEGMENT_VALIDATE | DI stage + job | Blocks ROUTE ready | Critical stage |
| ROUTE job | `DRIVING_ROUTE_ENRICH` | No (non-critical) | Stage can COMPLETE without artifact |
| Handler | `DrivingRouteEnrichJobHandler` | **Observability gap** | Always completes job on resolved handler |
| Route fetch | `DimoSegmentsService.fetchRouteEnrichment` | Empty → RAW artifact expected | Yes |
| Waypoints | `TripsService.storeWaypoints` | No | RAW authority |
| Materialize | `TripRouteArtifactMaterializerService` | Retryable throws; non-retryable **`ok:false`** → no row | FILTERED/RAW upsert on success path |
| Canonical read | `TripRouteCanonicalReadService` | N/A | MATCHED read-time fallback |

---

## Phase 3 — FMM / legacy Mapbox

| Symbol | Value |
|--------|-------|
| **CURRENT_CANONICAL_MATCHER** | `TripRouteChunkedMatcherService` → `MapboxChunkMatchingClientService` |
| **FMM_RUNTIME_ACTIVE** | **NO** — `FmmRouteMatcherService.matchRoute` returns **`null`**; registered in module only |
| **FMM_RUNTIME_ROLE** | **SCAFFOLD** (`OPTIONAL_FUTURE`) |
| **LEGACY_MAPBOX_MATCHER_RUNTIME_ACTIVE** | **NO** on DRIVING_ROUTE_ENRICH — `MapboxRouteMatcherService` is **`ROUTE_MAP_MATCHER`** port; **no injectors** on enrich path (`trips.service.enrich-route-v2.spec.ts`) |
| **FMM_BOTTLENECK** | **NO** |

---

## Phase 4 — Artifact semantics

| Quality | Meaning |
|---------|---------|
| **MATCHED** | Mapbox provider; gates passed; **`matched_geometry_json`** + persisted match cache in diagnostics |
| **FILTERED** | Measured/filtered geometry persisted; Mapbox failed gates or chunk failure → **`filtered_geometry_json`** |
| **RAW** | Metadata row; geometry from **`vehicle_trip_waypoints`** when ≥2 valid points |

| Question | Answer |
|----------|--------|
| **DOES_MAPBOX_FAILURE_ALWAYS_MEAN_NO_ROUTE** | **NO** — FILTERED/RAW remain canonical |
| **DOES_MAPBOX_QUALITY_REJECTION_MEAN_NO_ARTIFACT** | **NO** — upsert with FILTERED + `failure_reason` |
| **CAN_FILTERED_BE_CANONICALLY_RENDERED** | **YES** |
| **CAN_RAW_BE_CANONICALLY_RENDERED** | **CONDITIONAL** — ≥2 measured waypoints / source points |
| **CAN_MATCHED_ARTIFACT_FALLBACK_AT_READ_TIME** | **YES** — invalid matched geometry → filtered/raw at read |

---

## Phase 5 — Preprocessing (`preprocessTripRoute`)

Initial quality: **`FILTERED`** if ≥2 filtered points else **`RAW`** with `no_valid_measured_points` / `insufficient_filtered_points`. Mapbox matching runs only when preprocessing quality is **FILTERED** and **`filteredPoints.length ≥ 2`**. Outcomes always attempt **artifact upsert** on materializer success path.

---

## Phase 6 — Mapbox failure taxonomy (code)

Retryable failures → **`TripRouteMatchRetryableError`** → job retry (max **3**). Quality gate failures → **FILTERED** artifact, **`quality_rejected`** metric. Constants @ `trip-route-chunked-matching.constants.ts`: confidence **≥0.5**, coverage **≥0.85**, distance ratio **0.7–1.5**, seam **≤25 m**, **100** coords/request, chunk **90**, overlap **10**, **200** req/trip cap, **30s** timeout.

---

## Phase 7 — Job return-value contract

| Question | Answer | Classification |
|----------|--------|----------------|
| **CAN_ROUTE_JOB_COMPLETE_WITHOUT_ARTIFACT** | **YES** | Handler + processor |
| **CAN_ROUTE_STAGE_COMPLETE_WITHOUT_ARTIFACT** | **YES** | `onJobCompleted` after job COMPLETED |
| **MISSING DIMO token → COMPLETED without artifact** | **Possible in code** (`enrichTrip` returns null) | **Not observed 7d** (all eligible have token) |
| **Non-retryable materializer failure** | Job still COMPLETED if handler resolves | **CONTRACT_GAP** |

---

## Phase 8 — Retry / dead letter

Generic DI: **maxAttempts=3**, exponential backoff. **ROUTE** not critical — run can complete with ROUTE artifact missing. Production **30d:** **`ROUTE_JOB_DEAD_LETTER=0`**, **`ROUTE_JOB_RETRYING=0`**.

---

## Phase 9–12 — Production inventory & forensics

### Aggregates (trip `end_time` window)

| Metric | 7d | 30d |
|--------|----|-----|
| COMPLETED | 105 | 408 |
| ROUTE artifacts | 105 | 375 |
| MATCHED / FILTERED / RAW | 74 / 29 / 2 | 255 / 116 / 4 |
| ELIGIBLE (token + TRIP_ENRICHMENT run) | 105 | 408 |
| ELIGIBLE with artifact | 105 | 375 |
| **Artifact coverage among eligible** | **100%** | **91.91%** (375/408) |
| ROUTE stage COMPLETED, no artifact | **0** | **33** |
| CANONICAL ready (processed_at) | 105 | — |
| Renderable proxy | 104 | — |

**Rollout anchors:** first **`driving_analysis_runs`:** `2026-07-17`; first **`vehicle_trip_route_artifacts.processed_at`:** `2026-08-29 21:21`.

**Phase 12 — completed without artifact (30d, n=33):** 100% **`HANDLER_COMPLETED_NO_ARTIFACT`**; **100%** had **≥2 waypoints**; **0** missing DIMO token; trip end **≤ 2026-08-29 15:47** (same-day window before artifact persistence anchor).

---

## Phase 14 — MATCHED bottleneck (among artifacts, 30d)

| FILTERED `failure_reason` (top) | Count |
|----------------------------------|------:|
| match_confidence_below_threshold | 30 |
| distance_ratio_out_of_bounds | 28 |
| tracepoint_coverage_below_threshold (+ combos) | 8+ |
| chunk / seam / geometry invalid (tail) | few |

**RAW (30d):** `no_valid_measured_points` (3), `insufficient_filtered_points` (1).

---

## Phase 15 — Mapbox Production health

| Signal | Result |
|--------|--------|
| **MAPBOX_TOKEN_PRESENT** | **YES (operational)** — sustained MATCHED artifacts; audit shell could not read token env name from shared file |
| **Prometheus `synqdrive_trip_route_v2_*`** | **Not exposed** on `127.0.0.1:3000/metrics` scrape from audit host (empty) |
| **429 / 5xx / timeout** | **No SQL evidence** of retry exhaustion (0 dead letters); quality rejection **dominant** in FILTERED reasons |

---

## Phase 16–18 — Conclusions & target policy

| Policy | Target |
|--------|--------|
| **Artifact coverage** | **100%** of route-eligible completed trips whose **ROUTE stage terminates COMPLETED** after Route V2 rollout anchor — **met in 7d**; **30d gap explained** by pre-anchor cohort |
| **Canonical route availability** | Eligible trip with **≥2** valid measured points → renderable **MATCHED → else FILTERED → else RAW** |
| **MATCHED quality** | **Observational KPI** — calibrate SLO from FILTERED reason histogram; **do not** treat as correctness gate |

**PRIMARY_COVERAGE_CAUSE (recent):** **None** — pipeline healthy **7d**. **Historical:** post-finalize / early artifact persistence window (**33** trips). **Quality mix:** Mapbox **quality gates**, not missing artifacts.

---

## Phase 19–20 — Invariants

| Question | Answer |
|----------|--------|
| **ONE_ARTIFACT_PER_TRIP** | **YES** — `VehicleTripRouteArtifact.tripId @unique` |
| **WAYPOINTS_ARE_RAW_AUTHORITY** | **YES** — measured source; enrich **deleteMany + createMany** before materialize |
| **WAYPOINT_PERSIST_CAN_PRECEDE_ARTIFACT_FAILURE** | **YES** — waypoints written when `routePoints.length > 0` before materializer outcome |

---

## Phase 21 — H3 hypothesis

**H3:** Route artifact gap is eligibility/timing (post-finalize) rather than Mapbox outage.

**H3_ROUTE_GAP_HYPOTHESIS = `PARTIALLY_CONFIRMED`**

- **CONFIRMED:** All-time **1900** completed without artifact includes **1206** without TRIP_ENRICHMENT run (pre-pipeline / never scheduled).
- **CONFIRMED:** **7d** eligible artifact coverage **100%**.
- **REFUTED for recent ops:** Mapbox as **missing-artifact** bottleneck (**FILTERED** persists).
- **BOUNDED:** **33** trips = early artifact rollout window + **job-complete-without-artifact** contract.

---

## Phase 22 — Cause distribution (30d eligible, missing artifact n=33)

| Bucket | Count |
|--------|------:|
| MISSING_ARTIFACT_HANDLER_NULL / HANDLER_COMPLETED | 33 |
| MISSING_ARTIFACT_ELIGIBILITY | 0 |
| MISSING_ARTIFACT_DEAD_LETTER | 0 |
| MISSING_ARTIFACT_PIPELINE_NOT_STARTED (within 30d eligible) | 0 |

---

## Phase 23 — Defect decision

| Finding | Status |
|---------|--------|
| **ROUTE job completes without artifact** | **Code YES**; Production **33** historical only → **`CONTRACT_GAP`**, not active regression |
| **NEW_RUNTIME_DEFECT_FOUND** | **NO** (no unexplained **7d** eligible gap) |
| **DEFECT_CLASS** | **`CONTRACT_GAP`** (follow-up: handler should fail job or upsert terminal RAW on permanent materializer failure) |

---

## Phase 24 — Required machine block

```
TDL_OQ_004_AUDIT_RESULT=RESOLVED_WITH_BOUNDED_GAPS
CURRENT_CANONICAL_MATCHER=TripRouteChunkedMatcherService(Mapbox)
FMM_RUNTIME_ACTIVE=NO
FMM_RUNTIME_ROLE=SCAFFOLD
LEGACY_MAPBOX_MATCHER_RUNTIME_ACTIVE=NO
PRIMARY_COVERAGE_CAUSE=historical_early_route_v2_rollout_33_trips; recent_7d_none; matched_quality_mapbox_gates
H3_ROUTE_GAP_HYPOTHESIS=PARTIALLY_CONFIRMED
```

---

## Validation

- Repository trace @ `55fcbe7a229db9858cecc1538b9ec1919ff30fbc`
- Production read-only SQL @ `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2`

**Decision:** TDL-DEC-OQ004-001 (see decision register).
