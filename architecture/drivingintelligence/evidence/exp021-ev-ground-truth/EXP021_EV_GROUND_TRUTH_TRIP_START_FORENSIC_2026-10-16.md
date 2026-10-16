# EXP021 EV Ground Truth — trip-start forensic (read-only)

**Status:** ANALYZED (rules + frozen pre-deploy replay; **no** boundary change, **no** provider fetch, **no** deploy)  
**Trip:** `358d0158-b2a9-47ed-af26-33926c5770b4`  
**Persisted start (Production @ `a0ce01f…`):** `2026-10-16T03:36:00.000Z` (Berlin `05:36:00`)  
**Frozen baseline:** [`pre-deploy/`](./pre-deploy/) — **unchanged** (`SHA256SUMS` not modified by this note).

## Owner video context (2026-10-16, post-baseline)

| Fact | Value |
|------|--------|
| File | `TC_00062.MOV` (not in git; no earlier video) |
| Visible maneuver at video start | Reverse driving = **physical trip start** (exact frame TBD by external video review) |
| On-screen iPhone clock at video start | **05:37:41** Europe/Berlin → **03:37:41.000Z** |
| GPS overlay source | Recording iPhone (independent display path; not ingested into SynqDrive) |

**Clock offset (persisted start vs video overlay start):** **101 s** earlier than overlay clock  
(`03:36:00Z` → `03:37:41Z`). Physical start within the clip is **≥** overlay start (reverse visible from t=0 of file).

---

## 1) What determined the persisted trip start?

### Confirmed from frozen manifest + code path (repository)

| Layer | Determinant |
|-------|-------------|
| **Persisted boundary** | `vehicle_trips.start_time` = `2026-10-16T03:36:00.000Z` (ms aligned to whole second) |
| **S4 acquisition grid** | `acquisition_window_start` = same instant; first bucket `2026-10-16T03:36:00Z` |
| **Boundary fingerprint** | Pinned = live `DI_V0_S4_BOUNDARY_FP_V1:sha256:59fcdaad…` (includes start/end + repair generation) |
| **FSM at capture** | `RESTING`, `activeTripId=null` (post-trip; no live start decision in baseline snapshot) |
| **Repair** | Only `PARTIAL_TRIP_BOUNDARY_EXTENSION` **SUPPRESSED** on **end** window — **not** start |

### Inferred FSM / provider rule (code, not re-run on Production)

On trip creation the orchestration path is:

1. `POSSIBLE_START` with `possibleStartAt` (candidate).  
2. `StartConfirmationDetector` (+ optional analytics assist) confirms.  
3. `resolveConfirmedStartBoundary()` **prefers DIMO Segments**: if a matching segment exists,  
   `startAt = new Date(matchingSegment.startTime)` with `source: 'DIMO_SEGMENT'`.  
4. Otherwise `refineTripStartBoundary()` from core/route activity (`ROUTE_ACTIVITY` / `CORE_ACTIVITY` / `SNAPSHOT_CANDIDATE`).

**Second-aligned `03:36:00.000Z` is consistent with a DIMO segment boundary timestamp**, not sub-second route refinement.

### Missing evidence (not in frozen `pre-deploy/` package)

| Gap | Why it matters |
|-----|----------------|
| `vehicle_trips.dimo_segment_id` | Would name the canonical segment whose `startTime` likely equals persisted start |
| `raw_detection_meta` / `lastEvidenceSummary` | Would carry `confirmedStartAt`, `confirmedStartSource`, `startCandidateAt`, FSM processing instants |
| DIMO segment payload for this window | Would show provider segment start vs telemetry motion |
| Video sync table | Owner clock vs telemetry — **pending** ChatGPT / ingest protocol |

**Conclusion (epistemic):** Persisted start was **rule-confirmed** into `vehicle_trips.start_time` and propagated to S4 acquisition + boundary fingerprint. **Physical video verification was not part of admission** (`ADMISSION_RECORD_MISSING` on this SHA). The **specific signal row** (segment id vs refined activity) is **INFERRED** as DIMO-segment-first, not **CONFIRMED** without `raw_detection_meta` export.

---

## 2) Source timestamp vs receive vs FSM processing

| Clock | Available in pre-deploy? | Role |
|-------|--------------------------|------|
| **Source / observation time** (DIMO position buckets) | Partial — `bucketLabelUtc` per second in replay | L3/QC uses pinned POSITION snapshot buckets inside trip window |
| **Receive / ingest time** | **Not exported** | Would live in telemetry ingest / worker logs |
| **FSM processing time** (`confirmedAt`, worker `now`) | **Not exported** | Would be in `raw_detection_meta` / tracking runs |

Per-second replay is **pinned S4 evidence + shadow L3 replay**, not the live FSM decision log.  
Do **not** equate `bucketLabelUtc` with trip-start decision time.

---

## 3) Start rule, backdating, lead time, GPS drift

| Topic | Finding |
|-------|---------|
| **Start rule** | Canonical trip boundary follows FSM confirmation + `resolveConfirmedStartBoundary` (DIMO segment preferred). |
| **Backdating / lookback** | `tripStartBoundaryMaxLookbackMs` (default **35 min**) allows shifting start earlier than confirmation instant within provider window — **magnitude unknown** without meta. |
| **Lead time vs video** | **101 s** of acquisition grid exists **before** owner overlay clock; replay shows **no trusted numeric speed** in that prefix. |
| **GPS drift / sparse POSITION** | First `PRESENT` bucket `03:36:06Z` (single second); many `ROW_ABSENT` buckets early; first `TRANSITION_UNCERTAIN` **`03:37:46Z`** (+5 s vs overlay clock); first **TRUSTED** L3 speed **`03:38:09Z`** (~5.5 km/h). Suggests **telemetry motion/QC lags** both persisted start and video clock. |

---

## 4) Boundary reconciliation

| Check | Result |
|-------|--------|
| Physical (video) start reviewed in platform? | **No** — `video.receivedAndAnalyzed=false` in manifest |
| Rule-based confirmation only? | **Yes** — boundaries match pinned fingerprint; admission gate failed for missing record, not for start mismatch |
| End boundary | Owner ms matches segment end; suppressed end-extension repair |
| Start boundary challenged by owner? | **Yes (qualitative)** — reverse at video t=0; overlay **05:37:41** |

---

## 5) Quantified effect if persisted start is ~101 s too early

Denominator = **1136** one-second buckets (`03:36:00Z` … exclusive `03:54:56Z`).  
Verified V2 summary on full window: **trusted numeric coverage 68.2%** (775 trusted buckets).

| Scenario | Rows | Trusted buckets | Trusted % (trusted/rows) |
|----------|------|-----------------|----------------------------|
| **As persisted** | 1136 | 775 | **68.22%** |
| **Hypothetical grid from video overlay start** (`03:37:41Z`, same end) | 1035 | 775 (unchanged trusted set) | **74.88%** |
| **First 101 s (pre-overlay) only** | 101 | **0** trusted, **0** numeric L3 | **0%** — all `UNTRUSTED` / `NO_NUMERIC` |

**Acquisition window:** Start aligned to trip boundary — early start **extends** S4 window into pre-motion telemetry desert (sparse POSITION, no QC-trusted speed).

**Stillstand / motion:** Entire pre-overlay minute is `NO_MOTION_EVIDENCE` or absent rows; does not flip to `MOVING_*` until **after** video clock. Early start **does not** mark those seconds as moving, but they **do** count toward coverage denominators and assessability **PARTIAL** reasons.

**Not claimed:** Optimal boundary at ChatGPT-refined reverse frame; no reprojection run.

---

## ChatGPT / external review bundle (copies, baseline bytes unchanged)

| Artifact | Location |
|----------|----------|
| 1136-row second table (JSON) | [`pre-deploy/PRE_DEPLOY_PER_SECOND_REPLAY.json`](./pre-deploy/PRE_DEPLOY_PER_SECOND_REPLAY.json) |
| 1136-row CSV (same data) | `/opt/cursor/artifacts/exp021-ev-ground-truth-chatgpt/PRE_DEPLOY_PER_SECOND_REPLAY.csv` |
| Projection excerpt (full `projection_json` **not** frozen) | `/opt/cursor/artifacts/exp021-ev-ground-truth-chatgpt/PRE_DEPLOY_PROJECTION_EXCERPT.json` |
| Package provenance | [`pre-deploy/PROVENANCE.json`](./pre-deploy/PROVENANCE.json) + artifact copy |
| Manifest | [`pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json`](./pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json) |

### Milestone buckets (from frozen replay)

| UTC bucket | Event |
|------------|--------|
| `2026-10-16T03:36:00Z` | Grid + persisted trip start |
| `2026-10-16T03:36:06Z` | First `positionAvailability=PRESENT` (no speed) |
| `2026-10-16T03:37:41Z` | Owner video overlay clock (not in telemetry table) |
| `2026-10-16T03:37:46Z` | First `motionState=TRANSITION_UNCERTAIN` |
| `2026-10-16T03:38:09Z` | First `TRUSTED` + L3 speed ~5.5 km/h |

---

## Non-effects

`PRODUCTION_MUTATIONS=NONE`, `PROVIDER_CALLS=NONE`, pre-deploy `SHA256SUMS` **unchanged**, Tesla baseline PR scope preserved.
