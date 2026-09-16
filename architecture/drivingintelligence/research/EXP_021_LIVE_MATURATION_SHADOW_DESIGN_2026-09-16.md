# EXP-021 — Live Maturation Shadow Design

**Design date:** 2026-09-16  
**Hardening revision:** 2026-09-16 (scientific identity + attempt provenance + sampling unit + uniqueness closure)  
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
| `SUFFICIENT_COMPLETENESS_THRESHOLD_DEFINED` | **NO** |
| `P_SUFFICIENTLY_COMPLETE_ESTIMABLE_NOW` | **NO** |
| `BUCKET_LOCUS_AND_PAYLOAD_REVISION_SEPARATED` | **YES** |
| `COVERAGE_USES_BUCKET_LOCUS_IDENTITY` | **YES** |
| `SIGNAL_SET_FROZEN_AT_WINDOW_ENROLLMENT` | **YES** |
| `SIGNAL_SET_HASH_REQUIRED` | **YES** |
| `QUERY_SEMANTICS_FROZEN_PER_WINDOW` | **YES** |
| `MIXED_RUNTIME_WINDOW_FAILS_PRIMARY_CURVE_CLOSED` | **YES** |
| `WINDOW_FAMILY_REQUIRED` | **YES** |
| `PRIMARY_SAMPLING_UNIT` | **WINDOW_FAMILY** |
| `PAIRED_GEOMETRY_ANALYSIS_REQUIRED` | **YES** |
| `ACTIVITY_CLASSIFICATION_GEOMETRY_SPECIFIC` | **YES** |
| `PROVIDER_ERROR_COUNTS_AS_ZERO` | **NO** |
| `ERROR_AGE_NARROWS_TRANSITION_INTERVAL` | **NO** |
| `IMMUTABLE_ATTEMPT_LEDGER_REQUIRED` | **YES** |
| `FAILED_ATTEMPT_OVERWRITE_ALLOWED` | **NO** |
| `CODE_DEFAULT_HF_SETTLEMENT_DELAY_MS` | **8000** |
| `EFFECTIVE_RUNTIME_POLICY_DELAY_RESOLUTION_REQUIRED` | **YES** |
| `AGE_SCHEDULE_FROZEN_PER_FAMILY` | **YES** |
| `MATURATION_ORDER_USES_ACTUAL_AGE` | **YES** |
| `DEDICATED_SHADOW_QUEUE_REQUIRED` | **YES** |
| `CANONICAL_ACQUISITION_PRIORITY_PRESERVED` | **YES** |
| `SHADOW_PROVIDER_CONCURRENCY_BOUNDED` | **YES** |
| `SAMPLE_SIZE_UNIT` | **WINDOW_FAMILY** |
| `PER_STRATUM_N_REPORTED` | **YES** |
| `FINAL_POLICY_POWER_ANALYSIS_DEFERRED` | **YES** |
| `ENROLLMENT_EVENT_ID_IS_UNIQUENESS_COMPONENT` | **NO** |
| `ENROLLMENT_EVENT_ID_IS_PROVENANCE_ONLY` | **YES** |
| `SIGNAL_SET_HASH_IS_STRATUM_UNIQUENESS_COMPONENT` | **NO** |
| `SIGNAL_SET_HASH_IS_IMMUTABLE_STRATUM_ATTRIBUTE` | **YES** |
| `SEMANTIC_DRIFT_CREATES_NEW_STRATUM` | **NO** |
| `TRANSPORT_RETRY_CREATES_NEW_SLOT` | **NO** |
| `TRANSPORT_RETRY_CREATES_NEW_ATTEMPT` | **YES** |
| `JOB_ID_DEPENDS_ON_ENROLLMENT_EVENT_ID` | **NO** |

---

## 1. Scientific question

### Primary question

> When does a **fixed** DIMO historical window become available, and how does **bucket-locus information coverage** mature relative to the final shadow-observed union, after the end of that window?

This experiment is required **before** choosing any production TGR retry age.

### Primary estimands (must not be conflated)

**Estimand A — Availability:**

```
P(non-zero provider data | actualAgeMs)
```

**Estimand B — Information maturation:**

Distribution of `bucketLocusCoverageRatioVsFinalObservedUnion` by `actualAgeMs`, including:

- median
- P25
- P75
- new bucket-locus gain at age
- per-field bucket-locus coverage

Use **`FINAL_SHADOW_OBSERVED_UNION`** as observational denominator only.

**`FINAL_SHADOW_OBSERVED_UNION_IS_GROUND_TRUTH=NO`** — provider data could theoretically change later.

### Secondary estimand

**Payload revision / stability** by `actualAgeMs` — detect provider payload evolution at the same bucket locus (see §2).

### Explicitly deferred estimand

A product/scientific threshold for "sufficiently complete" does **not** exist yet.

| Flag | Value |
|------|-------|
| `SUFFICIENT_COMPLETENESS_THRESHOLD_DEFINED` | **NO** |
| `P_SUFFICIENTLY_COMPLETE_ESTIMABLE_NOW` | **NO** |

Future policy **may** later define `SUFFICIENT_COMPLETENESS_THRESHOLD` and transform information-coverage curves into a "sufficiently complete" probability. Do **not** encode 95%, 99%, 100%, or similar thresholds in this design.

Non-zero availability ≠ information completeness. A query may return some bucket loci at 30s but additional bucket loci at 40/45/50/55/60/90/120s.

### Required measurements

| Metric family | Description |
|---------------|-------------|
| `FIRST_NONZERO` | First `actualAgeMs` where any field returns non-zero rows (provider success required) |
| `CUMULATIVE_INFORMATION_MATURATION` | Growth of **bucket-locus** union across ages |

Do **not** reduce maturation to boolean ZERO/SUCCESS only.

### Interval-censored language

Historical settlement evidence interval-censors maturation:

- 30s = observed zero (provider success)
- 60s = observed non-zero (provider success)

Therefore the true availability transition occurred **after 30s and at or before 60s** for those two settlement windows.

If a future shadow shows 30s zero, 40s zero, 45s non-zero (all provider-success), the correct scientific statement is:

> transition interval = **(40s, 45s]**

NOT: "data arrived at exactly 45s."

**`INTERVAL_CENSORED_MATURATION_ANALYSIS_REQUIRED=YES`**

### Provider error is not zero evidence

A provider/network/auth/transport failure at an age does **not** imply `ZERO_RESULT` and does **not** provide negative availability evidence.

For interval-censored transition:

| Term | Definition |
|------|------------|
| `lastNegativeAge` | Latest earlier age with `providerRequestSucceeded=true` AND valid zero result |
| `firstPositiveAge` | First later age with `providerRequestSucceeded=true` AND non-zero data |

Example:

| Age | Outcome |
|-----|---------|
| 30s | ZERO (success) |
| 40s | provider error |
| 45s | NONZERO (success) |

Correct transition interval: **(30s, 45s]** — NOT **(40s, 45s]**.

**`PROVIDER_ERROR_COUNTS_AS_ZERO=NO`**  
**`ERROR_AGE_NARROWS_TRANSITION_INTERVAL=NO`**

### Independence constraints

Maturation shadow must be separate from:

- polling cadence
- query-window size (except controlled geometry strata within a window family)
- micro-window fragmentation
- EXP-021 cadence allocation
- recovery execution

**`CROSS_LANE_MATURATION_INFERENCE_ALLOWED=NO`**  
**`ONE_GLOBAL_DIMO_MATURATION_CURVE_ALLOWED=NO`**

---

## 2. Bucket locus identity vs payload revision identity

Current "exact bucket identity" language risks conflating:

1. new temporal/provider coverage
2. changed payload at the same provider field + timestamp

Define **two distinct identities**.

### A. Bucket locus identity

Conceptual components:

- `providerField`
- `providerTimestamp`
- `interval`
- `aggregation`
- `identityVersion`

**NO normalized value** in locus identity.

Purpose: temporal/information coverage maturation.

### B. Payload revision identity

Conceptual components:

- `bucketLocusIdentity`
- normalized/raw value fingerprint
- revision semantics

Purpose: detect provider payload evolution at the same locus.

### Coverage authority

Future completeness metrics **must** use:

```
UNIQUE_BUCKET_LOCUS_UNION
```

not payload-revision union.

Persist separately:

| Metric | Role |
|--------|------|
| `uniqueBucketLocusCount` | Per-age locus count |
| `newBucketLociVsPriorAge` | Locus gain at age |
| `cumulativeBucketLocusUnionCount` | Running union |
| `bucketLocusCoverageRatioVsFinalObservedUnion` | Coverage vs final shadow-observed union |
| `payloadRevisionCount` | Payload revisions detected |
| `changedPayloadLocusCount` | Loci with changed payload at same timestamp |

**`BUCKET_LOCUS_AND_PAYLOAD_REVISION_SEPARATED=YES`**  
**`COVERAGE_USES_BUCKET_LOCUS_IDENTITY=YES`**

Do **not** change canonical persistence identity in this design PR. Sub-second bucket alignment rules (§12) remain on exact locus identity for gap-detection authority; coverage maturation uses bucket-locus union.

---

## 3. Canonical window age definition

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

Post-hoc maturation calculations must sort by **`actualAgeMs`**, not execution order, when computing `newBucketLociVsPriorAge` or interval-censored transitions. If two successful attempts have nearly equal or out-of-order ages, preserve both and apply deterministic analysis rules.

**`CANONICAL_WINDOW_AGE_DEFINITION=provider_request_started_at_ms - fixed_window_to_ms`**  
**`MATURATION_ORDER_USES_ACTUAL_AGE=YES`**

---

## 4. Fixed query window invariant

For a single shadow **stratum** within a window family, **all** maturation observations use the exact same:

- vehicle/token identity
- `windowFrom`
- `windowTo`
- frozen signal-set snapshot (lane-specific; see §5)
- interval (`1s`)
- aggregation (`AVG`)
- frozen provider method / query builder semantics
- frozen query boundary semantics

Only request time / age changes.

Example: fixed `[from, to]` queried at ages A, B, C, …

**Never** slide `from` or `to` between age probes.  
**Never** turn repeated age probes into moving fast-loop windows.

**`SAME_WINDOW_ACROSS_AGES=YES`**

---

## 5. Frozen signal set and query semantics per window

The label `RUNTIME_PREFLIGHT_HF_HISTORICAL@enrollment` is **not** sufficient as immutable scientific identity.

At shadow-window-family enrollment, **freeze** and persist:

| Frozen field | Required |
|--------------|----------|
| `resolvedProviderFields` | YES |
| `resolvedProviderFieldsCanonicalSorted` | YES |
| `signalSetHash` | YES |
| Signal registry version/hash | YES |
| Manifest version/hash (SETTLEMENT_SHADOW) | where applicable |
| Query `interval` | YES |
| Query `aggregation` | YES |
| Query-builder semantic version/hash | YES |
| Query-boundary semantic version | YES |
| `runtimeBuildShaAtEnrollment` | YES |

For **SETTLEMENT_SHADOW** also freeze:

- manifest identifier
- manifest SHA/hash
- exact canonical provider-field list

All later age probes for one scientific stratum **must** use the frozen snapshot. Do **not** dynamically re-resolve signal fields for each age.

If implementation cannot execute the frozen semantics after code drift: **fail the scientific window closed**. Do not silently substitute current semantics.

**`SIGNAL_SET_FROZEN_AT_WINDOW_ENROLLMENT=YES`**  
**`SIGNAL_SET_HASH_REQUIRED=YES`**  
**`QUERY_SEMANTICS_FROZEN_PER_WINDOW=YES`**

### Lane A: HF_FAST_LOOP

**Current-main resolution (not blind copy of Run 1):**

At shadow window-family enrollment, resolve HF signal set from:

1. Vehicle preflight `broadObservationFields`
2. `buildAcquisitionCyclePlan()` → `HF_HISTORICAL` surface `providerFields`
3. Filter: `temporalClass ∈ {WAVEFORM_DYNAMICS, POWERTRAIN_DYNAMIC}` AND `historicalSupported === true`

Then freeze per §5 above. Run 1 field count is historical reference only.

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
| `HF_SIGNAL_SET_VERSION` | Frozen `signalSetHash` at enrollment |
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

## 6. Window family — primary sampling unit

60s and 90s query geometries ending at the same `windowTo`, and HF / Settlement lanes around the same vehicle-time anchor, are **correlated repeated measurements**. They must **not** be treated as independent biological/scientific sampling units.

### Entity: `Exp021MaturationShadowWindowFamily`

(or repository-consistent equivalent)

Family authority (conceptual):

| Field | Role |
|-------|------|
| `organizationId` | Tenant scope |
| `vehicleId` | Vehicle |
| `tokenId` | DIMO token |
| `canonicalWindowTo` | Shared end anchor |
| `shadowScheduleVersion` | Frozen age schedule / intentional re-experiment version |
| `enrollmentEventId` | Enrollment provenance only — **not** a uniqueness component |

### Canonical family scientific uniqueness

Preferred conceptual constraint:

```
UNIQUE(
  organizationId,
  vehicleId,
  tokenId,
  canonicalWindowTo,
  shadowScheduleVersion
)
```

`enrollmentEventId` must **not** participate in the family unique constraint. A new enrollment event ID must **not** permit a duplicate scientific family for the same vehicle/window/schedule version.

If duplicate family enrollment is attempted: return the existing canonical family or fail idempotently per future implementation contract. Never create a second scientific family merely because a new `enrollmentEventId` exists.

**`ENROLLMENT_EVENT_ID_IS_UNIQUENESS_COMPONENT=NO`**  
**`ENROLLMENT_EVENT_ID_IS_PROVENANCE_ONLY=YES`**

### Intentional re-experiment versioning

If the same physical historical anchor is intentionally studied again under different experimental semantics, do **not** bypass uniqueness with a new `enrollmentEventId`. Use explicit scientific version authority:

- `shadowScheduleVersion` (required)

Any such version must be deliberate and persisted. Do not add additional version fields unless a future design explicitly requires them.

Within one family, create **strata**:

| Stratum | Geometry | Lane |
|---------|----------|------|
| HF × 60s | 60000 ms | HF_FAST_LOOP |
| HF × 90s | 90000 ms | HF_FAST_LOOP |
| SETTLEMENT × 60s | 60000 ms | SETTLEMENT_SHADOW |
| SETTLEMENT × 90s | 90000 ms | SETTLEMENT_SHADOW |

(where enabled)

Each stratum retains its own: `windowFrom`, `windowTo`, frozen signal snapshot, geometry, lane, observations.

### Canonical stratum scientific uniqueness

Preferred conceptual constraint:

```
UNIQUE(
  windowFamilyId,
  signalLane,
  queryGeometryMs
)
```

Do **not** allow a changed `signalSetHash` to create a second semantic stratum. Freeze as immutable scientific attributes on the stratum (set at enrollment, verified on every attempt):

- `signalSetHash`
- `querySemanticsHash`
- `resolvedProviderFields`
- `interval`
- `aggregation`
- boundary semantics

If a later execution resolves a conflicting hash or semantics: **fail closed** as semantic drift. Do **not** create another stratum.

**`SIGNAL_SET_HASH_IS_STRATUM_UNIQUENESS_COMPONENT=NO`**  
**`SIGNAL_SET_HASH_IS_IMMUTABLE_STRATUM_ATTRIBUTE=YES`**  
**`SEMANTIC_DRIFT_CREATES_NEW_STRATUM=NO`**

**`WINDOW_FAMILY_REQUIRED=YES`**  
**`PRIMARY_SAMPLING_UNIT=WINDOW_FAMILY`**  
**`PAIRED_GEOMETRY_ANALYSIS_REQUIRED=YES`**

Geometry/lane comparison within a family must use paired/repeated-measures interpretation.

### Query geometry (not cadence)

| Geometry | Duration |
|----------|----------|
| `WINDOW_GEOMETRY_60S` | 60000 ms |
| `WINDOW_GEOMETRY_90S` | 90000 ms |

**`QUERY_GEOMETRIES_MS=60000,90000`**  
**`QUERY_GEOMETRY_IS_CADENCE_AUTHORITY=NO`**

Purpose: determine whether maturation behavior depends materially on query-range length.  
**Do not** use geometry results for cadence selection.

---

## 7. Age schedule — dense 30→60 resolution

### Policy delay terminology

| Term | Value / rule |
|------|----------------|
| `CODE_DEFAULT_HF_SETTLEMENT_DELAY_MS` | **8000** (engineering default in `reference-capture-hf-recovery-v2.policy.ts`) |
| `EFFECTIVE_RUNTIME_HF_SETTLEMENT_DELAY_MS` | **RESOLVE_AT_ACTIVATION** (`HF_SETTLEMENT_DELAY_MS` env override permitted in current code) |
| `POLICY_DELAY_PROBE_MS` | Effective runtime policy value at activation/enrollment — freeze into schedule version / window family |

Do **not** claim production effective value is 8000 from code default alone.

**`EFFECTIVE_RUNTIME_POLICY_DELAY_RESOLUTION_REQUIRED=YES`**

### Fixed scientific ages (ms)

```
30000, 40000, 45000, 50000, 55000, 60000, 90000, 120000
```

Plus **one** effective policy-delay probe at `POLICY_DELAY_PROBE_MS` if not duplicate of a fixed age.

**`DENSE_PILOT_AGES_MS=POLICY_DELAY_PROBE_MS,30000,40000,45000,50000,55000,60000,90000,120000`**

These are **experiment observation ages**, NOT candidate production retry constants.

### Age schedule frozen per family

Freeze on each window family:

| Field | Role |
|-------|------|
| `scheduleVersion` | Immutable schedule identity |
| `plannedAgesMsExact` | Exact planned ages for this family |
| `policyDelayProbeMs` | Resolved effective policy delay at enrollment |
| `createdUnderRuntimeSha` | Runtime SHA when schedule was created |

Do not allow env changes during an active window family to alter later ages.

**`AGE_SCHEDULE_FROZEN_PER_FAMILY=YES`**

### Why dense 30–60s

Historical evidence only bounds the transition between 30s (zero) and 60s (non-zero) for two settlement windows. Dense probes resolve the censored interval without claiming point-estimate precision.

---

## 8. Window selection — no cherry picking

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

### Activity stratification — geometry-aware

A 90s window contains 30s more historical time than a 60s window. One generic family activity label may be misleading.

Freeze independent activity metadata per geometry:

- `activityClass60s`
- `activityClass90s`

—or derive cohort from each exact `[windowFrom, windowTo]`.

Signal lane must **not** change activity classification for the same geometry. Use only independent movement authority. Do **not** use queried DIMO response-under-test to classify itself.

| Cohort | Definition (design) |
|--------|---------------------|
| `ACTIVE_MOTION` | Independent movement authority indicates sustained valid movement in window vicinity |
| `ACTIVE_IDLE` | Vehicle active session but no sustained movement |
| `UNKNOWN_ACTIVITY` | Movement authority unavailable or ambiguous |

**`ACTIVITY_STRATIFICATION_REQUIRED=YES`**  
**`ACTIVITY_CLASSIFICATION_GEOMETRY_SPECIFIC=YES`**

---

## 9. All-zero window handling

A window may remain zero at every **provider-success** age. This is **not** automatically "slow maturation."

### Terminal classifications (after complete schedule)

| Class | Meaning |
|-------|---------|
| `EVENTUAL_NONZERO` | At least one provider-success age returned data |
| `PERSISTENT_EMPTY_THROUGH_SHADOW_HORIZON` | Zero through 120s on all provider-success ages |
| `PROVIDER_ERROR_CONTAMINATED` | Errors dominate schedule |
| `STRUCTURAL_EXCLUDED` | Session geometry / structural exclusion |
| `INVALID_IDENTITY` | Token/vehicle mismatch |
| `MIXED_RUNTIME_SEMANTICS` | Incompatible runtime/query semantics within window (see §10) |
| `OTHER_FAIL_CLOSED` | Unclassified — fail closed |

### Dual denominators

| Denominator | Use |
|-------------|-----|
| `ALL_ELIGIBLE_WINDOW_FAMILIES` | Unconditional availability curve |
| `EVENTUAL_NONZERO_WINDOW_FAMILIES` | Conditional maturation curve |

Never silently discard all-zero families. Never let them distort conditional distributions without labeling denominator.

---

## 10. Mixed runtime version semantics

A shadow schedule can last until 120s and may overlap deployment.

Persist on **every** provider attempt:

- `runtimeBuildSha`
- `querySemanticsHash`
- `signalSetHash`

Primary curve eligibility requires all scientifically comparable age probes within a window stratum to use compatible frozen semantics.

### Terminal / quality classification: `MIXED_RUNTIME_SEMANTICS`

| Condition | Action |
|-----------|--------|
| Runtime SHA changes but query semantics and frozen signal/query semantics are provably byte/semantic equivalent | Retain observation with explicit provenance |
| Semantic equivalence cannot be proven | Exclude the affected window stratum from primary maturation curves |

Never rewrite or repair excluded windows.

**`MIXED_RUNTIME_WINDOW_FAILS_PRIMARY_CURVE_CLOSED=YES`**

---

## 11. Immutable attempt ledger

Scientific observation must not be conflated with idempotent observation upsert / transport retry.

### Entity hierarchy (four levels)

```
WindowFamily
  canonical scientific family identity
  └── WindowStratum
        one lane × geometry within family
        └── ObservationSlot
              one planned age within stratum
              └── ObservationAttempt
                    immutable provider call
```

Provenance IDs (e.g. `enrollmentEventId`) never substitute for scientific identity.

### ObservationSlot identity

Preferred conceptual constraint:

```
UNIQUE(
  windowStratumId,
  plannedAgeMs
)
```

- `windowStratumId`
- `plannedAgeMs`

A transport retry must **not** create a second slot. It creates another immutable `ObservationAttempt` under the same slot.

**`TRANSPORT_RETRY_CREATES_NEW_SLOT=NO`**  
**`TRANSPORT_RETRY_CREATES_NEW_ATTEMPT=YES`**

### ObservationAttempt — immutable per provider call

Persist per attempt:

| Field | Role |
|-------|------|
| `attemptId` | Unique attempt identity |
| `observationSlotId` | Parent slot |
| `attemptOrdinal` | 1, 2, … within slot |
| `plannedAgeMs` | Intended schedule stratum |
| `actualAgeMs` | Scientific authority |
| `schedulerDriftMs` | Drift from plan |
| `requestStartedAt` | Provider call start |
| `requestCompletedAt` | Provider call end |
| `runtimeBuildSha` | Runtime at attempt |
| `querySemanticsHash` | Frozen semantics hash |
| `signalSetHash` | Frozen signal set hash |
| `providerRequestSucceeded` | Transport/provider success |
| `providerStatus` | Provider status |
| `providerErrorClass` | Error taxonomy |
| Row/bucket/locus metrics | Per §2 |
| `queryProvenance` | No secrets |

Do **not** overwrite a failed first provider call with a later success.

Transport retry: same `ObservationSlot`, new immutable `ObservationAttempt`. A successful transport retry may occur at a later `actualAgeMs`. Analysis must retain that truth.

**`IMMUTABLE_ATTEMPT_LEDGER_REQUIRED=YES`**  
**`FAILED_ATTEMPT_OVERWRITE_ALLOWED=NO`**

### Retry scientific semantics

A transport retry is **not** automatically a valid observation at the originally planned age.

Example:

| Attempt | plannedAgeMs | actualAgeMs | Outcome |
|---------|--------------|-------------|---------|
| 1 | 45000 | 45300 | network failure |
| 2 | 45000 | 51000 | success / nonzero |

Do **not** claim: 45s = nonzero.

Scientific authority is `actualAgeMs` of the successful attempt. The failed 45.3s attempt contributes provider-reliability evidence but **not** availability-zero evidence.

---

## 12. Observation schema (per attempt)

Each immutable attempt persists the fields in §11 plus:

### Identity (stratum level)

- `shadowWindowFamilyId`
- `shadowWindowId` (stratum)
- `organizationId`, `vehicleId`, `tokenId`
- `signalLane` (`HF_FAST_LOOP` | `SETTLEMENT_SHADOW`)
- `signalSetHash`, `signalSetVersion`
- `queryGeometryMs`
- `windowFrom`, `windowTo`

### Bucket / locus metrics (per attempt)

- `uniqueBucketLocusCount`
- `uniqueTemporalBucketStartCount`
- `perFieldRowCount`, `perFieldBucketLocusCount`
- `firstProviderTimestamp`, `lastProviderTimestamp`
- `bucketLocusManifest` or deterministic hash
- `newBucketLociVsPriorAge` (computed post-hoc sorted by `actualAgeMs`)
- `missingPriorBucketLociAtThisAge`
- `cumulativeBucketLocusUnionCount`
- `payloadRevisionCount`, `changedPayloadLocusCount`

### Quality

- `duplicateCount`
- `nearestPriorAgeBucketDeltaMs` (per field, diagnostic)

---

## 13. Completeness / maturation metrics (stratum-level)

After all age probes complete for a stratum:

### A. Availability

- `firstObservedNonZeroPlannedAge`
- `firstObservedNonZeroActualAge`
- `nonZeroTransitionInterval` (interval-censored; provider errors excluded per §1)

### B. Information maturation

- Union of all bucket loci across all provider-success ages = **`FINAL_SHADOW_OBSERVED_UNION`**
- Per age: `bucketLocusCoverageRatioVsFinalObservedUnion`
- Per age: `newBucketLociVsPriorAge`
- Distribution summaries: median, P25, P75 by `actualAgeMs`

**`FINAL_SHADOW_OBSERVED_UNION_IS_GROUND_TRUTH=NO`**

### C. Per-field maturation

Same calculations independently per `providerField`.

### D. Payload stability (secondary)

- `payloadRevisionCount` by age
- `changedPayloadLocusCount` by age

### E. Stability

Whether new bucket loci continue appearing after 60s / 90s / 120s.

---

## 14. Sub-second bucket alignment

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

## 15. Shadow isolation from canonical store

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

## 16. Query load / canonical non-interference

One fully enabled window family can produce:

```
2 lanes × 2 geometries × up to 9 age strata
```

before transport retries.

Design future runtime isolation:

| Requirement | Value |
|-------------|-------|
| Dedicated BullMQ shadow queue | **YES** |
| Bounded worker concurrency | **YES** |
| Bounded active window families | **YES** |
| Separate provider request budget | **YES** |
| Priority relative to canonical acquisition | lower or equal-safe |

Shadow backlog must **never** delay canonical HF/reference-capture acquisition.

No activation values required yet.

**`DEDICATED_SHADOW_QUEUE_REQUIRED=YES`**  
**`CANONICAL_ACQUISITION_PRIORITY_PRESERVED=YES`**  
**`SHADOW_PROVIDER_CONCURRENCY_BOUNDED=YES`**

---

## 17. Durable shadow model (design only — no Prisma)

### Conceptual entities

**`Exp021MaturationShadowWindowFamily`**

Canonical scientific family identity. Unique constraint:

```
UNIQUE(organizationId, vehicleId, tokenId, canonicalWindowTo, shadowScheduleVersion)
```

`enrollmentEventId` is provenance only — stored, not part of uniqueness.

**`Exp021MaturationShadowWindow`** (stratum)

One lane × geometry within a family. Unique constraint:

```
UNIQUE(windowFamilyId, signalLane, queryGeometryMs)
```

Immutable stratum attributes (not uniqueness components): `signalSetHash`, `querySemanticsHash`, `resolvedProviderFields`, `interval`, `aggregation`, boundary semantics. Semantic drift → fail closed; do not create a new stratum.

**`Exp021MaturationShadowObservationSlot`**

One planned age within a stratum. Unique constraint:

```
UNIQUE(windowStratumId, plannedAgeMs)
```

**`Exp021MaturationShadowObservationAttempt`**

Immutable per provider call; multiple attempts per slot allowed for transport retry. Transport retry creates a new attempt, not a new slot.

### Window state machine (conceptual)

```
ENROLLED → SCHEDULED → PROBING → TERMINAL
```

Terminal: `COMPLETE` | `PERSISTENT_EMPTY` | `ERROR_EXHAUSTED` | `INVALID` | `STRUCTURAL_EXCLUDED` | `MIXED_RUNTIME_SEMANTICS`

### Retention

Shadow observations retained for evidence freeze and curve derivation; not merged into canonical telemetry.

---

## 18. Multi-replica safety

**`PREFERRED_SHADOW_SCHEDULING_ARCHITECTURE=BullMQ deterministic delayed jobs + DB uniqueness constraints`**

Repository-native pattern aligned with existing `reference-capture-settlement-shadow` BullMQ scheduling, on a **dedicated shadow queue** (§16).

**`MULTI_REPLICA_DUPLICATE_EXECUTION_PREVENTED_BY=`**

- deterministic BullMQ job IDs derived from canonical family identity + stratum lane + geometry + `plannedAgeMs` (or deterministic equivalent: `familyId` / `stratumId` / `plannedAgeMs`)
- DB unique constraints on family, stratum, observation slot per §17
- immutable attempt insert (no overwrite of failed attempts)
- fail-closed on duplicate age execution beyond idempotent job replay

Job IDs must **not** depend on `enrollmentEventId` or any random per-enrollment identifier.

**`JOB_ID_DEPENDS_ON_ENROLLMENT_EVENT_ID=NO`**

Do **not** reuse EXP-021 cadence allocation locks as shadow scientific authority unless proven semantically correct.

**`FLEET_AUTO_SAMPLER_COUPLED_TO_SHADOW=NO`**

---

## 19. Scheduler drift

Because planned ages differ by only 5s (40/45/50/55/60), scheduler accuracy matters.

Store `plannedAgeMs`, `actualAgeMs`, `schedulerDriftMs` on every attempt.

Never assign an observation scientifically to 45s if it actually ran at 53s without retaining truth.

If jobs execute out of planned order, do **not** silently compute `newBucketLociVsPriorAge` in execution order. Sort by `actualAgeMs` while preserving planned stratum.

Assess BullMQ precision during pilot Stage 2. If insufficient, recommend alternative scheduling (e.g. tighter leader-scheduled tick with drift capture).

---

## 20. Gap detection boundary (informs future TGR, not this experiment)

| Level | Supported |
|-------|-----------|
| Exact missing bucket timestamp | **NO** |
| Bounded suspicious temporal region | **PARTIAL** |
| Generic sparse coverage | YES (safest) |

**`FALSE_POSITIVE_RISK=MEDIUM_HIGH`** when relying on regular 1 Hz assumptions or bucket count alone.

---

## 21. Empirical curve output (future run)

Per lane / geometry / activity cohort (report **actual N per stratum**):

| Output | Description |
|--------|-------------|
| `plannedAge` | Schedule stratum |
| `median actualAge` | Executed age |
| `N eligible window families` | Enrollment denominator |
| `N provider-success attempts` | HTTP/provider success |
| `N nonzero` | Non-zero bucket-locus count |
| `nonzero proportion` | With 95% CI (Wilson or exact) |
| `median bucket-locus count` | |
| `median cumulative locus coverage` | vs final shadow-observed union |
| `P25/P75 locus coverage` | |
| `median new bucket loci gained` | |
| per-field summaries | |
| interval-censored first availability | distribution (provider errors excluded) |
| payload revision rate | secondary |

**No ranking. No cadence selection.**

---

## 22. Pilot sample size

Do not invent false precision. Sample sizes are **window families**, not lane×geometry records.

| Parameter | Recommendation |
|-----------|----------------|
| `PILOT_MIN_VALID_WINDOW_FAMILIES` | **30** — validate shadow mechanics |
| `PILOT_TARGET_VALID_WINDOW_FAMILIES` | **60** — observe maturation shape |
| `FLEET_VALIDATION_TARGET_WINDOW_FAMILIES` | **200** — later fleet validation phase |

These are **not** power-calculated final policy sample sizes. Activity/lane/geometry stratification reduces per-stratum N. Report actual N per stratum. Do **not** claim all strata have n=60 or n=200.

**`SAMPLE_SIZE_UNIT=WINDOW_FAMILY`**  
**`PER_STRATUM_N_REPORTED=YES`**  
**`FINAL_POLICY_POWER_ANALYSIS_DEFERRED=YES`**  
**`SAMPLE_SIZE_IS_FINAL_PRODUCTION_AUTHORITY=NO`**

Pilot purpose: validate mechanics, observe maturation shape, detect gross age differences.  
With n=60 families and p=0.5, 95% CI width ≈ ±13pp — sufficient for shape exploration, not production policy.

Fleet validation (200+ window families) enables narrower CIs for future retry-age decisions after separate power analysis.

---

## 23. Future retry-age rule (not in this design)

After sufficient live shadow evidence, a **separate** decision may consider:

- earliest age with acceptable P(non-zero)
- acceptable fraction of final shadow-observed bucket-locus union
- bounded later incremental locus gain

Do **not** encode thresholds (95%, 99%, 100%) without evidence/product requirement.

**`PRODUCTION_RETRY_AGE_SELECTED=NO`**

---

## 24. TGR Option C interaction

Future architecture remains:

**Gap Debt + during-trip maturation-aware targeted requery + post-trip bounded reconciliation**

Live Maturation Shadow informs **only**:

- `firstEligibleRetryAt` policy
- potentially retry timing schedule

It does **not** implement Gap Debt, retry, or post-trip reconciliation in this design.

**`PRIMARY_DEMONSTRATED_RECOVERY_LEVER=MATURATION_AWARE_TARGETED_REQUERY`**

Micro-window fragmentation remains optional for `PARTIAL_TEMPORAL_COVERAGE` only if later evidence supports it.

---

## 25. Fleet auto-sampler separation

Shadow completely separate from:

- study enrollment / plan allocation
- 90→60 / 60→90 order balance
- `StudyRun` / physical T0
- lifecycle driver
- cadence recommendation

Stage-1A must not be modified.

Same vehicle may be observed by both systems; scientific identities and persistence remain separate.

---

## 26. Feature flags (design only)

| Flag | Default |
|------|---------|
| `EXP021_MATURATION_SHADOW_ENABLED` | `false` |
| single-token allowlist | `187336` (KS MX 2024) when enabled |
| per-lane enable flags | both off by default |
| `max active window families` | bounded (e.g. 10 concurrent) |
| `schedule version` | `MATURATION_SHADOW_SCHEDULE_v1` |

Do not add env variables in this PR.

---

## 27. Canary rollout (design sequence only)

| Stage | Action |
|-------|--------|
| 0 | Code deployed, shadow disabled |
| 1 | KS MX 2024 only |
| 2 | Validate mechanics / no canonical interference |
| 3 | Other fleet vehicles only after identity + HF-policy readiness |
| 4 | Fleet validation collection |

No activation in this task.

---

## 28. Fail-closed conditions

| Condition | Action |
|-----------|--------|
| Token identity mismatch | Abort window family |
| Signal registry mismatch vs frozen snapshot | Abort stratum |
| Query builder mismatch vs frozen semantics | Abort stratum |
| Cannot execute frozen query semantics after drift | Fail stratum closed |
| Duplicate shadow window family authority | Reject enrollment |
| Duplicate age execution (non-idempotent) | Fail closed |
| Failed attempt overwrite attempted | Hard fail |
| Provider authentication failure | Mark contaminated |
| Provider schema drift | Fail closed |
| Canonical-store write attempt | Hard fail |
| Canonical watermark change | Hard fail |
| Scheduler age-order corruption | Flag + sort by actualAgeMs |
| Mixed runtime semantics (unprovable equivalence) | Exclude from primary curves |

No hidden repair of observations.

---

## 29. Future implementation sequence (not this PR)

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

## 30. Raw vs recovered science

**`RAW_AND_RECOVERED_METRICS_SEPARATE=YES`**

### RAW_BASELINE

- `baselineBucketLocusCount`
- `baselineRequestCount`
- `baselineZeroCount`
- `baselineTemporalCoverage`

### RECOVERY (future TGR)

- `recoveredBucketLocusCount`
- `recoveryRequestCount`
- `gapDebtCreatedCount`
- `gapDebtRecoveredCount`
- `gapDebtPersistentCount`
- `timeToRecoveryMs`

Recovery must **never** rewrite original slot outcome/provenance.

---

## 31. Architecture flow

```
NORMAL VEHICLE ACTIVITY
        ↓
DETERMINISTIC WINDOW FAMILY ENROLLMENT
 (fail-closed identity, geometry-specific activity stratification)
        ↓
FREEZE signal set + query semantics + age schedule per family
        ↓
FOR EACH STRATUM (lane × geometry):
  FIXED [windowFrom, windowTo]
  (same across all ages)
        ↓
DELAYED SHADOW PROBES (dedicated queue, bounded concurrency)
 policy-delay(effective) / 30 / 40 / 45 / 50 / 55 / 60 / 90 / 120
        ↓
┌───────────────────────┐     ┌────────────────────────┐
│  HF_FAST_LOOP strata   │     │  SETTLEMENT_SHADOW strata │
│  (preflight-frozen)   │     │  (manifest-frozen 33)    │
└───────────┬───────────┘     └────────────┬───────────┘
            │                              │
            └──────────┬───────────────────┘
                       ↓
    IMMUTABLE ATTEMPT LEDGER (per slot, per provider call)
                       ↓
         ISOLATED SHADOW OBSERVATIONS
    (no canonical writes, no coverage advance)
                       ↓
              TERMINAL WINDOW FAMILY / STRATUM
                       ↓
   availability + bucket-locus information-maturation analysis
   (interval-censored, per-lane, per-geometry, paired within family)
                       ↓
        NO canonical recovery
        NO cadence change
        NO production retry age selection
```

---

## 32. Preserved scientific authorities (unchanged)

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

## 33. Query coverage / gap debt (current main authority)

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
