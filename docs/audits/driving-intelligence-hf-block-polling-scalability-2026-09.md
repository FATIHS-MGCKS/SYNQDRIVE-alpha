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

## 8. Flight Recorder / Dynamic Reference Capture Canary Experiment Contract

**Canonical name:** Flight Recorder Canary Experiment Contract (also: Dynamic Reference Capture Canary Experiment Contract).

**Authority:** Operator-selected vehicle at experiment time — **not** a fixed plate, vehicleId, or DIMO tokenId in architecture or code.

### Selection model

1. Immediately before a live calibration / reference drive, determine which connected vehicle is actually available.
2. Select that vehicle as the temporary Flight Recorder / Reference Capture canary.
3. Resolve its DIMO `tokenId` at runtime/configuration time.
4. Put **only** the selected `tokenId`(s) into `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS`.
5. Run the controlled reference experiment.
6. After the experiment, disable V2 / clear the canary selection or replace with the next explicitly selected vehicle.

Eligible vehicles include any connected SynqDrive vehicle (e.g. KS MX 2024, KS MS 661, or future fleet vehicles) depending on operational availability.

**Runtime selection authority:** `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS` (env / `referenceCapture.hfRecoveryPolicyV2CanaryTokenIds`). No plate or token is hardcoded in Reference Capture HF Recovery V2 or block-polling runtime.

**C.1a fail-closed preserved:** `V2_ENABLED=true` + `CANARY_ONLY=true` + empty/missing/invalid allowlist ⇒ LEGACY for all tokens.

### Example only (NON_CANONICAL_EXAMPLE = YES)

Historical design-time candidate while authoring C.1 — **not** architectural authority:

| Field | Value |
|-------|-------|
| Vehicle | KS MX 2024 |
| tokenId | 187336 |

```bash
HF_RECOVERY_POLICY_V2_ENABLED=true
HF_RECOVERY_POLICY_V2_CANARY_ONLY=true
HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS=187336   # replace with selected vehicle token at experiment time
HF_HISTORICAL_POLL_INTERVAL_MS=30000             # vary per phase
HF_SETTLEMENT_DELAY_MS=8000
HF_RECOVERY_OVERLAP_MS=6000
```

### Calibration phase matrix

**Duration:** ≥20–30 min continuous drive per cadence phase.

**Phases:** separate labeled sessions or intervals for **10s / 20s / 30s / 60s** with otherwise identical HF policy parameters where possible.

**Comparability:** For one 10/20/30/60s series, prefer the **same** selected vehicle across all cadence phases so poll cadence is the primary changed variable.

If operational availability forces a vehicle change between phases:

- Record `vehicleId` / `tokenId` per phase in experiment metadata.
- Do **not** blindly compare phases as if vehicle identity were constant.
- Mark the vehicle change explicitly in evidence.
- Stratify results by vehicle or repeat missing phases on the same vehicle later.

```
SAME_VEHICLE_PREFERRED_WITHIN_CALIBRATION_SERIES = YES
CROSS_VEHICLE_PHASE_CHANGE_MUST_BE_RECORDED = YES
```

**Per phase collect:** provider request count, aggregate bucket count, unique temporal starts, median/P90 cadence, max gap, zero-results, late/recovered buckets, duplicates, revisions, errors, latency.

**Post-session:** exact-window provider replay (same-origin) vs captured coverage — per RD004 query-from-anchored rules.

`FLIGHT_RECORDER_CANARY_EXPERIMENT_DEFINED = YES`

*(Prior C.1 wording `KS_MX_2024_CANARY_EXPERIMENT_DEFINED` was example-specific; superseded by this contract in DI-EV-0035C.1b.)*

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

---

## DI-EV-0035C.1b — Dynamic Flight Recorder canary vehicle selection contract (2026-09-04)

**Evidence ID:** DI-EV-0035C.1b  
**Parent:** DI-EV-0035C.1 / C.1a  
**Status:** DOCUMENTATION + VERIFICATION; **NOT DEPLOYED**

### A. Runtime vehicle-agnostic verification

Forensic audit of Reference Capture HF Recovery V2 + block-polling runtime:

- No hardcoded KS MX 2024, registration plate, or tokenId `187336` in production logic.
- Canary authority remains `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS` via env / `ReferenceCaptureConfig`.
- C.1a fail-closed semantics unchanged.

```
REFERENCE_CAPTURE_CANARY_RUNTIME_CONFIGURABLE = YES
REFERENCE_CAPTURE_CANARY_VEHICLE_HARDCODED = NO
CANARY_FAIL_CLOSED_SEMANTICS_PRESERVED = YES
```

### B. Canonical experiment contract correction

Section 8 renamed/amended to **Flight Recorder / Dynamic Reference Capture Canary Experiment Contract**. KS MX 2024 / token `187336` retained only as `NON_CANONICAL_EXAMPLE = YES`.

```
KS_MX_2024_TOKEN_187336_CANONICAL_CANARY = NO
KS_MX_2024_TOKEN_187336_EXAMPLE_ONLY = YES
```

### C. Experimental comparability rule

Documented in §8: same vehicle preferred within a 10/20/30/60s series; cross-vehicle phase changes must be recorded and stratified.

### D. Flight Recorder pre-run selection contract

Before every live Reference Capture calibration, operator must:

1. Choose available connected vehicle (not auto-activated).
2. Resolve `vehicleId` + DIMO `tokenId`.
3. Verify vehicle connectivity / telemetry availability.
4. Set selected `tokenId` in `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS`.
5. Verify `HF_RECOVERY_POLICY_V2_CANARY_ONLY=true`.
6. Verify exactly intended token(s) resolve to V2; all others LEGACY.
7. Select `HF_HISTORICAL_POLL_INTERVAL_MS` for current phase (10/20/30/60s).
8. Start Reference Capture / Flight Recorder session.
9. Record experiment metadata: `vehicleId`, display identifier (if appropriate), `tokenId`, phase poll interval, V2 parameters, `sessionId`, start/end timestamps.
10. After experiment: disable V2 or clear/replace canary selection.

```
FLIGHT_RECORDER_PRE_RUN_SELECTION_CONTRACT_DOCUMENTED = YES
```

### E. Safety boundary (unchanged)

```
PRODUCTION_HF_PATH_CHANGED = NO
PRODUCTION_SCORE_CHANGED = NO
PRODUCTION_DETECTORS_CHANGED = NO
PRODUCTION_TIRE_BRAKE_MODELS_CHANGED = NO
PRODUCTION_FLEET_STAGGERING_ENABLED = NO
HF_30S_BLOCK_POLLING_VALIDATED = NO
DEPLOYED = NO
```

### C.1b final flags

```
DI_EV = DI-EV-0035C.1b
FIXED_KS_MX_2024_CANARY_DEPENDENCY_FOUND = YES (documentation only; runtime already agnostic)
FIXED_KS_MX_2024_CANARY_DEPENDENCY_REMOVED = YES
REFERENCE_CAPTURE_CANARY_VEHICLE_RUNTIME_SELECTABLE = YES
READY_FOR_REFERENCE_CAPTURE_CANARY = YES (after merge; operator selects vehicle + sets allowlist per pre-run contract)
READY_FOR_MERGE = YES (documentation contract corrected; no production path changes)
```
