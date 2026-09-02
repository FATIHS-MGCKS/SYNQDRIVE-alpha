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

## 6. HF cadence finding (major Driving Intelligence result)

`HF_HISTORICAL` is **ACTIVE** under motion, but **requested 1s DIMO aggregation ≠ observed 1 Hz bucket cadence**.

| Flag | Value | Maturity |
|------|-------|----------|
| `REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ` | **NO** | CONFIRMED_FROM_VEHICLE_OBSERVATION |
| `HF_HISTORICAL_OBSERVATION_TYPE` | `HF_AGGREGATE_BUCKET_OBSERVATION` | CONFIRMED_FROM_CODE |
| DIMO aggregation | AVG, 1s bucket definition | CONFIRMED_FROM_CODE_AND_PROVIDER_SOURCE |
| Provider/upstream bucket availability | sparse / irregular | CONFIRMED_FROM_VEHICLE_OBSERVATION |

The **355 HF rows are aggregate-bucket observations** (`AGGREGATE_BUCKET_V2` fingerprint), **not** proven raw LTE_R1 physical source samples.

### Per-field HF bucket spacing (all five HF fields — identical in RD002)

| Field | HF rows | Δt P50 (s) | Δt P90 (s) | Δt P95 (s) | Δt P99/MAX (s) |
|-------|---------|------------|------------|------------|----------------|
| `speed` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `obdEngineLoad` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `obdThrottlePosition` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `powertrainCombustionEngineTPS` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |
| `powertrainCombustionEngineSpeed` | 71 | 13.489 | 42.189 | 84.024 | 249.647 |

Full per-field/surface metrics: `docs/audits/data/dimo-lte-r1-reference-drive-002-signal-quality-metrics.json` (DI-EV-0025).

### LATEST_LIVE: polling ≠ provider sample frequency

Example `speed` on `LATEST_LIVE`:

| Cadence type | P50 | P95 |
|--------------|-----|-----|
| Recorder retrieval (`requestStartedAt` Δt) | **~5.85 s** | **~6.25 s** |
| Provider timestamp update (unique timestamps) | **~15 s** | **~27 s** |

| Flag | Value |
|------|-------|
| `POLLING_FREQUENCY_EQUALS_PROVIDER_SAMPLE_FREQUENCY` | **NO** |

Critical for future Driver Quality, Vehicle Load, Brake Physics, Tire Dynamic Load, and sampling-confidence work. **No score changes in this pass.**

---

## 7. Physics / assessability semantics

RD002 validates **recorder + HF acquisition mechanics**. It does **not** prove C63 LTE_R1 cadence is sufficient for fine-grained vehicle dynamics reconstruction.

| Assessment | Result |
|------------|--------|
| `HIGH_RESOLUTION_JERK_RECONSTRUCTION` | **NOT_VALIDATED** |
| `HIGH_RESOLUTION_BRAKE_PHYSICS` | **NOT_AVAILABLE** |
| `DIRECT_BRAKE_SIGNAL` | **ABSENT** |
| `YAW_SIGNAL` | **ABSENT** |
| `WHEEL_SPEED_SIGNAL` | **ABSENT** |

Speed/RPM/throttle/load remain useful vehicle-specific evidence. **Do not penalize scores** for absent signals — assessability/confidence only.

---

## 8. C63 signal differential (summary)

Full per-field inventory: `docs/audits/dimo-lte-r1-reference-drive-002-c63-signal-differential-2026-09-02.md` (DI-EV-0026).

| Metric | Value |
|--------|-------|
| `C63_CURRENT_AVAILABLE_SIGNALS` | **29** |
| `C63_RD002_OBSERVED_SIGNALS` | **29** |
| `NEW_SIGNALS_VS_AUGUST_C63` | **0** |
| `LOST_SIGNALS_VS_AUGUST_C63` | **0** |

RD001 Tiguan had **31** discovered signals — **vehicle-specific comparison only**, not cross-vehicle parity. C63 lacks transmission gear fields present on Tiguan.

C63-specific absent high-value physics (vehicle-level, not provider-wide): transmission actual gear, yaw/lateral angular velocity, wheel speed, direct brake pedal/hydraulic evidence, tire pressure.

---

## 9. Native events

| Flag | Value | Maturity |
|------|-------|----------|
| `NATIVE_EVENT_COUNT` | **0** | CONFIRMED_FROM_RUNTIME |
| `NATIVE_EVENT_PATH_AVAILABLE_FROM_CAPABILITY` | **YES** | CONFIRMED_FROM_CODE |
| `NATIVE_EVENT_OBSERVED_IN_RD002` | **NO** | CONFIRMED_FROM_RUNTIME |
| `NATIVE_EVENT_RUNTIME_DELIVERY_VALIDATED_BY_RD002` | **NO / NOT_OBSERVED** | NOT_OBSERVED |

Aug 2026 C63 audit: **34** historical `behavior.*` events (30d). Historical evidence only — **not** an event-capture failure.

---

## 10. Late-arrival recovery

| Flag | Value | Maturity |
|------|-------|----------|
| `HF_LATE_ARRIVAL_RECOVERY_RUNTIME` | **NOT_OBSERVED_IN_RD002** | NOT_OBSERVED |

No concrete late-arriving bucket was observed and recovered during RD002. This does **not** invalidate `PHASE_3A3_2_PRODUCTION_VALIDATED=YES`. RD002 did prove HF acquisition, watermark/coverage state, V2 identity, DB uniqueness, runtime continuity, and clean STOP under motion.

---

## 11. Sealed raw evidence (outside Git)

| File | SHA-256 | Bytes |
|------|---------|-------|
| `observations.jsonl` | `ad2d9c29e130d07dffa395c7d99e33d9a217e3273bdaed74168925c8ac108d9a` | 2,661,373 |
| `session-metadata.json` | `6a2ed20f4eb1cf82dec290a27e986aa2d234ead8c07a6f0597feb834bbf65882` | 468 |
| Manifest | `/opt/synqdrive/shared/reference-evidence/dimo-lte-r1-reference-drive-002/manifest.sha256.json` | — |

Reanalyze script (offline, read-only): `backend/scripts/ops/reference-capture-drive-002-reanalyze.ts`

---

## 12. Verdicts (canonical)

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
| DI-EV-0026 | `docs/audits/dimo-lte-r1-reference-drive-002-c63-signal-differential-2026-09-02.md` |
| DI-EV-0021 | 3A.3.2 HF watermark remediation (code basis) |
| DI-EV-0022 | Production cutover + canonical redeploy |
