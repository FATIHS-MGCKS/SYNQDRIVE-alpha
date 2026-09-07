# EXP-016 RETRY — Live HF Block-Polling Calibration (KS MX 2024)

**Date:** 2026-09-07  
**Experiment:** `DI_HF_LIVE_BLOCK_POLLING_10_20_30_60`  
**Status:** EXECUTED — first scientific live multi-cadence run  
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
| VIDEO_ANCHOR_SERVER_UTC_AT | `2026-09-07T04:30:14.000Z` |
| VIDEO_TIMESTAMP_FORMAT | ISO-8601 UTC (driver-requested overlay) |
| VIDEO_TIMESTAMP_TIMEZONE | UTC |
| VIDEO_TIMESTAMP_RESOLUTION | milliseconds (preferred; human-confirmed at drive time) |
| VIDEO_CONTINUOUS | pending human upload / confirmation |
| Detailed video analysis | **NOT performed during live run** |

## Phase lifecycle

| Phase | requestedAt | effectiveAt | duration | native requests | sufficiency |
|-------|-------------|-------------|----------|-----------------|-------------|
| 10s | `04:31:35.354Z` | `04:31:37.372Z` | ~5.1 min | 26 | SUFFICIENT |
| 20s | `04:36:37.461Z` | `04:36:43.500Z` | ~5.0 min | 11 | SUFFICIENT |
| 30s | `04:41:43.578Z` | `04:41:45.619Z` | ~6.5 min | 10 | SUFFICIENT |
| 60s | `04:48:15.731Z` | `04:48:19.769Z` | ~12.0 min | 10 | SUFFICIENT |

`DRIVE_START_AUTHORIZED=YES` at `2026-09-07T04:31:37.372Z` (10s EFFECTIVE).  
`SESSION_STATUS=COMPLETED` at `2026-09-07T05:00:20.016Z` (canonical `stopRecording`).

## Primary comparison table (FAST_LOOP + PHASE_NATIVE)

| METRIC | 10s | 20s | 30s | 60s |
|--------|-----|-----|-----|-----|
| wall duration (min) | 5.1 | 5.0 | 6.5 | 12.0 |
| clean native requests | 27 | 12 | 10 | 10 |
| provider successes | 5 | 6 | 7 | 7 |
| zero-results | 22 | 6 | 3 | 3 |
| errors | 0 | 0 | 0 | 0 |
| provider buckets (native) | 29 | 32 | 24 | 47 |
| new buckets | 102 | 160 | 120 | 234 |
| unique temporal starts | 29 | 32 | 24 | 47 |
| median cadence (ms) | 1000 | 2000 | 3000 | 3000 |
| P90 cadence (ms) | 3000 | 11000 | 20741 | 20000 |
| max gap (ms) | 22766 | 168621 | 117312 | 146879 |
| recovery sweep requests | 0 | 0 | 0 | 0 |
| transition windows | 0 | 2 | 2 | 2 |

### Relative request reduction (vs 10s baseline)

| Transition | Request ratio | Approx reduction |
|------------|---------------|------------------|
| 10→20 | 12/27 | 56% |
| 10→30 | 10/27 | 63% |
| 10→60 | 10/27 | 63% |

## Signal-level temporal density (speed exemplar)

| Phase | unique timestamps | median Δt (s) | P90 Δt (s) | max gap (s) |
|-------|-------------------|---------------|------------|-------------|
| 10s | 42 | 0.87 | 2.74 | 22.3 |
| 20s | 56 | 1.0 | 5.91 | 168.5 |
| 30s | 46 | 1.0 | 19.74 | 117.1 |
| 60s | 99 | 1.0 | 19.42 | 146.7 |

Latitude/longitude: **zero SIGNAL_POINT observations** in all phases (manifest gap for this vehicle/session).

RPM/TPS/throttle/load: present with similar cadence patterns to speed.

## Invariants preserved

| Check | Result |
|-------|--------|
| ONE_PHYSICAL_DRIVE_ONE_VEHICLE | YES |
| ONE_SESSION_FOUR_CADENCE_PHASES | YES |
| WATERMARK_CONTINUITY_PRESERVED | YES (single series, no reset) |
| TRANSITION_WINDOWS_IDENTIFIABLE | YES |
| FOUR_PHASE_SUMMARIES_PRESENT | YES |
| recoverySweepRequestCount=0 | YES (all phases) |

## Runtime / SQL

| Check | Result |
|-------|--------|
| PRODUCTION_SQL_ERRORS (experiment window) | NO |
| STUCK_RUNNERS | NO |
| MULTI_REPLICA_RUNTIME_STATE_CONSISTENT | YES (observed; no duplicate phase activation) |

## Post-run settlement replay

| Check | Result |
|-------|--------|
| POST_RUN_REPLAY_EXECUTED | NO — no generic session replay tooling wired for this run |
| LATE_BUCKETS_OBSERVED | UNKNOWN (replay deferred) |

Schedule: T+10 min / T+30 min settlement comparison recommended as follow-up.

## Preliminary interpretation (NOT production-validated)

**Observed (this single drive):**

- Provider **request count** drops materially at 20s/30s/60s vs 10s (~56–63% fewer FAST_LOOP native requests).
- **Observed bucket / signal Δt** remains ~1s median across phases — poll cadence ≠ observed physical bucket cadence (canonical invariant holds).
- **10s phase** had very high zero-result rate (22/27) — provider settlement / query-window sparsity dominates early phase.
- **Slower phases** show **large native max temporal gaps** (up to ~169s at 20s, ~147s at 60s) — temporal continuity risk under slower polling.
- **60s** collected the most native unique temporal starts (47) in phase summaries but over longest wall duration and with sparse provider requests.

**Decision posture:**

| Field | Value |
|-------|-------|
| BEST_SUPPORTED_CADENCE | **NO CADENCE CONCLUSION** |
| BEST_SUPPORTED_CADENCE_CONFIDENCE | LOW (N=1 drive; no replay; video GT pending) |
| HF_30S_BLOCK_POLLING_VALIDATED | **NO** |
| MORE_REFERENCE_DATA_REQUIRED | **YES** |
| PRODUCTION_HF_POLICY_CHANGE_AUTHORIZED | **NO** |

Do **not** select 30s (or any cadence) for production from this single run alone.

## Artifacts

| Artifact | Path (VPS) |
|----------|------------|
| Orchestrator log | `/tmp/exp-016-retry-run.log` |
| Structured JSONL | `/tmp/exp-016-retry.jsonl` |
| Report JSON | `/tmp/exp-016-retry-report.json` |
| Video anchor | `/tmp/exp-016-video-anchor.txt` |

Ephemeral orchestrator: `/opt/synqdrive/current/backend/scripts/ops/exp-016-retry-orchestrator.ts` (not committed during experiment).
