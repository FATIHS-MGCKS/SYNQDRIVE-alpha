# EXP-021 S4F-7D — Exact-SHA dormant Production deploy result

**Execution date:** 2026-10-02 (UTC)  
**Human authorization:** Dormant code deploy only to **`ee9588548845c8077aa0cba0684b06eac7c9d4d2`** (not `main` `b7d77643…`).  
**Prior gates:** [S4F-7B](EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT.md), [S4F-7C](EXP021_S4F7C_EXACT_SHA_DORMANT_DEPLOY_AUTHORIZATION_GATE.md) (read-only authorization gate; human deploy authorized separately in this S4F-7D task).

## Deploy command (executed)

```bash
CLOUD_AGENT_REQUESTED_DEPLOY_SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2 \
CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1 \
bash .cursor/scripts/cloud-agent-deploy.sh
```

Canonical script: `backend/scripts/ops/vps-deploy-release.sh` bootstrapped at target SHA.

## Pre-execution guard (PASS)

Production unchanged vs S4F-7C: SHA `8fa531b27…`, release `20261001035130_v4994`, env hash match, S4 flags absent, GLOBAL row missing, all S4 counts 0, migrations clean.

## Deploy lifecycle

| Step | Result |
|------|--------|
| Pre-deploy DB backup | **YES** → `/opt/synqdrive/shared/backups/db-pre-deploy-20261002014651.sql.gz` |
| Release ID | `20261002014651_v4994` |
| Release source SHA verified | `ee9588548845…` |
| Prisma generate | **OK** |
| Prisma migrate deploy | **No pending migrations to apply** (0 applied) |
| Backend build | **OK** |
| Frontend build | **OK** |
| Boot check | **OK** (`DiV0S4RuntimeModule dependencies initialized`) |
| Rolling deploy | **OK** (replicas `4010324` / `4010550`) |
| Scheduler convergence | **PASS** (transient `leaders=0` → stable `leaders=1`) |
| Nginx / external health | **OK** |
| Rollback | **NO** |

Full log: `/opt/cursor/artifacts/s4f7d-deploy.log` (cloud agent workspace).

## Post-deploy acceptance

| Check | Value |
|-------|--------|
| `POST_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `NO_MIXED_SHA` | **YES** |
| Replica health | **OK** / **OK** |
| Scheduler single leader | **YES** |
| Nginx dual upstream | **YES** |
| `POST_BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` (**unchanged**) |
| S4 enable flags | all **OFF** (keys absent) |
| Allowlists / NOT_BEFORE | **none** / **MISSING** |
| `S4_RUNTIME_CODE_PRESENT` | **YES** (`s4-runtime/` on release) |
| `S4_RUNTIME_REGISTERED` | **YES** (boot graph: S4B, S4E, S4F, `DiV0S4RuntimeModule`) |
| `S4_RUNTIME_EFFECTIVELY_DORMANT` | **YES** |
| Timer dormancy | **INDIRECT**: ALL_OFF env + zero S4 DB/provider deltas (no direct timer introspection API) |
| `POST_GLOBAL_CONTROL_ROW_STATE` | **MISSING** → `KILLED_FAIL_CLOSED` |
| S4 persistence deltas | **all 0** |
| `DB_KILL_INITIALIZER_EXECUTED` | **NO** |
| Tiny gate 6 | **NOT_SATISFIED** (5/6) |

## Prohibitions observed

No env mutation, no S4 flags, no allowlists, no NOT_BEFORE, no kill initializer, no operator grant, no Tiny/shadow activation.

## Decision

**`DEPLOY_RESULT=SUCCESS`** · **`FINAL_RESULT=PASS`**

S4F-7A runtime is live in Production but remains fail-closed and dormant. **Does not** authorize DB kill initialization or Tiny activation.

**`NEXT_ACTION`:** `REVIEW_AND_MERGE_S4F7D_EVIDENCE_THEN_PREPARE_SEPARATE_DB_KILL_INITIALIZATION_AND_TINY_ACTIVATION_AUTHORIZATION`
