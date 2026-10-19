# EXP021 — Position spacing, query contract, and fixed-grid assessability

| Field | Value |
| --- | --- |
| PR | [#2046](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2046) @ `9f15d18c8a` |
| Provider calls this workstream | **0** (analysis only) |
| Inputs | `exp021-provider-position-compare-533b2bf8.json`, sealed pin metadata `exp021-position-fetch-metadata.json`, raw `signals[]` from compare run |

## 1. Provider compare closure (no repeat)

| Check | Result |
| --- | --- |
| Pin `rejectedProviderRows` | **0** (`exp021-position-fetch-metadata.json` + compare `providerSignalStats`) |
| Matrix | **1728** `PIN_PRESENT_PROVIDER_PRESENT`, **2966** `PIN_ABSENT_PROVIDER_ABSENT`, sum **4694** |
| Coordinates where both present | **1728** unchanged, **0** changed |
| HTTP posts | **Estimate ~1** on success path (`estimatedHttpPostsOnSuccessPath` in compare JSON). **Not** a measured retry counter — `DimoRequestExecutor` attempt count is **not** instrumented in the artifact. Cap was **3** attempts (`DIMO_GLOBAL_MAX_RETRIES=2`). |

## 2. Observed spacing among **returned** position rows (not device sampling rate)

Source: **1728** `timestamp` labels in compare raw JSON (same set as pin present buckets).

### Gap histogram (consecutive returned rows, n=1727 gaps)

| Bucket | Count | % of gaps |
| --- | ---: | ---: |
| **1s** | 1666 | 96.5% |
| **2s** | 9 | 0.5% |
| **3–5s** | 34 | 2.0% |
| **6–10s** | 5 | 0.3% |
| **>10s** | 13 | 0.8% |

### Order statistics (seconds between consecutive returned rows)

| Stat | Seconds |
| --- | ---: |
| Median | **1** |
| P90 | **1** |
| P95 | **1** |
| Maximum | **1365** |

### Leading / trailing (fixed window `[14:47:05Z, 16:05:19Z)`)

| Edge | Seconds without a returned row before first / after last label |
| --- | ---: |
| Leading | **0** |
| Trailing | **1** |

### Pattern class (A / B / C)

**C — mixture:**

- **Among rows the API returns**, consecutive labels are almost always **1s apart** (regular spacing *within* the returned subsequence).
- **On the fixed 1s acquisition grid**, **2966** / **4694** seconds (**63.2%**) have **no** returned row — dominated by **long contiguous absent runs**.

### Missing-run counts (fixed 1s grid — label clearly)

| Metric | Count or seconds |
| --- | ---: |
| **All missing runs** (contiguous `ROW_ABSENT` runs) | **61** |
| Missing runs with duration **>10 s** | **13** |
| Missing runs with duration **≤10 s** | **48** |
| Absent seconds in runs **>10 s** | **2847** |
| Absent seconds in runs **≤10 s** | **119** |
| Longest single missing run | **1364 s** (`[14:58:36Z, 15:21:20Z)` on grid) |

**Not claimed:** “61 long runs” — **61** is the **total** missing-run count; only **13** exceed 10 s.

### Point spacing vs absent grid seconds (largest gap)

| Measure | Seconds | Definition |
| --- | ---: | --- |
| **1365** | Between consecutive **returned** POSITION labels `14:58:35Z` → `15:21:20Z` |
| **1364** | Interior 1 s buckets strictly inside `(14:58:35, 15:21:20)` with no row |

Follow-on pin correlation (stored data only): [`EXP021_LARGEST_GAP_SIGNAL_CORRELATION_2026-10-16.md`](EXP021_LARGEST_GAP_SIGNAL_CORRELATION_2026-10-16.md).

This measures **spacing of returned `signals[]` rows only**, not proven physical GPS cadence.

### Coarse trip map (80 columns, full window)

`trip_density_80cols: |o.||||||.oo.......................o||||||||||||.o||||||||o............o||||oo..`

(`|` = block with many points, `o` = sparse, `.` = no points in block)

### Problem sub-window `[14:55:43Z, 15:21:53Z)` (~1570s)

Compare matrix: **1550** both-absent, **20** both-present.

**20 returned timestamps and gaps** (seconds from previous label or sub-window start):

| timestamp | gapFromPrevOrStart (s) |
| --- | ---: |
| 2026-10-14T14:55:43Z | 0 |
| 2026-10-14T14:55:45Z | 2 |
| 2026-10-14T14:57:27Z | 102 |
| 2026-10-14T14:57:31Z | 4 |
| 2026-10-14T14:57:33Z | 2 |
| 2026-10-14T14:57:34Z | 1 |
| 2026-10-14T14:57:36Z | 2 |
| 2026-10-14T14:57:37Z | 1 |
| 2026-10-14T14:57:47Z | 10 |
| 2026-10-14T14:58:07Z | 20 |
| 2026-10-14T14:58:27Z | 20 |
| 2026-10-14T14:58:35Z | 8 |
| 2026-10-14T15:21:20Z | **1365** |
| 2026-10-14T15:21:23Z | 3 |
| 2026-10-14T15:21:24Z | 1 |
| 2026-10-14T15:21:26Z | 2 |
| 2026-10-14T15:21:28Z | 2 |
| 2026-10-14T15:21:29Z | 1 |
| 2026-10-14T15:21:45Z | 16 |
| 2026-10-14T15:21:52Z | 7 |

`problem_window_80cols: |....||||.....................................................................||`

## 3. Query contract vs official DIMO docs (retrieved **2026-10-16**)

**SynqDrive sealed query** (`DIMO_SIGNALS_HISTORICAL_LOCATION_1S_AVG_V0_1`):

```graphql
signals(tokenId, from, to, interval: "1s") {
  timestamp
  currentLocationCoordinates(agg: AVG) { latitude longitude }
}
```

| Topic | Documented (DIMO Telemetry API, Oct 2026 fetch) | Applied to this trip |
| --- | --- | --- |
| `signals` args | `tokenId`, `from`, `to`, `interval` required; optional `filter` | Matches |
| `interval` | Duration string for aggregation buckets ([Introduction](https://www.dimo.org/docs/api-references/telemetry-api/introduction)) | `"1s"` |
| Aggregation | Numeric signals need `agg` (AVG, MAX, MIN, …) ([Playground](https://www.dimo.org/docs/api-references/telemetry-api/telemetry-playground)) | `AVG` on coordinates |
| `signals` pagination | **Not documented** on [Vehicle Signals](https://www.dimo.org/docs/api-references/telemetry-api/signals) | S3A: single page, no cursor |
| `signals` row/window cap | **Not documented** on signals page; playground advises “reasonable” ranges (days–weeks) | Window **~78.2 min**, **1728** rows returned, HTTP 200 |
| `segments` limits | `limit` default 100 max 200; `after` cursor; max range **31 days** ([Segments](https://www.dimo.org/docs/api-references/telemetry-api/segments)) | **Not used** for POSITION S3A |

**Code authority (SynqDrive):** `di-v0-position-acquisition.versions.ts` — `interval: "1s"` is a **query bucket**; `timestamp` is a **bucket label**; `AVG` may differ from any single physical sample when a bucket aggregates multiple sources.

**Not claimed:** That Oct 2026 docs governed provider behavior on **2026-10-14** fetch time. Undocumented truncation/pagination for `signals` remains **UNKNOWN**.

## 4. Fixed-grid assessability (Driving Intelligence)

| Mechanism | Effect on this trip |
| --- | --- |
| S3A grid | Every second in `[from,to)` gets a bucket; missing `signals[]` row → `ROW_ABSENT` |
| Speed QC V2 | Interval numeric verdict needs **t−1 / t / t+** positions; `ROW_ABSENT` or incomplete support → **POSITION_GAP** / non-numeric paths |
| Dominant gap shape | **~96%** of absent **seconds** sit in **long outages** (>10s), not in a uniform “every 3s” sparse cadence |
| When points exist | Returned rows are **mostly 1s apart**, but neighbors on the **full grid** are often still absent → **many centers cannot get complete calendar support** |

Speed from two distant returned points would be a **segment average over the gap**, not instantaneous kinematics — **no** braking/acceleration inference in gaps. **GPS L3** remains numeric authority.

## 5. Recommended next experiment (do not run here)

| Option | Recommendation |
| --- | --- |
| **Bounded split-window DIMO compare** | **Deprioritized** — full-window replay already matches pin sparsity; no documented `signals` page limit; no boundary artifact suggesting truncation. Low expected gain. |
| **Reference drive / external ground truth** | **Preferred** — independent high-rate position truth for one canonical segment to separate **provider storage/sparsity** vs **vehicle/network** vs **query semantics**. |
| **Offline irregular-interval QC experiment** | **Secondary** — research-only harness: pair-wise speeds on actual returned timestamps vs fixed grid; measures assessability uplift **without** product QC relaxation. |

## Artifacts & tooling

- Machine-readable: `/opt/cursor/artifacts/exp021-position-timing-analysis.json`
- Regenerate: `backend/scripts/ops/exp021-position-timing-analysis.ts` (read-only local files)
