# EXP-021 S4F-7P — Exact-RC dormant attestation Production deploy preflight

**Date (UTC):** 2026-10-03  
**Scope:** Read-only Production preflight + RC seal re-verification. **No** deploy, env mutation, DB write, migration execution, restart, or S4 activation.

## Frozen authorities

| Field | Value |
|-------|--------|
| Evidence / main @ task | `1e540183072b98c4f0e6249ed864b0054fe209ef` |
| **RC SHA (deploy authority)** | **`9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4`** |
| RC branch | `release/exp021-s4f7o-minimal-attestation-rc1` |
| RC parent / Production SHA | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| Production release | `20261002014651_v4994` |
| S4F-7M source | `c29179366bb3e0f7f4cd3284155fd4bdbb8ae310` |

## 1 — Git / RC re-anchor

| Check | Result |
|-------|--------|
| `RC_COMMIT_REMOTE_REACHABLE` | **YES** |
| `RC_BRANCH_REMOTE_TIP_SHA` | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` |
| `RC_BRANCH_REMOTE_TIP_MATCH` | **YES** |
| `RC_PARENT_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `RC_PARENT_MATCH` | **YES** |
| `RC_COMMIT_COUNT_ABOVE_PRODUCTION` | **1** |
| `RC_CHANGED_FILE_COUNT` | **4** |
| `RC_UNRELATED_CHANGED_FILE_COUNT` | **0** |

## 2 — Live Production identity

Read-only via SSH `synqdrive-admin@srv1374778.hstgr.cloud` (sudo for PM2/Postgres).

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261002014651_v4994` |
| `PRODUCTION_SHA_MATCH` | **YES** |
| `PRODUCTION_RELEASE_MATCH` | **YES** |
| `REPLICA_A_PID` | 93511 |
| `REPLICA_B_PID` | 93780 |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `NO_MIXED_RUNTIME_SHA` | **YES** |
| `REPLICA_A_UPTIME_SEC` | ~16988 |
| `REPLICA_B_UPTIME_SEC` | ~16980 |

**No** `BLOCKED_PRODUCTION_BASE_DRIFT`.

## 3 — Topology health

| Check | Result |
|-------|--------|
| `REPLICA_A_HEALTH` | **PASS** |
| `REPLICA_B_HEALTH` | **PASS** |
| `NGINX_DUAL_UPSTREAM` | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** (readiness: A=FOLLOWER, B=LEADER) |
| `SCHEDULER_CONVERGENCE` | **PASS** |

## 4 — `backend.env`

| Field | Value |
|-------|--------|
| `BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `BACKEND_ENV_SHA_MATCH_HISTORICAL_PRESTATE` | **YES** |
| S4 enable flags | **MISSING** → effective **OFF** |
| Three staging keys | **MISSING** |

## 5 — GLOBAL kill

| Field | Value |
|-------|--------|
| `GLOBAL_ROW_COUNT` | 1 |
| `GLOBAL_KILL_STATE` | KILLED |
| `EFFECTIVE_GLOBAL_KILL_STATE` | KILLED |

## 6 — S4 persistence

| Table / metric | Rows |
|----------------|-----:|
| `di_v0_s4_pipeline_versions` | 0 |
| `di_v0_s4_work_items` | 0 |
| active work items | 0 |
| `di_v0_s4_evidence_snapshots` | 0 |
| shadow runs / intervals | 0 (no shadow tables on schema; counted 0) |

## 7 — Budget / Redis

| Field | Value |
|-------|--------|
| `REPLICA_A_GLOBAL_BUDGET_RUNTIME` | **ENABLED** (`synqdrive_dimo_global_budget_enabled 1`) |
| `REPLICA_B_GLOBAL_BUDGET_RUNTIME` | **ENABLED** |
| `REDIS_REACHABLE` | **YES** |

## 8 — Attestation metric absence (expected)

| Field | Value |
|-------|--------|
| `REPLICA_A_ATTESTATION_METRIC_PRESENT` | **NO** |
| `REPLICA_B_ATTESTATION_METRIC_PRESENT` | **NO** |

Expected before RC deploy (runtime still `ee958854…` without S4F-7M).

## 9 — Deploy mechanism

| Field | Value |
|-------|--------|
| `DEPLOY_TOOL` | `backend/scripts/ops/vps-deploy-release.sh` (bootstrap via `.cursor/scripts/cloud-agent-deploy.sh` with `SYNQDRIVE_REQUESTED_DEPLOY_SHA` / `CLOUD_AGENT_REQUESTED_DEPLOY_SHA`) |
| `DEPLOY_SUPPORTS_EXACT_SHA_TARGET` | **YES** (`vps_clone_release_at_sha`, detached fetch, SHA verify) |
| `DEPLOY_TARGET_CAN_BE_PINNED_TO_RC_SHA` | **YES** |
| `DEPLOY_IMPLICITLY_USES_MAIN` | **NO** (SHA required; cloud agent refuses unverified main default in skip mode) |
| `DEPLOY_CHECKOUT_EXPECTED_SHA_VERIFICATION` | **YES** (clone + `rev-parse` equality) |

Rolling restart: `vps_replica_rolling_deploy` — **A** restart → A health/readiness/SHA → **B** restart → B health/readiness/SHA → post-deploy convergence.

**Future attestation:** PRESTATE proof on A before B is an **operator read-only metrics step** (not yet embedded in `vps-deploy-release.sh`). Rolling deploy already **gates B on A health/SHA** (`REPLICA_A_ATTESTATION_GATE_BEFORE_B=YES` as policy; attestation scrape is additive verification).

`DEPLOY_WRAPPER_REMEDIATION_REQUIRED=NO` for SHA-pinned deploy path.

## 10 — Future deploy target

| Field | Value |
|-------|--------|
| `AUTHORIZED_FUTURE_DEPLOY_SHA_CANDIDATE` | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` |
| `CURRENT_MAIN_IS_DEPLOY_TARGET` | **NO** |
| `RC_BRANCH_NAME_IS_DEPLOY_AUTHORITY` | **NO** |
| `RC_COMMIT_SHA_IS_DEPLOY_AUTHORITY` | **YES** |

## 11 — Prisma / migrations

| Field | Value |
|-------|--------|
| `RC_PRISMA_SCHEMA_IDENTICAL_TO_PRODUCTION` | **YES** |
| `RC_MIGRATION_TREE_IDENTICAL_TO_PRODUCTION` | **YES** (369 migration dirs) |
| `RC_NEW_MIGRATION_COUNT` | **0** |
| `RC_KNOWN_MIGRATION_COUNT` | **369** |
| `PRODUCTION_APPLIED_MIGRATION_COUNT` | **386** |
| `RC_PENDING_MIGRATION_COUNT` | **0** (no RC migration folder unapplied in DB) |
| `DEPLOY_PRISMA_MIGRATE_DEPLOY_EXPECTED_EFFECT` | **NO_NEW_MIGRATION** |
| `CANONICAL_DEPLOY_RUNS_PRISMA_MIGRATE_DEPLOY` | **YES** |

**Note:** DB has **17** applied migration records not present in the RC/`ee958854` migration tree (DB ahead of deployed artifact). `prisma migrate deploy` at RC SHA applies **zero** forward migrations (`RC_PENDING_MIGRATION_COUNT=0`). No RC-introduced schema delta.

## 12 — Schema drift from RC

| Field | Value |
|-------|--------|
| `RC_PRISMA_SCHEMA_CHANGED_FROM_PRODUCTION` | **NO** |
| `RC_MIGRATION_TREE_CHANGED_FROM_PRODUCTION` | **NO** |
| `RC_DATABASE_SCHEMA_CHANGE_REQUIRED` | **NO** |
| `DATABASE_BACKUP_REQUIRED_BY_RC_DELTA` | **NO** (platform pre-deploy backup remains policy in `vps-deploy-release.sh`) |

## 13 — RC build reproducibility

Fresh worktree @ `9d286e58a…`: `npm ci`, `prisma generate`, `npm run build` → **PASS**.

## 14–15 — Dormancy / expected runtime effect

Attestation only; S4 flags remain OFF; no provider/DB/work/timer activation from the four-file delta.

## 16 — Post-deploy acceptance (not executed)

Both replicas must emit PRESTATE + fingerprint `b648908a…` via authenticated `127.0.0.1:3001` / `:3002` metrics; GLOBAL KILLED; staging keys MISSING; S4 persistence unchanged.

## 17–18 — Rollback

`ROLLBACK_TARGET_SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2`, release `20261002014651_v4994` via `vps_replica_rollback` / prior release symlink + rolling restart. **No** DB down-migration, env restore, or GLOBAL change required for RC rollback.

## 19 — Authorization

`PRODUCTION_DEPLOY_AUTHORIZATION_PRESENT=NO` — this preflight is **not** deploy authorization.

## Production mutation gate

All **NO** — read-only observation only.
