# DI-EV-0035C — Production HF Historical Recovery Runtime Implementation

**Evidence ID:** DI-EV-0035C  
**Date:** 2026-09-04  
**Class:** PRODUCTION_RUNTIME_FIX + HF_ACQUISITION_COMPLETENESS + OBSERVABILITY + LIVE_CALIBRATION_FOUNDATION  
**Authority:** RD004-B runtime fix contract (`rd004-b-hf-runtime-fix-contract.json`)  
**Status:** IMPLEMENTED (reference-capture path); **NOT DEPLOYED**; **V2 default OFF**

---

## Executive summary

RD004-B proved DIMO HF aggregate buckets can arrive after the first query and that the legacy **2 s** recovery overlap can permanently miss late buckets. This PR implements the approved **SETTLED_HORIZON + BOUNDED_OVERLAP + PERIODIC_DEEP_RECOVERY + SEPARATE_WATERMARKS** architecture on the **reference-capture incremental HF path** only.

**Provisional defaults (NOT validated):** `HF_SETTLEMENT_DELAY_MS=8000`, `HF_RECOVERY_OVERLAP_MS=6000`.  
`PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED = NO`

---

## Phase 0 — Canonical HF path audit

| Question | Answer |
|----------|--------|
| `IS_REFERENCE_CAPTURE_HF_PATH_THE_CANONICAL_PRODUCTION_HF_PATH` | **NO** |
| `REFERENCE_CAPTURE_PATH_EQUALS_PRODUCTION_HF_PATH` | **NO** |
| `CANONICAL_PRODUCTION_HF_PATH_AUDITED` | **YES** |

### Reference capture (this PR's target)

- Module: `reference-capture-acquisition.service.ts` → `HF_HISTORICAL` surface
- Gated by `REFERENCE_CAPTURE_ENABLED` (default **false**)
- Scheduler: BullMQ `ReferenceCaptureProcessor` + per-session cycle lock (`tryAcquireCycleLock`)
- Incremental HF with per-field DATA + QUERY COVERAGE watermarks (3A.3.2)

### Production Driving Intelligence HF (unchanged)

- `dimo-segments.service.ts` → `fetchHighFrequency()` whole-trip queries
- Consumed by `trip-behavior-enrichment.service.ts` post-trip enrichment
- **Not modified in this PR**

Sealed RD004 capture remains `ACQUISITION_INCOMPLETE`. A **new dense reference capture** is required after live calibration.

---

## Phase 1 — Legacy behavior (V2 disabled)

| Item | Legacy value |
|------|----------------|
| `HF_QUERY_OVERLAP_MS` | **2000** |
| `resolveHfQueryTo` | `requestStartedAt` (no settlement delay) |
| `computeHfQueryFrom` | `committedQueryCoverage - 2000ms` |
| DATA watermark | `hfWatermarkByField` — advanced on durable persist |
| QUERY coverage | `hfQueryCoverageByField` — advanced after successful cycle commit |
| Zero-result provenance | **Not durable** before DI-EV-0035C |

When `HF_RECOVERY_POLICY_V2_ENABLED=false` (default), legacy window math is preserved.

---

## Implementation map

| Component | Role |
|-----------|------|
| `reference-capture-hf-recovery-v2.policy.ts` | V2 policy: settlement, overlap, sweep planning, provenance ring, observability snapshot |
| `reference-capture.config.ts` + `config/reference-capture.config.ts` | Env wiring + canary token allowlist |
| `reference-capture-acquisition.service.ts` | Fast-loop HF + recovery sweep + provenance + coverage commit gates |
| `reference-capture-hf-availability-calibration.ts` | Bounded probe planning foundation (OFF by default) |
| `reference-capture.types.ts` | `hfQueryProvenanceRing`, `hfRecoveryCursorByField`, sweep counters |

### Separate watermark authorities

| Authority | Field | Advances when |
|-----------|-------|----------------|
| DATA | `hfWatermarkByField` | Durable physical sample persisted |
| QUERY COVERAGE | `hfQueryCoverageByField` | Provider success + durable flush + eligible commit |
| RECOVERY | `hfRecoveryCursorByField` | Successful recovery sweep chunk committed |

### Query-origin semantics

DIMO HF buckets are **query-from-anchored**. Recovery sweep uses **explicit canonical `queryFrom`** per planned window; physical identity uses aggregate-bucket V2 fingerprints (same-origin idempotent; cross-origin not blindly merged).

`QUERY_ORIGIN_SEMANTICS_AUDITED = YES`

---

## Configuration (all default OFF / legacy)

| Env | Default | Notes |
|-----|---------|-------|
| `HF_RECOVERY_POLICY_V2_ENABLED` | `false` | Master V2 gate |
| `HF_SETTLEMENT_DELAY_MS` | `8000` | Provisional, unvalidated |
| `HF_RECOVERY_OVERLAP_MS` | `6000` | Provisional, unvalidated |
| `HF_RECOVERY_SWEEP_ENABLED` | `false` | Deep recovery sweep |
| `HF_RECOVERY_SWEEP_INTERVAL_MS` | `300000` | Min 30s |
| `HF_RECOVERY_SWEEP_LOOKBACK_MS` | `1800000` | 30 min lookback |
| `HF_RECOVERY_POLICY_V2_CANARY_ONLY` | `true` | Restrict V2 to allowlist when set |
| `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS` | *(empty)* | Comma-separated DIMO tokenIds |
| `HF_AVAILABILITY_CALIBRATION_ENABLED` | `false` | Live calibration foundation |

### Canary example (KS MX 2024)

```bash
HF_RECOVERY_POLICY_V2_ENABLED=true
HF_RECOVERY_POLICY_V2_CANARY_ONLY=true
HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS=187336
# Optional sweep after V2 stable:
# HF_RECOVERY_SWEEP_ENABLED=true
```

No tokenId is hardcoded in production logic.

---

## Observability

Structured JSON log event `hf_acquisition_cycle` per HF query (fast loop + sweep):

- `hf_query_from`, `hf_query_to`, `settlement_delay_ms`, `overlap_ms`
- `provider_bucket_count`, `new_bucket_count`, `duplicate_bucket_count`, `revision_bucket_count`
- `recovered_late_bucket_count`, `recovery_sweep_count`
- `query_duration_ms`, `query_success`, `query_zero_result`
- `query_coverage_advance_ms`, `data_watermark_lag_ms`, `recovery_cursor_lag_ms`
- `policy_v2_enabled`, `recovery_sweep_enabled`, `parameters_validated: false`

Zero-result windows stored in session `hfQueryProvenanceRing` (max 500 records).

`ZERO_RESULT_HF_WINDOWS_RECONSTRUCTIBLE = YES`

---

## Multi-replica safety

| Flag | Value |
|------|-------|
| `HF_MULTI_REPLICA_EXECUTION_MODEL` | BullMQ job ownership + per-session `activeCycleJobId` cycle lock in Postgres session state |
| `HF_RECOVERY_MULTI_REPLICA_SAFE` | **YES** (same lock serializes HF cycle per session; sweep runs inside acquired cycle) |

---

## Rollout plan (NOT executed)

1. Merge PR (draft → review)
2. Deploy with **V2 disabled** globally
3. Enable canary token allowlist for KS MX 2024
4. Observe `hf_acquisition_cycle` logs + provenance ring
5. Run availability calibration experiment (staging/canary)
6. Tune `HF_SETTLEMENT_DELAY_MS` / `HF_RECOVERY_OVERLAP_MS` from measured P50/P90/P95
7. Enable recovery sweep canary
8. Compare provider replay density vs captured density
9. Execute **new dense reference drive** before RD004 video/telemetry re-validation

`DEPLOYED = NO`

---

## Test evidence

| Suite | Result |
|-------|--------|
| `reference-capture-hf-recovery-v2.policy.spec.ts` | 13 tests — V2/legacy/canary/watermarks/provenance/sweep |
| `reference-capture-hf-durable-idempotency.spec.ts` | idempotency + revisions |
| `reference-capture-hf-auto-flush-watermark.spec.ts` | watermark + auto-flush |
| `reference-capture-integration.spec.ts` | integration |
| RD003/RD004 evidence specs | 353 tests green |

---

## Final flags

```
DI_EV = DI-EV-0035C
MAIN_BASE_CONTAINS_PR_1532 = YES
CANONICAL_PRODUCTION_HF_PATH_AUDITED = YES
REFERENCE_CAPTURE_PATH_EQUALS_PRODUCTION_HF_PATH = NO
HF_RECOVERY_POLICY_V2_IMPLEMENTED = YES
HF_RECOVERY_POLICY_V2_DEFAULT_ENABLED = NO
HF_CANARY_SCOPE_SUPPORTED = YES
HF_SETTLEMENT_DELAY_CONFIGURABLE = YES
HF_RECOVERY_OVERLAP_CONFIGURABLE = YES
PROVISIONAL_SETTLEMENT_DELAY_MS = 8000
PROVISIONAL_RECOVERY_OVERLAP_MS = 6000
PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED = NO
DATA_WATERMARK_SEPARATE = YES
QUERY_COVERAGE_WATERMARK_SEPARATE = YES
RECOVERY_CURSOR_SEPARATE = YES
ZERO_RESULT_HF_WINDOWS_RECONSTRUCTIBLE = YES
QUERY_ORIGIN_SEMANTICS_AUDITED = YES
SAME_ORIGIN_DUPLICATE_IDEMPOTENT = YES
PROVIDER_REVISION_PRESERVED = YES
CROSS_ORIGIN_BUCKETS_BLINDLY_MERGED = NO
PERIODIC_DEEP_RECOVERY_IMPLEMENTED = YES
PERIODIC_DEEP_RECOVERY_DEFAULT_ENABLED = NO
HF_MULTI_REPLICA_EXECUTION_MODEL = BULLMQ_SESSION_CYCLE_LOCK
HF_RECOVERY_MULTI_REPLICA_SAFE = YES
HF_RUNTIME_OBSERVABILITY_IMPLEMENTED = YES
LIVE_AVAILABILITY_CALIBRATION_FOUNDATION_IMPLEMENTED = YES
ACTUAL_FIRST_PROVIDER_AVAILABILITY_VALIDATED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
TIRE_RUNTIME_CHANGED = NO
BRAKE_RUNTIME_CHANGED = NO
REFERENCE_CAPTURE_RUNTIME_CHANGED = YES
PRODUCTION_HF_CAPTURE_RUNTIME_CHANGED = NO
DEPLOYED = NO
READY_FOR_HF_RECOVERY_CANARY = YES (after merge + deploy with flags)
READY_FOR_MERGE = NO (draft PR; live calibration pending)
```
