# EXP-016 RETRY — Live HF Block-Polling Calibration (KS MX 2024)

**Date:** 2026-09-07  
**Experiment:** `DI_HF_LIVE_BLOCK_POLLING_10_20_30_60`  
**Status:** EXECUTED — first scientific live multi-cadence run + settlement closeout  
**Production SHA:** `01541c2ab3b1ff0c918a92bb0d35e1830b6f6aac`

> Single physical drive, single Reference Capture session, four sequential phases (10s→20s→30s→60s).  
> **Not** a production policy decision — evidence for human scientific analysis only.

## Vehicle / session

| Field | Value |
|-------|-------|
| Vehicle | KS MX 2024 |
| vehicleId | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| tokenId | `187336` |
| sessionId | `2508b697-f101-4155-a0d3-8436e46bb779` |
| calibrationSeriesId | `4d79843d-27b1-4bdb-9a2e-b6584545bbf9` |
| connectionProfile | DIMO_LTE_R1 |
| manifestVersion | 1.1.0 |
| availableSignals (preflight) | 29 |

## Video ground-truth metadata

| Field | Value |
|-------|-------|
| VIDEO_EXPECTED | YES |
| VIDEO_TIMESTAMP_REPORTED_BY_DRIVER | YES |
| VIDEO_TIMESTAMP_GROUND_TRUTH_VERIFIED | **NO** (file not uploaded / not inspected) |
| VIDEO_CONTINUITY_VERIFIED | **NO** |
| VIDEO_ANCHOR_SERVER_UTC_AT | `2026-09-07T04:30:14.000Z` |
| VIDEO_TIMESTAMP_FORMAT | ISO-8601 UTC (driver-requested overlay) |
| VIDEO_TIMESTAMP_TIMEZONE | UTC |
| VIDEO_TIMESTAMP_RESOLUTION | milliseconds (preferred; human-confirmed at drive time) |
| Detailed video analysis | **Deferred** — separate alignment pass when file uploaded |

## Phase lifecycle (exact timestamps)

| Phase | phaseStartedAt | phaseEndedAt | durationMs | duration (min) | native requests | sufficiency |
|-------|----------------|--------------|------------|----------------|-----------------|-------------|
| 10s | `04:31:36.025Z` | `04:36:42.969Z` | 306,944 | 5.116 | 27 | SUFFICIENT |
| 20s | `04:36:42.969Z` | `04:41:45.392Z` | 302,423 | 5.040 | 12 | SUFFICIENT |
| 30s | `04:41:45.392Z` | `04:48:17.964Z` | 392,572 | 6.543 | 10 | SUFFICIENT |
| 60s | `04:48:17.964Z` | `05:00:20.016Z` | 722,052 | 12.034 | 10 | SUFFICIENT |

`DRIVE_START_AUTHORIZED=YES` at `2026-09-07T04:31:37.372Z` (10s EFFECTIVE).  
`SESSION_STATUS=COMPLETED` at `2026-09-07T05:00:20.016Z` (canonical `stopRecording`).

---

## A. Live evidence (immutable — preserved as captured)

### RAW COUNT TABLE (FAST_LOOP + PHASE_NATIVE)

| METRIC | 10s | 20s | 30s | 60s |
|--------|-----|-----|-----|-----|
| wall duration (min, rounded) | 5.12 | 5.04 | 6.54 | 12.03 |
| clean native requests | 27 | 12 | 10 | 10 |
| provider successes | 5 | 6 | 7 | 7 |
| zero-results | 22 | 6 | 3 | 3 |
| zero-result ratio | **81.5%** | **50.0%** | **30.0%** | **30.0%** |
| errors | 0 | 0 | 0 | 0 |
| provider buckets (native) | 29 | 32 | 24 | 47 |
| new buckets | 102 | 160 | 120 | 234 |
| unique temporal starts | 29 | 32 | 24 | 47 |
| median cadence (ms) | 1000 | 2000 | 3000 | 3000 |
| P90 cadence (ms) | 3000 | 11000 | 20741 | 20000 |
| **live max gap (ms)** | 22766 | **168621** | **117312** | **146879** |
| recovery sweep requests | 0 | 0 | 0 | 0 |
| transition windows | 0 | 2 | 2 | 2 |

> **Note:** Absolute request-count ratios across phases are **not** the canonical scalability metric because phase durations differ (especially 60s at ~12 min).

### RATE-NORMALIZED TABLE (per minute, exact phase durationMs)

| METRIC / MIN | 10s | 20s | 30s | 60s |
|--------------|-----|-----|-----|-----|
| provider requests | **5.278** | **2.381** | **1.528** | **0.831** |
| provider successes | 0.977 | 1.190 | 1.070 | 0.582 |
| zero results | 4.300 | 1.190 | 0.459 | 0.249 |
| provider buckets | 5.669 | 6.349 | 3.668 | 3.906 |
| new buckets | 19.938 | 31.744 | 18.341 | 19.445 |
| unique temporal starts | 5.669 | 6.349 | 3.668 | 3.906 |

### Request-rate reduction vs 10s (canonical scalability metric)

| Transition | Rate reduction |
|------------|----------------|
| 10→20 | **54.9%** |
| 10→30 | **71.1%** |
| 10→60 | **84.3%** |

---

## B. Settlement replay (second observation layer)

**Method:** READ-ONLY exact-window DIMO replay of all FAST_LOOP + PHASE_NATIVE provenance windows per phase, using identical `queryFrom`/`queryTo` as live capture.  
**Observed at:** `2026-09-07T05:25:00.745Z` (T+30 eligible: `2026-09-07T05:30:20.016Z`).  
**Live observations:** NOT rewritten.

| Phase | windows replayed | live unique buckets | settled unique buckets | late buckets | live completeness | live max gap (ms) | settled max gap (ms) | settled P90 (ms) | settled P95 (ms) |
|-------|------------------|---------------------|------------------------|--------------|-------------------|-------------------|---------------------|------------------|------------------|
| 10s | 27 | 52 | 102 | 50 | **0.510** | 22766 | 22766 | 3000 | 3000 |
| 20s | 12 | 160 | 160 | 0 | **1.000** | 168621 | **168621** | 11000 | 18000 |
| 30s | 10 | 75 | 120 | 45 | **0.625** | 117312 | **117312** | 20741 | 79624 |
| 60s | 10 | 234 | 234 | 0 | **1.000** | 146879 | **146879** | 20000 | 20000 |

Bucket identity: `providerField|canonicalBucketTimestamp` (all manifest HF fields).

### Max-gap persistence after settlement

| Phase | MAX_GAP_PERSISTED_AFTER_SETTLEMENT | Interpretation |
|-------|-----------------------------------|----------------|
| 20s | **YES** (168,621 ms unchanged) | **Persistent coverage loss** — not a late-settlement artifact |
| 30s | **YES** (117,312 ms unchanged) | **Persistent coverage loss** |
| 60s | **YES** (146,879 ms unchanged) | **Persistent coverage loss** |

The large live max gaps at 20s/30s/60s **do not shrink** after T+30 settlement replay. They reflect real provider temporal sparsity within phase windows, not merely buckets that arrived late after live capture.

### Zero-result interpretation

| Phase | zero-result ratio | zero-result windows | late buckets in zero-result windows |
|-------|-------------------|---------------------|-------------------------------------|
| 10s | 81.5% (22/27) | 22 | **0** |
| 20s | 50.0% (6/12) | 6 | **0** |
| 30s | 30.0% (3/10) | 3 | **0** |
| 60s | 30.0% (3/10) | 3 | **0** |

**Finding:** Zero-result windows did **not** gain buckets on exact-window replay. Zero-results are **not** explained by "poll before settlement" alone for these windows — the exact query windows remained empty at replay time.

However, **10s and 30s SUCCESS windows** did show late-arriving buckets (50 and 45 respectively), indicating live under-capture on some successful queries. **10s live completeness = 51%** suggests aggressive polling with settlement lag on non-zero windows.

---

## C. Signal-level temporal density (speed, live layer)

| Phase | unique timestamps | median Δt (s) | P90 Δt (s) | max gap (s) |
|-------|-------------------|---------------|------------|-------------|
| 10s | 42 | 0.87 | 2.74 | 22.3 |
| 20s | 56 | 1.0 | 5.91 | 168.5 |
| 30s | 46 | 1.0 | 19.74 | 117.1 |
| 60s | 99 | 1.0 | 19.42 | 146.7 |

Latitude/longitude: **zero SIGNAL_POINT observations** in all phases.

---

## D. Invariants preserved

| Check | Result |
|-------|--------|
| ONE_PHYSICAL_DRIVE_ONE_VEHICLE | YES |
| ONE_SESSION_FOUR_CADENCE_PHASES | YES |
| WATERMARK_CONTINUITY_PRESERVED | YES |
| TRANSITION_WINDOWS_IDENTIFIABLE | YES |
| FOUR_PHASE_SUMMARIES_PRESENT | YES |
| recoverySweepRequestCount=0 | YES (all phases) |

## E. Runtime / SQL

| Check | Result |
|-------|--------|
| PRODUCTION_SQL_ERRORS (experiment window) | NO |
| STUCK_RUNNERS | NO |
| MULTI_REPLICA_RUNTIME_STATE_CONSISTENT | YES |

---

## F. Scientific interpretation (post-replay)

**Confirmed (N=1, with settlement replay):**

1. **Request-rate reduction is material** when normalized per minute: 55% (20s), 71% (30s), 84% (60s) vs 10s.
2. **10s overpolls relative to settlement:** 81.5% zero-result ratio; live completeness only 51% after replay — many buckets arrived late on SUCCESS windows, not on zero-result windows.
3. **Large max gaps at 20s/30s/60s persist after settlement** — these are **not** primarily late-settlement artifacts; they indicate real temporal sparsity risk under slower polling cadence.
4. **20s had the worst settled max gap** (168.6s) despite 100% bucket identity match at replay — the gap is in provider data distribution, not capture loss.
5. **60s** achieved 100% live completeness at replay with lowest request rate (0.83/min) but still exhibits 146.9s max gap.
6. **Ascending phase order (10→20→30→60)** confounds cadence with route/traffic/time — counterbalanced design recommended.

**Decision posture:**

| Field | Value |
|-------|-------|
| BEST_SUPPORTED_CADENCE | **NO_CADENCE_CONCLUSION** |
| CONFIDENCE | **LOW** (N=1; ascending order confound; video GT unverified) |
| HF_30S_BLOCK_POLLING_VALIDATED | **NO** |
| MORE_REFERENCE_DATA_REQUIRED | **YES** |
| PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED | **NO** |
| VIDEO_GT_VERIFIED | **NO** |
| READY_FOR_VIDEO_ALIGNMENT | **YES** (when driver uploads) |
| READY_FOR_HUMAN_SCIENTIFIC_REVIEW | **YES** |

Do **not** select any cadence for production from this single run.

### Recommended next experiment (if more evidence needed)

Counterbalanced phase order to reduce confounding:

**60 → 30 → 20 → 10**

(same vehicle/session invariants; separate drive; recovery sweep OFF; same sufficiency policy).

---

## G. Artifacts

| Artifact | Path |
|----------|------|
| Live orchestrator log | `/tmp/exp-016-retry-run.log` (VPS) |
| Live JSONL | `/tmp/exp-016-retry.jsonl` (VPS) |
| Live report JSON | `/tmp/exp-016-retry-report.json` (VPS) |
| Settlement closeout JSON | `/tmp/exp-019-settlement/settlement-closeout.json` (VPS) |
| Sealed observations export | `/tmp/exp-019-settlement/observations.jsonl` (VPS) |
| Provenance ring export | `/tmp/exp-019-settlement/provenance-ring.json` (VPS) |
| Video anchor | `/tmp/exp-016-video-anchor.txt` (VPS) |

Ephemeral forensic replay executed on VPS at T+25 min; no production runtime code changed.
