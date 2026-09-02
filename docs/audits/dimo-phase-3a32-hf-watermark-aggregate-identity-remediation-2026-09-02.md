# Phase 3A.3.2 — HF Watermark + Aggregate Bucket Identity Remediation

**Date:** 2026-09-02  
**Phase:** 3A.3.2  
**Evidence ID:** DI-EV-0021  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`  
**Reference Drive:** `DIMO_LTE_R1_REFERENCE_DRIVE_001` (DI-EV-0016)  
**Base SHA:** `c3b4abfe6e24c9fc7f795ea52dde25830ac84fd9`

---

## Executive summary

Phase 3A.3.2 remediates two Reference Capture telemetry-integrity defects discovered during RD001 forensic reconstruction:

1. **HF watermark advanced on request wall-clock** (`requestStartedAt` / `now`) instead of max **persisted provider bucket timestamp**, permanently excluding late-arriving aggregate buckets behind a 2s overlap window.
2. **`physicalSampleFingerprint` included `normalizedValue`**, causing identical aggregate buckets with provider value revisions to appear as distinct physical samples.

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
| HF query FROM | `computeHfQueryFrom()` — `reference-capture-hf-watermark-policy.ts` |
| HF query TO (GraphQL) | `requestStartedAt` at query build; provenance `hfWindowTo` = `computeHfQueryTo(requestCompletedAt)` |
| Committed HF watermark (global legacy) | `acquisitionStateJson.hfWatermarkAt` |
| Per-field committed watermark | `acquisitionStateJson.hfWatermarkByField` |
| Event watermark | `eventWatermarkAt` column + `state.eventWatermarkAt` |
| Aggregate bucket fingerprint | `buildAggregateBucketFingerprint()` |
| Physical sample fingerprint (HF) | `buildPhysicalSampleFingerprint()` → delegates to aggregate bucket |
| Dedup gate | `seenPhysicalSampleFingerprints` Set in `captureHistoricalSurface()` |
| Watermark advance | `advanceHfWatermarksAfterPersistedBuckets()` **after** `observationWriter.flush()` |
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
| `HF_QUERY_WINDOW_POLICY` | `nextFrom = min(perFieldCommittedProviderTs) - HF_QUERY_OVERLAP_MS` (2000ms); `nextTo = requestStartedAt` at query time; provenance records `requestCompletedAt` | PROVISIONAL_REQUIRES_MORE_REFERENCE_DRIVES |
| `HF_WATERMARK_SCOPE` | Per-field committed provider bucket timestamps (`hfWatermarkByField`); legacy `hfWatermarkAt` = max(per-field) | CONFIRMED_FROM_CODE |
| `HF_WATERMARK_ADVANCE_RULE` | Advance only after successful `flush()` of newly enqueued buckets; max persisted `providerTimestamp` per field | CONFIRMED_FROM_CODE |
| `HF_LATE_ARRIVAL_POLICY` | Bounded 2s overlap re-query; overlap bound provisional from RD001 closed-bucket lag P50 ≈ 1.49s | PROVISIONAL_REQUIRES_MORE_REFERENCE_DRIVES |
| `AGGREGATE_BUCKET_IDENTITY` | `sha256(providerField \| canonicalBucketTs \| interval \| aggregation)` | CONFIRMED_FROM_CODE |
| `PHYSICAL_SAMPLE_IDENTITY` | Same as aggregate bucket identity for HF_HISTORICAL | CONFIRMED_FROM_CODE |
| `MULTI_SURFACE_DUPLICATE_POLICY` | Global physical identity; separate observations per surface with provenance | CONFIRMED_FROM_CODE |
| `CORRECTED_VALUE_POLICY` | `IMMUTABLE_FIRST_SEEN` — revised values for same bucket skipped at dedup gate | CONFIRMED_FROM_CODE |

### Failure semantics (post-fix)

| Invariant | Result |
|-----------|--------|
| `PERSISTENCE_FAILURE_CAN_ADVANCE_WATERMARK` | **NO** — watermark commit after `flush()` |
| `FAST_FIELD_CAN_SUPPRESS_SLOW_FIELD` | **NO** — per-field cursors + min(from) |
| `REPEATED_BUCKET_CREATES_NEW_PHYSICAL_SAMPLE` | **NO** — dedup skips enqueue |
| `LATE_VALID_BUCKET_CAN_BE_RECOVERED` | **YES** — overlap + provider-based watermark |
| `RETRY_IS_IDEMPOTENT` | **YES** — fingerprint dedup + no watermark advance on flush failure |

---

## Implementation summary

### Files changed

| File | Change |
|------|--------|
| `reference-capture-hf-watermark-policy.ts` | **NEW** — overlap, per-field watermarks, query FROM/TO helpers, advance rules |
| `reference-capture-physical-sample-identity.util.ts` | Aggregate bucket fingerprint without value; legacy helper retained |
| `reference-capture-acquisition.service.ts` | Post-flush watermark commit; per-field state; dedup before enqueue |
| `reference-capture.types.ts` | `hfWatermarkByField?: Record<string, string>` |
| `reference-capture-session.repository.ts` | Parse `hfWatermarkByField` with backward-safe default `{}` |
| `reference-capture-hf-watermark-policy.spec.ts` | **NEW** — test matrix A–L + RD001 fixture regression |

### Production load impact

| Metric | Before | After |
|--------|--------|-------|
| HF requests/cycle | 1 | 1 |
| Typical historical window | `(wallClockNow - 2s) - sessionStart` | `(minFieldCommitted - 2s) - sessionStart` |
| Expected repeated rows | Low (dedup flagged but persisted) | Overlap re-queries; **dedup skips enqueue** |
| Dedup cost | O(rows) Set lookup | Same |
| DB writes | Duplicates persisted | Duplicates not enqueued |

Overlap is bounded by `HF_QUERY_OVERLAP_MS` (2s), not unbounded re-query.

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
npm test -- --testPathPattern=reference-capture
npm run build
npx tsc --noEmit
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
NEXT_REQUIRED_STEP = MERGE_REVIEW_THEN_PRODUCTION_CANARY_FOR_3A3_1_PLUS_3A3_2
```
