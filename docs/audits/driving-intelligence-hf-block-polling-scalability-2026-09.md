# DI-EV-0035C.1 — HF Historical Block Polling Scalability Testbed

**Evidence ID:** DI-EV-0035C.1  
**Date:** 2026-09-04  
**Parent:** DI-EV-0035C (HF Recovery V2 on Reference Capture)  
**Status:** IMPLEMENTED (testbed); **NOT DEPLOYED**; **30s hypothesis NOT_VALIDATED**

---

## 1. Current HF request cadence audit

| Layer | Cadence | Configurable |
|-------|---------|--------------|
| BullMQ runner (`ReferenceCaptureProcessor`) | `REFERENCE_CAPTURE_CYCLE_INTERVAL_MS` default **5000** | YES |
| `captureTick` / `executeAcquisitionCycle` | Every runner job | — |
| Surface planner `HF_HISTORICAL` | `minCycleGap: 1` → planned **every cycle** | NO (before C.1) |
| Provider HF request (legacy) | **Same as runner** ≈ every 5s | NO |
| Provider HF request (V2 + C.1) | `HF_HISTORICAL_POLL_INTERVAL_MS` default **30000** (provisional) | YES |

```
CURRENT_REFERENCE_HF_REQUEST_CADENCE_MS = 5000   (legacy / runner tick)
CURRENT_HF_REQUEST_CADENCE_CONFIGURABLE = YES    (V2: HF_HISTORICAL_POLL_INTERVAL_MS)
```

Runner still ticks every 5s; V2 skips `HF_HISTORICAL` until poll interval elapses.

---

## 2. API poll cadence vs bucket resolution

| Concept | Value |
|---------|-------|
| `HF_PROVIDER_REQUEST_INTERVAL` | `1s` (DIMO historical aggregation — unchanged) |
| `HF_API_POLL_CADENCE` | Configurable via `HF_HISTORICAL_POLL_INTERVAL_MS` (V2 only) |
| `HF_BUCKET_AGGREGATION_INTERVAL` | `1s` |

**We test:** 30s between requests + 1s aggregate buckets inside each window.  
**NOT:** 30s aggregate buckets.

---

## 3. Query window continuity

Under V2 (independent of poll cadence):

- `safeQueryTo = requestStartedAt - HF_SETTLEMENT_DELAY_MS`
- `queryFrom = committedQueryCoverage - HF_RECOVERY_OVERLAP_MS`

30s between polls expands the natural query window; overlap prevents gaps.

`NO_UNQUERIED_GAP_CREATED_BY_LONGER_POLL_INTERVAL = YES`

`POLL_CADENCE_SEPARATE_FROM_SETTLEMENT = YES`  
`POLL_CADENCE_SEPARATE_FROM_OVERLAP = YES`

---

## 4. Block-density observability

Each HF request logs merged `hf_acquisition_cycle` + block metrics:

- `poll_interval_ms`, `query_window_duration_ms`
- `unique_temporal_bucket_start_count`
- `buckets_per_provider_request`, `requests_per_vehicle_hour`
- `temporal_bucket_density_per_minute`
- `hf_30s_block_polling_validated: false`

---

## 5. Request-load model (planning arithmetic)

Deterministic model in `computeFleetRequestLoadModel()`:

| Vehicles | 30s poll | req/s | req/min | req/h |
|----------|----------|-------|---------|-------|
| 100 | 30s | 3.33 | 200 | 12,000 |
| 500 | 30s | 16.67 | 1,000 | 60,000 |
| 1000 | 30s | 33.33 | 2,000 | 120,000 |
| 5000 | 30s | 166.67 | 10,000 | 600,000 |

Compare vs 5s poll at 1000 vehicles: **200 req/s → 33.33 req/s** (~6× reduction).

Not a DIMO rate-limit claim.

---

## 6. Fleet staggering design

`FLEET_REQUEST_STAGGERING_DESIGNED = YES`

**Algorithm:** `staggerOffsetMs = tokenId % pollIntervalMs` (deterministic, restart-stable).

Future production scheduler fires at `epochAlignedBase + staggerOffset + n * pollIntervalMs`.

Reference Capture single-session path uses simple interval gate; stagger primitive tested via `distributeFleetStaggerBuckets()`.

**Production HF scheduler NOT modified in this PR.**

---

## 7. HF_30S_BLOCK_HYPOTHESIS

> One HF_HISTORICAL provider request approximately every 30 seconds can return the historical aggregate buckets for that block at ~1s/2s temporal density, making it substantially more request-efficient for Driving Intelligence than very frequent polling.

`HF_30S_BLOCK_POLLING_VALIDATED = NO`

---

## 8. KS MX 2024 canary experiment contract

**Vehicle:** KS MX 2024 via config `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS=187336` (not hardcoded).

**Duration:** ≥20–30 min continuous drive per cadence phase.

**Phases:** separate labeled sessions or intervals for 10s / 20s / 30s / 60s:

```bash
HF_RECOVERY_POLICY_V2_ENABLED=true
HF_RECOVERY_POLICY_V2_CANARY_ONLY=true
HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS=187336
HF_HISTORICAL_POLL_INTERVAL_MS=30000   # vary per phase
HF_SETTLEMENT_DELAY_MS=8000
HF_RECOVERY_OVERLAP_MS=6000
```

**Per phase collect:** provider request count, aggregate bucket count, unique temporal starts, median/P90 cadence, max gap, zero-results, late/recovered buckets, duplicates, revisions, errors, latency.

**Post-session:** exact-window provider replay (same-origin) vs captured coverage — per RD004 query-from-anchored rules.

`KS_MX_2024_CANARY_EXPERIMENT_DEFINED = YES`

---

## 9. Decision criteria

Choose the **slowest** poll interval that preserves acceptable historical completeness.

Evaluate 10 / 20 / 30 / 60s. Evidence decides — not latency minimization.

Possible outcome: `HF_TARGET_POLL_INTERVAL_MS = 30000` only if 30s evidence supports it.

---

## 10. Driving Intelligence vs Live UI latency

- **Live UI:** may use `LATEST_LIVE` / snapshot surfaces (unchanged).
- **Driving Intelligence reconstruction:** 30–60s behind real time acceptable if completeness + API efficiency improve.

No UI changes in this PR.

---

## 11. Future production architecture contract (NOT implemented)

**Target path (audit-confirmed):** `dimo-segments.service.ts` → `trip-behavior-enrichment.service.ts`

**Future model:**

1. Active-driving vehicles only (not parked idle budget)
2. Staggered `HF_HISTORICAL` block acquisition (`tokenId % interval`)
3. Settled horizon + bounded overlap + periodic recovery (from DI-EV-0035C)
4. Dense trip timeline persistence
5. Asynchronous DI reconstruction (scores/detectors consume completed timeline)

`PRODUCTION_HF_PATH_CHANGED = NO`

---

## Final flags

```
DI_EV = DI-EV-0035C.1
REFERENCE_HF_POLL_CADENCE_AUDITED = YES
HF_HISTORICAL_POLL_INTERVAL_CONFIGURABLE = YES
HF_BUCKET_AGGREGATION_INTERVAL = 1s
PROVISIONAL_HF_POLL_INTERVAL_MS = 30000
HF_30S_BLOCK_POLLING_VALIDATED = NO
NO_UNQUERIED_GAP_CREATED_BY_LONGER_POLL_INTERVAL = YES
BLOCK_DENSITY_OBSERVABILITY_IMPLEMENTED = YES
REQUEST_LOAD_MODEL_CREATED = YES
FLEET_REQUEST_STAGGERING_DESIGNED = YES
KS_MX_2024_CANARY_EXPERIMENT_DEFINED = YES
PRODUCTION_HF_PATH_CHANGED = NO
DEPLOYED = NO
READY_FOR_REFERENCE_CAPTURE_CANARY = YES (after merge + deploy with V2 flags)
READY_FOR_MERGE = NO
```

---

## DI-EV-0035C.1a — Pre-canary correctness hardening (2026-09-04)

**Evidence ID:** DI-EV-0035C.1a  
**Parent:** DI-EV-0035C.1  
**Status:** IMPLEMENTED (hardening); **NOT DEPLOYED**; **30s hypothesis NOT_VALIDATED**

### A. Canary fail-closed correction

**Defect:** `V2_ENABLED=true` + `CANARY_ONLY=true` + empty/missing `CANARY_TOKEN_IDS` could behave like global V2.

**Fix:** `resolveHfRecoveryPolicyForToken()` now fails closed — empty allowlist ⇒ LEGACY for every token. `canaryOnly` is explicit policy authority; global V2 requires `CANARY_ONLY=false`.

```
HF_V2_CANARY_EMPTY_ALLOWLIST_FAILS_CLOSED = YES
```

### B. Bucket age observability semantics

**Defect:** `computeBucketTemporalSpanMs()` reversed oldest/newest age assignment.

**Fix:** `oldestReturnedBucketAgeMs = observationTime - min(ts)`; `newestReturnedBucketAgeMs = observationTime - max(ts)`. Injectable `observationTimeMs` for deterministic tests.

```
HF_BUCKET_AGE_OBSERVABILITY_SEMANTICS_CORRECT = YES
```

### C. Stagger deadline primitive

**Defect:** `computeStaggeredPollDeadlineMs()` computed offset but did not apply it.

**Fix:** Epoch-aligned schedule `epochMs + tokenOffset + n * pollIntervalMs`. Added `listEpochAlignedPollDeadlinesInWindow()`. Reference Capture runtime still uses simple interval gate; production scheduler unchanged.

```
FLEET_STAGGER_OFFSET_USED_BY_DEADLINE_PRIMITIVE = YES
PRODUCTION_FLEET_STAGGERING_ENABLED = NO
```

### D. Canary measurement sufficiency audit

Extended `HfQueryProvenanceRecord` + block-density observability with fields needed for post-phase reconstruction (poll interval, unique starts, dup/rev/recovered counts, latency, min/max timestamps, max intra-response gap).

```
CANARY_METRICS_RECONSTRUCTIBLE = YES
MISSING_CANARY_METRICS = (none)
```

Median/P90 temporal cadence derivable post-phase from persisted provenance timestamps + observation ring (not pre-aggregated).

### E. Regression / safety

```
PRODUCTION_HF_PATH_CHANGED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_MODELS_CHANGED = NO
REFERENCE_CAPTURE_LEGACY_BEHAVIOR_PRESERVED_WHEN_V2_OFF = YES
HF_30S_BLOCK_POLLING_VALIDATED = NO
DEPLOYED = NO
```

### F. Remaining unknowns

- Live 10/20/30/60s calibration phases not yet executed.
- Provisional 30s block-polling hypothesis remains NOT_VALIDATED.
- Production fleet staggering design only — not wired.

### C.1a final flags

```
DI_EV = DI-EV-0035C.1a
CANARY_FAIL_OPEN_DEFECT_FOUND = YES
CANARY_FAIL_OPEN_DEFECT_FIXED = YES
BUCKET_AGE_SEMANTIC_DEFECT_FOUND = YES
BUCKET_AGE_SEMANTIC_DEFECT_FIXED = YES
STAGGER_DEADLINE_DEFECT_FOUND = YES
STAGGER_DEADLINE_DEFECT_FIXED = YES
READY_FOR_REFERENCE_CAPTURE_CANARY = YES (after merge; V2 flags + non-empty canary allowlist)
READY_FOR_MERGE = YES (correctness findings closed; calibration NOT validated)
```
