# M3.3F F4.6 — Sustained D3 shadow activation (production **PASS**)

**Date:** 2026-09-28  
**Governance `origin/main` @ PR #1831 hardening:** `1b27208079d2b3f2027f24abf88a249ad733ffc9` — **not deployed** for Battery runtime  
**Authoritative Battery production runtime (F4.6 activation scope):** `7f5f8fdf2d158c59e19323efee979aee1a0757e0` / `20260928095512_v4994`  
**Prerequisite gate:** **`SUSTAINED_D3_ACTIVATION_GATE_READY=YES`** (F4.5R1 @ PR #1829)

## Historical vs sustained activation timestamps

| Field | Value | Meaning |
|-------|-------|---------|
| **`F_D3_T0`** | **`2026-09-28T09:18:31.393Z`** | **Frozen** — first-ever production D3 activation (F4.5R @ `68a05e41…`); **unchanged** |
| **`F4_6_T0`** | **`2026-09-28T17:31:48.494Z`** | **Sustained shadow activation** start (both root replicas D3=true after follower-first rollout) |

## Executive summary

**F4.6** enabled **sustained** D3 shadow materialization on **root PM2 only** @ **`7f5f8fdf…`**. The sustained observation window (**`F4_6_T0` → ≥ `2026-09-28T18:57:18Z`**) contained **five** identifiable natural **leader** reconciliation executions (900000 ms effective cadence, batch **1**), each **COMPLETED** with **CREATED=1** and **errors=0**, reconciling **`D3_REVISION_DELTA=+5`** / **`ACK_DELTA=+5`**. Failed tick, processed-error, and invariant-failure deltas in that window are **0**; D3 was **left intentionally ON**.

| Result | Value |
|--------|-------|
| `F4_6_SUSTAINED_D3_ACTIVATION_RESULT` | **PASS** |
| `F4_6_RESULT_AFTER_FORENSICS` | **PASS** |
| `D3_SUSTAINED_SHADOW_ACTIVE` | **YES** |
| `M3_3F_F4_COMPLETE` | **YES** |
| `D3_PRODUCTION_ACTIVE_FINAL` | **ON** (shadow — not customer health publication) |
| `E3_RUNTIME_ACTIVATED` | **NO** |
| `TWO_CONSECUTIVE_TICKS_CLAIM` | **`NOT_CONFIRMED_INTERVENING_TICKS_EXIST`** (see § Forensics) |

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

## Forensics — executed leader ticks (`F4_6_T0` window)

**Observation window:** **`2026-09-28T17:31:48.494Z`** → **`2026-09-28T18:57:18Z`** (minimum end for gate closure).

**Sources:** root PM2 reconciliation log lines (leader-only executions log `longitudinal_reconciliation_tick …` when `candidateCount > 0`); Postgres `materialized_at` / `acknowledged_at` alignment; F4.6 activation metric baseline (`/tmp/f46-sustained-result.env`).

**Operator note:** The live observer session was **interrupted** before tick enumeration completed; **post-hoc read-only reconstruction** (2026-09-28) closed accounting. Production remained **single-config D3 ON** (no split activation).

| TICK_INDEX | TIMESTAMP (UTC) | LEADER_PROCESS | RESULT | CAND | PROC | CREATED | EXIST | D1_REJ | D2_REJ | ERR | DB revision (attributable) | EVIDENCE_SOURCE |
|------------|-----------------|----------------|--------|------|------|---------|-------|--------|--------|-----|----------------------------|-----------------|
| 1 | `2026-09-28T17:46:27Z` | `synqdrive` | COMPLETED | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `de2ac92a…` @ `17:46:27.012` | PM2 + Postgres |
| 2 | `2026-09-28T18:01:27Z` | `synqdrive` | COMPLETED | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `cb2de9b9…` @ `18:01:27.375` | PM2 + Postgres |
| 3 | `2026-09-28T18:27:18Z` | `synqdrive-b` | COMPLETED | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `edb66c72…` @ `18:27:18.119` | PM2 + Postgres |
| 4 | `2026-09-28T18:42:18Z` | `synqdrive-b` | COMPLETED | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `25de8bd2…` @ `18:42:18.118` | PM2 + Postgres |
| 5 | `2026-09-28T18:57:18Z` | `synqdrive-b` | COMPLETED | 1 | 1 | 1 | 0 | 0 | 0 | 0 | `30985e20…` @ `18:57:18.160` | PM2 + Postgres |

**Sampled ticks (observer / finalize):** tick **1** ≈ **18:01** (`synqdrive`); tick **2** ≈ **18:57** (`synqdrive-b`) — **not** adjacent leader executions; ticks **3–4** at **18:27** and **18:42** sit between them.

### +5 revision / +5 ack accounting

| REVISION_ID | ORG_ID | VEHICLE_ID | MATERIALIZED_AT (UTC) | ACK_PRESENT | ACK_AT (UTC) |
|-------------|--------|------------|------------------------|-------------|--------------|
| `de2ac92a-abc5-4291-b484-86b8dc7679ac` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `a60c0749-a7cd-494e-b5b9-dea3c6b97d63` | `2026-09-28T17:46:27.012` | YES | `2026-09-28T17:46:27.031` |
| `cb2de9b9-2a5b-4307-8c5d-9649840e46b4` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `c10351f8-b6a2-4258-947f-631aeaa6d359` | `2026-09-28T18:01:27.375` | YES | `2026-09-28T18:01:27.418` |
| `edb66c72-61e6-4fe6-ba83-7d407d6dd007` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | `2026-09-28T18:27:18.119` | YES | `2026-09-28T18:27:18.148` |
| `25de8bd2-6c7e-48b4-9fde-a7ed9e290635` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `8c850ff1-4201-432b-af2e-2711dbc7ca48` | `2026-09-28T18:42:18.118` | YES | `2026-09-28T18:42:18.147` |
| `30985e20-0b57-4f06-8421-3ecaeea1674a` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` | `19fedd4b-c4e8-4de8-a125-dab293326e7e` | `2026-09-28T18:57:18.160` | YES | `2026-09-28T18:57:18.195` |

`ALL_5_REVISIONS_HAVE_ACK=YES` · `TOTAL_D3_REVISION_DELTA_WINDOW=5` · `TOTAL_ACK_DELTA_WINDOW=5` · single org scope · no duplicate scientific identity in window.

### Metric safety (F4.6 observation window)

From activation baseline through window end: **`FAILED_TICK_DELTA=0`**, **`PROCESSED_ERROR_DELTA=0`**, **`INVARIANT_FAILURE_DELTA=0`** (PM2: **0** `longitudinal_reconciliation_tick_failed` lines; F4.6 finalize + authenticated scrape at activation). **`CROSS_TENANT_MISMATCH_COUNT=0`**, **`PARTIAL_REVISION_WITHOUT_ACK_COUNT=0`**.

**Classification:** `TWO_CONSECUTIVE_TICKS_CLAIM=NOT_CONFIRMED_INTERVENING_TICKS_EXIST` · **`SUSTAINED_WINDOW_HEALTH=PASS`**.

## Post-activation DB (shadow writes at gate closure)

| Field | Value |
|-------|-------|
| `D3_REVISION_ROWS_POST` | 7 |
| `ACK_ROWS_POST` | 7 |
| `D3_REVISION_DELTA` | **+5** (from pre **2**) |
| `ACK_DELTA` | **+5** (from pre **2**) |
| `CROSS_TENANT_MISMATCH_COUNT_POST` | 0 |
| `PARTIAL_REVISION_WITHOUT_ACK_COUNT_POST` | 0 |
| `PROMETHEUS_DB_CONSISTENCY` | **PASS** |

Fleet revision growth reflects **bounded batch=1** scheduler progress across eligible vehicles (not manual materialization, backfill, or replay).

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
F4_6_RESULT_AFTER_FORENSICS=PASS
D3_SUSTAINED_SHADOW_ACTIVE=YES
M3_3F_F4_COMPLETE=YES
D3_PRODUCTION_ACTIVE_FINAL=ON

F_D3_T0=2026-09-28T09:18:31.393Z
F_D3_T0_UNCHANGED=YES
F4_6_T0=2026-09-28T17:31:48.494Z

TWO_CONSECUTIVE_TICKS_CLAIM=NOT_CONFIRMED_INTERVENING_TICKS_EXIST
SUSTAINED_WINDOW_HEALTH=PASS
IDENTIFIED_EXECUTED_LEADER_TICK_COUNT=5

PRODUCTION_SHA=7f5f8fdf2d158c59e19323efee979aee1a0757e0
PRODUCTION_RELEASE_ID=20260928095512_v4994
RECONCILIATION_INTERVAL_MS=900000
BATCH_SIZE_EFFECTIVE=1
D3_REVISION_DELTA=5
ACK_DELTA=5
```
