# EXP-021 S4F-7H — Authorized Production GLOBAL=KILLED initialization

**Date (UTC):** 2026-10-02  
**Human authorization:** `HUMAN_GLOBAL_KILLED_INITIALIZATION_AUTHORIZATION=GRANTED` (GLOBAL `MISSING` → `KILLED` only).

## Frozen authorities

| Field | Value |
|-------|--------|
| Repository `main` | `484c4260f6cc11c134085ece37be3a7670836b2c` |
| Wrapper / tool SHA | `0b0eac19d162dc81cbd724d0bf1d0480003edf10` |
| Production runtime SHA | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| Production release | `20261002014651_v4994` |
| `backend.env` SHA256 | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| Operator actor | `FATIHS-MGCKS` |
| Operator reason | `EXP021_S4F7H_AUTHORIZED_GLOBAL_KILLED_INITIALIZATION` |

## Pre-mutation (independent read)

| Check | Result |
|-------|--------|
| `PRE_GLOBAL_ROW_COUNT` | 0 |
| `PRE_GLOBAL_CONTROL_ROW_STATE` | MISSING |
| S4 persistence | all 0 |
| `REPLICA_A_PID_PRE` | 4010324 |
| `REPLICA_B_PID_PRE` | 4010550 |

## Execution

- Remote temp checkout @ tool SHA: `REMOTE_TOOL_SHA_VERIFIED=YES`, `TEMP_CHECKOUT_ONLY=YES`, `PRODUCTION_RELEASE_MODIFIED=NO`
- Wrapper `DRY_RUN=0` invoked deployed-release initializer once (`INITIALIZER_INVOKED=YES`)
- Result: **`DI_V0_S4_GLOBAL_KILL_INIT_RESULT=INSERTED_KILLED`**
- Wrapper: `GUARDS_OK=YES`, `POST_WRITE_VERIFY=PASS`, `PRODUCTION_DB_WRITE_OCCURRED=YES`
- S4 deltas: all 0; `BACKEND_ENV_SHA256_UNCHANGED=YES`; `PRODUCTION_RESTART_OCCURRED=NO`

Operational note (same as S4F-7G): Hostinger path A requires `SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env` and `sudo -n` wrapper exec for root-only env file.

## Post-mutation (independent read)

| Field | Value |
|-------|--------|
| `POST_GLOBAL_ROW_COUNT` | 1 |
| `POST_GLOBAL_ROW_ID` | GLOBAL |
| `POST_GLOBAL_KILL_STATE` | KILLED |
| `POST_GLOBAL_REASON` | `EXP021_S4F7H_AUTHORIZED_GLOBAL_KILLED_INITIALIZATION` |
| `POST_GLOBAL_ACTOR` | `FATIHS-MGCKS` |
| `POST_EFFECTIVE_KILL_STATE` | KILLED |
| S4 table counts | all 0 |
| `REPLICA_A_PID_POST` | 4010324 |
| `REPLICA_B_PID_POST` | 4010550 |
| Replica health post | OK / OK |

## Mutation blast radius

| Metric | Value |
|--------|--------|
| `CONTROL_ROW_INSERT_COUNT` | 1 |
| `CONTROL_ROW_UPDATE_COUNT` | 0 |
| `CONTROL_ROW_DELETE_COUNT` | 0 |
| `NON_CONTROL_DB_WRITE_COUNT` | 0 |

## Tiny gate (unchanged)

| Field | Value |
|-------|--------|
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | NOT_SATISFIED |
| `FROZEN_TINY_GATE_SATISFIED_COUNT` | 5 |
| `FROZEN_TINY_GATE_TOTAL` | 6 |
| `TINY_ACTIVATION_READY` | NO |

## Decision

**`PRODUCTION_GLOBAL_KILLED_INITIALIZATION_READINESS=PASS`**

**`NEXT_ACTION`:** `SEAL_EVIDENCE_THEN_PREPARE_NO_BACKFILL_CUTOFF_AND_TINY_ALLOWLIST_STAGING_WITH_GLOBAL_STILL_KILLED`
