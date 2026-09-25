# M3.3E E3 — Pure Fail-Closed Longitudinal Health Evaluator (Engineering)

**Date:** 2026-09-25  
**Phase:** M3.3E E3 (pure engineering — **draft PR**, not on `main`)  
**Authority:** Implements frozen **`M3_3E_E2_LONGITUDINAL_HEALTH_MODEL_ARCHITECTURE_2026-09-25.md`** without semantic changes.

## 1. Starting authority

| Layer | Status |
|-------|--------|
| E1 `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1` | **COMPLETE ON MAIN** PR #1765 |
| E2 scientific contract | **COMPLETE ON MAIN** PR #1773; seal PR #1775 @ `a58773e72125b14bcc1640c742a9d127d46c2955` |
| E3 engineering | **DRAFT PR** — pure evaluator only |

## 2. Implemented files

| File | Role |
|------|------|
| `longitudinal-health-evaluation.types.ts` | Output + reject types |
| `longitudinal-health-evaluation.constants.ts` | Contract versions, metrics, reason codes |
| `longitudinal-health-calibration-profile.ts` | `M3_3E_CALIBRATION_UNSET_V1` + fingerprint |
| `longitudinal-health-evaluation.policy.ts` | `evaluateM3_3E_LongitudinalHealthEvaluationV1` |
| `longitudinal-health-evaluation.golden.ts` | Pinned result + calibration fingerprints |
| `longitudinal-health-evaluation.spec.ts` | E3 test matrix |
| `longitudinal-health-evaluation.test-helpers.ts` | Fixture builders |

## 3–16. Contract summary

- **Output:** `M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1` / `M3_3E_E2_MODEL_POLICY_V1` / default **`M3_3E_CALIBRATION_UNSET_V1`**
- **Input validation:** E1 contract version, identity, recomputed `consumptionInputFingerprint`, canonical `anchorAt`, ascending order, segment metadata, shutdown-delta anchor rule, finite numerics
- **Gates:** level ≥1; trend ≥2 distinct anchors; dispersion ≥3; step ≥4 with ≥2/≥2 split
- **Trend state:** `NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL` ⇔ trend gate false; UNSET + trend true ⇒ `NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED`
- **Quantization / Theil-Sen / MAD / step:** per E2 §12.3 (relative ms origin, `DAY_MS`, safe integers, `-0→0`)
- **Reject:** `M3_3E_HEALTH_EVALUATION_NUMERIC_OVERFLOW` + narrow engineering reject codes (no new scientific semantics)
- **Fingerprint preimage:** `{ contractVersion, modelPolicyVersion, calibrationProfileId, calibrationProfileFingerprint, consumptionInputFingerprint, canonical body without resultFingerprint }`
- **Golden result fingerprint:** `3d4dbae5f46afe46e3775718643540c92b43f0b81e93059d736735591ee18799`
- **Calibration fingerprint:** `4bd9be2fc11cfc5c99335b77467ecffb57edc0ace9cee1317d1f2785c561af65`

## 17–18. Regression / non-effects

- E1 golden fingerprint **unchanged** (`d426d1b0…`)
- Longitudinal D1–D4 + E1 suites **PASS** with E3 added
- **No** Nest wiring, Prisma, flags, persistence, deploy, readiness, LV assessment, publication

## 19–20. Blockers / M3.3F

- **`M3_3E_CONCLUSION_BEARING_MODEL_READY=NO`** — all `CAL-M3.3E-*` unset
- **M3.3F** materialization / natural calibration remains a **separate** gate
