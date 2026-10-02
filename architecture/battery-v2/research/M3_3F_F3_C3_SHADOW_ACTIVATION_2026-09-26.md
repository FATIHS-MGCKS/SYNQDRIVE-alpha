# M3.3F F3 — controlled C3 shadow activation + first natural evidence

**Date (UTC):** 2026-09-26  
**Mode:** Controlled production F3 — **C3 ON**, **D3 OFF** (explicit authorization in runbook).  
**Epistemic scope:** Runtime activation proves safe C3 shadow enablement on both replicas with D3 still gated. Natural calibration evidence is **separate**; a short post-`F_C3_T0` window with zero qualifying events is **not** an activation failure.

## Upstream authority

| Field | Value |
|-------|-------|
| F2 evidence | PR **#1792** merged @ `f16ae03c0ffe9cf8d94fa4d796b59c5c451aef6c` |
| F2 gate | **`M3_3F_F2_PRODUCTION_GATE=PASS`**, **`F3_ALLOWED=YES`**, **`F3_EXECUTED=NO`** (before this activation) |
| F1 production code | `2b54a357854c9d44f638ee857f72936967c04992` |
| Live production (pre-F3) | SHA `2b54a357854c9d44f638ee857f72936967c04992`, release **`20260926094359_v4994`** |
| `PRODUCTION_CONTAINS_F1` | **YES** |
| `PRODUCTION_F3_SEMANTIC_CONFLICT` | **NO** (env-only change; no deploy of docs-only main) |

## Backups (pre-mutation)

| Field | Value |
|-------|-------|
| `BACKEND_ENV_BACKUP_PATH` | `/opt/synqdrive/shared/backend.env.bak-f3-c3-20260926110619` |
| `BACKEND_ENV_BACKUP_SHA256` | `2de130f906599e814dd95404f6dcbfb87be093d27bccd26f3d176dcc0d727dbc` |
| `F3_DB_BACKUP_CREATED` | **YES** |
| `F3_DB_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-f3-c3-20260926110619.sql.gz` |

## Upstream flags (read-only, shared `backend.env`)

| Flag | Effective before F3 |
|------|---------------------|
| `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` | **TRUE** |
| `BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED` | **TRUE** |
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | **FALSE** (absent → default OFF) |
| `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` | **FALSE** (absent) |

## Database baseline (read-only)

| Table | Count pre-F3 | MAX(created_at) |
|-------|--------------|-----------------|
| `battery_rest_session_features` | **0** | NULL |
| `battery_longitudinal_profile_revisions` | **0** | NULL |

## Env mutation (atomic)

Single canonical key appended via temp file + replace:

- `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=true`
- `C3_ENV_KEY_COUNT=1`
- D3 key **unchanged** (absent / false)

**Not modified:** D3 flag, assessment/publication/readiness policy, numeric calibration, `F_C3_T0` (assigned later).

## Rolling activation

1. **Replica A canary:** `pm2 restart synqdrive` — health **PASS**; bounded mixed C3 window (`MIXED_C3_FLAG_STATE` expected **YES** during canary).
2. **Canary observe:** ~120s natural traffic — **0** new C3 rows (`CANARY_PRE_T0_C3_ROW_DELTA=0`).
3. **Replica B:** `pm2 restart synqdrive-b` — health **PASS**; both replicas C3 **TRUE**, D3 **FALSE**; `MIXED_C3_FLAG_STATE=NO`, `MIXED_D3_FLAG_STATE=NO`.
4. **Post-run convergence:** additional `pm2 restart synqdrive synqdrive-b --update-env` to ensure PM2/process env matches shared file (PM2 advisory during canary).

## Immutable C3 activation timestamp

| Field | Value |
|-------|-------|
| **`F_C3_T0`** | **`2026-09-26T11:09:12Z`** |

Assigned only after both replicas healthy, same SHA, C3 TRUE / D3 FALSE, scheduler leader count **1**.

| Field | Value |
|-------|-------|
| `C3_ROWS_AT_T0` | **0** |
| `D3_ROWS_AT_T0` | **0** |
| `C3_CANARY_PRE_T0_ROW_DELTA` | **0** |
| `C3_CANARY_PRE_T0_ROWS_EXCLUDED_FROM_POST_T0_ANALYSIS` | **YES** |

## Post-`F_C3_T0` observation window

**Duration:** ≥360s natural production (no manufactured trips/telemetry, no manual C3 rows, no D3 ops).

| Field | Value |
|-------|-------|
| `C3_ROWS_AFTER_SMOKE` | **0** |
| `D3_ROWS_AFTER_SMOKE` | **0** |
| `C3_POST_T0_ROW_DELTA` | **0** |
| `D3_POST_T0_ROW_DELTA` | **0** (required safety) |
| `C3_NATURAL_POST_T0_ROWS` | **0** |
| `C3_NATURAL_POST_T0_DISTINCT_ORGS` | **0** |
| `C3_NATURAL_POST_T0_DISTINCT_VEHICLES` | **0** |
| `C3_NATURAL_POST_T0_DISTINCT_SESSIONS` | **0** |

Phase/trust breakdown: **N/A** (no post-T0 rows).

## Prometheus deltas (aggregated both replicas, pre-activation scrape → post-window scrape)

| Metric / outcome | Delta |
|------------------|-------|
| `trigger_total` / `CREATED` | **0** |
| `DUPLICATE_EXISTING` | **0** |
| `SESSION_NOT_FOUND` | **0** |
| `FAILED_ISOLATED` | **0** |
| `SKIPPED_FLAG_OFF` | **0** |
| `row_created_total` | **0** |

`PROMETHEUS_DUPLICATE_METRIC_ERROR=NO`

## C5A read-only inspection

No natural post-T0 C3 row → **C5A sample not run** (`FIRST_NATURAL_C3_INSPECTION_STATUS=NOT_APPLICABLE`).

## Runtime health / safety

| Field | Value |
|-------|-------|
| `PM2_REPLICA_COUNT` | **2** |
| `NO_MIXED_SHA` | **YES** |
| `REPLICA_A/B_HEALTH` | **PASS** |
| `EXTERNAL_HEALTH` | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** |
| `RESTART_STORM` | **NO** |
| `NEW_C3_BOOT_ERRORS` | **0** |
| `NEW_C3_PRISMA_ERRORS` | **0** |
| `NEW_C3_FAILURE_CLASSES` | **NONE** |

## Authoritative isolation (code authority)

| Field | Value |
|-------|-------|
| `C3_CODE_PATH_CAN_WRITE_ASSESSMENT` | **NO** |
| `C3_CODE_PATH_CAN_WRITE_PUBLICATION` | **NO** |
| `C3_CODE_PATH_CAN_AFFECT_READINESS` | **NO** |
| `AUTHORITATIVE_REGRESSION_OBSERVED` | **NO** |
| `AUTHORITATIVE_EQUIVALENCE_UNDER_NATURAL_EVENT` | **NOT_PROVEN_IN_F3** |

## D3 / D4 / E3 remain off

| Field | Value |
|-------|-------|
| `D3_PRODUCTION_ACTIVATED` | **NO** |
| `D3_RUNTIME_REACHABLE` | **NO** |
| `D3_AUTOMATIC_RUNTIME_CALL_SITES` | **0** |
| `D3_SCHEDULED_RECONCILIATION_IMPLEMENTED` | **NO** |
| `D3_C3_HOOK_ADDED` | **NO** |
| `F_D3_T0_ASSIGNED` | **NO** |
| `BACKFILL_EXECUTED` | **NO** |

## Two-axis verdict

| Axis | Result |
|------|--------|
| **`F3_RUNTIME_ACTIVATION_RESULT`** | **PASS** |
| **`F3_NATURAL_C3_VALIDATION`** | **PENDING** (no qualifying natural post-T0 row in bounded window) |
| **`F4_ALLOWED`** | **NO** |
| **`C3_PRODUCTION_ACTIVATED`** | **YES** |

**C3 left ON** — no rollback for absent natural events.

## Rollback procedure (not executed)

1. Restore `backend.env.bak-f3-c3-20260926110619` (or set C3 `false` atomically).
2. `pm2 restart synqdrive synqdrive-b --update-env`.
3. Verify both replicas C3 **FALSE**, D3 **FALSE**; retain append-only C3 history.

`ROLLBACK_READY=YES`

## Next action

**`READ_ONLY_F3_NATURAL_EVIDENCE_FOLLOWUP`** — continue read-only observation until `C3_NATURAL_POST_T0_ROWS ≥ 1`, then C5A on first natural sample before F4 D3 activation engineering/runtime gate.

---

## ~21h read-only natural follow-up (2026-09-27 UTC)

**Mode:** strictly read-only — no deploy, env mutation, manual C3/D3, backfill, or synthetic data.  
**Immutable boundary:** **`F_C3_T0=2026-09-26T11:09:12Z`** (unchanged).  
**Live production at audit:** SHA `1b5a7f6cd91d175e82f9ee0df111d4df015b3555` / release `20260926234014_v4994` (post–F3-evidence deploy; C3 env activation unchanged since F3).

### Preserved prior window (360s post-T0)

The activation record above remains authoritative for the **initial bounded window** (`C3_NATURAL_POST_T0_ROWS=0`, `F3_NATURAL_C3_VALIDATION=PENDING`). This follow-up does **not** rewrite that observation.

### Post-T0 natural C3 materialization (DB, read-only)

| Field | Value |
|-------|-------|
| `C3_NATURAL_POST_T0_ROWS` | **15** |
| Distinct orgs / vehicles / sessions | **1** / **3** / **9** |
| Incremental / final / valid / invalidated | **8** / **7** / **15** / **0** |
| `D3_POST_T0_ROWS` | **0** (required) |

### C5A on earliest natural row (read-only ops CLI)

Earliest row by `(created_at ASC, id ASC)` — org/vehicle/session identifiers used transiently on VPS only (not recorded here).

| Field | Value |
|-------|-------|
| `FIRST_NATURAL_C3_INSPECTION_STATUS` | **OK** |
| Digest mismatch / checked / scope | **0** / **1** / **FULL** |
| Semantic revision gaps / duplicate revisions | **0** / **0** |
| Canonical selection / count aggregate | **CANONICAL_SELECTED** / **true** |
| `FIRST_NATURAL_C3_DIGEST_VALID` | **YES** |
| `FIRST_NATURAL_C3_REVISION_LINEAGE_VALID` | **YES** |

### Runtime safety (read-only)

| Field | Value |
|-------|-------|
| C3 / D3 effective (shared + both replicas) | **TRUE** / **FALSE** |
| Replica A/B + external health | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** |
| `C3_FAILED_ISOLATED_SINCE_T0` | **0** |
| `C3_PRISMA_ERRORS_SINCE_T0` | **0** |

### Exposure audit (context for zero-row → row transition)

| Field | Value |
|-------|-------|
| Rest sessions created / updated post-T0 | **7** / **3** |
| With valid rest observations (post-T0 activity) | **2** |
| Terminated (`ended_at` post-T0) | **7** |
| Late trip associated (`confirmed_at` post-T0) | **5** |
| `C4_QUALIFYING_OPPORTUNITY_OBSERVED` | **YES** |
| `C4_TRIGGER_EXECUTION_OBSERVED` | **YES** (15 append-only feature rows) |

Prometheus `synqdrive_battery_rest_session_feature_trigger_total` (authenticated scrape, both replicas): process-local counters — **`CREATED` sum = 2** since last replica restarts (~8h uptime at audit); DB row count is the authoritative natural materialization evidence for the full post-T0 interval.

### F3 closure (natural axis)

| Field | Value |
|-------|-------|
| **`F3_COMPLETE`** | **YES** |
| **`F3_NATURAL_C3_VALIDATION`** | **OBSERVED** |
| **`F4_ALLOWED`** | **YES** |
| **`NEXT_PHASE`** | **M3.3F F4 — D3 materialization activation preparation** (not executed in this follow-up) |
