# EXP-021 S4F-7S — Final exact-controller + exact-runtime-RC Production deploy preflight

**Date (UTC):** 2026-10-06  
**Scope:** Read-only Production observation + controller checkout validation. **No** deploy, env mutation, DB write, migration on Production, or S4 activation.

## Frozen task authorities

| Field | Value |
|-------|--------|
| Task main anchor | `c7da2aa75304fc633977a2d9e84137796dd3fee9` (S4F-7R merged) |
| Workspace main @ evidence | `377e5fa20f6e685ba1deeeb9c5fedf4b10baf228` |
| Runtime RC | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` (parent `ee9588548845c8077aa0cba0684b06eac7c9d4d2`, **4 files**) |
| Deploy controller | `8a18bb6e13a04490ed3e49e393817bee77722902` (`release/exp021-s4f7r-deploy-controller-rc1`) |
| Historical rollback target (task freeze) | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` / `20261002014651_v4994` |

## 1 — Immutable authority re-anchor

| Check | Result |
|-------|--------|
| `RUNTIME_RC_REMOTE_REACHABLE` | **YES** |
| `RUNTIME_RC_SHA` | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` |
| `RUNTIME_RC_PARENT_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `RUNTIME_RC_CHANGED_FILE_COUNT` | **4** |
| `DEPLOY_CONTROLLER_REMOTE_REACHABLE` | **YES** |
| `DEPLOY_CONTROLLER_SHA` | `8a18bb6e13a04490ed3e49e393817bee77722902` |
| `DEPLOY_CONTROLLER_REMOTE_TIP_MATCH` | **YES** |

Runtime RC tree contains **no** `di-v0-s4f7q-*` ops files (`RC_CONTAINS_S4F7Q_GUARD=NO`, `RC_CONTAINS_S4F7Q_CLI=NO`).

## 2 — Controller / runtime separation

| Field | Value |
|-------|--------|
| `RUNTIME_SHA_AND_CONTROLLER_SHA_SEPARATE_AUTHORITIES` | **YES** |
| `APPLICATION_RUNTIME_SOURCE` | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` (intended forward target) |
| `DEPLOY_CONTROL_SOURCE` | `8a18bb6e13a04490ed3e49e393817bee77722902` |
| `DEPLOY_CONTROLLER_ROOT_INDEPENDENT_OF_CURRENT_SYMLINK` | **YES** (S4F-7R design) |
| `DEPLOY_CONTROLLER_ROOT_INDEPENDENT_OF_TARGET_RELEASE` | **YES** |

## 3 — Live Production identity (**BLOCKER**)

Read-only SSH `synqdrive-admin@srv1374778.hstgr.cloud`.

| Field | Observed | Task-frozen expected |
|-------|----------|----------------------|
| `CURRENT_PRODUCTION_SHA` | **`0c19eb62cef292e4e26ebeb2cf3b8f8afcbca2a2`** | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | **`20261006064327_v4994`** | `20261002014651_v4994` |
| `PRODUCTION_SHA_MATCH_EXPECTED` | **NO** |
| `PRODUCTION_RELEASE_MATCH_EXPECTED` | **NO** |

| Replica | PID | SHA (via `current` symlink) |
|---------|-----|-----------------------------|
| A (`synqdrive`) | 1272786 | `0c19eb62…` |
| B (`synqdrive-b`) | 1273047 | `0c19eb62…` |

`NO_MIXED_RUNTIME_SHA=YES` (both replicas on same release).

**`FINAL_RESULT=BLOCKED_PRODUCTION_RUNTIME_DRIFT`** — do not adapt frozen old-SHA pins automatically.

## 4 — Topology (read-only)

| Check | Result |
|-------|--------|
| `REPLICA_A_HEALTH` / `REPLICA_B_HEALTH` | **PASS** |
| `REPLICA_A_READINESS` / `REPLICA_B_READINESS` | **PASS** |
| `NGINX_DUAL_UPSTREAM` | **PASS** |
| `SCHEDULER_LEADER_COUNT` | **1** (A=LEADER, B=FOLLOWER) |
| `SCHEDULER_CONVERGENCE` | **PASS** |

## 5 — `backend.env`

| Field | Value |
|-------|--------|
| `BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` (matches historical prestate) |
| Six S4 enable flags | **MISSING** → effective **OFF** |
| Three Tiny staging keys | **MISSING** |

## 6 — GLOBAL kill (`di_v0_s4_control`)

| Field | Value |
|-------|--------|
| `GLOBAL_ROW_COUNT` | **1** (`id=GLOBAL`) |
| `GLOBAL_KILL_STATE` | **KILLED** |
| `EFFECTIVE_GLOBAL_KILL_STATE` | **KILLED** |

## 7 — S4 persistence

All **0**: pipeline registry, work items, active work items, evidence snapshots, shadow runs/intervals.

## 8 — Budget / Redis

| Field | Value |
|-------|--------|
| `REPLICA_A_GLOBAL_BUDGET_RUNTIME` | **ENABLED** |
| `REPLICA_B_GLOBAL_BUDGET_RUNTIME` | **ENABLED** |
| `REDIS_REACHABLE` | **YES** |

## 9 — Attestation metric (unexpected on current runtime)

Authenticated metrics on **both** replicas:

| Field | Value |
|-------|--------|
| `REPLICA_A_ATTESTATION_METRIC_PRESENT` | **YES** |
| `REPLICA_B_ATTESTATION_METRIC_PRESENT` | **YES** |

Current Production runtime is **`0c19eb62…`** (not the frozen historical `ee958854…`). Attestation presence is consistent with a **newer main-line deploy** that includes S4F-7M runtime — it is **not** the frozen four-file RC prestate. This does **not** satisfy the historical “old runtime without metric” assumption and must be reconciled before an exact-RC cutover authorization.

## 10–11 — Migration authority

| Field | S4F-7Q snapshot | Fresh (2026-10-06) |
|-------|-----------------|---------------------|
| `PRODUCTION_APPLIED_MIGRATION_COUNT` | 402 | **404** |
| `PRODUCTION_MIGRATION_HISTORY_FINGERPRINT` | `c297532d…` | **`4941cf832e019cb7495e00a80cd68cd3`** |
| `RC_KNOWN_MIGRATION_COUNT` | 369 | **369** |
| `DB_AHEAD_MIGRATION_HISTORY_COUNT` | 33 | **35** |
| `RC_FORWARD_PENDING_MIGRATION_COUNT` | 0 | **0** |

`PRODUCTION_MIGRATION_HISTORY_CHANGED_SINCE_S4F7Q=YES` → fresh disposable rehearsal **required** (completed).

### Disposable rehearsal (non-Production)

Script: `di-v0-s4f7q-disposable-migration-rehearsal.sh` @ RC `9d286e58…`  
Disposable DB: `synqdrive_exp021_s4f7q_20261006103920`  
Log: `/opt/cursor/artifacts/exp021-s4f7s-disposable-migration-rehearsal.log`

| Field | Value |
|-------|--------|
| `DISPOSABLE_REHEARSAL_REQUIRED` | **YES** |
| `DISPOSABLE_MIGRATE_DEPLOY` | **PASS** |
| `DISPOSABLE_MIGRATE_DEPLOY_APPLIED_MIGRATION_COUNT` | **0** |
| `MIGRATION_TABLE_EXACT_PRE_POST_IDENTITY` | **YES** |
| `DATABASE_SCHEMA_EXACT_PRE_POST_IDENTITY` | **YES** |
| `EXACT_RC_MIGRATION_COMPATIBLE_WITH_CURRENT_PRODUCTION_DB` | **YES** (disposable only) |

## 12–13 — Controller checkout preflight

Clean checkout `release/exp021-s4f7r-deploy-controller-rc1` @ `8a18bb6e…`, `npm ci`, then:

`OPERATOR_ACK=YES DI_S4F7Q_EXECUTE_DEPLOY=0` → `CONTROLLER_PREFLIGHT_ONLY=PASS`, `CONTROLLER_DEPLOY_INVOKED=NO`.

Frozen **CLI pin checks** (not live Production equality):

| Pin | Result |
|-----|--------|
| `TARGET_RUNTIME_SHA_PIN` | **PASS** (`9d286e58…`) |
| `OLD_PRODUCTION_SHA_PIN` | **PASS** (`ee958854…` — frozen deploy contract only) |
| `DEPLOY_CONTROLLER_SHA_PIN` | **PASS** (`8a18bb6e…`) |

Live Production **does not** match frozen `OLD_PRODUCTION_SHA` (see §3).

## 14–16 — Execution / rollback contract (controller @ `8a18bb6e…`)

From merged S4F-7Q/S4F-7R ops code (not executed on Production):

| Field | Value |
|-------|--------|
| `REPLICA_A_ATTESTATION_GATE_BEFORE_B` | **YES** (guarded mode) |
| `B_RESTART_BLOCKED_UNTIL_A_ATTESTATION_PASS` | **YES** |
| `REPLICA_A/B_EXPECTED_ATTESTATION_STATE` | **PRESTATE** |
| Fingerprint | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` |
| `ROLLBACK_FORWARD_GATE_DISABLED` | **YES** |
| `ROLLBACK_TARGET_OLD_SHA_ALLOWED` | **YES** |
| `ROLLBACK_TARGET_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` (frozen; **not** current live SHA) |
| `ROLLBACK_TARGET_RELEASE` | `20261002014651_v4994` (frozen) |

## 17–18 — Intended delta / authorization

`EXPECTED_*_MUTATION=NO`, `EXPECTED_PROVIDER_CALL_DELTA=0`, `EXPECTED_S4_WORK_DELTA=0`.  
`PRODUCTION_DEPLOY_AUTHORIZATION_PRESENT=NO`.

Future human authorization must name **both** immutable SHAs **and** explicitly reconcile **live** Production baseline vs frozen `ee958854…` rollback target.

## Production prohibition

All mutation gates **NO** (read-only observation + disposable DB only).

## Preflight readiness

| Field | Value |
|-------|--------|
| `FINAL_EXACT_CONTROLLER_DEPLOY_PREFLIGHT_READY` | **NO** |
| `FINAL_RESULT` | **`BLOCKED_PRODUCTION_RUNTIME_DRIFT`** |
| Primary blockers | Live Production SHA/release drift; frozen old-SHA contract vs `0c19eb62…`; attestation already present on current runtime |

---

## S4F-7T supersession addendum (2026-10-06)

This section **does not** change the S4F-7S historical verdict (`FINAL_RESULT=BLOCKED_PRODUCTION_RUNTIME_DRIFT`, `FINAL_EXACT_CONTROLLER_DEPLOY_PREFLIGHT_READY=NO`). That run was evaluated against a **frozen** old Production SHA (`ee958854…`) and exact-controller forward contract.

Follow-up read-only closure **EXP-021 S4F-7T** ([EXP021_S4F7T_CURRENT_PRODUCTION_ATTESTATION_SUPERSESSION_CLOSURE.md](EXP021_S4F7T_CURRENT_PRODUCTION_ATTESTATION_SUPERSESSION_CLOSURE.md)) establishes:

| Field | Value |
|-------|--------|
| `S4F7S_BLOCKER_RESOLUTION` | **`DEPLOY_NO_LONGER_REQUIRED`** (attestation objective met on live `0c19eb62…`) |
| Live attestation | Both replicas: **1** sample, **PRESTATE**, fingerprint `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` |
| Runtime RC `9d286e58…` | **`SUPERSEDED_DO_NOT_DEPLOY`** for attestation — Production already contains byte-identical S4F-7M four-file surface |
| Deploy controller `8a18bb6e…` | **Not authorized** for current execution; historical artifact preserved |
| S4F-7T closure | `FINAL_RESULT=PASS_SUPERSEDED_NO_DEPLOY_REQUIRED` |
