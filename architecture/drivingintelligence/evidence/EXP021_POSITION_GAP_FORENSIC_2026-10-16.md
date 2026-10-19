# EXP021 — POSITION_GAP root-cause forensics (read-only)

| Field | Value |
| --- | --- |
| Parent | Draft PR [#2046](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2046) |
| Production runtime SHA | `7de8f3ae2040a229f2a9c4b6a663117f1871fe55` |
| Analysis code SHA | `3d3b22541e` (branch `cursor/exp021-coverage-diagnostic-7d78`) |
| Org | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| DB mutations | **NONE** |
| Release tree modifications | **NONE** (scripts executed from `/tmp/exp021-forensics-run`; `NODE_PATH` → release `node_modules` only) |

## Analysis basis corrections (vs initial coverage note)

| Topic | Correction |
| --- | --- |
| **48.4% trusted numeric** | Time-weighted share of the **selected 20-trip sample** (22 858 interval-seconds). **Not** a fleet-wide quota. |
| **“20/20 CURRENT V2 match”** | **Incorrect** in first coverage artifact. Persist lookup used `projection_version = 'V2'`; canonical rows use `projection_version = DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1` + `qc_policy_version = DI_V0_SPEED_QC_POLICY_V2`. **Verified: 2/20** sample trips have a CURRENT V2-policy row (both forced reference trips); **both match replay** on aggregates. Other 18 sample trips: replay-only (no persisted CURRENT row for active PRIMARY WI). |
| **Prior VPS run** | Copying analysis `.ts` into `/opt/synqdrive/current` was a **filesystem change** to the release tree (reverted). Future runs: `/tmp` workdir pattern below. |

## POSITION_GAP classification contract

**Priority (coverage diagnostic `mapUnassessableCause`, gap before hold):**

1. `CROSS_SOURCE_CONFLICT` (QC reason)
2. `SUPPORT_WINDOW_COMPROMISED` (QC reason)
3. `POS_GAP_*` from `classifyNoNumericDisjointV2` → bucket **`POSITION_GAP`** (except `WINDOW_EDGE_OUTSIDE_ACQUISITION` → `ACQUISITION_EDGE_SUPPORT`)
4. Hold / transition / movement buckets

**`POS_GAP_*` sub-types** (`classifySupportWindowGaps` on center ±1 s, first match in priority order):

`WINDOW_EDGE_OUTSIDE_ACQUISITION` → `MISSING_BUCKET_INSIDE_WINDOW` → `ROW_ABSENT_EXPLICIT` → `SIGNAL_NULL_EXPLICIT` → `INVALID_COORDINATES`.

**Staged bucket taxonomy** (acquisition window enumeration, independent of QC):

| Stage | Meaning |
| --- | --- |
| `EXPECTED_BUCKET_ABSENT_FROM_SNAPSHOT_MAP` | No normalized bucket entry for expected 1 s label |
| `ROW_ABSENT_EXPLICIT` | Bucket present, `availability = ROW_ABSENT` |
| `SIGNAL_NULL_EXPLICIT` | Bucket present, explicit null signal |
| `INVALID_COORDINATES` | Bucket present, coords invalid |
| `PRESENT_VALID_COORDINATES` | Valid L3 sample in pin |
| `WINDOW_EDGE_OUTSIDE_ACQUISITION` | Label outside `[start,end)` |

**Denominator:** trip-level percents use **shadow interval count** (= acquisition 1 s grid when one row per second). Fleet percents in coverage note use **sum of interval-seconds across 20 trips** (22 858).

## Fixed case identities (chosen before compute)

| Label | Trip | Work item | Vehicle | S4 `source_family` |
| --- | --- | --- | --- | --- |
| LONGEST_POSITION_GAP_RUN | `533b2bf8-fa07-4f0b-bc40-d540447a1542` | `339856c6-a4af-43f8-aecd-07baacec3d22` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | `RUPTELA_R1` |
| LONG_MIXED_UNASSESSABLE_RUN | `6bb3ddf2-48ca-4a9f-8d29-141f760f78e3` | `5d19a836-634e-4a67-9201-b2e54a3834e5` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | `RUPTELA_R1` |
| REFERENCE_LOW_GAP | `9ead317c-8725-4373-b9ac-8bb84d5549be` | `f9a2801f-a623-48ee-9337-33fe5e6cc155` | `8c850ff1-4201-432b-af2e-2711dbc7ca48` | `RUPTELA_R1` |

**Binding note:** `RUPTELA_R1` / `API_SYNTHETIC` are **S4 work-item source families**, not hardware SKUs. Sample vehicles use active **DIMO/DIMO** `vehicle_data_source_links` (see coverage note).

## CURRENT V2 persistence evidence (reference trip)

| Field | Value |
| --- | --- |
| Projection id | `3281cef1-40a6-4ed4-876f-8ee06bf5bc10` |
| Work item | `f9a2801f-a623-48ee-9337-33fe5e6cc155` |
| `qc_policy_version` | `DI_V0_SPEED_QC_POLICY_V2` |
| `projection_version` | `DI_V0_TRIP_SPEED_QUALITY_PROJECTION_V1` |
| `lifecycle_status` | `CURRENT` |
| `created_at` (UTC) | `2026-10-15T21:00:35.998Z` |
| Replay match | trusted numeric %, numeric % — **match** |

Second persisted sample trip: `72617129…` → projection `cf8c2cae-a002-4beb-8f47-213676d15c2d`, WI `74896a4d-75fa-4b5e-a892-87babb28aeae`, created `2026-10-15T21:25:36.413Z`.

## Forensic results summary

Artifact: `/opt/cursor/artifacts/exp021-position-gap-forensic.json`

### `533b2bf8…` — 1570 s POSITION_GAP run

| Metric | Value |
| --- | ---: |
| Interval-seconds (denominator) | 4694 |
| POSITION_GAP-classified interval-seconds | 3040 |
| Intervals with **center** bucket gap | 3040 (neighbor-only: 0) |
| `POS_GAP_ROW_ABSENT_EXPLICIT` interval-seconds | 3040 |
| Bucket stages (acquisition grid) | `ROW_ABSENT_EXPLICIT` **2966**; `PRESENT_VALID_COORDINATES` 1728; map-missing 0 |
| POSITION_GAP interval breakdown | **2966** center `ROW_ABSENT` + **74** center `PRESENT` with t±1 `ROW_ABSENT` (see `EXP021_BUCKET_INTERVAL_ALIGNMENT_2026-10-16.md`) |
| Longest POSITION_GAP run | **1570 s** UTC `2026-10-14T14:55:43Z` → `2026-10-14T15:21:52Z`; half-open end `15:21:53Z`; pin window **1550** `ROW_ABSENT` / **20** valid coords |
| Persisted CURRENT V2 | **None** for this WI |

**Longest-gap explanation:** The 1570 s block is a **contiguous run of evaluation intervals** classified `POSITION_GAP` because the **center** normalized position bucket in the **pinned snapshot** is `ROW_ABSENT_EXPLICIT` (explicit absent row — not “missing from map”). It is **not** a separate raw-provider proof; it is **proven through pin → normalized buckets → L3 support → V2 QC**. Not hold-priority override (no center gap → hold reclassification on these seconds).

### `6bb3ddf2…`

| Metric | Value |
| --- | ---: |
| POSITION_GAP interval-seconds | 1310 |
| `ROW_ABSENT_EXPLICIT` buckets | 1277 |
| Longest POSITION_GAP run | 772 s (`ROW_ABSENT_EXPLICIT`) |
| Coverage note “903 s MIXED” | Longest **unassessable** (WITHHELD+NO_NUMERIC) run — **not** pure POSITION_GAP |
| Persisted CURRENT V2 | **None** |

### `9ead317c…` (reference)

| Metric | Value |
| --- | ---: |
| POSITION_GAP interval-seconds | 49 |
| `ROW_ABSENT_EXPLICIT` buckets | 43 |
| Longest POSITION_GAP run | 34 s |
| Persisted CURRENT V2 | **Yes** (table above) |

## First proven divergence stage

**Pinned snapshot → normalized position buckets:** dominant mechanism for POSITION_GAP in these cases is **`ROW_ABSENT_EXPLICIT` at the center bucket** (S3A availability semantics), before hold/transition classes apply.

**Not claimed:** DIMO provider did not send coordinates for those seconds (would require **external** historical signals query aligned to pin window — **not executed**).

## Confirmed causes vs hypotheses

| Cause | Status | Stage | Seconds (533b2bf8 example) |
| --- | --- | --- | ---: |
| Center bucket `ROW_ABSENT` in pin | **CONFIRMED** | Normalized POSITION channel in pinned snapshot | 3040 interval-seconds; 2966 bucket labels |
| Map-missing bucket (no snapshot entry) | **Ruled out** on 533b2bf8 | — | 0 buckets |
| Hold / FROZEN primary driver for POSITION_GAP-labeled seconds | **Ruled out** for center-gap cases | QC priority | neighbor-only 0 |
| Provider outage / raw stream gap | **HYPOTHESIS** | Upstream of pin | Needs external DIMO window query |
| Ingest/fetch timestamp vs bucket raster | **Not mixed** in this analysis | Raster = UTC 1 s bucket labels from pin |

## Recoverable from existing stored data?

**No** for filling gaps: replay already consumes the full pinned container. **Yes** for further **read-only** forensics (snapshot byte-level channel stats, shadow vs position row alignment) without provider calls.

## Next smallest experiment (not executed)

**Target:** `533b2bf8…` window `2026-10-14T14:55:43Z`–`15:21:52Z`.

1. Read-only extract: count POSITION channel `ROW_ABSENT` vs `PRESENT` rows in pinned gzip JSON for that window (ops parser; no DB write).
2. **External (named, not run):** DIMO `signals(interval:"1s")` coordinates for same vehicle/window → would classify provider-literal gap vs pin-time absence.
3. **Success criterion:** ≥90% of ROW_ABSENT center labels in that window explained by either (a) matching provider null/absent in independent query, or (b) documented pin pipeline rule — without QC threshold changes.

## Repro (read-only, no release tree writes)

```bash
# On VPS — populate /tmp workdir from release src + tarball of analysis scripts
RELEASE=/opt/synqdrive/current/backend
ROOT=/tmp/exp021-forensics-run
rm -rf "$ROOT" && mkdir -p "$ROOT" && tar xzf /tmp/exp021-forensics.tgz -C "$ROOT"
rsync -a "$RELEASE/src/" "$ROOT/backend/src/"
cd "$RELEASE"
sudo bash -c 'set -a; source /opt/synqdrive/shared/backend.env; set +a
export NODE_PATH=$RELEASE/node_modules
export EXP021_RUNTIME_GIT_SHA=7de8f3ae2040a229f2a9c4b6a663117f1871fe55
export EXP021_ANALYSIS_GIT_SHA=3d3b22541e
export EXP021_POSITION_GAP_OUT=/tmp/exp021-position-gap-forensic.json
npx ts-node --project tsconfig.json --transpile-only $ROOT/backend/scripts/ops/exp021-position-gap-forensic.ts'
```

## Tests

- `di-v0-exp021-position-gap-forensic.unit.spec.ts` — bucket vs interval counting
- Coverage persist lookup fix covered by re-run policy (manual/ops)
