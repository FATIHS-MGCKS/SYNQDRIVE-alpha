# P2.5 APD-PS2 — Full per-poll trace + Battery V2 semantic certification

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-APD-PS2-001 |
| **Captured at (UTC)** | `2026-10-03T02:00:00Z` |
| **Method** | Read-only Production PG + ClickHouse; offline replay (no writes) |
| **Window** | T7: `2026-09-18T09:33:25Z` → `2026-09-25T09:33:25Z` |
| **CH lookback (join)** | `2026-09-11T09:33:25Z` → T7 end (causal last-known top-level / speed / ignition) |
| **Tooling** | `p25-apd-ps2-offline-certification.mjs`, `p25-apd-replay-policy-core.mjs` |
| **Artifact** | `/opt/cursor/artifacts/p25-apd-ps2-certification.json` |
| **Production change** | **NONE** |

---

## 0. PR hygiene (inventory only)

| Field | Value |
|-------|-------|
| **PR1893_CURRENT_HEAD** | `384d726091843e45d840c88d19924294930982fd` |
| **FINAL_HEAD_SHA (R9O-1/2 code)** | `7ac5470c573a4f807b58511fa2c8a978c96ea56a` |
| **POST_R9O_1_2_COMMIT_COUNT** | **3** |
| **PR_SCOPE_CONTAMINATION_FOUND** | **YES** — post-R9O commits are **docs + read-only ops scripts** (DSC-1/2, APD-PS1) on the same branch as R9O-1/2; **no** additional R9O runtime wiring after `7ac5470c5` |

**POST_R9O_1_2_CHANGED_FILES (exact):**

- `architecture/trip-detection-lifecycle/evidence/R9O_1_2_WAKE_FORENSIC_FOUNDATION_2026-10-02.md`
- `architecture/vehicle-device-connectivity/contradictions/KNOWLEDGE_GAPS.md`
- `architecture/vehicle-device-connectivity/evidence/EVIDENCE_INDEX.md`
- `architecture/vehicle-device-connectivity/evidence/P25_STANDBY_BATTERY_VOLTAGE_CADENCE_ADDENDUM_2026-10-02.md`
- `architecture/vehicle-device-connectivity/evidence/P25_DSC2_DEVICE_SOURCE_CADENCE_CLOSURE_2026-10-03.md`
- `architecture/vehicle-device-connectivity/evidence/P25_APD_PS1_OFFLINE_REPLAY_2026-10-03.md`
- `architecture/vehicle-device-connectivity/research/CHANGE_LEDGER.md`
- `backend/scripts/ops/p25-standby-lv-cadence-audit-readonly.{cjs,sh}`
- `backend/scripts/ops/p25-dsc2-source-cadence-closure-readonly.{cjs,sh}`
- `backend/scripts/ops/p25-apd-ps1-offline-replay.{mjs,sh}`
- `frontend/src/master/components/ChangesView.tsx`

---

## A. Trace completeness accounting

| Metric | Value |
|--------|------:|
| FULL_POLL_TRACE_ROW_COUNT | 18,307 |
| PG_POLL_ROWS | 18,307 |
| CH_SIGNAL_ROWS (with 7d lookback) | 37,572 |
| UNMATCHED_PG_ROWS | **0** |
| UNMATCHED_CH_ROWS | 0 |
| STALE_TOP_LEVEL_REUSE_ROWS | 16,079 |
| **PER_POLL_TRACE_COMPLETE** | **YES** |
| **WINDOW_A_TRACE_COMPLETE** | **YES** (strict-rest LV from PG `provider_timestamp` / `observed_at`) |
| **WINDOW_B_TRACE_COMPLETE** | **YES** (CH speed/ignition, causal ≤ poll completed) |
| **WINDOW_C_TRACE_COMPLETE** | **YES** (CH `recorded_at` top-level, causal ≤ poll completed) |
| **LOOKAHEAD_BIAS_CHECK** | **PASS** — all joins use information ≤ `poll.completedAt` |
| FETCH_TIME / ARRIVAL_TIME | `poll.finished_at` (historical per-poll `providerFetchedAt` not persisted in PG) |

Time semantics per field: **SOURCE_TIME** = provider/signal time (`provider_timestamp`, CH `recorded_at`); **ARRIVAL_TIME** = `battery_measurements.observed_at` or poll completion for fetch path.

---

## B0 / B2 / B4 replay (PS1-equivalent policies)

| Policy | Recon polls (sim) | Reduction | LV miss | Early miss | Abs P50 | Abs P95 | Abs P99 | Abs MAX | Add P50 | Add P95 | Add P99 | Add MAX | B2V2 semantic |
|--------|------------------:|----------:|--------:|-----------:|--------:|--------:|--------:|--------:|--------:|--------:|--------:|--------:|--------------:|
| B0_CONTROL | 9990 | 0.0% | 0 | 0 | 0.44m | 5.25m | 8.63m | 23.33m | 0.00m | 0.00m | 0.00m | 0.00m | 0 |
| B2_HB10_IN1 | 3731 | 62.7% | 0 | 0 | 1.12m | 10.11m | 12.71m | 23.33m | 0.00m | 9.45m | 9.59m | 10.00m | **2** |
| B4_PHASE_30M | 6861 | 31.3% | 0 | 0 | 0.55m | 5.48m | 9.02m | 23.33m | 0.00m | 4.95m | 5.00m | 5.00m | **1** |

---

## Battery V2 consumer semantic-diff (poll-discovery model)

Consumers replayed under **poll-scheduled discovery** of LV `provider_timestamp` advances (not raw DB visibility at `observed_at`).

| Consumer | Inputs | B2 semantic | B4 semantic | Notes |
|----------|-------:|------------:|------------:|-------|
| M3.3A generalized (coarse REST_LV class) | 83 | 0 | 0 | 83 timing-only |
| M3.3B provider gap path | 9,990 poll events | 0 | 0 | No fresh-source fabrication |
| REST_60M target selection | 74 sessions | **2** | **1** | `WINDOW_MEMBERSHIP_CHANGE` on delayed discovery |
| Longitudinal / health / materialization (derived) | 83 | 0 | 0 | Timing-only vs control |

| Classification | B2 | B4 |
|----------------|---:|---:|
| TIMING_ONLY_DIFFERENCE | 83 | 83 |
| WINDOW_MEMBERSHIP_CHANGE (REST_60M) | 2 | 1 |
| REST_CLASSIFICATION_CHANGE (boundary) | 2 | 1 |
| SOURCE_TIME_FABRICATION | 0 | 0 |

---

## Rest-window boundary (5–15m sensitivity)

| Metric | Value |
|--------|------:|
| BOUNDARY_SENSITIVE_EVENT_COUNT | 8 |
| B2_BOUNDARY_CLASSIFICATION_CHANGE_COUNT | 2 |
| B4_BOUNDARY_CLASSIFICATION_CHANGE_COUNT | 1 |
| B2_MIN_MARGIN_TO_UNSAFE_BOUNDARY | ~6.6 min additional discovery vs source |
| B4_MIN_MARGIN_TO_UNSAFE_BOUNDARY | ~6.6 min |

Fleet P95 additional delay can pass 10m while **boundary-sensitive REST_60M sessions** still flip — certification gate treats this as failure.

---

## Provider observability gap safety

| Metric | Value |
|--------|------:|
| SOURCE_TIME_FABRICATION_COUNT | **0** |
| PROVIDER_GAP_MASKED_COUNT (false fresh) | **0** |
| PROVIDER_GAP_DELAYED_DETECTION_COUNT (B2 / B4) | ~5,725 / ~5,797 polls with fetch but no LV `provider_timestamp` advance (expected under sparse source cadence) |

---

## HMÜ + profile invalidation

| Field | Value |
|-------|-------|
| HMU_PROFILE | INSUFFICIENT_EVIDENCE |
| HMU_PHASE_AWARE_ELIGIBLE | **NO** |
| HMU_B2_HEARTBEAT_ELIGIBLE | YES (5m conservative fallback only) |
| HMU_FALLBACK_REQUIRED | **YES** |
| PROFILE_INVALIDATION_RULE | Demote `STABLE_PERIODIC` when 7–9h share &lt;40% over 7d, `gapCount&lt;5`, P95 &lt;6h, or ≥3 disruption events without recovery |
| PROFILE_RECOVERY_RULE | Re-promote after ≥16 strict-rest gaps, median 7–9h, 7–9h share ≥50% over 7d |
| MAX_STALE_PROFILE_DECISIONS_BEFORE_FALLBACK | **3** |

---

## Certification gates

| Policy | Certified | Blockers |
|--------|-----------|----------|
| **B2_HB10_IN1** | **NO** | REST_60M semantic (2) + boundary classification (2) despite 0 LV misses |
| **B4_PHASE_30M** | **NO** | REST_60M semantic (1) + boundary (1) |
| **B0_CONTROL** | Baseline pass (LV miss 0) | — |

**CERTIFIED_POLICY_COUNT = 0** — do not activate. Human tradeoff if refined later: B4 tighter latency / lower savings vs B2 higher savings / wider latency; **B2 must not be justified while REST semantic failures remain.**

---

## Trip safety

| Invariant | Value |
|-----------|-------|
| R9_WAKE_PATH_MODIFIED | NO |
| R9_TRIGGERED_SNAPSHOT_SUPPRESSED | NO |
| TRIP_WATCHDOG_MODIFIED | NO |
| TRIP_FSM_MODIFIED | NO |
| ACTIVE_TRIP_POLLING_MODIFIED | NO |

---

## Required result block

```
P25_APD_PS2_CERTIFICATION_RESULT=

PR1893_CURRENT_HEAD=384d726091843e45d840c88d19924294930982fd
PR_SCOPE_CONTAMINATION_FOUND=YES_DOCS_AND_READONLY_OPS_AFTER_R9O_CODE_HEAD

PER_POLL_TRACE_COMPLETE=YES
WINDOW_A_TRACE_COMPLETE=YES
WINDOW_B_TRACE_COMPLETE=YES
WINDOW_C_TRACE_COMPLETE=YES
LOOKAHEAD_BIAS_CHECK=PASS_CAUSAL_LEQ_POLL_COMPLETED_AT

CERTIFIED_POLICY_COUNT=0

B0_REPLAY_PASS=YES

B2_CERTIFIED=NO
B2_CALL_REDUCTION=62.7%
B2_LV_MISSED=0
B2_EARLY_LV_MISSED=0
B2_ABSOLUTE_DISCOVERY_P50=1.12m
B2_ABSOLUTE_DISCOVERY_P95=10.11m
B2_ABSOLUTE_DISCOVERY_P99=12.71m
B2_ABSOLUTE_DISCOVERY_MAX=23.33m
B2_ADDITIONAL_DELAY_P50=0.00m
B2_ADDITIONAL_DELAY_P95=9.45m
B2_ADDITIONAL_DELAY_P99=9.59m
B2_ADDITIONAL_DELAY_MAX=10.00m
B2_BATTERY_V2_SEMANTIC_CHANGE_COUNT=2
B2_BOUNDARY_CLASSIFICATION_CHANGE_COUNT=2

B4_CERTIFIED=NO
B4_CALL_REDUCTION=31.3%
B4_LV_MISSED=0
B4_EARLY_LV_MISSED=0
B4_ABSOLUTE_DISCOVERY_P50=0.55m
B4_ABSOLUTE_DISCOVERY_P95=5.48m
B4_ABSOLUTE_DISCOVERY_P99=9.02m
B4_ABSOLUTE_DISCOVERY_MAX=23.33m
B4_ADDITIONAL_DELAY_P50=0.00m
B4_ADDITIONAL_DELAY_P95=4.95m
B4_ADDITIONAL_DELAY_P99=5.00m
B4_ADDITIONAL_DELAY_MAX=5.00m
B4_BATTERY_V2_SEMANTIC_CHANGE_COUNT=1
B4_BOUNDARY_CLASSIFICATION_CHANGE_COUNT=1

SOURCE_TIME_FABRICATION_COUNT=0
PROVIDER_GAP_MASKED_COUNT=0

HMU_PROFILE=INSUFFICIENT_EVIDENCE
HMU_PHASE_AWARE_ELIGIBLE=NO
HMU_FALLBACK_REQUIRED=YES

PROFILE_INVALIDATION_RULE_VALIDATED=YES_SIMULATION_RULES_DOCUMENTED

R9_WAKE_PATH_MODIFIED=NO
R9_TRIGGERED_SNAPSHOT_SUPPRESSED=NO
TRIP_WATCHDOG_MODIFIED=NO
TRIP_FSM_MODIFIED=NO
ACTIVE_TRIP_POLLING_MODIFIED=NO

PRODUCTION_CHANGE_PERFORMED=NO
POLLING_CHANGED=NO
BATTERY_V2_CHANGED=NO

BLOCKERS=B2/B4 fail REST_60M poll-discovery semantic + boundary cases; HMÜ LV evidence; full Nest consumer import replay (TypeScript producers) deferred to next tranche
CERTIFICATION_SUMMARY=Trace WINDOWS A/B/C complete with causal joins; zero LV misses and zero source fabrication; B2/B4 not certified due to 2/1 REST_60M window membership changes and boundary flips under poll-delay model
NEXT_ACTION=Refine REST_60M assessment timing contract OR tighten B2/B4 parameters; optional ts-node replay using production classifyLvRestObservationQuality; do not activate policy
```
