# EXP-021 S4F-7AK.1 — Final readiness evidence, Production drift & live execution boundary (read-only)

**Date (UTC):** 2026-10-08  
**Scope:** Close PR **#1939** evidence scope, explain Production drift vs S4F-7AJ, document live dispatch boundary. **No** Production mutation, **no** `DRY_RUN=0`, **no** live authorization.

**Drift investigation log (sanitized):** `/opt/cursor/artifacts/s4f7ak1-production-drift-investigation.log`

---

## 1. PR #1939 scope

| Item | Result |
|------|--------|
| `FINAL_PR_HEAD` | `08b0da58683ddec7b93f998af6ccd2bc2c9c189c` (pre–ChangesView revert) → updated on branch after AK.1 |
| `frontend/src/master/components/ChangesView.tsx` | **Removed** — evidence-only workstream; SynqDrive Code → Changes applies to **meaningful implementation** changes, not read-only readiness governance (per `.cursor/rules/Architectur-Updates.mdc`) |
| Expected PR diff vs `main` | `CURRENT_STATE.md`, `CHANGE_LEDGER.md`, S4F-7AK + S4F-7AK.1 evidence only |

---

## 2. Production drift (S4F-7AJ → S4F-7AK observation)

| Field | S4F-7AJ (certified dry-run POST) | Later observation |
|-------|----------------------------------|-------------------|
| `PRODUCTION_SHA` | `3b557e208c1a06e91c0a13fb8ba861b1255ee375` | **unchanged** |
| `RELEASE_ID` | `20261008182454_v4994` | **unchanged** |
| `ENV_SHA256` | `778da0aa6e5205e8b81da7fd9061b6f8526438e0d46005ad02474b3d52afeb24` | `03179b0cc59f933e2db5dcc42710edce8c08ac2e91cdcafa70c376064e14e6c8` |
| Replica A/B PID | `2174936` / `2174949` | `2183193` / `2183206` |

### Belegbare Ursache (read-only)

| Evidence | Finding |
|----------|---------|
| Deploy-state backup | `/opt/synqdrive/shared/deploy-state/backend.env.pre-apds-9-4-shadow-enable.20261008T201328Z.bak` has **SHA256 = `778da0aa…`** (byte-identical to S4F-7AJ POST `backend.env`) |
| PM2 process birth | Replica A/B `pm2_env.created_at` ≈ **`2026-10-08T20:13:28Z`** (matches backup timestamp suffix `201328Z`) |
| Key-level delta vs pre-shadow backup | **No key-name additions/removals**; **`WORKER_APD_SHADOW_ENABLED` value changed** (hashes differ; values not logged) |
| S4F-7AJ dry-run | Documented **zero** Production env mutation; drift occurs **after** dry-run window |

**Conclusion:** Drift is **consistent with authorized APDS / P25 adaptive-polling shadow enablement** (parallel workstream), **not** with S4F-7AJ `DRY_RUN=1` or S4F-7Y Tiny staging.

`PRODUCTION_DRIFT_CAUSE=APDS_P25_SHADOW_ENABLE_20261008T201328Z`

`REPLICA_RESTART_CAUSE_VERIFIED=YES_PM2_RECREATE_ALIGNED_WITH_SHADOW_ENABLE_TIMESTAMP`

`CHANGED_ENV_KEY_NAMES_VERIFIED=WORKER_APD_SHADOW_ENABLED_VALUE_ONLY`

---

## 3. Operator identity & live dispatch boundary

| Topic | Finding |
|-------|---------|
| `CERTIFIED_TOOL_SHA` | `ed78748bc9493cdc8da56000e333e4940114f9f1` |
| Release tree @ `3b557e208…` | **Partial** parity — three **bash** operator paths ≠ certified blobs; three **TS** paths **match** (see S4F-7AK) |
| S4F-7AJ execution path | S4F-7AI bootstrap → **detached** checkout of `ed78748bc…` → `di-v0-s4-stage-tiny-fresh-production.sh` with **`DRY_RUN=1` only** |
| `.cursor/scripts/cloud-agent-s4f7ai-fresh-jit-production-dry-run.sh` | **DRY_RUN=1-only**; forbids `DRY_RUN=0` and live auth flags — **must not** be repurposed for live |
| Intended **live** launcher | Same wrapper **`backend/scripts/ops/di-v0-s4-stage-tiny-fresh-production.sh`** on Production, executed from **certified tool checkout** (`ed78748bc…`), with `DRY_RUN=0`, `DI_S4_TINY_STAGING_ACK=YES`, `DI_S4F7Y_LIVE_STAGING_AUTHORIZED=YES`, eight `AUTHORIZED_*` pins, fresh JIT inputs, and `s4f7y_execute_live_transaction` path — **not implemented as a separate cloud-agent live bootstrap in-repo** |
| `LIVE_DISPATCH_PATH_READY` | **YES** (engineering fail-closed shell exists) — **not** production-live-certified; requires human authorization + fresh pins + freeze coordination |
| `CERTIFIED_LIVE_DISPATCH_READY` | **NO** (no successful Production `DRY_RUN=0`; AF.1C consumed; S4F-7AJ JIT expired) |

`DRY_RUN_ONLY_BOOTSTRAP_NOT_USED_FOR_LIVE=YES`

---

## 4. Readiness boundary (unchanged from S4F-7AK)

| Gate | Value |
|------|--------|
| `ENGINEERING_READY` | **YES** |
| `PRODUCTION_PRESTATE_READY` | **YES** |
| `PRODUCTION_DRIFT_EXPLAINED` | **YES** |
| `DEPLOYMENT_FREEZE_CONFIRMED` | **NO** (`HUMAN_FREEZE_CONFIRMATION=PENDING`) |
| `EXPLICIT_HUMAN_LIVE_AUTHORIZATION_PRESENT` | **NO** |
| `LIVE_EXECUTION_AUTHORIZED` | **NO** |
| `GATE_6` | **NOT_SATISFIED** |

---

## Machine block

```
EXP021_S4F7AK1_FINAL_AUTHORITY_BOUNDARY_RESULT=COMPLETE

PR_NUMBER=1939
FRONTEND_CHANGE_JUSTIFIED=NO
FRONTEND_CHANGE_REMOVED=YES

PRODUCTION_SHA=3b557e208c1a06e91c0a13fb8ba861b1255ee375
PRODUCTION_RELEASE_ID=20261008182454_v4994
CURRENT_ENV_SHA256=03179b0cc59f933e2db5dcc42710edce8c08ac2e91cdcafa70c376064e14e6c8
PRODUCTION_DRIFT_CAUSE=APDS_P25_SHADOW_ENABLE_20261008T201328Z
CHANGED_ENV_KEY_NAMES_VERIFIED=WORKER_APD_SHADOW_ENABLED_VALUE_ONLY
REPLICA_RESTART_CAUSE_VERIFIED=YES_PM2_RECREATE_ALIGNED_WITH_SHADOW_ENABLE_TIMESTAMP

CERTIFIED_TOOL_SHA=ed78748bc9493cdc8da56000e333e4940114f9f1
RELEASE_TREE_OPERATOR_PARITY=PARTIAL_THREE_BASH_MISMATCH
CERTIFIED_LIVE_DISPATCH_PATH=di-v0-s4-stage-tiny-fresh-production.sh@ed78748bc_DETACHED_CHECKOUT_DRY_RUN0_WITH_S4F7Y_AUTH_PACKET
LIVE_DISPATCH_PATH_READY=YES_ENGINEERING_NOT_PRODUCTION_LIVE_CERTIFIED
DRY_RUN_ONLY_BOOTSTRAP_NOT_USED_FOR_LIVE=YES

PRODUCTION_DRIFT_EXPLAINED=YES
DEPLOYMENT_FREEZE_CONFIRMED=NO
HUMAN_LIVE_AUTHORIZATION_PRESENT=NO
LIVE_EXECUTION_AUTHORIZED=NO

PRODUCTION_MUTATION_OCCURRED=NO_IN_THIS_SLICE
DRY_RUN0_EXECUTED=NO
S4_TINY_ACTIVATED=NO
GATE_6=NOT_SATISFIED

FINAL_RESULT=PASS
```
