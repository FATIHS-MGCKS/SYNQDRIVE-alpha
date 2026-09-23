# M3.3D D0 — Longitudinal Battery Profile Architecture & Scientific Contract Audit

**Date:** 2026-09-24  
**Status:** Architecture / scientific contract audit only — **no runtime implementation**  
**Main anchor:** `7878aee90cd8e6cf7552533e4333878743c95622` (PR #1734 merged; M3.3C C1–C5B complete on main)  
**Production runtime baseline (unchanged):** `2b0ef15fc80069676cd44f1b852a362434f7ffb7`  
**Shadow feature flag (unchanged):** `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=false`

## Executive summary

**M3.3D** combines evidence from **multiple canonical `BatteryRestSession` episodes** for one vehicle into a **versioned, lineage-preserving longitudinal profile**. It describes **how canonical rest-session feature evidence accumulates and varies over time**. It does **not** assign battery health, failure risk, confidence labels, SOH %, or customer-facing conclusions — those remain **M3.3E+**.

**Proposed internal contract name (working):** `M3_3D_LONGITUDINAL_PROFILE_V1`  
**Canonical per-session input:** the row selected by **`selectCanonicalRestSessionFeatureShadowRow()`** only — no independent revision picking.  
**Longitudinal time axis (recommended):** **`BatteryRestSession.anchorAt`** (rest-episode anchor), with deterministic tie-break — not `computedAt` / ingestion wall clock.  
**Persistence recommendation:** **Hybrid (C)** — deterministic on-demand assembly from canonical C3 rows as source of truth; optional future **append-only profile revisions** for audit, bounded query, and M3.3E consumption (no D0 schema).

---

## 1. Current source architecture

### 1.1 M3.3C baseline on main (verified @ `7878aee90`)

| Slice | Artifact | Role |
|-------|----------|------|
| **C1** | `battery_rest_session_features` schema + `M3_3C_C1_V1` retention policy | Eligible ladder points, Theil-Sen slope, rung metadata |
| **C2** | `ChargeOpportunityRawFeaturesV1` + `M3_3C_C2_V1` | Trip-window charge context; `chargeOpportunityClass` |
| **C3** | `RestSessionFeatureComputationService` | Deterministic snapshot → digest → append-only rows |
| **C4** | `RestSessionFeatureShadowTriggerService` | Post-mutation hooks; flag-gated |
| **C5A** | `M3_3C_C5A_V1` inspection | Per-session integrity + canonical selection |
| **C5B** | Master Admin UI | Read-only C5A over HTTP; not M3.3H |

Merge lineage: C5B PR #1733 @ `969cc3f19`; documentation seal PR #1734 @ `7878aee90`.

### 1.2 Core entities (repository)

**`BatteryRestSession`** — canonical rest episode lifecycle (`anchorAt`, `sessionStatus`, `endReason`, observation counts, trip links).

**`BatteryRestSessionFeature`** — append-only shadow rows per session (`semanticRevision`, version tuple, scalar C3 features, `inputSummary` JSON, `inputDigest`, `computedAt`).

**Canonical selection (mandatory for M3.3D):**

```text
selectCanonicalRestSessionFeatureShadowRow({ sessionStatus, endReason, rows })
```

Preference order: phase × trust from `resolveCanonicalRestSessionFeatureRowPreference`, then alternates, then highest `semanticRevision` fallback (`rest-session-feature-canonical-row.policy.ts`).

**Within-session time authority (C1/C3):** retention physics uses **`actualRestAgeMs`** on eligible points (`RETENTION_TIME_AUTHORITY=actualRestAgeMs`). Cross-session ordering uses **session `anchorAt`**, not rest-age (rest-age is intra-session only).

### 1.3 Related but distinct systems (do not conflate)

| System | Purpose | M3.3D relationship |
|--------|---------|-------------------|
| **`BatteryFeatures`** | Single-row legacy LV rest/crank + published SOH scalars | Legacy REST_60m/6h path — **not** canonical M3.3C longitudinal source |
| **`BatteryAssessment` / `BatteryPublication`** | Versioned assessment runs + publication history | **M3.3E** consumer; M3.3D must not write here in D0–D3 |
| **`BatteryRetentionAggregate`** | Pre-raw-delete SESSION/DAILY rollups (legacy retention pipeline) | Separate bucket summaries — **not** `BatteryRestSessionFeature` profile |
| **`GET …/battery-health/trend`** | SOH/voltage trend from existing health stack | Customer/diagnostic trend — **not** M3.3C multi-session profile |
| **R1 audit §8 planning** | Target longitudinal *dimensions* for future health model | **Input to M3.3E**; M3.3D implements evidence assembly, not health labels |

### 1.4 Existing cross-session aggregation

**Finding:** **No runtime implementation** today aggregates **multiple canonical `BatteryRestSessionFeature`** rows into a longitudinal profile. C3/C5A operate **per session**. Legacy aggregates (`BatteryFeatures`, `BatteryRetentionAggregate`, SOH trend) use **different evidence models**.

**Implication:** M3.3D is **greenfield on top of C3 canonical rows**, not an extension of SOH trend or retention aggregate tables.

---

## 2. Scientific definition — what “Longitudinal Battery Profile” means

For SynqDrive, a **longitudinal battery profile** is a **bounded, version-aware collection of canonical rest-session observations** for one `(organizationId, vehicleId)` that:

1. **Preserves provenance** — each point traces to one `restSessionId`, one canonical `BatteryRestSessionFeature` row id, `semanticRevision`, and `inputDigest` (or C5A-verified lineage).
2. **Orders episodes in rest time** — primarily by **`anchorAt`**, reflecting when the rest episode anchored (shutdown/rest boundary semantics from M3.3A), not when C3 ran.
3. **Carries comparability metadata** — charge context class, trust, completeness, version tuple, integrity flags — so downstream layers know **what may and may not be compared**.
4. **Describes evidence variation** — session counts, coverage span, gaps, optional **descriptive** cross-session statistics (e.g. session-count, median of session medians **within a homogeneous cohort**).
5. **Explicitly avoids causation** — a downward trend in `medianRestVoltageMv` across sessions is **not** labeled degradation; temperature, SOC, recent charging, and ladder depth confound interpretation (**M3.3E**).

**Non-goals (M3.3D):** health scoring, failure risk, confidence, SOH %, customer UI, authoritative publication, production shadow activation.

---

## 3. Scientific comparability matrix (C3 / C5A fields)

Classification key:

- **A** — Directly comparable across sessions (with same units / semantics)
- **B** — Comparable only under context / gating (stratification or exclusion)
- **C** — Descriptive only (metadata, diagnostics, not for naive trend inference)
- **D** — Not suitable for longitudinal inference

| Field / concept | Class | Rationale |
|-----------------|-------|-----------|
| `shutdownToFirstRestDeltaMv` | **B** | Depends on ENGINE_OFF anchor resolution (`SELECTED` vs `UNAVAILABLE`/`AMBIGUOUS`); confounded by immediate post-shutdown load and SOC; compare only within **anchor-resolved + comparable charge class** cohorts |
| `robustRestSlopeMvPerHour` | **B** | Theil-Sen slope over **`actualRestAgeMs`** inside session; cross-session slope comparison requires similar **`observationSpanMs`**, point count, and ladder coverage — otherwise slopes measure different rest depths |
| `minimumRestVoltageMv` | **B** | Strong SOC / temperature / recent-charge confounding; not normalized in current data |
| `maximumRestVoltageMv` | **B** | Same as minimum |
| `medianRestVoltageMv` | **B** | Most stable single scalar per session, still **not** SOC-normalized; usable as **descriptive series** only with charge-context stratification |
| `restVoltageVarianceMv2` | **C** | Within-session dispersion; comparing variance across sessions mixes ladder depth and noise — descriptive QA only |
| `numberOfValidRestPoints` | **A** (count) / **B** (as quality threshold) | Count of eligible retention points is comparable as **evidence density**; using unequal counts to infer health is **B** at best |
| `maxActualRestAgeMs` | **A** (metadata) / **B** (depth gate) | Measures how long rest was observed in-session; sessions with 2h vs 48h rest are not feature-comparable without gating |
| `maxInterObservationGapMs` | **C** | Session-internal sampling quality |
| `observationSpanMs` | **A** (metadata) / **B** (gate for slope/median compare) | Required context for interpreting slopes and medians |
| `missingRungCount` | **A** (quality dim) / **B** (exclusion) | Ladder completeness indicator; high missing rungs → exclude from slope cohorts (**DECISION_REQUIRED** thresholds) |
| `chargeOpportunityClass` | **B** | **Stratification dimension** (SUFFICIENT / PARTIAL / INSUFFICIENT / UNKNOWN) — not a numeric series; do not mix INSUFFICIENT with SUFFICIENT in one retention trend without explicit segmentation |
| `sessionTrust` | **Exclusion gate** | **`INVALIDATED`** sessions must not enter default longitudinal inclusion |
| `computationPhase` | **B** / gate | **FINAL** preferred for ended sessions; **INCREMENTAL** for active RESTING — longitudinal default cohort should prefer **FINAL + VALID** for terminal sessions (**DECISION_REQUIRED** for active-session inclusion) |
| `sessionStatus` / `endReason` | **B** | ACTIVE vs ENDED affects canonical phase; invalidated paths excluded |
| `anchorResolution.status` | **B** / gate | `UNAVAILABLE`/`AMBIGUOUS` → exclude from delta/slope cohorts or mark `LOW_ANCHOR_QUALITY` |
| `anchorAt` (session) | **A** (time coordinate) | Primary longitudinal ordering axis |
| `openedAt` / `endedAt` | **C** | Lifecycle metadata; weaker physical meaning than `anchorAt` for rest biology |
| `computedAt` | **C** | Processing time — **not** battery-time axis |
| Retention point distribution (`retentionPoints[]`) | **C** | Full curve is descriptive; cross-session curve overlay requires aligned **`actualRestAgeMs`** bins — **SHADOW_CALIBRATION_REQUIRED** for any binning |
| `pairwiseRestDeltas` | **C** | Nominal-rung deltas; session-local; useful for inspection, not automatic longitudinal merge |
| `chargeOpportunityRaw.*` counts | **C** | Diagnostic completeness; stratification inputs for M3.3E |
| `inputDigest` / version tuple | **A** (lineage) | Required for reproducibility and version segmentation |
| C5A `overallStatus` per session | **B** (inclusion gate) | `INTEGRITY_WARNING` → exclude or quarantine segment; `INTEGRITY_PARTIAL` → include with **`digestCoverage=PARTIAL`** metadata only |

**Temperature:** not persisted as a first-class C3 scalar today (`temperatureC` in charge raw is trip-start exterior, partial). **No temperature-adjusted longitudinal comparison in M3.3D without new evidence alignment (M3.3E / future spec).**

---

## 4. Confounder matrix

| Confounder | Effect | M3.3D treatment |
|------------|--------|-----------------|
| Different rest duration (`maxActualRestAgeMs`, span) | Slopes/medians measure different phenomena | **Exclusion gate** or **stratification** by rest-depth band (**DECISION_REQUIRED** bands) |
| Different retention ladder coverage / missing rungs | Biased slopes and medians | **Quality metadata** + **exclusion** above threshold (**SHADOW_CALIBRATION_REQUIRED**) |
| `chargeOpportunityClass` | Retention interpretation differs after drive/charge | **Stratification dimension**; default profile may split series per class |
| Recent charging / alternator activity | Shifts rest voltage level | **Stratification** via charge class + raw counts; no SOC normalization yet |
| `sessionTrust=INVALIDATED` | Episode no longer trustworthy | **Hard exclusion** from default inclusion |
| Sparse retention observations | Unstable Theil-Sen / medians | **Exclusion** if `numberOfValidRestPoints` below minimum (**DECISION_REQUIRED**) |
| Provider observability gaps (B1.2Y) | Missing wake/engine-off evidence | Record **`providerGapFlags`** from session/GE context when available; **quality metadata** — no imputation |
| Anchor quality (`AMBIGUOUS` / missing) | Invalid shutdown deltas | **Exclude** from delta/slope cohorts |
| INCREMENTAL vs FINAL on ended sessions | Feature drift within session | Prefer **canonical FINAL** for ended sessions |
| Voltage timestamp quality | Mis-ordered or weak provider times | Session-level C5A integrity; **exclude on INTEGRITY_WARNING** |
| Environmental temperature | Confounds absolute mV | **Record only** (best-effort from charge raw); **no correction in M3.3D** |
| Vehicle config / battery replacement / provider change | Step changes in series | **Segment boundary** metadata (**DECISION_REQUIRED** detection — likely manual/ops until automated signals exist) |
| Policy version changes (C1/C2/C3 tuple) | Non-comparable feature semantics | **Version segmentation** (§6) — never silent merge |

**Legend:** **Exclusion gate** = row/session omitted from default series. **Stratification** = separate sub-series or tagged dimension. **Quality metadata** = included but flagged. **Record only** = stored, not used to adjust values.

---

## 5. Canonical inclusion contract

### 5.1 Input row authority

For each candidate `BatteryRestSession`:

1. Load **all** `BatteryRestSessionFeature` rows for `(organizationId, vehicleId, restSessionId)` matching current **`REST_SESSION_FEATURE_MODEL_VERSION`** (or explicit multi-version mode with segmentation — §6).
2. Select **exactly one** canonical row via **`selectCanonicalRestSessionFeatureShadowRow({ sessionStatus, endReason, rows })`** — **no alternate selection policy in M3.3D**.
3. Persist in profile point: `canonicalFeatureRowId`, `semanticRevision`, full version tuple, scalar features (denormalized from row + optional `inputDigest` reference).

**Forbidden:** picking highest revision regardless of phase/trust; recomputing retention from raw GE without C3 row; using non-canonical revisions in default profile.

### 5.2 Session-level inclusion rules (proposed defaults)

| Rule | Default | Status |
|------|---------|--------|
| Canonical row exists | Required | **VALIDATED** (C3/C5A) |
| `sessionTrust=VALID` on canonical row | Required for default series | **VALIDATED** |
| `sessionStatus=INVALIDATED` | Exclude | **VALIDATED** |
| C5A-equivalent integrity `INTEGRITY_WARNING` | Exclude from default series | **PROPOSED** |
| C5A `INTEGRITY_PARTIAL` | Include with `perSessionDigestCoverage=PARTIAL` flag | **PROPOSED** |
| `chargeOpportunityClass` | Include all classes in **full inventory**; **retention trend sub-series** default **SUFFICIENT + PARTIAL** only | **DECISION_REQUIRED** |
| Minimum `numberOfValidRestPoints` | e.g. ≥2 for slope-bearing sessions | **SHADOW_CALIBRATION_REQUIRED** |
| Minimum `observationSpanMs` | Band for slope comparability | **SHADOW_CALIBRATION_REQUIRED** |
| Maximum `missingRungCount` | Upper bound for “complete ladder” cohort | **SHADOW_CALIBRATION_REQUIRED** |
| Active RESTING + INCREMENTAL canonical | Exclude from **stable** longitudinal series or mark `PROVISIONAL` | **DECISION_REQUIRED** |
| Anchor `SELECTED` required for shutdown delta series | Yes | **PROPOSED** |

**No silent numeric thresholds in D0** — implement as configurable policy constants validated in shadow (M3.3F).

### 5.3 Forensic / debug path

Separate **`includeProvisional=true`** or Master Admin inspection mode may list excluded sessions with reasons — **not** the default customer-bound profile (M3.3H never sees raw path).

---

## 6. Version compatibility rules

Longitudinal profiles span sessions computed under potentially different policy tuples:

`featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`, `inputContractVersion`

### 6.1 Answers

1. **Can different versions coexist in one profile?**  
   **Yes in one container**, but **not in one undifferentiated comparability series**. Each observation carries its tuple; the profile exposes **`versionSegments[]`**.

2. **When must they be segmented?**  
   When **any** of the four version fields differs — create segment boundary. **Retention policy** or **input contract** change → **forbid** pooled descriptive trends across boundary without explicit “cross-version descriptive” mode (off by default).

3. **When is cross-version comparison forbidden?**  
   **Default longitudinal descriptive trends** (e.g. medianRestVoltageMv over time) **forbidden** across `inputContractVersion` or `retentionPolicyVersion` changes. **`featureModelVersion`** bump with unchanged input contract: **segment**; comparison **DECISION_REQUIRED** per changelog.

4. **Profile version tuple**  
   Profile carries:
   - `longitudinalProfileContractVersion` = `M3_3D_LONGITUDINAL_PROFILE_V1` (working)
   - `profilePolicyVersion` = e.g. `M3_3D_PROFILE_POLICY_V1` (inclusion gates, lookback, segmentation rules)
   - `sourceFeatureModelVersions[]` (union of included sessions)
   - `dominantVersionSegment` (largest session count)

5. **Historical evidence on policy upgrade**  
   **Append-only:** old C3 rows remain; new computations add rows with new tuple. Longitudinal reader **never mutates** C3 history. Profile regeneration produces **new profile revision** referencing same canonical row ids.

---

## 7. Time authority decision

| Candidate | Use | Verdict |
|-----------|-----|---------|
| **`session.anchorAt`** | Rest episode physical anchor (ENGINE_OFF / rest boundary) | **Primary longitudinal axis** |
| `session.openedAt` | Session record open | Secondary metadata |
| `session.endedAt` | Episode end | Censoring / completeness metadata |
| `canonicalFeature.computedAt` | C3 execution time | **Reject** as primary axis (processing latency, backfill) |
| Provider observation timestamps | Intra-session retention physics | Used **within** session via `actualRestAgeMs` / point times — not for cross-session ordering |

**Ordering rule:** `ORDER BY anchorAt ASC, restSessionId ASC` (UTF-16 lexicographic tie-break for determinism).

**Gap detection:** compute **`interSessionGapMs`** between consecutive included `anchorAt` values — large gaps → **`TEMPORAL_GAP`** metadata (not health).

---

## 8. Proposed contract — `M3_3D_LONGITUDINAL_PROFILE_V1` (working)

Internal read model (JSON shape for API/ops future). **Not exposed to customers in M3.3D.**

```typescript
// Conceptual — not implemented in D0
type LongitudinalProfileContractVersion = 'M3_3D_LONGITUDINAL_PROFILE_V1';

type LongitudinalProfileV1 = {
  longitudinalProfileContractVersion: LongitudinalProfileContractVersion;
  profilePolicyVersion: string; // e.g. M3_3D_PROFILE_POLICY_V1

  identity: {
    organizationId: string;
    vehicleId: string;
  };

  window: {
    lookbackRequested: { maxSessions: number; maxAnchorAgeDays: number | null };
    firstIncludedAnchorAt: string | null; // ISO UTC
    lastIncludedAnchorAt: string | null;
    profileGeneratedAt: string; // wall clock — generation only
  };

  coverage: {
    candidateRestSessionCount: number;
    includedSessionCount: number;
    excludedSessionCount: number;
    excludedByReason: Record<LongitudinalExclusionReason, number>;
    validEvidenceSpanMs: number | null; // last - first anchor among included
  };

  versionSegments: Array<{
    segmentIndex: number;
    featureModelVersion: string;
    retentionPolicyVersion: string;
    chargeOpportunityPolicyVersion: string;
    inputContractVersion: string;
    sessionCount: number;
    firstAnchorAt: string;
    lastAnchorAt: string;
  }>;

  observations: LongitudinalProfileObservationV1[]; // sorted by anchorAt, restSessionId

  derived: LongitudinalDerivedFeaturesV1 | null; // optional descriptive block — §9

  profileStatus: LongitudinalProfileStatus;
  profileStatusReasons: LongitudinalProfileReason[];
  completeness: {
    minimumSessionsForDescriptiveTrend: number;
    sessionsAvailable: number;
    meetsMinimum: boolean;
  };
};

type LongitudinalProfileObservationV1 = {
  restSessionId: string;
  anchorAt: string;
  sessionStatus: string;
  endReason: string | null;

  canonicalFeatureRowId: string;
  semanticRevision: number;
  inputDigest: string;
  versionTuple: {
    featureModelVersion: string;
    retentionPolicyVersion: string;
    chargeOpportunityPolicyVersion: string;
    inputContractVersion: string;
  };

  sessionTrust: 'VALID' | 'INVALIDATED';
  computationPhase: 'INCREMENTAL' | 'FINAL';
  chargeOpportunityClass: string;

  features: {
    shutdownToFirstRestDeltaMv: number | null;
    robustRestSlopeMvPerHour: number | null;
    minimumRestVoltageMv: number | null;
    maximumRestVoltageMv: number | null;
    medianRestVoltageMv: number | null;
    restVoltageVarianceMv2: number | null;
    numberOfValidRestPoints: number;
    maxActualRestAgeMs: number | null;
    maxInterObservationGapMs: number | null;
    observationSpanMs: number | null;
    missingRungCount: number | null;
  };

  quality: {
    anchorResolutionStatus: 'SELECTED' | 'UNAVAILABLE' | 'AMBIGUOUS';
    perSessionInspectionStatus: 'OK' | 'NO_FEATURE_ROWS' | 'INTEGRITY_PARTIAL' | 'INTEGRITY_WARNING' | 'NOT_EVALUATED';
    inclusionMode: 'DEFAULT' | 'PROVISIONAL' | 'EXCLUDED';
    exclusionReasons: LongitudinalExclusionReason[];
  };

  chargeContextSummary: {
    chargeOpportunityClass: string;
    contextCompleteness: string[]; // bounded subset of C2 reasons
    temperatureC: number | null;
    temperatureSource: string | null;
  };
};
```

**Lineage:** every observation must be reproducible from `(canonicalFeatureRowId)` → C3 row → `inputDigest` verified under C5A rules.

---

## 9. Derived longitudinal features (classification)

| Derived value | Classification | Notes |
|---------------|----------------|-------|
| Session count / included count | **SAFE_DESCRIPTIVE** | Coverage |
| `validEvidenceSpanMs` | **SAFE_DESCRIPTIVE** | Calendar span of anchors |
| Longest inter-session gap | **SAFE_DESCRIPTIVE** | Temporal coverage |
| Observation density (sessions / month) | **SAFE_DESCRIPTIVE** | Requires anchor time |
| Version segment counts | **SAFE_DESCRIPTIVE** | |
| Per-class session counts by `chargeOpportunityClass` | **SAFE_DESCRIPTIVE** | |
| Robust trend of `medianRestVoltageMv` vs `anchorAt` (Theil-Sen or OLS on session scalars) | **REQUIRES_CONTEXT_NORMALIZATION** | Only within homogeneous segment + charge class + rest-depth gate; label **`MEASURED_TREND` not DEGRADATION** |
| Rolling median of session medians | **REQUIRES_CONTEXT_NORMALIZATION** | Same gates |
| Change first → latest session median mV | **REQUIRES_CONTEXT_NORMALIZATION** | Highly confounded — descriptive with heavy metadata only |
| Variability of session medians (IQR/std) | **SAFE_DESCRIPTIVE** | Within segment |
| “Health slope” / SOH proxy | **M3_3E_ONLY** | |
| Failure risk from trend | **M3_3E_ONLY** | |
| Temperature-adjusted trend | **M3_3E_ONLY** (until calibration spec) | |
| Single-session dominance score | **M3_3E_ONLY** | Anti-dominance weighting for health |
| Naive “declining voltage = bad battery” label | **REJECTED** | |

**M3.3D may emit** `derived.measuredTrends[]` with `{ metric, segmentId, chargeClass, slope, method, sessionCount, disclaimer: 'NON_CAUSAL' }` — **optional** in D2+, not required for D1 reader.

---

## 10. Persistence architecture decision

| Option | Pros | Cons |
|--------|------|------|
| **A. On-demand only** | Always reproducible from C3; no new tables; simplest | Repeated bounded joins; M3.3E latency |
| **B. Materialized append-only profile revisions** | Fast read; audit trail; idempotent keys | Storage; recomputation policy; migration later |
| **C. Hybrid** | On-demand truth + optional cached revision | Two paths to keep consistent |

**Recommendation: C (Hybrid)**

- **Source of truth:** canonical C3 rows + inclusion policy code (deterministic function of DB state at `profileGeneratedAt`).
- **Optional materialization (D3+):** append-only `LongitudinalProfileRevision` with `(organizationId, vehicleId, profilePolicyVersion, inputFingerprint)` unique idempotency — **conceptual only in D0**.
- **Recomputation:** new policy version → new profile revision; never update prior revision rows.
- **Multi-replica:** compute is read-only until materialization; writers use same idempotency as C3 (Serializable or advisory lock per vehicle profile job — **DECISION_REQUIRED** at D3).
- **M3.3E consumption:** reads profile revision **or** invokes same pure function — must not fork logic.

**No schema/migration in D0.**

Conceptual keys (future):

- `idempotencyKey`: `long-profile:{vehicleId}:{profilePolicyVersion}:{canonicalRowSetDigest}:{windowParamsDigest}`

---

## 11. Bounded-read strategy

**Goals:** no unbounded `findMany`; no loading all revisions; one canonical row per session.

| Parameter | Proposed default | Status |
|-----------|------------------|--------|
| Default lookback | **365 days** by `anchorAt` | **DECISION_REQUIRED** |
| Max sessions per profile read | **100** (newest by anchorAt within lookback) | **PROPOSED** |
| Pagination | `cursor={lastAnchorAt,lastRestSessionId}` + `limit≤100` | **PROPOSED** |
| Ordering | `anchorAt DESC` for “recent window” queries; ASC for series assembly | **VALIDATED** |
| Older history | Beyond max sessions: **`truncatedOlderSessionCount`** metadata — optional **yearly summary** in future (**DECISION_REQUIRED**) | |
| Index use | `BatteryRestSession` `(vehicleId, anchorAt DESC)`; features via session id batch `IN (...)` | **VALIDATED** (schema exists) |

**Per session DB pattern (conceptual):**

1. Page rest sessions for vehicle in window (cap N).
2. Batch-load feature rows for those session ids (model version filter).
3. In-memory canonical pick per session (same policy as C5A).
4. Optional C5A integrity pass — bounded; may reuse inspection service with batch limits.

---

## 12. Integrity / failure semantics

**Profile-level status (machine-readable, not health):**

| `LongitudinalProfileStatus` | Meaning |
|----------------------------|---------|
| `OK` | Minimum included sessions met; no blocking integrity issues |
| `INSUFFICIENT_SESSIONS` | Below minimum for descriptive series |
| `PARTIAL_COVERAGE` | Included sessions OK but lookback truncated / many exclusions |
| `VERSION_SEGMENTED` | Multiple version segments — trends not auto-merged |
| `INTEGRITY_LIMITED` | Some sessions excluded for per-session integrity |
| `NO_ELIGIBLE_SESSIONS` | No canonical rows after gates |
| `FAILED` | Query/contract error |

**Exclusion reasons (`LongitudinalExclusionReason`):**

`NO_CANONICAL_ROW`, `SESSION_INVALIDATED`, `SESSION_TRUST_INVALIDATED`, `INTEGRITY_WARNING`, `CHARGE_CLASS_FILTER`, `INSUFFICIENT_REST_POINTS`, `INSUFFICIENT_OBSERVATION_SPAN`, `ANCHOR_UNAVAILABLE`, `VERSION_FILTER`, `PROVISIONAL_INCREMENTAL`, `OUTSIDE_LOOKBACK`, `DUPLICATE_ANCHOR_COLLISION` (if ever detected)

**Per-session:** do not collapse to single boolean — retain **`exclusionReasons[]`**.

---

## 13. M3.3E boundary

**M3.3D answers:**  
“What canonical rest-session feature evidence exists over time for this vehicle, how complete is it, and how do key **non-causal** descriptors vary within stated comparability constraints?”

**M3.3D does not answer:**  
Health label, failure risk, confidence tier, SOH %, customer recommendation.

**`BatteryAssessment` today:** append-only assessment runs from **measurement/evidence candidates** for a recompute epoch — **not** a multi-session C3 profile store.

**Future feed path (conceptual):**

```text
M3.3D profile revision → M3.3E feature extractor → BatteryAssessment inputSummary (structured) → existing publication chain (post-G)
```

M3.3D **must not** write `BatteryAssessment`, `BatteryPublication`, or `BatteryFeatures` during D1–D4 engineering unless explicitly authorized in M3.3G cutover spec.

---

## 14. M3.3H boundary

- **M3.3H** = customer Vehicle Detail → Health UI; authoritative outputs **after M3.3G** only.
- **C5B** = internal Master Admin inspection over C5A; may later add **optional** M3.3D inspection view (**separate engineering**).
- M3.3D outputs remain **internal** until cutover; no customer HTTP/GraphQL in M3.3D slices.

---

## 15. Implementation slice plan (post-D0)

Smallest safe sequence:

| Slice | Scope | Deliverable |
|-------|--------|-------------|
| **D1** | Canonical longitudinal **input reader** + pure inclusion policy + `M3_3D_LONGITUDINAL_PROFILE_V1` types (no persistence) | Unit tests against fixture sessions; bounded session query |
| **D2** | Deterministic **profile assembly** (observations + version segments + exclusions + optional SAFE_DESCRIPTIVE derived block) | Pure function + golden tests; flag-gated service shell default OFF |
| **D3** | **Persistence / materialization** (if approved after D2 shadow metrics) | Append-only revision concept + idempotency; migration only after review |
| **D4** | **Inspection / observability** | Ops CLI or extend C5A pattern; Prometheus counters for exclusions (bounded labels) |
| **D5** | **Integration hardening** | Postgres integration tests, multi-version segmentation, concurrency/idempotency, C5A integrity coupling |

**Alternative considered:** merge D1+D2 — rejected for review clarity; D1 locks inclusion science before derived features.

**Dependencies:** C3 rows must exist (shadow flag ON in non-prod / M3.3F for prod validation). D0 does not enable flag.

---

## 16. Open decisions / blockers

| ID | Topic | Status |
|----|-------|--------|
| **DEC-M3.3D-001** | Minimum sessions for `OK` descriptive profile | **DECISION_REQUIRED** |
| **DEC-M3.3D-002** | Default lookback days / max sessions | **DECISION_REQUIRED** |
| **DEC-M3.3D-003** | Include active RESTING INCREMENTAL sessions? | **DECISION_REQUIRED** |
| **DEC-M3.3D-004** | Charge class filter for retention sub-series | **DECISION_REQUIRED** |
| **CAL-M3.3D-001** | Thresholds: min points, span, missing rungs | **SHADOW_CALIBRATION_REQUIRED** (M3.3F) |
| **CAL-M3.3D-003** | Rest-depth stratification bands | **SHADOW_CALIBRATION_REQUIRED** |
| **BLOCK-M3.3D-001** | No fleet C3 rows while shadow flag OFF | Natural validation blocked until **M3.3F** authorization |
| **BLOCK-M3.3D-002** | Temperature alignment insufficient for adjusted trends | Defer to M3.3E |
| **BLOCK-M3.3D-003** | Battery replacement / config change auto-segmentation | **DECISION_REQUIRED** — no automatic signal in C3 today |

---

## Non-effects (D0)

- No schema / migration / runtime service / worker / queue
- No feature flag activation / production deploy / backfill
- No `BatteryAssessment` / `BatteryPublication` / `BatteryFeatures` writes
- No customer API or UI
- No M3.3E health interpretation

---

## References

- `architecture/battery-v2/CURRENT_STATE.md`
- `architecture/battery-v2/research/M3_3_C1_REST_SESSION_FEATURE_FOUNDATION_2026-09-22.md`
- `architecture/battery-v2/research/M3_3_C2_CHARGE_OPPORTUNITY_SOURCE_CONTRACT_2026-09-23.md`
- `architecture/battery-v2/research/M3_3_C3_FEATURE_COMPUTATION_PERSISTENCE_2026-09-23.md`
- `architecture/battery-v2/research/M3_3_C4_SHADOW_LIFECYCLE_WIRING_2026-09-23.md`
- `architecture/battery-v2/research/M3_3_C5A_SHADOW_OBSERVABILITY_INSPECTION_2026-09-23.md`
- `architecture/battery-v2/research/M3_3_R1_8H_REST_EVIDENCE_ARCHITECTURE_AUDIT_2026-09-21.md` (§8 planning — superseded for implementation detail by this D0 where they differ)
- Code: `rest-session-feature-canonical-row.policy.ts`, `rest-session-retention.policy.ts`, `rest-session-feature-shadow-inspection.service.ts`
