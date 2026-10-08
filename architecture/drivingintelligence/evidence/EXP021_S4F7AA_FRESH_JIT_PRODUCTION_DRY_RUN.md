# EXP-021 S4F-7AA — Fresh JIT + sealed S4F-7Y tool Production dry-run

**Date (UTC):** 2026-10-08  
**Scope:** Read-only Production observation + `DRY_RUN=1` on `di-v0-s4-stage-tiny-fresh-production.sh` @ sealed tool SHA. **No** env mutation, restart, DB write, deploy, migration, provider calls, live staging authorization, or S4 activation.

**Execution transcript (sanitized):** agent artifact `s4f7aa-production-dry-run.log` (not committed; no secrets).

## Git / tool authority

| Field | Value |
|-------|--------|
| `CURRENT_MAIN_SHA` (dispatch) | `a29585f25d18f9bc73bff3be21da7fba4f03bdc3` (S4F-7Z.2 merge **#1922**) |
| `SEALED_TOOL_SHA` | `715dea5648ebb862eeedfc30e7dc3d3cd57bb02c` (from [EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md](EXP021_S4F7Z2_EXACT_HEAD_CI_TOOL_AUTHORITY_SEAL.md), read independently) |
| `TOOL_SHA_VERIFIED` | **YES** (temp checkout + `TOOL_SHA_PIN=PASS`) |
| `DI_S4F7Y_LIVE_STAGING_AUTHORIZED` | **unset** (not granted) |
| Bootstrap | `.cursor/scripts/cloud-agent-s4f7aa-fresh-jit-production-dry-run.sh` |

Legacy S4F-7W pin `11b4a80cc…` was **not** used. Stale `TOOL_AUTHORITY_SHA` / `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` shell env is cleared at dispatch.

## Production baseline (pre dry-run)

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `54fc704fb50c285c68470d8fa274d72a67438482` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261008001031_v4994` |
| `PRE_BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| `PRE_REPLICA_A_PID` / `PRE_REPLICA_B_PID` | `1872240` / `1872498` |
| Replica health / readiness | **OK** / **OK** |
| Attestation A/B | **PRESTATE** / fingerprint `b648908a…` / contract **v1** |
| `NGINX_DUAL_UPSTREAM` | **YES** |
| `SCHEDULER_LEADER_COUNT` | **1** |
| `GLOBAL_KILL_STATE` | **KILLED** |
| S4 persistence | **0** rows (pipeline + work items) |
| Six S4 enable flags | **OFF** |
| `TINY_STAGING_KEYS_PRESTATE` | **ALL_MISSING** |
| Tiny vehicle | **ACTIVE**, org `faa710c9-6d91-4079-a7d5-91fdccdec14a`, vehicle `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `LATEST_COMPLETED_TRIP_END_TIME` | `2026-10-08T08:59:47.090Z` |
| Global DIMO budget (runtime) | **ENABLED** both replicas |
| Redis | **REACHABLE** |

## JIT fresh authority (this run only)

| Field | Value |
|-------|--------|
| `JIT_FRESH_NOT_BEFORE` | `2026-10-08T09:00:32.909Z` |
| `JIT_EXPECTED_FINGERPRINT` | `c39fb3afa776a79d2afba2d65f02db91059d0d2d54f1d369717dcae380007ffe` |
| `FINGERPRINT_MATCH` | **YES** (dual `derive-fingerprint`) |
| `DB_CLOCK_CANONICAL_UTC` (at `validate-fresh-authority`) | `2026-10-08T09:00:53.205Z` |
| `JIT_AGE_SECONDS` (at guards) | **20.296** (≤ 900) |
| `NO_BACKFILL_GATE` | **PASS** (future trips **0**, eligible **0**) |

**Do not reuse** after expiry or for `DRY_RUN=0` / live staging without a new JIT packet and separate human authorization.

## Production `DRY_RUN=1` result

| Field | Value |
|-------|--------|
| `DRY_RUN_EXECUTED` | **YES** |
| `DRY_RUN_WRAPPER_EXIT_CODE` | **0** |
| `GUARDS_OK` | **YES** |
| `DRY_RUN_FULL_GUARD_PATH_EXECUTED` | **YES** |
| `DRY_RUN_ENV_MUTATION_COUNT` | **0** |
| `DRY_RUN_RESTART_COUNT` | **0** |
| `INTENDED_ENV_CHANGED_KEY_COUNT` | **3** |
| `INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT` | **0** |

Intended three-key delta (simulation on temp copy only):

```
DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-08T09:00:32.909Z
DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a
DI_V0_S4_VEHICLE_ALLOWLIST=c10351f8-b6a2-4258-947f-631aeaa6d359
```

## Post dry-run forensics

| Field | Value |
|-------|--------|
| `POST_PRODUCTION_SHA` | `54fc704fb50c285c68470d8fa274d72a67438482` (unchanged) |
| `POST_PRODUCTION_RELEASE_ID` | `20261008001031_v4994` |
| `POST_BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| `REPLICA_A_PRE_POST_PARITY` | **YES** |
| `REPLICA_B_PRE_POST_PARITY` | **YES** |
| `ATTESTATION_PARITY` | **YES** (PRESTATE fingerprints unchanged) |
| `PRODUCTION_ENV_MUTATION_OCCURRED` | **NO** |
| `PRODUCTION_RESTART_OCCURRED` | **NO** |
| `PRODUCTION_DB_WRITE_OCCURRED` | **NO** |
| `PROVIDER_CALL_COUNT` | **0** |
| `S4_ACTIVATION_OCCURRED` | **NO** |

## Gate 6

`EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED` — successful dry-run is **not** live-staging authorization.

## Machine block

```
EXP021_S4F7AA_FRESH_JIT_PRODUCTION_DRY_RUN_RESULT=PASS
FINAL_RESULT=PASS
GATE_6=NOT_SATISFIED
EVIDENCE_COMPLETE=YES
```
