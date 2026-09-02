# DIMO LTE R1 — Phase 3A.3.2 HF Watermark + Aggregate Bucket Identity

**Date:** 2026-09-02  
**Evidence:** DI-EV-0021  
**Scope:** `REFERENCE_CAPTURE` HF_HISTORICAL acquisition only

---

## Problem statement

RD001 proved the Flight Recorder could:

1. Silently exclude valid late aggregate buckets when `hfWatermarkAt` advanced on request wall-clock.
2. Treat repeated aggregate buckets as new physical samples when value was included in fingerprint identity.

---

## Architecture

### Separation of concerns

```
WATERMARK (cursor)          → which temporal region to request
AGGREGATE_BUCKET_IDENTITY   → whether observation already represented
PROVENANCE                  → which surface/cycle/request returned it
```

### State (`acquisitionStateJson`)

```typescript
{
  hfWatermarkAt: string | null;           // legacy global = max(per-field)
  hfWatermarkByField: Record<string, string>;  // committed provider bucket ts per field
  seenPhysicalSampleFingerprints: string[];    // aggregate bucket identities seen
}
```

Backward compatibility: missing `hfWatermarkByField` parses as `{}`; falls back to `hfWatermarkAt` per field.

### Cycle ordering (transactional invariant)

```
1. acquire cycle lock
2. query DIMO HF_HISTORICAL
3. dedup by aggregate bucket fingerprint → enqueue new only
4. flush() all pending observations
5. advance hfWatermarkByField from flushed buckets only
6. release lock + persist acquisitionStateJson
```

If step 4 fails, step 5–6 do not run (exception propagates; lock remains until retry path).

### Identity formula

```
aggregateBucketFingerprint = SHA256(
  providerField + "|" +
  canonicalizeBucketTimestamp(providerTimestamp) + "|" +
  requestedInterval + "|" +
  aggregationType
)
```

Default: `interval = "1s"`, `aggregation = "AVG"`.

**Not** in identity: `normalizedValue`, `requestCorrelationId`, `synqReceivedAt`, request timestamps.

### Multi-surface policy

`LATEST_LIVE`, `LATEST_SLOW`, and `HF_HISTORICAL` may return related values at the same provider timestamp. Each surface persists its own observation with full provenance. HF dedup uses global aggregate bucket identity across HF cycles only (`seenPhysicalSampleFingerprints`).

### Corrected value policy

`IMMUTABLE_FIRST_SEEN`: if same bucket identity arrives with different value, second observation is not enqueued. Research evidence preserves first seen value.

---

## Module map

| Module | Role |
|--------|------|
| `reference-capture-hf-watermark-policy.ts` | Query window + watermark advance pure functions |
| `reference-capture-physical-sample-identity.util.ts` | Fingerprint builders |
| `reference-capture-acquisition.service.ts` | Orchestration |
| `reference-capture-hf-aggregate-bucket-analysis.ts` | RD001 analysis helpers (unchanged sealed artifacts) |

---

## Constants

| Name | Value | Notes |
|------|-------|-------|
| `HF_QUERY_OVERLAP_MS` | 2000 | Provisional from RD001 lag distribution |
| `HF_REQUESTED_INTERVAL` | `1s` | DIMO historical query |
| `HF_AGGREGATION_TYPE` | `AVG` | Identity contract |

---

## RD002 gate

Phase 3A.3.2 code must merge and pass production canary (with 3A.3.1) before `DIMO_LTE_R1_REFERENCE_DRIVE_002`.
