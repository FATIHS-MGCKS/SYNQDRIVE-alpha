# M3.3F F4.5R1 — Observability-complete single-tick D3 canary (production **PASS**)

**Date:** 2026-09-28  
**Governance `origin/main` @ evidence authoring:** `54bb5284657287b6f416a1c5ac1a4f6b4adecd40` — **not deployed** for this workstream  
**F4.5R1A production SHA acceptance:** `M3_3F_F4_5R1A_PRODUCTION_SHA_DRIFT_ACCEPTANCE_AUDIT_RESULT=PASS`  
**Authoritative F4.5R1 production runtime:** `7f5f8fdf2d158c59e19323efee979aee1a0757e0` / `20260928095512_v4994`  
**Reference historical Battery SHA (F4.5R original canary):** `68a05e4156db28568ad5b7718ca1f9ad2d799884` / `20260928001456_v4994`  
**`ROLLBACK_TO_68A_REQUIRED=NO`**

## Historical anchors (do not rewrite)

| Event | Runtime anchor | Notes |
|-------|----------------|-------|
| **F4.5R** first production D3 write | **`68a05e41…`** | One leader tick @ **`2026-09-28T09:33:42Z`**; **`F4_5R_PROMETHEUS_FIRST_TICK_EVIDENCE=INCOMPLETE`** (401 scrape) |
| **`F_D3_T0`** | **`2026-09-28T09:18:31.393Z`** | **Frozen** — assigned during F4.5R root PM2 activation; **must never be reassigned** |
| **F4.5R1** observability retry | **`7f5f8fd…`** | Separate bounded canary; closes Prometheus gap **without** claiming F4.5R ran on `7f5f8fd` |

## Executive summary

**F4.5R1** executed one **authenticated** observability-complete D3 leader reconciliation tick on **root PM2 only** @ production SHA **`7f5f8fdf2d158c59e19323efee979aee1a0757e0`**, then returned **D3 OFF**. Pre-pause Prometheus baseline and post-tick snapshots were captured on **both** replicas with **`METRICS_BEARER_TOKEN`**. Direct leader counter deltas show exactly **one** completed tick (**CREATED** path), DB revision/ack +1, **no** second executed leader tick during pause, **no** sustained activation.

| Sub-result | Verdict |
|------------|---------|
| `F4_5R1_OBSERVABILITY_RESULT` | **PASS** |
| `F4_5R_PROMETHEUS_FIRST_TICK_EVIDENCE` | **CLOSED_BY_F4_5R1** |
| `F4_5R1_OBSERVABILITY_COMPLETE` | **YES** |
| `SUSTAINED_D3_ACTIVATION_GATE_READY` | **YES** (gate only — **D3 remains OFF**) |
| `D3_PRODUCTION_ACTIVE_FINAL` | **NO** |

## Production SHA acceptance (F4.5R1A)

| Field | Value |
|-------|-------|
| `REFERENCE_SHA` | `68a05e4156db28568ad5b7718ca1f9ad2d799884` |
| `ACCEPTED_F4_5R1_PRODUCTION_SHA` | `7f5f8fdf2d158c59e19323efee979aee1a0757e0` |
| `ROLLBACK_TO_68A_REQUIRED` | **NO** |
| Battery-longitudinal byte diff `68a05e41..7f5f8fd` | **0** on scheduler/metrics/D3 paths (F4.5R1A audit) |

## Activation window (F4.5R1 only)

| Gate | Result |
|------|--------|
| `SINGLE_PM2_AUTHORITY` | **ROOT_ONLY** (`ADMIN_PM2_*=0`) |
| `F4_5R1_T0` | **`2026-09-28T14:45:30.153Z`** (both replicas D3=true after follower-first rollout) |
| `F_D3_T0` | **`2026-09-28T09:18:31.393Z`** (**unchanged**) |
| Follower-first | `synqdrive-b` then `synqdrive` |
| `CANARY_LEADER_PROCESS` | **`synqdrive`** (port 3001) |
| `FIRST_D3_SCHEDULER_TICK_AT` | **`2026-09-28T15:00:11.396Z`** |
| `RECONCILIATION_INTERVAL_MS` (effective) | **`900000`** — shared `backend.env` omits `BATTERY_V2_LONGITUDINAL_RECONCILIATION_INTERVAL_MS`; **not** 300000 as effective production cadence |
| `LONGITUDINAL_RECONCILIATION_INTERVAL_DEFAULT_MS` | **`900000`** (runtime default when env key absent) |
| `LONGITUDINAL_RECONCILIATION_INTERVAL_MIN_MS` | **`300000`** (configured floor only; **not** the observed F4.5R1 leader cadence) |
| Observed leader cadence | ~15m from **`F4_5R1_T0`** → **`FIRST_D3_SCHEDULER_TICK_AT`** (matches **900000** ms effective interval) |
| `BATCH_SIZE_EFFECTIVE` | **1** |

## Backup (pre-write)

| Field | Value |
|-------|-------|
| `F4_5R1_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-f45r1-d3-canary-20260928144428.sql.gz` |
| `F4_5R1_BACKUP_SHA256` | `3287ab4cb2f686236c12caddf0b007ca8e3adc6644e4377cf57e136f735c2587` |
| `F4_5R1_BACKUP_GZIP_TEST` | **PASS** |

## Prometheus evidence (authenticated)

| Field | Value |
|-------|-------|
| `METRICS_AUTH_REPLICA_A` / `B` | **PASS** |
| `POST_RESTART_METRIC_BASELINE_AUTHENTICATED` | **YES** |
| `POST_RESTART_BASELINE_BEFORE_FIRST_D3_TICK` | **YES** |
| `FIRST_TICK_METRIC_EVIDENCE_CAPTURED_PRE_PAUSE` | **YES** |
| `PROM_COMPLETED_TICK_DELTA` | **1** |
| `PROM_FAILED_TICK_DELTA` | **0** |
| `PROM_CANDIDATE_HISTOGRAM_COUNT_DELTA` | **1** |
| `PROM_PROCESSED_CREATED_DELTA` | **1** |
| `PROM_ACK_CREATED_DELTA` | **1** |
| `PROM_PROCESSED_ERROR_DELTA` / `PROM_INVARIANT_FAILURE_DELTA` | **0** |
| Pause window | `ADDITIONAL_COMPLETED_TICK_DELTA_DURING_PAUSE=0` |

Raw scrape files: ephemeral on VPS under `/tmp/f45r1-metrics-run9/` (not in git; no bearer token stored).

## Canary materialization (DB + metrics)

| Field | Value |
|-------|-------|
| `CANARY_ORGANIZATION_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `CANARY_VEHICLE_ID` | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |
| `CANARY_OUTCOME` | **CREATED** |
| `materialized_at` | **`2026-09-28T15:00:09.594Z`** (aligns with first leader tick) |
| `D3_REVISION_DELTA_R1` | **1** (1 → 2 revisions fleet-wide) |
| `ACK_ROW_DELTA_R1` | **1** (1 → 2 acks) |
| Prior F4.5R pair | org same; vehicle `19fedd4b-c4e8-4de8-a125-dab293326e7e` @ `09:33:42Z` **unchanged** |
| `PROMETHEUS_DB_CONSISTENCY` | **PASS** |
| `SECOND_D3_EXECUTED_TICK_DETECTED` | **NO** |

## Final OFF state

| Field | Value |
|-------|-------|
| `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` | **false** (shared env) |
| `D3_FLAG_GAUGE_FINAL_A` / `B` | **0** |
| `OFF_CONVERGENCE_COMPLETED_AT` | **`2026-09-28T15:00:24.501Z`** (~13s pause) |
| `D3_LEFT_ON_AFTER_CANARY` | **NO** |

## Explicit non-actions

| Field | Value |
|-------|-------|
| `PRODUCTION_MUTATION` | **YES** (bounded D3 canary + env toggle only) |
| `BACKFILL_EXECUTED` | **NO** |
| `MANUAL_D3_MATERIALIZATION_EXECUTED` | **NO** |
| `E3_RUNTIME_ACTIVATED` | **NO** |
| Deploy current `main` | **NO** |

## Machine-readable summary

```
M3_3F_F4_5R1_OBSERVABILITY_COMPLETE_SINGLE_TICK_CANARY_RESULT=PASS

F4_5R1_RESULT=SUCCESS
F4_5R1_OBSERVABILITY_RESULT=PASS
F4_5R_PROMETHEUS_FIRST_TICK_EVIDENCE=CLOSED_BY_F4_5R1
F4_5R1_OBSERVABILITY_COMPLETE=YES
SUSTAINED_D3_ACTIVATION_GATE_READY=YES
D3_PRODUCTION_ACTIVE_FINAL=NO

F_D3_T0=2026-09-28T09:18:31.393Z
F_D3_T0_UNCHANGED=YES
F4_5R1_T0=2026-09-28T14:45:30.153Z
FIRST_D3_SCHEDULER_TICK_AT=2026-09-28T15:00:11.396Z

REFERENCE_SHA=68a05e4156db28568ad5b7718ca1f9ad2d799884
ACCEPTED_F4_5R1_PRODUCTION_SHA=7f5f8fdf2d158c59e19323efee979aee1a0757e0
ROLLBACK_TO_68A_REQUIRED=NO
```
