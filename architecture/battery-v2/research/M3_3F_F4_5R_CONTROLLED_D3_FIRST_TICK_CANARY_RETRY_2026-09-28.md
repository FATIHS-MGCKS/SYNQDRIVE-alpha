# M3.3F F4.5R — Controlled D3 first-tick canary retry (production path **PASS**, observability **INCOMPLETE**)

**Date:** 2026-09-28  
**Authoritative production runtime:** `68a05e4156db28568ad5b7718ca1f9ad2d799884` / `20260928001456_v4994`  
**Governance `origin/main` (review):** `7f5f8fdf2d158c59e19323efee979aee1a0757e0` — **ahead of production** with unrelated Driving Intelligence / EXP021 work; **not** an automatic Battery deploy candidate  
**Frozen canary classification:** **`F4_5R_CANARY_RESULT=PASS_WITH_OBSERVABILITY_EXCEPTION`**

## Executive summary

**F4.5R attempt 3 (09:18–09:42Z)** executed the intended production canary on **root PM2 only**: one bounded D3 leader reconciliation tick at **`2026-09-28T09:33:42Z`**, **CREATED** (+1 revision, +1 ack), then automatic **D3 OFF**. A formal re-run @ `09:46Z` correctly **aborted** because D3/ack baselines were already non-zero.

The attempt-3 **observer** misclassified the run as `FIRST_TICK_TIMEOUT` because it scraped `GET /api/v1/metrics` **without** `Authorization: Bearer` using the production **`METRICS_BEARER_TOKEN`**. The endpoint returned **HTTP 401**; no usable Prometheus baseline or pre-pause tick deltas were captured. This is an **observer authentication defect**, not a D3 runtime failure. **No metric instrumentation change is implied.**

**PostgreSQL + scheduler timing** prove the production write path. The **frozen F4.5R observability contract** (pre-pause authenticated metric evidence) was **not** satisfied.

| Sub-result | Verdict |
|------------|---------|
| `F4_5R_PRODUCTION_WRITE_PATH` | **PASS** |
| `F4_5R_SINGLE_TICK_BOUND` | **PASS** |
| `F4_5R_DATABASE_CONSISTENCY` | **PASS** |
| `F4_5R_ROOT_PM2_ROLLOUT` | **PASS** |
| `F4_5R_FINAL_OFF_STATE` | **PASS** |
| `F4_5R_PROMETHEUS_FIRST_TICK_EVIDENCE` | **INCOMPLETE** |
| `SUSTAINED_D3_ACTIVATION_ALLOWED` | **NO** |

**`D3_PRODUCTION_ACTIVE_FINAL=NO`** — sustained activation requires a new explicit gate (**`NEXT_STAGE=F4_5R1_OBSERVABILITY_COMPLETE_SINGLE_TICK_CANARY`**).

## Metrics authentication root cause

| Fact | Detail |
|------|--------|
| Production scrape contract | `GET /api/v1/metrics` requires **`METRICS_BEARER_TOKEN`** (see `MetricsAuthGuard`; same pattern as `rfrf_metrics_probe` in `rfrf-production-rollout.lib.sh`) |
| F4.5R attempt-3 observer | Omitted bearer on scrape → **401**, HTML body, empty tick counters in script output |
| Runtime impact | **None** — D3 scheduler and materialization executed; DB rows written at `09:33:42Z` |
| Token handling | **Never** record bearer value in docs, logs, PR text, or git |

## Attempt 3 activation evidence (authoritative root PM2)

| Gate | Result |
|------|--------|
| `SINGLE_PM2_AUTHORITY` | **ROOT_ONLY** |
| `F_D3_T0` | **`2026-09-28T09:18:31.393Z`** (`F_D3_T0_SOURCE=AUTHORITATIVE_ROOT_PM2`) |
| `FIRST_D3_SCHEDULER_TICK_AT` | **`2026-09-28T09:33:42Z`** |
| Follower-first | `synqdrive-b` then `synqdrive` |
| `TRUE_REPLICA_REMAINED_NON_LEADER_BEFORE_SECOND_RESTART` | **YES** |
| Retry backup (pre-write) | `/opt/synqdrive/shared/backups/db-pre-f45r-d3-canary-20260928091811.sql.gz` |

## Canary materialization (DB — authoritative for write path)

| Field | Value |
|-------|-------|
| `CANARY_ORGANIZATION_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `CANARY_VEHICLE_ID` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| `CANARY_OUTCOME` | **CREATED** |
| `D3_REVISION_DELTA` | **1** |
| `ACK_ROW_DELTA` | **1** |
| `PARTIAL_REVISION_WITHOUT_ACK` | **NO** |
| `SECOND_D3_EXECUTED_TICK_DETECTED` | **NO** |

## Prometheus / frozen contract gap

| Field | Value |
|-------|--------|
| `POST_RESTART_METRIC_BASELINE_ATTEMPTED` | **YES** |
| `POST_RESTART_METRIC_BASELINE_USABLE` | **NO** |
| `POST_RESTART_METRIC_BASELINE_FAILURE` | **HTTP_401_MISSING_BEARER** |
| `FIRST_TICK_METRIC_EVIDENCE_CAPTURED_PRE_PAUSE` | **NO** |
| Direct tick metric deltas | **`NOT_CAPTURED`** (see machine block) |
| DB forensic inference | **`DB_FORENSIC_*=1`** where applicable (not Prometheus) |

## Current main vs production (no deploy)

| | SHA / note |
|---|------------|
| **Production Battery runtime** | `68a05e4156db28568ad5b7718ca1f9ad2d799884` |
| **`origin/main` @ review** | `7f5f8fdf2d158c59e19323efee979aee1a0757e0` (includes unrelated DI CI / EXP021 deltas) |
| **`CURRENT_MAIN_IS_BATTERY_DEPLOY_CANDIDATE`** | **NO** for this workstream |

## Machine-readable summary (F4.5R hardened)

```
M3_3F_F4_5R_CONTROLLED_D3_FIRST_TICK_CANARY_RETRY_RESULT=PASS_WITH_OBSERVABILITY_EXCEPTION

F4_5R_PRODUCTION_PATH_RESULT=PASS
F4_5R_CANARY_RESULT=PASS_WITH_OBSERVABILITY_EXCEPTION
F4_5R_PROMETHEUS_FIRST_TICK_EVIDENCE=INCOMPLETE
SUSTAINED_D3_ACTIVATION_ALLOWED=NO

F_D3_T0=2026-09-28T09:18:31.393Z
F_D3_T0_ASSIGNED=YES
F_D3_T0_SOURCE=AUTHORITATIVE_ROOT_PM2

FIRST_D3_SCHEDULER_TICK_AT=2026-09-28T09:33:42Z
FIRST_TICK_CANDIDATE_COUNT=1
FIRST_TICK_PROCESSED_COUNT=1
FIRST_TICK_CREATED_COUNT=1
FIRST_TICK_ERROR_COUNT=0

D3_REVISION_DELTA=1
ACK_ROW_DELTA=1
PARTIAL_REVISION_WITHOUT_ACK=NO
SECOND_D3_EXECUTED_TICK_DETECTED=NO

D3_EFFECTIVE_FINAL_A=OFF
D3_EFFECTIVE_FINAL_B=OFF
D3_LEFT_ON_AFTER_CANARY=NO

POST_RESTART_METRIC_BASELINE_ATTEMPTED=YES
POST_RESTART_METRIC_BASELINE_USABLE=NO
POST_RESTART_METRIC_BASELINE_FAILURE=HTTP_401_MISSING_BEARER
FIRST_TICK_METRIC_EVIDENCE_CAPTURED_PRE_PAUSE=NO

COMPLETED_TICK_METRIC_DELTA=NOT_CAPTURED
FAILED_TICK_METRIC_DELTA=NOT_CAPTURED
CANDIDATE_SUM_METRIC_DELTA=NOT_CAPTURED
CANDIDATE_COUNT_METRIC_DELTA=NOT_CAPTURED
ACK_CREATED_METRIC_DELTA=NOT_CAPTURED
ACK_EXISTING_METRIC_DELTA=NOT_CAPTURED

DB_FORENSIC_COMPLETED_TICK_INFERENCE=1
DB_FORENSIC_CANDIDATE_COUNT=1
DB_FORENSIC_CREATED_COUNT=1
DB_FORENSIC_ACK_CREATED_COUNT=1

D3_PRODUCTION_ACTIVE_FINAL=NO
NEXT_STAGE=F4_5R1_OBSERVABILITY_COMPLETE_SINGLE_TICK_CANARY
```

Historical canary window (attempt 3 only): `PRODUCTION_MUTATION=YES`, `ENV_CHANGED=YES`, `D3_WRITE_EXECUTED=YES` at **`68a05e41`** — **not** repeated by this docs PR.
