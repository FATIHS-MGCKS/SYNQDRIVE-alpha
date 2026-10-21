# EXP-021 S4F-7T — Current Production attestation supersession closure

**Date (UTC):** 2026-10-06  
**Scope:** Read-only Production verification + evidence correction. **No** deploy, restart, env/DB mutation, migrations on Production, GLOBAL/Tiny/S4 activation, or runtime RC `9d286e58…` deploy.

## Task anchors

| Field | Value |
|-------|--------|
| Repository `main` @ task start | `377e5fa20f6e685ba1deeeb9c5fedf4b10baf228` |
| S4F-7S evidence PR | **#1904** @ `0259973342cd75f49feb3dfd2e349da54d136b3b` (+ S4F-7T commits) |
| S4F-7M attestation source commit | `c29179366bb3e0f7f4cd3284155fd4bdbb8ae310` |
| Historical runtime RC | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` |
| Historical deploy controller | `8a18bb6e13a04490ed3e49e393817bee77722902` |
| Expected PRESTATE fingerprint | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` |

## 1 — Live Production identity (unchanged since S4F-7S)

Read-only SSH `synqdrive-admin@srv1374778.hstgr.cloud`.

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `0c19eb62cef292e4e26ebeb2cf3b8f8afcbca2a2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261006064327_v4994` |
| `REPLICA_A_PID` / `REPLICA_B_PID` | `1272786` / `1273047` |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | `0c19eb62…` (both) |
| `NO_MIXED_RUNTIME_SHA` | **YES** |

## 2 — Attestation source files (byte identity)

Compared `git show` for Production SHA, S4F-7M, and runtime RC on exactly four paths under `s4-runtime/`:

| Check | Result |
|-------|--------|
| `PRODUCTION_ATTESTATION_FILES_PRESENT` | **YES** (on live release tree) |
| `PRODUCTION_ATTESTATION_FILES_BYTE_IDENTICAL_TO_S4F7M` | **YES** (all four SHA-256 match) |
| `PRODUCTION_ATTESTATION_FILES_BYTE_IDENTICAL_TO_RUNTIME_RC` | **YES** |

| Ancestry | Value |
|----------|--------|
| `CURRENT_PRODUCTION_CONTAINS_S4F7M_COMMIT_ANCESTRY` | **YES** |
| `PRODUCTION_COMMITS_AHEAD_OF_S4F7M` | **16** |
| `PRODUCTION_VS_RUNTIME_RC_RELATION` | **DIVERGED** (`git rev-list --left-right --count 9d286e58…...0c19eb62…` → `1` / `32`; merge-base `ee958854…`) |

Live release file hashes (example): `di-v0-s4-runtime-config-attestation.ts` → `6579318e5deb4ad60774d3a42e733f0aa0df0176f9a188b2c0f459f9679b1b0a`.

## 3 — Runtime RC deploy disposition

| Field | Value |
|-------|--------|
| `RUNTIME_RC_CONTAINS_ATTESTATION_NEEDED_BY_PRODUCTION` | **NO** (Production already has equivalent four-file attestation) |
| `CURRENT_PRODUCTION_ALREADY_CONTAINS_REQUIRED_ATTESTATION` | **YES** |
| `RUNTIME_RC_DEPLOY_WOULD_BE_RUNTIME_REGRESSION` | **YES** (`32` commits / `171` files ahead on Production vs RC) |
| `RUNTIME_RC_DEPLOY_REQUIRED_FOR_ATTESTATION_OBJECTIVE` | **NO** |
| `RUNTIME_RC_DEPLOY_STATUS` | **`SUPERSEDED_DO_NOT_DEPLOY`** |

## 4–5 — Authenticated live attestation (Replica A / B)

Method: localhost `GET /api/v1/metrics` with `METRICS_BEARER_TOKEN` from `/opt/synqdrive/shared/backend.env` (token **not** logged).

| Replica | Sample count | State | Fingerprint | Contract |
|---------|--------------|-------|-------------|----------|
| A (`3001`) | **1** | **PRESTATE** | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` | `v1` |
| B (`3002`) | **1** | **PRESTATE** | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` | `v1` |

`REPLICA_ATTESTATION_PARITY=YES`

## 6 — Topology

| Check | Result |
|-------|--------|
| Health / readiness A & B | **PASS** |
| `NGINX_DUAL_UPSTREAM` | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** (A=LEADER, B=FOLLOWER) |
| `SCHEDULER_CONVERGENCE` | **PASS** |

## 7 — `backend.env` semantics

All six S4 enable keys **MISSING** (effective OFF). Three Tiny staging keys **MISSING**. Live PRESTATE fingerprint matches dormant-env expectation.

## 8 — GLOBAL kill

`di_v0_s4_control`: `GLOBAL_ROW_COUNT=1`, `GLOBAL_KILL_STATE=KILLED`, `EFFECTIVE_GLOBAL_KILL_STATE=KILLED`.

## 9 — S4 persistence

| Table / metric | Rows |
|----------------|------|
| `di_v0_s4_pipeline_versions` | 0 |
| `di_v0_s4_work_items` | 0 |
| Active work items (non-terminal status) | 0 |
| `di_v0_s4_evidence_snapshots` | 0 |
| Shadow run/interval tables | **not present** on schema → **0** activity |

`S4_RUNTIME_ACTIVITY_DETECTED=NO`

## 10 — Provider / Redis

`synqdrive_dimo_global_budget_enabled 1` on both replicas → `REPLICA_*_GLOBAL_BUDGET_RUNTIME=ENABLED`. `REDIS_REACHABLE=YES` (`PONG`).

## 11 — How attestation reached Production

VPS release scan (`/opt/synqdrive/releases/*`):

- All retained releases **through** `20261002014651_v4994`: attestation source file **ABSENT**.
- **`20261006064327_v4994`** (`0c19eb62…`): file **present**, hash matches S4F-7M/RC.

`ATTESTATION_ARRIVED_VIA_LATER_NORMAL_PRODUCTION_DEPLOY=YES` (ordinary release deploy `20261006064327_v4994`, not the frozen four-file RC cutover).

## 12–13 — Historical authority disposition

| Artifact | Disposition |
|----------|-------------|
| Runtime RC `9d286e58…` | `RUNTIME_RC_IMMUTABLE=YES`, `RUNTIME_RC_HISTORICAL_VALIDITY=PRESERVED`, `RUNTIME_RC_CURRENT_DEPLOY_AUTHORITY=NO`, `RUNTIME_RC_DISPOSITION=SUPERSEDED_BY_NEWER_PRODUCTION_RUNTIME` |
| Deploy controller `8a18bb6e…` | `DEPLOY_CONTROLLER_IMMUTABLE=YES`, `DEPLOY_CONTROLLER_HISTORICAL_VALIDITY=PRESERVED`, `DEPLOY_CONTROLLER_CURRENT_EXECUTION_REQUIRED=NO`, `DEPLOY_CONTROLLER_CURRENT_AUTHORIZATION_STATUS=NOT_AUTHORIZED` |

## 14 — Rollback authority correction

| Field | Value |
|-------|--------|
| `HISTORICAL_ROLLBACK_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `HISTORICAL_ROLLBACK_RELEASE` | `20261002014651_v4994` |
| `HISTORICAL_ROLLBACK_STILL_CURRENT_DEPLOY_BASE` | **NO** (live base is `0c19eb62…` / `20261006064327_v4994`) |

## 15 — Migration state

`PRODUCTION_APPLIED_MIGRATION_COUNT=404` (read-only). `MIGRATION_DEPLOY_REQUIRED_FOR_ATTESTATION_OBJECTIVE=NO`.

## 16 — S4F-7S supersession (see addendum on S4F-7S evidence)

S4F-7S historical result **`BLOCKED_PRODUCTION_RUNTIME_DRIFT`** remains valid for its **frozen** old-SHA deploy contract. S4F-7T closes the **attestation objective** without requiring that RC deploy.

## 17 — Closure decision

| Field | Value |
|-------|--------|
| `ATTESTATION_PRODUCTION_OBJECTIVE_ACHIEVED` | **YES** |
| `HISTORICAL_RUNTIME_RC_DEPLOY_REQUIRED` | **NO** |
| `HISTORICAL_DEPLOY_CONTROLLER_EXECUTION_REQUIRED` | **NO** |
| `FINAL_PRODUCTION_ACTION_REQUIRED` | **NO** |
| `S4F7S_BLOCKER_RESOLUTION` | **`DEPLOY_NO_LONGER_REQUIRED`** |
| `FINAL_RESULT` | **`PASS_SUPERSEDED_NO_DEPLOY_REQUIRED`** |

## Production prohibition

All mutation gates **NO** (read-only observation only).
