# M3.3E E3 — Pure Fail-Closed Longitudinal Health Evaluator (Engineering)

**Date:** 2026-09-25  
**Phase:** M3.3E E3 — **COMPLETE ON MAIN**  
**Merged engineering PR:** #1778 — head `984bf2ec3d82eac160c84c0ad8ce2ff796904165` / merge `55fcbe7a229db9858cecc1538b9ec1919ff30fbc`  
**Authority:** Implements frozen **`M3_3E_E2_LONGITUDINAL_HEALTH_MODEL_ARCHITECTURE_2026-09-25.md`** without semantic changes.

## 1. Starting authority

| Layer | Status |
|-------|--------|
| E1 `M3_3E_LONGITUDINAL_ASSESSMENT_INPUT_V1` | **COMPLETE ON MAIN** PR #1765 |
| E2 scientific contract | **COMPLETE ON MAIN** PR #1773; seal PR #1775 @ `a58773e72125b14bcc1640c742a9d127d46c2955` |
| E3 engineering | **COMPLETE ON MAIN** PR #1778 |

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
| `longitudinal-health-evaluation.e312-c1-envelope.spec.ts` | E3.1.2 C1 primary-metric envelope |
| `longitudinal-health-evaluation.test-helpers.ts` | Fixture builders |

## 3–16. Contract summary

- **Output:** `M3_3E_LONGITUDINAL_HEALTH_EVALUATION_V1` / `M3_3E_E2_MODEL_POLICY_V1` / default **`M3_3E_CALIBRATION_UNSET_V1`**
- **Input validation:** E1 contract version, identity, recomputed `consumptionInputFingerprint`, canonical `anchorAt`, ascending order, segment metadata, shutdown-delta anchor rule, finite numerics
- **Gates:** level ≥1; trend ≥2 distinct anchors; dispersion ≥3; step ≥4 with ≥2/≥2 split
- **Trend state:** `NOT_EVALUABLE_INSUFFICIENT_STRUCTURAL` ⇔ trend gate false; UNSET + trend true ⇒ `NOT_CLASSIFIED_CALIBRATION_NOT_ESTABLISHED`
- **Quantization / Theil-Sen / MAD / step:** per E2 §12.3 (relative ms origin, `DAY_MS`, safe integers, `-0→0`)
- **Reject:** `M3_3E_HEALTH_EVALUATION_NUMERIC_OVERFLOW` + narrow engineering reject codes (no new scientific semantics)
- **Fingerprint preimage:** `{ contractVersion, modelPolicyVersion, calibrationProfileId, calibrationProfileFingerprint, consumptionInputFingerprint, canonical body without resultFingerprint }`
- **Golden result fingerprint:** `4d4b7ee105cb329b6610cde3648733257f46f1cb4b01abc6e519b05206410398` (E3.1.1: all metrics `SAME_SEGMENT_CONTEXT_LIMITED` under UNSET)
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

## 22. E3.1.1 V1 comparability / context closure (draft PR #1778 amend)

| Area | Change |
|------|--------|
| **Comparability** | Under `M3_3E_CALIBRATION_UNSET_V1`, same-segment comparability is always **`SAME_SEGMENT_CONTEXT_LIMITED`** (E2 §6.2 V1 unreachable `SAME_SEGMENT_COMPARABLE`) |
| **Charge mirror** | Top-level `chargeOpportunityClass` must match `features.chargeOpportunityClass` or reject (`M3_3E_EVALUATION_CHARGE_CLASS_MIRROR_MISMATCH`) |
| **C1 envelope** | Fail-closed on E3-consumed retention/voltage fields per `computeRestSessionRetentionFeatures()` semantics |
| **First-point age** | Derived only when **both** `maxActualRestAgeMs` and `observationSpanMs` are non-null; mismatched pairs reject |
| **Tests** | `longitudinal-health-evaluation.e311-v1-closure.spec.ts` (cases A–I) |

- **`M3_3E_CONCLUSION_BEARING_MODEL_READY=NO`** — all `CAL-M3.3E-*` unset
- **M3.3F** materialization / natural calibration remains a **separate** gate

## 24. Post-merge authority seal (merged engineering on main)

| Field | Value |
|-------|-------|
| **`M3_3E_E3_COMPLETE_ON_MAIN`** | **YES** |
| **`M3_3E_PURE_LONGITUDINAL_EVALUATOR_IMPLEMENTED`** | **YES** |
| **`M3_3E_E3_POST_MERGE_SEAL`** | **PASS** (documentation seal; engineering merged PR #1778) |
| **`M3_3E_HEALTH_MODEL_IMPLEMENTED`** | **NO** |
| **`M3_3E_CONCLUSION_BEARING_MODEL_READY`** | **NO** |
| **`E3_RUNTIME_REACHABLE`** | **NO** |
| **`E3_PERSISTENCE`** | **NO** |
| **`M3_3F_REMAINS_PENDING`** | **YES** |

Sections §21–§23 remain historical engineering closure records from PR #1778; estimator mathematics unchanged on main.
