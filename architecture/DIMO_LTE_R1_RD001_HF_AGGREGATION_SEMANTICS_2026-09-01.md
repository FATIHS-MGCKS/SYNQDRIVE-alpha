# DIMO LTE R1 Reference Capture — HF Aggregation Semantics (RD001)

**Date:** 2026-09-01  
**Phase:** 3A.3 aggregation semantics correction  
**Evidence:** DI-EV-0016 (capture report §10a–10b)

---

## Canonical authority

### SynqDrive acquisition shape

`reference-capture-signal-schema.registry.ts` → `buildHistoricalSelectionForField()`:

```graphql
<providerField>(agg: AVG)
```

Query surface: `signals(tokenId, from, to, interval: "1s")`.

### DIMO provider implementation

Upstream `DIMO-Network/dq` → `internal/service/duck/aggregations.go`:

- `GetAggregatedSignals()` computes **epoch-aligned aggregation buckets**
- Bucket origin = `aggArgs.FromTS` (query `from` parameter)
- Bucket timestamp = **interval start** anchored to that origin
- Aggregator in RD001: **AVG**

Public schema (`telemetry-api/schema/base.graphqls`): `signals` returns values **bucketed by the specified interval**.

---

## What HF_HISTORICAL actually is

| Term | Correct for RD001 |
|------|-------------------|
| `DIMO_AGGREGATED_HISTORICAL_1S` | Yes — acquisition representation |
| `HF_AGGREGATE_BUCKET_OBSERVATION` | Yes — persisted row type |
| Raw LTE_R1 physical sample | **No** — not proven by `signals(agg:AVG)` |
| `physicalSampleFingerprint` on HF rows | **Aggregate bucket fingerprint** (semantic debt) |

---

## Cadence hierarchy (observable vs not)

| Layer | RD001 status |
|-------|----------------|
| `DEVICE_RAW_SAMPLE_CADENCE` | **UNKNOWN** — not directly observed |
| `DIMO_INGESTED_SOURCE_CADENCE` | **UNKNOWN** — not independently measured |
| `DIMO_AGGREGATE_BUCKET_CADENCE` | **Partially observed** — nonempty 1s AVG bucket P50 ≈ 2s |
| `SYNQDRIVE_RETRIEVAL_CADENCE` | **Observed** — per-surface request/synq timing |

Do **not** infer LTE_R1 physical sample rate = 0.5 Hz from bucket spacing alone.

---

## Known semantic debt

1. **`physicalSampleFingerprint`** — fingerprints `(field, bucketTimestamp, AVG)` but field name implies raw physical sample identity.
2. **Future remediation:** introduce `aggregateBucketFingerprint` distinct from `rawPhysicalSampleFingerprint` before physics-sensitive model calibration.
3. **Aggregator choice:** AVG may be insufficient for jerk/braking/throttle physics — evaluate FIRST/LAST/MIN/MAX separately (future experiment; not implemented).

---

## Invalidated prior claims

| Prior claim | Status |
|-------------|--------|
| 225 post-hoc-only = 225 new physical samples | **INVALIDATED_BY_AGGREGATION_GRID_MISMATCH** |
| `HF_LATE_ARRIVAL_WATERMARK_SKIP = CONFIRMED_FROM_RUNTIME` (from 300s chunk compare) | **INVALIDATED** — grid mismatch |
| 151s gap = `BOUNDARY_GAP` (ARM recovery) | **INVALIDATED** — gap inside single provider aggregation response |
| Effective physical HF rate ~0.5 Hz | **INVALIDATED** — measured nonempty bucket cadence only |

---

## Grid-controlled replay (exact-window)

Script: `backend/scripts/ops/reference-capture-drive-001-hf-exact-window-replay.ts`  
Artifact: `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-exact-window-replay.json`

Replays all **13** original row-producing `hfWindowFrom`/`hfWindowTo` pairs with identical boundaries.

---

## Upstream data stall concept

`DIMO_LTE_R1_RD001_UPSTREAM_DATA_STALL`:

- Historical aggregation unavailable after ~19:15
- LATEST source timestamps frozen ~19:14:03 while SynqDrive polling continued to ~19:34:48
- **CONFIRMED_FROM_RUNTIME** (API-visible stall)
- Root cause: **UNKNOWN_REQUIRES_VALIDATION**

---

## Phase gating

- `PHYSICAL_SAMPLE_FINGERPRINT_REMEDIATION_REQUIRED = YES`
- `HF_WATERMARK_REMEDIATION_REQUIRED = YES`
- `FAST_GO_REMEDIATION_REQUIRED = YES`
- `READY_FOR_RD002 = NO`
