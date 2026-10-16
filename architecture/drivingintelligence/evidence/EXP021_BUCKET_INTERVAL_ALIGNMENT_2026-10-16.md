# EXP021 — Bucket vs interval alignment (read-only)

| Field | Value |
| --- | --- |
| Parent PR | [#2046](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2046) |
| Analysis SHA | `99c851b830` (post-reconciliation fields) |
| Production runtime SHA | `7de8f3ae2040a229f2a9c4b6a663117f1871fe55` |
| Artifact | `/opt/cursor/artifacts/exp021-position-gap-forensic-v2.json` |

## Persisted match claim correction

| Claim | Correct fact |
| --- | --- |
| “20/20 persisted match” | **Rejected.** 20 trips analyzed in coverage sample; **2** have a CURRENT V2-policy persisted row; **2/2 PASS** aggregate replay match; **18** → `status: N/A` (no row), **never PASS**. |
| Wrong `projection_version = 'V2'` filter | Affected **only** `persistedAggregateReplayMatch` in the first JSON artifact. **Did not** affect trip selection, partition percents, or replay QC (selection uses inventory + pin; no DB projection filter). |

## Interval identity and 1 s grid (all three forensic cases)

| Check | Result |
| --- | --- |
| Shadow interval count vs acquisition bucket count | **Equal** per trip (e.g. `533b2bf8`: 4694 = 4694). |
| Shadow timeline | **1 s consecutive** grid from first to last `reference_time` (no duplicate center labels on `533b2bf8`). |
| Center label scheme | `dateToBucketLabel(referenceTime)` → whole-second UTC `…Z` (no sub-second labels). |
| Interval “ID” | Stable `intervalIndex` = index in shadow rows sorted by `reference_time` (exported in alignment JSON). |

## Exact reconciliation: 2966 ROW_ABSENT buckets vs 3040 POSITION_GAP interval-seconds (`533b2bf8…`)

**Not** duplicate shadow rows. **Not** support-window double-count across trips.

| Component | Seconds |
| --- | ---: |
| POSITION_GAP-classified shadow intervals (denominator for trip gap %) | **3040** |
| Acquisition-window buckets with `availability = ROW_ABSENT` | **2966** |
| POSITION_GAP intervals whose **center** is `ROW_ABSENT` | **2966** |
| POSITION_GAP intervals whose **center is `PRESENT`** but **t−1 or t+1** is `ROW_ABSENT` (L3 support incomplete; `POS_GAP_ROW_ABSENT_EXPLICIT`) | **74** |

**Formula:** `3040 = 2966 + 74`.

**Mechanism:** `classifySupportWindowGaps` scans **prev, center, next**. `classifyNoNumericDisjointV2` emits `POS_GAP_ROW_ABSENT_EXPLICIT` when **any** support label is `ROW_ABSENT`, even if the center bucket is valid. Coverage `POSITION_GAP` uses that class before hold buckets. The metric `intervalsWithCenterGap` in the first forensic summary means “support window has any gap,” not “center bucket ROW_ABSENT.”

| Trip | ROW_ABSENT buckets | POSITION_GAP intervals | Center ROW_ABSENT intervals | Present center + neighbor ROW_ABSENT |
| --- | ---: | ---: | ---: | ---: |
| `533b2bf8…` | 2966 | 3040 | 2966 | 74 |
| `6bb3ddf2…` | 1277 | 1310 | 1276 | 34 |
| `9ead317c…` | 43 | 49 | 41 | 8 |

## Longest POSITION_GAP window pin counts (`533b2bf8…`)

Inclusive end marks `2026-10-14T14:55:43Z` … `2026-10-14T15:21:52Z` → half-open **`[14:55:43Z, 15:21:53Z)`** → **1570** one-second labels.

Counted **directly** from pinned `evidence.positions` (not re-counting diagnostic summary alone):

| Stage | Count |
| --- | ---: |
| Expected labels in window | 1570 |
| `ROW_ABSENT` | 1550 |
| Valid coordinates (`PRESENT`) | 20 |
| Missing from position map | 0 |

## ROW_ABSENT creation rule (code)

| Stage | Path |
| --- | --- |
| Acquisition normalization | `normalizeDiV0PositionResponse` — empty provider row list for grid index → `availability: 'ROW_ABSENT'`, provenance `EXPECTED_GRID_ROW_ABSENT` |
| Sealed pin | POSITION channel snapshot buckets (read via `loadP21ForensicContext` → `evidence.positions`) |
| QC read | `diagnosePositionGapAtLabel` / `classifySupportWindowGaps` / `evaluateDiV0SpeedQcInterval` |

## Earliest observable gap / proven data-loss stage

| Statement | Epistemic status |
| --- | --- |
| Earliest **observable** gap in this read-only path | **Pinned POSITION channel** — explicit `ROW_ABSENT` bucket rows |
| Provider did not send data at original fetch | **Unknown** (no provider re-query; sealed pin is only stored evidence) |
| Divergence between stored raw response and pin | **Not demonstrated** (no separate raw payload outside pin in this analysis) |

**Proven data-loss stage:** none upstream of pin in stored data. **Not** “provider outage” without external query.

## Remaining unknown

Whether `ROW_ABSENT` labels in the pin reflect (a) empty DIMO coordinate stream at fetch time, (b) pagination/window truncation, or (c) normalization grid fill — requires **read-only** inspection of sealed POSITION snapshot query/window/rejected-row lines or a **bounded external** DIMO signals query (not executed).

## Bounded external query proposal (not executed)

| Field | Value |
| --- | --- |
| Identity | Vehicle `19fedd4b-c4e8-4de8-a125-dab293326e7e`, trip window aligned to pin acquisition bounds |
| Signal | DIMO coordinates, `interval: 1s`, same UTC grid as S3A |
| Window | Half-open acquisition window from evidence snapshot metadata |
| Pagination | Match S3A query spec page size; record completeness vs `expectedBucketCount` |
| Budget | Single-vehicle, single-trip, one channel — DIMO global budget operator (no production mutation) |
| Interpretation limit | A **later** provider response cannot prove what was returned at original fetch; only correlates with pin `ROW_ABSENT` density |

## Tests

- `di-v0-exp021-bucket-interval-alignment.unit.spec.ts` — neighbor-support vs bucket counts
- `exp021-persisted-aggregate-replay-match.unit.spec.ts` — N/A vs PASS; canonical filter ≠ `V2`
