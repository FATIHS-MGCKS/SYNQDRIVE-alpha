# EXP-021 S4F-7G — Production GLOBAL kill initializer dry-run

**Date (UTC):** 2026-10-02  
**Task:** Authorized Production read-only / zero-write dry-run only. **Not** GLOBAL row initialization.

## Frozen authorities

| Authority | Value |
|-----------|--------|
| Wrapper / tool SHA | `0b0eac19d162dc81cbd724d0bf1d0480003edf10` (merged #1882) |
| Production runtime SHA | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| Production release ID | `20261002014651_v4994` |
| Expected `backend.env` SHA256 | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| Expected GLOBAL pre-state | `MISSING` |
| Operator ACK scope | `DI_S4_KILL_INIT_ACK=YES` authorizes **guard evaluation under `DRY_RUN=1` only** |

## Repository re-anchor

| Check | Result |
|-------|--------|
| `CURRENT_MAIN_SHA` | `0b0eac19d162dc81cbd724d0bf1d0480003edf10` |
| `WRAPPER_TOOL_SHA_REACHABLE_FROM_MAIN` | YES (`git merge-base --is-ancestor`) |

## Execution path

1. **Canonical bootstrap** (`.cursor/scripts/cloud-agent-s4-global-kill-init.sh` @ tool SHA) was invoked with frozen pins and `DRY_RUN=1`.
   - Without `SYNQDRIVE_BACKEND_ENV` → `FAIL_REASON=BACKEND_ENV_UNREADABLE`.
   - With `SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env` but without root privileges → same (`root:root` mode `600`).
2. **Successful dry-run** used the same remote temp-checkout bootstrap (`REMOTE_TOOL_SHA_VERIFIED=YES`) and executed the wrapper under **`sudo -n`** so `backend.env` could be read for hash/S4/budget guards only. No deploy, no release mutation, no initializer invoke.

Operational follow-up: extend bootstrap to pass `SYNQDRIVE_BACKEND_ENV` and use passwordless sudo for wrapper exec on Hostinger path A.

## Dry-run result (sanitized)

Key lines from Production execution (`BOOTSTRAP_EXIT_CODE=0`):

```
REMOTE_TOOL_SHA_VERIFIED=YES
VERIFIED_RELEASE_DIR=/opt/synqdrive/releases/20261002014651_v4994
ACTUAL_PRODUCTION_SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2
ACTUAL_RELEASE_ID=20261002014651_v4994
BACKEND_ENV_SHA256=6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7
REPLICA_A_HEALTH=OK
REPLICA_B_HEALTH=OK
REPLICA_A_PROCESS_RELEASE_IDENTITY=YES
REPLICA_B_PROCESS_RELEASE_IDENTITY=YES
STEADY_STATE_NO_MIXED_RELEASE_IDENTITY=YES
POST_DEPLOY_UPTIME_HELPER_USED_FOR_STEADY_STATE=NO
METRICS_AUTH_USED=YES
METRICS_SECRET_EXPOSED=NO
REPLICA_A_GLOBAL_BUDGET_RUNTIME=ENABLED
REPLICA_B_GLOBAL_BUDGET_RUNTIME=ENABLED
GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE=CONFIRMED_ENABLED
REDIS_REACHABLE=YES
NOT_BEFORE_CLASSIFICATION=MISSING
OPERATOR_ACK_VALIDATED=YES
GUARDS_OK=YES
GUARD_FAILURES=NONE
ALL_GUARDS_PASSED=YES
MAIN_CHECKOUT_DIFFERS_FROM_PRODUCTION=YES
NEWER_MAIN_INITIALIZER_SUBSTITUTION_POSSIBLE=NO
DRY_RUN=1
INITIALIZER_INVOKED=NO
PRODUCTION_DB_WRITE_OCCURRED=NO
DRY_RUN_ZERO_MUTATION=PASS
PRODUCTION_KILL_INITIALIZER_WRAPPER_PREFLIGHT=PASS
```

Replica uptimes at dry-run: `REPLICA_A_PM2_UPTIME_SEC=12658`, `REPLICA_B_PM2_UPTIME_SEC=12650` (no restart during task).

## Independent post-read (outside wrapper stdout)

SSH + `sudo -n -u postgres psql` at `2026-10-02T05:28:32Z`:

| Field | Value |
|-------|--------|
| `POST_READ_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `POST_READ_BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `POST_DRY_RUN_GLOBAL_ROW_COUNT` | 0 |
| `POST_DRY_RUN_GLOBAL_STATE` | MISSING |
| S4 table counts | all 0 |

## Tiny gate (unchanged)

| Field | Value |
|-------|--------|
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | NOT_SATISFIED |
| `FROZEN_TINY_GATE_SATISFIED_COUNT` | 5 |
| `FROZEN_TINY_GATE_TOTAL` | 6 |
| `TINY_ACTIVATION_READY` | NO |

## Decision

**`PRODUCTION_KILL_INITIALIZER_DRY_RUN_READINESS=PASS`**

**`NEXT_ACTION`:** `AWAIT_SEPARATE_EXPLICIT_HUMAN_AUTHORIZATION_FOR_GLOBAL_KILLED_INITIALIZATION`
