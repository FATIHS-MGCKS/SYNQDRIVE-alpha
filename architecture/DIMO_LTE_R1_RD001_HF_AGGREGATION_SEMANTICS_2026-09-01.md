# DIMO LTE R1 Reference Capture — HF Aggregation Semantics (RD001)

**Date:** 2026-09-01 (updated 2026-09-02 — exact-window replay normalization)
**Phase:** 3A.3 aggregation semantics correction + watermark causality proof
**Evidence:** DI-EV-0016 (capture report §10a–10b)

---

## Canonical authority

### SynqDrive acquisition shape

`reference-capture-signal-schema.registry.ts` → `buildHistoricalSelectionForField()`:

```graphql
<providerField>(agg: AVG)
```

Query surface: `signals(tokenId, from, to, interval: "1s")`.

### DIMO provider implementation (verified public upstream)

**Primary authority:** `DIMO-Network/telemetry-api` @ commit `98d88534857fec95a507a61331d5e357b86cfcc6`

| File | Role |
|------|------|
| `internal/service/ch/ch.go` | `GetAggregatedSignals()` — aggregated signals; `timestamp` = start of interval |
| `internal/service/ch/queries.go` | `selectInterval()` → `toStartOfInterval(timestamp, interval, origin)`; `getAggQuery()` passes `origin = aggArgs.FromTS` |

**Bucket semantics:** **QUERY-FROM-ANCHORED AGGREGATION BUCKETS** — interval buckets anchored to the query `from` parameter (`aggArgs.FromTS`), not epoch-aligned independent of request window.

**Successor note:** `DIMO-Network/dq` (`internal/service/duck/aggregations.go`) may proxy or serve production queries. It was **not** independently verified as the sole canonical public implementation at this commit; telemetry-api ClickHouse code is the cited reproducible authority.

Public schema (`telemetry-api/schema/base.graphqls`): `signals` returns values **bucketed by the specified interval**.

---

## What HF_HISTORICAL actually is

| Term | Correct for RD001 |
|------|-------------------|
| `DIMO_AGGREGATED_HISTORICAL_1S` | Yes — acquisition representation |
| `HF_AGGREGATE_BUCKET_OBSERVATION` | Yes — persisted row type |
| Raw LTE_R1 physical sample | **No** — not proven by `signals(agg:AVG)` |
| `physicalSampleFingerprint` on HF rows | **Aggregate bucket fingerprint** (semantic debt) |

**Counting model for replay:** `AGGREGATE_BUCKET_OBSERVATIONS_ACROSS_REQUEST_WINDOWS` — overlapping HF query windows may count the same underlying source interval in multiple request contexts; do **not** treat totals as globally unique physical samples.

---

## Cadence hierarchy (observable vs not)

| Layer | RD001 status |
|-------|----------------|
| `DEVICE_RAW_SAMPLE_CADENCE` | **UNKNOWN** — not directly observed |
| `DIMO_INGESTED_SOURCE_CADENCE` | **UNKNOWN** — not independently measured |
| `DIMO_AGGREGATE_BUCKET_CADENCE` | **Partially observed** — nonempty 1s AVG bucket spacing P50 ≈ 2s |
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
| 151s gap = ARM gap artifact | **INVALIDATED** — ARM attribution invalid; **PROVIDER_DATA_GAP** |
| Effective physical HF rate ~0.5 Hz | **INVALIDATED** — measured nonempty bucket cadence only |
| 15 “removed” buckets in exact-window replay (pre-normalization) | **INVALIDATED** — RFC3339 serialization mismatch (`…25.500Z` vs `…25.5Z`) |

---

## Grid-controlled replay (exact-window, normalized)

Script: `backend/scripts/ops/reference-capture-drive-001-hf-exact-window-replay.ts`  
Artifact: `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-exact-window-replay.json`

Replays all **13** original row-producing `hfWindowFrom`/`hfWindowTo` pairs with identical boundaries. Bucket timestamps canonicalized via `new Date(ts).toISOString()` before comparison.

### Prior vs normalized totals (all 13 windows)

| Metric | Pre-normalization | Normalized |
|--------|-------------------|------------|
| Original aggregate buckets | 1333 | 1333 |
| Replay aggregate buckets | 1455 | 1455 |
| Unchanged | 1318 | **1333** |
| New | 137 | **122** |
| Removed | 15 | **0** |
| Changed value | 0 | 0 |

### Problematic window audit (`19:12:25.500Z` → `19:12:34.201Z`)

| Metric | Pre-normalization | Normalized |
|--------|-------------------|------------|
| Unchanged | 0 | **15** |
| Removed | 15 | **0** |
| New | 25 | **10** |

### Watermark causality (NEW buckets only)

| Classification | Count |
|----------------|-------|
| `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK` | **39** |
| `PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW` | 30 |
| `POTENTIALLY_REQUERYABLE` | 53 |
| `NO_NEXT_WINDOW_EVIDENCE` | 0 |

`HF_LATE_ARRIVAL_RUNTIME_SKIP = CONFIRMED_FROM_RUNTIME` — late-available DIMO aggregate source intervals were permanently excluded from subsequent Reference Capture HF windows by the 2-second wall-clock watermark overlap.

### Provider availability lag lower bound (NEW buckets)

Basis: `requestCompletedAt - bucketEnd` (fallback: `requestStartedAt - bucketEnd`, conservative). **Not** network latency.

| Stat | Seconds |
|------|---------|
| min | −0.084 |
| P50 | 1.489 |
| P95 | 3.248 |
| max | 4.035 |

Empirical signal: existing 2s overlap may be insufficient for late aggregate availability (design review only — **do not tune production overlap from RD001 alone**).

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
