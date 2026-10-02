# TDL-OQ-006 — DIMO Segments ↔ Live FSM boundary authority audit

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ006-BOUNDARY-001 |
| **Cross-ref** | DIM-EVID-OQ006-BOUNDARY-001 (same audit, DIMO Integration index) |
| **Audited at (UTC)** | `2026-09-25` |
| **REPO_CURRENT** | `origin/main` @ post PR #1767 (`51b4590e43d4e9194fd7572e4c629daee54b3a55` baseline) |
| **PRODUCTION_CURRENT** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `20260924235024_v4994` |
| **Verdict** | **`RESOLVED_WITH_BOUNDED_GAPS`** |
| **Runtime changes** | **NONE** |

## Phase 0 — Stale / contradictory authority claims (corrected)

| Claim | Location | Audit finding |
|-------|----------|---------------|
| "DIMO Segments canonical boundary authority" (QS decision NON_EFFECTS) | TDL-DEC-QS-V1-001 | **Misleading without scope** — DIMO segments are **repair-layer evidence**, not live FSM boundary writers. Live canonical boundaries = **TripDecisionEngine** + orchestration. |
| "DIMO changePoint segments are the canonical repair source" | `TripReconciliationService.collectRepairCandidates` comment | **Repair-source priority only** — means preferred missing-trip **evidence fetch** when `useDimoSegmentFallback`, **not** override of persisted live FSM rows without gates. |
| DIM-GAP-001 / TDL-OQ-006 OPEN | Both authorities | **Closed by this audit** — ownership split documented below. |
| TDL-CX-006 partially superseded | OPEN_CONTRADICTIONS | **Still valid** — DI registry wording vs historical NOT_STARTED; segment **mutation** ownership now explicit. |

## Phase 1 — Provider segment layer (`DimoSegmentsService`)

### DIMO Integration owns

- JWT / auth (`DimoAuthService`)
- GraphQL transport (`DimoTelemetryService`, `queryGraphQLWithContext`)
- Segment query assembly (`buildTripSegmentsQuery`, `fetchTripSegmentsWithJwt`)
- Normalization → `DimoTripSegment`
- Mechanism iteration for **`fetchTripSegments`** (first non-empty mechanism wins)
- Energy-event segments (separate from driving trip lifecycle)

### DIMO Integration does NOT own

- **`VehicleTrip` lifecycle mutations** — no `prisma.vehicleTrip.create/update` in `dimo-segments.service.ts`
- Trip FSM state — no imports of `TripDecisionEngine` / orchestration

### V1 writer elimination (repository proof)

| Symbol | Status |
|--------|--------|
| `fetchAndDetectTrips` / `detectTrips` / segment `finalizeTrip` | **Removed** — comment @ `dimo-segments.service.ts:311-313` |
| `syncTripsFromSegments` | **Removed** from product path — only comment in `trip-reconciliation.service.ts`, `trips.service.ts` |
| Competing productive `vehicleTrip.create` | **Only** `TripDecisionEngine.createTrip` / split segment-2 create (`TRIP_OWNERSHIP.ts`) |

**`LEGACY_DIMO_TRIP_WRITER_PRESENT=NO`** (production path).

## Phase 2 — `DimoTripSegment` semantics

| Field | Role |
|-------|------|
| `segmentId` | Provider id; stored on repaired trips via `dimoSegmentId` when full candidate applied |
| `mechanism` | `changePointDetection` \| `frequencyAnalysis` \| `ignitionDetection` (+ energy types separate) |
| `startTime` / `endTime` | ISO boundaries; `endTime` null when ongoing |
| `isOngoing` | Filtered out of repair candidates |
| `startedBeforeRange` | Filtered out of repair candidates |
| `durationSeconds`, coords, odometer, distance | Confidence / partial-boundary alignment |

### Mechanism fallback order (`segmentMechanismFallbackOrder`)

1. `changePointDetection`
2. `frequencyAnalysis`
3. `ignitionDetection`

**Used only in** `fetchTripSegments()` — iterate until first mechanism returns **non-empty** list.

**`MECHANISM_ORDER_IS_BOUNDARY_AUTHORITY=NO`** — this is **provider fetch fallback**, not live FSM boundary hierarchy. Post-trip **validation** (`fetchTripSegmentsForMechanism`) compares mechanisms independently (read-only).

## Phase 3 — Reconciliation ingress

**Owner:** `TripReconciliationService` (replaces V1 `syncTripsFromSegments`).

| Trigger | DIMO segments queried? |
|---------|------------------------|
| Tiered / manual `reconcileWindow` | Yes when `useDimoSegmentFallback !== false` (default **true**) and `dimoTokenId > 0` |
| `detectAndRepairMissingTrips` | Via `collectRepairCandidates` |
| `repairMissingEnds` | **No** — CH assist / waypoints / grace; skips live-owned ONGOING |
| `repairIntraTripGapSplits` | **No** — waypoint gap scan |
| Live FSM finalize | **No** segment fetch for boundary commit |

### Evidence role matrix

| Context | DIMO segment role |
|---------|-------------------|
| Missing trip window, segments returned | **Primary repair candidate** (short-circuits CH ignition/motion in `collectRepairCandidates`) |
| Missing trip, DIMO empty | **Fallback unavailable** → ClickHouse ignition/motion (if assist enabled) |
| Overlap with existing trips | **Corroborating / conflicting** → `TripOverlapDetector` suppress or clip spans |
| Partial boundary feature enabled + `DIMO_SEGMENT` candidate | **Bounded extension evidence** → `classifyPartialBoundaryRepair` |
| `DimoTripSegmentValidationService` (DI pipeline) | **Analytics / validation only** — comparator explicitly read-only |
| Live mid-gap split | **Not used** — qualified stop + waypoints/core |

**`DIMO_SEGMENT_FALLBACK_ENABLED_BY_DEFAULT=YES`** (`useDimoSegmentFallback ?? true`).

## Phase 4 — Lifecycle mutation authority

```
DIMO segment (fetch)
  → RepairCandidate (MISSING_TRIP / partial classify)
  → TripOverlapDetector + coverage mode
  → TripRepair audit row
  → TripDecisionEngine.createRepairedTrip / finalizeRepairedTrip
     OR repairTripBoundariesWithAudit
  → VehicleTrip mutation
```

**`CANONICAL_TRIP_MUTATION_OWNER=TripDecisionEngine`** (sole `tripStatus` / lifecycle create; boundary repair via dedicated methods).

**`DIMO_SEGMENTS_DIRECTLY_MUTATE_VEHICLE_TRIP=NO`**.

## Phase 5 — Start boundary scenarios

| ID | Situation | Verdict | Code basis |
|----|-----------|---------|------------|
| S1 | FSM trip exists; DIMO start seconds earlier | **DIMO_REPAIR_ALLOWED** (conditional) | Partial extension if single intersecting trip, containment, ≤2h prefix, alignment — else overlap/missing-trip path |
| S2 | DIMO start much earlier | **CONDITIONAL** | Same gates; `maxExtensionMs` default 2h; else **AMBIGUOUS** / missing-trip span |
| S3 | DIMO start after FSM start | **FSM_CANONICAL** | Partial repair only **extends** start earlier, not later; shrink not auto-applied |
| S4 | No FSM trip; valid closed DIMO segment | **DIMO_FALLBACK_ONLY** | `createRepairedTrip` after overlap + HIGH/MEDIUM confidence |
| S5 | Start already boundary-repaired | **DUPLICATE_SAFE / idempotent** | `repairTripBoundariesWithAudit` no-op if boundaries unchanged; audit APPLIED immutable |
| S6 | Multiple mechanisms disagree | **N/A at reconcile fetch** | Reconciliation uses **first non-empty mechanism only**; validation job compares separately without mutation |

## Phase 6 — End boundary scenarios

| ID | Situation | Verdict |
|----|-----------|---------|
| E1 | FSM end; DIMO end seconds later | **DIMO_REPAIR_ALLOWED** (suffix partial extension gates) |
| E2 | DIMO end much later | **CONDITIONAL** (≤2h suffix extension + containment) |
| E3 | DIMO end earlier than FSM | **FSM_CANONICAL** — no automatic shorten; trip not contained → **AMBIGUOUS** |
| E4 | ONGOING; DIMO closed segment | **FAIL_CLOSED** for missing-end repair if live FSM owns trip or grace; DIMO ongoing segments **filtered out** of candidates |
| E5 | FSM trusted stop boundary / CUSUM | **FSM_CANONICAL** for live end; reconciliation missing-end skips live-owned; DIMO does not replace CUSUM end |
| E6 | Boundary already repaired | Idempotent refresh / suppressed duplicate |
| E7 | DIMO ongoing / null end | **Ignored** in `buildDimoSegmentCandidates` |

## Phase 7 — Split authority

| ID | Situation | Verdict |
|----|-----------|---------|
| P1 | FSM SAME_TRIP (≤300s); DIMO two segments | Second segment → overlap suppress or **missing-trip** only for uncovered span; **cannot merge two FSM trips via DIMO alone** |
| P2 | FSM split (>300s); DIMO one segment | **FSM_CANONICAL** split persisted; DIMO may **extend** boundaries of each trip separately, not collapse |
| P3 | Two FSM trips; DIMO spans both | **AMBIGUOUS** partial (`intersecting.length > 1`) — **FAIL_CLOSED** auto merge |
| P4 | One FSM trip; DIMO internal gap | **Retro split** via **waypoints** + `shouldSplitQualifiedStop` — **not** direct DIMO segment split |
| P5 | Different mechanism segmentation | Reconcile fetch picks **one** mechanism envelope; validation compares read-only |
| P6 | Live mid-gap already applied | Retro repair skips `endDetectionMode=MID_TRIP_GAP_SPLIT` rows for re-split scan; **CAN_DIMO_UNDO_EXISTING_FSM_SPLIT=NO** |

**`CAN_DIMO_SPLIT_EXISTING_FSM_TRIP=CONDITIONAL`** — only **`TripDecisionEngine.splitTripAtGap`** (live mid-gap or retro intra-gap), gated by **qualified stop 300_000 ms**, not raw DIMO segment count.

## Phase 8 — Qualified Stop V1

- Live mid-gap + retro `repairIntraTripGapSplits` use **`shouldSplitQualifiedStop(gapMs, maxSameTripQualifiedStopMs)`** from shared config (`trip-qualified-stop-duration.policy.ts`).
- DIMO segment duration does **not** define qualified-stop threshold.
- **`QUALIFIED_STOP_V1_CONTRACT_PRESERVED=YES`**
- **`SECOND_STOP_DURATION_AUTHORITY_FOUND=NO`** for stop/split (180s coverage remains separate repair coverage knob).

## Phase 9 — Conflict precedence (selected operations)

| Operation | Existing canonical state | New evidence | Mutation? | Winner | Reason |
|-----------|-------------------------|--------------|-----------|--------|--------|
| LIVE_START | RESTING / POSSIBLE_START | Snapshot/core | Yes | **FSM orchestration** | Segments not consulted on live start |
| LIVE_END | ACTIVE_TRIP | Core/CUSUM/provider stop | Yes | **TripDecisionEngine.finalizeTrip** | Segments not consulted |
| MISSING_TRIP | No covering trip | DIMO segment | Conditional | **Repair create** | Overlap + confidence gates |
| MISSING_TRIP | Partial coverage | DIMO segment | Conditional | **Clip to repairableSpans** | `enforce` coverage mode |
| PARTIAL_BOUNDARY | COMPLETED contained trip | DIMO wider envelope | Conditional | **TripDecisionEngine.repairTripBoundaries** | Extension-only containment rules |
| PARTIAL_BOUNDARY | Multiple trips intersect | DIMO segment | No | **FSM trips** | `AMBIGUOUS` |
| SPLIT | Completed trip waypoints | Gap > QS max | Conditional | **splitTripAtGap** | Waypoint-based retro path |
| VALIDATION | COMPLETED trip | All mechanisms | No | **FSM persisted** | DI comparator read-only |

## Phase 10 — Immutable vs repairable

| State | Meaning |
|-------|---------|
| Live FSM COMPLETED boundary | **Canonical, repairable** via explicit repair types only |
| `tripRepair.status=APPLIED` | **Protected audit history** — re-eval does not rewrite |
| Partial boundary mutation | **Optimistic concurrency** — `updateMany` on `(startTime,endTime)` → `BoundaryRepairConcurrentMutationError` |
| COMPLETED without repair path | **Protected from ad-hoc DIMO overwrite** — no code path applies raw segment replace |

DIMO may **extend** boundaries of COMPLETED trips only through **`repairTripBoundariesWithAudit`** + classification gates (default feature **on** unless `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false`).

## Phase 11 — Concurrency / idempotency

| Mechanism | Present |
|-----------|---------|
| `ReconciliationExecutionMutexService` per vehicle/org/tier | **YES** |
| `pg_advisory_xact_lock` inside intra-gap split transaction | **YES** (`acquirePgAdvisoryXactLock64`) |
| Deterministic `TripRepair` id (SHA window) | **YES** |
| Applied repair immutability | **YES** |
| Boundary repair CAS | **YES** |

Scenario classification: **DUPLICATE_SAFE** for repeated segment evaluation; **SERIALIZED** reconciliation mutex; **FAIL_CLOSED** on concurrent boundary mutation.

**`MULTI_REPLICA_CONFLICT_SAFE=YES`** (mutex + transactional CAS; duplicate reconcile skips).

## Phase 12 — Provider uncertainty

| Condition | Behavior in `fetchTripSegments` |
|-----------|----------------------------------|
| JWT unavailable | Returns **`[]`** — logged only at caller |
| Mechanism error / empty | Try next mechanism |
| All empty | **`[]`** |

**`EMPTY_SEGMENT_DISTINGUISHED_FROM_PROVIDER_FAILURE=NO`** for reconciliation fetch (bounded gap). Validation path **`fetchTripSegmentsForMechanism`** returns `providerError` separately.

**`DIMO_FETCH_FAILURE_FAILS_CLOSED=YES`** for mutation — empty fetch → fall through to CH or no missing-trip create; no "delete trip" interpretation.

Conflicting mechanisms during reconciliation fetch: **not combined** — first winning mechanism only (**not** fail-closed multi-mechanism merge).

## Phase 13 — Production read-only (90d window)

| Metric | Value |
|--------|-------|
| `MISSING_TRIP` APPLIED | 193 (134 with DIMO evidence in audit) |
| `PARTIAL_TRIP_BOUNDARY_EXTENSION` APPLIED | 7 |
| `INTRA_TRIP_GAP_SPLIT` APPLIED | 121 |
| `MISSING_TRIP` SUPPRESSED | 672 (overlap / duplicate) |

### Natural boundary comparisons (3)

| Trip ID | FSM end mode | Repair | Effect |
|---------|--------------|--------|--------|
| `24651a74-…` | COMPOSITE_INACTIVITY | Partial suffix | End extended to match DIMO CPD (+~5 min) |
| `8207a7a2-…` | NO_ACTIVITY_TIMEOUT | Partial prefix | Start moved earlier to match DIMO |
| `59668bcf-…` | MID_TRIP_GAP_SPLIT (segment 1) | Partial suffix | End extended post-split — **split not undone** |

All show **`boundaryRepair`** audit in `raw_detection_meta` + `changePointDetection` mechanism.

## Phase 14 — Production conflict scan

| Defect class searched | Result |
|-----------------------|--------|
| DIMO overwrote stronger FSM without audit | **0 confirmed** — mutations carry `boundaryRepair` / `trip_repairs` |
| Unexpected shorten | **Not observed** in partial repair samples (extension-only design) |
| Duplicate trip from DIMO | **672 SUPPRESSED** — overlap path working |
| Live split undone | **No code path** |
| QS contradiction | **Not observed** in sample set |
| Repair churn | PROPOSED rows expected for scanning tiers |

**`CONFIRMED_BOUNDARY_CORRUPTIONS=0`**

## Phase 15 — Ownership contract

### DIMO Integration owns

Provider auth, GraphQL segment transport, mechanism parsing, **`fetchTripSegments*`**, energy segments, recharge segments.

### Trip Detection & Lifecycle owns

Live FSM boundaries, **`TripDecisionEngine`** mutations, reconciliation classification, overlap/coverage, qualified stop split policy, **`TripRepair`** audit, partial boundary admission.

### DIMO segment role

**Repair and validation evidence** — may propose missing trips or **bounded extensions** to existing canonical trips when gates pass. **Never** direct lifecycle writer.

### Central question

**May a DIMO segment alone overwrite a completed live FSM trip?**

**NO** — segments alone do not write. Even after classification, **`TripDecisionEngine.repairTripBoundariesWithAudit`** requires containment, single-trip intersection, extension limits, overlap/coord checks, transactional CAS, and audit rows. **Shrink / merge / unsplit** are not automatic from DIMO segments.

## Phase 16 — Verdict rationale

**`RESOLVED_WITH_BOUNDED_GAPS`**

- Authority hierarchy is **code-proven** and **production-consistent** (repairs audited, suppressions present).
- Bounded gaps: JWT-unavailable vs empty segments indistinguishable in `fetchTripSegments`; limited natural-case timeline depth; legacy comment wording on "canonical repair source"; production coverage mode default **`shadow`** (overlap legacy binary still decides unless `enforce`).

**`NEW_RUNTIME_DEFECT_FOUND=NO`**

## Phase 17 — Recommended doc updates

See companion updates in TDL + DIMO authorities (this PR).
