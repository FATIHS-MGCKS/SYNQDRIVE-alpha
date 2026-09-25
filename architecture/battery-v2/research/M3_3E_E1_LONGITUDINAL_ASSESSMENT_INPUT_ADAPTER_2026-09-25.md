# M3.3E E1 — Longitudinal Assessment Input Adapter (Engineering)

**Date:** 2026-09-25  
**Status:** **ENGINEERING ON DRAFT PR #1765** (pure TypeScript adapter; no Nest/DB/runtime wiring)  
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
| `backend/.../longitudinal-assessment-input.adapter.e11-matrix.spec.ts` | E1.1 frozen minimum test matrix (explicit pairing/eligibility/coverage/segments/fingerprint) |
| `backend/.../longitudinal-assessment-input.adapter.e12-fingerprint-preimage.spec.ts` | E1.2 isolated `computeM3_3E_ConsumptionInputFingerprintV1` field sensitivity (fixed `canonicalProfileFingerprint`) |
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

**Unchanged upstream goldens:** C3 key-order SHA256 `e7b6e05a…`; D3 profile `e2d39c60…`.

## Runtime isolation

- **`E1_NEST_PROVIDER_REGISTERED=NO`**
- **`E1_MODULE_EXPORTED=NO`**
- **`E1_RUNTIME_CALL_SITES=0`** (production wiring deferred)
- **`D3_RUNTIME_REACHABLE=NO`** · **`D4_RUNTIME_REACHABLE=NO`**
- No BatteryAssessment / BatteryPublication writes; no LV pipeline changes

## Tests

`longitudinal-assessment-input.adapter.spec.ts` — identity, D4 gates, parse/bind, pairing, eligibility, segments, fingerprint, purity.

`longitudinal-assessment-input.adapter.e11-matrix.spec.ts` — **E1.1 closure** (draft PR #1765 amend): explicit session-set / profile-slice / canonical / version / eligibility / coverage / evidence-window / version-segment / fingerprint sensitivity matrix; source audit `LOCALECOMPARE_OCCURRENCES_IN_E1_ADAPTER=0`.

Regressions (minimum): D3 parser, D3 fingerprint, D4 self-integrity, D4 service, D2 assembler, D1 reader specs.

## E1.1 closure evidence (2026-09-25, PR #1765 amend)

| Gate | Result |
|------|--------|
| Locale-independent scientific ordering | **`E1_LOCALE_DEPENDENT_ORDERING_USED=NO`** · **`E1_UTF16_CANONICAL_ORDERING_USED=YES`** |
| Golden consumption fingerprint after ordering fix | **`d426d1b020a2e281581bba677cbc16a9b96f46705dc1f7c4acfa26f49e93ae5f`** (unchanged) |
| C3 / D3 upstream goldens | **`e7b6e05a…`** / **`e2d39c60…`** (unchanged) |
| Frozen minimum test matrix | **`E1_TEST_MATRIX_COMPLETE=YES`** (85 E1 unit tests across base + E1.1 spec) |
| Pure determinism | **`E1_PURE_OUTPUT_DETERMINISTIC=YES`** |

## E1.2 merge-gate closure (2026-09-25, PR #1765)

| Gate | Result |
|------|--------|
| Sync with current `origin/main` | Rebased; **`MAIN_INCLUDED=YES`** |
| Frontend runtime diff | **`FRONTEND_RUNTIME_FILES_CHANGED=NO`** (Architektur/Changes restored to main) |
| Isolated fingerprint preimage tests | **`FINGERPRINT_FIELD_SENSITIVITY_ISOLATED=YES`** (`e12-fingerprint-preimage.spec.ts`) |
| Observation / object key canonicalization | **`FINGERPRINT_OBSERVATION_ORDER_CANONICALIZED=YES`** · **`FINGERPRINT_OBJECT_KEY_ORDER_CANONICALIZED=YES`** |

## Remaining work (post-E1 merge)

- M3.3E health model (not in E1 scope)
- M3.3F production D3 materialization authorization (unchanged gate)
- Optional Nest wiring / call sites only after explicit authorization

## Non-effects

No schema/migration, no feature flags, no deploy, no production data mutation.
