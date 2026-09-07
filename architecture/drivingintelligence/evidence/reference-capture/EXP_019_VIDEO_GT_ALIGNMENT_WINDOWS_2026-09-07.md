# EXP-019 — Video Ground-Truth Alignment Windows

**Date:** 2026-09-07  
**Session:** `2508b697-f101-4155-a0d3-8436e46bb779`  
**Calibration series:** `4d79843d-27b1-4bdb-9a2e-b6584545bbf9`  
**Bucket authority:** `TRUE_T30_SETTLED` (exact-window DIMO replay)  
**Export:** `2026-09-07T13:34:55.542Z`

> Prepares absolute UTC review windows for human/video analysis.  
> **Does not** interpret vehicle behavior — windows only.

## Video analysis constraints

| Field | Value |
|-------|-------|
| VIDEO_CLIP_CONTINUITY_REQUIRED | **NO** (manual cuts / phone call split reported) |
| ABSOLUTE_TIMESTAMP_REQUIRED | **YES** (overlay wall-clock is authority) |
| Coordinates in settled replay | **None observed** (lat/long absent in session) |

## Session timeline

| Field | UTC |
|-------|-----|
| VIDEO_ANCHOR_SERVER_UTC_AT | `2026-09-07T04:30:14.000Z` |
| SESSION_STARTED_AT_UTC | UNKNOWN |
| DRIVE_START_AUTHORIZED_AT_UTC | `2026-09-07T04:31:37.372Z` |
| SESSION_COMPLETED_AT_UTC | `2026-09-07T05:00:20.016Z` |

## Phase boundaries (exact)

| Phase | requestedAt | effectiveAt | phaseStartedAt | phaseEndedAt |
|-------|-------------|-------------|----------------|--------------|
| **10s** | `04:31:35.354Z` | `04:31:37.372Z` | `04:31:36.025Z` | `04:36:42.969Z` |
| **20s** | `04:36:37.461Z` | `04:36:43.500Z` | `04:36:42.969Z` | `04:41:45.392Z` |
| **30s** | `04:41:43.578Z` | `04:41:45.619Z` | `04:41:45.392Z` | `04:48:17.964Z` |
| **60s** | `04:48:15.731Z` | `04:48:19.769Z` | `04:48:17.964Z` | `05:00:20.016Z` |

### Transition windows (excluded from primary native gap stats)

| Phase | transitionStart | transitionEnd |
|-------|-----------------|---------------|
| 20s | `04:36:28.558Z` | `04:36:40.284Z` |
| 20s | `04:36:34.284Z` | `04:37:02.913Z` |
| 30s | `04:41:30.666Z` | `04:41:42.791Z` |
| 30s | `04:41:36.791Z` | `04:42:17.001Z` |
| 60s | `04:47:52.380Z` | `04:48:15.325Z` |
| 60s | `04:48:09.325Z` | `04:49:17.923Z` |

---

## Max gaps per phase (P0 — highest priority video review)

| Phase | gapId | gapStartUtc | gapEndUtc | duration | reviewStartUtc (−10s) | reviewEndUtc (+10s) |
|-------|-------|-------------|-----------|----------|----------------------|---------------------|
| **10s** | GAP_10_001 | `04:35:29.538Z` | `04:35:52.304Z` | **22.8s** | `04:35:19.538Z` | `04:36:02.304Z` |
| **20s** | GAP_20_003 | `04:37:13.913Z` | `04:40:02.534Z` | **168.6s** | `04:37:03.913Z` | `04:40:12.534Z` |
| **30s** | GAP_30_004 | `04:42:54.742Z` | `04:44:52.054Z` | **117.3s** | `04:42:44.742Z` | `04:45:02.054Z` |
| **60s** | GAP_60_031 | `04:54:29.814Z` | `04:56:56.693Z` | **146.9s** | `04:54:19.814Z` | `04:57:06.693Z` |

Verified against prior settlement evidence: 22766 / 168621 / 117312 / 146879 ms.

---

## Gap inventory summary (PHASE_NATIVE, transition-excluded)

| Metric | Count |
|--------|-------|
| Total gaps ≥10s | 26 |
| Total gaps ≥20s | 15 |
| Total gaps ≥60s | 4 |
| Raw video windows (≥20s) | 13 |
| Merged video review windows | 7 |

### Gaps ≥20s (non-max, secondary review)

| Phase | gapId | gapStartUtc | gapEndUtc | duration | priority |
|-------|-------|-------------|-----------|----------|----------|
| 30s | GAP_30_003 | `04:42:34.001Z` | `04:42:54.742Z` | 20.7s | P2 |
| 30s | GAP_30_018 | `04:45:25.436Z` | `04:45:45.609Z` | 20.2s | P2 |
| 30s | GAP_30_020 | `04:45:55.609Z` | `04:46:16.344Z` | 20.7s | P2 |
| 30s | GAP_30_021 | `04:46:16.344Z` | `04:47:35.968Z` | 79.6s | P1 |
| 60s | GAP_60_001 | `04:49:23.923Z` | `04:49:43.923Z` | 20.0s | P2 |
| 60s | GAP_60_011 | `04:50:45.712Z` | `04:51:05.712Z` | 20.0s | P2 |
| (+ additional 60s ~20s gaps) | … | `04:51:25`–`04:53:18` | … | 20s each | P2 |

### Merged video review windows (overlap ≤5s merged)

| VIDEO_WINDOW_ID | phase | reviewStartUtc | reviewEndUtc | duration | source gaps |
|-----------------|-------|----------------|--------------|----------|-------------|
| VID_10_P0_GAP_10_001 | 10s | `04:35:19.538Z` | `04:36:02.304Z` | 22.8s | GAP_10_001 |
| VID_20_P0_GAP_20_003 | 20s | `04:37:03.913Z` | `04:40:12.534Z` | 168.6s | GAP_20_003 |
| VID_30_P2_GAP_30_003 | 30s | `04:42:24.001Z` | `04:45:02.054Z` | 138.1s | GAP_30_003 + **GAP_30_004 (max)** |
| VID_30_P2_GAP_30_018 | 30s | `04:45:15.436Z` | `04:47:45.968Z` | 130.5s | GAP_30_018,020,021 |
| VID_60_P2_GAP_60_001 | 60s | `04:49:13.923Z` | `04:49:53.923Z` | 20.0s | GAP_60_001 |
| VID_60_P2_GAP_60_011 | 60s | `04:50:35.712Z` | `04:53:28.441Z` | 152.7s | GAP_60_011,013,014,015,017,019 |
| VID_60_P0_GAP_60_031 | 60s | `04:54:19.814Z` | `04:57:06.693Z` | 146.9s | GAP_60_031 |

**Note:** Merge logic may subsume a P0 max-gap into a larger merged window (e.g. 30s max gap). Analysts should use **max-gap timestamps above** as canonical P0 anchors.

---

## Signal-specific gaps (≥10s, settled)

Exported separately in `signal-gaps.json` on VPS. Signals: speed, RPM, TPS, throttle, engine load.

Coordinates: **no settled buckets** in this session (consistent with live capture).

---

## VPS artifacts (read-only derived)

| File | Path |
|------|------|
| Phase boundaries | `/tmp/exp-019-video-alignment/phase-boundaries.json` |
| Settled native series | `/tmp/exp-019-video-alignment/settled-native-series.json` |
| All gaps | `/tmp/exp-019-video-alignment/all-gaps.json` |
| Signal gaps | `/tmp/exp-019-video-alignment/signal-gaps.json` |
| Video review windows | `/tmp/exp-019-video-alignment/video-review-windows.json` |
| Gap context (P0/P1) | `/tmp/exp-019-video-alignment/gap-context.json` |
| Export summary | `/tmp/exp-019-video-alignment/export-summary.json` |

**Forensic export script (not production runtime):** `architecture/drivingintelligence/scripts/exp-019-video-gt-alignment-export.cjs`

---

## Next step

Human/video analyst: for each P0 window, inspect overlay timestamp video between `reviewStartUtc` and `reviewEndUtc` and record what occurred during the telemetry gap interval (`gapStartUtc` → `gapEndUtc`).

Do **not** use clip duration stitching — use absolute overlay timestamps across manual cuts.

---

## Video GT event register (human-verified)

Full per-window correlation against all DI authorities:

**`EXP_019_VIDEO_GT_EVENT_REGISTER_2026-09-07.md`**

Machine-readable: `/tmp/exp-019-video-alignment/video-gt-event-register.json`
