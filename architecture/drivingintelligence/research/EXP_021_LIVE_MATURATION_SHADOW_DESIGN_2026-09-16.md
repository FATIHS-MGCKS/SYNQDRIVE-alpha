# EXP-021 — Live Maturation Shadow Design

**Design date:** 2026-09-16  
**Status:** DESIGN ONLY — no runtime implementation, no Prisma migration, no production activation  
**Code authority:** `origin/main` @ `3930813b5310cfffc3d4d01d65ec997e4c16b80c`  
**Frozen evidence inputs:**
- `architecture/drivingintelligence/evidence/reference-capture/exp021-run1-gap-replay-2026-09-16/`
- `architecture/drivingintelligence/evidence/reference-capture/exp021-tgr-audit-2026-09-16/`

## Authority flags

| Flag | Value |
|------|-------|
| `DESIGN_ONLY` | **YES** |
| `RUNTIME_IMPLEMENTATION` | **NO** |
| `PRISMA_CHANGED` | **NO** |
| `PRODUCTION_CHANGED` | **NO** |
| `FUTURE_SHADOW_DEFAULT_ENABLED` | **NO** |
| `PRODUCTION_RETRY_AGE_SELECTED` | **NO** |
| `QUERY_GEOMETRY_IS_CADENCE_AUTHORITY` | **NO** |
| `SUFFICIENT_FOR_CADENCE_RECOMMENDATION` | **NO** |

---

## 1. Scientific question

### Primary question

> When does a **fixed** DIMO historical window become available and sufficiently complete after the end of that window?

This experiment is required **before** choosing any production TGR retry age.

### Two distinct estimands (must not be conflated)

1. **Availability:** P(non-zero data | actual window age)
2. **Completeness / information maturation:** P(data sufficiently complete | actual window age)

Non-zero availability ≠ completeness. A query may return some buckets at 30s but additional exact bucket identities at 40/45/50/55/60/90/120s.

### Required measurements

| Metric family | Description |
|---------------|-------------|
| `FIRST_NONZERO` | First planned/actual age where any field returns non-zero rows |
| `CUMULATIVE_INFORMATION_MATURATION` | Growth of exact bucket-identity union across ages |

Do **not** reduce maturation to boolean ZERO/SUCCESS only.

### Interval-censored language

Historical settlement evidence interval-censors maturation:

- 30s = observed zero
- 60s = observed non-zero

Therefore the true availability transition occurred **after 30s and at or before 60s** for those two settlement windows.

If a future shadow shows 30s zero, 40s zero, 45s non-zero, the correct scientific statement is:

> transition interval = **(40s, 45s]**

NOT: "data arrived at exactly 45s."

**`INTERVAL_CENSORED_MATURATION_ANALYSIS_REQUIRED=YES`**

### Independence constraints

Maturation shadow must be separate from:

- polling cadence
- query-window size (except controlled geometry strata)
- micro-window fragmentation
- EXP-021 cadence allocation
- recovery execution

**`CROSS_LANE_MATURATION_INFERENCE_ALLOWED=NO`**  
**`ONE_GLOBAL_DIMO_MATURATION_CURVE_ALLOWED=NO`**

---

## 2. Canonical window age definition

```
WINDOW_AGE_MS = provider_request_started_at_ms - fixed_window_to_ms
```

**NOT** age from: slot schedule, T0, session start, job enqueue, or BullMQ execution target.

Persist both:

| Field | Role |
|-------|------|
| `plannedAgeMs` | Schedule stratum (intended probe age) |
| `actualAgeMs` | Scientific authority (`requestStartedAt - windowTo`) |
| `schedulerDriftMs` | `actualAgeMs - plannedAgeMs` |

If delayed-job scheduler drift occurs, **do not falsify** the observation. Store actual execution age and analyze truthfully.

For analysis: use **`actualAgeMs`** as continuous authority; `plannedAgeMs` remains the intended stratum.

**`CANONICAL_WINDOW_AGE_DEFINITION=provider_request_started_at_ms - fixed_window_to_ms`**

---

## 3. Fixed query window invariant

For a single shadow window, **all** maturation observations use the exact same:

- vehicle/token identity
- `windowFrom`
- `windowTo`
- signal-set version (lane-specific)
- interval (`1s`)
- aggregation (`AVG`)
- provider method / query builder semantics
- query boundary semantics

Only request time / age changes.

Example: fixed `[from, to]` queried at ages A, B, C, …

**Never** slide `from` or `to` between age probes.  
**Never** turn repeated age probes into moving fast-loop windows.

**`SAME_WINDOW_ACROSS_AGES=YES`**

---

## 4. Two signal lanes (never combine)

### Lane A: HF_FAST_LOOP

**Current-main resolution (not blind copy of Run 1):**

At shadow window enrollment, resolve HF signal set from:

1. Vehicle preflight `broadObservationFields`
2. `buildAcquisitionCyclePlan()` → `HF_HISTORICAL` surface `providerFields`
3. Filter: `temporalClass ∈ {WAVEFORM_DYNAMICS, POWERTRAIN_DYNAMIC}` AND `historicalSupported === true`

Version-stamp the resolved field list on each shadow window record.

**Historical Run 1 reference set (for comparability only, not assumed current production):**

| Field |
|-------|
| `obdEngineLoad` |
| `obdThrottlePosition` |
| `powertrainCombustionEngineSpeed` |
| `powertrainCombustionEngineTPS` |
| `speed` |

Run 1 used exactly 5 fields. Current main may resolve a different count at enrollment time.

| Authority | Value |
|-----------|-------|
| `HF_SIGNAL_SET_VERSION` | `RUNTIME_PREFLIGHT_HF_HISTORICAL@enrollment` |
| `HF_SIGNAL_COUNT` | dynamic at enrollment; Run 1 historical reference = **5** |

### Lane B: SETTLEMENT_SHADOW

**Current-main resolution:**

`loadFrozenReferenceManifest().canonicalSignals` → all `providerField` values.

| Authority | Value |
|-----------|-------|
| `SETTLEMENT_SIGNAL_SET_VERSION` | `DIMO_LTE_R1_REFERENCE_MANIFEST@1.1.0` / `CAN-33-2026-08-31` |
| `SETTLEMENT_SIGNAL_COUNT` | **33** |

Source: `docs/audits/manifests/dimo-lte-r1-reference-manifest-v1.json`

Both lanes may share the same GraphQL query builder (`buildBroadReferenceHistoricalSignalsQuery`) but **maturation curves MUST remain separate**.

---

## 5. Query geometry (not cadence)

Compare fixed historical query-range geometries ending at the same canonical `windowTo` where feasible:

| Geometry | Duration |
|----------|----------|
| `WINDOW_GEOMETRY_60S` | 60000 ms |
| `WINDOW_GEOMETRY_90S` | 90000 ms |

**`QUERY_GEOMETRIES_MS=60000,90000`**  
**`QUERY_GEOMETRY_IS_CADENCE_AUTHORITY=NO`**

Purpose: determine whether maturation behavior depends materially on query-range length.  
**Do not** use geometry results for cadence selection.

Each geometry is a separate result stratum (lane × geometry × activity cohort).

---

## 6. Age schedule — dense 30→60 resolution

### Current HF V2 settlement delay (verified current main)

`PROVISIONAL_SETTLEMENT_DELAY_MS = 8000` (engineering default; `HF_SETTLEMENT_DELAY_MS` env override).

Include **one** diagnostic early-age probe at current policy settlement delay.

### Dense pilot planned ages (ms)

```
8000, 30000, 40000, 45000, 50000, 55000, 60000, 90000, 120000
```

**`CURRENT_HF_SETTLEMENT_DELAY_MS=8000`**  
**`DENSE_PILOT_AGES_MS=8000,30000,40000,45000,50000,55000,60000,90000,120000`**

These are **experiment observation ages**, NOT candidate production retry constants.

### Why dense 30–60s

Historical evidence only bounds the transition between 30s (zero) and 60s (non-zero) for two settlement windows. Dense probes resolve the censored interval without claiming point-estimate precision.

---

## 7. Window selection — no cherry picking

**`DETERMINISTIC_WINDOW_SELECTION_REQUIRED=YES`**

### Initial canary identity (design reference)

| Field | Value |
|-------|-------|
| Vehicle | KS MX 2024 |
| `organizationId` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `vehicleId` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| Expected token | `187336` |

Future implementation **must** resolve current token authority and **fail closed** on identity mismatch.

### Enrollment rules

- No operator manual selection of "interesting" windows only
- Deterministic eligibility from independent runtime evidence
- **Do not** use the historical query under test to decide enrollment for that same window (avoid selection-on-outcome)

### Activity stratification

**`ACTIVITY_STRATIFICATION_REQUIRED=YES`**

| Cohort | Definition (design) |
|--------|---------------------|
| `ACTIVE_MOTION` | Independent movement authority indicates sustained valid movement in window vicinity |
| `ACTIVE_IDLE` | Vehicle active session but no sustained movement |
| `UNKNOWN_ACTIVITY` | Movement authority unavailable or ambiguous |

Use existing canonical physical/movement telemetry authority where available. Stratify maturation interpretation; do not silently mix cohorts.

---

## 8. All-zero window handling

A window may remain zero at every age. This is **not** automatically "slow maturation."

### Terminal classifications (after complete schedule)

| Class | Meaning |
|-------|---------|
| `EVENTUAL_NONZERO` | At least one age returned data |
| `PERSISTENT_EMPTY_THROUGH_SHADOW_HORIZON` | Zero through 120s |
| `PROVIDER_ERROR_CONTAMINATED` | Errors dominate schedule |
| `STRUCTURAL_EXCLUDED` | Session geometry / structural exclusion |
| `INVALID_IDENTITY` | Token/vehicle mismatch |
| `OTHER_FAIL_CLOSED` | Unclassified — fail closed |

### Dual denominators

| Denominator | Use |
|-------------|-----|
| `ALL_ELIGIBLE_WINDOWS` | Unconditional availability curve |
| `EVENTUAL_NONZERO_WINDOWS` | Conditional maturation curve |

Never silently discard all-zero windows. Never let them distort conditional distributions without labeling denominator.

---

## 9. Observation schema (per age)

Each immutable age observation persists:

### Identity

- `shadowWindowId`
- `organizationId`, `vehicleId`, `tokenId`
- `signalLane` (`HF_FAST_LOOP` | `SETTLEMENT_SHADOW`)
- `signalSetVersion`
- `queryGeometryMs`
- `windowFrom`, `windowTo`

### Age semantics

- `plannedAgeMs`, `actualAgeMs`, `schedulerDriftMs`
- `requestStartedAt`, `requestCompletedAt`, `requestDurationMs`

### Provider outcome

- `providerRequestSucceeded`
- `providerStatus`
- `providerErrorClass`
- `rawRowCount`

### Bucket / identity metrics

- `uniqueExactBucketIdentityCount`
- `uniqueTemporalBucketStartCount`
- `perFieldRowCount`, `perFieldBucketCount`
- `firstProviderTimestamp`, `lastProviderTimestamp`
- `exactBucketIdentities` or deterministic hash/manifest
- `newExactIdentitiesVsPriorAge`
- `missingPriorIdentitiesAtThisAge`
- `cumulativeUnionIdentityCount`

### Quality

- `payloadRevisionCount`, `duplicateCount`
- `nearestPriorAgeBucketDeltaMs` (per field, diagnostic)
- `queryProvenance` (no secrets)

---

## 10. Completeness / maturation metrics (window-level)

After all age probes complete:

### A. Availability

- `firstObservedNonZeroPlannedAge`
- `firstObservedNonZeroActualAge`
- `nonZeroTransitionInterval` (interval-censored)

### B. Information maturation

- Union of all exact bucket identities across all ages = **`FINAL_SHADOW_OBSERVED_UNION`**
- Per age: `exactIdentityCoverageRatioVsFinalObservedUnion`
- Per age: `newIdentityGainAtAge`

**`FINAL_SHADOW_OBSERVED_UNION_IS_GROUND_TRUTH=NO`** — provider data could theoretically change later.

### C. Per-field maturation

Same calculations independently per `providerField`.

### D. Stability

Whether new identities continue appearing after 60s / 90s / 120s.

---

## 11. Sub-second bucket alignment

Frozen TGR evidence: target `.945Z`, provider neighbor `.445Z`.

| Requirement | Value |
|-------------|-------|
| `PERSISTENCE_IDENTITY_EXACT` | **YES** |
| `FUZZY_PERSISTENCE_MERGE_ALLOWED` | **NO** |
| `TIMESTAMP_OFFSET_DISTRIBUTION_CAPTURED` | **YES** |

Capture `nearestPriorAgeBucketDeltaMs` per field across repeated age observations. Build empirical offset distribution.

**Do not** define a 500ms tolerance from one historical case. Future tolerance, if any, must be derived from observed distribution and used only by gap **detection** unless separately authorized for persistence.

**`PERSISTENCE_IDENTITY_TOLERANCE_CHANGE_REQUIRED=NO`**  
**`GAP_DETECTION_MATCHING_TOLERANCE_REQUIRES_DESIGN=YES`**

---

## 12. Shadow isolation from canonical store

**Observational only.** Shadow queries must NOT:

- write recovered samples into canonical sample store
- advance canonical data watermark
- advance canonical query coverage
- alter recovery cursor
- create or resolve `GAP_DEBT`
- change original slot results
- change Run 1 scientific evidence
- change trip enrichment
- change production cadence

| Flag | Value |
|------|-------|
| `SHADOW_WRITES_CANONICAL_SAMPLES` | **NO** |
| `SHADOW_ADVANCES_CANONICAL_COVERAGE` | **NO** |
| `SHADOW_PERFORMS_RECOVERY` | **NO** |

Future implementation requires an **isolated shadow persistence path**.

---

## 13. Durable shadow model (design only — no Prisma)

### Conceptual entities

**`Exp021MaturationShadowWindow`**

Unique authority prevents duplicate experiments for:

- vehicle + token + fixed window + signal lane + signal-set version + query geometry + shadow schedule version

**`Exp021MaturationShadowObservation`**

Unique per: `shadowWindowId` + `plannedAgeMs`

If provider call fails transiently, define explicitly:

| Retry type | Semantics |
|------------|-----------|
| Transport retry | Same scientific observation (idempotent) |
| Second scientific observation | New row with explicit linkage — not blurred |

### Window state machine (conceptual)

```
ENROLLED → SCHEDULED → PROBING → TERMINAL
```

Terminal: `COMPLETE` | `PERSISTENT_EMPTY` | `ERROR_EXHAUSTED` | `INVALID` | `STRUCTURAL_EXCLUDED`

### Retention

Shadow observations retained for evidence freeze and curve derivation; not merged into canonical telemetry.

---

## 14. Multi-replica safety

**`PREFERRED_SHADOW_SCHEDULING_ARCHITECTURE=BullMQ deterministic delayed jobs + DB uniqueness constraints`**

Repository-native pattern aligned with existing `reference-capture-settlement-shadow` BullMQ scheduling.

**`MULTI_REPLICA_DUPLICATE_EXECUTION_PREVENTED_BY=`**

- deterministic BullMQ job IDs (window + lane + geometry + plannedAge)
- DB unique constraints on shadow window and observation
- idempotent observation upsert
- fail-closed on duplicate age execution beyond idempotent replay

Do **not** reuse EXP-021 cadence allocation locks as shadow scientific authority unless proven semantically correct.

**`FLEET_AUTO_SAMPLER_COUPLED_TO_SHADOW=NO`**

---

## 15. Scheduler drift

Because planned ages differ by only 5s (40/45/50/55/60), scheduler accuracy matters.

Store `plannedAgeMs`, `actualAgeMs`, `schedulerDriftMs` on every observation.

Never assign an observation scientifically to 45s if it actually ran at 53s without retaining truth.

Assess BullMQ precision during pilot Stage 2. If insufficient, recommend alternative scheduling (e.g. tighter leader-scheduled tick with drift capture).

---

## 16. Gap detection boundary (informs future TGR, not this experiment)

| Level | Supported |
|-------|-----------|
| Exact missing bucket timestamp | **NO** |
| Bounded suspicious temporal region | **PARTIAL** |
| Generic sparse coverage | YES (safest) |

**`FALSE_POSITIVE_RISK=MEDIUM_HIGH`** when relying on regular 1 Hz assumptions or bucket count alone.

---

## 17. Empirical curve output (future run)

Per lane / geometry / activity cohort:

| Output | Description |
|--------|-------------|
| `plannedAge` | Schedule stratum |
| `median actualAge` | Executed age |
| `N eligible` | Enrollment denominator |
| `N provider-success` | HTTP/provider success |
| `N nonzero` | Non-zero bucket count |
| `nonzero proportion` | With 95% CI (Wilson or exact) |
| `median exact bucket count` | |
| `median cumulative union coverage` | vs final shadow-observed union |
| `P25/P75 coverage` | |
| `median new identities gained` | |
| per-field summaries | |
| interval-censored first availability | distribution |

**No ranking. No cadence selection.**

---

## 18. Pilot sample size

Do not invent false precision.

| Parameter | Recommendation |
|-----------|----------------|
| `PILOT_MIN_VALID_WINDOWS` | **30** — validate shadow mechanics |
| `PILOT_TARGET_VALID_WINDOWS` | **60** — observe maturation shape |
| `FLEET_VALIDATION_TARGET_WINDOWS` | **200** — later fleet validation phase |

**`SAMPLE_SIZE_IS_FINAL_PRODUCTION_AUTHORITY=NO`**

Pilot purpose: validate mechanics, observe maturation shape, detect gross age differences.  
With n=60 and p=0.5, 95% CI width ≈ ±13pp — sufficient for shape, not production policy.

Fleet validation (200+ windows) enables narrower CIs for future retry-age decisions.

---

## 19. Future retry-age rule (not in this design)

After sufficient live shadow evidence, a **separate** decision may consider:

- earliest age with acceptable P(non-zero)
- acceptable fraction of final shadow-observed union
- bounded later incremental gain

Do **not** encode thresholds (95%, 99%, 100%) without evidence/product requirement.

**`PRODUCTION_RETRY_AGE_SELECTED=NO`**

---

## 20. TGR Option C interaction

Future architecture remains:

**Gap Debt + during-trip maturation-aware targeted requery + post-trip bounded reconciliation**

Live Maturation Shadow informs **only**:

- `firstEligibleRetryAt` policy
- potentially retry timing schedule

It does **not** implement Gap Debt, retry, or post-trip reconciliation in this design.

**`PRIMARY_DEMONSTRATED_RECOVERY_LEVER=MATURATION_AWARE_TARGETED_REQUERY`**

Micro-window fragmentation remains optional for `PARTIAL_TEMPORAL_COVERAGE` only if later evidence supports it.

---

## 21. Fleet auto-sampler separation

Shadow completely separate from:

- study enrollment / plan allocation
- 90→60 / 60→90 order balance
- `StudyRun` / physical T0
- lifecycle driver
- cadence recommendation

Stage-1A must not be modified.

Same vehicle may be observed by both systems; scientific identities and persistence remain separate.

---

## 22. Feature flags (design only)

| Flag | Default |
|------|---------|
| `EXP021_MATURATION_SHADOW_ENABLED` | `false` |
| single-token allowlist | `187336` (KS MX 2024) when enabled |
| per-lane enable flags | both off by default |
| `max active windows` | bounded (e.g. 10 concurrent) |
| `schedule version` | `MATURATION_SHADOW_SCHEDULE_v1` |

Do not add env variables in this PR.

---

## 23. Canary rollout (design sequence only)

| Stage | Action |
|-------|--------|
| 0 | Code deployed, shadow disabled |
| 1 | KS MX 2024 only |
| 2 | Validate mechanics / no canonical interference |
| 3 | Other fleet vehicles only after identity + HF-policy readiness |
| 4 | Fleet validation collection |

No activation in this task.

---

## 24. Fail-closed conditions

| Condition | Action |
|-----------|--------|
| Token identity mismatch | Abort window |
| Signal registry mismatch | Abort window |
| Query builder mismatch | Abort window |
| Duplicate shadow window authority | Reject enrollment |
| Duplicate age execution (non-idempotent) | Fail closed |
| Provider authentication failure | Mark contaminated |
| Provider schema drift | Fail closed |
| Canonical-store write attempt | Hard fail |
| Canonical watermark change | Hard fail |
| Scheduler age-order corruption | Flag + exclude from curves |
| Mixed runtime version (if relevant) | Stratify or exclude |

No hidden repair of observations.

---

## 25. Future implementation sequence (not this PR)

| PR | Scope | Default |
|----|-------|---------|
| PR-M1 | Durable shadow schema + types + unit tests | disabled |
| PR-M2 | Shadow scheduler/worker | disabled |
| PR-M3 | Observational metrics/export | disabled |
| DEPLOY GATE | Deploy with shadow disabled | — |
| ACTIVATION GATE | Single token KS MX 2024 | — |
| COLLECTION GATE | Collect pilot | — |
| EVIDENCE FREEZE | Freeze live maturation results | — |
| **THEN** | Design actual TGR retry policy | — |

---

## 26. Raw vs recovered science

**`RAW_AND_RECOVERED_METRICS_SEPARATE=YES`**

### RAW_BASELINE

- `baselineBucketCount`
- `baselineRequestCount`
- `baselineZeroCount`
- `baselineTemporalCoverage`

### RECOVERY (future TGR)

- `recoveredBucketCount`
- `recoveryRequestCount`
- `gapDebtCreatedCount`
- `gapDebtRecoveredCount`
- `gapDebtPersistentCount`
- `timeToRecoveryMs`

Recovery must **never** rewrite original slot outcome/provenance.

---

## 27. Architecture flow

```
NORMAL VEHICLE ACTIVITY
        ↓
DETERMINISTIC WINDOW ENROLLMENT
 (fail-closed identity, activity stratification)
        ↓
FIXED [windowFrom, windowTo]
 (same across all ages; geometry stratum 60s or 90s)
        ↓
DELAYED SHADOW PROBES
 policy-delay(8s) / 30 / 40 / 45 / 50 / 55 / 60 / 90 / 120
        ↓
┌───────────────────────┐     ┌────────────────────────┐
│  HF_FAST_LOOP lane     │     │  SETTLEMENT_SHADOW lane │
│  (preflight-resolved) │     │  (manifest 33 fields)   │
└───────────┬───────────┘     └────────────┬───────────┘
            │                              │
            └──────────┬───────────────────┘
                       ↓
         ISOLATED SHADOW OBSERVATIONS
    (no canonical writes, no coverage advance)
                       ↓
              TERMINAL SHADOW WINDOW
                       ↓
   availability + information-maturation analysis
   (interval-censored, per-lane, per-geometry)
                       ↓
        NO canonical recovery
        NO cadence change
        NO production retry age selection
```

---

## 28. Preserved scientific authorities (unchanged)

| Field | Value |
|-------|-------|
| `ORIGINAL_RUN1_90_SLOT_SUCCESS` | 7/7 |
| `ORIGINAL_RUN1_60_SLOT_SUCCESS` | 9/10 |
| `OVERALL_DIRECTIONAL_SIGNAL` | LEAN_60 |
| `RECOMMENDED_CADENCE_MS` | NONE |
| `PRODUCTION_CADENCE_CHANGE_AUTHORIZED` | NO |

Settlement maturation authority (SETTLEMENT_SHADOW only — do not generalize to HF_FAST_LOOP):

- SP-60-T0: 30s ZERO → 60s+ SUCCESS
- SP-90-T16: 30s ZERO → 60s+ SUCCESS

---

## 29. Query coverage / gap debt (current main authority)

A successful provider query + persistence commit advances **QUERY_COVERAGE**, including legitimate ZERO_RESULT.

This does **not** mean data was obtained.

Conceptual separation required:

| Authority | Meaning |
|-----------|---------|
| `QUERY_COVERAGE` | Provider was queried for this region |
| `DATA_COVERAGE` | Provider returned durable temporal data |
| `GAP_DEBT` | Queried region remains scientifically unresolved/recoverable |

**`SEPARATE_GAP_DEBT_AUTHORITY_REQUIRED=YES`**

No schema implementation in this design PR.
