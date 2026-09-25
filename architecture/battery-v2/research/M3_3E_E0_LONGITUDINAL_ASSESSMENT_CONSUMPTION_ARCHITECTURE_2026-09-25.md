# M3.3E E0 — Longitudinal Assessment Consumption Architecture Audit

**Date:** 2026-09-25  
**Status:** **E0 + E0.1 + E0.2 COMPLETE ON MAIN** — merged PR #1761 @ merge `658b804d74fc3fe6290f504ba3c81d7e642c3903` (PR head `b2685a0f88d17ce251d3dc2fcb84d2a6a42506e5`)  
**Consumption contract:** `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1` · **`M3_3E_E1_IMPLEMENTATION_READY=YES`** · **`M3_3E_HEALTH_MODEL_IMPLEMENTED=NO`** · no runtime implementation on main  
**Upstream complete on main:** M3.3D D0–D4 (D4 engineering V1 PR #1754 @ merge `9a3e457d9`)

**Runtime gates (unchanged):** **`D3_RUNTIME_REACHABLE=NO`** · **`D4_RUNTIME_REACHABLE=NO`** · **`PRODUCTION_MATERIALIZATION_READY=NO`**

**Normative inputs:** `CURRENT_STATE.md`; `M3_3D_D0_*` … `M3_3D_D4_*` architecture/engineering docs; D2/D3/D4 TypeScript contracts (`longitudinal-profile.types.ts`, `longitudinal-profile-scientific-projection.ts`, `longitudinal-integrity-inspection.types.ts`, `longitudinal-integrity-inspection.service.ts`); existing LV assessment policies (`lv-evidence-selection.policy.ts`, `lv-estimated-health-assessment.policy.ts`); `docs/architecture/battery-lv-estimated-health-assessment.md`.

---

## 1. Scope

E0 freezes the **deterministic consumption boundary** between:

- **D3** materialized scientific longitudinal profile (`LongitudinalScientificProfileProjectionV1` persisted as `scientificProfileJson` + revision identity metadata), and  
- **D4** integrity inspection overlay (`M3_3D_D4_INTEGRITY_INSPECTION_V1` / `D4InspectionOutcome`),

→ **future M3.3E** battery-health **model input** (`M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1`).

E0 answers:

> What exact longitudinal evidence may a future battery-health model consume, under what integrity/version conditions, and how is that input identified deterministically?

E0 does **not** answer:

> What is the battery health?

**Forbidden in E0:** health score, SOH %, degradation, failure probability, risk class, confidence tier, recommendation, `BatteryAssessment` / `BatteryPublication` / `BatteryFeatures` writes, runtime, Nest/API/UI/CLI, flags, D3 materialization (M3.3F), production cutover (M3.3G).

---

## 2. Authority chain

```
BatteryRestSession
  → C3 BatteryRestSessionFeature (append-only)
  → D1 longitudinal input inventory
  → D2 assembleLongitudinalProfileV1 (M3_3D_LONGITUDINAL_PROFILE_V1)
  → D3 scientific projection + fingerprint + revision row (internal; not production-reachable)
  → D4 read-only integrity inspection overlay (internal; not production-reachable)
  → M3.3E E1+ pure consumption adapter (future)
  → M3.3E model semantics (future; not E0)
  → M3.3G persistence/publication cutover (future; explicit authorization)
```

**Orthogonal production path (today):**

```
BatteryMeasurement[]
  → selectLvAssessmentEvidence()
  → computeLvEstimatedHealthAssessment()
  → BatteryAssessmentType.LV_ESTIMATED_HEALTH
```

These paths may share underlying telemetry. **E0 does not fuse them.**

---

## 3. Current BatteryAssessment reality

| Field | Value |
|-------|-------|
| Production type | `BatteryAssessmentType.LV_ESTIMATED_HEALTH` |
| Evidence source | `BatteryMeasurement[]` (rest/crank/workshop subsets per policy) |
| Selection | `selectLvAssessmentEvidence()` (`LV_EVIDENCE_SELECTION_POLICY_VERSION`) |
| Computation | `computeLvEstimatedHealthAssessment()` (`LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION`) |
| Outputs | `estimatedHealthScore`, confidence, chemistry context, persisted `BatteryAssessment` |

Longitudinal D3/D4 evidence originates from **rest-session feature rows**, not from the LV measurement selection pipeline.

**E0 decisions:**

| Decision | Value |
|----------|-------|
| `EXISTING_LV_ESTIMATED_HEALTH_AUTOMATIC_FUSION_WITH_D3_D4` | **NO** |
| `EXISTING_LV_ESTIMATED_HEALTH_SEMANTICS_CHANGED_IN_E0` | **NO** |
| `BATTERY_ASSESSMENT_PERSISTENCE_AUTHORIZED_IN_E0` | **NO** |
| `EXISTING_LV_ASSESSMENT_PATH_CHANGED` | **NO** |

---

## 4. Existing LV assessment compatibility audit

| Question | Answer |
|----------|--------|
| Is M3.3E longitudinal evidence semantically the same model input as LV estimated health? | **NO** — different contracts, provenance, and feature vocabulary. |
| May E0 inject longitudinal evidence as additional `BatteryMeasurement` candidates? | **NO** — `LONGITUDINAL_EVIDENCE_MAPPED_TO_BATTERY_MEASUREMENT=NO`. |
| Could this double-count underlying REST telemetry? | **YES, potentially** — shared rest periods may appear in both pipelines if fused without an explicit migration contract. |
| May M3.3E reuse `LV_ESTIMATED_HEALTH` without a frozen compatibility/migration contract? | **NO** (strong default) — persistence mapping deferred to M3.3G. |
| Does E0 change production assessment/publication behavior? | **NO**. |

`DOUBLE_COUNTING_RISK_DOCUMENTED=YES`

---

## 5. D3 + D4 pair identity (fail-closed)

M3.3E must **never** consume a D3 revision with an unrelated D4 inspection.

### 5.1 Required caller-supplied binding

The consumer supplies **one explicit pair**:

- D3 revision identity: `organizationId`, `vehicleId`, `revisionId`, `canonicalProfileFingerprint`, plus supported contract versions from revision envelope / parsed scientific JSON.
- D4 outcome for **the same** `revisionId` from `LongitudinalIntegrityInspectionService.inspectRevision({ organizationId, vehicleId, revisionId })`.

**`E0_IMPLICIT_LATEST_REVISION_SELECTION=NO`** — operational “newest row by `materializedAt`” is not scientific selection authority (per D3 architecture).

### 5.2 Equality checks (pair validation)

| Field | D3 authority | D4 authority | Rule |
|-------|--------------|--------------|------|
| Tenant | revision row / profile `organizationId` | `inspection.identity.organizationId` | Must match |
| Vehicle | revision row / profile `vehicleId` | `inspection.identity.vehicleId` | Must match |
| Revision | revision `id` | `inspection.identity.revisionId` | Must match |
| Fingerprint | revision `canonicalProfileFingerprint` | `inspection.identity.canonicalProfileFingerprint` | Must match |
| Profile contract | `longitudinalProfileContractVersion` | (from D3 only) | Must be `M3_3D_LONGITUDINAL_PROFILE_V1` |
| Profile policy | `profilePolicyVersion` | (from D3 only) | Must be `M3_3D_PROFILE_POLICY_V1` |
| Inspection contract | — | `inspection.inspectionContractVersion` | Must be `M3_3D_D4_INTEGRITY_INSPECTION_V1` |

Any mismatch → **reject pair** (no assessment input struct).

### 5.3 Machine-readable pair rejection codes (E0)

| Code | Meaning |
|------|---------|
| `REVISION_NOT_FOUND` | D4 outcome status (no D3 pairing attempted) |
| `REVISION_SELF_INTEGRITY_FAILED` | D4 top-level or materialized revision self-integrity failed |
| `D3_D4_IDENTITY_MISMATCH` | org / vehicle / revisionId / fingerprint mismatch |
| `UNSUPPORTED_D3_PROFILE_CONTRACT` | Not `M3_3D_LONGITUDINAL_PROFILE_V1` |
| `UNSUPPORTED_D3_PROFILE_POLICY` | Not `M3_3D_PROFILE_POLICY_V1` |
| `UNSUPPORTED_D4_INSPECTION_CONTRACT` | Not `M3_3D_D4_INTEGRITY_INSPECTION_V1` |
| `MALFORMED_D3_SCIENTIFIC_PROFILE` | `scientificProfile` fails D4 strict parser (see §5.4) |
| `D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH` | Parsed profile recomputed fingerprint ≠ `revisionIdentity.canonicalProfileFingerprint` |
| `D3_D4_PROFILE_SLICE_MISMATCH` | D4 `profileSlice` ≠ D3 partition for same `restSessionId` |
| `D3_D4_CONTRACT_INCONSISTENCY` | Impossible D4 disposition vs self-integrity (e.g. DEFAULT `NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED` when revision self-integrity OK) |

These are **input-contract failures**, not health results.

### 5.4 Scientific profile bound to revision identity (E0.1)

**`SCIENTIFIC_PROFILE_BOUND_TO_REVISION_IDENTITY=YES`**

E1 must not trust caller-supplied `revisionIdentity` without proving the **`scientificProfile` payload** belongs to that identity.

**Runtime validation (E0.1):**

| Check | Rule |
|-------|------|
| `scientificProfile.organizationId` | `=== revisionIdentity.organizationId` |
| `scientificProfile.vehicleId` | `=== revisionIdentity.vehicleId` |
| `scientificProfile.longitudinalProfileContractVersion` | `=== revisionIdentity.longitudinalProfileContractVersion` (and supported contract gate) |
| `scientificProfile.profilePolicyVersion` | `=== revisionIdentity.profilePolicyVersion` (and supported policy gate) |
| D3 scientific fingerprint | Recompute using **existing** D3 authority: `canonicalFeatureInputUtf8(...)` → `sha256HexLowercaseUtf8(...)` on the exact scientific projection; require `=== revisionIdentity.canonicalProfileFingerprint` |

**`E1_RECOMPUTES_D3_SCIENTIFIC_FINGERPRINT=YES`** — do **not** invent a new fingerprint algorithm.

Substitution attack (profile B + identity A + D4 for A) → **`D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH`**.

### 5.5 E1 strict runtime validation (E0.1)

**`E1_REUSES_D4_STRICT_PROFILE_VALIDATION=YES`** · **`E1_TRUSTS_TYPESCRIPT_SHAPE_ONLY=NO`**

Preferred E1 API:

```typescript
buildLongitudinalAssessmentInputV1({
  scientificProfile: unknown,
  revisionIdentity: M3_3E_RevisionIdentityV1,
  d4Outcome: D4InspectionOutcome,
}): M3_3E_BuildOutcome;
```

Internally: `parseLongitudinalScientificProfileProjectionV1(...)` from D4 strict parser on `scientificProfile`. Malformed → **`MALFORMED_D3_SCIENTIFIC_PROFILE`**. Do **not** duplicate or loosen the D4 parser.

### 5.6 `M3_3E_RevisionIdentityV1` (E0.2)

**`REVISION_IDENTITY_V1_DEFINED=YES`** · **`REVISION_IDENTITY_INCLUDES_WALL_CLOCK=NO`**

Normative caller-supplied revision envelope (non-scientific wall clock excluded):

```typescript
import type {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';

export type M3_3E_RevisionIdentityV1 = {
  organizationId: string;
  vehicleId: string;
  revisionId: string;

  /** 64-char lowercase SHA-256 hex — same authority as D3 revision row */
  canonicalProfileFingerprint: string;

  longitudinalProfileContractVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION;
  profilePolicyVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION;
};
```

**Must NOT include:** `materializedAt`, `createdAt`, or any inspection/request timestamp as identity.

**E1 validation (fail-closed before pairing):**

| Field | Rule |
|-------|------|
| `organizationId`, `vehicleId`, `revisionId` | Non-empty strings |
| `canonicalProfileFingerprint` | Valid 64-char lowercase hex (reuse D3 fingerprint validation authority where applicable) |
| Contract / policy literals | Must equal supported sealed constants (`M3_3D_LONGITUDINAL_PROFILE_V1`, `M3_3D_PROFILE_POLICY_V1`) |

Then apply §5.4 scientific profile binding (parsed profile ↔ this identity + recomputed fingerprint).

---

## 6. D4 outcome gate (revision-level)

| D4 `D4InspectionOutcome.status` | E0 action |
|-----------------------------------|-----------|
| `REVISION_NOT_FOUND` | **REJECT** — no input |
| `REVISION_SELF_INTEGRITY_FAILED` | **REJECT** — no input |
| `OK` | Continue; evaluate `inspection.materializedRevision.selfIntegrity` |

If `OK` but `materializedRevision.selfIntegrity === 'SELF_INTEGRITY_FAILED'`:

- **`SELF_FAILED_D3_REVISION_CONSUMABLE_BY_M3_3E=NO`**
- Profile is **forensic-only**; per-session D4 findings may remain diagnostic context only.

If `materializedRevision.selfIntegrity === 'SELF_INTEGRITY_OK'`, evaluate per-session eligibility (§7).

**`D4_OVERALL_STATUS_ALONE_IS_MODEL_GATE=NO`** — do not reject solely on `profile.overallStatus` ∈ {`SOURCE_EVIDENCE_LIMITED`, `INTEGRITY_PARTIAL`} when eligible DEFAULT sessions exist.

---

## 7. Per-session eligibility (integrity authority)

D4 `integrityQualifiedDisposition` on **`profileSlice === 'DEFAULT'`** per-session rows is the assessment-grade gate.

| Disposition | M3.3E assessment-grade |
|-------------|------------------------|
| `ELIGIBLE` | **Included** (`M3_3E_DEFAULT_ELIGIBLE_CONSUMED=YES`) |
| `QUARANTINED_INTEGRITY_WARNING` | **Excluded** (`M3_3E_QUARANTINED_CONSUMED=NO`) |
| `SOURCE_EVIDENCE_LIMITED` | **Excluded in V1** (`M3_3E_SOURCE_EVIDENCE_LIMITED_CONSUMED=NO`) |
| `NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED` | **Excluded** |
| `NOT_APPLICABLE` | Not a DEFAULT assessment candidate |

**PROVISIONAL** and **EXCLUDED** slices (`profileSlice`):

- **`M3_3E_PROVISIONAL_CONSUMED=NO`**
- **`M3_3E_EXCLUDED_CONSUMED=NO`**

May appear only in **diagnostic coverage counts**, not in `assessmentGradeObservations[]`.

**Strong V1 rule:** only **D4 DEFAULT + `ELIGIBLE`** may enter assessment-grade model input.

### 7.1 Digest coverage

`digestVerificationScope === 'BOUNDED_LATEST_WINDOW'` is **verification coverage**, not scientific corruption.

If disposition remains **`ELIGIBLE`**, retain observation as assessment-grade; carry `digestVerificationScope` in `integrityContext`.

| Decision | Value |
|----------|-------|
| `DIGEST_COVERAGE_PARTIAL_DIRECTLY_LOWERS_HEALTH` | **NO** |
| `DIGEST_COVERAGE_PARTIAL_DIRECTLY_SETS_CONFIDENCE` | **NO** |

---

## 8. Full candidate partition pairing (E0.1)

**`D3_D4_SESSION_SET_SCOPE=ALL_PROFILE_CANDIDATES`** · **`D3_D4_PROFILE_SLICE_PAIRING_REQUIRED=YES`** · **`FULL_CANDIDATE_CANONICAL_PAIRING=YES`** · **`FULL_CANDIDATE_VERSION_PAIRING=YES`**

D4 V1 `perSession[]` contains **every** D3 profile candidate exactly once — **DEFAULT**, **PROVISIONAL**, and **EXCLUDED**. E1 validates the **complete partition**, not DEFAULT observations alone.

### 8.1 Candidate set invariants

D3 candidate partition:

```
scientificProfile.observations[]
+ scientificProfile.provisionalObservations[]
+ scientificProfile.excludedSessions[]
```

Required equalities before model input:

```
scientificProfile.coverage.candidateRestSessionCount
=== observations.length + provisionalObservations.length + excludedSessions.length

d4Inspection.perSession.length
=== scientificProfile.coverage.candidateRestSessionCount
```

Every D3 candidate `restSessionId` maps to **exactly one** D4 `perSession` row. **No** extra D4 sessions. **No** missing sessions. **No** duplicate D4 `restSessionId`.

**`D3_D4_SESSION_SET_MISMATCH`** means: the set of D4 `perSession[].restSessionId` ≠ the set of all D3 candidate `restSessionId` values (full partition). **Not** “D4 set vs DEFAULT-only”.

**`DUPLICATE_SESSION_MAPPING`**: more than one D4 row for the same `restSessionId`.

### 8.2 Profile slice ↔ D3 partition (fail-closed)

| D3 source | Required D4 `profileSlice` |
|-----------|------------------------------|
| `observations[]` | `DEFAULT` |
| `provisionalObservations[]` | `PROVISIONAL` |
| `excludedSessions[]` | `EXCLUDED` |

Wrong slice for a known candidate → **`D3_D4_PROFILE_SLICE_MISMATCH`**.

### 8.3 Canonical + version pairing (all three slices)

Validate **before** building assessment-grade arrays — for **every** paired candidate, not only ELIGIBLE DEFAULT rows.

**DEFAULT / PROVISIONAL:**

- D3 `canonical.canonicalFeatureRowId` `===` D4 `canonicalFeatureRowId`
- D4 `versionTuple` **non-null**
- D4 `inputContractResolution === 'RESOLVED'`
- D4 four version fields `===` D3 `versionTuple` (`featureModelVersion`, `retentionPolicyVersion`, `chargeOpportunityPolicyVersion`, `inputContractVersion`)

**EXCLUDED:**

- If D3 `canonical === null` → D4 `canonicalFeatureRowId` must be **null**
- If D3 `canonical != null` → `canonicalFeatureRowId` must match
- D3 excluded `version` may be **null** or a tuple envelope with `inputContractResolution: 'RESOLVED' | 'UNRESOLVED'` and `inputContractVersion: string | null`
- D4 `versionTuple` must match that **exact** state (unresolved excluded contract is **not** a pairing error merely because `inputContractVersion` is null)

Mismatch → **`D3_D4_CANONICAL_REFERENCE_MISMATCH`** or **`D3_D4_VERSION_TUPLE_MISMATCH`**.

### 8.4 Assessment-grade subset (after full partition passes)

Only after §8.1–8.3 pass, apply §7 eligibility: **DEFAULT + `ELIGIBLE`** → `assessmentGradeObservations[]`.

---

## 9. Version segmentation (preserve D2 boundaries — E0.1)

**`CROSS_VERSION_POOLING_DEFAULT=NO`** · **`VERSION_TUPLE_PRESERVED=YES`** · **`ORIGINAL_D2_SEGMENT_BOUNDARIES_PRESERVED=YES`** · **`NON_ADJACENT_EQUAL_VERSION_SEGMENTS_MERGED=NO`** · **`SOURCE_SEGMENT_INDEX_PRESERVED=YES`**

**`E0_IMPLICIT_SEGMENT_WINNER=NO`**

### 9.1 Segment membership authority

Use original D3 `versionSegments[]` (from D2 assembly) plus ordered DEFAULT `observations[]`. **Do not** reconstruct segments solely by grouping tuple equality after D4 filtering.

E1 may validate D2 segment consistency but must **not** alter D2 scientific segmentation.

### 9.2 `eligibleVersionSegments[]` (normative)

Derived from **original** D2 `versionSegments[]` in **source order**:

```typescript
eligibleVersionSegments: Array<{
  sourceSegmentIndex: number; // D2 versionSegments[].segmentIndex
  versionTuple: LongitudinalProfileVersionTupleV1;
  observationCount: number;
  firstAnchorAt: string;
  lastAnchorAt: string;
  restSessionIds: string[];
}>;
```

Rules:

- Preserve D2 segment **order** and **identity** (`sourceSegmentIndex`)
- Include only **ELIGIBLE DEFAULT** observations belonging to that source segment (membership from D2 segment boundaries, not post-filter tuple regrouping)
- **Omit** a source segment when zero eligible observations remain
- **Never** merge two different `sourceSegmentIndex` values even if tuples match (e.g. D2 pattern A→B→A must remain **three** segments when all eligible; if B is fully filtered, emit **two** segments — not one merged A)

**`ELIGIBLE_SEGMENT_WINDOW_DERIVATION_FROZEN=YES`** (E0.2) — for each emitted segment:

| Field | Derivation |
|-------|------------|
| `observationCount` | Count of ELIGIBLE DEFAULT observations retained from that `sourceSegmentIndex` |
| `restSessionIds` | Those observations’ ids in canonical E1 ordering (§16.3) |
| `firstAnchorAt` | First retained eligible observation in that segment (same ordering) |
| `lastAnchorAt` | Last retained eligible observation in that segment |
| Zero retained | Segment **omitted** (not emitted) |
| One retained | `firstAnchorAt === lastAnchorAt` |

Do **not** preserve original D2 segment first/last anchors when boundary observations were filtered out.

Removed/quarantined observations do **not** imply cross-segment continuity.

---

## 10. Time authority

| Axis | Authority |
|------|-----------|
| **`M3_3E_SCIENTIFIC_TIME_AXIS`** | **`anchorAt`** (from D3 observation / rest session) |
| Not scientific time | D3 `materializedAt`, D3 `createdAt`, D4 `inspectionGeneratedAt` |
| D4 `inspectionGeneratedAt` | Inspection envelope only |

**`E0_FRESHNESS_THRESHOLD_INTRODUCED=NO`**

Ordering within segments: ascending `anchorAt` (ISO-8601 UTC strings, same discipline as D2).

---

## 11. Feature content (assessment-grade carry-forward)

Assessment-grade observations may expose **existing D3 scalar fields** (no new computation):

From `LongitudinalInputFeatureScalars` / observation:

- `shutdownToFirstRestDeltaMv`, `robustRestSlopeMvPerHour`, `minimumRestVoltageMv`, `maximumRestVoltageMv`, `medianRestVoltageMv`, `restVoltageVarianceMv2`, `numberOfValidRestPoints`, `maxActualRestAgeMs`, `maxInterObservationGapMs`, `observationSpanMs`, `missingRungCount`

Context (from D3 observation / canonical snapshot):

- `anchorResolutionStatus`, `chargeContextCompleteness`, `temperatureC`, `temperatureSource`
- `chargeOpportunityClass` (from canonical/snapshot context per D1/D2 assembly)

Plus integrity carry-forward:

- `inputDigest` (C3 canonical digest from D3 `canonical.inputDigest`)
- `integrityContext.digestVerificationScope`, relevant D4 dimension summaries as metadata only

E0 must **not** convert these to health score, rank degradation, normalize temperature, or infer SOH.

---

## 12. Temperature boundary

**`TEMPERATURE_CONTEXT_ONLY=YES`**

Carry `temperatureC` / `temperatureSource` as contextual metadata only. No thermal normalization, no health adjustment (per D0: no temperature-adjusted longitudinal comparison without new alignment evidence).

---

## 13. Charge-context boundary

Carry `chargeOpportunityClass` and `chargeContextCompleteness` without health ordering. No implicit `SUFFICIENT > PARTIAL > INSUFFICIENT` health ranking in E0.

---

## 14. Integrity vs confidence vs health (orthogonal)

| Layer | Meaning |
|-------|---------|
| **A. Scientific feature value** | What D3 observed |
| **B. Integrity / traceability** | What D4 verified |
| **C. Model confidence** | Future M3.3E model property |
| **D. Health / risk output** | Future M3.3E model output |

| Decision | Value |
|----------|-------|
| `D4_INTEGRITY_IS_MODEL_CONFIDENCE` | **NO** |
| `D4_INTEGRITY_IS_HEALTH_SCORE` | **NO** |

Do not map D4 `overallStatus` or dispositions mechanically to HIGH/MEDIUM/LOW or healthy/warning/critical.

---

## 15. `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1` (output contract)

**Assessment input only** — no health result fields.

**`E1_CONTRACT_REUSES_EXISTING_DOMAIN_TYPES=YES`** — reuse sealed D1/D2/D3/D4 types; do not introduce widened string vocabularies where a domain type already exists.

Suggested TypeScript-shaped contract (names normative for E1):

```typescript
import type { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';
import type {
  REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION,
  REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION,
} from './longitudinal-profile.constants';
import type { RestSessionFeatureInputAnchorResolutionStatus } from '../rest-session-feature-input-snapshot.types';
import type {
  LongitudinalInputFeatureScalars,
  LongitudinalInputSnapshotContext,
} from './longitudinal-input.types';
import type {
  LongitudinalProfileVersionTupleV1,
} from './longitudinal-profile.types';

export const M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION =
  'M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1' as const;

export type M3_3E_AssessmentGradeInputAvailability =
  | 'ASSESSMENT_GRADE_INPUT_AVAILABLE'
  | 'NO_ASSESSMENT_GRADE_INPUT';

export type M3_3E_ModelSufficiency = 'NOT_EVALUATED';

export type M3_3E_LongitudinalAssessmentInputV1 = {
  contractVersion: typeof M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION;

  identity: {
    organizationId: string;
    vehicleId: string;
    revisionId: string;
    canonicalProfileFingerprint: string;
    longitudinalProfileContractVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_CONTRACT_VERSION;
    profilePolicyVersion: typeof REST_SESSION_LONGITUDINAL_PROFILE_POLICY_VERSION;
    integrityInspectionContractVersion: typeof REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION;
  };

  evidenceWindow: {
    firstEligibleAnchorAt: string | null;
    lastEligibleAnchorAt: string | null;
    eligibleEvidenceSpanMs: number | null;
  };

  coverage: {
    d3DefaultObservationCount: number;
    assessmentGradeObservationCount: number;
    quarantinedIntegrityWarningCount: number;
    /** DEFAULT slice only — not profile-wide source limitation */
    sourceEvidenceLimitedCount: number;
    provisionalContextCount: number;
    excludedContextCount: number;
    d4DigestVerificationScope: D4DigestVerificationScope;
    d4Rebuildability: D4RebuildabilityStatus;
  };

  assessmentGradeObservations: Array<{
    restSessionId: string;
    anchorAt: string;
    canonicalFeatureRowId: string;
    inputDigest: string;
    versionTuple: LongitudinalProfileVersionTupleV1;
    features: LongitudinalInputFeatureScalars;
    anchorResolutionStatus: RestSessionFeatureInputAnchorResolutionStatus;
    chargeOpportunityClass: LongitudinalInputFeatureScalars['chargeOpportunityClass'];
    chargeContextCompleteness: string[];
    temperatureC: number | null;
    temperatureSource: string | null;
    integrityContext: {
      digestVerificationScope: D4DigestVerificationScope;
      integrityQualifiedDisposition: 'ELIGIBLE';
    };
  }>;

  eligibleVersionSegments: Array<{
    sourceSegmentIndex: number;
    versionTuple: LongitudinalProfileVersionTupleV1;
    observationCount: number;
    firstAnchorAt: string;
    lastAnchorAt: string;
    restSessionIds: string[];
  }>;

  modelEvaluation: {
    inputAvailability: M3_3E_AssessmentGradeInputAvailability;
    modelSufficiency: M3_3E_ModelSufficiency;
  };

  /** E0.2: exact fields only — no optional reason lists */
  diagnosticContext: {
    d4OverallStatus: D4InspectionOverallStatus;
    inspectionFlags: D4InspectionFlagV1[];
    rebuildability: D4RebuildabilityStatus;
  };

  /** Required on every successful build (including zero eligible observations) */
  consumptionInputFingerprint: string;
};
```

**`SUCCESSFUL_E1_INPUT_FINGERPRINT_REQUIRED=YES`** · **`SUCCESSFUL_E1_INPUT_FINGERPRINT_OPTIONAL=NO`** · **`ZERO_ELIGIBLE_INPUT_HAS_FINGERPRINT=YES`**

Frozen E1 result union (**`BUILD_OUTCOME_UNION_FROZEN=YES`**):

```typescript
export type M3_3E_BuildOutcome =
  | { status: 'OK'; input: M3_3E_LongitudinalAssessmentInputV1 }
  | { status: 'REJECTED'; reason: M3_3E_ConsumptionRejectReason };
```

Expected scientific contract rejections return **`REJECTED`** — no throw. Unexpected programming errors may throw.

```typescript
export type M3_3E_ConsumptionRejectReason =
  | 'REVISION_NOT_FOUND'
  | 'REVISION_SELF_INTEGRITY_FAILED'
  | 'MALFORMED_D3_SCIENTIFIC_PROFILE'
  | 'D3_SCIENTIFIC_PROFILE_FINGERPRINT_MISMATCH'
  | 'D3_D4_IDENTITY_MISMATCH'
  | 'UNSUPPORTED_D3_PROFILE_CONTRACT'
  | 'UNSUPPORTED_D3_PROFILE_POLICY'
  | 'UNSUPPORTED_D4_INSPECTION_CONTRACT'
  | 'D3_D4_SESSION_SET_MISMATCH'
  | 'D3_D4_PROFILE_SLICE_MISMATCH'
  | 'D3_D4_CANONICAL_REFERENCE_MISMATCH'
  | 'D3_D4_VERSION_TUPLE_MISMATCH'
  | 'DUPLICATE_SESSION_MAPPING'
  | 'D3_D4_CONTRACT_INCONSISTENCY';
```

---

## 16. Input availability, coverage counts, model sufficiency (E0.1)

**`COVERAGE_COUNT_SEMANTICS_FROZEN=YES`** · **`SUCCESSFUL_E1_SELF_FAILED_DEFAULT_COUNT=0`**

### 16.1 Coverage field semantics (V1)

| Field | Exact population |
|-------|------------------|
| `d3DefaultObservationCount` | `scientificProfile.observations.length` |
| `assessmentGradeObservationCount` | DEFAULT D4 rows with `integrityQualifiedDisposition === 'ELIGIBLE'` |
| `quarantinedIntegrityWarningCount` | DEFAULT D4 rows with `QUARANTINED_INTEGRITY_WARNING` |
| `sourceEvidenceLimitedCount` | DEFAULT D4 rows with `SOURCE_EVIDENCE_LIMITED` only |
| `provisionalContextCount` | `scientificProfile.provisionalObservations.length` |
| `excludedContextCount` | `scientificProfile.excludedSessions.length` |

Accounting on successful E1 input (revision self-integrity OK):

```
d3DefaultObservationCount
=== assessmentGradeObservationCount
 + quarantinedIntegrityWarningCount
 + sourceEvidenceLimitedCount
```

**`NOT_ELIGIBLE_REVISION_SELF_INTEGRITY_FAILED`** on DEFAULT rows must **not** appear when `materializedRevision.selfIntegrity === 'SELF_INTEGRITY_OK'`. If encountered → **`D3_D4_CONTRACT_INCONSISTENCY`**. E1 does **not** expose `notEligibleRevisionSelfIntegrityFailedDefaultCount` on successful inputs.

Profile-wide `SOURCE_EVIDENCE_LIMITED` from PROVISIONAL/EXCLUDED does **not** increment `sourceEvidenceLimitedCount`. Profile-wide limitation is represented only via **`diagnosticContext.d4OverallStatus`**, **`inspectionFlags`**, and **`rebuildability`** (E0.2 — no optional reference counters or reason lists).

### 16.3 Eligible evidence window derivation (E0.2)

**`ELIGIBLE_EVIDENCE_WINDOW_DERIVATION_FROZEN=YES`**

Computed from **`assessmentGradeObservations[]`** after all D3/D4 validation and D4 eligibility filtering.

**Canonical ordering** (same as fingerprint): `anchorAt` ascending, then `restSessionId` ascending via `compareUtf16CodeUnitLexicographic`.

| Case | `firstEligibleAnchorAt` | `lastEligibleAnchorAt` | `eligibleEvidenceSpanMs` |
|------|-------------------------|--------------------------|----------------------------|
| 0 eligible | `null` | `null` | `null` |
| 1 eligible | that observation’s `anchorAt` | same | `0` |
| ≥2 eligible | first ordered `anchorAt` | last ordered `anchorAt` | `Date.parse(last) - Date.parse(first)` (must be ≥ 0) |

No wall clock. No D3 `materializedAt`. No D4 `inspectionGeneratedAt`.

### 16.4 Deterministic pure output (E0.2)

**`E1_PURE_OUTPUT_DETERMINISTIC=YES`**

For the same validated `(scientificProfile, revisionIdentity, d4Outcome)`, E1 must produce logically identical output on every invocation: stable ordering, frozen field set, no caller clock, no optional implementation-dependent diagnostics.

**`E1_V1_DIAGNOSTIC_SHAPE_DETERMINISTIC=YES`** · **`E1_V1_OPTIONAL_REASON_LIST_POLICY=NONE`**

### 16.2 Input availability vs model sufficiency

| Concept | E0 rule |
|---------|---------|
| Structural availability | `assessmentGradeObservationCount > 0` → `ASSESSMENT_GRADE_INPUT_AVAILABLE` |
| Zero eligible | Valid pair → `NO_ASSESSMENT_GRADE_INPUT`, `assessmentGradeObservations=[]`, `eligibleVersionSegments=[]`, **`consumptionInputFingerprint` still required** (empty assessment-grade set bound to D3 identity/contracts) |
| Model sufficiency | **`MODEL_SUFFICIENCY=NOT_EVALUATED`** always in E0/E1 adapter |

E0 does **not** define minimum sessions/days/span/slope thresholds.

---

## 17. Consumption input fingerprint (frozen V1 preimage — E0.1)

**`M3_3E_INPUT_FINGERPRINT_REQUIRED=YES`** · **`M3_3E_FINGERPRINT_PREIMAGE_FROZEN=YES`**  
**`M3_3E_INPUT_FINGERPRINT_INCLUDES_WALL_CLOCK=NO`**

Purpose: future model idempotency / input identity for the **assessment-grade set**, distinct from D3 science fingerprint alone.

**Authority:** `canonicalFeatureInputUtf8` → `sha256HexLowercaseUtf8` (same as D3/C3 canonical paths). Do **not** invent a parallel JSON canonicalizer.

### 17.1 Normative fingerprint preimage object (V1)

Serialize this object with existing canonical JSON rules (`canonicalizeFeatureInputValue` + `serializeCanonicalJsonValue`), then SHA-256 lowercase hex:

```typescript
{
  contractVersion: 'M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1',

  organizationId: string,
  vehicleId: string,

  canonicalProfileFingerprint: string,

  longitudinalProfileContractVersion: string,
  profilePolicyVersion: string,
  integrityInspectionContractVersion: string,

  assessmentGradeObservations: Array<{
    restSessionId: string,
    anchorAt: string,
    canonicalFeatureRowId: string,
    inputDigest: string,
    versionTuple: LongitudinalProfileVersionTupleV1,

    features: LongitudinalInputFeatureScalars,

    anchorResolutionStatus: string,
    chargeOpportunityClass: string,
    chargeContextCompleteness: string[],
    temperatureC: number | null,
    temperatureSource: string | null,

    digestVerificationScope: D4DigestVerificationScope,
  }>,
}
```

**Ordering:** sort `assessmentGradeObservations` by `anchorAt` ascending, then `restSessionId` ascending using `compareUtf16CodeUnitLexicographic`.

**Exclude from preimage:** `revisionId`, `inspectionGeneratedAt`, `materializedAt`, `createdAt`, request time, wall clock, diagnostic reason lists.

**Include `canonicalProfileFingerprint`:** binds consumption input to immutable D3 scientific revision. Full observation payload makes model-input identity explicit and auditable.

Empty `assessmentGradeObservations[]` still yields a deterministic fingerprint (zero-eligible case).

### 17.2 D3 science identity ≠ D4 inspection state identity

The same immutable D3 revision may be inspected at different times; C3 retention may change rebuildability. **`consumptionInputFingerprint`** reflects the **actual assessment-grade evidence set** under the supplied D4 outcome, not wall-clock inspection time. Later source loss does not rewrite original D3 science fingerprint.

---

## 18. Non-eligible diagnostic context (E0.2)

**`NON_ELIGIBLE_EVIDENCE_SEPARATE_FROM_MODEL_INPUT=YES`**

**Coverage** carries partition counts (`provisionalContextCount`, `excludedContextCount`, DEFAULT disposition buckets). **`diagnosticContext`** carries **exactly** `{ d4OverallStatus, inspectionFlags, rebuildability }` — no optional reason lists, no optional profile-wide reference counters in V1.

Do **not** duplicate full provisional/excluded scientific payloads in assessment-grade arrays.

---

## 19. Persistence boundary (E0 non-goals)

| Strategy | E0 stance |
|----------|-----------|
| A. Reuse `LV_ESTIMATED_HEALTH` with new embedded contract | Deferred — requires M3.3G migration |
| B. New `BatteryAssessmentType` | Deferred |
| C. Pure/non-persisted M3.3E model first | **Recommended next engineering default** |

| Decision | Value |
|----------|-------|
| `E0_BATTERY_ASSESSMENT_WRITES` | **NO** |
| `E0_BATTERY_PUBLICATION_WRITES` | **NO** |
| `E1_PURE_CONSUMPTION_ADAPTER_FEASIBLE` | **YES** |

---

## 20. M3.3F boundary

E0 does **not** authorize D3 Nest registration, materialization flag, C3→D3 hooks, D4 runtime exposure, production revision writes, shadow materialization, or production data mutation.

---

## 21. M3.3G / publication boundary

E0 is not a production cutover. Publication arbitration, supersede chains, and authoritative customer-facing assessment mapping require an explicit M3.3G contract. **No publication policy changes in E0.**

---

## 22. E1 implementation shape (recommended)

**`E1_PURE_FUNCTION_FIRST=YES`**

Next slice: **M3.3E E1 — pure longitudinal assessment input adapter**

```typescript
buildLongitudinalAssessmentInputV1({
  scientificProfile: unknown,
  revisionIdentity: M3_3E_RevisionIdentityV1,
  d4Outcome: D4InspectionOutcome,
}): M3_3E_BuildOutcome;
```

Internally: parse profile via D4 strict parser; full candidate pairing §8; fingerprint §17.

- No DB, Nest provider, writes, or health algorithm in E1.
- Unit + golden tests per §23 matrix only.

---

## 23. E1 test matrix (design only — not implemented in E0/E0.1)

### Pairing (revision + identity)

- exact matching D3+D4 pair; org/vehicle/revision/fingerprint mismatch; unsupported D3/D4 contracts; D4 `REVISION_NOT_FOUND`; top-level / parseable self-integrity failure

### Full candidate pairing (E0.1)

- DEFAULT + PROVISIONAL + EXCLUDED exact set passes
- D4 missing PROVISIONAL → reject; missing EXCLUDED → reject; extra session → reject
- DEFAULT mapped as PROVISIONAL / PROVISIONAL as DEFAULT / EXCLUDED wrong slice → reject
- excluded canonical null ↔ D4 null; excluded canonical reference exact match
- unresolved excluded version tuple exact match (null `inputContractVersion` allowed when UNRESOLVED)

### Scientific profile binding (E0.1)

- profile org/vehicle/contract/policy mismatch vs revision identity → reject
- profile content altered with unchanged revision fingerprint → reject
- key-order-only JSON difference → same D3 fingerprint

### Strict validation (E0.1)

- malformed scientific JSON → reject; unknown V1 field → reject via reused D4 parser only

### Session mapping

- duplicate D4 `restSessionId`; canonical/version mismatch on any slice

### Eligibility

- DEFAULT ELIGIBLE included; QUARANTINED / SOURCE_EVIDENCE_LIMITED / self-failed excluded; PROVISIONAL/EXCLUDED excluded from model input; BOUNDED_LATEST_WINDOW + ELIGIBLE retained

### Overall status

- `SOURCE_EVIDENCE_LIMITED` from provisional-only limitation still retains ELIGIBLE DEFAULTs; `INTEGRITY_PARTIAL` ≠ poor health

### Version segments (E0.1)

- A→B→A remains 3 source segments when all eligible; B fully filtered → two segments (never one merged A)
- zero-eligible source segment omitted; `sourceSegmentIndex` preserved; counts/first/last exact

### Coverage (E0.1)

- DEFAULT bucket partition equation; provisional/excluded counts from D3 partition
- provisional-only source limitation does not increment DEFAULT `sourceEvidenceLimitedCount`

### Time

- order by `anchorAt`; `materializedAt` / `inspectionGeneratedAt` irrelevant to fingerprint

### Input availability

- >0 eligible → `ASSESSMENT_GRADE_INPUT_AVAILABLE`; 0 → `NO_ASSESSMENT_GRADE_INPUT`; `modelSufficiency` always `NOT_EVALUATED`

### Fingerprint (E0.1)

- successful input always has fingerprint; zero eligible still has fingerprint
- same payload + different `inspectionGeneratedAt` → same fingerprint
- `anchorAt` / feature / temperature / context / digest scope / eligible set changes → different fingerprint; JSON key reorder → same

### Determinism (E0.2)

- same E1 inputs → deep-equal output
- no optional diagnostics appear/disappear between runs
- D4 `inspectionGeneratedAt` change alone does not change model input or `consumptionInputFingerprint` when eligibility/evidence unchanged

### Revision identity (E0.2)

- empty `organizationId` / `vehicleId` / `revisionId` → reject
- malformed fingerprint → reject
- exact supported contract literals pass

### Evidence window (E0.2)

- zero eligible → null/null/null; one → anchor/anchor/0; multiple → first/last/exact ms; equal `anchorAt` UTF-16 `restSessionId` tie order

### Segment window (E0.2)

- boundary quarantined → segment first/last move inward; one eligible → first === last; zero eligible → segment omitted; `sourceSegmentIndex` unchanged

### Existing assessment isolation

- no `BatteryMeasurement` conversion; no assessment/publication writes

---

## 24. Open decisions (post-E0)

| ID | Topic | Default / note |
|----|-------|----------------|
| **E0-OD-001** | Future `BatteryAssessmentType` for longitudinal model vs pure compute-first | Prefer **C** until M3.3G |
| **E0-OD-002** | Optional diagnostic reason lists / extended diagnostic payloads | **DEFERRED_POST_V1** — not an E1 V1 implementer choice |
| **E0-OD-003** | Operational revision picker (which revisionId to assess) | Out of E0 — not “latest row” authority |
| **E0-OD-004** | Eventual fusion contract with `LV_ESTIMATED_HEALTH` | Explicit M3.3G+ migration only; **no automatic fusion** |

None block E1 pure adapter implementation.

---

## 25. Implementation readiness

| Gate | Status |
|------|--------|
| D3+D4 pair identity | **CLOSED** (E0.1) |
| Full candidate session set + slice pairing | **CLOSED** (E0.1) |
| Scientific profile ↔ revision identity + fingerprint recompute | **CLOSED** (E0.1) |
| E1 strict parser reuse | **CLOSED** (E0.1) |
| D4 outcome handling | **CLOSED** |
| Per-session eligibility | **CLOSED** |
| Source-limited semantics (DEFAULT vs profile-wide) | **CLOSED** (E0.1) |
| Version segmentation (D2 sourceSegmentIndex) | **CLOSED** (E0.1) |
| Coverage count semantics | **CLOSED** (E0.1) |
| Time authority | **CLOSED** |
| Input contract + required fingerprint | **CLOSED** (E0.1) |
| Build outcome union | **CLOSED** (E0.1) |
| Revision identity V1 + evidence/segment windows + deterministic diagnostics | **CLOSED** (E0.2) |
| No implicit health/confidence mapping | **CLOSED** |
| LV assessment isolation | **CLOSED** |
| Persistence boundary | **CLOSED** |
| E1 pure-function shape | **CLOSED** (E0.1) |
| Test matrix | **CLOSED** (design) |

**`M3_3E_E1_IMPLEMENTATION_READY=YES`**

**Next action:** M3.3E E1 engineering (pure function + tests). Do **not** implement health model or persistence in E1.

---

## E0 decision summary (machine checklist)

| Field | Value |
|-------|-------|
| `M3_3E_CONSUMPTION_CONTRACT_VERSION` | `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1` |
| `D3_D4_PAIR_IDENTITY_DEFINED` | **YES** |
| `E0_IMPLICIT_LATEST_REVISION_SELECTION` | **NO** |
| `SESSION_PAIRING_INTEGRITY_REQUIRED` | **YES** |
| `SELF_FAILED_D3_REVISION_CONSUMABLE_BY_M3_3E` | **NO** |
| `M3_3E_DEFAULT_ELIGIBLE_CONSUMED` | **YES** |
| `M3_3E_QUARANTINED_CONSUMED` | **NO** |
| `M3_3E_SOURCE_EVIDENCE_LIMITED_CONSUMED` | **NO** |
| `M3_3E_PROVISIONAL_CONSUMED` | **NO** |
| `M3_3E_EXCLUDED_CONSUMED` | **NO** |
| `D4_OVERALL_STATUS_ALONE_IS_MODEL_GATE` | **NO** |
| `CROSS_VERSION_POOLING_DEFAULT` | **NO** |
| `VERSION_TUPLE_PRESERVED` | **YES** |
| `E0_IMPLICIT_SEGMENT_WINNER` | **NO** |
| `M3_3E_SCIENTIFIC_TIME_AXIS` | `anchorAt` |
| `E0_FRESHNESS_THRESHOLD_INTRODUCED` | **NO** |
| `TEMPERATURE_CONTEXT_ONLY` | **YES** |
| `MODEL_SUFFICIENCY` | `NOT_EVALUATED` |
| `M3_3F_REMAINS_PENDING` | **YES** |
| `D3_D4_SESSION_SET_SCOPE` | `ALL_PROFILE_CANDIDATES` |
| `D3_D4_PROFILE_SLICE_PAIRING_REQUIRED` | **YES** |
| `FULL_CANDIDATE_CANONICAL_PAIRING` | **YES** |
| `FULL_CANDIDATE_VERSION_PAIRING` | **YES** |
| `SCIENTIFIC_PROFILE_BOUND_TO_REVISION_IDENTITY` | **YES** |
| `E1_RECOMPUTES_D3_SCIENTIFIC_FINGERPRINT` | **YES** |
| `E1_REUSES_D4_STRICT_PROFILE_VALIDATION` | **YES** |
| `E1_TRUSTS_TYPESCRIPT_SHAPE_ONLY` | **NO** |
| `SUCCESSFUL_E1_INPUT_FINGERPRINT_REQUIRED` | **YES** |
| `SUCCESSFUL_E1_INPUT_FINGERPRINT_OPTIONAL` | **NO** |
| `ZERO_ELIGIBLE_INPUT_HAS_FINGERPRINT` | **YES** |
| `M3_3E_FINGERPRINT_PREIMAGE_FROZEN` | **YES** |
| `ORIGINAL_D2_SEGMENT_BOUNDARIES_PRESERVED` | **YES** |
| `NON_ADJACENT_EQUAL_VERSION_SEGMENTS_MERGED` | **NO** |
| `SOURCE_SEGMENT_INDEX_PRESERVED` | **YES** |
| `COVERAGE_COUNT_SEMANTICS_FROZEN` | **YES** |
| `SUCCESSFUL_E1_SELF_FAILED_DEFAULT_COUNT` | **0** |
| `BUILD_OUTCOME_UNION_FROZEN` | **YES** |
| `M3_3E_E1_IMPLEMENTATION_READY` | **YES** |
| `REVISION_IDENTITY_V1_DEFINED` | **YES** |
| `REVISION_IDENTITY_INCLUDES_WALL_CLOCK` | **NO** |
| `E1_CONTRACT_REUSES_EXISTING_DOMAIN_TYPES` | **YES** |
| `ELIGIBLE_EVIDENCE_WINDOW_DERIVATION_FROZEN` | **YES** |
| `ELIGIBLE_SEGMENT_WINDOW_DERIVATION_FROZEN` | **YES** |
| `E1_V1_DIAGNOSTIC_SHAPE_DETERMINISTIC` | **YES** |
| `E1_V1_OPTIONAL_REASON_LIST_POLICY` | **NONE** |
| `E1_PURE_OUTPUT_DETERMINISTIC` | **YES** |
