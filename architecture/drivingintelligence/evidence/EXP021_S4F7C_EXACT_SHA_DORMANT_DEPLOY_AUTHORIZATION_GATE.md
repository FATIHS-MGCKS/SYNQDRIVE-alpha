# EXP-021 S4F-7C — Exact-SHA dormant Production deploy authorization gate (read-only)

**Audit date:** 2026-10-02 (UTC)  
**Frozen deploy target:** `ee9588548845c8077aa0cba0684b06eac7c9d4d2` (merged PR #1873 — S4F-7A)  
**Current `origin/main`:** `b7d77643c8727fbf6601df459c4d1da836adaedf` (includes docs-only PR #1877 — **not** a deploy substitute)  
**Prior preflight:** [EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md](EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md) (`DORMANT_DEPLOY_READINESS=PASS`)

**Scope:** Read-only re-validation + operator deployment packet. **No deploy, no Production mutation.**

---

## 1 — Frozen deployment target

| Check | Result |
|-------|--------|
| Target commit exists | **YES** |
| Target ancestor of current main | **YES** (1 commit on main after target: #1877 docs/ops only) |
| `CURRENT_MAIN_EQUALS_TARGET` | **NO** |
| PR #1877 required for dormant S4 runtime at target | **NO** (evidence + `di-v0-s4f7b-*.sh` helper only) |
| `DEPLOY_MUST_USE_EXACT_SHA` | **YES** — never substitute `b7d77643…` or floating `main` |

---

## 2 — Production identity (immediate re-check)

VPS: `synqdrive-admin@srv1374778.hstgr.cloud` (read-only).

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `8fa531b275bc4dca02c09b279c0d2b806e544007` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261001035130_v4994` |
| `PRODUCTION_SHA_UNCHANGED_SINCE_S4F7B` | **YES** |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | `8fa531b275bc4dca02c09b279c0d2b806e544007` |
| `NO_MIXED_SHA` | **YES** |
| `REPLICA_A_HEALTH` / `REPLICA_B_HEALTH` | **OK** (`:3001` / `:3002`) |
| `SCHEDULER_SINGLE_LEADER` | **YES** |
| `NGINX_DUAL_UPSTREAM` | **YES** |
| `RESTART_LOOP_DETECTED` | **NO** |
| PM2 `synqdrive` / `synqdrive-b` PID | `3763015` / `3763016` |
| PM2 uptime (approx.) | `65519` s each |

---

## 3 — Env safety (SHA-256 only)

| Field | Value |
|-------|--------|
| `PRE_BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `BACKEND_ENV_MATCHES_S4F7B_SNAPSHOT` | **YES** |
| `DIMO_GLOBAL_BUDGET_CONFIG_STATE` | **EXPLICIT_ENABLED** (key present) |
| `GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE` | **CONFIRMED_ENABLED** (explicit env + Redis `PONG`) |
| `REDIS_REACHABLE` | **YES** |
| S4 enable keys | **MISSING** → effective **OFF** |
| Org / vehicle allowlists | **MISSING** |
| `PRODUCTION_NOT_BEFORE_STATE` | **MISSING** |
| `ALL_S4_ENABLE_FLAGS_FALSE` | **YES** |
| `ORG_ALLOWLIST_EFFECTIVE_NONE` | **YES** |
| `VEHICLE_ALLOWLIST_EFFECTIVE_NONE` | **YES** |

---

## 4 — S4 DB zero-state

| Field | Value |
|-------|--------|
| `PRE_GLOBAL_CONTROL_ROW_STATE` | **MISSING** |
| `PRE_EFFECTIVE_KILL_STATE` | **KILLED_FAIL_CLOSED** |
| `PRE_S4_PIPELINE_REGISTRY_ROWS` | **0** |
| `PRE_S4_WORK_ITEM_ROWS` | **0** |
| `PRE_S4_ACTIVE_WORK_ITEM_ROWS` | **0** |
| `PRE_S4_EVIDENCE_SNAPSHOT_ROWS` | **0** |
| `PRE_S4_SHADOW_RUN_ROWS` | **0** (`execution_identity` `DI_V0_S4%`) |
| `PRE_S4_SHADOW_INTERVAL_ROWS` | **0** |

---

## 5 — Migration authority (`8fa531b27…` → `ee958854…`)

| Field | Value |
|-------|--------|
| `TARGET_NEW_MIGRATION_COUNT` | **0** |
| `PRODUCTION_PENDING_TARGET_MIGRATION_COUNT` | **0** (all target migration folders already applied on Production) |
| `ACTIVE_FAILED_OR_PARTIAL_MIGRATION_COUNT` | **0** |

Canonical deploy may still invoke `prisma migrate deploy`; no pending migrations expected for this target.

---

## 6 — Authorized deploy command (do not run from this task)

**Mechanism:** DEC-016 exact-SHA bootstrap — fetch deploy script from requested commit, verify `HEAD`, set `SYNQDRIVE_REQUESTED_DEPLOY_SHA`, run `vps-deploy-release.sh` ([`cloud-agent-deploy.sh`](../../../.cursor/scripts/cloud-agent-deploy.sh) pattern).

### Option A — Cursor Cloud Agent (recommended)

```bash
CLOUD_AGENT_REQUESTED_DEPLOY_SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2 \
CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
bash .cursor/scripts/cloud-agent-deploy.sh
```

Requires: SSH to VPS, **explicit human authorization** for this SHA. Does **not** deploy `b7d77643…` unless that SHA is explicitly set.

### Option B — On VPS as deploy executor (sudo)

```bash
sudo -H bash -c 'set -euo pipefail; SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2; TMP=$(mktemp -d); trap "rm -rf \"$TMP\"" EXIT; git init -q "$TMP"; git -C "$TMP" remote add origin https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha.git; git -C "$TMP" fetch --depth 1 origin "$SHA"; git -C "$TMP" checkout -q FETCH_HEAD; test "$(git -C "$TMP" rev-parse HEAD)" = "$SHA"; SYNQDRIVE_REQUESTED_DEPLOY_SHA="$SHA" bash "$TMP/backend/scripts/ops/vps-deploy-release.sh"'
```

`CANONICAL_DEPLOY_SCRIPT` = `backend/scripts/ops/vps-deploy-release.sh` @ bootstrapped target tree.

---

## 7 — Pre-deploy snapshot (frozen for post-deploy diff)

```
PRE_PRODUCTION_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007
PRE_RELEASE_ID=20261001035130_v4994
PRE_REPLICA_A_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007
PRE_REPLICA_B_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007
PRE_REPLICA_A_PID=3763015
PRE_REPLICA_B_PID=3763016
PRE_REPLICA_A_UPTIME_SEC=65519
PRE_REPLICA_B_UPTIME_SEC=65519
PRE_BACKEND_ENV_SHA256=6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7
PRE_S4_PIPELINE_REGISTRY_ROWS=0
PRE_S4_WORK_ITEM_ROWS=0
PRE_S4_ACTIVE_WORK_ITEM_ROWS=0
PRE_S4_EVIDENCE_SNAPSHOT_ROWS=0
PRE_S4_SHADOW_RUN_ROWS=0
PRE_S4_SHADOW_INTERVAL_ROWS=0
PRE_GLOBAL_CONTROL_ROW_STATE=MISSING
PRE_EFFECTIVE_KILL_STATE=KILLED_FAIL_CLOSED
```

Repeatable read-only capture: `backend/scripts/ops/di-v0-s4f7c-exact-sha-deploy-authorization-gate.sh`

---

## 8 — Post-deploy acceptance criteria (future execution)

Mandatory before declaring deploy success (no S4 activation, no env change, no kill init):

- `POST_PRODUCTION_SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2`; replicas match; `NO_MIXED_SHA=YES`
- Health OK; `SCHEDULER_SINGLE_LEADER=YES`; `NGINX_DUAL_UPSTREAM=YES`; `RESTART_LOOP_DETECTED=NO`
- `BACKEND_ENV_SHA256_UNCHANGED=YES` vs pre snapshot above
- All S4 flags false/absent; allowlists none; NOT_BEFORE missing/empty
- `S4_RUNTIME_CODE_PRESENT=YES` (`s4-runtime/` on release); registered but dormant
- Timer indirect proof: no work-item/snapshot/shadow deltas; no provider-call delta
- `GLOBAL_BUDGET_GATE=SATISFIED`; `GLOBAL_KILL_EFFECTIVE=KILLED` (missing or KILLED row)
- `EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED`; `TINY_ACTIVATION_READY=NO`

Full checklist aligned with S4F-7B Step 12.

---

## 9 — Rollback triggers (future execution)

Immediate rollback if: SHA mismatch, persistent mixed SHA, Nest bootstrap/provider failure, replica health failure, scheduler/nginx convergence failure, restart loop, unexpected env hash change, any S4 flag truthy or allowlist populated, S4 timers active, any S4 provider call or persistence growth, global budget disabled/unverified, `NOT_KILLED` global kill, unexpected VO/Battery/RFRF automatic runtime.

---

## 10 — Authorization state

| Field | Value |
|-------|--------|
| `HUMAN_DORMANT_DEPLOY_AUTHORIZATION` | **NOT_GRANTED_IN_THIS_TASK** |
| `DEPLOY_EXECUTION_PERMITTED` | **NO** |
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | **NOT_SATISFIED** (5/6 Tiny gates) |

---

## Decision

**`EXP021_S4F7C_EXACT_SHA_DORMANT_DEPLOY_AUTHORIZATION_GATE_RESULT=PASS`**

No state drift since S4F-7B invalidates dormant deploy approval. Human must explicitly authorize execution of **exact SHA** `ee9588548845c8077aa0cba0684b06eac7c9d4d2`.
