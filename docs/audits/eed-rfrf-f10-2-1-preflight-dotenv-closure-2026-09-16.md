# RFRF F10.2.1 — Production preflight / dotenv safety micro-closure

**Date:** 2026-09-16  
**Branch:** `cursor/rfrf-f10-2-1-preflight-dotenv-f21f`  
**Hotfix base:** `295635fcfcb84dcaabf24f796a5827c66a0da2f8` (F10.1 merge #1665 — production approved release)  
**Target integration branch:** `main` @ `bb2c800f609cb9db2c1a0bba368ebfbcf0ca4b0b` (draft PR only; **not** deploy target)

## Problem

F10.2 production baseline alignment succeeded, but `POST_DEPLOY_PREFLIGHT=BLOCKED` because
`rfrf-production-preflight.sh` and helpers `source` `/opt/synqdrive/shared/backend.env` as Bash.
`HM_HEALTH_APP_MQTT_TOPIC` contains literal `$share/...`, which breaks under `set -u` when sourced.

## Fix (operational tooling only)

| Change | Detail |
|--------|--------|
| Safe dotenv reader | `rfrf_dotenv_get()` — Node key-scoped parse; no `$` expansion, no `$(...)`, no backticks |
| DB readonly access | `rfrf_db_readonly_counts()` + preflight schema checks use `rfrf_dotenv_database_url()` |
| Blast-radius | Removed `source "$BACKEND_ENV"`; uses safe DATABASE_URL read |
| Readiness diagnostic | `rfrf_verify_worker_readiness()` emits `READINESS_/REDIS_/WORKERS_/WORKERS_ENABLED_` per replica; reuses dual gate |
| Live preflight mode | `rfrf-production-preflight.sh --check --live-required` adds live Prometheus + F8 rule health gates |

## Classification

| Field | Value |
|-------|-------|
| RFRF_RUNTIME_SEMANTICS_CHANGED | NO |
| PRISMA_SCHEMA_CHANGED | NO |
| NEW_MIGRATION_REQUIRED | NO |
| PRODUCTION_MUTATED | NO |
| PRODUCTION_DEPLOYED | NO |

## F10.2 production drift (documented, not remediated)

### Latent EXP-021 enable

`EXP021_FLEET_COORDINATOR_ENABLED=true` remains in production `backend.env`. Runtime `295635fc` has no
EXP-021 coordinator implementation — flag is **inert** today. Any future deploy containing EXP-021 must
resolve this separately before execution.

`LATENT_EXP021_ENABLE_ON_FUTURE_DEPLOY=YES`

### DB ahead of deployed runtime

Production previously ran `2c862b69` (EXP-021 PR #1664) before pin-back to `295635fc`.

Read-only VPS evidence (2026-09-16):

| Check | Result |
|-------|--------|
| EXP-021 migrations in DB | YES — `20260915180000_exp021_fleet_study_registry`, `20260915190000_exp021_fleet_study_hardening` |
| RFRF migrations in DB | YES — F2/F4/F5 migrations present |
| `raw_refuel_candidates` | table exists; count **0** |
| fallback VEE | count **0** |
| `prisma migrate status` @ `295635fc` | **Database schema is up to date!** |

`PRODUCTION_DB_AHEAD_OF_DEPLOYED_RUNTIME=YES`  
`DB_AHEAD_COMPATIBILITY_FOR_RFRF=PASS` (additive EXP-021 migrations; RFRF tables/columns intact; Stage 0 counts zero)

### Unrelated firing alerts (read-only Prometheus)

| Alert | Severity | Firing since (UTC) | Blocks F10 preflight? | Blocks RFRF Stage 1 tooling gate? | Blocks Stage 2 runtime? |
|-------|----------|-------------------|----------------------|-----------------------------------|-------------------------|
| `IamSeedAdminEnabledInProduction` | critical | 2026-09-16 | NO | NO | NO (separate security remediation) |
| `BullMQFailedJobsCritical` | critical | 2026-09-15 | NO | NO | NO (ops concern; not in F10 live gates) |
| `HostDiskSpaceLow` | critical | 2026-09-15 | NO | NO | NO |
| `HostDiskSpaceWarning` | warning | 2026-09-10 | NO | NO | NO |

`UNRELATED_ALERTS_BLOCK_STAGE1=NO`  
`UNRELATED_ALERTS_BLOCK_STAGE2=NO`

## Validation

- `bash backend/scripts/test/rfrf-f10-dotenv-safety-tests.sh`
- `bash backend/scripts/test/rfrf-f10-operational-tooling-gate.sh`
- Deterministic fixture proves `DOTENV_COMMAND_SUBSTITUTION_EXECUTED=NO`

## Deploy policy

Hotfix head ancestry: `295635fc → F10.2.1 commit(s)`. Deploy **hotfix head**, not current `main`.
After hotfix deploy to production, retry:

```bash
sudo RFRF_REQUIRED_GIT_SHA=295635fcfcb84dcaabf24f796a5827c66a0da2f8 \
  bash /opt/synqdrive/current/backend/scripts/ops/rfrf-production-preflight.sh --check --live-required
```

`STAGE_1_START_AUTHORIZED=NO` until operator explicitly authorizes Stage 1 after preflight PASS.
