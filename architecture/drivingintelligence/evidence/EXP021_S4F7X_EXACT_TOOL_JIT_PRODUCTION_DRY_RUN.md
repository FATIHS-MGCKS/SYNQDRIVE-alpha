# EXP-021 S4F-7X — Exact tool SHA seal + JIT fresh authority + Production dry-run

**Date (UTC):** 2026-10-07  
**Scope:** Authorized **read-only** Production observation + `DRY_RUN=1` on fresh S4F-7W wrapper only. **No** env mutation, restart, DB write, deploy, migration, provider calls, live staging, or S4 activation.

**Authoritative execution transcript:** `s4f7x-production-dry-run.log` (agent artifact; original run ~`2026-10-07T14:54:57Z`–`14:55:16Z` UTC).

## 0 — Access path recovery (prior attempt correction)

The first S4F-7X agent run incorrectly assumed Tailscale (`mein-vps.internal`), `root@srv1374778.hstgr.cloud`, and explicit `~/.ssh/id_ed25519` as root. Historical Production audits (S4F-7S / S4F-7T / S4F-7U) use **`synqdrive-admin@srv1374778.hstgr.cloud`** with passwordless `sudo -n` for root-only `backend.env` and `postgres` reads.

```
EXP021_S4F7X_PRODUCTION_ACCESS_PATH_RECOVERY_RESULT=PASS
HISTORICAL_PRODUCTION_ACCESS_PATH=synqdrive-admin@srv1374778.hstgr.cloud
```

Operational note: wrapper `DRY_RUN=1` executed under **`sudo -n -E`** (effective `REMOTE_USER=root` for the wrapper process only) so `/opt/synqdrive/shared/backend.env` remains readable for hash/guards. SSH entry path remains `synqdrive-admin`.

Bootstrap: `.cursor/scripts/cloud-agent-s4f7x-fresh-tiny-dry-run.sh` (temp tool checkout @ sealed SHA + release `node_modules` symlink).

## 1 — Tool authority

| Field | Value |
|-------|--------|
| `TOOL_AUTHORITY_SHA` | `11b4a80ccb88d1d6f747399f84667b06c9a71050` |
| `TOOL_AUTHORITY_SOURCE` | Merged **#1911** (S4F-7W) |
| `REMOTE_TOOL_SHA_VERIFIED` | **YES** |
| `TOOL_SHA_PIN` | **PASS** |

## 2 — Production baseline (original dry-run observation)

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `3c12875dc464ac9a0693957c794c935d101dd43f` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261007115738_v4994` |
| `BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| `REPLICA_A_PM2_UPTIME_SEC` / `REPLICA_B_PM2_UPTIME_SEC` | `926` / `926` (during preflight; log) |
| Health / readiness A & B | **OK** |
| `NGINX_DUAL_UPSTREAM` | **YES** |
| `SCHEDULER_SINGLE_LEADER` | **YES** |
| `GLOBAL_KILL_STATE` | **KILLED** |
| S4 persistence | **0** rows |
| Six S4 enable flags | **OFF** |
| Three Tiny staging keys | **MISSING** |

## 3 — JIT fresh authority (original run seal)

| Field | Value |
|-------|--------|
| `FRESH_TINY_NOT_BEFORE` | **`2026-10-07T14:54:57.152Z`** |
| `FRESH_TINY_EXPECTED_FINGERPRINT` | **`fc8df1903abf5ddefaf04d4f9bac63bd14dbe1335b155cdd853cfbcedad36b61`** |
| `DB_CLOCK_CANONICAL_UTC` (at `validate-fresh-authority`) | `2026-10-07T14:55:16.178Z` |
| `FRESH_AUTHORITY_AGE_SECONDS` | **19.026** |
| `FRESH_FINGERPRINT_OPERATOR_INTERNAL_MATCH` | **YES** |
| Trip JIT preconditions | future **0**, eligible **0** |

**Do not reuse** for mutation after expiry (900 s window) or for live staging without fresh authority.

## 4 — Production `DRY_RUN=1` wrapper result (original run)

| Field | Value |
|-------|--------|
| `ORIGINAL_DRY_RUN_FINAL_RESULT` | **PASS** |
| `GUARDS_OK` | **YES** |
| `DRY_RUN_FULL_GUARD_PATH_EXECUTED` | **YES** |
| `DRY_RUN_ENV_MUTATION_COUNT` | **0** |
| `INTENDED_ENV_CHANGED_KEY_COUNT` | **3** |
| `INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT` | **0** |
| `PRODUCTION_RESTART_OCCURRED` | **NO** (log; `DRY_RUN_RESTART_COUNT=0`) |

Intended three-key delta (simulation only; not written):

```
DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-07T14:54:57.152Z
DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a
DI_V0_S4_VEHICLE_ALLOWLIST=c10351f8-b6a2-4258-947f-631aeaa6d359
```

## 5 — Original run forensic gap (preserved truth)

```
ORIGINAL_RUN_PRE_POST_FORENSICS_CAPTURED=NO
S4F7X_ORIGINAL_RUN_EVIDENCE_COMPLETE=NO
```

All `PRE_*` / `POST_*` replica PID and attestation fields from §5 of the prior closure draft remain **`NOT_CAPTURED_IN_ORIGINAL_RUN`** in `s4f7x-production-dry-run.log` (wrapper stdout does not emit them). **Do not rewrite** the original run.

## 6 — Deterministic evidence completion rerun (~`2026-10-07T15:29:28Z` UTC)

Orchestration: `.cursor/scripts/cloud-agent-s4f7x-deterministic-evidence-rerun.sh`  
Transcript: `s4f7x-deterministic-evidence-rerun.log`

| Field | Value |
|-------|--------|
| `EVIDENCE_COMPLETION_RERUN_EXECUTED` | **YES** |
| `TOOL_CHECKOUT_SHA` | `11b4a80ccb88d1d6f747399f84667b06c9a71050` |
| `TOOL_CHECKOUT_CLEAN` | **YES** |
| `CURRENT_PRODUCTION_SHA` | `a376c965ecedf855eb0fbcda42542ff15b74422c` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261007151232_v4994` |
| `BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| `PRE_REPLICA_A_PID` | `1744975` |
| `PRE_REPLICA_B_PID` | `1745234` |
| `PRE_REPLICA_A_ATTESTATION_STATE` | **PRESTATE** |
| `PRE_REPLICA_A_ATTESTATION_FINGERPRINT` | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` |
| `PRE_REPLICA_A_ATTESTATION_CONTRACT_VERSION` | **v1** |
| `PRE_REPLICA_A_ATTESTATION_SAMPLE_COUNT` | **1** |
| `PRE_REPLICA_B_ATTESTATION_STATE` | **PRESTATE** |
| `PRE_REPLICA_B_ATTESTATION_FINGERPRINT` | `b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d` |
| `PRE_REPLICA_B_ATTESTATION_CONTRACT_VERSION` | **v1** |
| `PRE_REPLICA_B_ATTESTATION_SAMPLE_COUNT` | **1** |
| `PRE_REPLICA_ATTESTATION_PARITY` | **YES** |
| `JIT_FRESH_NOT_BEFORE` | **`2026-10-07T15:29:28.839Z`** |
| `LATEST_COMPLETED_TRIP_END_TIME` | `2026-10-07T11:59:21.764Z` |
| `JIT_EXPECTED_RUNTIME_ATTESTATION_FINGERPRINT` | `71e4fce892513e46d38261fd4366c626e30118be959b581249ed46ad6481a42a` |
| `JIT_EXPECTED_RUNTIME_ATTESTATION_STATE_UNDER_V1` | **OTHER** |
| `JIT_AUTHORITY_AGE_SECONDS` | **3.265** (immediately pre-wrapper) |
| `JIT_AUTHORITY_WITHIN_900_SECONDS` | **YES** |
| `GUARDS_OK` | **YES** |
| `DRY_RUN_ENV_MUTATION_COUNT` | **0** |
| `DRY_RUN_RESTART_COUNT` | **0** |
| `POST_REPLICA_A_PID` | `1744975` |
| `POST_REPLICA_B_PID` | `1745234` |
| `REPLICA_A_PID_UNCHANGED_DURING_DRY_RUN` | **YES** |
| `REPLICA_B_PID_UNCHANGED_DURING_DRY_RUN` | **YES** |
| `POST_REPLICA_ATTESTATION_PARITY` | **YES** (both **PRESTATE** / `b648908a…` / **v1**, sample count **1**) |
| `FRESH_OTHER_FINGERPRINT_NOT_AT_RUNTIME` | **YES** |
| `POST_PRODUCTION_SHA` | `a376c965ecedf855eb0fbcda42542ff15b74422c` (equals PRE) |
| `POST_BACKEND_ENV_SHA256` | unchanged vs PRE |
| `POST_GLOBAL_KILL_STATE` | **KILLED** |
| `POST_S4_ZERO_STATE` | **YES** |

**Note:** Production release advanced between the original run (`3c12875d…`) and this rerun (`a376c965…`) via normal deploy activity; this rerun pins **live** SHA/release/env hash observed at execution time. Original-run JIT (`14:54Z` / `fc8df190…`) remains historical-only.

## 7 — Combined evidence closure

```
EXP021_S4F7X_DETERMINISTIC_EVIDENCE_COMPLETION_RERUN_RESULT=PASS
S4F7X_ORIGINAL_RUN_EVIDENCE_COMPLETE=NO
EVIDENCE_COMPLETION_RERUN_EXECUTED=YES
S4F7X_COMBINED_EVIDENCE_COMPLETE=YES
FINAL_RESULT=PASS
BLOCKERS=NONE
NEXT_ACTION=WAIT_FOR_EXACT_HEAD_CI_THEN_MERGE_PR1912
```

## 8 — Gate authority (unchanged)

| Field | Value |
|-------|--------|
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | **NOT_SATISFIED** |
| Gate 6 | **NOT_SATISFIED** |
| `LIVE_STAGING_SHELL_EXECUTION_READY` | **NO** |
| `DRY_RUN=0` | **NOT EXECUTED** |

## Safety attestations

| Field | Value |
|-------|--------|
| `PRODUCTION_MUTATION_OCCURRED` | **NO** |
| `PRODUCTION_ENV_MUTATION_OCCURRED` | **NO** |
| `PRODUCTION_DB_WRITE_OCCURRED` | **NO** |
| `PRODUCTION_RESTART_OCCURRED` | **NO** |
| `DEPLOY_OCCURRED` | **NO** |
| `MIGRATION_EXECUTED` | **NO** |
| `PROVIDER_PRODUCTION_CALL_COUNT` | **0** |
