# EXP-021 TGR Architecture Audit Findings

**Audit date:** 2026-09-16  
**Code authority:** `origin/main` @ `11304a1bfd80cd2cef757e4aef708ec5691bc667`  
**Mode:** Read-only; no runtime implementation

## 1. Current HF V2 recovery model

**`CURRENT_RECOVERY_MODEL`:** HF_RECOVERY_V2 with optional RECOVERY_SWEEP (sequential chunk sweep behind settled fast-loop coverage; LEGACY fallback when V2 disabled or canary fail-closed).

### Authority separation (code-level, not yet persisted as GAP_DEBT)

| Authority | Storage | Meaning |
|-----------|---------|---------|
| `QUERY_COVERAGE` | `hfQueryCoverageByField` | Provider was queried through this temporal boundary |
| `DATA_COVERAGE` | `hfWatermarkByField` | Provider returned durable bucket data through this timestamp |
| `RECOVERY_CURSOR` | `hfRecoveryCursorByField` | Recovery sweep progress (sweep-only) |

### Zero-result behavior

**`DOES_QUERY_COVERAGE_ADVANCE_ON_ZERO_RESULT=YES`**

A successful provider query with `resultBucketCount=0` advances query coverage when persistence commits (`coverageAdvanceEligible: providerQuerySucceeded`). This does **not** mean data was obtained.

**`ZERO_RESULT_CREATES_DURABLE_DATA_DEBT=NO`** — no per-gap debt marker is created.  
**`PARTIAL_RESULT_CREATES_DURABLE_DATA_DEBT=NO`** — partial temporal coverage within a window is not tracked as recoverable debt.

### Recovery sweep parameters (verified against current main)

| Parameter | Default | Source |
|-----------|---------|--------|
| Sweep interval | **300000 ms** (5 min) | `HF_RECOVERY_SWEEP_INTERVAL_MS_DEFAULT` |
| Sweep lookback | **1800000 ms** (30 min) | `HF_RECOVERY_SWEEP_LOOKBACK_MS_DEFAULT` |
| Sweep chunk | **60000 ms** (60 s) | Hardcoded `maxChunkMs: 60_000` in acquisition service |

Sweep is sequential/cursor-oriented, **not** durable per-gap debt, **not** gap-class routed, **not** maturation-aware.

### Gap debt requirement

**`SEPARATE_GAP_DEBT_AUTHORITY_REQUIRED=YES`**

TGR needs explicit `GAP_DEBT` records with: gap class, eligibility time, attempt budget, resolution state, provenance chain — separate from query coverage cursor and data watermark.

---

## 2. Micro-window experiment (question B)

Tested known-good HF controls from Run 1 positive-control closure.

### HF60 (`PC-HF60-NATIVE-SLOT2`)

| Partition | Union bucket identities | Extra vs full |
|-----------|----------------------|---------------|
| FULL | 10 | — |
| 30s | 10 | 0 |
| 15s | 10 | 0 |
| 10s | 10 | 0 |
| 5s | 10 | 0 |

### HF90 (`PC-HF90-NATIVE-SLOT4`)

| Partition | Union bucket identities | Extra vs full |
|-----------|----------------------|---------------|
| FULL | 6 | — |
| 30s | 6 | 0 |
| 15s | 6 | 0 |
| 10s | 6 | 0 |
| 5s | 6 | 0 |

**`MICRO_WINDOW_RECOVERY_EFFECT_OBSERVED=NO`**

Interpret narrowly: on these tested historical known-good HF windows, subdividing the query did not increase the retrievable bucket-identity union. Do not generalize to all DIMO windows.

Partitioning increases provider request count without coverage benefit on tested controls.

---

## 3. Transition fragmentation

Canonical window: `2026-09-15T11:49:04.650Z` → `2026-09-15T11:50:08.945Z`

| Partition | Union buckets |
|-----------|---------------|
| FULL (prior authority) | 0 |
| 1s narrow probe (prior authority) | 0 |
| 30s | 0 |
| 15s | 0 |
| 10s | 0 |
| 5s | 0 |

**`TRANSITION_GAP_MICRO_FRAGMENTATION_RECOVERY=NO`**  
**`THIS_TRANSITION_WINDOW_RECOVERABILITY_NOT_DEMONSTRATED=YES`**

Do **not** infer `ALL_TRANSITION_WINDOWS_ARE_UNRECOVERABLE`.

### Corrected transition classifier design semantics

| Policy | Value |
|--------|-------|
| `GENERIC_TARGETED_RETRY_ALLOWED` | `NO_NOT_YET_DEMONSTRATED` |
| `MICRO_FRAGMENTATION_RETRY_ALLOWED` | `NO` |
| `OPTIONAL_ONE_SHOT_BOUNDARY_DIAGNOSTIC` | `SHADOW_ONLY` |
| `PRODUCTION_RETRY_POLICY` | `UNDETERMINED_PENDING_MORE_LIVE_EVIDENCE` |

---

## 4. Maturation findings (question A)

From immutable Run 1 settlement authority (`settlement-maturation.json` in gap-replay package):

| Probe | 30s | 60s | 120s+ |
|-------|-----|-----|-------|
| SP-60-T0 | ZERO | SUCCESS | SUCCESS |
| SP-90-T16 | ZERO | SUCCESS | SUCCESS |

- `CURRENT_EVIDENCE_ZERO_AT_MS=30000`
- `CURRENT_EVIDENCE_FIRST_OBSERVED_SUCCESS_MS=60000`
- **`PRODUCTION_RETRY_AGE_ESTABLISHED=NO`** — do not encode 60000 ms as optimal production retry age

Unknown transition threshold lies between observed 30s zero and at-or-before 60s success for these two windows only.

**Candidate live shadow ages (design only, not activated):** 30000, 45000, 60000, 90000, 120000 ms

---

## 5. Synthetic local recovery

Strict exact-identity experiment on HF60 known-good window:

- **`STRICT_EXACT_IDENTITY_RECOVERY_COUNT=3/9`**
- **`STRICT_EXACT_IDENTITY_RECOVERY_PERCENT=33.3`**

Do not call this a generic recovery success rate.

Observed: target `.945Z`, provider neighbor `.445Z` — **`LOCAL_DATA_PRESENT_WITH_SUBSECOND_BUCKET_START_SHIFT=YES`**

- **`PERSISTENCE_IDENTITY_TOLERANCE_CHANGE_REQUIRED=NO`**
- **`GAP_DETECTION_MATCHING_TOLERANCE_REQUIRES_DESIGN=YES`** (detection/reasoning only)

---

## 6. Gap detection boundary

| Level | Supported |
|-------|-----------|
| Exact missing bucket timestamp | **NO** |
| Bounded suspicious temporal region | **PARTIAL** (`maxIntraResponseTemporalGapMs` + watermark lag) |
| Generic sparse coverage | YES (safest) |

**`FALSE_POSITIVE_RISK=MEDIUM_HIGH`** when relying on regular 1 Hz assumptions or bucket count alone. Classifier must fail conservative.

---

## 7. Idempotency

Existing physical sample identity (`providerField + providerTimestamp + value + interval + aggregation + identityVersion`) supports TGR merge:

- **`CURRENT_IDEMPOTENCY_SUPPORTS_TGR=YES`**
- **`REVISION_SEMANTICS_SUPPORT_TGR=YES`**
- **`ADDITIONAL_IDENTITY_WORK_REQUIRED=MINOR`** (gap-detection tolerance for sub-second bucket-start alignment)

---

## 8. Request cost terminology (hardened)

Do not present illustrative numbers as runtime-measured production truth.

Distinguish:

| Term | Meaning |
|------|---------|
| `EXP021_EFFECTIVE_CADENCE` | Experiment phase cadence (60s or 90s slot schedule) |
| `ACQUISITION_LOOP_FREQUENCY` | How often the reference-capture runner executes acquisition cycles |
| `PROVIDER_REQUEST_COUNT` | Actual DIMO GraphQL historical signal queries issued |

**Relative model (normalized, not production-measured):**

| Strategy | Relative provider request burden |
|----------|-------------------------------|
| Baseline 60s capture only | 1× (reference) |
| Global faster polling (15–30s) | ~2–4× always-on multiplier |
| TGR (60s + gap-triggered local retry) | 1× when no gap; +bounded local queries per detected recoverable gap |

TGR is request-efficient relative to global faster polling when gaps are sparse and classifiable. With a 3-vehicle fleet, absolute volume is not the primary constraint; scientific provenance and raw/recovered metric separation matter more.

---

## 9. Architecture conclusion

**`PREFERRED_TGR_ARCHITECTURE=OPTION_C`**

Gap Debt registry + during-trip maturation-aware targeted requery + post-trip bounded reconciliation.

**`PRIMARY_DEMONSTRATED_RECOVERY_LEVER=MATURATION_AWARE_TARGETED_REQUERY`**

Micro-window fragmentation is **not** the demonstrated lever. It remains an optional future capability for `PARTIAL_TEMPORAL_COVERAGE` only if later evidence supports it.

### Architecture options compared

| Option | Verdict |
|--------|---------|
| A — Recovery sweep only | Insufficient |
| B — Gap debt + during-trip | Better; incomplete terminal reconciliation |
| C — B + post-trip | **Preferred** |
| D — Global faster polling | Rejected for cadence authority |

---

## 10. Raw vs recovered science

**`RAW_AND_RECOVERED_METRICS_SEPARATE=YES`**

Recovery must never rewrite original slot outcome/provenance.

### RAW_BASELINE metrics

- `baselineBucketCount`
- `baselineRequestCount`
- `baselineZeroCount`
- `baselineTemporalCoverage`

### RECOVERY metrics

- `recoveredBucketCount`
- `recoveryRequestCount`
- `gapDebtCreatedCount`
- `gapDebtRecoveredCount`
- `gapDebtPersistentCount`
- `timeToRecoveryMs`

TGR must remain logically separate from EXP-021 fleet auto-sampler cadence allocation.

---

## 11. Proposed implementation sequence (not this PR)

1. Gap debt schema + classifier (shadow mode)
2. Live maturation shadow experiment design
3. During-trip retry lane (canary)
4. Post-trip reconciliation worker
5. Fleet study metric hooks
6. Physical validation run (separate authorization)
