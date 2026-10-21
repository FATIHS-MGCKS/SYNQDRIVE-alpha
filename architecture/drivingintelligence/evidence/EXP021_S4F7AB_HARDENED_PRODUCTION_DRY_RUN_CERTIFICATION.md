# EXP-021 S4F-7AB — Hardened AA.1 bootstrap Production dry-run certification

**Date (UTC):** 2026-10-08  
**Scope:** First Production execution of **S4F-7AA.1** hardened bootstrap (`DRY_RUN=1` only). **Not** live staging authorization. **Not** S4 activation.

**Transcript (sanitized):** agent artifact `s4f7ab-production-dry-run.log` (not committed).

## Git / bootstrap authority

| Field | Value |
|-------|--------|
| `PR1923_MERGE_SHA` | `9e40c969d5846ecab80f5cf63fc885af8c0f3262` |
| `CURRENT_MAIN_SHA` (post-merge, fetch) | `9e40c969d5846ecab80f5cf63fc885af8c0f3262` |
| `PR1923_MERGE_REACHABLE` | **YES** (`9e40c969d` ancestor of `origin/main`) |
| Bootstrap path | `.cursor/scripts/cloud-agent-s4f7aa-fresh-jit-production-dry-run.sh` |
| `BOOTSTRAP_SHA256` (on `9e40c969d`) | `007eb88581d26cc52447ea96635a1f707931f0f102a21cd395fd843f743b8351` |
| `BOOTSTRAP_AUTHORITY_MATCH` | **YES** (log `BOOTSTRAP_SCRIPT_SHA256` equals blob on merge commit; **not** historical `99fa1ee34` bootstrap) |
| `SEALED_TOOL_SHA` | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` (Z2 evidence) |
| `TOOL_PIN_GUARD` | **PASS** (`TOOL_SHA_PIN=PASS`, checkout @ sealed SHA) |
| Pre-run tests | `cloud-agent-s4f7aa-tool-pin.test.sh` **PASS**; `bash -n` bootstrap **PASS** |

## Production PRESTATE (fresh observation)

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `54fc704fb50c285c68470d8fa274d72a67438482` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261008001031_v4994` |
| `PRE_BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| `PRE_REPLICA_A_PID` / `PRE_REPLICA_B_PID` | `1872240` / `1872498` |
| Attestation A/B | **PRESTATE**, fingerprint `b648908a…`, contract **v1** |
| `GLOBAL_KILL_STATE` | **KILLED** |
| S4 pipeline / work items | **0** / **0** |
| Six S4 flags | **OFF** |
| Tiny staging keys | **ALL_MISSING** |
| `NO_BACKFILL_GATE` | **PASS** (future **0**, eligible **0**; latest trip end `2026-10-08T09:05:22.866Z`) |

No reuse of S4F-7AA JIT (`2026-10-08T09:00:32.909Z` / `c39fb3af…`).

## Fresh JIT (this run only)

| Field | Value |
|-------|--------|
| `JIT_FRESH_NOT_BEFORE` | `2026-10-08T10:01:53.161Z` |
| `JIT_EXPECTED_FINGERPRINT` | `fbac21054688e1b959f0460bc35588bd48d617637f78517f00420ecb40ffdd82` |
| `FINGERPRINT_MATCH` | **YES** |
| `DB_CLOCK_CANONICAL_UTC` (validate-fresh-authority) | `2026-10-08T10:02:10.819Z` |
| `JIT_AGE_SECONDS` (guards) | **17.658** (≤ 900) |
| `DI_S4F7Y_LIVE_STAGING_AUTHORIZED` | **unset** |

## Hardened `DRY_RUN=1` result

| Field | Value |
|-------|--------|
| `DRY_RUN` | **1** |
| `GUARDS_OK` | **YES** |
| `DRY_RUN_FULL_GUARD_PATH_EXECUTED` | **YES** |
| `DRY_RUN_WRAPPER_EXIT_CODE` | **0** |
| `REMOTE_SSH_EXIT_CODE` | **0** |
| `ENV_MUTATION_COUNT` | **0** (wrapper + bootstrap grep) |
| `RESTART_COUNT` | **0** (wrapper + bootstrap grep) |
| `INTENDED_ENV_CHANGED_KEY_COUNT` | **3** |
| `INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT` | **0** |

## POSTSTATE (AA.1 extended checks)

| Check | PRE | POST | Result |
|-------|-----|------|--------|
| Production SHA | `54fc704f…` | `54fc704f…` | **unchanged** |
| Release ID | `20261008001031_v4994` | same | **unchanged** |
| `backend.env` SHA256 | `9aae449e…` | `9aae449e…` | **unchanged** |
| Replica A/B PID | `1872240` / `1872498` | same | **parity** |
| Attestation fingerprints | `b648908a…` | same | **parity** |
| `GLOBAL_KILL_STATE` | KILLED | KILLED | **unchanged** |
| S4 pipeline rows | 0 | 0 | **unchanged** |
| S4 work item rows | 0 | 0 | **unchanged** |
| S4 enable flags | OFF | OFF (`POST_ALL_S4_FLAGS_OFF=YES`) | **unchanged** |
| Tiny staging keys | missing | missing (no POST key scan line; PRE gate + env SHA parity) | **unchanged** |

## Evidence classification (proof boundaries)

| Claim | Class |
|-------|--------|
| Bootstrap SHA256 on merge commit | **INDEPENDENTLY VERIFIED** (git blob hash vs log) |
| Sealed tool checkout SHA | **VERIFIED_BY_EXECUTION_PATH** |
| Stale pin rejection / `TOOL_PIN_GUARD` | **VERIFIED_BY_EXECUTION_PATH** (AA.1 lib + log) |
| PRE/POST SHA, env hash, PIDs, attestation | **VERIFIED_BY_EXECUTION_PATH** |
| `GLOBAL_KILL` / S4 row PRE=POST | **VERIFIED_BY_EXECUTION_PATH** (SQL re-read POST) |
| `ENV_MUTATION_COUNT=0` / `RESTART_COUNT=0` | **VERIFIED_BY_EXECUTION_PATH** (wrapper log grep) |
| `PROVIDER_CALL_DELTA_MEASURED=0` | **VERIFIED_BY_EXECUTION_PATH** (wrapper contract line; **not** independent network capture) |
| `PRODUCTION_DB_WRITE_OCCURRED=NO` | **VERIFIED_BY_EXECUTION_PATH** with **limited** scope (S4 table counts + zero wrapper DB mutation flags; **not** full DB audit) |
| `PROVIDER_CALL_COUNT=0` (terminal line) | **DECLARED_ONLY** (bootstrap echo; delta measured separately above) |
| Temp artifact cleanup | **NOT_VERIFIED** in transcript (EXIT trap; no post-listing) |

## Gate 6

`NOT_SATISFIED` — technical dry-run certification only.

## Machine block

```
EXP021_S4F7AB_HARDENED_PRODUCTION_DRY_RUN_RESULT=PASS
FINAL_RESULT=PASS
GATE_6=NOT_SATISFIED
S4_ACTIVATION_OCCURRED=NO
EVIDENCE_COMPLETE=YES
```
