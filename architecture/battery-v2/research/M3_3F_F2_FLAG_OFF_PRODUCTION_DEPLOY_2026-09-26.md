# M3.3F F2 — flag-OFF production deploy + zero-write smoke

**Date (UTC):** 2026-09-26  
**Mode:** Controlled production F2 — **C3 and D3 flags remain OFF**; no backfill; no F3 execution.  
**Epistemic scope:** This gate proves **flag-OFF safety** (no C3/D3 writes, ops CLI `SKIPPED_FLAG_OFF`, metrics registration). It does **not** prove flag-ON behavior or authoritative pipeline equivalence under natural load.

## Merge / deploy authority

| Field | Value |
|-------|-------|
| F1 merge authority | PR **#1787** merged |
| PR head | `ad2a933db78153e8e36bce0005ec3e73c7c5168c` |
| F1 merge SHA (`origin/main`) | `2b54a357854c9d44f638ee857f72936967c04992` |
| `F1_MERGE_ANCESTOR_OF_MAIN` | **YES** |
| `PRODUCTION_CONTAINS_F1` (post-gate) | **YES** |

## Target classification (CASE A)

| Field | Value |
|-------|-------|
| `PRE_DEPLOY_PRODUCTION_SHA` | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` |
| `PRE_DEPLOY_RELEASE` | `20260925182907_v4994` |
| `F2_DEPLOY_MODE` | **CASE_A** (production ancestor of F1 merge) |
| `DEPLOY_REQUIRED` | **YES** |
| `REQUESTED_DEPLOY_SHA` | `2b54a357854c9d44f638ee857f72936967c04992` |
| `EFFECTIVE_F2_DEPLOY_SHA` | `2b54a357854c9d44f638ee857f72936967c04992` |
| `DEPLOYED_SHA` | `2b54a357854c9d44f638ee857f72936967c04992` |
| `DEPLOYED_RELEASE` | `20260926094359_v4994` |

Deploy path: `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1` + `CLOUD_AGENT_REQUESTED_DEPLOY_SHA=2b54a357854c9d44f638ee857f72936967c04992` via `.cursor/scripts/cloud-agent-deploy.sh` (DEC-016 exact SHA).

## Pre-deploy backup and migrations

| Field | Value |
|-------|-------|
| `DATABASE_BACKUP` | **YES** |
| `DATABASE_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-deploy-20260926094359.sql.gz` |
| Prisma at F1 target vs DB | **`Database schema is up to date!`** (359 migrations; **0** pending apply at deploy) |
| F1 introduced migration | **NO** |
| `_prisma_migrations` rows with `finished_at IS NULL` | **16** (historical rows; **not** “pending apply” per `prisma migrate status`) |
| `UNEXPECTED_PENDING_MIGRATIONS` | **NO** |

## PM2 / provenance / health

| Field | Value |
|-------|-------|
| `PM2_REPLICA_COUNT` | **2** |
| `BOTH_REPLICAS_ONLINE` | **YES** |
| `CURRENT_RELEASE_SHA` | `2b54a357854c9d44f638ee857f72936967c04992` |
| `REPLICA_A_SHA` | `2b54a357854c9d44f638ee857f72936967c04992` |
| `REPLICA_B_SHA` | `2b54a357854c9d44f638ee857f72936967c04992` |
| `NO_MIXED_SHA` | **YES** |
| `REPLICA_A_HEALTH` | **PASS** (`127.0.0.1:3001`) |
| `REPLICA_B_HEALTH` | **PASS** (`127.0.0.1:3002`) |
| `EXTERNAL_HEALTH` | **PASS** (`https://app.synqdrive.eu/api/v1/health`) |
| `SCHEDULER_LEADER_COUNT` | **1** (post-deploy convergence gate PASS) |
| `RESTART_STORM` | **NO** |

## Flag baseline (authoritative, read-only env)

Source: `/opt/synqdrive/shared/backend.env` + PM2 env (no edits in F2).

| Authority | Env file | PM2 `true` override | Effective (F1 getters + shared env) |
|-----------|----------|---------------------|-------------------------------------|
| C3 `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | **ABSENT** → default OFF | **NO** | **FALSE** |
| D3 `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` | **ABSENT** → default OFF | **NO** | **FALSE** |

Post-restart replica proof (same shared env; no mixed state):

- `REPLICA_A_C3_FLAG_EFFECTIVE=FALSE`, `REPLICA_B_C3_FLAG_EFFECTIVE=FALSE`
- `REPLICA_A_D3_FLAG_EFFECTIVE=FALSE`, `REPLICA_B_D3_FLAG_EFFECTIVE=FALSE`
- `MIXED_C3_FLAG_STATE=NO`, `MIXED_D3_FLAG_STATE=NO`

Allowed production flags unchanged: `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED=true`, `BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED=true`.

## Session limit (read-only)

| Field | Value |
|-------|-------|
| `D3_SESSION_LIMIT_ENV_STATE` | **ABSENT** |
| `D3_SESSION_LIMIT_EFFECTIVE` | **100** |
| `D3_SESSION_LIMIT_WITHIN_D1_MAX` | **YES** (`LONGITUDINAL_INPUT_DB_SAFETY_MAX_SESSIONS=100`) |

## Database zero-write proof

Read-only counts on production PostgreSQL:

| Table | Before deploy | T0 (post ops smoke) | T1 (+180s natural window) | Delta |
|-------|---------------|---------------------|----------------------------|-------|
| `battery_rest_session_features` (C3) | **0** | **0** | **0** | **0** |
| `battery_longitudinal_profile_revisions` (D3) | **0** | **0** | **0** | **0** |

`MAX(created_at)` both tables: **NULL** (empty).

## Ops CLI flag-OFF smoke

Executed on deployed release with production shared env loaded (no flag overrides):

```bash
npm run battery:longitudinal-profile:materialize -- \
  --organization-id=<redacted> \
  --vehicle-id=<redacted>
```

Probe pair selected via read-only SQL (identities **not** recorded here):

| Field | Value |
|-------|-------|
| `PROBE_ORG_SHA256` | `bdc9fb68293723aaaf007893de789efd5f7bf8a04a49eccb19b6e4132815d6de` |
| `PROBE_VEH_SHA256` | `05dce302414376262a4d5bee3f59cb827de1b36ffe58e27a531e4b778420f621` |
| `OPS_FLAG_OFF_EXIT_CODE` | **0** |
| `OPS_FLAG_OFF_STATUS` | **`SKIPPED_FLAG_OFF`** |
| `OPS_FLAG_OFF_SMOKE_RESULT` | **PASS** |

Observed JSON: `{ "status": "SKIPPED_FLAG_OFF" }`; log line `longitudinal_materialization_ops session_limit=100 configured_default=100`.

## Prometheus registration (both replicas)

Authenticated scrape `http://127.0.0.1:300{1,2}/api/v1/metrics`:

| Metric | HELP/TYPE registered |
|--------|----------------------|
| `synqdrive_battery_longitudinal_profile_materialization_attempts_total` | **YES** |
| `synqdrive_battery_longitudinal_profile_materialization_duration_seconds` | **YES** |
| `synqdrive_battery_longitudinal_profile_integrity_inspection_total` | **YES** |
| `synqdrive_battery_longitudinal_profile_self_integrity_failure_total` | **YES** |

| Field | Value |
|-------|-------|
| `D3_METRIC_HELP_TYPE_REGISTERED` | **YES** |
| `D4_METRIC_HELP_TYPE_REGISTERED` | **YES** |
| `PROMETHEUS_DUPLICATE_METRIC_ERROR` | **NO** |
| vehicleId / organizationId labels on longitudinal metrics | **none observed** |

## No automatic D3 path (code authority at F1 SHA)

| Field | Value |
|-------|-------|
| `D3_AUTOMATIC_RUNTIME_CALL_SITES` | **0** |
| `D3_SCHEDULED_RECONCILIATION_IMPLEMENTED` | **NO** |
| `D3_C3_HOOK_ADDED` | **NO** |

## Post-deploy failure scan

| Field | Value |
|-------|-------|
| `NEW_F1_BOOT_ERRORS` | **0** |
| `NEW_F1_DI_ERRORS` | **0** |
| `NEW_F1_PRISMA_ERRORS` | **0** |
| `PROMETHEUS_DUPLICATE_METRIC_ERROR` (runtime logs) | **NO** |

Deploy boot check showed normal Nest module initialization (including generalized evidence module); no new materialization errors while flags OFF.

## Authoritative pipeline regression window (180s)

No targeted natural event exercised longitudinal materialization or C3 shadow persistence during the observation window.

| Field | Value |
|-------|-------|
| `AUTHORITATIVE_REGRESSION_OBSERVED` | **NO** |
| `AUTHORITATIVE_EQUIVALENCE_UNDER_NATURAL_EVENT` | **NOT_PROVEN_IN_F2** |

## Safety state after F2 (required)

| Field | Value |
|-------|-------|
| `C3_PRODUCTION_ACTIVATED` | **NO** |
| `D3_PRODUCTION_ACTIVATED` | **NO** |
| `D4_PRODUCTION_ACTIVATED` | **NO** |
| `E3_RUNTIME_ACTIVATED` | **NO** |
| `D3_RUNTIME_REACHABLE` | **NO** (ops-only manual entry; flag OFF) |
| `D4_RUNTIME_REACHABLE` | **NO** |
| `E3_RUNTIME_REACHABLE` | **NO** |
| `F_C3_T0_ASSIGNED` | **NO** |
| `F_D3_T0_ASSIGNED` | **NO** |
| `BACKFILL_EXECUTED` | **NO** |
| `NUMERIC_CALIBRATION_VALUES_SET` | **NO** |

## Rollback readiness

| Field | Value |
|-------|-------|
| `PREVIOUS_PRODUCTION_SHA` | `8a1d9c6586cbddc41bb6c94870f9d51226d71aa2` |
| `PREVIOUS_RELEASE` | `20260925182907_v4994` |
| `ROLLBACK_SCRIPT_PRESENT` | **YES** (`vps-rollback-production-release.sh`) |
| `DEPLOY_STATE_PRESENT` | **YES** (`/opt/synqdrive/shared/deploy-state/last-deploy-state.env`) |
| `ROLLBACK_READY` | **YES** |

## Verdict

| Field | Value |
|-------|-------|
| `M3_3F_F2_PRODUCTION_GATE` | **PASS** |
| `F3_ALLOWED` | **YES** |
| `F3_EXECUTED` | **NO** |

**Next authorized step:** merge this evidence PR; then **M3.3F F3 controlled C3 shadow activation** (explicit authorization only — not part of F2).
