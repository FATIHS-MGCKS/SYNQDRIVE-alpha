# M3.3D D0 — Longitudinal Battery Profile Architecture & Scientific Contract Audit

**Date:** 2026-09-24  
**Status:** Architecture / scientific contract audit — **COMPLETE ON MAIN** (PR #1735 @ `bc69e1d9c`; PR head `4b314f2a1`) — **no runtime implementation**  
**D0.1:** Architecture closure — **COMPLETE ON MAIN** (same merge)  
**Main anchor (M3.3C C1–C5B):** `7878aee90cd8e6cf7552533e4333878743c95622`  
**M3.3D D0 merge:** `bc69e1d9c9031d19e4225270be060ef900b58f41`  
**Production runtime baseline (unchanged):** `2b0ef15fc80069676cd44f1b852a362434f7ffb7`  
**Shadow feature flag (unchanged):** `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=false`

## Executive summary

**M3.3D** combines evidence from **multiple canonical `BatteryRestSession` episodes** for one vehicle into a **versioned, lineage-preserving longitudinal profile**. It describes **how canonical rest-session feature evidence accumulates and varies over time**. It does **not** assign battery health, failure risk, confidence labels, SOH %, or customer-facing conclusions — those remain **M3.3E+**.

**Proposed internal contract name (working):** `M3_3D_LONGITUDINAL_PROFILE_V1`  
**Canonical per-session input:** the row selected by **`selectCanonicalRestSessionFeatureShadowRow()`** only — no independent revision picking.  
**Longitudinal time axis (recommended):** **`BatteryRestSession.anchorAt`** (rest-episode anchor), with deterministic tie-break — not `computedAt` / ingestion wall clock.  
**Persistence recommendation:** **Hybrid (C)** — deterministic on-demand assembly from canonical C3 rows as source of truth; optional future **append-only profile revisions** for audit, bounded query, and M3.3E consumption (no D0 schema).

### Active architecture invariants (normative for D1+)

| # | Invariant |
|---|-----------|
| 1 | One canonical `BatteryRestSessionFeature` per rest session in profile |
| 2 | `selectCanonicalRestSessionFeatureShadowRow()` — same policy as C5A |
| 3 | Bounded retrieval (`listCanonicalCandidateRows` pattern); **forbid** `listFeatureRowsForSession()` in M3.3D; `LONGITUDINAL_CANONICAL_SELECTION_EQUIVALENT_TO_C5A=YES` |
| 4 | Time axis: `BatteryRestSession.anchorAt`; tie-break `restSessionId` |
| 5–6 | Historical versions from **persisted row columns** + `inputSummary.inputContractVersion`; **never** substitute current runtime constants |
| 7–8 | D1 integrity: **CANONICAL_SELECTION_INTEGRITY** only; `perSessionInspectionStatus=NOT_EVALUATED` |
| 9 | Digest / revision-lineage / digest-coverage integrity: **D4+** |
| 10–11 | `profileStatus` primary usability; orthogonal `profileFlags[]` |
| 12 | Equal `anchorAt` → order only; **not** auto-exclusion |
| 13 | `profileGeneratedAt` envelope only; **excluded** from canonical input fingerprint |
| 14–15 | D3 materialization **conditional**; no production materialization or shadow activation before **M3.3F** authorization |
| 16–17 | M3.3E health/risk/confidence; M3.3H customer Health UI separate from internal longitudinal engineering |

**Next engineering slice:** **M3.3D D1** — bounded canonical longitudinal input reader + inclusion policy (**not started**).

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
| C5A `overallStatus` per session | **B** (inclusion gate — **D4+ only**) | Full C5A digest/revision integrity is **not** evaluated in **D1**; when enabled later, `INTEGRITY_WARNING` may exclude; `INTEGRITY_PARTIAL` is coverage metadata only (§12) |

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
| Voltage timestamp quality | Mis-ordered or weak provider times | Session-level digest integrity (**D4+**); **D1** does not apply integrity-based exclusion |
| Environmental temperature | Confounds absolute mV | **Record only** (best-effort from charge raw); **no correction in M3.3D** |
| Vehicle config / battery replacement / provider change | Step changes in series | **Segment boundary** metadata (**DECISION_REQUIRED** detection — likely manual/ops until automated signals exist) |
| Policy version changes (C1/C2/C3 tuple) | Non-comparable feature semantics | **Version segmentation** (§6) — never silent merge |

**Legend:** **Exclusion gate** = row/session omitted from default series. **Stratification** = separate sub-series or tagged dimension. **Quality metadata** = included but flagged. **Record only** = stored, not used to adjust values.

---

## 5. Canonical inclusion contract

### 5.1 Input row authority (bounded — C5A-equivalent)

**Invariant:** `LONGITUDINAL_CANONICAL_SELECTION_EQUIVALENT_TO_C5A=YES`

M3.3D **must not** load all feature revisions per session. C5A.1 removed the unbounded pattern; M3.3D follows the same bounded canonical path as C5A inspection snapshots.

**Forbidden for M3.3D reader:** `RestSessionFeatureRepository.listFeatureRowsForSession()` — documented in repository as *legacy unbounded list — avoid in inspection paths (C5A.1)*.

**Required bounded canonical candidate retrieval (per session, current runtime version scope):**

At most **four** rows — highest `semanticRevision` each for:

| `computationPhase` | `sessionTrust` |
|--------------------|----------------|
| INCREMENTAL | VALID |
| INCREMENTAL | INVALIDATED |
| FINAL | VALID |
| FINAL | INVALIDATED |

Implementation reference: `listCanonicalCandidateRows()` → `selectCanonicalRestSessionFeatureShadowRow({ sessionStatus, endReason, rows: candidates })` (same as `loadRestSessionFeatureInspectionReadSnapshot` in C5A.2).

**Preferred longitudinal read architecture (no N×unbounded loops):**

1. **Bounded page** of `BatteryRestSession` rows for `(organizationId, vehicleId)` in window (cap N sessions).
2. **Bounded batch** canonical-candidate retrieval for those `restSessionId`s (≤4 rows × N sessions per active version segment; batched SQL/`IN` queries — not one unbounded `findMany` per session).
3. **Same** `selectCanonicalRestSessionFeatureShadowRow()` policy per session (requires paired `sessionStatus` + `endReason` from the rest session row).
4. Deterministic profile assembly (inclusion policy, ordering, version segments).

**Future multi-version support:** candidate retrieval stays bounded per  
`(restSessionId, featureModelVersion, retentionPolicyVersion, chargeOpportunityPolicyVersion, computationPhase, sessionTrust)` — never “all revisions for session”.

**Persist in profile point:** `canonicalFeatureRowId`, `semanticRevision`, persisted version authority (§5.1a), scalar features, `inputDigest`.

**Still forbidden:** picking highest revision globally; recomputing retention from raw GE; using non-canonical revisions in the default profile.

### 5.1a Persisted version authority (historical rows)

**Schema fact:** `BatteryRestSessionFeature` persists **`featureModelVersion`**, **`retentionPolicyVersion`**, **`chargeOpportunityPolicyVersion`** as columns. **`inputContractVersion`** is **not** a column — it lives inside persisted **`inputSummary`** (`RestSessionFeatureInputSnapshotV1.inputContractVersion`).

**C5A caveat:** `M3_3C_C5A_V1` response `versionTuple` for **current** inspection is built from **runtime constants**; repository queries scope to the **current** triple of column versions. That top-level tuple is **not** sufficient historical authority for arbitrary old rows in a multi-version longitudinal container.

**Per longitudinal observation, version authority MUST be:**

| Field | Source |
|-------|--------|
| `featureModelVersion` | Persisted feature **row column** |
| `retentionPolicyVersion` | Persisted feature **row column** |
| `chargeOpportunityPolicyVersion` | Persisted feature **row column** |
| `inputContractVersion` | Parsed from canonical row **`inputSummary.inputContractVersion`** with snapshot shape validation |

**Forbidden:** substituting `REST_SESSION_*_VERSION` runtime constants for historical row provenance when building observations or version segments.

**Unresolved input contract:**

| Condition | Outcome |
|-----------|---------|
| `inputSummary` missing or not object | `INPUT_CONTRACT_VERSION_UNRESOLVED` on observation + exclusion reason |
| `inputContractVersion` missing / wrong type | `INPUT_CONTRACT_VERSION_UNRESOLVED` |
| Known contract id but failed shape validation | `INPUT_CONTRACT_VERSION_UNRESOLVED` |

Observations with `INPUT_CONTRACT_VERSION_UNRESOLVED` may appear in **coverage inventory** but **must not** enter default comparability series until resolved.

**Forward invariant (no D0.1 migration):**

Any future **input-contract semantic change** MUST either:

- **A.** bump **`featureModelVersion`** (preferred alignment with C3 digest boundaries), **or**
- **B.** persist **`inputContractVersion`** as an independently queryable column **before** cross-version longitudinal support depends on JSON-only reads.

If neither is satisfied at D1 implementation time → **DECISION_REQUIRED** (`DEC-M3.3D-005`) before multi-version production profiles.

**D1 initial scope:** single active column-version triple (same filter as today’s C5 repository `sessionVersionWhere`) + **`inputContractVersion` from `inputSummary`** per canonical row.

### 5.2 Session-level inclusion rules (proposed defaults)

| Rule | Default | Status |
|------|---------|--------|
| Canonical row exists (bounded C5A-equivalent selection) | Required | **VALIDATED** |
| `sessionTrust=VALID` on canonical row | Required for default series | **VALIDATED** |
| `sessionStatus=INVALIDATED` | Exclude | **VALIDATED** |
| `inputContractVersion` resolvable from `inputSummary` | Required for default comparability series | **VALIDATED** (D0.1); else `INPUT_CONTRACT_VERSION_UNRESOLVED` |
| C5A `INTEGRITY_WARNING` / digest exclusion | **Not applied in D1** | **D4+** bounded integrity slice (§12) |
| C5A `INTEGRITY_PARTIAL` digest coverage | **Not applied in D1** | **D4+**; `perSessionInspectionStatus=NOT_EVALUATED` in D1 |
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
    profileGeneratedAt: string; // envelope only — NOT in scientific/idempotency fingerprint (§10)
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

  profileStatus: LongitudinalProfilePrimaryStatus;
  profileFlags: LongitudinalProfileDiagnosticFlag[];
  statusReasons: LongitudinalProfileReason[];
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
    inputContractVersion: string; // from inputSummary — not runtime constants
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
    perSessionInspectionStatus: 'NOT_EVALUATED'; // D1 default; D4+ may set OK | INTEGRITY_PARTIAL | INTEGRITY_WARNING
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

- **Source of truth:** canonical C3 rows + inclusion policy code — **deterministic** function of persisted inputs (§5.1a fingerprint). **`profileGeneratedAt` is envelope metadata only** and **must not** appear in canonical input fingerprint or scientific equality comparison.
- **Optional materialization (D3+):** append-only profile revision — **conditional**; no production activation before **M3.3F** (§15).
- **Recomputation:** new policy version → new profile revision; never update prior revision rows.
- **Multi-replica:** compute is read-only until materialization; writers use same idempotency as C3 (**DECISION_REQUIRED** at D3).
- **M3.3E consumption:** reads profile revision **or** invokes same pure function — must not fork logic.

**No schema/migration in D0 / D0.1.**

**Canonical input fingerprint (deterministic only):**

- `organizationId`, `vehicleId`
- `profilePolicyVersion`
- normalized window parameters (`maxSessions`, lookback bounds, cursor if paged)
- deterministically ordered list of `(canonicalFeatureRowId, inputDigest)` for included observations
- persisted version authority fields used for segmentation (row columns + resolved `inputContractVersion`)

**Explicitly excluded from fingerprint:** `profileGeneratedAt`, wall-clock generation time, request id, replica id.

Conceptual idempotency key (future materialization):

- `long-profile:{vehicleId}:{profilePolicyVersion}:{canonicalInputFingerprint}`

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

**Per-session DB pattern (conceptual — bounded):**

1. Page rest sessions for vehicle in window (cap N).
2. Batch bounded canonical-candidate fetch (≤4 rows per session per version segment) — **never** `listFeatureRowsForSession()`.
3. In-memory `selectCanonicalRestSessionFeatureShadowRow()` per session (C5A-equivalent).
4. Parse `inputContractVersion` from each canonical row’s `inputSummary` (§5.1a).
5. **D1:** no full C5A `inspectSession()` per session (no N+1 unbounded inspection). **D4+:** optional batched C5A-equivalent integrity acquisition (§12).

---

## 12. Integrity / failure semantics

### 12.1 Integrity dimensions (do not collapse)

Reuse **C5A semantics** when evaluated — **no second integrity policy**. Separate dimensions:

| Dimension | Meaning | **D1 mandatory?** |
|-----------|---------|---------------------|
| **CANONICAL_SELECTION_INTEGRITY** | Bounded candidates → `selectCanonicalRestSessionFeatureShadowRow` resolves or not | **YES** |
| **DIGEST_INTEGRITY** | Checked rows re-hash to `inputDigest` | **NO** (D4+ slice) |
| **REVISION_LINEAGE_INTEGRITY** | Semantic revision gaps / duplicates vs aggregate | **NO** (D4+ slice) |
| **DIGEST_COVERAGE** | FULL vs BOUNDED_LATEST_WINDOW (`INTEGRITY_PARTIAL`) | **NO** (D4+ slice) |

**D1 rule:** `perSessionInspectionStatus` = **`NOT_EVALUATED`**. D1 **must not** claim `INTEGRITY_WARNING` exclusion was applied. Inclusion/exclusion in D1 uses **canonical selection + inclusion policy gates only** (trust, charge class, points, `INPUT_CONTRACT_VERSION_UNRESOLVED`, etc.).

**D4+ (preferred):** bounded batch acquisition reusing C5A inspection **primitives** (snapshot loader + integrity helpers) — **not** N independent full `inspectSession()` workflows with unbounded revision loads per session.

When digest integrity **is** evaluated (D4+):

- `INTEGRITY_WARNING` → exclude from default series (or quarantine flag)
- `INTEGRITY_PARTIAL` → include with `digestCoverage=PARTIAL` metadata; **not** a health signal

### 12.2 Profile status composition (primary + flags)

Overlapping conditions (version segments + truncated lookback + future integrity limits) require **orthogonal diagnostics**.

**Primary `profileStatus`** — single lifecycle / usability state (no health semantics):

| `LongitudinalProfilePrimaryStatus` | Meaning |
|-----------------------------------|---------|
| `OK` | Default series has minimum included sessions per policy |
| `INSUFFICIENT_SESSIONS` | Below minimum for descriptive series |
| `NO_ELIGIBLE_SESSIONS` | Zero sessions after inclusion gates |
| `FAILED` | Query/contract failure |

**`profileFlags[]`** — zero or more independent diagnostics (all may be true together):

| Flag | Meaning |
|------|---------|
| `VERSION_SEGMENTED` | >1 version segment in container |
| `PARTIAL_COVERAGE` | Lookback/window truncated or high exclusion rate |
| `TRUNCATED_OLDER_SESSIONS` | Sessions beyond max window omitted |
| `INTEGRITY_LIMITED` | D4+: some sessions excluded solely for integrity (not D1) |
| `INPUT_CONTRACT_UNRESOLVED_PRESENT` | At least one candidate had unresolved input contract |
| `PROVISIONAL_SESSIONS_INCLUDED` | Active INCREMENTAL sessions included when policy allows |

**Deterministic primary precedence** (when deriving primary from flags — flags remain set):

1. `FAILED`
2. `NO_ELIGIBLE_SESSIONS`
3. `INSUFFICIENT_SESSIONS`
4. else `OK`

**`statusReasons[]`:** machine-readable aggregate counts (exclusion reason histogram, segment count, etc.).

### 12.3 Exclusion reasons (`LongitudinalExclusionReason`)

`NO_CANONICAL_ROW`, `SESSION_INVALIDATED`, `SESSION_TRUST_INVALIDATED`, `INPUT_CONTRACT_VERSION_UNRESOLVED`, `INTEGRITY_WARNING` (**D4+ only**), `CHARGE_CLASS_FILTER`, `INSUFFICIENT_REST_POINTS`, `INSUFFICIENT_OBSERVATION_SPAN`, `ANCHOR_UNAVAILABLE`, `VERSION_FILTER`, `PROVISIONAL_INCREMENTAL`, `OUTSIDE_LOOKBACK`

**Not an exclusion reason:** equal `anchorAt` across distinct `restSessionId` values — ordering uses `(anchorAt, restSessionId)`; timestamp collision alone is valid.

**Per-session:** retain **`exclusionReasons[]`** — do not collapse to one boolean.

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
| **D1** | Bounded canonical longitudinal **input reader** + inclusion policy + contract types | Unit/integration tests on **fixtures + controlled test DB**; **no production flag**; `perSessionInspectionStatus=NOT_EVALUATED` |
| **D2** | Deterministic **profile assembly** (observations, version segments, primary status + flags, exclusions) | Pure function + golden tests; same non-prod validation surfaces as D1 |
| **D3** | **Persistence / materialization** — **CONDITIONAL** | Schema/migration **proposal only** after D2; **no production materialization** and **no flag enable** before **M3.3F** authorization; if natural fleet C3 evidence is required for schema sign-off → **defer D3 final approval until after relevant M3.3F read-only/shadow evidence** |
| **D4** | **Inspection / observability** + optional **bounded** C5A-equivalent integrity batch | Ops CLI / metrics; digest + lineage integrity dimensions; still no customer UI |
| **D5** | **Integration hardening** | Postgres, multi-version segmentation, concurrency/idempotency, integrity coupling tests |

**Sequencing vs M3.3F (non-circular):**

- **`BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=false`** on production today → fleet natural C3 rows absent until **M3.3F** explicitly authorizes production shadow validation.
- **D1/D2** do **not** require production flag or natural fleet data.
- **D3** must **not** be interpreted as “turn on shadow flag for production materialization.” Production profile materialization remains **forbidden** until **M3.3F+** explicit authorization (and later cutover stages as applicable).
- **M3.3F** = authorized production shadow validation stage for C3 pipeline — prerequisite for production-realistic longitudinal validation, not a blocker for merging D1/D2 code that stays flag-gated OFF.

**Alternative considered:** merge D1+D2 — rejected for review clarity.

**D0 / D0.1:** do not enable any flag.

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
| **DEC-M3.3D-005** | Input-contract column vs model-version bump for cross-version longitudinal | **DECISION_REQUIRED** (D1) |
| **BLOCK-M3.3D-001** | No fleet C3 rows while shadow flag OFF | Natural **production** validation blocked until **M3.3F** — **not** a blocker for D1/D2 fixture validation |
| **BLOCK-M3.3D-002** | Temperature alignment insufficient for adjusted trends | Defer to M3.3E |
| **BLOCK-M3.3D-003** | Battery replacement / config change auto-segmentation | **DECISION_REQUIRED** — no automatic signal in C3 today |

---

## Non-effects (D0 + D0.1)

- No schema / migration / runtime service / worker / queue
- No feature flag activation / production deploy / backfill
- No `BatteryAssessment` / `BatteryPublication` / `BatteryFeatures` writes
- No customer API or UI
- No M3.3E health interpretation
- No D1 implementation in D0.1

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
