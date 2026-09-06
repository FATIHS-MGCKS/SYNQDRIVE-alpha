# M3.1 Stage-2 — KS MX 2024 REST_60M Maturity Probe

**Probe timestamp:** `2026-09-06T21:53:34Z`  
**Prior event probe:** `2026-09-06T21:39:25Z`  
**Session:** `82324f65-0b09-4312-a26f-6bc893d85fb5`  
**Vehicle:** KS MX 2024 (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`)

## Verdict

| Field | Value |
|-------|-------|
| `MEASUREMENT_RESULT` | **NATURAL_CONTAMINATED** |
| `NATURAL_VALID_REST_60M_FOUND` | **NO** |
| `NATURAL_END_TO_END_CHAIN_PROVEN` | **NO** |
| `PRODUCTION_VALIDATED` | **PENDING_NATURAL_E2E_EVIDENCE** (unchanged) |
| `PREVIOUS_NOT_YET_DUE_CLASSIFICATION_CORRECT` | **NO** |

---

## Step 1 — REST_60M timing contract (deployed code)

Sources: `battery-rest-target-evaluation.ts`, `battery-health-v2.config.ts`, `battery-rest-target-evaluation.service.ts`

| Field | Value (UTC) |
|-------|-------------|
| `anchor_at` | `2026-09-06T20:00:44.000Z` (`session.started_at`) |
| `due_at` | `2026-09-06T21:00:44.000Z` (anchor + 60m) |
| `quality_window_start` | `2026-09-06T20:45:44.000Z` (due − 15m) |
| `quality_window_end` | `2026-09-06T21:15:44.000Z` (due + 15m) |
| `latest_permitted_evaluation_at` | `2026-09-06T21:45:44.000Z` (quality_window_end + 30m retry grace) |
| `retry_deadline` | `2026-09-06T21:45:44.000Z` |
| `terminal_missed_deadline` | After retry_deadline when no VALID candidate and no contaminated fallback |

### Semantic states at prior probe (`21:39:25Z`)

| State | Active? |
|-------|---------|
| `TARGET_DUE` | **YES** (since `21:00:44Z`) |
| `EVALUATION_WINDOW_OPEN` (VALID selection) | **NO** (window closed `21:15:44Z`) |
| `EVALUATION_WINDOW_EXPIRED` | **YES** |
| `RETRY_PENDING` | **YES** (until `21:45:44Z`) |
| `NOT_YET_DUE` | **NO** |

Prior label `REST_PENDING_NOT_YET_DUE` conflated **E2E chain immaturity** with **target due state**. Correct target-phase label at `21:39:25Z`: **`TARGET_DUE` + `RETRY_PENDING` / `EXPECTED_WAIT_FOR_TELEMETRY`**.

---

## Step 2 — Current target state @ `21:53:34Z`

| Field | Value |
|-------|-------|
| `SESSION_ID` | `82324f65-0b09-4312-a26f-6bc893d85fb5` |
| `TARGET_ID` | `battery-rest:a60c0749-…:1788724844000:60m` |
| `TARGET_KIND` | REST_60M |
| `TARGET_STATE` | **COMPLETED** |
| `TARGET_CREATED_AT` | `2026-09-06T20:22:30.057Z` (REST_6H enqueue); REST_60M job re-enqueued `21:53:29.039Z` |
| `TARGET_DUE_AT` | `2026-09-06T21:00:44.000Z` |
| `TARGET_UPDATED_AT` | `2026-09-06T21:53:29.119Z` (session `updated_at`) |
| `HANDOFF_ID` | N/A (no `assessmentHandoff` on REST_60M metadata — contaminated measurement) |
| `HANDOFF_STATE` | N/A |
| `ATTEMPT_COUNT` | N/A in metadata; `lastAttemptAt` chain: `21:32:29Z`, `21:42:29Z`, complete `21:53:29Z` |
| `LAST_ATTEMPT_AT` | `2026-09-06T21:42:29.695Z` (metadata); evaluation persisted `21:53:29.116Z` |
| `NEXT_RETRY_AT` | N/A (terminal COMPLETED) |
| `BULLMQ_JOB_ID` | `battery-v2_7b6a6f8df68ed10dd3ee5ba4a29d51f7891f0177` |
| `BULLMQ_STATE` | completed (inferred from COMPLETED metadata) |
| `BULLMQ_DELAY_UNTIL` | N/A |
| `BULLMQ_FAILED_REASON` | N/A |

---

## Step 3 — Evaluation attempts since `due_at`

| Timestamp | Handler | Result |
|-----------|---------|--------|
| `~21:32:29Z` | `BATTERY_REST_TARGET_EVALUATE` / reconciliation | Deferred — no VALID obs in quality window (`PENDING_EVALUATION` / ENQUEUED) |
| `~21:37:29Z` | Reconciliation re-enqueue | ENQUEUED refresh (prior probe snapshot) |
| `~21:42:29Z` | Evaluate attempt | `lastAttemptAt` updated; still no in-window VALID candidate |
| `21:53:29Z` | Evaluate complete | Measurement persisted **CONTAMINATED_BY_WAKE** |

**Why ENQUEUED at `21:39:25Z`:** Target past due; quality window closed; retry grace active until `21:45:44Z`; no `LIVE_VOLTAGE` observations with `observed_at` in `[20:45:44, 21:15:44]` (telemetry frozen at trip-end `20:00:44`).

**Classification @ `21:39:25Z`:** `EXPECTED_WAIT_FOR_TELEMETRY`

---

## Step 4 — Natural measurement

| Field | Value |
|-------|-------|
| `MEASUREMENT_ID` | `701b077f-cdc7-4cd9-98a2-eb3bcb39074f` |
| `MEASUREMENT_KIND` | REST_60M |
| `MEASUREMENT_CREATED_AT` | `2026-09-06T21:53:29.104Z` |
| `MEASUREMENT_OBSERVED_AT` | `2026-09-06T19:49:08Z` |
| `QUALITY` | CONTAMINATED_BY_WAKE |
| `QUALITY_REASON` | `contaminated_by_wake` — alternator-era observation selected after retry grace exhausted |
| `SOURCE_OBSERVATION_ID` | `c17b1799-af7a-4e1b-96c1-8604820ae17d` (LIVE_VOLTAGE pre trip-end) |
| `PROVENANCE_WINDOW` | Target `21:00:44Z` ± 15m = `[20:45:44, 21:15:44]` — **no candidates in window** |

**Natural post-T0:** yes (`created_at >= T0`). **Natural VALID:** no (`observed_at` pre-anchor; contamination).

Trip-end resting observation `682269b9` at `20:00:44Z` (12.15V) exists but is **before** quality window start `20:45:44Z` — excluded from REST_60M VALID selection by design.

---

## Steps 5–6 — Assessment / publication

No assessment or publication rows for KS MX since REST_60M due. Contaminated measurement → no canonical assessment handoff.

```
NATURAL_ASSESSMENT_CHAIN_FOUND=NO
NATURAL_PUBLICATION_CHAIN_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO
```

---

## Step 7 — Quality rejection cause

| Factor | Evidence |
|--------|----------|
| Telemetry gap in quality window | Zero `LIVE_VOLTAGE` rows with `observed_at ∈ [20:45:44, 21:15:44]` |
| Trip-end obs outside window | Valid 12.15V @ `20:00:44` precedes window by 45m |
| Post-grace fallback | After `21:45:44Z`, policy selects nearest contaminated historical candidate (pre-trip alternator ~14.8V) |
| Vehicle wake @ probe | **NO** — `source_timestamp` still `20:00:44`, RESTING, speed 0 |

**Classification:** `QUALITY_REJECTED_EXPECTED` (policy-correct; not pipeline defect)

---

## Step 8 — Current vehicle state

| Field | Value |
|-------|-------|
| `LATEST_TELEMETRY_AT` | `2026-09-06T20:00:44Z` |
| `CURRENT_ACTIVITY_STATE` | RESTING |
| `WAKE_AFTER_RESTING` | NO |
| `NEW_TRIP_STARTED` | NO |

---

## Step 9 — Minimal safety delta

| Check | Result |
|-------|--------|
| `NEW_FAILURE_CLASSES` | none |
| `NEW_LOGICAL_DUPLICATES` | 0 |
| `IDEMPOTENCY_VIOLATIONS` | 0 |
| `RESERVATION_LEAK` | NO |
| `RECONCILIATION_STORM` | NO |
| `PM2_HEALTH` | PASS (online; +2 restarts since event probe — controlled restart ~`21:43Z`) |
| `SCHEDULER_HEALTH` | PASS |
| `SCHEDULER_LEADERS` | 1 |
| `MIXED_RUNTIME_CONFIG` | NO |

---

## Step 10 — M3.1 decision

No natural VALID REST_60M → no E2E closure. Retain **PENDING_NATURAL_E2E_EVIDENCE**.

**Next candidate:** REST_6H target due `2026-09-07T02:00:44Z` on same session (if session remains RESTING and telemetry arrives in that window).

> **REST_6H pre-maturity probe (`22:14Z`):** ENQUEUED; DIMO wake-only LV during sleep; `M3_1_VALIDATION_BLOCKER=SIGNAL_OBSERVABILITY`. See `M3_1_STAGE2_KS_MX_2024_REST6H_MATURITY_PROBE_2026-09-06.md`.

---

## Machine-readable block

```
BATTERY_V2_KS_MX_2024_REST60_MATURITY_PROBE=COMPLETE
VEHICLE=KS MX 2024
SESSION_ID=82324f65
TRIP_END_AT=2026-09-06T20:00:44Z
RESTING_PROMOTED_AT=2026-09-06T20:22:30Z
REST_60M_DUE_AT=2026-09-06T21:00:44Z
QUALITY_WINDOW_START=2026-09-06T20:45:44Z
QUALITY_WINDOW_END=2026-09-06T21:15:44Z
LATEST_PERMITTED_EVALUATION_AT=2026-09-06T21:45:44Z
PREVIOUS_NOT_YET_DUE_CLASSIFICATION_CORRECT=NO
TARGET_STATE=COMPLETED
MEASUREMENT_RESULT=NATURAL_CONTAMINATED
NATURAL_VALID_REST_60M_FOUND=NO
NATURAL_END_TO_END_CHAIN_PROVEN=NO
PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
PRODUCTION_CHANGED=NO
```
