# M3.3E E0 — Longitudinal Assessment Consumption Architecture Audit

**Date:** 2026-09-25  
**Status:** **ARCHITECTURE AUDIT** (docs-only; no runtime)  
**Consumption contract (frozen):** `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1`  
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

These are **input-contract failures**, not health results.

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

## 8. Cross-object session coherence

**`SESSION_PAIRING_INTEGRITY_REQUIRED=YES`**

For each D3 `observations[]` entry selected as assessment-grade, exactly one D4 `perSession[]` row must exist with:

| Check | Rule |
|-------|------|
| `restSessionId` | Equal |
| D4 `profileSlice` | `DEFAULT` |
| `canonicalFeatureRowId` | D4 equals D3 `canonical.canonicalFeatureRowId` |
| Version tuple | D4 envelope matches D3 `versionTuple` (all four parts when D3 resolved) |

Additional fail-closed codes:

| Code | Condition |
|------|-----------|
| `D3_D4_SESSION_SET_MISMATCH` | D4 session set ≠ expected D3 DEFAULT candidate set |
| `D3_D4_CANONICAL_REFERENCE_MISMATCH` | canonical row id mismatch |
| `D3_D4_VERSION_TUPLE_MISMATCH` | tuple mismatch |
| `DUPLICATE_SESSION_MAPPING` | >1 D4 row per `restSessionId` for DEFAULT slice |

---

## 9. Version segmentation

**`CROSS_VERSION_POOLING_DEFAULT=NO`** · **`VERSION_TUPLE_PRESERVED=YES`**

D2 `versionSegments[]` may contain multiple homogeneous tuples. After D4 filtering, E0 emits **`eligibleVersionSegments[]`**: each segment lists assessment-grade observations sharing one full `(featureModelVersion, retentionPolicyVersion, chargeOpportunityPolicyVersion, inputContractVersion)` tuple.

Removed/quarantined observations do **not** imply cross-segment continuity.

**`E0_IMPLICIT_SEGMENT_WINNER=NO`** — E0 must not silently pick latest/largest/longest segment. Emit **all** assessment-grade homogeneous segments; future model policy chooses support.

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

Suggested TypeScript-shaped contract (names normative for E1):

```typescript
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
    longitudinalProfileContractVersion: string;
    profilePolicyVersion: string;
    integrityInspectionContractVersion: string;
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
    anchorResolutionStatus: string;
    chargeOpportunityClass: string;
    chargeContextCompleteness: string[];
    temperatureC: number | null;
    temperatureSource: string | null;
    integrityContext: {
      digestVerificationScope: D4DigestVerificationScope;
      integrityQualifiedDisposition: 'ELIGIBLE';
    };
  }>;

  eligibleVersionSegments: Array<{
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

  diagnosticContext: {
    d4OverallStatus: D4InspectionOverallStatus;
    inspectionFlags: D4InspectionFlagV1[];
    rebuildability: D4RebuildabilityStatus;
    provisionalSummary?: { count: number; reasons?: string[] };
    excludedSummary?: { count: number; reasons?: string[] };
  };

  /** Present when pair validation succeeds and fingerprint computed */
  consumptionInputFingerprint?: string;
};
```

Pair validation failures return **`M3_3E_ConsumptionRejectOutcome`** (separate from input struct):

```typescript
export type M3_3E_ConsumptionRejectReason =
  | 'REVISION_NOT_FOUND'
  | 'REVISION_SELF_INTEGRITY_FAILED'
  | 'D3_D4_IDENTITY_MISMATCH'
  | 'UNSUPPORTED_D3_PROFILE_CONTRACT'
  | 'UNSUPPORTED_D3_PROFILE_POLICY'
  | 'UNSUPPORTED_D4_INSPECTION_CONTRACT'
  | 'D3_D4_SESSION_SET_MISMATCH'
  | 'D3_D4_CANONICAL_REFERENCE_MISMATCH'
  | 'D3_D4_VERSION_TUPLE_MISMATCH'
  | 'DUPLICATE_SESSION_MAPPING';
```

---

## 16. Input availability vs model sufficiency

| Concept | E0 rule |
|---------|---------|
| Structural availability | `assessmentGradeObservationCount > 0` → `ASSESSMENT_GRADE_INPUT_AVAILABLE` |
| Zero eligible | Valid pair but all DEFAULT quarantined/limited/absent → `NO_ASSESSMENT_GRADE_INPUT` with diagnostic counts — **not** battery failure |
| Model sufficiency | **`MODEL_SUFFICIENCY=NOT_EVALUATED`** always in E0/E1 adapter |

E0 does **not** define minimum sessions/days/span/slope thresholds.

---

## 17. Consumption input fingerprint

**`M3_3E_INPUT_FINGERPRINT_REQUIRED=YES`**  
**`M3_3E_INPUT_FINGERPRINT_INCLUDES_WALL_CLOCK=NO`**

Purpose: future model idempotency / input identity for the **assessment-grade set**, distinct from D3 science fingerprint alone.

**Authority:** reuse C3/D3 canonical serialization semantics (`canonicalizeFeatureInputValue` + `serializeCanonicalJsonValue` + SHA-256 lowercase hex from `feature-input-canonical.serializer.ts` / `longitudinal-profile-fingerprint.ts` patterns). Do **not** invent a parallel JSON canonicalizer.

Recommended preimage fields (canonical object, sorted keys):

- `contractVersion`
- `organizationId`, `vehicleId`
- `canonicalProfileFingerprint` (D3 revision)
- `longitudinalProfileContractVersion`, `profilePolicyVersion`, `integrityInspectionContractVersion`
- Ordered assessment-grade observations (ascending `anchorAt`, tie-break `restSessionId`): each entry `{ restSessionId, canonicalFeatureRowId, inputDigest, versionTuple, features, integrityContext.digestVerificationScope }`
- Eligibility marker: disposition must be `ELIGIBLE` (only eligible rows included)

**Exclude:** `inspectionGeneratedAt`, `materializedAt`, `createdAt`, request timestamps.

### 17.1 D3 science identity ≠ D4 inspection state identity

The same immutable D3 revision may be inspected at different times; C3 retention may change rebuildability. **`consumptionInputFingerprint`** reflects the **actual assessment-grade evidence set** under the supplied D4 outcome, not wall-clock inspection time. Later source loss does not rewrite original D3 science fingerprint.

---

## 18. Non-eligible diagnostic context

**`NON_ELIGIBLE_EVIDENCE_SEPARATE_FROM_MODEL_INPUT=YES`**

Carry **counts** (and optional reason summaries) for provisional/excluded/quarantined/source-limited sessions in `diagnosticContext` / `coverage`. Do **not** duplicate full provisional/excluded scientific payloads in assessment-grade arrays unless a later model policy explicitly requires it.

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
  scientificProfile: LongitudinalScientificProfileProjectionV1,
  revisionIdentity: { organizationId, vehicleId, revisionId, canonicalProfileFingerprint, ... },
  d4Outcome: D4InspectionOutcome,
}): M3_3E_BuildOutcome; // OK input | REJECT reason
```

- No DB, Nest provider, writes, or health algorithm in E1.
- Unit + golden tests per §23 matrix only.

---

## 23. E1 test matrix (design only — not implemented in E0)

### Pairing

- exact matching D3+D4 pair; org/vehicle/revision/fingerprint mismatch; unsupported D3/D4 contracts; D4 `REVISION_NOT_FOUND`; top-level / parseable self-integrity failure

### Session mapping

- one-to-one; duplicate D4 `restSessionId`; missing/extra session; canonical mismatch; version tuple mismatch

### Eligibility

- DEFAULT ELIGIBLE included; QUARANTINED / SOURCE_EVIDENCE_LIMITED / self-failed excluded; PROVISIONAL/EXCLUDED excluded from model input; BOUNDED_LATEST_WINDOW + ELIGIBLE retained

### Overall status

- `SOURCE_EVIDENCE_LIMITED` from provisional-only limitation still retains ELIGIBLE DEFAULTs; `INTEGRITY_PARTIAL` ≠ poor health

### Versions

- single segment; multiple segments; no cross-version pooling; no implicit winner

### Time

- order by `anchorAt`; `materializedAt` / `inspectionGeneratedAt` irrelevant to fingerprint

### Input availability

- >0 eligible → `ASSESSMENT_GRADE_INPUT_AVAILABLE`; 0 → `NO_ASSESSMENT_GRADE_INPUT`; `modelSufficiency` always `NOT_EVALUATED`

### Fingerprint

- same science + eligibility → same fingerprint; different `inspectionGeneratedAt` → same fingerprint; different eligible set → different fingerprint; key reorder idempotent; no wall clock in preimage

### Existing assessment isolation

- no `BatteryMeasurement` conversion; no assessment/publication writes

---

## 24. Open decisions (post-E0)

| ID | Topic | Default / note |
|----|-------|----------------|
| **E0-OD-001** | Future `BatteryAssessmentType` for longitudinal model vs pure compute-first | Prefer **C** until M3.3G |
| **E0-OD-002** | Whether diagnosticContext includes capped reason code lists vs counts-only | Counts-only minimum; reason lists optional in E1 |
| **E0-OD-003** | Operational revision picker (which revisionId to assess) | Out of E0 — not “latest row” authority |
| **E0-OD-004** | Eventual fusion contract with `LV_ESTIMATED_HEALTH` | Explicit M3.3G+ migration only; **no automatic fusion** |

None block E1 pure adapter implementation.

---

## 25. Implementation readiness

| Gate | Status |
|------|--------|
| D3+D4 pair identity | **CLOSED** |
| D4 outcome handling | **CLOSED** |
| Per-session eligibility | **CLOSED** |
| Source-limited semantics | **CLOSED** |
| Version segmentation | **CLOSED** |
| Time authority | **CLOSED** |
| Input contract shape | **CLOSED** |
| Input fingerprint | **CLOSED** (reuse existing canonical serializer) |
| No implicit health/confidence mapping | **CLOSED** |
| LV assessment isolation | **CLOSED** |
| Persistence boundary | **CLOSED** |
| E1 pure-function shape | **CLOSED** |
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
