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
- **Missing artifacts (recent):** **0** in the last **7d** among route-eligible completed trips. **33** historical cases in the rolling **30d** window had **ROUTE** stage + job **COMPLETED** and **no artifact** — reclassified by **job `completed_at` (UTC)**, not trip `end_time` alone (see **Historical correction** below). **None** of the 33 have route-job execution **after** the first persisted artifact observation; they are **not** proof of the post–Route-V2 handler contract gap in Production.
- **Route V2 policy coverage (30d):** **`ROUTE_V2_ARTIFACT_POLICY_COVERAGE_30D = 100%`** (**374/374**) — denominator = DI-eligible trips whose latest **`DRIVING_ROUTE_ENRICH`** job **`completed_at ≥`** first observed artifact persistence (**2026-08-29 21:21:23 UTC**). Do **not** score **375/408 (91.91%)** against a policy that did not apply to pre-materialization jobs.
- **MATCHED vs artifact coverage:** Mapbox quality gates drive **MATCHED → FILTERED** fallback; **artifacts persist**. Dominant FILTERED causes: **`match_confidence_below_threshold`**, **`distance_ratio_out_of_bounds`**, **`tracepoint_coverage_below_threshold`** — a **quality SLO** surface, not missing-row coverage.
- **Handler contract (code):** **`CURRENT_CODE_CONTRACT_GAP_PRESENT=YES`** — job/stage can **COMPLETED** without artifact. **`CURRENT_CODE_CONTRACT_GAP_PRODUCTION_OBSERVED_7D=NO`** and **`CURRENT_CODE_CONTRACT_GAP_HISTORICALLY_OBSERVED_POST_R2=NO`** (proxy: **0** missing artifacts with job **`completed_at ≥`** first artifact timestamp).

**OQ004_STATUS_AFTER = `RESOLVED`**

---

## Historical correction (2026-09-25 epistemic pass)

### Route V2 repository chronology (#1411–#1416)

| PR | SHA | Author time (explicit) | Capability |
|----|-----|------------------------|------------|
| R1 #1411 | `6b960e2a9…` | 2026-08-29 14:32 **+0200** | Schema only — no runtime materializer |
| R2 #1413 | `92a60a73351233187ee3c3089a8ad96a2fadc044` | 2026-08-29 16:26:08 **+0200** (= **14:26:08 UTC**) | RAW/FILTERED artifact materialization wired into **`enrichTrip`** |
| R3 #1415 | `65c5824a8…` | 2026-08-29 17:24 **+0200** | Chunked Mapbox **MATCHED** |
| R4 #1416 | `dfe9d2bb7…` | 2026-08-29 18:15 **+0200** | Canonical read / frontend cutover |

### Production R2 deploy anchor (read-only VPS)

| Field | Value |
|-------|-------|
| **ROUTE_V2_R2_PRODUCTION_ANCHOR** | **UNKNOWN** (exact deploy not proven) |
| **ROUTE_V2_R2_PRODUCTION_ANCHOR_SHA** | *(not proven)* |
| **ROUTE_V2_R2_PRODUCTION_ANCHOR_RELEASE** | *(not proven)* |
| **ROUTE_V2_R2_PRODUCTION_ANCHOR_TIME** | *(not proven)* |
| **ANCHOR_EVIDENCE_SOURCE** | VPS retains **25** release dirs from **`20260916*` onward only** (no `20260829*` trees); **`/opt/synqdrive/shared/deploy-state/`** artifacts begin **`20260901*`**; **`git merge-base --is-ancestor 92a60a73`** holds for earliest retained release **`bee8e51e…` @ 2026-09-21** — proves R2 was deployed **by** that date, **not** first deploy time. **Do not** equate first DB artifact with deploy time. |

**Operational observation (not deploy):** `MIN(vehicle_trip_route_artifacts.processed_at) = **2026-08-29 21:21:23.67 UTC**` (PostgreSQL `timestamptz` displayed in session TZ; treated as **UTC** for correlation).

### Reclassification of 33 missing-artifact trips (30d, n=33)

Correlation window (all timestamps **UTC** from Production `timestamptz`):

| Aggregate | Value |
|-----------|-------|
| Trip `end_time` | min **2026-08-27 08:45** — max **2026-08-29 15:47:23** |
| **`DRIVING_ROUTE_ENRICH` `completed_at`** | min **2026-08-27 21:00:04.789** — max **2026-08-29 16:01:28.94** |
| **`ROUTE` stage `completed_at`** | min **2026-08-27 21:00:04.915** — max **2026-08-29 16:01:28.943** |

Classification vs **R2 merge instant** (**2026-08-29 14:26:08 UTC**) and **first artifact** (**2026-08-29 21:21:23 UTC**):

| Class | Count | Rule |
|-------|------:|------|
| **PRE_ROUTE_V2_RUNTIME** | **26** | Route job **`completed_at` < 2026-08-29 14:26:08 UTC** — artifact table / R2 writer not expected on Production |
| **UNKNOWN_HISTORICAL_RUNTIME** | **7** | Job **`completed_at` ∈ [14:26:08, 21:21:23) UTC** — after R2 **merge** but before first persisted artifact; **Production deploy of R2 not proven**; may be deploy lag or pre-first-success materialization |
| **POST_ROUTE_V2_HANDLER_COMPLETED_NO_ARTIFACT** | **0** | No missing-artifact trip with job **`completed_at ≥`** first artifact timestamp |

**Correction:** Prior wording **`HANDLER_COMPLETED_NO_ARTIFACT` (33/33)** conflated stage/job completion with the **current** handler contract defect. Completing enrichment **without** `VehicleTripRouteArtifact` was **expected before R2 runtime**; the **7** interim rows are **not** established post-R2 handler-gap evidence without deploy proof.

### Artifact vs latest-stage count delta (375 vs 374)

| Field | Value |
|-------|-------|
| **ARTIFACT_STAGE_COUNT_DELTA** | **1** |
| **ARTIFACT_STAGE_COUNT_DELTA_EXPLAINED** | **YES** |
| **ARTIFACT_STAGE_COUNT_DELTA_REASON** | Trip prefix **`af8bc4d7…`** has a **persisted route artifact** while the **latest** TRIP_ENRICHMENT run’s **ROUTE** stage is **`PENDING`** (superseded run / recompute — canonical **1:1 artifact per trip** retained; not a missing-artifact defect). |

### Route V2 artifact policy denominator (30d)

| Metric | Value |
|--------|------:|
| **ROUTE_PIPELINE_ELIGIBLE_30D** (generic DI) | 408 |
| **ROUTE_V2_ARTIFACT_POLICY_ELIGIBLE_30D** | **374** (token + TRIP_ENRICHMENT run + latest route job **`completed_at ≥`** first artifact UTC) |
| **ROUTE_V2_ARTIFACT_POLICY_WITH_ARTIFACT_30D** | **374** |
| **ROUTE_V2_ARTIFACT_POLICY_COVERAGE_30D** | **100%** |
| **POST_ROUTE_V2_ARTIFACT_COVERAGE** | **100%** (same cohort; **0** policy-eligible missing rows) |

Generic **375/408** mixes **34** trips whose route jobs ran **before** artifact materialization was observable in Production (33 without artifact + **1** artifact trip **`af8bc4d7…`** with overlapping history).

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
| **Non-retryable materializer failure** | Job still COMPLETED if handler resolves | **`CURRENT_CODE_CONTRACT_GAP`** (structural — separate from Production observation) |

### Contract gap vs observed Production behavior

| Symbol | Value |
|--------|-------|
| **CURRENT_CODE_CONTRACT_GAP_PRESENT** | **YES** (handler + processor + non-critical ROUTE stage) |
| **CURRENT_CODE_CONTRACT_GAP_PRODUCTION_OBSERVED_7D** | **NO** (all 7d eligible trips have artifacts) |
| **CURRENT_CODE_CONTRACT_GAP_HISTORICALLY_OBSERVED_POST_R2** | **NO** (proxy: **0/33** missing with job **`completed_at ≥`** first artifact; deploy anchor **UNKNOWN**) |

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
| **Generic artifact / eligible (not Route V2 policy)** | **100%** | **91.91%** (375/408 — includes pre-materialization jobs) |
| **Route V2 policy coverage** | **100%** (7d ⊆ post-anchor cohort) | **100%** (**374/374** — see Historical correction) |
| ROUTE stage COMPLETED, no artifact | **0** | **33** (all pre-first-artifact job execution) |
| CANONICAL ready (processed_at) | 105 | — |
| Renderable proxy | 104 | — |

**Rollout anchors:** first **`driving_analysis_runs`:** `2026-07-17`; first **`vehicle_trip_route_artifacts.processed_at` (observed UTC):** `2026-08-29 21:21:23.67`.

**Phase 12 — completed without artifact (30d, n=33):** Reclassified — **26** **`PRE_ROUTE_V2_RUNTIME`**, **7** **`UNKNOWN_HISTORICAL_RUNTIME`**, **0** **`POST_ROUTE_V2_HANDLER_COMPLETED_NO_ARTIFACT`** (see Historical correction). All had **≥2 waypoints**; jobs completed **2026-08-27 21:00 – 2026-08-29 16:01 UTC**.

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
| **MAPBOX_TOKEN_PRESENT** | **YES (operational inference)** — sustained MATCHED artifacts; token env vars not readable in audit shell |
| **Prometheus `synqdrive_trip_route_v2_*`** | **NOT_OBSERVED_IN_AVAILABLE_EVIDENCE** — scrape @ `127.0.0.1:3000/metrics` returned **no** matching series |
| **MAPBOX_429_EVIDENCE** | **NOT_OBSERVED_IN_AVAILABLE_EVIDENCE** |
| **MAPBOX_5XX_EVIDENCE** | **NOT_OBSERVED_IN_AVAILABLE_EVIDENCE** |
| **MAPBOX_TIMEOUT_EVIDENCE** | **NOT_OBSERVED_IN_AVAILABLE_EVIDENCE** |
| **MAPBOX_RETRYABLE_FAILURE_EVIDENCE** | **NOT_OBSERVED_IN_AVAILABLE_EVIDENCE** (no metric scrape; do **not** infer zero transient failures) |
| **MAPBOX_RETRY_EXHAUSTION_30D** | **0** dead-letter route jobs; **0** active retries (**proven** via SQL) |
| **MAPBOX_QUALITY_REJECTIONS_OBSERVED** | **YES** — FILTERED `failure_reason` histogram (**proven** via SQL) |

---

## Phase 16–18 — Conclusions & target policy

| Policy | Target |
|--------|--------|
| **Artifact coverage** | **100%** of route-eligible completed trips whose **ROUTE stage terminates COMPLETED** after Route V2 rollout anchor — **met in 7d**; **30d gap explained** by pre-anchor cohort |
| **Canonical route availability** | Eligible trip with **≥2** valid measured points → renderable **MATCHED → else FILTERED → else RAW** |
| **MATCHED quality** | **Observational KPI** — calibrate SLO from FILTERED reason histogram; **do not** treat as correctness gate |

**PRIMARY_COVERAGE_CAUSE (recent):** **None** — post-anchor policy cohort **100%**. **Historical:** **33** trips before first artifact observation / unproven R2 deploy window — **not** Mapbox outage. **Quality mix:** Mapbox **quality gates** → FILTERED.

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
- **BOUNDED:** **33** trips = pre-first-artifact job execution (**26** pre-R2-merge job time, **7** unknown deploy/first-success window) — **not** post-R2 handler-gap proof.

---

## Phase 22 — Cause distribution (30d, missing artifact n=33)

| Bucket | Count |
|--------|------:|
| PRE_ROUTE_V2_RUNTIME (job before R2 merge UTC) | 26 |
| UNKNOWN_HISTORICAL_RUNTIME (job after R2 merge, before first artifact) | 7 |
| POST_ROUTE_V2_HANDLER_COMPLETED_NO_ARTIFACT | 0 |
| MISSING_ARTIFACT_DEAD_LETTER | 0 |

---

## Phase 23 — Defect decision

| Finding | Status |
|---------|--------|
| **ROUTE job completes without artifact** | **Code YES** (`CURRENT_CODE_CONTRACT_GAP`); **Production post-anchor observation NO** |
| **NEW_RUNTIME_DEFECT_FOUND** | **NO** |
| **DEFECT_CLASS** | **`CURRENT_CODE_CONTRACT_GAP`** (optional hardening slice — not proven Production regression) |

---

## Phase 24 — Required machine block

```
TDL_OQ_004_AUDIT_RESULT=RESOLVED_WITH_BOUNDED_GAPS
ROUTE_V2_R2_PRODUCTION_ANCHOR=UNKNOWN
MISSING_33_PRE_ROUTE_V2_RUNTIME=26
MISSING_33_POST_ROUTE_V2_HANDLER_NO_ARTIFACT=0
MISSING_33_UNKNOWN_RUNTIME=7
ROUTE_V2_ARTIFACT_POLICY_COVERAGE_30D=100%
CURRENT_CODE_CONTRACT_GAP_PRESENT=YES
CURRENT_CODE_CONTRACT_GAP_PRODUCTION_OBSERVED_7D=NO
CURRENT_CODE_CONTRACT_GAP_HISTORICALLY_OBSERVED_POST_R2=NO
MAPBOX_QUALITY_REJECTIONS_OBSERVED=YES
H3_ROUTE_GAP_HYPOTHESIS=PARTIALLY_CONFIRMED
```

---

## Validation

- Repository trace @ `55fcbe7a229db9858cecc1538b9ec1919ff30fbc`
- Production read-only SQL @ `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2`

**Decision:** TDL-DEC-OQ004-001 (see decision register).
