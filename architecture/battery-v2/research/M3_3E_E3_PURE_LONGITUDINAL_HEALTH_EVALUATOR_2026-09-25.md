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
| `longitudinal-health-evaluation.e31-conformance.spec.ts` | E3.1 conformance matrix |
| `longitudinal-health-evaluation.e311-v1-closure.spec.ts` | E3.1.1 V1 comparability / context closure |
| `longitudinal-health-evaluation.test-helpers.ts` | Fixture builders |

## 3–16. Contract summary

- **Output:** `M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1` / `M3_3E_E2_MODEL_POLICY_V1` / default **`M3_3E_CALIBRATION_UNSET_V1`**
- **Input validation:** E1 contract version, identity, recomputed `consumptionInputFingerprint`, canonical `anchorAt`, ascending order, segment metadata, shutdown-delta anchor rule, finite numerics
- **Gates:** level ≥1; trend ≥2 distinct anchors; dispersion ≥3; step ≥4 with ≥2/≥2 split
- **Trend state:** `NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL` ⇔ trend gate false; UNSET + trend true ⇒ `NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED`
- **Quantization / Theil-Sen / MAD / step:** per E2 §12.3 (relative ms origin, `DAY_MS`, safe integers, `-0→0`)
- **Reject:** `M3_3E_HEALTH_EVALUATION_NUMERIC_OVERFLOW` + narrow engineering reject codes (no new scientific semantics)
- **Fingerprint preimage:** `{ contractVersion, modelPolicyVersion, calibrationProfileId, calibrationProfileFingerprint, consumptionInputFingerprint, canonical body without resultFingerprint }`
- **Golden result fingerprint:** `42cfc8a737a9cff99c5982b1f44937fee8a2fc0d7e30bbefe612144b148f7043` (E3.1: metric-scoped `FIRST_POINT_AGE_UNCONTROLLED` on median)
- **Calibration fingerprint:** `4bd9be2fc11cfc5c99335b77467ecffb57edc0ace9cee1317d1f2785c561af65`

## 17–18. Regression / non-effects

- E1 golden fingerprint **unchanged** (`d426d1b0…`)
- Longitudinal D1–D4 + E1 suites **PASS** with E3 added
- **No** Nest wiring, Prisma, flags, persistence, deploy, readiness, LV assessment, publication

## 21. E3.1 pre-merge conformance hardening (draft PR #1778 amend)

| Area | Change |
|------|--------|
| **CHANGE_LEDGER** | Restored historical E2 seal entry byte-for-byte from `origin/main`; append-only E3 + E3.1 entries only |
| **E1 revalidation** | Full evidence window + `eligibleEvidenceSpanMs`; coverage accounting; observation/segment numerics; segment index order + membership |
| **Metric scoping** | Context descriptors, outliers, comparability, and charge/temperature/rest-age aggregates use **metric series** observations only |
| **FIRST_POINT_AGE** | Emitted only for `ROBUST_REST_SLOPE` and `SHUTDOWN_TO_FIRST_REST_DELTA`, not `MEDIAN_REST_VOLTAGE` under UNSET |
| **Tests** | `longitudinal-health-evaluation.e31-conformance.spec.ts` — matrix D/H/I/L/M/O/P/Q/R/V/W/AC/AD + validation + fingerprint field sensitivity |
| **Fingerprint helper** | `computeM3_3E_HealthEvaluationResultFingerprintV1` (pure, no runtime reachability) |

**Status:** E3 engineering **DRAFT** — **NOT COMPLETE ON MAIN**; **`M3_3E_CONCLUSION_BEARING_MODEL_READY=NO`**.

- **`M3_3E_CONCLUSION_BEARING_MODEL_READY=NO`** — all `CAL-M3.3E-*` unset
- **M3.3F** materialization / natural calibration remains a **separate** gate
