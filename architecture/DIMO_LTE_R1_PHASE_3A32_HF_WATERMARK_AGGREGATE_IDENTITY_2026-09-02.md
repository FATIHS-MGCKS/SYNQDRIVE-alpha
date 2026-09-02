# DIMO LTE R1 — Phase 3A.3.2 HF Watermark + Aggregate Bucket Identity

**Date:** 2026-09-02  
**Evidence:** DI-EV-0021 (amended correction pass)
**Scope:** `REFERENCE_CAPTURE` HF_HISTORICAL acquisition only

---

## Problem statement

RD001 proved the Flight Recorder could:

1. Silently exclude valid late aggregate buckets when `hfWatermarkAt` advanced on request wall-clock.
2. Treat repeated aggregate buckets as new physical samples when value was included in fingerprint identity.

Correction pass additionally closes:

3. Crash between PostgreSQL persist and session-state commit could duplicate physical rows (non-unique index).
4. Schema-supported but runtime-silent HF fields pinned query `FROM` to session start forever.

---

## Architecture

### Separation of concerns

```
DATA_WATERMARK (hfWatermarkByField)     → highest durable provider bucket per field
QUERY_COVERAGE (hfQueryCoverageByField)   → temporal interval successfully queried (NOT data)
AGGREGATE_BUCKET_IDENTITY (V2)            → whether HF physical observation already represented
PROVENANCE                                → which surface/cycle/request returned it
DURABLE_IDEMPOTENCY_AUTHORITY             → PostgreSQL unique (session_id, physical_sample_fingerprint)
```

### State (`acquisitionStateJson`)

```typescript
{
  hfWatermarkAt: string | null;                    // legacy global = max(per-field data)
  hfWatermarkByField: Record<string, string>;      // committed provider bucket ts per field
  hfQueryCoverageByField: Record<string, string>;  // last queried interval end per field
  hfPhysicalIdentityVersion: 'LEGACY_VALUE_V1' | 'AGGREGATE_BUCKET_V2';
  seenPhysicalSampleFingerprints: string[];        // optimization cache (not authority)
}
```

### Cycle ordering (transactional invariant)

```
1. acquire cycle lock
2. query DIMO HF_HISTORICAL (FROM uses data watermark OR query coverage per field)
3. dedup by aggregate bucket fingerprint (DB lookup + in-cycle) → enqueue new only
4. flushIdempotent() all pending observations (skipDuplicates)
5. advance hfWatermarkByField from durably represented bucket identities only
6. advance hfQueryCoverageByField for queried fields
7. release lock + persist acquisitionStateJson
```

If step 4–7 fails, DB unique constraint prevents duplicate physical rows on retry.

### Identity formula (AGGREGATE_BUCKET_V2)

```
physicalSampleFingerprint = SHA256(
  "AGGREGATE_BUCKET_V2|" +
  providerField + "|" +
  canonicalizeBucketTimestamp(providerTimestamp) + "|" +
  executedRequestedInterval + "|" +
  executedAggregationType   // currently AVG
)
```

**Not** in identity: `normalizedValue`, surface, request timestamps.

Legacy sessions with value-inclusive fingerprints remain `LEGACY_VALUE_V1` until a new session.

### Multi-surface scope (accurate)

V2 `physicalSampleFingerprint` is set only on **HF_HISTORICAL** `SIGNAL_POINT` observations. `LATEST_LIVE` and `LATEST_SLOW` persist separate observations without physical fingerprints. Cross-surface relationship is preserved in provenance and downstream analysis — not a shared in-memory dedup Set across surfaces.

### Provider bucket revision policy

`IMMUTABLE_FIRST_SEEN`: first persisted value for a bucket identity is authoritative. A later provider return with different value for the same bucket identity emits a `PROVIDER_BUCKET_REVISION` observation (null fingerprint) with first-seen and revised value evidence — not a second physical bucket.

---

## Module map

| Module | Role |
|--------|------|
| `reference-capture-hf-watermark-policy.ts` | Data watermark + query coverage + window simulation |
| `reference-capture-physical-sample-identity.util.ts` | V2 fingerprint + identity versioning |
| `reference-capture-observation.repository.ts` | Durable idempotent append |
| `reference-capture-observation-writer.service.ts` | `flushIdempotent()` batch persistence |
| `reference-capture-acquisition.service.ts` | Orchestration |
| `reference-capture-hf-aggregate-bucket-analysis.ts` | RD001 analysis helpers (unchanged sealed artifacts) |

---

## Constants

| Name | Value | Notes |
|------|-------|-------|
| `HF_QUERY_OVERLAP_MS` | 2000 | Provisional from RD001 lag distribution |
| `HF_REQUESTED_INTERVAL` | `1s` | DIMO historical query (executed contract) |
| `HF_AGGREGATION_TYPE` | `AVG` | Identity contract |
| `HF_PHYSICAL_IDENTITY_VERSION` | `AGGREGATE_BUCKET_V2` | New sessions |

---

## RD002 gate

Phase 3A.3.2 code must merge and pass production canary (with 3A.3.1) before `DIMO_LTE_R1_REFERENCE_DRIVE_002`.
