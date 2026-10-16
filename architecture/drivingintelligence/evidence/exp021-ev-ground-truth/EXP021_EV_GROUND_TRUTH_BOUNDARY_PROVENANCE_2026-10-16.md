# EXP021 — trip start boundary provenance (Auftrag 1)

**Status:** CONFIRMED (Production read-only @ `a0ce01f…`, 2026-10-16)  
**Trip:** `358d0158-b2a9-47ed-af26-33926c5770b4`  
**Frozen baseline:** [`pre-deploy/`](./pre-deploy/) — **unchanged**  
**Machine export:** [`forensic-readonly-exports-2026-10-16/TRIP_BOUNDARY_PROVENANCE_EXPORT.json`](./forensic-readonly-exports-2026-10-16/TRIP_BOUNDARY_PROVENANCE_EXPORT.json)

## Executive conclusion

The persisted start **`2026-10-16T03:36:00.000Z`** is **byte-aligned with the canonical DIMO segment id** stored on the trip, not an ad-hoc FSM timestamp invented without provider linkage.

| Evidence | Value | Epistemic |
|----------|-------|-----------|
| `vehicle_trips.dimo_segment_id` | `dimo-seg-186946-1792121760000` | **CONFIRMED** |
| Segment epoch in id (`1792121760000` ms) | `2026-10-16T03:36:00.000Z` | **CONFIRMED** (decode) |
| `vehicle_trips.start_time` | `2026-10-16T03:36:00.000Z` | **CONFIRMED** |
| `raw_detection_meta.lifecycleRecovery.startEpisode.effectiveStartAt` | `2026-10-16T03:36:00.000Z` | **CONFIRMED** |
| `raw_detection_meta.lifecycleRecovery.startEpisode.candidateStartAt` | `2026-10-16T03:38:26.989Z` | **CONFIRMED** |
| `vehicle_trips.start_detection_mode` | `FREQUENCY_FALLBACK` | **CONFIRMED** |
| `vehicle_trips.created_at` | `2026-10-16T03:38:31.690Z` | **CONFIRMED** |
| Owner video overlay (external review) | `2026-10-16T03:37:41Z` | **CONFIRMED_EXTERNAL_REVIEW** |

**Interpretation:** The platform start is **DIMO-segment-canonical** at whole-second `03:36:00Z`. FSM/lifecycle metadata shows a **later start candidate** (`03:38:26.989Z`) that was **backdated** to the segment `effectiveStartAt` (`03:36:00Z`) — adjustment **~146.989 s** relative to that candidate, separate from the **101 s** video-overlay offset.

This does **not** prove the segment itself matches physical departure (reverse maneuver at video t=0). It **does** prove the stored boundary was **not** randomly early relative to missing `dimo_segment_id`; the early grid is **segment-boundary-driven**.

## Event chain (source → stored)

| Step | UTC / note | Source field |
|------|------------|--------------|
| Provider segment start (encoded) | `03:36:00.000Z` | `dimo_segment_id` suffix |
| Persisted trip start | `03:36:00.000Z` | `vehicle_trips.start_time` |
| S4 acquisition grid start | `03:36:00Z` | pinned snapshot window (frozen replay) |
| Start episode candidate | `03:38:26.989Z` | `raw_detection_meta.lifecycleRecovery.startEpisode.candidateStartAt` |
| Effective start applied | `03:36:00.000Z` | `…startEpisode.effectiveStartAt` |
| Trip row inserted | `03:38:31.690Z` | `vehicle_trips.created_at` |
| First ACTIVE_TRACKING window in export | from `03:38:01.237Z` | `vehicle_trip_tracking_runs` (post-create) |
| External video clock | `03:37:41Z` | owner `TC_00062.MOV` (kompakt review) |

`last_evidence_summary` on `vehicle_trip_detection_states` was **empty at export** (post-trip RESTING); start-time detail lives in **`raw_detection_meta`** + trip row.

`tripFsmForensics.start.boundarySource` is **null** in persisted meta; end boundary is populated (`clickhouse_segment_end`). **Gap:** start boundary source string was not stamped in forensics block even though segment id is present.

## Code path (repository, not re-run)

`resolveConfirmedStartBoundary()` prefers a matching **DIMO segment** `startTime` when present (`trip-detection-orchestration.service.ts`). Second-aligned `03:36:00Z` matches segment-id encoding.

## Remaining gaps (no provider fetch in this task)

| Gap | Blocker |
|-----|---------|
| Live DIMO segment payload JSON at capture | No provider API call authorized |
| Ingest receive timestamps for first positions | Not in pinned S4 export |
| Exact FSM `confirmedStartSource` string | Null in `tripFsmForensics.start`; candidate/start episode meta partially fills |

## Non-effects

`PRODUCTION_MUTATIONS=NONE`, `PROVIDER_CALLS=NONE`, pre-deploy `SHA256SUMS` **unchanged**, boundaries **not** modified, coverage **not** re-labelled.
