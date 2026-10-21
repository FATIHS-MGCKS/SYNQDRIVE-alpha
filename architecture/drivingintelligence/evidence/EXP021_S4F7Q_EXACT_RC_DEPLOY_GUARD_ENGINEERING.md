# EXP-021 S4F-7Q — Exact-RC deploy guard engineering + DB-ahead migration compatibility proof

**Date (UTC):** 2026-10-03  
**Scope:** Engineering on `main` only. **No** Production deploy, restart, env mutation, DB write on `synqdrive`, or S4 activation.

## Frozen authorities

| Field | Value |
|-------|--------|
| Main @ task start | `1e540183072b98c4f0e6249ed864b0054fe209ef` |
| RC SHA (immutable) | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` |
| Production SHA | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| PRESTATE fingerprint | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` |
| S4F-7P evidence PR | **#1898** (corrected @ `429e541ad…`) |

## S4F-7P readiness correction (§1)

`vps_replica_rolling_deploy()` enforces **A health/readiness/SHA → B restart** only. **No** authenticated PRESTATE scrape gate between replicas until S4F-7Q opt-in mode is used.

| Field | Value |
|-------|--------|
| `REPLICA_A_ATTESTATION_GATE_BEFORE_B` | **NO** (pre-7Q generic deploy) |
| `DEPLOY_WRAPPER_REMEDIATION_REQUIRED` | **YES** |
| `EXACT_RC_PRODUCTION_DEPLOY_PREFLIGHT_READY` | **NO** |
| `S4F7P_CORRECTED_FINAL_RESULT` | `BLOCKED_PENDING_DEPLOY_GUARD_AND_MIGRATION_COMPATIBILITY_PROOF` |

## RC Prisma authority (@ `9d286e58…`, clean `npm ci`)

| Field | Value |
|-------|--------|
| `RC_PRISMA_CLI_VERSION` | 5.22.0 |
| `RC_PRISMA_CLIENT_VERSION` | 5.22.0 |
| `RC_PACKAGE_LOCK_SHA256` | `0b42a1e657090715edc0676f797e1e105496343c18cd9dcecb01754f0accd965` |

## Migration divergence

| Field | S4F-7P frozen | Rehearsal observed (2026-10-03) |
|-------|---------------|----------------------------------|
| Applied migration rows | 386 | **402** (read-only `synqdrive`) |
| RC migration folders | 369 | 369 |
| DB-only (not in RC tree) | 17 | **33** |
| RC forward pending | 0 | **0** |

Disposable rehearsal: `backend/scripts/ops/di-v0-s4f7q-disposable-migration-rehearsal.sh` on VPS → `synqdrive_exp021_s4f7q_20261003032619` (not Production).

| Field | Value |
|-------|--------|
| `DISPOSABLE_DB_CREATED` | **YES** |
| `DISPOSABLE_DB_IS_PRODUCTION` | **NO** |
| `PRODUCTION_DB_WRITE_COUNT` | **0** |
| `DISPOSABLE_PRISMA_MIGRATION_ROW_COUNT_BEFORE` | 402 |
| `DISPOSABLE_PRISMA_MIGRATION_ROW_COUNT_AFTER` | 402 |
| `MIGRATION_STATUS_EXIT_CODE` | 0 (`Database schema is up to date!`) |
| `MIGRATION_HISTORY_DIVERGENCE_REPRODUCED` | **YES** |
| `DATABASE_MIGRATIONS_NOT_PRESENT_IN_RC` | **YES** |
| `DISPOSABLE_MIGRATE_DEPLOY` | **PASS** |
| `DISPOSABLE_MIGRATE_DEPLOY_EXIT_CODE` | 0 |
| `DISPOSABLE_MIGRATE_DEPLOY_APPLIED_MIGRATION_COUNT` | 0 |
| `MIGRATION_TABLE_EXACT_PRE_POST_IDENTITY` | **YES** |
| `DATABASE_SCHEMA_EXACT_PRE_POST_IDENTITY` | **YES** (public catalog column fingerprint; see script) |
| `EXACT_RC_MIGRATION_DEPLOY_COMPATIBLE_WITH_CURRENT_DB_AHEAD_BASELINE` | **YES** |

Artifact log (agent): `/opt/cursor/artifacts/exp021-s4f7q-migration-rehearsal-final.log`

## Deploy guard implementation

| Component | Role |
|-----------|------|
| `di-v0-s4f7q-exact-rc-attestation-deploy.lib.ts` | Frozen SHA pins, pre-deploy env gates, PRESTATE metrics parse (S4F-7M authority), rolling decision + rollback simulation |
| `di-v0-s4f7q-exact-rc-attestation-deploy-cli.ts` | Bounded CLI (`sha-pins`, `predeploy-full`, `fetch-verify-prestate`, …) |
| `lib/di-v0-s4f7q-exact-rc-attestation-deploy.lib.sh` | VPS rolling gate: A restart → health/SHA → **authenticated PRESTATE** → only then B |
| `lib/vps-production-replica.lib.sh` | Opt-in: `SYNQDRIVE_DI_S4F7Q_EXACT_RC_ATTESTATION_GATE=1` |
| `di-v0-s4-exact-rc-attestation-deploy-production.sh` | Operator wrapper (preflight default; `DI_S4F7Q_EXECUTE_DEPLOY=1` for future authorized deploy) |

| Field | Value |
|-------|--------|
| `DEPLOY_GUARD_DEFAULT_OFF_FOR_GENERIC_DEPLOY` | **YES** |
| `REPLICA_A_ATTESTATION_GATE_BEFORE_B` | **YES** (when gate enabled) |
| `A_ATTESTATION_FAILURE_FAILS_CLOSED` | **YES** (`REPLICA_B_RESTART_ATTEMPTED=NO`) |
| `B_FAILURE_TRIGGERS_FULL_ROLLBACK` | **YES** (via existing `vps-deploy-release.sh` + `vps_replica_rollback`) |
| `METRICS_BEARER_AUTH_USED` | **YES** |
| `METRICS_TOKEN_LOGGED` | **NO** |

Tests: `npm run test:di:s4f7q:exact-rc-deploy-guard` — **26** cases.

## RC immutability

| Field | Value |
|-------|--------|
| `RC_SHA_BEFORE` / `RC_SHA_AFTER` | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` |
| `RC_BRANCH_TIP_UNCHANGED` | **YES** |
| `RC_PAYLOAD_FILE_COUNT_STILL` | **4** |

## Production prohibition

All production mutation gates **NO** (read-only dump + metrics/SSH observation only).
