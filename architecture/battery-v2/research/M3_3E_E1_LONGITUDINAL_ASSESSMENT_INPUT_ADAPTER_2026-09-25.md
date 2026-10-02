# M3.3E E1 — Longitudinal Assessment Input Adapter (Engineering)

**Date:** 2026-09-25  
**Status:** **M3.3E E1 COMPLETE ON MAIN** — merged PR #1765 @ merge `553ba670a0a5b99689c6575417b75d4f0b9fb422` (PR head `4891c6dc48b33fba0a4992158b62566ca3eebcd8`)  
**Consumption contract:** `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1` (sealed on main via PR #1761)  
**Health model:** **`M3_3E_HEALTH_MODEL_IMPLEMENTED=NO`**

## Implementation files

| File | Role |
|------|------|
| `backend/.../longitudinal-assessment-input.constants.ts` | `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_CONTRACT_VERSION` |
| `backend/.../longitudinal-assessment-input.types.ts` | `M3_3E_RevisionIdentityV1`, build outcome, output V1 types |
| `backend/.../longitudinal-assessment-input.adapter.ts` | Pure `buildLongitudinalAssessmentInputV1` |
| `backend/.../longitudinal-assessment-input.golden.ts` | Frozen E1 consumption fingerprint literal |
| `backend/.../longitudinal-assessment-input.adapter.spec.ts` | Unit + golden tests |
| `backend/.../longitudinal-assessment-input.adapter.e11-matrix.spec.ts` | E1.1 frozen minimum test matrix |
| `backend/.../longitudinal-assessment-input.adapter.e12-fingerprint-preimage.spec.ts` | E1.2 isolated fingerprint preimage field sensitivity |
| `backend/.../longitudinal-assessment-input.test-helpers.ts` | Deterministic D3/D4 pairing fixtures (tests only) |

## Public entry point

```typescript
buildLongitudinalAssessmentInputV1({
  scientificProfile: unknown,
  revisionIdentity: M3_3E_RevisionIdentityV1,
  d4Outcome: D4InspectionOutcome,
}): M3_3E_BuildOutcome;
```

Synchronous, pure — no clock parameter, no IO, no environment reads.

## Validation order (fail-closed)

1. Revision identity envelope (non-empty ids, fingerprint hex, supported D3 contract/policy literals)
2. D4 top-level outcome (`REVISION_NOT_FOUND`, `REVISION_SELF_INTEGRITY_FAILED`, materialized self-integrity)
3. Strict D3 parse via `parseLongitudinalScientificProfileProjectionV1` (no duplicate parser)
4. Parsed projection ↔ revision identity + recomputed D3 scientific fingerprint (`canonicalFeatureInputUtf8` → `sha256HexLowercaseUtf8`)
5. D4 inspection contract + identity tuple equality with revision identity
6. Duplicate-free D4 `perSession` map; candidate counts; full partition session-set equality
7. Profile slice pairing (DEFAULT / PROVISIONAL / EXCLUDED)
8. Canonical + version tuple pairing for all candidates
9. DEFAULT disposition accounting (`D3_D4_CONTRACT_INCONSISTENCY` on incompatible DEFAULT dispositions when revision self-integrity OK)
10. Assessment-grade subset (DEFAULT + D4 `ELIGIBLE` only)
11. Canonical ordering (`anchorAt` ASC, UTF-16 code-unit `restSessionId` tie-break via `compareUtf16CodeUnitLexicographic` — **no** `localeCompare` / `Intl.Collator`)
12. Evidence window + D2 `eligibleVersionSegments` (preserve `sourceSegmentIndex`; no tuple regroup merge)
13. Coverage + diagnostic context (exact V1 shape; no reason lists)
14. Model evaluation (`modelSufficiency=NOT_EVALUATED` always)
15. Consumption input fingerprint (required on every OK, including zero eligible)

## Rejection taxonomy

See E0 doc §15 — `M3_3E_ConsumptionRejectReason` (no health-related reasons).

## Fingerprint authority

`computeM3_3E_ConsumptionInputFingerprintV1` uses frozen preimage documented in E0 §17.1 via existing `canonicalFeatureInputUtf8` + `sha256HexLowercaseUtf8`.

**Golden vector:** `M3_3E_E1_GOLDEN_CONSUMPTION_FINGERPRINT_LITERAL` = `d426d1b020a2e281581bba677cbc16a9b96f46705dc1f7c4acfa26f49e93ae5f` (two DEFAULT ELIGIBLE fixture).

**Unchanged upstream goldens:** C3 key-order SHA256 `e7b6e05a14a7bece2b8568b716d7dfc2ff360507b7a9f308c5771f648fd8dff3`; D3 profile `e2d39c602370c92a7b4304d01ee0f0d102aa4ce033c38a03f72187a3afbcaecb`.

## Runtime isolation

- **`E1_NEST_PROVIDER_REGISTERED=NO`**
- **`E1_MODULE_EXPORTED=NO`**
- **`E1_RUNTIME_CALL_SITES=0`**
- **`D3_RUNTIME_REACHABLE=NO`** · **`D4_RUNTIME_REACHABLE=NO`**
- **`PRODUCTION_MATERIALIZATION_READY=NO`**
- No BatteryAssessment / BatteryPublication writes; no LV pipeline changes

## Tests

- **`longitudinal-assessment-input.adapter.spec.ts`** — identity, D4 gates, parse/bind, pairing, eligibility, segments, fingerprint, purity.
- **`longitudinal-assessment-input.adapter.e11-matrix.spec.ts`** — E1.1 frozen minimum matrix.
- **`longitudinal-assessment-input.adapter.e12-fingerprint-preimage.spec.ts`** — E1.2 isolated preimage sensitivity.

Regressions (minimum): D3 parser, D3 fingerprint, D4 self-integrity, D4 service, D2 assembler, D1 reader/policy specs.

## E1.1 closure evidence (2026-09-25, historical — PR #1765 amend)

| Gate | Result |
|------|--------|
| Locale-independent scientific ordering | **`E1_LOCALE_DEPENDENT_ORDERING_USED=NO`** · **`E1_UTF16_CANONICAL_ORDERING_USED=YES`** |
| Golden consumption fingerprint after ordering fix | **`d426d1b020a2e281581bba677cbc16a9b96f46705dc1f7c4acfa26f49e93ae5f`** (unchanged) |
| Frozen minimum test matrix | **`E1_TEST_MATRIX_COMPLETE=YES`** |

## E1.2 merge-gate closure (2026-09-25, historical — PR #1765)

| Gate | Result |
|------|--------|
| Sync with `origin/main` before merge | **`MAIN_INCLUDED=YES`** |
| Frontend runtime diff | **`FRONTEND_RUNTIME_FILES_CHANGED=NO`** |
| Isolated fingerprint preimage tests | **`FINGERPRINT_FIELD_SENSITIVITY_ISOLATED=YES`** |

## E1 post-merge engineering seal (2026-09-25)

| Field | Value |
|-------|-------|
| PR | **#1765** merged |
| PR head | `4891c6dc48b33fba0a4992158b62566ca3eebcd8` |
| Merge commit | `553ba670a0a5b99689c6575417b75d4f0b9fb422` |
| **`E1_ADAPTER_IMPLEMENTED`** | **YES** |
| **`M3_3E_CONSUMPTION_CONTRACT_VERSION`** | **`M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1`** |
| E1 unit tests | **97 passed / 3 suites** |
| Exact-head CI (PR #1765) | **28/28 SUCCESS** |
| **`M3_3E_HEALTH_MODEL_IMPLEMENTED`** | **NO** |

### Implementation properties (sealed)

| Property | Value |
|----------|-------|
| `E1_PURE_FUNCTION` | YES |
| `E1_PURE_OUTPUT_DETERMINISTIC` | YES |
| `E1_REUSES_D4_STRICT_PROFILE_VALIDATION` | YES |
| `E1_DUPLICATE_PROFILE_PARSER_ADDED` | NO |
| `E1_RECOMPUTES_D3_SCIENTIFIC_FINGERPRINT` | YES |
| `D3_D4_SESSION_SET_SCOPE` | ALL_PROFILE_CANDIDATES |
| `D3_D4_PROFILE_SLICE_PAIRING_IMPLEMENTED` | YES |
| `FULL_CANDIDATE_CANONICAL_PAIRING_IMPLEMENTED` | YES |
| `FULL_CANDIDATE_VERSION_PAIRING_IMPLEMENTED` | YES |
| `DEFAULT_ELIGIBLE_ONLY_ASSESSMENT_GRADE` | YES |
| `COVERAGE_PARTITION_INVARIANT_IMPLEMENTED` | YES |
| `ELIGIBLE_EVIDENCE_WINDOW_IMPLEMENTED` | YES |
| `ORIGINAL_D2_SEGMENT_BOUNDARIES_PRESERVED` | YES |
| `SOURCE_SEGMENT_INDEX_PRESERVED` | YES |
| `NON_ADJACENT_EQUAL_VERSION_SEGMENTS_MERGED` | NO |
| `MODEL_SUFFICIENCY` | NOT_EVALUATED |

### Determinism / fingerprint (sealed)

| Property | Value |
|----------|-------|
| `E1_LOCALE_DEPENDENT_ORDERING_USED` | NO |
| `E1_UTF16_CANONICAL_ORDERING_USED` | YES |
| `LOCALECOMPARE_OCCURRENCES_IN_E1_ADAPTER` | 0 |
| `INTL_COLLATOR_OCCURRENCES_IN_E1_ADAPTER` | 0 |
| `CONSUMPTION_FINGERPRINT_IMPLEMENTED` | YES |
| `CONSUMPTION_FINGERPRINT_REQUIRED_ON_SUCCESS` | YES |
| `ZERO_ELIGIBLE_HAS_FINGERPRINT` | YES |
| `CONSUMPTION_FINGERPRINT_WALL_CLOCK_FREE` | YES |
| `FINGERPRINT_FIELD_SENSITIVITY_ISOLATED` | YES |
| `FINGERPRINT_OBSERVATION_ORDER_CANONICALIZED` | YES |
| `FINGERPRINT_OBJECT_KEY_ORDER_CANONICALIZED` | YES |
| `E1_TEST_MATRIX_COMPLETE` | YES |

### Persistence / runtime boundary (sealed)

| Property | Value |
|----------|-------|
| `DB_ACCESS_ADDED` | NO |
| `PRISMA_ACCESS_ADDED` | NO |
| `EXISTING_LV_ASSESSMENT_PATH_CHANGED` | NO |
| `LONGITUDINAL_EVIDENCE_MAPPED_TO_BATTERY_MEASUREMENT` | NO |
| `BATTERY_ASSESSMENT_WRITES` | NO |
| `BATTERY_PUBLICATION_WRITES` | NO |

## Next phase (not E1)

- **`NEXT_PHASE=M3.3E E2 HEALTH MODEL ARCHITECTURE`** — define battery-condition semantics, evidence sufficiency, comparability, uncertainty, output taxonomy, LV interaction, and persistence boundary **before** any health implementation.
- **`M3_3F_REMAINS_PENDING=YES`** — production D3 materialization authorization remains separate.

## Non-effects

No schema/migration, no feature flags, no deploy, no production data mutation from E1 engineering.
