# Reference Drive #001 — Capture Report (STOP + Evidence Freeze + Telemetry Audit)

**Date:** 2026-09-01  
**Phase:** 3A.3  
**Reference Drive ID:** `DIMO_LTE_R1_REFERENCE_DRIVE_001`  
**Session ID:** `06638509-6213-419b-9df4-3def6c024f41`  
**Vehicle:** VW Tiguan — WOB L 7503 (`19fedd4b-c4e8-4de8-a125-dab293326e7e`)  
**DIMO tokenId:** `192922`  
**Connection profile:** `DIMO_LTE_R1` · **Powertrain:** `ICE_GASOLINE`  
**Manifest:** v1.1.0 · **Deployed SHA:** `3772d992d`  
**Evidence ID:** DI-EV-0016  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`

---

## Executive summary

Reference Drive #001 is a **real physical drive** with **real telemetry capture** that reached `COMPLETED` through the production STOP lifecycle. **Instrument-cluster video was not captured** due to ARM workflow delay; therefore this session is **not** Ground-Truth-aligned.

**Verdicts:**

| Item | Result |
|------|--------|
| `REFERENCE_DRIVE_001_CAPTURE` | **COMPLETED** |
| `REFERENCE_DRIVE_001_GROUND_TRUTH` | **NOT_AVAILABLE** |
| `VIDEO_GROUND_TRUTH_AVAILABLE` | **NO** |
| `HF_HISTORICAL` (real motion) | **ACTIVE — 1333 rows** (vs 3A.2 stationary `SUPPORTED_NO_DATA`) |
| `dualReplicaSerialization` | **INFERENCE** (evidence limitation — see §12) |
| `ARM_WORKFLOW_REMEDIATION_REQUIRED` | **YES** |
| `RD001_METRICS_CORRECTION` | **COMPLETE** (2026-09-01 methodology pass) |
| `RD001_HF_COMPLETENESS_FORENSIC` | **COMPLETE** (aggregation semantics + grid-controlled replay) |
| `HF_AGGREGATION_SEMANTICS` | **CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE** |
| `PHYSICAL_SAMPLE_FINGERPRINT_REMEDIATION_REQUIRED` | **YES** |
| `HF_WATERMARK_REMEDIATION_REQUIRED` | **YES** (blocking before RD002) |

---

## Methodology correction (2026-09-01)

Prior metrics in the first PR #1502 draft contained analysis bugs. **Sealed raw export unchanged** (SHA-256 verified). Corrected analysis re-run from JSONL.

| Issue | Prior (invalid) | Corrected |
|-------|-----------------|-------------|
| Out-of-order detection | Sorted by `providerTimestamp` first → always 0% | Uses acquisition order (`sequenceNumber` → `synqReceivedAt`) |
| Prior `outOfOrderRate=0` | Reported as confirmed | **`INVALIDATED_BY_ANALYSIS_BUG`** — recomputed: **0** in acquisition order (valid after fix) |
| Provider cadence | Included duplicate timestamps (Δt=0) | Unique provider timestamps only; positive Δt |
| Surface mixing | Combined per-field cadence | Separate `HF_HISTORICAL`, `LATEST_LIVE`, `LATEST_SLOW` |
| Latency label | `ingressLatencyMs` as network ingress | `providerSampleAgeAtIngressMs` (+ `httpRequestDurationMs`, `synqResponseBoundaryMs`) |
| Dynamics | `non-null` ⇒ "useful dynamic data" | `OBSERVED_NON_NULL` vs `DYNAMICALLY_INFORMATIVE` etc. |
| CSV surface column | First row surface on combined metrics | One row per `providerField` + `acquisitionSurface` |
| Brake eligibility | `pedal`/`pressure` substring false positive | Brake-specific identity only (`brakeCaptureEligible=false` on Tiguan) |

**Analysis module:** `backend/src/modules/vehicle-intelligence/reference-capture/reference-capture-signal-metrics.ts`
**Reanalyze script:** `backend/scripts/ops/reference-capture-drive-001-reanalyze.ts`

---

## 1. Session identity (frozen)

| Field | Value |
|-------|-------|
| `REFERENCE_DRIVE_ID` | `DIMO_LTE_R1_REFERENCE_DRIVE_001` |
| `sessionId` | `06638509-6213-419b-9df4-3def6c024f41` |
| `orgId` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `SESSION_FINAL_STATUS` | **COMPLETED** |

No second session was created. Reference Drive #002 was **not** started.

---

## 2. Pre-stop freeze (before STOP)

Captured at `2026-09-01T19:34:52.326Z`:

| Metric | Value |
|--------|-------|
| Status | `RECORDING` |
| `cycleCount` | **226** |
| Observation count | **3452** |
| `pendingCycleJobId` | set (delayed next cycle) |
| `activeCycleJobId` | **null** |
| Event watermark | `2026-09-01T19:00:43.252Z` |
| HF watermark | `2026-09-01T19:34:48.597Z` |
| Sequence range | **1 – 3451** |

---

## 3. STOP through production path

**Method:** `ReferenceCaptureSessionService.stopRecording()` via `backend/scripts/ops/reference-capture-drive-001-stop-audit.ts` — no direct DB status mutation.

| Stage | Result |
|-------|--------|
| `STOP_RESULT` | **SUCCESS** |
| Lifecycle path | `RECORDING → STOPPING → COMPLETED` |
| `stoppedAt` | `2026-09-01T19:34:52.364Z` |
| `sessionCompletedAt` | `2026-09-01T19:34:52.360Z` |
| Writer flush | OK (observation count stable post-stop) |
| Pending delayed cycle | Removed (`pendingCycleJobId = null` post-stop) |
| Next cycle scheduled | **No** |

---

## 4. Post-stop zombie proof

Waited **>12s** beyond one normal acquisition cycle (~5s).

| Check | T+12s | T+18s |
|-------|-------|-------|
| `POST_STOP_ZOMBIE_RESULT` | **PASS** | **PASS** |
| Status | `COMPLETED` | `COMPLETED` |
| Observation count | **3452** (stable) | **3452** (stable) |
| `cycleCount` | **226** (stable) | **226** (stable) |
| `pendingCycleJobId` | **null** | **null** |
| `activeCycleJobId` | **null** | **null** |
| Session-specific BullMQ jobs | **0** waiting/active/delayed | **0** |

---

## 5. ARM startup incident (first-class evidence)

| Timestamp | Event |
|-----------|-------|
| `sessionStartedAt` | `2026-09-01T19:00:43.252Z` |
| First successful acquisition | `2026-09-01T19:12:27.239Z` |
| **Acquisition-start gap** | **703.987 s (~11 m 44 s)** |

### Classification

| Question | Answer | Maturity |
|----------|--------|----------|
| Session `RECORDING` during gap? | **YES** | CONFIRMED_FROM_RUNTIME |
| BullMQ job existed? | Initial cycle lost/cancelled; recovery re-enqueued ~19:12:27Z | CONFIRMED_FROM_RUNTIME |
| Observations before recovery? | **1** (metadata/preflight only) | CONFIRMED_FROM_RUNTIME |
| Driving before first capture? | **UNKNOWN** | UNKNOWN_REQUIRES_VALIDATION |
| Root cause | Nest bootstrap timeout on ARM script before first BullMQ cycle completed | CONFIRMED_FROM_RUNTIME |
| Reference Drive workflow reliability defect? | **YES** — owner could not get timely GO signal | INFERENCE |

**Do not hide this because eventual capture succeeded.**

### Remediation requirement (NOT implemented in this task)

`ARM_WORKFLOW_REMEDIATION_REQUIRED = YES`

Proposed future workflow (design only):

1. **Pre-arm health verification** before vehicle departure (fast checks only).
2. **Fast start-only command** after preflight passes — separate from full audit report generation.
3. **Explicit progress/status surface** with sub-minute milestones.
4. **Hard operational timeout** with fail-fast if bootstrap exceeds threshold.
5. **Prominent short `READY_TO_DRIVE` response** — no giant report before GO.
6. **Recovery behavior** that does not silently delay physical experiment; surface gap as blocking incident.

---

## 6. Capture window authority

Do **not** assume useful telemetry begins at `sessionStartedAt`.

| Window | Timestamp | Duration |
|--------|-----------|----------|
| Session lifecycle | `19:00:43.252Z` → `19:34:52.360Z` | **2049.1 s (~34.2 min)** |
| **FIRST_ACTUAL_CAPTURE_AT** | `2026-09-01T19:12:27.239Z` | — |
| **LAST_ACTUAL_CAPTURE_AT** | `2026-09-01T19:34:48.594Z` | — |
| **ACTUAL_CAPTURE_DURATION** | — | **1341.4 s (~22.4 min)** |
| Pre-capture gap (within session) | — | **704.0 s (~11.7 min)** |

---

## 7. Session inventory (final)

| Metric | Count |
|--------|-------|
| Total observations | **3452** |
| Signal observations | **3451** |
| Metadata observations | **1** |
| Unique HF aggregate bucket observations (fingerprinted) | **1333** (`HF_AGGREGATE_BUCKET_OBSERVATION` — not raw physical samples) |
| Mapped observations | **2767** |
| Unmapped observations | **684** |
| Native events | **0** |
| `cycleCount` | **226** |

### Per surface

| Surface | Count |
|---------|-------|
| `LATEST_LIVE` | **1130** |
| `HF_HISTORICAL` | **1333** |
| `LATEST_SLOW` | **988** |
| `NATIVE_EVENT_INCREMENTAL` | **0** |
| Metadata / probe | **1** |

### Capability vs observed

| Set | Count | Notes |
|-----|-------|-------|
| `CAPABILITY_DISCOVERED` (preflight) | **31** fields | All preflight `availableSignals` |
| `ACTUALLY_OBSERVED` | **31** fields | 100% of discovered fields produced rows |
| `ACTUALLY_OBSERVED_WITH_USEFUL_DATA` | **31** fields observed non-null |
| `DYNAMICALLY_INFORMATIVE` | **18** fields (`ANALYSIS_HEURISTIC / PROVISIONAL`) |
| `STATIC_OR_CONTEXTUAL` | **10** fields |
| `NON_NUMERIC_CONTEXT` | **3** fields |

**Do not claim** "all 31 fields produced useful dynamic data" — only 18 showed meaningful variation.

### Coverage windows (do not conflate)

| Window | Start | End | Duration |
|--------|-------|-----|----------|
| `SESSION_LIFECYCLE_WINDOW` | `19:00:43.252Z` | `19:34:52.360Z` | **2049.1 s** |
| `ACQUISITION_EXECUTION_WINDOW` | `19:12:27.239Z` (first request) | `19:34:48.594Z` (last synq) | **1341.4 s** |
| `PROVIDER_DATA_COVERAGE_WINDOW` | `19:01:30.252Z` (earliest provider ts) | `19:14:03.000Z` | **752.7 s** |
| `ROW_PRODUCING_HF_REQUEST_WINDOW` | `19:12:27.500Z` (first HF row-producing request) | `19:14:09.726Z` (last HF row-producing request) | **~102 s** |
| **HF historical backfill before first acquisition** | — | — | **657.0 s (~10m 57s)** |

**Terminology:** `ROW_PRODUCING_HF_REQUEST_WINDOW` end timestamp is **not** the last HF request executed — zero-row HF cycles leave no `SIGNAL_POINT` evidence.

**Major finding:** HF_HISTORICAL retrieved provider timestamps beginning ~11 minutes before first successful acquisition request — pre-recovery driving telemetry may be partially recoverable via HF backfill.

---

## 8. Signal quality metrics (corrected methodology)

### Out-of-order (acquisition order)

| Metric | Value |
|--------|-------|
| Prior `outOfOrderRate=0` | **INVALIDATED_BY_ANALYSIS_BUG** |
| Corrected total `outOfOrderCount` (all field×surface groups) | **0** |
| Interpretation | No provider timestamp regressions observed in `sequenceNumber` order |

### HF_HISTORICAL nonempty aggregate bucket cadence (unique bucket-start timestamps, positive Δt)

| Field | P50 | P95 | P99 | Max gap | Max gap class |
|-------|-----|-----|-----|---------|---------------|
| **speed** | **2 s** | 4 s | 20 s | 151 s | **PROVIDER_DATA_GAP** |
| **RPM** | **2 s** | 9 s | 20 s | 151 s | **PROVIDER_DATA_GAP** |
| **TPS** | **2 s** | 4.7 s | 20 s | 151 s | **PROVIDER_DATA_GAP** |
| **throttle** | **2 s** | 4.7 s | 20 s | 151 s | **PROVIDER_DATA_GAP** |
| **engine load** | **2 s** | 4 s | 20 s | 151 s | **PROVIDER_DATA_GAP** |

**Terminology:** P50 spacing is `DIMO_HISTORICAL_NONEMPTY_BUCKET_P50 ≈ 2s` — **not** LTE_R1 raw physical sample rate.

**151 s max gap (aggregation semantics correction):**

| Field | `timestamp_before_gap` | `timestamp_after_gap` | `gap_seconds` | Classification |
|-------|------------------------|----------------------|---------------|----------------|
| all 5 HF fields | `2026-09-01T19:09:35.252Z` | `2026-09-01T19:12:06.252Z` | **151.0** | **PROVIDER_DATA_GAP** |

Occurs **inside one provider aggregation response** (bulk HF window `19:00:43.252Z → 19:12:27.500Z`). API returned nonempty aggregate buckets on both sides with **no nonempty buckets for ~151 s**. Prior `BOUNDARY_GAP` (ARM recovery) attribution is **invalidated** — `ROOT_CAUSE = UNKNOWN_REQUIRES_VALIDATION`.

### LATEST_LIVE (separate metrics)

| Metric | speed (example) |
|--------|-----------------|
| SynqDrive retrieval cadence P50 (`synqReceivedAt`) | **~5.9 s** |
| Provider timestamp cadence P50 (unique ts) | **~6 s** (stale LATEST provider clocks) |
| `providerSampleAgeAtIngressMs` P50 | Large — reflects sample age, **not** HTTP network latency |

### Latency terminology (corrected)

| Metric | Meaning |
|--------|---------|
| `httpRequestDurationMs` | `requestCompletedAt - requestStartedAt` |
| `synqResponseBoundaryMs` | `synqReceivedAt - requestStartedAt` |
| `providerSampleAgeAtIngressMs` | `synqReceivedAt - providerTimestamp` — sample age / freshness at retrieval |

Full per-field×surface metrics: DI-EV-0018 JSON + CSV.

---

## 9. Priority signal verification vs ARM pre-report

| Signal | Preflight eligible | Useful dynamic data observed | Verdict |
|--------|-------------------|------------------------------|---------|
| speed | YES | YES (506 obs, dynamic range) | **CONFIRMED** |
| RPM | YES | YES (465 obs) | **CONFIRMED** |
| throttle / TPS | YES | YES | **CONFIRMED** |
| engine load | YES | YES | **CONFIRMED** |
| gear/transmission | YES | YES (38 obs — LATEST_SLOW cadence) | **CONFIRMED** |
| brake-related | **BRAKE_DIRECT_SIGNAL_AVAILABLE = NO** | No dedicated hydraulic brake signal on Tiguan LTE_R1 |
| brake proxy | **BRAKE_PROXY_EVIDENCE_AVAILABLE = YES** | Deceleration/longitudinal proxies only — not direct brake hydraulics |
| brake preflight (corrected) | `brakeCaptureEligible=false` | Prior ARM substring bug (`pedal`/`pressure`) fixed |
| ignition | YES | YES | **CONFIRMED** |
| location/heading | YES | YES | **CONFIRMED** |
| temperatures | YES | YES (ECT, oil, intake, exterior) | **CONFIRMED** |
| voltage | YES | YES | **CONFIRMED** |
| yaw/lateral | unavailable | **0 rows** | **CONFIRMED absent** |
| wheel speed | unavailable | **0 rows** | **CONFIRMED absent** |

**Eligibility ≠ useful observed data** — 31/31 observed non-null; **18/31 dynamically informative**.

---

## 10. HF_HISTORICAL audit (corrected)

Phase 3A.2 stationary canary: `HF_HISTORICAL = SUPPORTED_NO_DATA`.  
Reference Drive #001 real motion: **`HF_HISTORICAL = ACTIVE`**.

| Metric | Value |
|--------|-------|
| HF rows | **1333** |
| HF share of signal obs | **38.6%** |

### HF fields producing rows

| Provider field | HF rows |
|----------------|---------|
| `obdEngineLoad` | 280 |
| `speed` | 280 |
| `powertrainCombustionEngineTPS` | 269 |
| `obdThrottlePosition` | 265 |
| `powertrainCombustionEngineSpeed` | 239 |

### HF cadence (nonempty 1s AVG aggregate buckets)

| Field | P50 Δt | P95 Δt | P99 Δt | Max gap |
|-------|--------|--------|--------|---------|
| speed (HF) | **2 s** | 4 s | 20 s | 151 s |
| obdEngineLoad (HF) | **2 s** | 4 s | 20 s | 151 s |
| RPM (HF) | **2 s** | 4 s | 20 s | 151 s |

### HF verdict

| Claim | Maturity |
|-------|----------|
| HF is **active during real motion** on LTE_R1 Tiguan | **CONFIRMED_FROM_VEHICLE_OBSERVATION** |
| HF surface is `DIMO_AGGREGATED_HISTORICAL_1S` (`agg: AVG`) | **CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE** |
| Requested **1 s** bucket interval | **CONFIRMED** — nonempty bucket P50 spacing ≈ **2 s** |
| `DIMO_HISTORICAL_NONEMPTY_BUCKET_P50` | **≈ 2 s** for motion-critical fields |
| `DEVICE_RAW_SAMPLE_CADENCE` | **UNKNOWN** — not independently proven |
| HF windows **overlap** across cycles | **INFERENCE** |
| HF per-field bucket counts differ slightly | **CONFIRMED** (239–280 buckets per field) |
| Dynamics labels (18/10/3) | **ANALYSIS_HEURISTIC / PROVISIONAL** |

**This is one of the most important results of Reference Drive #001.**

---

## 10a. HF aggregation semantics authority (Phase 3A.3 correction)

**Architecture:** `architecture/DIMO_LTE_R1_RD001_HF_AGGREGATION_SEMANTICS_2026-09-01.md`

### DIMO_HISTORICAL_QUERY_SEMANTICS

| Item | Value |
|------|-------|
| `HF_AGGREGATION_SEMANTICS` | **CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE** |
| Query | `signals(tokenId, from, to, interval: "1s")` |
| Selection | `<field>(agg: AVG)` via `buildHistoricalSelectionForField()` |
| `AGGREGATOR_USED` | **AVG** |
| Observation type | **`HF_AGGREGATE_BUCKET_OBSERVATION`** |
| Surface label | **`DIMO_AGGREGATED_HISTORICAL_1S`** |

### DIMO_AGGREGATION_BUCKET_ORIGIN

**Verified public upstream:** `DIMO-Network/telemetry-api` @ `98d88534857fec95a507a61331d5e357b86cfcc6`

| File | Implementation |
|------|----------------|
| `internal/service/ch/ch.go` | `GetAggregatedSignals()` — aggregated signals; `timestamp` = start of interval |
| `internal/service/ch/queries.go` | `selectInterval()` / `getAggQuery()` — `origin = aggArgs.FromTS` |

**Bucket semantics:** **QUERY-FROM-ANCHORED AGGREGATION BUCKETS** (anchored to query `from`, not independent epoch alignment).

`DIMO-Network/dq` may proxy production queries; not used as sole canonical citation without independent commit verification.

**Not** raw LTE_R1 physical source samples.

### Semantic debt: `physicalSampleFingerprint`

On `HF_HISTORICAL`, persisted `physicalSampleFingerprint` fingerprints `(field, bucketTimestamp, AVG)` — an **aggregate bucket fingerprint**, not proven raw physical sample identity. **`PHYSICAL_SAMPLE_FINGERPRINT_REMEDIATION_REQUIRED = YES`**.

### Invalidated prior physical-sample claims

| Prior claim | Status |
|-------------|--------|
| 225 post-hoc-only = 225 new physical samples | **INVALIDATED_BY_AGGREGATION_GRID_MISMATCH** |
| Chunked 300s post-hoc compare proves watermark skip | **INVALIDATED** — different bucket grids |
| Effective physical HF rate ~0.5 Hz | **INVALIDATED** — only nonempty bucket cadence measured |
| 151s gap = ARM `BOUNDARY_GAP` | **INVALIDATED** — gap inside single aggregation response |

---

## 10b. HF completeness / late-arrival forensic audit (grid-controlled)

**Exact-window replay artifact:** `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-exact-window-replay.json`  
**Script:** `backend/scripts/ops/reference-capture-drive-001-hf-exact-window-replay.ts`  
**Invalidated chunked experiment:** `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-posthoc-forensic.json` (retained for audit trail only)

### HF watermark (`CONFIRMED_FROM_CODE`)

| Parameter | Behavior |
|-----------|----------|
| `from` | `hfWatermarkAt - 2s` OR `sessionStartedAt` |
| `to` | request wall-clock `now` |
| `hfWatermarkAt` after request | **always `now`**, even when `rows.length === 0` |

`HF_LATE_ARRIVAL_WATERMARK_RISK = CONFIRMED_FROM_CODE_RISK`  
`HF_LATE_ARRIVAL_RUNTIME_SKIP = CONFIRMED_FROM_RUNTIME` (39 aggregate buckets classified `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK`)

### Exact-window aggregate bucket replay (`EXACT_WINDOW_REPLAY_NORMALIZED = YES`)

Re-queried all **13** original row-producing requests using **exact** `hfWindowFrom`/`hfWindowTo` from `provenanceJson`. Bucket timestamps canonicalized via `new Date(ts).toISOString()` before comparison (fixes `…25.500Z` ≡ `…25.5Z` identity bug).

**Counting model:** `AGGREGATE_BUCKET_OBSERVATIONS_ACROSS_REQUEST_WINDOWS` — not globally unique physical samples.

#### Prior unnormalized vs normalized totals

| Metric | Pre-normalization | Normalized |
|--------|-------------------|------------|
| Original | 1333 | 1333 |
| Replay | 1455 | 1455 |
| Unchanged | 1318 | **1333** |
| New | 137 | **122** |
| Removed | 15 | **0** |
| Changed value | 0 | 0 |

#### Per-field normalized totals

| HF field | Original | Replay | Unchanged | New | Removed | Changed |
|----------|----------|--------|-----------|-----|---------|---------|
| speed | 280 | 305 | 280 | 25 | 0 | 0 |
| obdEngineLoad | 280 | 305 | 280 | 25 | 0 | 0 |
| powertrainCombustionEngineSpeed | 239 | 261 | 239 | 22 | 0 | 0 |
| powertrainCombustionEngineTPS | 269 | 294 | 269 | 25 | 0 | 0 |
| obdThrottlePosition | 265 | 290 | 265 | 25 | 0 | 0 |
| **Total** | **1333** | **1455** | **1333** | **122** | **0** | **0** |

#### Problematic window (`19:12:25.500Z` → `19:12:34.201Z`)

| Metric | Pre-normalization | Normalized |
|--------|-------------------|------------|
| Unchanged | 0 | **15** |
| Removed | 15 | **0** |
| New | 25 | **10** |

Prior `removed=15` was partly caused by RFC3339 timestamp serialization mismatch, not provider data loss.

`HF_LATE_ARRIVAL_AGGREGATE_BUCKET = CONFIRMED_FROM_RUNTIME` — exact same query windows now return **122 aggregate buckets** not present in original sealed responses.

`RD001_HF_COMPLETENESS = INCOMPLETE` (relative to normalized exact-window replay).

#### Watermark causality (NEW buckets)

| Classification | Total |
|----------------|-------|
| `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK` | **39** |
| `PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW` | 30 |
| `POTENTIALLY_REQUERYABLE` | 53 |

Late-available DIMO aggregate source intervals were permanently excluded from subsequent Reference Capture HF windows by the 2-second wall-clock watermark overlap.

#### Provider availability lag lower bound (NEW buckets)

Not network latency. Basis: `requestCompletedAt - bucketEnd` (conservative fallback: `requestStartedAt - bucketEnd`).

| min | P50 | P95 | max |
|-----|-----|-----|-----|
| −0.084 s | 1.489 s | 3.248 s | 4.035 s |

Empirical signal that 2s overlap may be insufficient — design review only; do not tune production overlap from RD001 alone.

### Upstream data stall (`DIMO_LTE_R1_RD001_UPSTREAM_DATA_STALL`)

| Evidence | Result |
|----------|--------|
| Post-hoc historical `signals()` from ~19:15 onward | **0 rows** |
| LATEST provider timestamps | Frozen ~`19:14:03Z` |
| SynqDrive polling | Continued to ~`19:34:48Z` |
| `RD001_UPSTREAM_DATA_STALL_AFTER_1914` | **CONFIRMED_FROM_RUNTIME** |
| `UPSTREAM_DATA_STALL_ROOT_CAUSE` | **UNKNOWN_REQUIRES_VALIDATION** |

### Zero-result HF request observability

`ZERO_RESULT_HF_REQUEST_HISTORY = NOT_PERSISTED / UNKNOWN` — only row-producing HF requests leave `SIGNAL_POINT` evidence.

### Cadence hierarchy

| Layer | RD001 |
|-------|-------|
| `DEVICE_RAW_SAMPLE_CADENCE` | **UNKNOWN** |
| `DIMO_INGESTED_SOURCE_CADENCE` | **UNKNOWN** |
| `DIMO_AGGREGATE_BUCKET_CADENCE` | Nonempty bucket P50 ≈ **2 s** |
| `SYNQDRIVE_RETRIEVAL_CADENCE` | Observed per surface |

### Future aggregator experiment (not implemented)

For physics-sensitive reconstruction, evaluate whether **AVG** is correct vs **FIRST/LAST/MIN/MAX** — separate future experiment.

---

## 11. Native events

**Count: 0** — DIMO returned no native events for the captured session/window.

Do **not** infer no harsh physical maneuver occurred. Do **not** infer provider event detector quality from one zero-event drive.

---

## 12. Dual-replica serialization

ARM report noted two backend replicas in nginx upstream. Phase 3A.2 canary did not exercise true cross-replica contention.

| Evidence | Finding |
|----------|---------|
| `cycleCount` | Monotonic to **226**; stable post-stop |
| `activeCycleJobId` | **null** at cycle rest points |
| Overlapping acquisition windows | Not detected in provenance sample |
| Worker/process identity | **Not logged** |
| Unique cycle job IDs in provenance | **0** (provenance field not populated on all rows) |

**Verdict:** `INFERENCE` — no evidence of duplicate concurrent physical cycles, but **true cross-replica operation not independently proven**.

**Missing evidence for `CONFIRMED_FROM_RUNTIME`:** `workerId`, `processId/replicaId`, `cycleJobId`, cycle execution start/end timestamps.

---

## 13. Ground Truth status

See dedicated index: `docs/audits/dimo-lte-r1-reference-drive-001-ground-truth-evidence-index-2026-09-01.md` (DI-EV-0019).

```
VIDEO_GROUND_TRUTH_AVAILABLE = NO
GROUND_TRUTH_VIDEO_STATUS = NOT_AVAILABLE
GROUND_TRUTH_ALIGNMENT_NOT_POSSIBLE_FOR_DRIVE_001 = YES
VIDEO_NOT_CAPTURED = YES
```

No fake MAE/RMSE/onset metrics were calculated.

---

## 14. Validation capability matrix

| Question | Can #001 answer? | Evidence maturity | Reason |
|----------|------------------|-------------------|--------|
| Provider signal availability | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | 31/31 fields observed with data |
| Real-motion HF availability | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | 1333 HF rows vs 0 in 3A.2 |
| Observed cadence | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | Nonempty 1s aggregate-bucket spacing P50 ≈ 2s; LATEST ~5s cycle; `DEVICE_RAW_SAMPLE_CADENCE = UNKNOWN` |
| Dropouts / gaps | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | Max gap 151s — **PROVIDER_DATA_GAP** inside single aggregation response; ARM attribution **INVALIDATED**; root cause **UNKNOWN_REQUIRES_VALIDATION** |
| Jitter | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | Per-field stddev in metrics JSON |
| Duplicates | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | Multi-surface overlap ~56% dup ts rate |
| Out-of-order | **YES** (recomputed; prior 0% invalidated) | CONFIRMED_FROM_VEHICLE_OBSERVATION | 0 in acquisition order after methodology fix |
| Ingress latency (LATEST) | **PARTIAL** | INFERENCE | Provider timestamps stale — misleading |
| Native-event availability | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | Zero events returned |
| Broad acquisition behavior | **YES** | CONFIRMED_FROM_RUNTIME | 3452 obs, 226 cycles, broad capture |
| BullMQ lifecycle | **YES** | CONFIRMED_FROM_RUNTIME | Clean STOP + zombie-free |
| Dual-replica serialization | **PARTIAL** | INFERENCE | No worker identity; no overlap detected |
| Speed accuracy vs tachometer | **NO** | REJECTED | No video Ground Truth |
| Dynamic onset latency vs tachometer | **NO** | REJECTED | No video Ground Truth |
| Driver maneuver Ground Truth | **NO** | REJECTED | No video Ground Truth |

---

## 15. Raw evidence preservation

| Field | Value |
|-------|-------|
| `RAW_EVIDENCE_STATE` | **SEALED_EXPORT_AVAILABLE** |
| `PURGE_BLOCKED_REFERENCE_EVIDENCE` | **YES** |
| Export path | `/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-001/` |
| `observations-export.jsonl` rows | **3452** |
| File size | **3,160,077 bytes** |
| SHA-256 | `f8e3097e28899d7a2cbdd269b266c16e5cf3eed69be810aba4e1247ec9a65bbd` |
| Exported at | `2026-09-01T19:35:10.833Z` |

Also includes: `session-summary.json`, `signal-quality-metrics.json`, `pre-stop-snapshot.json`, `stop-result.json` on VPS.

**Not committed to Git** (size + TTL protection policy).

---

## 16. Repository artifacts

| File | Evidence ID |
|------|-------------|
| This report | DI-EV-0016 |
| `docs/audits/data/dimo-lte-r1-reference-drive-001-session-summary.json` | DI-EV-0017 |
| `docs/audits/data/dimo-lte-r1-reference-drive-001-signal-quality-metrics.json` | DI-EV-0018 |
| `docs/audits/data/dimo-lte-r1-reference-drive-001-signal-quality-metrics.csv` | DI-EV-0018 |
| `docs/audits/dimo-lte-r1-reference-drive-001-ground-truth-evidence-index-2026-09-01.md` | DI-EV-0019 |
| `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-exact-window-replay.json` | DI-EV-0016 (exact-window experiment) |
| `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-posthoc-forensic.json` | DI-EV-0016 (invalidated chunked experiment) |
| `architecture/DIMO_LTE_R1_RD001_HF_AGGREGATION_SEMANTICS_2026-09-01.md` | architecture record |
| `backend/scripts/ops/reference-capture-drive-001-stop-audit.ts` | ops reproducibility |
| `backend/scripts/ops/reference-capture-drive-001-reanalyze.ts` | ops reproducibility |
| `backend/scripts/ops/reference-capture-drive-001-hf-exact-window-replay.ts` | grid-controlled replay |
| `backend/scripts/ops/reference-capture-drive-001-hf-posthoc-forensic.ts` | invalidated chunked post-hoc query |

---

## 17. Phase 3A status

| Item | Status |
|------|--------|
| Phase 3A overall | **IN_PROGRESS** |
| Reference Drive #001 capture | **COMPLETED** |
| Reference Drive #001 telemetry analysis | **AVAILABLE** (methodology-corrected) |
| `RD001_METRICS_CORRECTION` | **COMPLETE** |
| `RD001_AGGREGATION_SEMANTICS_CORRECTION` | **COMPLETE** |
| `RD001_HF_COMPLETENESS_FORENSIC` | **COMPLETE** (normalized grid-controlled replay + watermark causality) |
| Reference Drive #001 Ground Truth | **NOT_AVAILABLE** |
| Ground Truth synchronization | **NOT DONE** |
| Next engineering phase | **Phase 3A.3.1 FAST PRE-ARM / GO workflow** |
| Also required before RD002 | **HF watermark / late-arrival remediation** |
| Next drive for video GT | **`DIMO_LTE_R1_REFERENCE_DRIVE_002`** (not started) |

---

## 18. Open questions

1. **Phase 3A.3.1 ARM workflow** — 704 s gap unacceptable; FAST GO via production API required before RD002.
2. **HF aggregation semantics** — `signals(agg:AVG)` returns 1s buckets, not raw physical samples; 225 chunked post-hoc claim invalidated.
3. **HF watermark remediation** — wall-clock watermark confirmed; normalized exact-window replay found 122 late aggregate buckets with 39 `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK`; remediation blocking before RD002.
4. **HF 1s bucket interval vs ~2s nonempty bucket P50** — do not infer raw device cadence (`DEVICE_RAW_SAMPLE_CADENCE = UNKNOWN`).
5. **Dual-replica proof** — add worker identity logging before claiming `CONFIRMED_FROM_RUNTIME` serialization.
6. **Native events zero** — vehicle limitation vs capture window vs query surface — investigate on #002 with known maneuvers + video.

---

**End of report.**

```
REFERENCE_DRIVE_001_CAPTURE = COMPLETED
REFERENCE_DRIVE_001_GROUND_TRUTH = NOT_AVAILABLE
REFERENCE_DRIVE_002_REQUIRED_FOR_VIDEO_GROUND_TRUTH = YES
```
