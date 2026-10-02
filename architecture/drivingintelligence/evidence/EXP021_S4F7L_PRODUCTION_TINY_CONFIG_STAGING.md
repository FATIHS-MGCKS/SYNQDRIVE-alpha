# EXP-021 S4F-7L — Production Tiny 3-key config staging (attempt + recovery)

**Date (UTC):** 2026-10-02  
**Scope:** Human-authorized **single** Production staging attempt (`DRY_RUN=0`) via `cloud-agent-s4-tiny-staging.sh` @ tool SHA `947a70540da6d227616fdf26c7e628d274d50c4a`. **No** Tiny activation, **no** GLOBAL DB change, **no** deploy/migration.

## Outcome

| Field | Value |
|-------|--------|
| `FINAL_RESULT` | **FAIL** (staging not completed) |
| `RECOVERY_OCCURRED` | YES |
| `RECOVERY_RESULT` | COMPLETE (`ROLLBACK_RESULT=COMPLETE`, `ROLLBACK_POST_VERIFY=PASS`) |
| `PRODUCTION_TINY_CONFIG_STAGING_READINESS` | **FAIL** |
| Post-recovery `backend.env` SHA256 | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` (matches pre-pin) |
| Target staging keys post-recovery | **MISSING** (all three) |
| `GLOBAL_KILL_STATE` post-recovery | KILLED |

**Authorization consumed:** one mutation attempt occurred; **no** automatic retry under the same grant.

## Execution anchors

| Field | Value |
|-------|--------|
| `EXECUTION_TOOL_SHA` | `947a70540da6d227616fdf26c7e628d274d50c4a` |
| `CURRENT_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261002014651_v4994` |
| `HUMAN_THREE_KEY_STAGING_AUTHORIZATION` | GRANTED (config + rolling restart only) |

**Log:** `/opt/cursor/artifacts/s4f7l-production-staging.log`

## Pre-mutation guards (PASS)

All pre-mutation gates in the wrapper reported `GUARDS_OK=YES` / `GUARD_FAILURES=NONE`, including topology, budget/Redis, GLOBAL KILLED, S4 zero-state, Tiny vehicle DB proof, and pre-env SHA256 pin.

## Mutation phase (PASS, file-level)

| Check | Result |
|-------|--------|
| `BACKUP_CREATED_BEFORE_MUTATION` | YES |
| `BACKUP_CHECKSUM_VERIFIED` | YES |
| `RECOVERY_ARMED_BEFORE_MUTATION` | YES |
| `ENV_CHANGED_KEY_COUNT` | 3 |
| `UNEXPECTED_ENV_CHANGED_KEY_COUNT` | 0 |
| `POST_WRITE_SEMANTIC_DIFF_INDEPENDENTLY_VERIFIED` | YES |
| Transient `BACKEND_ENV_SHA256_AFTER` | `6be0697dc7166b2b86bfa66bf22fdc11c98d252a4d25349c0a24a13a93f53534` |

Frozen values written to `backend.env` (before rollback):

- `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-02T05:55:28.839Z`
- `DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a`
- `DI_V0_S4_VEHICLE_ALLOWLIST=c10351f8-b6a2-4258-947f-631aeaa6d359`

## Failure: Replica A PRIMARY_STAGING runtime proof

After rolling restart **Replica A** (`synqdrive`), filtered `/proc` environ proof reported:

| Check | Result |
|-------|--------|
| `REPLICA_A_RUNTIME_NOT_BEFORE_EXACT` | **NO** |
| `REPLICA_A_RUNTIME_ORG_ALLOWLIST_EXACT` | **NO** |
| `REPLICA_A_RUNTIME_VEHICLE_ALLOWLIST_EXACT` | **NO** |
| `REPLICA_A_ALL_S4_ENABLE_FLAGS_OFF` | YES |

Wrapper entered `TX_STATE=RECOVERY_IN_PROGRESS`, restored exact pre-mutation `backend.env` bytes, and restarted **A → B** into prestate. **Replica B staging restart was not attempted** for the forward path.

**Hypothesis (engineering, not re-validated in this task):** PM2/Nest process environ may not surface the three new `DI_V0_S4_*` keys via `/proc/<pid>/environ` immediately after `pm2 restart --update-env`, while file-level config audit passed. Requires separate engineering slice — **not** authorized to hotfix and re-run Production in S4F-7L.

## Recovery verification (PASS)

| Check | Result |
|-------|--------|
| `BACKEND_ENV_SHA256_AFTER_RECOVERY` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `ROLLBACK_PRESTATE_TARGET_KEYS_VERIFIED` | YES |
| `ROLLBACK_GLOBAL_KILLED_DB_VERIFIED` | YES |
| `ROLLBACK_S4_ZERO_STATE_VERIFIED` | YES |
| `ROLLBACK_GLOBAL_BUDGET_VERIFIED` | YES |
| `ROLLBACK_REDIS_VERIFIED` | YES |
| Replica identities post-rollback | YES / YES |

## Non-effects (final Production state)

| Check | Result |
|-------|--------|
| `PRODUCTION_DB_WRITE_OCCURRED` | NO |
| `DEPLOY_OCCURRED` | NO |
| `MIGRATION_EXECUTED` | NO |
| `PROVIDER_PRODUCTION_CALL_COUNT` | 0 |
| `SHADOW_ACTIVATION_OCCURRED` | NO |
| `TINY_ACTIVATION_READY` | NO (5/6 gates) |
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | NOT_SATISFIED |

## Next action

New human authorization required after engineering fixes runtime proof vs PM2 env visibility (or alternate live confirmation path). **Do not** retry S4F-7L under the consumed grant.
