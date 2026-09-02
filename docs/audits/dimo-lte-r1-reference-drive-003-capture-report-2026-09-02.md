# Reference Drive #003 — Capture Report (STOP + Telemetry Forensics)

**Evidence ID:** DI-EV-0027  
**Session:** `0fa040aa-6105-4872-9b2c-f8ad477009b8`  
**Vehicle:** VW Tiguan WOB L 7503 · DIMO_LTE_R1 · ICE_GASOLINE  
**Date:** 2026-09-02  
**Sealed SHA-256:** `81534484cdd0fa6224d9efbcf97bb445cfbe8af1fdb8ef29e9bb8204f09c32e4`

## Verdict

| Flag | Value |
|------|-------|
| REFERENCE_DRIVE_003_CAPTURE | COMPLETED |
| RD003_TELEMETRY_FORENSICS | DONE |
| VIDEO_GROUND_TRUTH | PENDING_SEGMENTED_VIDEO |
| GROUND_TRUTH_VALIDATED | NO |
| RD003_TELEMETRY_COVERAGE | FULL_SESSION |
| RD003_VIDEO_GT_COVERAGE | PARTIAL_SEGMENTED |
| REQUESTED_INTERVAL_1S_EQUALS_OBSERVED_1HZ | NO |
| RAW_PHYSICAL_SAMPLE_CADENCE | NOT_PROVEN |

## Session facts (frozen + computed)

| Metric | Value |
|--------|-------|
| Duration | 2227.3 s (~37.1 min) |
| Cycles | 371 |
| SIGNAL_POINT | 6250 |
| HF_HISTORICAL | 2783 |
| SESSION_START_TO_FIRST_REQUEST_MS | 35 |
| SESSION_START_TO_FIRST_SIGNAL_INGRESS_MS | 254 |
| FAST_GO_TO_RECORDING_MS | 125 |
| FAST_GO_TO_FIRST_CYCLE_MS | 1222 |
| FAST_GO_TO_READY_TO_DRIVE_MS | 1222 |
| Recorder cycle P50 | 5.896 s |
| Recorder cycle P95 | 6.539 s |

## HF cadence (per field)

| Field | HF rows | Unique fingerprints | P50 Δt | P90 Δt | P95 Δt | P99 Δt | Max gap |
|-------|---------|---------------------|--------|--------|--------|--------|--------|
| obdEngineLoad | 592 | 592 | 2.000 | 4.815 | 6.038 | 78.028 | 222.738 |
| obdThrottlePosition | 545 | 545 | 2.000 | 4.874 | 6.988 | 78.028 | 222.738 |
| powertrainCombustionEngineSpeed | 500 | 500 | 2.000 | 5.242 | 10.170 | 86.894 | 222.738 |
| powertrainCombustionEngineTPS | 554 | 554 | 2.000 | 4.859 | 6.420 | 78.028 | 222.738 |
| speed | 592 | 592 | 2.000 | 4.815 | 6.038 | 78.028 | 222.738 |

## HF runtime validation

| Check | Result |
|-------|--------|
| HF_PHYSICAL_IDENTITY_VERSION | AGGREGATE_BUCKET_V2 |
| HF_QUERY_WINDOW_BOUNDED | YES |
| HF_DATA_WATERMARK | YES |
| HF_IDEMPOTENCY | YES |
| HF_LATE_ARRIVAL_RECOVERY | NOT_EXERCISED |
| Proof method | ACQUISITION_ORDER_PER_FIELD_EXECUTION |

## Physics assessability (corrected semantics)

| Domain / target | Classification |
|-----------------|----------------|
| VEHICLE_LOAD_ASSESSABILITY | RECONSTRUCTABLE_MEDIUM_CONFIDENCE |
| longitudinalAcceleration | RECONSTRUCTABLE_WITH_CADENCE_GATING |
| GEAR_STATE_OBSERVED | YES |
| GEAR_CHANGE_TIMING_VALIDATED | NO |

**GENERATED_EVIDENCE_VALUE_SOURCE:** COMPUTED_FROM_SEALED_RAW_DATA
