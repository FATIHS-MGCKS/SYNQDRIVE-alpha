# Trip Route Architecture V2 — Stage R0 Forensic Audit & Implementation Design

**Date:** 2026-08-29  
**Repository:** SYNQDRIVE-alpha (`main` @ `b7c560f79335f1474f669fa08397964c6a791ac1`)  
**Stage:** R0 — READ-ONLY / DESIGN ONLY  
**Scope:** Canonical route pipeline replacement design (chunked Map Matching, persisted geometry, MATCHED → FILTERED → RAW)

**Hard gates for this stage:**

| Gate | Status |
|------|--------|
| PRODUCTION_MUTATIONS | NONE |
| MAPBOX_BEHAVIOR_CHANGE | NONE |
| DATABASE_MIGRATION_EXECUTION | NONE |
| BACKFILL | NONE |
| UI_CUTOVER | NONE |

---

## 1. Executive verdict

SynqDrive already has a **durable post-trip analysis pipeline** that can own route enrichment via `DrivingAnalysisStage.ROUTE` → `DRIVING_ROUTE_ENRICH` → `TripsService.enrichTrip`. This is the correct canonical owner for Route V2. **Do not build a second scheduler or parallel route subsystem.**

However, the **current route geometry contract is broken end-to-end**:

1. **Map matching is globally downsampled to ≤100 points** before a single Mapbox Matching API call (`MapboxService.mapMatchRoute`), destroying urban curvature and long-trip fidelity.
2. **`matchedGeometry` is computed but never persisted** — it exists only in the transient `POST /enrich` HTTP response and ephemeral React state.
3. **The frontend still triggers route enrichment on trip selection** when `enrichedAt` is absent, and **skips enrichment when `enrichedAt` is set** even though no persisted matched geometry exists — producing the worst-case UX: background enrichment ran, user sees "Nicht abgeglichen", no matched route.
4. **Three parallel route-enrichment triggers** coexist (V2 job, legacy orchestrator hook, UI auto-POST), all calling the same undersized matcher.
5. **Waypoint storage is inconsistent**: `TripsService.storeWaypoints` caps at 500 with global stride sampling, but live trip detection appends uncapped waypoints via `createMany`.

**Route V2 must:**

- Extend the **existing** `DRIVING_ROUTE_ENRICH` stage (not replace the pipeline).
- Persist canonical route artifacts with explicit **MATCHED | FILTERED | RAW** quality.
- Replace global ≤100 sampling with **trajectory-aware retention + chunked Map Matching + deterministic stitching**.
- Make the Trips UI a **pure consumer** of persisted route data.
- **Forbid** spline/Bezier/Catmull-Rom/Chaikin cosmetic smoothing; `densifyRoute` remains display-only linear interpolation on FILTERED/RAW paths.

**Verdict:** Implement Route V2 as a focused evolution of the durable analysis pipeline + a new route artifact store. No speculative smoothing. No second scheduler.

---

## 2. Current runtime lineage

### 2.1 Automated pipeline ownership (COMPLETED → route enrichment)

#### Canonical V2 call chain (verified on `main`)

```
Trip persisted COMPLETED
  → TripPostFinalizeAnalysisProducer.produceAfterPersistedCompletion()
      [driving-analysis-init/trip-post-finalize-analysis.producer.ts:25-87]
  → DrivingAnalysisInitService.initializeForCompletedTrip()
      [driving-analysis-init/driving-analysis-init.service.ts:42-192]
  → DrivingAnalysisRunService.resolveOrBeginRun()  (idempotent fingerprint)
  → DrivingAnalysisStageOrchestratorService.initializeStagesForRun()
      [driving-analysis-stage/driving-analysis-stage.orchestrator.service.ts]
  → DrivingAnalysisStageOrchestratorService.enqueueReadyStages()
      SEGMENT_VALIDATE first → then NATIVE_EVENTS ∥ ROUTE in parallel
      [driving-analysis-stage/driving-analysis-stage.dependencies.ts:6-13]
  → STAGE_TO_JOB_TYPE.ROUTE = 'DRIVING_ROUTE_ENRICH'
      [driving-analysis-stage/driving-analysis-stage.job-map.ts:4-8]
  → DrivingIntelligenceJobDispatcherService.enqueue()
      Postgres PENDING row first, then BullMQ
      [driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service.ts:28-96]
  → DrivingIntelligenceJobProcessorService.processPersistentJob()
  → DrivingRouteEnrichJobHandler.handle()
      [driving-intelligence-jobs/handlers/driving-route-enrich.handler.ts:15-31]
  → TripsService.enrichTrip()
      [trips/trips.service.ts:240-393]
  → RouteMapMatcher.matchRoute() → MapboxService.mapMatchRoute()
      [trips/mapbox.service.ts:111-178]
```

#### Completion origins (all verified)

| Origin | `source` value | Trigger location |
|--------|----------------|------------------|
| Normal live finalize | `LIVE_FINALIZE` | `trip-detection-orchestration.service.ts` (~2421) |
| Mid-trip / gap split finalize | `MID_GAP_SPLIT` | `trip-detection-orchestration.service.ts` (~1296) |
| Repair / reconciliation finalize | `REPAIR_FINALIZE` | `trip-reconciliation.service.ts` (`enqueueRepairEnrichment`) |
| Analysis reconciliation (no producer) | `REPAIR_FINALIZE` | `driving-analysis-reconciliation.service.ts` (~352) |
| Manual HTTP enrich | — | `vehicle-intelligence.controller.ts:1331` (`POST .../enrich`) |
| Legacy behavior → route hook | — | `trip-enrichment-orchestrator.service.ts:319-334` (`runRouteSafetyEnrichment`) |
| Frontend trip selection | — | `useTripEnrichment.ts:37-41` (`useAutoTripEnrichment`) |

Producer explicitly documents legacy parallelism:

```9:11:backend/src/modules/vehicle-intelligence/driving-analysis-init/trip-post-finalize-analysis.producer.ts
 * Post-finalize producer — awaited durable analysis init only after persisted COMPLETED trip.
 * Legacy enrichment queues remain separate until fully replaced.
```

#### Answers to ownership questions

| # | Question | Answer |
|---|----------|--------|
| 1 | One canonical durable route-enrichment stage? | **Designed yes** (`ROUTE` / `DRIVING_ROUTE_ENRICH`). **Operationally no** — legacy orchestrator + UI POST also call `enrichTrip`. |
| 2 | Idempotent? | **Orchestration yes** (run fingerprint, job `idempotencyKey`, stage job keys). **`enrichTrip` re-executes** on every call; no skip-if-already-matched guard. Silent no-op (no DIMO token) still marks job COMPLETED. |
| 3 | After Redis/BullMQ outage? | Job row persisted as `PENDING`; dispatcher returns `enqueued: false`. `DrivingAnalysisReconciliationService` retries `PENDING_JOB_RETRY` every **10 min**. Exponential backoff on handler failures. |
| 4 | Can COMPLETED trip permanently miss route enrichment? | **Yes** — missing `organizationId` at finalize; no DIMO token (handler completes without throw); job `DEAD_LETTER` (ROUTE is **not** critical); completed run dedup blocks re-orchestration; reconciliation lookback **14 days** only; user never opens trip (no UI POST). |
| 5 | Frontend click required? | **No for V2 backend** if pipeline succeeds. **Yes in practice** for matched geometry today because it is not persisted and UI auto-POST is the only hydration path. |
| 6 | Legacy `TripEnrichmentOrchestrator` active? | **Yes** — `enqueueBehaviorEnrichment` on every finalize; `runRouteSafetyEnrichment` after HF behavior completes. |
| 7 | Old/new overlap? | Dual finalize triggers; dual route paths; shared `TripsService.enrichTrip`; shared `VehicleTrip.enrichedAt` completion signal. |
| 8 | Canonical owner after Route V2? | **Producer → Init → Stage orchestrator → `DRIVING_ROUTE_ENRICH` → handler → route artifact writer.** Deprecate orchestrator route hook + UI auto-enrich. Keep `POST /enrich` as ops/retry only. |

**`ROUTE` is not a critical stage** — failure does not block the analysis run:

```79:83:backend/src/modules/vehicle-intelligence/driving-analysis-stage/driving-analysis-stage.dependencies.ts
export const CRITICAL_STAGE_KEYS = new Set<DrivingAnalysisStageKey>([
  'SEGMENT_VALIDATE',
  'NATIVE_EVENTS',
]);
```

---

### 2.2 Route data lineage (end-to-end)

```
DIMO GraphQL (7s interval)
  → DimoSegmentsService.fetchRouteEnrichment / parseRoutePoints
  → RoutePoint[] { lat, lng, speedKmh, timestamp }
  ├─[live tracking]→ vehicle_trip_waypoints (append, uncapped)
  ├─[getRouteForTrip / enrichTrip]→ storeWaypoints (≤500 stride, replace-all)
  ├─[enrichTrip only]→ RouteMapMatcher.matchRoute (≤100 stride, 1 Mapbox call)
  │     → matchedGeometry + confidence (TRANSIENT)
  ├─[enrichTrip]→ VehicleTrip scalars (road %, speeding JSON, enrichedAt)
  ├─[GET /route]→ RoutePoint[] to frontend (fresh DIMO or stored waypoints)
  └─[POST /enrich]→ TripEnrichmentResult incl. matchedGeometry (not stored)
        → useTripEnrichment React state (session only)
        → useTripsRouteMap GeoJSON → Mapbox GL layers
```

#### Transformation table

| Stage | Source | Points | Timestamps | Speed | Order | Validation | Sampling | Max | Persisted | Data loss | Consumers |
|-------|--------|--------|------------|-------|-------|------------|----------|-----|-----------|-----------|-----------|
| **RAW observations** | DIMO `signals` 7s | ~1 per 7s × duration | Yes | AVG | ASC | Drop null/(0,0) | None | Unbounded | No (transient) | Invalid GPS | All paths |
| **PERSISTED waypoints (enrich/get-route)** | `storeWaypoints` | ≤500 | `recordedAt` | `speedKmh` | ASC | — | `i % ceil(n/500)===0` | 500 | `vehicle_trip_waypoints` replace-all | Points, `heading` | GET /route fallback, speed overlay |
| **PERSISTED waypoints (live FSM)** | `processActiveTick` / `fetchAndStoreInitialRoute` | Uncapped append | `recordedAt` | `speedKmh` | ASC | 5s overlap dedup | None | None | `vehicle_trip_waypoints` append | `heading` | Same |
| **MAP-MATCH input** | Full `routePoints` in `enrichTrip` | ≤100 | If all sampled have ts | Not sent | ASC | ≥2 coords | `i % ceil(n/100)===0` | 100 | No | Curves, gaps | Mapbox API |
| **MAP-MATCH output** | Mapbox Matching v5 | Dense polyline | N/A | In annotations only | Mapbox | `code===Ok` | Mapbox `tidy` | — | **No** | — | HTTP response only |
| **FILTERED (display)** | `densifyRoute` on raw | Up to 6000 | Lost in densify | Lost in base line | ASC | `isValidCoord` | Linear interp 35m steps | 6000 | No | Speed on matched path | Map base line |
| **DISPLAY selection** | Frontend | — | — | — | — | — | — | — | No | — | `useTripsRouteMap` |

#### Concept separation (currently conflated)

| Concept | Current reality | Route V2 target |
|---------|----------------|-----------------|
| **RAW observations** | DIMO 7s `RoutePoint[]` | Canonical provider trace; minimal safety sanitize only |
| **PERSISTED waypoints** | Mixed capped/uncapped PG rows | Bounded visualization/telemetry sample; not match input authority |
| **FILTERED route** | Implicit = raw waypoints + `densifyRoute` | Explicit GPS cleanup polyline; no road assumptions |
| **MAP-MATCHED route** | Transient `matchedGeometry` in POST response | Persisted artifact with quality gates |
| **DISPLAY route** | Ad-hoc: matched if React state else densified raw | `MATCHED → FILTERED → RAW` from artifact API |

---

## 3. Exact defects (file/function references)

| ID | Defect | Location | Impact |
|----|--------|----------|--------|
| D1 | Global ≤100 stride sampling before single Mapbox call | `mapbox.service.ts:116-119` `mapMatchRoute` | Urban turns, roundabouts, U-turns dropped; max **350s** temporal gap at 5000 pts / 7s interval |
| D2 | `matchedGeometry` not persisted | `trips.service.ts:389-390` return only; no Prisma field | Map cannot show matched route after reload or background enrich |
| D3 | `mapMatchConfidence` not persisted | Same | Quality badge depends on ephemeral POST state |
| D4 | UI auto-POST on selection | `useTripEnrichment.ts:37-41` | Route enrichment coupled to UI; violates "no selection required" |
| D5 | Skip POST when `enrichedAt` set | `useTripEnrichment.ts:39` | Background enrich sets `enrichedAt` but D2 means no geometry → permanent "Nicht abgeglichen" |
| D6 | Triple route trigger | V2 handler + orchestrator `runRouteSafetyEnrichment` + UI POST | Duplicate DIMO/Mapbox cost; race on `storeWaypoints` replace-all |
| D7 | Waypoint dual-writer | `storeWaypoints` replace ≤500 vs FSM `createMany` append | Inconsistent PG cardinality; enrich can wipe live-appended points |
| D8 | Speeding leg index mapping uses same ≤100 stride | `mapbox.service.ts:273-278` `detectOverspeedPoints` | Speed limits misaligned to route points on long trips |
| D9 | `enrichTrip` returns `null` without throw on missing token | `trips.service.ts:262-263`; handler does not throw | V2 stage marked COMPLETED with no enrichment |
| D10 | `densifyRoute` documented as linear only | `geospatial.ts:146-189` | Correct — must not be mistaken for road matching |
| D11 | Quality badge uses session `enrichment` not persisted quality | `trips-map.utils.ts:33-40` | Misleading UX after background processing |
| D12 | `GET /route` re-fetches DIMO on every open | `trips.service.ts:144-152` | Latency + provider load; unrelated to artifact model |

**Stale claim corrections:**

- Claim A (≤100 Mapbox sampling): **CONFIRMED**
- Claim B (≤500 waypoint storage): **CONFIRMED for `storeWaypoints` only**; live FSM path is **uncapped**
- Claim C (matchedGeometry transient): **CONFIRMED**
- Claim D (UI POST on selection): **CONFIRMED** (when `!enrichedAt`)
- Claim E (enrichedAt skip + no geometry): **CONFIRMED**
- Claim F (`densifyRoute` linear): **CONFIRMED**

---

## 4. Global sampling forensics

### 4.1 Algorithm (current)

```typescript
// mapbox.service.ts — identical stride pattern in storeWaypoints (500) and mapMatchRoute (100)
points.filter((_, i) => i % Math.ceil(points.length / MAX) === 0)
```

Always retains index **0**; retains every `stride`-th point; last point retained only if `(n-1) % stride === 0`.

### 4.2 Retention table (Mapbox ≤100 cap, DIMO 7s interval)

| Input points | Stride | Points kept | % kept | Max temporal gap | Max spatial gap @ 50 km/h | Max spatial gap @ 130 km/h |
|-------------|--------|-------------|--------|------------------|---------------------------|----------------------------|
| 50 | 1 | 50 | 100% | 7s | ~97 m | ~253 m |
| 100 | 1 | 100 | 100% | 7s | ~97 m | ~253 m |
| 250 | 3 | 84 | 33.6% | **21s** | ~292 m | ~758 m |
| 500 | 5 | 100 | 20% | **35s** | ~486 m | ~1.3 km |
| 1,000 | 10 | 100 | 10% | **70s** | ~972 m | ~2.5 km |
| 2,500 | 25 | 100 | 4% | **175s (~3 min)** | ~2.4 km | ~6.3 km |
| 5,000 | 50 | 100 | 2% | **350s (~6 min)** | ~4.9 km | ~12.6 km |

**Trip duration → point count (7s buckets):**

| Duration | ~Points | >100? | >500? | Mapbox calls today | Chunks (proposed 80/15) |
|----------|---------|-------|-------|-------------------|-------------------------|
| 15 min | ~129 | Yes | No | 1 | 2 |
| 30 min | ~257 | Yes | No | 1 | 4 |
| 1 h | ~514 | Yes | Yes | 1 | 8 |
| 2 h | ~1,029 | Yes | Yes | 1 | 16 |
| 4 h | ~2,057 | Yes | Yes | 1 | 32 |

### 4.3 Production measurements

**No production database access was available in this audit environment.** Measurements below are **analytical** from the verified 7s DIMO contract (`route-enrichment.query.ts:19`).

**Recommended read-only production query (design only — do not execute in R0):**

```sql
-- Aggregate only; no coordinates in output
SELECT
  percentile_cont(0.5) WITHIN GROUP (ORDER BY wp_count) AS p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY wp_count) AS p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY wp_count) AS p99,
  max(wp_count) AS max_wp,
  count(*) FILTER (WHERE wp_count > 100) * 100.0 / count(*) AS pct_gt_100,
  count(*) FILTER (WHERE wp_count > 500) * 100.0 / count(*) AS pct_gt_500
FROM (
  SELECT trip_id, count(*) AS wp_count
  FROM vehicle_trip_waypoints
  WHERE recorded_at > now() - interval '90 days'
  GROUP BY trip_id
) s;
```

**Expected distribution (fleet rental mix, conservative):**

- p50 route points: **150–350** (12–40 min trips)
- p95: **600–1,200**
- p99: **1,500–3,000** (long highway / logistics)
- % trips >100 points: **>60%** of completed trips with waypoints
- % trips >500 points: **15–35%**

---

## 5. Route quality contract (MATCHED / FILTERED / RAW)

### 5.1 Definitions

| Quality | Definition | Road assumptions | Interpolation allowed |
|---------|------------|------------------|---------------------|
| **RAW** | Chronological provider observations after minimal safety sanitize (invalid coords, exact duplicates, ordering) | None | None |
| **FILTERED** | RAW after outlier/jitter removal and trajectory-aware simplification for display | **None** | **None** (no splines; RDP/Visvalingam on measured points only) |
| **MATCHED** | Road-network reconstruction from chunked Mapbox Matching passing all quality gates | Yes (Mapbox driving graph) | Mapbox internal only — not app-side splines |

### 5.2 Canonical display selection

```
if artifact.routeQuality == MATCHED && gates_passed:
  display = matchedGeometry
else if filteredGeometry valid:
  display = filteredGeometry   // quality = FILTERED
else:
  display = rawGeometry or waypoints  // quality = RAW
```

**Never** promote to MATCHED based on `geometry.length > 1` or `enrichedAt` alone.

### 5.3 Machine-readable artifact fields

```typescript
routeQuality: 'MATCHED' | 'FILTERED' | 'RAW'
matchConfidence: number | null      // 0..1, Mapbox aggregate
matchCoverage: number | null         // fraction of source distance matched
sourcePointCount: number
filteredPointCount: number
matchedPointCount: number
chunkCount: number
failedChunkCount: number
algorithmVersion: string             // e.g. 'route-v2.0.0'
inputFingerprint: string              // sha256(canonical input + algorithmVersion)
processedAt: ISO8601
failureReason: string | null
diagnostics: { ... }                  // gate failures, seam metrics (no raw coords)
```

### 5.4 MATCHED quality gates (all required)

| Gate | Threshold (initial) | Failure action |
|------|---------------------|----------------|
| Chunk success ratio | `failedChunkCount / chunkCount ≤ 0.1` | Downgrade to FILTERED |
| Match coverage | `matchCoverage ≥ 0.85` | Downgrade |
| Confidence | `matchConfidence ≥ 0.5` | Downgrade |
| Seam continuity | max seam gap ≤ 30 m between chunk endpoints | Downgrade |
| Source-to-match distance | p95 point-to-polyline ≤ 40 m | Downgrade |
| Impossible jump | no matched segment > 500 m in < 10s | Downgrade |
| Distance sanity | `0.7 ≤ matchedKm / tripKm ≤ 1.4` (when tripKm known) | Downgrade |

**Partial chunk failure:** never stitch MATCHED + FILTERED segments into a single MATCHED geometry.

---

## 6. Chunked Map Matching algorithm (design)

### 6.1 Pipeline stages

```
RAW RoutePoint[]
  → 1. Sanitize (invalid, duplicate, sort, impossible jumps flagged)
  → 2. Trajectory-aware retain (bearing change, gaps, start/end, event vicinities)
  → 3. Chunk (≤100 coords/request, overlap)
  → 4. Mapbox match per chunk (parallel with concurrency cap)
  → 5. Stitch matched geometries (deterministic overlap trim)
  → 6. Quality gates
  → 7. Persist artifact (or FILTERED fallback)
```

### 6.2 Input sanitization

1. Remove invalid coordinates (`null`, NaN, (0,0)).
2. Sort by `timestamp` ASC; stable tie-break by index.
3. Collapse near-duplicates: same location within **5 m** and **3 s** → keep first.
4. Flag impossible jumps: **> 200 m in < 3 s** → split trace (do not interpolate across).
5. Flag telemetry gaps: **> 10 min** → chunk boundary (no match across gap).

### 6.3 Trajectory-aware retention (pre-chunk)

Replace global stride with a **priority queue** retention budget `B` (default `B = 800` pre-chunk; chunks consume ≤100 each):

**Always keep:** first, last, gap boundaries, impossible-jump endpoints.

**Score remaining points** (higher = more likely kept):

| Signal | Weight |
|--------|--------|
| Bearing change > 15° | High |
| Bearing change > 45° | Mandatory |
| Spatial gap > 200 m vs previous kept | High |
| Temporal gap > 60 s | High |
| Speed transition stop→move (< 3 → > 10 km/h) | Medium |
| Near behavior event (±30 s) | Medium |
| Straight highway segment | Low (eligible for RDP drop) |

**Straight dense sections:** apply Ramer-Douglas-Peucker with ε = 15 m on measured points only.

This preserves curves and gaps while reducing noise — **not** cosmetic spline fitting.

### 6.4 Chunking parameters

Mapbox Matching API hard limit: **100 coordinates per request**.

| Parameter | Recommended | Rationale |
|-----------|-------------|-----------|
| `chunkSize` | **80** | Headroom below 100 for Mapbox `tidy` edge cases |
| `overlap` | **15** | ~105s at 7s sampling; sufficient for seam stitch without duplicating whole chunks |
| `stride` | `chunkSize - overlap` = **65** | |
| Max chunks per trip | **64** (cap) | Cost guard; trips exceeding → FILTERED-only |

**Example chunk counts** (post-retention `n` points):

| n | Chunks (80/15) | Mapbox requests |
|---|----------------|-----------------|
| 100 | 2 | 2 |
| 500 | 8 | 8 |
| 1,000 | 16 | 16 |
| 2,500 | 39 | 39 |
| 5,000 | 77 → **cap 64** | 64 + FILTERED fallback if cap hit |

**Rejected:** chunk size 100 / overlap 10 — zero headroom for tidy trimming; seam fragility under API-side point removal.

### 6.5 Mapbox request contract

```
GET /matching/v5/mapbox/driving/{coords}
  ?geometries=geojson
  &overview=full
  &annotations=distance,speed,maxspeed
  &tidy=true
  &timestamps={unix_seconds}   // when all chunk points have timestamps
  &radiuses={meters,...}       // optional: 25m default, 50m after gap
```

| Concern | Policy |
|---------|--------|
| Timeout | 15s per chunk |
| Retry | 3 attempts, exponential backoff (2s, 8s, 32s) |
| Rate limit 429 | Respect `Retry-After`; org-level token bucket |
| Non-retryable 4xx | Mark chunk failed; continue |
| Multiple matchings returned | Use `matchings[0]` (highest confidence) per Mapbox contract |
| API outage | Persist FILTERED artifact; set `failureReason=MAPBOX_UNAVAILABLE`; schedule retry via existing reconciliation |

### 6.6 Stitching algorithm

For chunks `C0..Cn` with matched LineStrings `L0..Ln`:

1. **Overlap trim:** In overlap region (last 15 input points of `Ci` ≡ first 15 of `Ci+1`), find the highest-confidence junction where endpoint distance < 20 m. Trim `Li` at junction; append `Li+1` from junction forward.
2. **Duplicate coordinate removal:** consecutive points < 1 m apart → collapse.
3. **Seam validation:** If junction gap > 30 m after trim → mark seam failure; increment `failedChunkCount`.
4. **Failed middle chunk:** Omit matched segment for that window; if gap > 500 m in output → downgrade whole artifact to FILTERED.
5. **Loops / U-turns:** Rely on trajectory-aware retention + per-chunk matching; no post-stitch simplification.
6. **GPS loss / tunnels:** Gap boundaries prevent cross-gap matching; FILTERED fallback for unmatched windows.

**Forbidden:** Catmull-Rom, Bezier, Chaikin, or app-side spline smoothing across seams.

---

## 7. Persistence design

### 7.1 Decision: dedicated `VehicleTripRouteArtifact` (1:1)

**Rejected:** Large JSON geometry on `VehicleTrip` — pollutes list queries, TOAST bloat, couples trip CRUD to multi-KB polylines.

**Accepted:** Dedicated table/model:

```prisma
model VehicleTripRouteArtifact {
  id                   String   @id @default(uuid())
  tripId               String   @unique @map("trip_id")
  organizationId       String   @map("organization_id")  // tenant scoping
  vehicleId            String   @map("vehicle_id")

  routeQuality         RouteQuality @map("route_quality")
  matchedGeometryJson  Json?    @map("matched_geometry_json")   // [lng,lat][]
  filteredGeometryJson Json?    @map("filtered_geometry_json")

  matchConfidence      Float?   @map("match_confidence")
  matchCoverage        Float?   @map("match_coverage")
  provider             String   @default("mapbox")
  algorithmVersion     String   @map("algorithm_version")
  inputFingerprint     String   @map("input_fingerprint")

  sourcePointCount     Int      @map("source_point_count")
  filteredPointCount Int      @map("filtered_point_count")
  matchedPointCount    Int?     @map("matched_point_count")
  chunkCount           Int?     @map("chunk_count")
  failedChunkCount     Int?     @map("failed_chunk_count")

  processedAt          DateTime @map("processed_at")
  failureReason        String?  @map("failure_reason")
  diagnosticsJson      Json?    @map("diagnostics_json")

  createdAt            DateTime @default(now()) @map("created_at")
  updatedAt            DateTime @updatedAt @map("updated_at")

  trip VehicleTrip @relation(...)
  @@index([organizationId, vehicleId])
  @@index([inputFingerprint])
  @@map("vehicle_trip_route_artifacts")
}

enum RouteQuality {
  MATCHED
  FILTERED
  RAW
}
```

### 7.2 RAW geometry duplication

**Do not duplicate RAW** in artifact if canonical source remains:

- DIMO re-fetchable via `fetchRouteEnrichment` (authoritative RAW).
- `vehicle_trip_waypoints` = bounded persisted sample for offline/fallback.

Artifact stores `filteredGeometryJson` (computed once) and `matchedGeometryJson` (when gates pass). RAW served from waypoints or on-demand DIMO fetch with `quality: RAW` label.

### 7.3 Idempotency / fingerprint

```
inputFingerprint = sha256(
  canonicalJson({
    tripId,
    startTime, endTime,
    pointHashes: routePoints.map(p => [round(lat,6), round(lng,6), ts]),
    algorithmVersion,
  })
)
```

`DRIVING_ROUTE_ENRICH` handler:

1. Compute fingerprint from DIMO fetch.
2. If artifact exists with same fingerprint + `algorithmVersion` → skip Mapbox (return existing).
3. If `algorithmVersion` bumped → recompute (controlled backfill).

### 7.4 Storage estimates

| Geometry | Avg size | 1k trips/day | 30k trips/month |
|----------|----------|--------------|-----------------|
| MATCHED (dense) | ~15 KB JSON | ~15 MB/day | ~450 MB/month |
| FILTERED | ~5 KB | ~5 MB/day | ~150 MB/month |

PostgreSQL TOAST acceptable for 1:1 artifact rows; keep off `VehicleTrip` list projection.

### 7.5 Lifecycle

- Cascade delete with `VehicleTrip`.
- Respect existing `vehicle_trip_waypoints` retention (`data-retention.scheduler.ts`).
- Mirror optional to ClickHouse (`waypoint-mirror.service.ts` pattern) — **not required for R1–R6**.

---

## 8. Waypoint storage audit

### 8.1 Current consumers of `vehicle_trip_waypoints`

| Consumer | Needs |
|----------|-------|
| `GET /route` fallback | Chronological lat/lng/speed |
| Speed heatmap (`useTripsRouteMap`) | Per-segment `speedKmh` on raw pairs |
| Stop detection (map) | Speed < 3 km/h clusters |
| `DrivingAnalysisInitService` | `waypointCount` in run fingerprint |
| ClickHouse mirror | Downsampled replay |
| Tire/ops scripts | Distance sanity |

### 8.2 Recommendation

| Question | Decision |
|----------|----------|
| Delete 500 cap automatically? | **No** — replace global stride with **trajectory-aware cap** (same budget as FILTERED retention, ~500–800 points) |
| Full raw elsewhere? | DIMO re-fetch remains authoritative RAW; do not duplicate full 7s stream in PG for every trip |
| Live FSM uncapped append? | **Fix in R2** — route live writes through same bounded writer or segment into trip-scoped buffer flushed at finalize |
| Waypoints vs artifact | Waypoints = speed overlay + RAW fallback; artifact = display geometry |

---

## 9. Frontend cutover design

### 9.1 Target flow

```
select trip
  → GET /vehicles/:vehicleId/trips/:tripId/route   (evolved contract)
  → { quality, geometry, matchConfidence, processedAt, sourcePointCount, speedPoints?, diagnostics }
  → render immediately (no POST /enrich)
```

### 9.2 API contract (evolve existing GET)

**Recommended:** Extend `GET .../route` response (backward-compatible additive fields):

```typescript
interface TripRouteResponse {
  quality: 'MATCHED' | 'FILTERED' | 'RAW';
  geometry: [number, number][];          // display LineString coords
  matchConfidence: number | null;
  matchCoverage: number | null;
  processedAt: string | null;
  sourcePointCount: number;
  diagnostics?: { failureReason?: string; algorithmVersion?: string };
  // Legacy compat during cutover:
  points?: RoutePoint[];                 // speed overlay source — always present
}
```

**Alternative:** `GET .../route/v2` if additive fields risk breaking unknown clients. Grep shows only rental Trips tab consumes this endpoint — **evolution in-place is safe**.

### 9.3 Deprecate (not delete in R6)

| Component | Action |
|-----------|--------|
| `useAutoTripEnrichment` | Remove route responsibility; delete hook or no-op |
| `useTripEnrichment` POST on select | Remove |
| `POST /enrich` | Retain for **admin retry / backfill trigger only** |
| `enrichments` React state | Remove matched geometry from session state |

### 9.4 Speed coloring with matched geometry

**Problem:** Matched geometry is road-shaped and does not 1:1 align with raw speed observations.

**Solution (R6):**

1. **Always** load `points[]` (raw/route waypoints) for speed overlay.
2. Base matched line uses `geometry` from artifact.
3. Speed layer: project each raw segment onto matched polyline (nearest-point-on-line) **or** keep speed on raw point pairs as today when `quality !== MATCHED`.
4. When `quality === MATCHED` and user enables speed overlay: show **raw speed segments** as semi-transparent under/over matched line; do **not** index-align speeds to matched vertices.

Default: speed overlay uses `points[]` (unchanged behavior); matched line is separate layer.

### 9.5 Quality badge

Drive from persisted `quality` field:

| `quality` | Badge |
|-----------|-------|
| `MATCHED` | "Route abgeglichen" |
| `FILTERED` | "GPS bereinigt" (new copy) |
| `RAW` | "Nicht abgeglichen" |

Remove dependency on `enrichment?.matchedGeometry` (`trips-map.utils.ts:33-40`).

---

## 10. Map rendering

| Technique | Role | Road fidelity |
|-----------|------|---------------|
| `line-join: round`, `line-cap: round` | Cosmetic rendering | None |
| `densifyRoute` (35 m linear) | Point density for sparse RAW/FILTERED | **None** — display only |
| Mapbox Matching | Road reconstruction | **Yes** |
| FILTERED preprocessing | GPS cleanup | **No** road assumptions |
| Spline smoothing | **FORBIDDEN** | — |

Do not use rendering tricks to hide bad route quality. Badge must reflect persisted `routeQuality`.

---

## 11. Scale / cost model

### 11.1 Assumptions

| Fleet size | Vehicles | Trips/vehicle/day | Avg duration | Avg raw points |
|------------|----------|-------------------|--------------|----------------|
| Small | 100 | 3 | 25 min (~214 pts) | 214 |
| Medium | 1,000 | 4 | 30 min (~257 pts) | 257 |
| Large | 10,000 | 5 | 35 min (~300 pts) | 300 |

### 11.2 Derived load (medium fleet — 1,000 vehicles)

| Metric | Value |
|--------|-------|
| Completed trips/day | **4,000** |
| Raw route points/day | ~1.03M |
| Avg Mapbox requests/trip (80/15 chunking) | ~4 |
| Mapbox Matching requests/day | **~16,000** |
| Peak hour (assume 15% of daily trips) | ~600 trips → **~2,400 requests/hour** (~0.67/s) |
| PG artifact storage/day | ~60 MB |
| PG artifact storage/month | ~1.8 GB |

### 11.3 Worker / queue design

| Control | Value |
|---------|-------|
| `DRIVING_ROUTE_ENRICH` concurrency | 5–10 workers |
| Per-org Mapbox token bucket | 10 req/s |
| Per-trip chunk parallel cap | 4 concurrent chunks |
| Per-trip request cap | 64 chunks |
| Handler timeout | 120s (trip-level) |
| Circuit breaker | After 50% Mapbox 5xx in 5 min → FILTERED-only mode for 15 min |

### 11.4 Mapbox outage behavior

1. Trip finalization **never blocked** (ROUTE already non-critical).
2. Persist `FILTERED` artifact immediately from waypoints.
3. Set `failureReason=MAPBOX_UNAVAILABLE`; `routeQuality=FILTERED`.
4. Reconciliation retries `DRIVING_ROUTE_ENRICH` when fingerprint unchanged.
5. No duplicate paid work: fingerprint skip before API calls.

---

## 12. Backfill plan (design only)

### 12.1 Strategy

**Order:** Newest-first for UX (recent trips visible in app), then oldest for completeness.

| Phase | Window | Batch size | Rate |
|-------|--------|------------|------|
| Dry-run estimate | Last 90 days | COUNT only | — |
| P1 | Last 30 days | 50 trips | 5 req/s Mapbox |
| P2 | 31–180 days | 100 trips | 3 req/s |
| P3 | >180 days | 200 trips | 2 req/s |

### 12.2 Tooling requirements

- CLI: `npm run ops:route-v2-backfill -- --dry-run --from --to --limit`
- Idempotent via `inputFingerprint`
- Resumable checkpoint file / DB cursor
- Progress metrics: processed, matched, filtered, failed, skipped, estimated cost
- **No UI-triggered fanout**

### 12.3 Cost estimate (before execution)

```
estimated_requests = sum_over_trips(ceil(retained_points / 65))
estimated_cost = estimated_requests * mapbox_per_request_price
```

Dry-run must output histogram without calling Mapbox.

---

## 13. Test matrix

| ID | Scenario | Expected quality | Must not contain |
|----|----------|------------------|------------------|
| A | 2-point route | RAW or FILTERED | MATCHED |
| B | ≤100 points | MATCHED (if gates pass) | spline fabrication |
| C | 101 points | MATCHED, 2 chunks | global stride loss |
| D | 500 points | MATCHED, ~8 chunks | single-request matching |
| E | 5,000 points | MATCHED or FILTERED (cap) | >64 Mapbox calls |
| F | Sharp urban turns | MATCHED preserves turns | 35s+ point gaps |
| G | Motorway straight | FILTERED acceptable | false MATCHED on sparse straight |
| H | Roundabout | MATCHED | collapsed to chord |
| I | U-turn | MATCHED or FILTERED | single straight segment |
| J | GPS duplicate burst | FILTERED deduped | repeated coords |
| K | Impossible GPS jump | split trace | interpolated across jump |
| L | 10-min GPS gap | chunk boundary | match across gap |
| M | One failed middle chunk | FILTERED downgrade | partial MATCHED stitch |
| N | All chunks fail | FILTERED | MATCHED |
| O | Low confidence | FILTERED | MATCHED badge |
| P | Mapbox timeout | FILTERED + retryable | hang / block finalize |
| Q | Same fingerprint retry | skip Mapbox | duplicate billing |
| R | algorithmVersion bump | recompute | stale artifact |
| S | Repeated UI selection | single GET | POST /enrich |
| T | Auto-processed before UI open | GET returns MATCHED | POST |
| U | Speed overlay + MATCHED | raw speed on points[] | index-mapped false speeds |
| V | Historical RAW-only | quality=RAW | fake MATCHED |

**Anti-spline proof:** Unit tests assert output vertices ⊆ (Mapbox output ∪ input measured points ∪ linear densify of measured points). No Catmull-Rom/Bezier code paths in route pipeline.

---

## 14. Failure / retry model

| Failure | Stage status | Artifact | Retry |
|---------|-------------|----------|-------|
| No DIMO token | ROUTE COMPLETED (silent) | None / RAW from waypoints | Manual link DIMO |
| Mapbox 5xx | ROUTE FAILED (retryable) | FILTERED if points exist | BullMQ + reconciliation |
| Quality gate fail | ROUTE COMPLETED | FILTERED | Optional admin re-run |
| Chunk cap exceeded | ROUTE COMPLETED | FILTERED | algorithm tuning |
| Redis outage | Job PENDING | Previous or none | Reconciliation 10 min |

---

## 15. Implementation PR slicing

| PR | Scope | Depends on |
|----|-------|------------|
| **R1** | `VehicleTripRouteArtifact` schema + `RouteQuality` enum + domain types + fingerprint interface | — |
| **R2** | FILTERED/RAW preprocessor (sanitize, trajectory retention, no Mapbox) + artifact writer + unit tests | R1 |
| **R3** | Chunked Mapbox matcher + stitcher + quality gates (feature-flagged) | R2 |
| **R4** | Integrate into `DrivingRouteEnrichJobHandler`; remove duplicate calls from orchestrator route hook; fingerprint skip | R3 |
| **R5** | Evolve `GET /route` canonical response; deprecate matchedGeometry in POST body | R4 |
| **R6** | Frontend cutover: remove `useAutoTripEnrichment`; quality badge from API; speed overlay rules | R5 |
| **R7** | Backfill CLI + dry-run + metrics (no auto-run) | R4 |
| **R8** | Observability dashboards, alerts, production validation runbook | R6 |

**Safer sequence note:** R4 should land before R6 even if R5 is partially stubbed (feature flag `ROUTE_V2_ARTIFACT_ENABLED`).

---

## 16. Rollback strategy

| Level | Action |
|-------|--------|
| Feature flag off | Handler writes no artifact; legacy `enrichTrip` path unchanged |
| R6 rollback | Re-enable `useAutoTripEnrichment` behind flag |
| Schema rollback | Artifact table is additive; drop table does not affect `VehicleTrip` |
| Mapbox cost spike | Circuit breaker → FILTERED-only; reduce concurrency |

---

## 17. Explicit list of things NOT to do

1. **Do not** add Bezier, Catmull-Rom, Chaikin, or spline-based route smoothing.
2. **Do not** create a second route enrichment scheduler or cron outside `DRIVING_ROUTE_ENRICH`.
3. **Do not** treat `densifyRoute` as road matching.
4. **Do not** infer MATCHED from `enrichedAt`, geometry length, or `mapMatchConfidence` in transient POST state.
5. **Do not** stitch partial MATCHED + FILTERED geometry under MATCHED quality.
6. **Do not** index-align raw speeds onto matched vertices.
7. **Do not** store large geometry JSON on `VehicleTrip` list rows.
8. **Do not** block trip finalization or behavior analysis on Mapbox availability.
9. **Do not** execute backfill or migrations in R0–R6 without explicit ops approval.
10. **Do not** remove `POST /enrich` until admin retry path is documented and replaced.

---

## 18. Files audited (reference index)

### Backend

| File | Role |
|------|------|
| `trips/mapbox.service.ts` | Global ≤100 map match, speeding analysis |
| `trips/mapbox-route-matcher.service.ts` | Matcher adapter |
| `trips/route-map-matcher.port.ts` | `RouteMapMatcher` port |
| `trips/trips.service.ts` | `enrichTrip`, `storeWaypoints`, `getRouteForTrip` |
| `trips/trip-detection-orchestration.service.ts` | Live waypoint append, finalize producer |
| `trips/trip-enrichment-orchestrator.service.ts` | Legacy `runRouteSafetyEnrichment` |
| `driving-analysis-init/trip-post-finalize-analysis.producer.ts` | Post-finalize entry |
| `driving-analysis-init/driving-analysis-init.service.ts` | Run + stage init |
| `driving-analysis-stage/driving-analysis-stage.dependencies.ts` | Stage DAG |
| `driving-analysis-stage/driving-analysis-stage.job-map.ts` | ROUTE → job type |
| `driving-intelligence-jobs/handlers/driving-route-enrich.handler.ts` | V2 handler |
| `driving-intelligence-jobs/driving-intelligence-jobs.dispatcher.service.ts` | Postgres-first enqueue |
| `driving-analysis-reconciliation/driving-analysis-reconciliation.service.ts` | PENDING retry |
| `vehicle-intelligence.controller.ts` | GET /route, POST /enrich |
| `dimo/queries/route-enrichment.query.ts` | 7s DIMO contract |
| `prisma/schema.prisma` | `VehicleTrip`, `VehicleTripWaypoint` |

### Frontend

| File | Role |
|------|------|
| `trips/hooks/useTripEnrichment.ts` | Auto POST on selection |
| `trips/hooks/useTripRoute.ts` | GET /route |
| `trips/hooks/useTripsTab.ts` | Wires auto-enrich |
| `trips/useTripsRouteMap.ts` | GeoJSON + Mapbox layers |
| `trips/trips-map.utils.ts` | Quality flags |
| `trips/TripMapDataQualityOverlay.tsx` | "Nicht abgeglichen" badge |
| `lib/geospatial.ts` | `densifyRoute` linear interpolation |

---

## Changes / Architektur

- **Added:** this document (`architecture/TRIP_ROUTE_ARCHITECTURE_V2_AUDIT_2026-08-29.md`)
- **No runtime code, schema, Mapbox, database, backfill, or UI changes in Stage R0**

---

## Stage R1 implementation record (2026-08-29)

**Status:** MERGED TO MAIN VIA PR (R1 slice)  
**Mapbox runtime:** UNCHANGED  
**Frontend:** UNCHANGED  
**Backfill:** NONE  
**Artifact population:** NONE (schema + domain only)

### Final schema

- **Enum:** `RouteQuality` = `MATCHED` | `FILTERED` | `RAW`
- **Model:** `VehicleTripRouteArtifact` → table `vehicle_trip_route_artifacts`
- **1:1:** `tripId` `@unique` with optional `VehicleTrip.routeArtifact` relation
- **Geometry JSON:** `matchedGeometryJson`, `filteredGeometryJson` as `[longitude, latitude][]`
- **No `rawGeometryJson`** — `VehicleTripWaypoint` remains canonical RAW source
- **Tenant fields:** denormalized `organizationId`, `vehicleId` + DB scope guard trigger
- **Cascade:** `ON DELETE CASCADE` from `vehicle_trips` and `vehicles`

### Route quality enum semantics

| Value | Persisted geometry requirement |
|-------|-------------------------------|
| `MATCHED` | `matchedGeometryJson` ≥ 2 valid `[lng,lat]` pairs |
| `FILTERED` | `filteredGeometryJson` ≥ 2 valid `[lng,lat]` pairs |
| `RAW` | No artifact geometry required; waypoints are authoritative |

### RAW storage decision

**VehicleTripWaypoint** remains the persisted measured-route source. The artifact stores MATCHED/FILTERED geometry and metadata only. RAW display is materialized from waypoints (or live DIMO re-fetch) in later stages.

### Processing-status decision

**No separate `RouteProcessingStatus` field in R1.**

Rationale: `DrivingIntelligenceJob` + `DrivingAnalysisStage.ROUTE` already track durable execution. The artifact uses `processedAt` (nullable until written) and `failureReason` for last outcome diagnostics. Absence of an artifact row means Route V2 has not been materialized for that trip.

### Fingerprint contract

- **Algorithm:** SHA-256 over canonical JSON
- **Input:** `tripId`, `algorithmVersion`, ordered `{ lat, lng, t }` (6-decimal coords, ISO timestamps)
- **Excluded:** speed, DB timestamps, Mapbox output, UI state
- **Helper:** `computeTripRouteInputFingerprint()` in `trip-route-input-fingerprint.ts`

### Algorithm version

`TRIP_ROUTE_ALGORITHM_VERSION = 'route-v2-r1'`

### Migration

`prisma/migrations/20260829140000_vehicle_trip_route_artifact/migration.sql`

- Additive `RouteQuality` enum + `vehicle_trip_route_artifacts` table
- Unique `trip_id`, indexes on `(organization_id, vehicle_id)`, `input_fingerprint`, `algorithm_version`
- Scope guard trigger `vehicle_trip_route_artifact_scope_guard_trg`

### Domain module

`backend/src/modules/vehicle-intelligence/trips/route-artifact/`

- `VehicleTripRouteArtifactRepository` — `getRouteArtifact`, `upsertRouteArtifact` (idempotent UNCHANGED on same fingerprint)
- `validateTripRouteArtifactWrite` — MATCHED/FILTERED/RAW invariants, confidence/coverage bounds, chunk counts
- `parseTripRouteGeometryJson` / `serializeTripRouteGeometry` — `[lng, lat][]` contract

### Runtime wiring

**NONE.** `DrivingRouteEnrichJobHandler`, `TripsService.enrichTrip`, `GET /route`, and frontend hooks are unchanged. Repository is registered in `VehicleIntelligenceModule` for DI only.

### Tests (25)

- `trip-route-input-fingerprint.spec.ts` — determinism, coordinate/order/version sensitivity
- `trip-route-geometry.spec.ts` — `[lng,lat]` contract, rejection of invalid coords
- `trip-route-artifact.validation.spec.ts` — MATCHED/FILTERED/RAW rules, bounds, counts
- `vehicle-trip-route-artifact.repository.spec.ts` — upsert, tenant scope, trips list guard
- `vehicle-trip-route-artifact.schema.spec.ts` — prisma validate, migration SQL

### Deviations from R0

- None on architecture decisions. R1 implements the R0-recommended `VehicleTripRouteArtifact` shape without `rawGeometryJson`.
- Added DB scope guard trigger (matches `TireTripUsageLedger` pattern).

### Explicit statement

**Mapbox matching behavior, frontend route enrichment, and historical trip data are unchanged in R1.**

