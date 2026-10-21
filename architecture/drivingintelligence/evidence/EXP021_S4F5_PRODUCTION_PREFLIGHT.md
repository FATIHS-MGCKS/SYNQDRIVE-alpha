# EXP-021 S4F-5 — Production readiness preflight (DIMO global budget explicit enablement)

**Audit date:** 2026-10-01 (UTC)  
**Authoritative main SHA:** `8fa531b275bc4dca02c09b279c0d2b806e544007` (merged PR #1863 S4F-4)  
**Scope:** Read-only Production inspection — **no** deploy, env mutation, PM2 restart, S4F-4 mutation mode, S4 activation, operator authorization, DIMO provider calls, or S4 shadow writes.

## Method

- SSH read-only to Hostinger VPS (`srv1374778.hstgr.cloud`) as `synqdrive-admin` with `sudo -n` for `/opt/synqdrive/shared/backend.env` (mode `600`, root-owned).
- Replica health via localhost `:3001` / `:3002`; scheduler role via `/api/v1/health/readiness`.
- Config file: S4F-3 read-only audit semantics (`GLOBAL_BUDGET_CONFIG_FILE_STATE=MISSING` when key absent).
- Redis: canonical `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` / optional password — **PING only** (no secret output).
- Live budget gauge: `synqdrive_dimo_global_budget_enabled` only when deployed code includes S4F-4 metric (absent on current Production SHA → **UNKNOWN** per replica).
- Repeatable entrypoint (engineering): `backend/scripts/ops/di-v0-s4f5-production-preflight.sh` (run on VPS under `scripts/ops`).

## Production identity (2026-10-01)

| Field | Value |
|-------|--------|
| Release | `20260929224455_v4994` → `/opt/synqdrive/releases/20260929224455_v4994` |
| `PRODUCTION_SHA` | `1dd4224037a84417c5d605575bb6d288ac93184e` |
| PM2 | `synqdrive` (pid online, started 2026-09-29T23:24:51Z), `synqdrive-b` (started 2026-09-29T23:24:57Z) |
| `PRODUCTION_REPLICA_SHA_MATCH` | **YES** (shared `current` symlink) |
| `REPLICA_A_HEALTH` / `REPLICA_B_HEALTH` | **OK** |
| `SCHEDULER_SINGLE_LEADER` | **YES** |
| `NGINX_DUAL_UPSTREAM` | **YES** (`3001` + `3002`) |

## Compare to main / PR #1863

| Check | Result |
|-------|--------|
| `CURRENT_MAIN_SHA` | `8fa531b275bc4dca02c09b279c0d2b806e544007` |
| `PRODUCTION_CONTAINS_PR1863` | **NO** (Production tip is **before** merge commit `8fa531b27…`) |
| `S4F4_WRAPPER_PRESENT_IN_PRODUCTION_RELEASE` | **NO** |
| `GLOBAL_BUDGET_RUNTIME_METRIC_CODE_PRESENT` | **NO** |
| Metrics HTTP 200 on both replicas | **YES** |
| Gauge `synqdrive_dimo_global_budget_enabled` in scrape body | **NO** (both replicas) |

Main commits not yet on Production include at minimum: **S4F-4 (#1863)**, S4F-3 (#1861), and intervening release tranches.

## Env and runtime evidence

| Field | Value |
|-------|--------|
| `GLOBAL_BUDGET_CONFIG_FILE_STATE` | **MISSING** (`DIMO_GLOBAL_BUDGET_ENABLED` not set in `backend.env`) |
| `REPLICA_A_GLOBAL_BUDGET_RUNTIME` | **UNKNOWN** (metric not exported on deployed SHA) |
| `REPLICA_B_GLOBAL_BUDGET_RUNTIME` | **UNKNOWN** |
| `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE` | **UNVERIFIED** |
| `PROVIDER_GLOBAL_BUDGET_ENABLED_GATE_CURRENT` | **MISSING_EXPLICIT_KEY** |

Do **not** treat Nest default “enabled if unset” as Tiny explicit evidence.

## Redis readiness

| Field | Value |
|-------|--------|
| Host / port / db | `localhost` / `6379` / `0` |
| Auth | absent |
| `REDIS_REACHABLE` | **YES** (`PONG`) |

## S4 safety

| Field | Value |
|-------|--------|
| `S4_FLAGS_SAFE` | **YES** (no truthy `DI_V0_S4_*` control flags in `backend.env`) |
| `S4_APP_MODULE_REGISTERED` | **NO** on deployed release |
| `S4_RUNTIME_ACTIVE` | **NO** |
| `SHADOW_ACTIVATION_OCCURRED` | **NO** (no S4 runtime registration; read-only preflight only) |

## Decision

**`PRODUCTION_ROLLOUT_PREREQUISITE=DEPLOY_REQUIRED`**

Production is healthy on dual replicas, but **does not yet contain** the S4F-4 ops wrapper or live `synqdrive_dimo_global_budget_enabled` metric required for config-only rollout proof. A **standard VPS code deploy** to `8fa531b275bc4dca02c09b279c0d2b806e544007` (or later `main`) must precede `DIMO_GLOBAL_BUDGET_ENABLED=true` via `di-v0-s4f-enable-global-budget-production.sh`.

**`BLOCKERS`:** `production_sha_behind_main_missing_s4f4_assets`

**`NEXT_ACTION`:** Deploy `main` via `vps-deploy-release.sh`; re-run S4F-5 preflight; if `CONFIG_ONLY_ROLLOUT_READY`, execute S4F-4 wrapper with `DI_S4_REQUIRED_GIT_SHA` + `DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK=YES` (separate operator authorization).

## Frozen result block

```
EXP021_S4F5_PRODUCTION_PREFLIGHT_RESULT=
CURRENT_MAIN_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007
PRODUCTION_SHA=1dd4224037a84417c5d605575bb6d288ac93184e
PRODUCTION_RELEASE_ID=20260929224455_v4994
REPLICA_A_SHA=1dd4224037a84417c5d605575bb6d288ac93184e
REPLICA_B_SHA=1dd4224037a84417c5d605575bb6d288ac93184e
PRODUCTION_REPLICA_SHA_MATCH=YES
REPLICA_A_HEALTH=OK
REPLICA_B_HEALTH=OK
SCHEDULER_SINGLE_LEADER=YES
NGINX_DUAL_UPSTREAM=YES
PRODUCTION_CONTAINS_PR1863=NO
S4F4_WRAPPER_PRESENT_IN_PRODUCTION_RELEASE=NO
GLOBAL_BUDGET_RUNTIME_METRIC_CODE_PRESENT=NO
GLOBAL_BUDGET_CONFIG_FILE_STATE=MISSING
REPLICA_A_GLOBAL_BUDGET_RUNTIME=UNKNOWN
REPLICA_B_GLOBAL_BUDGET_RUNTIME=UNKNOWN
GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=UNVERIFIED
PROVIDER_GLOBAL_BUDGET_ENABLED_GATE_CURRENT=MISSING_EXPLICIT_KEY
REDIS_REACHABLE=YES
S4_FLAGS_SAFE=YES
S4_RUNTIME_ACTIVE=NO
SHADOW_ACTIVATION_OCCURRED=NO
PRODUCTION_ENV_MUTATED=NO
PRODUCTION_RESTART_OCCURRED=NO
DEPLOY_OCCURRED=NO
PROVIDER_PRODUCTION_CALL_COUNT=0
EXPLICIT_OPERATOR_AUTHORIZATION_GATE=UNKNOWN
TINY_ACTIVATION_READY=NO
PRODUCTION_ROLLOUT_PREREQUISITE=DEPLOY_REQUIRED
BLOCKERS=production_sha_behind_main_missing_s4f4_assets
NEXT_ACTION=Deploy main 8fa531b275bc4dca02c09b279c0d2b806e544007 via standard VPS release; re-run S4F-5; then config-only S4F-4 wrapper.
```
