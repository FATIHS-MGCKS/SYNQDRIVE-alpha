# Reference Drive #002 — Capture Report (STOP + Motion HF Canary + Evidence Freeze)

**Date:** 2026-09-02  
**Phase:** 3A.3 / 3A.3.2 motion validation  
**Reference Drive ID:** `DIMO_LTE_R1_REFERENCE_DRIVE_002`  
**Session ID:** `e095d273-eb03-4bc9-aa2b-d0d709abd9bc`  
**Vehicle:** Mercedes-Benz C 63 AMG — KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)  
**DIMO tokenId:** `187336`  
**Connection profile:** `DIMO_LTE_R1` · **Powertrain:** `ICE_GASOLINE`  
**Manifest:** v1.1.0 · **Deployed SHA:** `f00a493949d8134f82a3e83d6c80ea8f7bb19699`  
**Evidence ID:** DI-EV-0023  
**Governance:** `docs/audits/driving-intelligence-evidence-governance-2026-09-01.md`

---

## Executive summary

Reference Drive #002 is the **authorized motion HF production canary** on **KS MX 2024** (Mercedes C 63 AMG). The session reached `COMPLETED` through the production STOP lifecycle with **355 HF_HISTORICAL aggregate-bucket rows**, **AGGREGATE_BUCKET_V2** identity, and **zero duplicate physical fingerprints** in-session.

**Video Ground Truth was not planned for this drive by protocol** — RD003 is reserved for the first video-aligned capture. This is **not** negative evidence like RD001.

| Item | Result |
|------|--------|
| `REFERENCE_DRIVE_002_CAPTURE` | **COMPLETED** |
| `MOTION_CANARY_COMPLETED` | **YES** |
| `MOTION_CANARY_VEHICLE_SUBSTITUTION` | **ACCEPTED** (C63 on DIMO_LTE_R1 path — not Tiguan-specific) |
| `PHASE_3A3_2_PRODUCTION_VALIDATED` | **YES** |
| `HF_HISTORICAL` (real motion) | **ACTIVE — 355 rows** |
| `hfPhysicalIdentityVersion` | **AGGREGATE_BUCKET_V2** |
| `HF_DUPLICATE_FINGERPRINTS` | **0** (355/355 unique) |
| `FAST_GO_WORKFLOW` | **PASS** (READY_TO_DRIVE **1949 ms**) |
| `VIDEO_GROUND_TRUTH` | **NOT_PLANNED_BY_PROTOCOL** |
| `READY_FOR_RD003` | **YES** |

---

## 1. Session identity (frozen)

| Field | Value |
|-------|-------|
| `REFERENCE_DRIVE_ID` | `DIMO_LTE_R1_REFERENCE_DRIVE_002` |
| `sessionId` | `e095d273-eb03-4bc9-aa2b-d0d709abd9bc` |
| `orgId` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `SESSION_FINAL_STATUS` | **COMPLETED** |

RD001 sealed evidence was **not modified**.

---

## 2. Operator workflow (PRE-ARM → FAST GO → drive → STOP)

| Stage | Result |
|-------|--------|
| PRE-ARM | **PASS** — `PREARM_READY=YES`, **2126 ms**, `availableSignalsCount=29` |
| FAST GO | **PASS** — `READY_TO_DRIVE=YES` |
| `GO_TO_RECORDING_MS` | **83** |
| `GO_TO_FIRST_CYCLE_MS` | **1948** |
| `GO_TO_READY_TO_DRIVE_MS` | **1949** |
| First cycle | **29 SIGNAL_POINT** — runner continuity proven |
| STOP | Production path — `RECORDING → STOPPING → COMPLETED` |

**Contrast with RD001:** No ~704 s ARM acquisition-start gap. Phase 3A.3.1 FAST PRE-ARM/GO remediation validated under real motion.

---

## 3. Capture window authority

| Window | Timestamp | Duration |
|--------|-----------|----------|
| Session lifecycle | `12:38:31.473Z` → `13:13:05.385Z` | **2073.9 s (~34.6 min)** |
| First Synq ingress (`ACQUISITION_EXECUTION`) | `12:38:32.403Z` | **0.93 s after session start** |
| Last Synq ingress | `13:13:01.474Z` | — |
| HF first Synq ingress | `12:39:27.006Z` | ~55 s after session start (HF cycle warmup) |
| HF last provider bucket | `13:06:56.818Z` | — |
| Provider data coverage (all surfaces) | `12:37:44Z` → `13:07:24Z` | 1780 s |

**Note:** Earliest provider timestamps can predate session start when HF/LATEST rows include historical backfill within the query window (`historicalBackfillBeforeFirstAcquisitionSeconds = 48.1`). **Ingress-ordered acquisition start gap = 0.93 s** — authoritative for operator workflow.

---

## 4. Session inventory (final)

| Metric | Count |
|--------|-------|
| Total observations | **3527** |
| Signal observations | **3526** |
| Metadata observations | **1** |
| Native events | **0** |
| `cycleCount` | **351** |

### Per surface

| Surface | Count |
|---------|-------|
| `LATEST_LIVE` | **1755** |
| `LATEST_SLOW` | **1416** |
| `HF_HISTORICAL` | **355** |
| `NATIVE_EVENT_INCREMENTAL` | **0** |

### HF per field (aggregate buckets)

| Field | HF rows |
|-------|---------|
| `speed` | 71 |
| `obdEngineLoad` | 71 |
| `obdThrottlePosition` | 71 |
| `powertrainCombustionEngineTPS` | 71 |
| `powertrainCombustionEngineSpeed` | 71 |

### Capability vs observed

| Set | Count | Notes |
|-----|-------|-------|
| PRE-ARM `availableSignals` | **29** | Matches Aug 2026 C63 inventory audit |
| `ACTUALLY_OBSERVED` | **29** fields | 100% of discovered fields produced rows |
| `DYNAMICALLY_INFORMATIVE` | **18** fields | `ANALYSIS_HEURISTIC / PROVISIONAL` |

---

## 5. Phase 3A.3.2 HF watermark / identity invariants (motion proof)

| Invariant | Result | Maturity |
|-----------|--------|----------|
| `hfPhysicalIdentityVersion` | `AGGREGATE_BUCKET_V2` | CONFIRMED_FROM_RUNTIME |
| Session duplicate `physical_sample_fingerprint` | **0** (355 HF rows, 355 unique) | CONFIRMED_FROM_RUNTIME |
| `hfWatermarkByField` (all 5 HF fields) | `2026-09-02T13:06:56.818Z` | CONFIRMED_FROM_RUNTIME |
| `hfQueryCoverageByField` (all 5 HF fields) | `2026-09-02T13:13:01.481Z` | CONFIRMED_FROM_RUNTIME |
| Watermark ≤ coverage semantics | **PASS** (coverage advances past watermark at STOP) | CONFIRMED_FROM_CODE + CONFIRMED_FROM_RUNTIME |
| Post-stop runner artifacts | `runnerJobId=null`, `pendingCycleJobId=null` | CONFIRMED_FROM_RUNTIME |

**Interpretation:** The ~6.1 min gap between final HF data watermark and query coverage at STOP is **expected** — watermark tracks persisted aggregate data boundary; coverage tracks the query window upper bound including in-flight cycle completion. This is the intended 3A.3.2 separation (DI-EV-0021).

---

## 6. HF cadence (motion — provisional)

HF rows are **DIMO 1s AVG aggregate buckets**, not raw physical samples. Observed bucket spacing is **irregular** under motion (provider/upstream cadence dominates).

| Field | HF rows | Δt p50 (s) | Δt max (s) | Out-of-order (acquisition order) |
|-------|---------|------------|------------|-----------------------------------|
| `speed` | 71 | 13.5 | 249.6 | 0 |
| `obdEngineLoad` | 71 | 13.5 | 249.6 | 0 |
| `powertrainCombustionEngineSpeed` | 71 | 13.5 | 249.6 | 0 |

Full per-field/surface metrics: `docs/audits/data/dimo-lte-r1-reference-drive-002-signal-quality-metrics.json` (DI-EV-0025).

---

## 7. C63 differential vs Aug 2026 audit vs RD001 Tiguan

| Dimension | Aug 2026 C63 audit | RD002 (this drive) | RD001 Tiguan |
|-----------|-------------------|-------------------|--------------|
| `availableSignals` | 29 | 29 observed | 31 discovered |
| Transmission gear signals | absent | absent (expected) | present |
| HF_HISTORICAL rows | N/A (parked audit) | **355** | **1333** |
| Acquisition-start gap | N/A | **0.93 s** | **704 s** (ARM defect) |
| FAST GO | N/A | **1949 ms** | N/A (legacy ARM) |
| HF identity version | N/A | **V2** | pre-V2 remediation |
| Video GT | N/A | NOT_PLANNED | NOT_AVAILABLE (incident) |

**C63 field parity:** `FULL_PARITY` with Aug 2026 `availableSignals` inventory — all 29 preflight fields produced rows in motion.

---

## 8. Native events

| Check | Result |
|-------|--------|
| `NATIVE_EVENT` observations | **0** |
| Aug 2026 audit `behavior.*` (30d) | 34 events historically on this vehicle |
| Interpretation | No harsh-driving native events crossed the capture window threshold during RD002 — **not** a capture failure |

---

## 9. Sealed raw evidence (outside Git)

| File | SHA-256 | Bytes |
|------|---------|-------|
| `observations.jsonl` | `ad2d9c29e130d07dffa395c7d99e33d9a217e3273bdaed74168925c8ac108d9a` | 2,661,373 |
| `session-metadata.json` | `6a2ed20f4eb1cf82dec290a27e986aa2d234ead8c07a6f0597feb834bbf65882` | 468 |
| Manifest | `/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-002/manifest.sha256.json` | — |

Reanalyze script: `backend/scripts/ops/reference-capture-drive-002-reanalyze.ts`

---

## 10. Verdicts (canonical)

| Verdict | Value |
|---------|-------|
| `REFERENCE_DRIVE_002_CAPTURE` | **COMPLETED** |
| `MOTION_CANARY_COMPLETED` | **YES** |
| `PHASE_3A3_2_PRODUCTION_VALIDATED` | **YES** |
| `VIDEO_GROUND_TRUTH` | **NOT_PLANNED_BY_PROTOCOL** |
| `READY_FOR_RD003` | **YES** |

**RD003** is the next authorized reference drive when owner is ready for **video Ground Truth** capture. Do **not** start RD003 automatically.

---

## Related evidence

| Evidence ID | Artifact |
|-------------|----------|
| DI-EV-0023 | This report |
| DI-EV-0024 | `docs/audits/data/dimo-lte-r1-reference-drive-002-session-summary.json` |
| DI-EV-0025 | `docs/audits/data/dimo-lte-r1-reference-drive-002-signal-quality-metrics.json` (+ CSV) |
| DI-EV-0026 | `docs/audits/dimo-lte-r1-reference-drive-002-ground-truth-evidence-index-2026-09-02.md` |
| DI-EV-0021 | 3A.3.2 HF watermark remediation (code basis) |
| DI-EV-0022 | Production cutover + canonical redeploy |
