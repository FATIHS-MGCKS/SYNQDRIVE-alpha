# M3.3F F4.6 — Sustained D3 shadow activation (production **PASS**)

**Date:** 2026-09-28  
**Governance `origin/main` @ evidence authoring:** `6952fdf727f236ac7b338e14b85d54af6733fa0f` (includes F4.5R1 merge **`9e2e2746a`** / PR #1829) — **not deployed** for Battery runtime  
**Authoritative Battery production runtime:** `7f5f8fdf2d158c59e19323efee979aee1a0757e0` / `20260928095512_v4994`  
**Prerequisite gate:** **`SUSTAINED_D3_ACTIVATION_GATE_READY=YES`** (F4.5R1 @ PR #1829)

## Historical vs sustained activation timestamps

| Field | Value | Meaning |
|-------|-------|---------|
| **`F_D3_T0`** | **`2026-09-28T09:18:31.393Z`** | **Frozen** — first-ever production D3 activation (F4.5R @ `68a05e41…`); **unchanged** |
| **`F4_6_T0`** | **`2026-09-28T17:31:48.494Z`** | **Sustained shadow activation** start (both root replicas D3=true after follower-first rollout) |

## Executive summary

**F4.6** enabled **sustained** D3 shadow materialization on **root PM2 only** @ **`7f5f8fdf…`**, observed **two consecutive natural leader COMPLETED** reconciliation intervals (900000 ms effective cadence), verified **zero** failed ticks / processed errors / invariant failures in the observation window, and **left D3 intentionally ON**.

| Result | Value |
|--------|-------|
| `F4_6_SUSTAINED_D3_ACTIVATION_RESULT` | **PASS** |
| `D3_SUSTAINED_SHADOW_ACTIVE` | **YES** |
| `M3_3F_F4_COMPLETE` | **YES** |
| `D3_PRODUCTION_ACTIVE_FINAL` | **ON** (shadow — not customer health publication) |
| `E3_RUNTIME_ACTIVATED` | **NO** |

## Configuration (unchanged except D3 enable)

| Field | Value |
|-------|-------|
| `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` | **true** (shared env — intentional sustained ON) |
| `BATTERY_V2_LONGITUDINAL_RECONCILIATION_BATCH_SIZE` | **1** |
| Effective interval | **900000 ms** (`LONGITUDINAL_RECONCILIATION_INTERVAL_DEFAULT_MS=900000`; env key absent; **not** 300000 ms effective) |
| `LONGITUDINAL_RECONCILIATION_INTERVAL_MIN_MS` | **300000** (floor only) |

## Pre-activation baseline

| Field | Value |
|-------|-------|
| `C3_ROWS_PRE` | 50 |
| `D3_REVISION_ROWS_PRE` | 2 |
| `ACK_ROWS_PRE` | 2 |
| `PRE_CROSS_TENANT_MISMATCH_COUNT` | 0 |
| `PRE_PARTIAL_REVISION_WITHOUT_ACK_COUNT` | 0 |
| `F4_6_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-f46-sustained-d3-20260928173050.sql.gz` |
| `F4_6_BACKUP_SHA256` | `39344576ebb7de27baa35a28a0c05dc3c8c215f9418f3caa4678f4f7fd8d9549` |

## Observation window

| Tick | Time (UTC) | Leader | Result | Notes |
|------|------------|--------|--------|-------|
| **1** | **`2026-09-28T18:01:30Z`** (observer) / **18:01:27** (PM2 log) | `synqdrive` | **COMPLETED** | candidates=1, **CREATED**=1, errors=0 |
| **2** | **`2026-09-28T18:57:18Z`** (leader `last_success_timestamp`) | `synqdrive-b` | **COMPLETED** | zero-candidate tick (valid for sustained gate); errors=0 |

Authenticated metrics after activation: **`D3_FLAG_GAUGE_FINAL_A/B=1`**. Cumulative since baseline: **`FAILED_TICK_DELTA=0`**, **`PROCESSED_ERROR_DELTA=0`**, **`INVARIANT_FAILURE_DELTA=0`**.

**Operator note:** The primary observer session was interrupted during tick-2 wait; post-hoc verification (`/tmp/f46-finalize.sh` on VPS) closed the gate using leader metrics + PM2 logs. Production remained in a **single** sustained ON configuration (no partial split).

## Post-activation DB (shadow writes)

| Field | Value |
|-------|-------|
| `D3_REVISION_ROWS_POST` | 7 |
| `ACK_ROWS_POST` | 7 |
| `CROSS_TENANT_MISMATCH_COUNT_POST` | 0 |
| `PARTIAL_REVISION_WITHOUT_ACK_COUNT_POST` | 0 |
| `PROMETHEUS_DB_CONSISTENCY` | **PASS** |

Fleet revision growth during sustained ON reflects **bounded batch=1** scheduler progress across eligible vehicles (not manual materialization).

## Explicit non-actions

| Field | Value |
|-------|-------|
| Deploy governance `main` | **NO** |
| Schema / migration | **NO** |
| Backfill / historical replay | **NO** |
| Manual D3 materialization | **NO** |
| E3 runtime / customer health score | **NO** |

## Machine-readable summary

```
M3_3F_F4_6_SUSTAINED_D3_SHADOW_ACTIVATION_RESULT=PASS

F4_6_SUSTAINED_D3_ACTIVATION_RESULT=PASS
F4_6_RESULT=SUCCESS
D3_SUSTAINED_SHADOW_ACTIVE=YES
M3_3F_F4_COMPLETE=YES
D3_PRODUCTION_ACTIVE_FINAL=ON

F_D3_T0=2026-09-28T09:18:31.393Z
F_D3_T0_UNCHANGED=YES
F4_6_T0=2026-09-28T17:31:48.494Z

PRODUCTION_SHA=7f5f8fdf2d158c59e19323efee979aee1a0757e0
PRODUCTION_RELEASE_ID=20260928095512_v4994
RECONCILIATION_INTERVAL_MS=900000
BATCH_SIZE_EFFECTIVE=1
```
