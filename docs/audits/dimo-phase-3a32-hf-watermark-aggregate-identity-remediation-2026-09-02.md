# Phase 3A.3.2 — HF Watermark + Aggregate Bucket Identity Remediation

**Date:** 2026-09-02  
**Phase:** 3A.3.2 (correction pass + temporal/identity micro-pass 2026-09-02)
**Evidence ID:** DI-EV-0021 (amended in place — no new evidence ID)
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**Reference Drive:** `DIMO_LTE_R1_REFERENCE_DRIVE_001` (DI-EV-0016)  
**Base SHA:** `c3b4abfe6e24c9fc7f795ea52dde25830ac84fd9`

---

## Executive summary

Phase 3A.3.2 remediates two Reference Capture telemetry-integrity defects discovered during RD001 forensic reconstruction:

1. **HF watermark advanced on request wall-clock** (`requestStartedAt` / `now`) instead of max **persisted provider bucket timestamp**, permanently excluding late-arriving aggregate buckets behind a 2s overlap window.
2. **`physicalSampleFingerprint` included `normalizedValue`**, causing identical aggregate buckets with provider value revisions to appear as distinct physical samples.

**Correction pass (same phase, same evidence ID)** closes two additional blockers discovered during review:

3. **Durable idempotency gap** — in-memory `seenPhysicalSampleFingerprints` alone could not prevent duplicate physical rows after crash between PostgreSQL persist and `releaseCycleLockAndUpdateState()`.
4. **Unbounded query window** — a schema-supported but runtime-silent HF field without committed data watermark pinned `computeHfQueryFrom()` to `sessionStartedAt - overlap` forever.

**Temporal/identity micro-pass (same evidence ID)** closes three further consistency gaps:

5. **Previously active then silent field** — data watermark priority could re-pin query FROM after field stopped emitting despite advanced query coverage.
6. **Query coverage exceeded actual query TO** — coverage advanced to `requestCompletedAt` (HTTP boundary) instead of `requestStartedAt` (GraphQL TO).
7. **Legacy identity mislabel** — `LEGACY_VALUE_V1` fingerprint builder did not match historical V1 hash; active legacy sessions now fail closed.

**Verdicts:**

| Item | Result |
|------|--------|
| `HF_WATERMARK_REMEDIATION_REQUIRED` | **IMPLEMENTED** (code) |
| `PHYSICAL_SAMPLE_FINGERPRINT_REMEDIATION_REQUIRED` | **IMPLEMENTED** (code) |
| `PHASE_3A3_2_CODE_READY` | **YES** |
| `PHASE_3A3_2_PRODUCTION_VALIDATED` | **NO** |
| `READY_FOR_RD002` | **NO** |

---

## RD001 forensic reconstruction

### Call / data-flow map (pre-remediation)

```
executeAcquisitionCycle()
  └─ captureHistoricalSurface()
       ├─ from = hfWatermarkAt - 2s OR sessionStartedAt     [BUG: hfWatermarkAt was wall-clock]
       ├─ to   = requestStartedAt (pre-query wall clock)   [provenance only post-fix]
       ├─ DIMO GraphQL signals(tokenId, from, to, interval: "1s")
       ├─ for each row × providerField:
       │    ├─ physicalSampleFingerprint = hash(field, ts, value)  [BUG: value in identity]
       │    ├─ duplicateRetrieval flag only — row still persisted     [BUG: pre-3A.3.2]
       │    └─ enqueue observation
       ├─ hfWatermarkAt = now (always)                            [BUG: wall-clock advance]
       └─ releaseCycleLockAndUpdateState(acquisitionStateJson)
```

### Code authority (current symbols)

| Concern | Symbol / location |
|---------|-------------------|
| HF query FROM (per field) | `getFieldHfQueryFrom()` — **query coverage first**, then data watermark, then session start |
| ACTUAL_QUERY_TO (GraphQL) | `requestStartedAt` at query build (`resolveHfActualQueryTo`) |
| Query coverage advance | `hfQueryCoverageByField` ← ACTUAL_QUERY_TO only (not HTTP response) |
| HTTP latency provenance | `requestCompletedAt`, `httpResponseReceivedAt` (not query coverage) |
| Provenance query bounds | `hfWindowFrom`, `hfActualQueryTo` (`hfWindowTo` alias = actual query TO) |
| Committed HF watermark (global legacy) | `acquisitionStateJson.hfWatermarkAt` |
| Per-field committed watermark | `acquisitionStateJson.hfWatermarkByField` |
| Per-field query coverage cursor | `acquisitionStateJson.hfQueryCoverageByField` (temporal interval queried — **not** a data watermark) |
| HF physical identity version | `acquisitionStateJson.hfPhysicalIdentityVersion` (`LEGACY_VALUE_V1` \| `AGGREGATE_BUCKET_V2`) |
| Event watermark | `eventWatermarkAt` column + `state.eventWatermarkAt` |
| Aggregate bucket fingerprint | `buildAggregateBucketFingerprint()` with executed `interval` + `aggregation` |
| Physical sample fingerprint (HF) | `buildPhysicalSampleFingerprint()` → V2 aggregate bucket hash |
| Dedup gate (optimization) | DB unique `(session_id, physical_sample_fingerprint)` + in-cycle/DB lookup in `captureHistoricalSurface()` |
| Durable idempotent append | `ReferenceCaptureObservationRepository.appendManyIdempotent()` (`skipDuplicates: true`) |
| Watermark advance | `advanceHfWatermarksAfterPersistedBuckets()` after `flushIdempotent()` using **durably represented** fingerprints |
| Provider bucket revision | `PROVIDER_BUCKET_REVISION` with `revisionIdentity` on `providerEventFingerprint` (idempotent per session) |
| Auto-flush watermark | `enqueueAndMaybeFlush()` returns `durablyRepresentedFingerprints` for same-cycle DATA watermark |
| Legacy session upgrade | **FAIL_CLOSED** — active `LEGACY_VALUE_V1` sessions throw; completed pre-V2 evidence immutable; new sessions V2 only |
| State persistence | `ReferenceCaptureSessionRepository.releaseCycleLockAndUpdateState()` |

### RD001 quantified metrics

| Metric | Value |
|--------|-------|
| `RD001_HF_RETURNED_ROWS` | 1333 (original sealed capture) |
| `RD001_HF_PERSISTED_ROWS` | 1333 |
| `RD001_HF_UNIQUE_PHYSICAL_SAMPLES` | 1333 (aggregate-bucket observations) |
| `RD001_HF_EXCLUDED_BY_WATERMARK` | **39** field×bucket (`8` unique bucket-start timestamps) |
| `RD001_HF_DUPLICATE_BUCKET_RETURNS` | 122 late buckets in exact-window replay (not in original) |
| `RD001_HF_TRUE_DUPLICATES` | 0 changed-value collisions in replay |
| `RD001_HF_MULTI_SURFACE_OVERLAP` | Substantial LATEST_LIVE/LATEST_SLOW/HF timestamp overlap (provenance preserved per surface) |

**Artifact:** `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-late-arrival-differential.json` (122 rows, DI-EV-0016 derived analysis — sealed raw export unchanged).

### Exclusion breakdown (39 `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK`)

| Class | Description | RD001 count |
|-------|-------------|-------------|
| A — genuinely stale/duplicate | Same bucket already represented | 0 (excluded before persist in replay) |
| B — same aggregate bucket returned again | Provider re-return; dedup target | N/A at exclusion time |
| C — valid late bucket behind wall-clock watermark | **Root cause** | **39** |
| D — unknown | — | 0 |

**ROOT_CAUSE:** `hfWatermarkAt` was set to `requestStartedAt` (wall clock) after every HF request regardless of returned provider data. Next cycle `from = hfWatermarkAt - 2s` permanently skipped aggregate buckets whose provider availability lag exceeded the overlap relative to wall-clock advance.

---

## Canonical model (frozen)

| Policy | Selection | Maturity |
|--------|-----------|----------|
| `HF_QUERY_WINDOW_POLICY` | `nextFrom = min(perFieldQueryFrom) - HF_QUERY_OVERLAP_MS`; per-field FROM uses **query coverage first**, then data watermark, then session start | CONFIRMED_FROM_CODE |
| `DATA_WATERMARK_AUTHORITY` | `hfWatermarkByField` = highest durable provider bucket represented (evidence/diagnostic; not primary query cursor) | CONFIRMED_FROM_CODE |
| `QUERY_COVERAGE_AUTHORITY` | `hfQueryCoverageByField` = ACTUAL_QUERY_TO boundary successfully queried per field | CONFIRMED_FROM_CODE |
| `ACTUAL_QUERY_TO_AUTHORITY` | `requestStartedAt` at GraphQL build — never `requestCompletedAt` | CONFIRMED_FROM_CODE |
| `HTTP_RESPONSE_BOUNDARY` | `requestCompletedAt` / `httpResponseReceivedAt` are latency provenance only | CONFIRMED_FROM_CODE |
| `LEGACY_SESSION_UPGRADE_POLICY` | Completed pre-V2 sessions immutable; active legacy sessions **fail closed**; new sessions `AGGREGATE_BUCKET_V2` only | CONFIRMED_FROM_CODE |
| `REAL_LEGACY_V1_HASH` | `buildLegacyValueInclusiveFingerprint(field\|ts\|value)` — exact historical algorithm | CONFIRMED_FROM_CODE |
| `AUTO_FLUSH_WATERMARK_ACCOUNTING` | Intermediate `enqueueAndMaybeFlush` durables included in same-cycle DATA watermark | CONFIRMED_FROM_CODE |
| `PROVIDER_REVISION_IDEMPOTENCY` | `revisionIdentity = hash(bucketIdentity\|firstSeenHash\|revisedHash)` on `providerEventFingerprint` | CONFIRMED_FROM_CODE |
| `HF_PHYSICAL_IDENTITY_VERSION` | New sessions: `AGGREGATE_BUCKET_V2`; `LEGACY_VALUE_V1` forensic-only / fail-closed on active resume | CONFIRMED_FROM_CODE |
| `PHYSICAL_SAMPLE_IDENTITY` | Same as aggregate bucket identity for HF_HISTORICAL | CONFIRMED_FROM_CODE |
| `MULTI_SURFACE_IDENTITY_SCOPE` | **HF_HISTORICAL-scoped** V2 fingerprint; LATEST_LIVE/LATEST_SLOW do not set `physicalSampleFingerprint` — cross-surface collapse is analysis concern, not shared dedup Set | CONFIRMED_FROM_CODE |
| `PROVIDER_BUCKET_REVISION_POLICY` | `IMMUTABLE_FIRST_SEEN` physical row; revised provider value emits `PROVIDER_BUCKET_REVISION` provenance observation (null fingerprint) | CONFIRMED_FROM_CODE |

### Failure semantics (post-correction)

| Invariant | Result |
|-----------|--------|
| `PERSISTENCE_FAILURE_CAN_ADVANCE_WATERMARK` | **NO** |
| `POST_PERSIST_PRE_STATE_CRASH_RETRY_IDEMPOTENT` | **YES** (DB unique + skipDuplicates + DB lookup on retry) |
| `PARTIAL_BATCH_FAILURE_RETRY_IDEMPOTENT` | **YES** |
| `STATE_COMMIT_FAILURE_RETRY_IDEMPOTENT` | **YES** |
| `FAST_FIELD_CAN_SUPPRESS_SLOW_FIELD` | **NO** |
| `SLOW_FIELD_CAN_FORCE_UNBOUNDED_FAST_FIELD_REQUERY` | **NO** |
| `PREVIOUSLY_ACTIVE_THEN_SILENT_FIELD_BOUNDED` | **YES** (coverage-driven FROM) |
| `QUERY_COVERAGE_EXCEEDS_ACTUAL_QUERY_TO` | **NO** |
| `HTTP_LATENCY_CAN_CREATE_UNQUERIED_HOLE` | **NO** |
| `AUTO_FLUSH_DURABLES_INCLUDED_IN_SAME_CYCLE_WATERMARK` | **YES** |
| `PROVIDER_REVISION_IDEMPOTENT` | **YES** |
| `REAL_LEGACY_V1_HASH_COMPATIBLE` | **YES** (forensic); active resume **NOT_SUPPORTED** (fail closed) |
| `SILENT_FIELD_CAN_PIN_QUERY_TO_SESSION_START` | **NO** |
| `HF_QUERY_WINDOW_GROWS_WITH_SESSION_DURATION` | **NO** (including previously active then silent fields) |
| `REPEATED_BUCKET_CREATES_NEW_PHYSICAL_SAMPLE` | **NO** |
| `LATE_VALID_BUCKET_CAN_BE_RECOVERED` | **YES** |
| `RETRY_IS_IDEMPOTENT` | **YES** at DB boundary |
| `VALUE_REVISION_OBSERVABLE` | **YES** via `PROVIDER_BUCKET_REVISION` |

---

## Implementation summary

### Files changed

| File | Change |
|------|--------|
| `reference-capture-hf-watermark-policy.ts` | Per-field data watermarks + **query coverage cursors**; `simulateHfQueryWindowGrowth()` |
| `reference-capture-physical-sample-identity.util.ts` | V2 aggregate bucket fingerprint; `HF_PHYSICAL_IDENTITY_VERSION`; executed interval/aggregation |
| `reference-capture-acquisition.service.ts` | DB-backed dedup; post-`flushIdempotent` watermark; provider revision observations |
| `reference-capture-observation.repository.ts` | `appendManyIdempotent()` with `skipDuplicates` + durable fingerprint reconciliation |
| `reference-capture-observation-writer.service.ts` | `flushIdempotent()` returns inserted vs durably represented counts |
| `reference-capture.types.ts` | `hfQueryCoverageByField`, `hfPhysicalIdentityVersion` |
| `reference-capture-session.repository.ts` | Parse new state fields with backward-safe defaults |
| `prisma/migrations/20260902103000_reference_capture_physical_sample_unique/` | Pre-migration duplicate audit + unique `(session_id, physical_sample_fingerprint)` |
| `reference-capture-hf-watermark-policy.spec.ts` | Matrix A–L, RD001 fixture, query coverage, window growth simulation |
| `reference-capture-hf-durable-idempotency.spec.ts` | Crash-before-state, partial batch, state-commit-failure retry tests |
| `reference-capture-observation.repository.idempotency.spec.ts` | Repository idempotent append contract |

### Durable idempotency migration

Pre-migration SQL audits existing rows for duplicate non-null `(session_id, physical_sample_fingerprint)` and **raises** if any exist (no blind constraint). NULL fingerprints (events, metadata, `PROVIDER_BUCKET_REVISION`) remain unaffected — PostgreSQL unique allows multiple NULLs.

### Production load impact (corrected)

Simulated via `simulateHfQueryWindowGrowth()` — 60 cycles × 5s interval, `speed` @ 1s cadence + one silent field:

| Session duration | Query window P50 | P95 | Max | Grows with session? |
|----------------|------------------|-----|-----|---------------------|
| 1 min (12 cycles) | ~3s | ~3s | ~7s | **NO** |
| 10 min | ~3s | ~3s | ~7s | **NO** |
| 30 min | ~3s | ~3s | ~7s | **NO** |
| 60 min | ~3s | ~3s | ~7s | **NO** |

Window bounded by `HF_QUERY_OVERLAP_MS` (2s) + one cycle cadence + field cadence — **not** `sessionStartedAt` re-query. Overlap re-queries return duplicate rows at provider; dedup skips enqueue; DB `skipDuplicates` is crash-safety net.

| Metric | Before correction | After correction |
|--------|-------------------|------------------|
| HF requests/cycle | 1 | 1 |
| Silent field pins FROM to session start | **YES** (bug) | **NO** |
| Crash retry duplicate physical rows | **Possible** | **Prevented** (DB unique) |
| Dedup authority | In-memory Set | **Database** (+ Set optimization) |

---

## Alternatives considered

| Alternative | Rejected because |
|-------------|------------------|
| Global wall-clock watermark + larger overlap | Does not fix per-field cadence divergence; overlap bound still arbitrary |
| Value-inclusive fingerprint | Provider revisions create false distinct identities |
| Watermark advance on observe (pre-persist) | Persistence failure can permanently skip data |
| Second query with `requestCompletedAt` TO | Added complexity; overlap model sufficient for RD001 evidence |

---

## Remaining unverified

- `HF_QUERY_OVERLAP_MS = 2000` optimality across multiple vehicles/drives (**PROVISIONAL**)
- Production canary under real LTE_R1 motion after deploy
- GraphQL query TO still uses `requestStartedAt` (pre-request); provenance records `requestCompletedAt` — marginal buckets closing during request may require future widening

---

## Test reproduction

```bash
cd backend
npm test -- --testPathPattern=reference-capture-hf-watermark-policy
npm test -- --testPathPattern=reference-capture-hf-durable-idempotency
npm test -- --testPathPattern=reference-capture-observation.repository.idempotency
npm test -- --testPathPattern=reference-capture
npm run build
npx tsc --noEmit
npx prisma validate
```

RD001 fixture: `reference-capture-hf-watermark-policy.spec.ts` describe block **L**.

---

## Evidence cross-links

| Artifact | ID |
|----------|-----|
| This report | DI-EV-0021 |
| RD001 capture report | DI-EV-0016 |
| HF late-arrival differential | DI-EV-0016 (derived) |
| Phase 3A.3.1 FAST GO | DI-EV-0020 |
| Architecture record | `architecture/DIMO_LTE_R1_PHASE_3A32_HF_WATERMARK_AGGREGATE_IDENTITY_2026-09-02.md` |

---

## Gates

```
PHASE_3A3_2_CODE_READY = YES
PHASE_3A3_2_PRODUCTION_VALIDATED = NO
READY_FOR_RD002 = NO
PRODUCTION_PRE_MIGRATION_DUPLICATE_AUDIT = REQUIRED_BEFORE_DEPLOY
NEXT_REQUIRED_STEP = MERGE_REVIEW_THEN_PRODUCTION_PRE_MIGRATION_AUDIT_AND_CANARY
```
