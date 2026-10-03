# P2.5 APD-PS2B — Split certification: M3.3 primary vs legacy REST compatibility

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APD-PS2B-001 |
| **Captured at (UTC)** | `2026-10-03T02:00:00Z` |
| **Cohort** | LTE_R1 tokens `186946, 187336, 187361, 187784, 192922` |
| **Window** | T7 `2026-09-18T09:33:25Z` → `2026-09-25T09:33:25Z` |
| **Production change** | **NONE** (read-only VPS PostgreSQL replay) |
| **Replay script** | `backend/scripts/ops/p25-apd-ps2b-split-certification.mjs` |

---

## 1. M3.3 primary consumer graph (runtime / persistence boundaries)

| Stage | Runtime component | Persistence boundary | Legacy REST_60M/6H dependency |
|-------|-------------------|----------------------|-------------------------------|
| LIVE_VOLTAGE | `BatteryV2SnapshotIngestionService` / snapshot classify | `battery_measurements` (`LIVE_VOLTAGE`) | **NO** |
| GeneralizedEvidenceCapture | `GeneralizedEvidenceCaptureService` | `battery_generalized_evidence_observations` | **NO** |
| BatteryRestSession | `BatteryRestSessionService` | `battery_rest_sessions` | **NO** |
| C3 RestSessionFeature | `RestSessionFeatureInputReader` → feature compute | `battery_rest_session_features` | **NO** (reads generalized obs only) |
| D1 canonical input | Longitudinal input assembler | in-memory / job payload | **NO** |
| D2 profile assembly | Deterministic profile builder | versioned profile rows | **NO** |
| D3 revision | Materialization handler | longitudinal revision + fingerprint | **NO** |
| E1 adapter | Assessment adapter | assessment inputs | **NO** primary REST target |
| E3 evaluator | Pure evaluator (where enabled) | publication handoff | indirect only |

Code anchors: `computeActualRestAgeMs` (`generalized-evidence-provenance.helpers.ts`), `rest-session-feature-input.reader.ts`, `rest-cadence-qualification.policy.ts`.

---

## 2. B0 / B2 / B4 M3.3 semantic-diff table (counterfactual replay)

| Metric | B0 (control) | B2_HB10_IN1 | B4_PHASE_30M |
|--------|--------------|-------------|--------------|
| Reconciliation poll reduction | 0% | **62.1%** | **31.1%** |
| LV advances missed | 0 | **0** | **0** |
| Early LV advances missed | 0 | **0** | **0** |
| Generalized row semantic Δ | — | **0** | **0** |
| Classification Δ | — | **0** | **0** |
| Rest session association Δ | — | **0** | **0** |
| `actualRestAgeMs` Δ | — | **0** | **0** |
| C3 semantic Δ | — | **0** | **0** |
| D3 revision semantic Δ | — | **0** | **0** |
| **M3.3 primary total semantic Δ** | — | **0** | **0** |
| Session ordering Δ | — | **0** | **0** |
| Provider gap state Δ | — | **0** | **0** |
| **M3.3 certified** | baseline | **YES** | **YES** |

Model: for each strict-rest LV advance, discovery time may lag under B2/B4, but **semantic fingerprint** (`sessionId`, provider `ptMs`, `actualRestAgeMs`, `nominalRestIntervalIndex`, `rungResidualMs`) is recomputed from **provider time + session anchor** — identical whenever the observation is eventually ingested.

Production cross-check: `PERSISTED_ACTUAL_REST_AGE_MISMATCH_COUNT=0` for cohort T7 generalized rows (`voltage_observed_at` vs `anchor_at`).

---

## 3. 8h ladder / source-time proof

| Check | Result |
|-------|--------|
| `ACTUAL_REST_AGE_USES_SOURCE_TIME` | **YES** (code + persisted rows) |
| `POLL_DISCOVERY_TIME_USED_AS_REST_AGE` | **NO** |
| B2 nominal index changes | **0** |
| B4 nominal index changes | **0** |
| B2 rung residual changes | **0** |
| B4 rung residual changes | **0** |
| `SOURCE_TIME_FABRICATION_COUNT` | **0** |
| `PROVIDER_GAP_MASKED_COUNT` | **0** |
| `REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED` | **false** (metadata-only ladder) |

---

## 4. Rest-session ordering diff

| Metric | B2 | B4 |
|--------|----|----|
| Session ordering change count | **0** | **0** |
| Session end reason change count | **0** | **0** |
| Late trip association change count | **0** | **0** |

---

## 5. Legacy REST compatibility graph

| Stage | Active at current flags | Customer-visible |
|-------|-------------------------|------------------|
| `LvRestWindow` session | **YES** | No |
| REST_60M / REST_6H scheduled targets | **YES** (`BATTERY_V2_REST_SHADOW_ENABLED`) | No direct UI |
| `BatteryRestTargetEvaluateHandler` | **YES** | No |
| `battery_measurements` REST_60M/6H rows | **YES** (target path) | No |
| M3.1 `onSnapshot` REST capture | **OFF** (`isBatteryV2LegacyRestCaptureEnabled` false) | No |
| Assessment / publication chain | **REACHABLE** | **Partial** (battery publication, not REST_60M-specific UI) |

---

## 6. Three legacy flip propagation (WOB token 192922)

| CASE_ID | POLICY | LEGACY_TARGET | B0_MEASUREMENT_ID | CANDIDATE | ASSESSMENT Δ | PUBLICATION Δ | CUSTOMER Δ |
|---------|--------|---------------|-------------------|-----------|--------------|---------------|------------|
| `8ed99d69-B2_HB10_IN1` | B2 | REST_60M | `a517c64d-96eb-4ae3-b1e5-4f00d5d129f2` | `null` | target miss only | **none traced** | **NO** |
| `fe6ccd28-B2_HB10_IN1` | B2 | REST_60M | `a14eff52-a779-49a4-b784-96034622eb85` | `null` | target miss only | **none traced** | **NO** |
| `fe6ccd28-B4_PHASE_30M` | B4 | REST_60M | `a14eff52-a779-49a4-b784-96034622eb85` | `null` | target miss only | **none traced** | **NO** |

**Legacy classification:** B2 → `LEGACY_COMPATIBILITY_CHANGED_NON_CUSTOMER`; B4 → `LEGACY_COMPATIBILITY_CHANGED_NON_CUSTOMER`.

---

## Result block

```
P25_APD_PS2B_SPLIT_CERTIFICATION_RESULT=

M3_3_PRIMARY_GRAPH_COMPLETE=YES_REPOSITORY_TRACED
LEGACY_REST_RUNTIME_GRAPH_COMPLETE=YES

LV_ADVANCES_TOTAL=91
EARLY_EVENT_DRIVEN_LV_ADVANCES_TOTAL=39

B2_M3_3_CERTIFIED=YES
B2_CALL_REDUCTION=62.1%
B2_LV_MISSED=0
B2_EARLY_LV_MISSED=0
B2_M3_3_PRIMARY_TOTAL_SEMANTIC_CHANGE_COUNT=0
B2_SESSION_ORDERING_CHANGE_COUNT=0
B2_PROVIDER_GAP_STATE_CHANGE_COUNT=0

B4_M3_3_CERTIFIED=YES
B4_CALL_REDUCTION=31.1%
B4_LV_MISSED=0
B4_EARLY_LV_MISSED=0
B4_M3_3_PRIMARY_TOTAL_SEMANTIC_CHANGE_COUNT=0
B4_SESSION_ORDERING_CHANGE_COUNT=0
B4_PROVIDER_GAP_STATE_CHANGE_COUNT=0

ACTUAL_REST_AGE_USES_SOURCE_TIME=YES
POLL_DISCOVERY_TIME_USED_AS_REST_AGE=NO

B2_NOMINAL_INDEX_CHANGE_COUNT=0
B4_NOMINAL_INDEX_CHANGE_COUNT=0
B2_RUNG_RESIDUAL_CHANGE_COUNT=0
B4_RUNG_RESIDUAL_CHANGE_COUNT=0

SOURCE_TIME_FABRICATION_COUNT=0
PROVIDER_GAP_MASKED_COUNT=0

REST_60M_TARGETS_ACTIVE=YES
REST_6H_TARGETS_ACTIVE=YES
LEGACY_ASSESSMENT_REACHABLE=YES
LEGACY_PUBLICATION_REACHABLE=YES
LEGACY_CUSTOMER_OUTPUT_REACHABLE=PARTIAL_ASSESSMENT_PUBLICATION_ONLY

KNOWN_LEGACY_FLIP_COUNT=3
KNOWN_LEGACY_FLIPS_WITH_ASSESSMENT_CHANGE=3
KNOWN_LEGACY_FLIPS_WITH_PUBLICATION_CHANGE=0
KNOWN_LEGACY_FLIPS_WITH_CUSTOMER_CHANGE=0

B2_LEGACY_COMPATIBILITY_CLASS=LEGACY_COMPATIBILITY_CHANGED_NON_CUSTOMER
B4_LEGACY_COMPATIBILITY_CLASS=LEGACY_COMPATIBILITY_CHANGED_NON_CUSTOMER

R9_WAKE_PATH_MODIFIED=NO
R9_TRIGGERED_SNAPSHOT_SUPPRESSED=NO
TRIP_WATCHDOG_MODIFIED=NO
TRIP_FSM_MODIFIED=NO
ACTIVE_TRIP_POLLING_MODIFIED=NO

PRODUCTION_CHANGE_PERFORMED=NO
POLLING_CHANGED=NO
BATTERY_V2_CHANGED=NO

BLOCKERS=NONE
CERTIFICATION_SUMMARY=M3.3 primary certified B2/B4; legacy REST_60M flips opportunistic non-customer
NEXT_ACTION=APD-PS3 shadow pilot scope gate with split gates frozen
```
