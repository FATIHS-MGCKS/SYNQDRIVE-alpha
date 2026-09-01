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
| `RD001_HF_COMPLETENESS_FORENSIC` | **COMPLETE** (2026-09-01 Phase 3A.3 HF audit) |
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
| Unique physical samples (fingerprinted) | **1333** (HF_HISTORICAL only — 38.6% row coverage) |
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
| `DYNAMICALLY_INFORMATIVE` | **18** fields |
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

### HF_HISTORICAL provider cadence (unique timestamps, positive Δt)

| Field | P50 | P95 | P99 | Max gap | Max gap class |
|-------|-----|-----|-----|---------|---------------|
| **speed** | **2 s** | 4 s | 20 s | 151 s | **BOUNDARY_GAP** |
| **RPM** | **2 s** | 9 s | 20 s | 151 s | **BOUNDARY_GAP** |
| **TPS** | **2 s** | 4.7 s | 20 s | 151 s | **BOUNDARY_GAP** |
| **throttle** | **2 s** | 4.7 s | 20 s | 151 s | **BOUNDARY_GAP** |
| **engine load** | **2 s** | 4 s | 20 s | 151 s | **BOUNDARY_GAP** |

**151 s max gap (forensic reclassification):**

| Field | `timestamp_before_gap` | `timestamp_after_gap` | `gap_seconds` | Classification |
|-------|------------------------|----------------------|---------------|----------------|
| all 5 HF fields | `2026-09-01T19:09:35.252Z` | `2026-09-01T19:12:06.252Z` | **151.0** | **BOUNDARY_GAP** |

Occurs **inside one provider response** (bulk HF window `19:00:43.252Z → 19:12:27.500Z`), spanning the ARM startup/recovery boundary — **not** continuous-motion provider dropout. Prior label `PROVIDER_GAP` was contradictory and is **invalidated**.

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

### HF cadence (provider timestamp, HF rows only)

| Field | P50 Δt | P95 Δt | P99 Δt | Max gap |
|-------|--------|--------|--------|---------|
| speed (HF) | **2 s** | 4 s | 20 s | 151 s |
| obdEngineLoad (HF) | **2 s** | 4 s | 20 s | 151 s |
| RPM (HF) | **2 s** | 4 s | 20 s | 151 s |

### HF verdict

| Claim | Maturity |
|-------|----------|
| HF is **active during real motion** on LTE_R1 Tiguan | **CONFIRMED_FROM_VEHICLE_OBSERVATION** |
| Requested **1 s** HF interval | **NOT observed** — effective P50 ≈ **2 s** |
| HF windows **overlap** across cycles | **INFERENCE** — contributes to cross-surface duplicate provider timestamps |
| HF per-field cadence differs slightly | **CONFIRMED** (239–280 rows per field over same window) |
| HF duplicate provider timestamps within HF-only rows | **0** per field |
| Effective useful HF sample rate | **~0.5 Hz (P50 2 s)** for motion-critical fields |

**This is one of the most important results of Reference Drive #001.**

---

## 10a. HF historical completeness / late-arrival forensic audit (Phase 3A.3)

**Evidence artifact:** `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-posthoc-forensic.json`
**Script:** `backend/scripts/ops/reference-capture-drive-001-hf-posthoc-forensic.ts`
**Sealed raw export:** unchanged (`f8e3097e…`)

### Critical observation

Capture continued until `~19:34:48Z`, but HF provider-data coverage ends at `~19:14:02Z` and the last **row-producing** HF request was `~19:14:09Z`. Meanwhile `hfWatermarkAt` advanced to `19:34:48.597Z`.

### HF watermark code behavior (`CONFIRMED_FROM_CODE`)

`captureHistoricalSurface()` in `reference-capture-acquisition.service.ts`:

| Parameter | Behavior |
|-----------|----------|
| `from` | `hfWatermarkAt - 2s` OR `sessionStartedAt` |
| `to` | request wall-clock `now` |
| `hfWatermarkAt` after request | **always `now`**, even when `rows.length === 0` |

**Mode:** **A — watermark follows request wall-clock time**, not max observed provider timestamp.
**Risk hypothesis:** `HF_LATE_ARRIVAL_WATERMARK_SKIP` — delayed provider samples older than `watermark - overlap` may become unreachable.

### Post-hoc full-window provider query (`HF_POSTHOC_QUERY_EXECUTED = YES`)

Read-only DIMO `signals()` query for `2026-09-01T19:00:43Z → 19:34:52Z` (7×300s chunks, 5 HF fields, `interval: "1s"`).

| HF field | Sealed | Post-hoc | Intersection | Sealed-only | Post-hoc-only | Match rate |
|----------|--------|----------|--------------|-------------|---------------|------------|
| speed | 280 | 293 | 247 | 33 | 46 | 88.2% |
| obdEngineLoad | 280 | 293 | 247 | 33 | 46 | 88.2% |
| powertrainCombustionEngineSpeed | 239 | 251 | 210 | 29 | 41 | 87.9% |
| powertrainCombustionEngineTPS | 269 | 282 | 236 | 33 | 46 | 87.7% |
| obdThrottlePosition | 265 | 278 | 232 | 33 | 46 | 87.5% |
| **Total** | **1333** | **1397** | **1172** | **161** | **225** | — |

`POSTHOC_ONLY_TIME_RANGE`: `2026-09-01T19:12:24.252Z` → `2026-09-01T19:14:02.252Z` (mostly active HF window; **0** post-hoc rows for `19:15:43Z → 19:34:52Z`).

### Verdict matrix

| Question | Result | Maturity |
|----------|--------|----------|
| `HF_LATE_ARRIVAL_WATERMARK_SKIP` (active HF window 19:12–19:14) | **CONFIRMED_FROM_RUNTIME** — 225 post-hoc-only physical samples now exist vs sealed | CONFIRMED_FROM_RUNTIME |
| `HF_LATE_ARRIVAL_WATERMARK_SKIP` (why no HF after 19:14 while capture continued) | **NOT_CONFIRMED_FROM_RD001** — post-hoc `signals()` returns **0 rows** for `19:15:43Z → 19:34:52Z`; LATEST provider timestamps frozen at `~19:14:03Z` while synq polling continued | CONFIRMED_FROM_RUNTIME |
| Code-level watermark risk | **CONFIRMED_FROM_CODE_RISK** | CONFIRMED_FROM_CODE |
| `RD001_HF_COMPLETENESS` | **INCOMPLETE** relative to current provider full-window query | CONFIRMED_FROM_RUNTIME |
| `HF_WATERMARK_REMEDIATION_REQUIRED` | **YES** — blocking before RD002 | PROPOSAL |

### Zero-result HF request observability

`ZERO_RESULT_HF_REQUEST_HISTORY = NOT_PERSISTED / UNKNOWN`

Only **13** row-producing HF `requestStartedAt` values exist in sealed export. Cannot prove whether zero-row HF queries executed every cycle after `19:14:09Z` from observation rows alone.

**Proposed per-cycle metrics (not implemented):** `hfRequestExecuted`, `hfRowsReturned`, `hfProviderMaxTimestamp`, `hfWatermarkBefore`, `hfWatermarkAfter`, `hfQueryWindowFrom`, `hfQueryWindowTo`, `workerId`, `cycleJobId`.

### Watermark design analysis (recommendation only — no implementation)

| Option | Summary | RD001 relevance |
|--------|---------|-----------------|
| **A** `watermark = request now` | Current behavior | Confirmed; advanced to 19:34 without HF rows |
| **B** `watermark = max provider timestamp observed` | Safer for late arrival | Would have stopped at ~19:14:02 |
| **C** `min(now - lag, maxProviderTs)` | Adds provider safety lag | Good compromise if lag calibrated |
| **D** Sliding reconciliation window | Re-query previous N minutes + fingerprint dedupe | Highest completeness; higher DIMO cost |
| **E** Two-watermark model | Separate `requestWatermark` / `providerDataWatermark` | Best observability; moderate complexity |

**Recommendation:** Implement **E** (two-watermark) with **D** (short reconciliation overlap, e.g. 5–10 min) before RD002. Do not ship RD002 on current single wall-clock watermark.

### Dynamics classification maturity

Cross-surface duplicate retrieval affects observation counts. Labels `DYNAMICALLY_INFORMATIVE` / `STATIC_OR_CONTEXTUAL` / `NON_NUMERIC_CONTEXT` are **`ANALYSIS_HEURISTIC / PROVISIONAL`** until model-feature suitability is separately validated.

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
| Observed cadence | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | HF ~2s P50; LATEST ~5s cycle |
| Dropouts / gaps | **YES** | CONFIRMED_FROM_VEHICLE_OBSERVATION | Max gap 151s (ARM gap artifact) |
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
| `docs/audits/data/dimo-lte-r1-reference-drive-001-hf-posthoc-forensic.json` | DI-EV-0016 (HF experiment) |
| `backend/scripts/ops/reference-capture-drive-001-stop-audit.ts` | ops reproducibility |
| `backend/scripts/ops/reference-capture-drive-001-reanalyze.ts` | ops reproducibility |
| `backend/scripts/ops/reference-capture-drive-001-hf-posthoc-forensic.ts` | HF post-hoc forensic query |

---

## 17. Phase 3A status

| Item | Status |
|------|--------|
| Phase 3A overall | **IN_PROGRESS** |
| Reference Drive #001 capture | **COMPLETED** |
| Reference Drive #001 telemetry analysis | **AVAILABLE** (methodology-corrected) |
| `RD001_METRICS_CORRECTION` | **COMPLETE** |
| `RD001_HF_COMPLETENESS_FORENSIC` | **COMPLETE** |
| Reference Drive #001 Ground Truth | **NOT_AVAILABLE** |
| Ground Truth synchronization | **NOT DONE** |
| Next engineering phase | **Phase 3A.3.1 FAST PRE-ARM / GO workflow** |
| Also required before RD002 | **HF watermark / late-arrival remediation** |
| Next drive for video GT | **`DIMO_LTE_R1_REFERENCE_DRIVE_002`** (not started) |

---

## 18. Open questions

1. **Phase 3A.3.1 ARM workflow** — 704 s gap unacceptable; FAST GO via production API required before RD002.
2. **HF watermark remediation** — wall-clock watermark confirmed; 225 post-hoc-only samples in active window; remediation blocking before RD002.
3. **HF 1s request vs ~2s observed** — planner/request vs provider delivery mismatch; quantify on #002 with longer HF window.
3. **Dual-replica proof** — add worker identity logging before claiming `CONFIRMED_FROM_RUNTIME` serialization.
4. **Native events zero** — vehicle limitation vs capture window vs query surface — investigate on #002 with known maneuvers + video.

---

**End of report.**

```
REFERENCE_DRIVE_001_CAPTURE = COMPLETED
REFERENCE_DRIVE_001_GROUND_TRUTH = NOT_AVAILABLE
REFERENCE_DRIVE_002_REQUIRED_FOR_VIDEO_GROUND_TRUTH = YES
```
