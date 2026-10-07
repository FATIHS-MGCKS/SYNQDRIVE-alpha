# EXP-021 S4F-7X — Exact tool SHA seal + JIT fresh authority + Production dry-run

**Date (UTC):** 2026-10-07  
**Scope:** Authorized **read-only** Production observation + `DRY_RUN=1` on fresh S4F-7W wrapper only. **No** env mutation, restart, DB write, deploy, migration, provider calls, live staging, or S4 activation.

## 0 — Access path recovery (prior attempt correction)

The first S4F-7X agent run incorrectly assumed Tailscale (`mein-vps.internal`), `root@srv1374778.hstgr.cloud`, and explicit `~/.ssh/id_ed25519` as root. Historical Production audits (S4F-7S / S4F-7T / S4F-7U) use **`synqdrive-admin@srv1374778.hstgr.cloud`** with passwordless `sudo -n` for root-only `backend.env` and `postgres` reads.

```
EXP021_S4F7X_PRODUCTION_ACCESS_PATH_RECOVERY_RESULT=PASS
HISTORICAL_PRODUCTION_ACCESS_PATH=synqdrive-admin@srv1374778.hstgr.cloud
PREVIOUS_FAILED_TAILSCALE_PATH_USED=YES
PREVIOUS_FAILED_ROOT_USER_USED=YES
PREVIOUS_FAILED_EXPLICIT_IDENTITY_ASSUMPTION_USED=YES
NEW_CREDENTIAL_CONFIGURATION_REQUIRED=NO
TAILSCALE_REQUIRED=NO
CLOUD_AGENT_DATABASE_URL_REQUIRED=NO
SSH_CONNECTION=PASS
REMOTE_USER=synqdrive-admin
CURRENT_LINK_READABLE=YES
BACKEND_ENV_READABLE=YES
LOCAL_PRODUCTION_POSTGRES_READONLY_ACCESS=PASS
PRODUCTION_DB_CLOCK_READABLE=YES
LOCALHOST_HEALTH_ACCESS=PASS
LOCALHOST_READINESS_ACCESS=PASS
LOCALHOST_AUTHENTICATED_METRICS_ACCESS=PASS
REDIS_READONLY_PROBE=PASS
PRODUCTION_ACCESS_RECOVERED=YES
PRODUCTION_MUTATION_OCCURRED=NO
PRODUCTION_ENV_MUTATION_OCCURRED=NO
PRODUCTION_DB_WRITE_OCCURRED=NO
PRODUCTION_RESTART_OCCURRED=NO
DEPLOY_OCCURRED=NO
MIGRATION_EXECUTED=NO
PROVIDER_PRODUCTION_CALL_COUNT=0
```

Operational note: wrapper `DRY_RUN=1` executed under **`sudo -n -E`** (effective `REMOTE_USER=root` for the wrapper process only) so `/opt/synqdrive/shared/backend.env` remains readable for hash/guards without copying secrets. SSH entry path remains `synqdrive-admin`.

Bootstrap: `.cursor/scripts/cloud-agent-s4f7x-fresh-tiny-dry-run.sh` (temp tool checkout @ sealed SHA + release `node_modules` symlink).

## 1 — Tool authority (local + remote verification)

| Field | Value |
|-------|--------|
| `TOOL_AUTHORITY_SHA` | `11b4a80ccb88d1d6f747399f84667b06c9a71050` |
| `TOOL_AUTHORITY_SOURCE` | Merged **#1911** (S4F-7W) |
| `TOOL_CHECKOUT_SHA` (detached worktree `/tmp/s4f7x-tool-11b4a80`) | `11b4a80ccb88d1d6f747399f84667b06c9a71050` |
| `EXPECTED_FRESH_TINY_STAGING_TOOL_SHA` | `11b4a80ccb88d1d6f747399f84667b06c9a71050` |
| `REMOTE_TOOL_SHA_VERIFIED` | **YES** |
| `TOOL_SHA_PIN` | **PASS** |

## 2 — Production baseline (live)

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_SHA` | `3c12875dc464ac9a0693957c794c935d101dd43f` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261007115738_v4994` |
| `BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` |
| `REPLICA_A_PM2_UPTIME_SEC` / `REPLICA_B_PM2_UPTIME_SEC` | `926` / `926` (at dry-run) |
| Health / readiness A & B | **PASS** |
| `NGINX_DUAL_UPSTREAM` | **YES** |
| `SCHEDULER_SINGLE_LEADER` | **YES** |
| `NO_MIXED_SHA` | **YES** |
| `GLOBAL_KILL_STATE` | **KILLED** |
| S4 persistence tables | **0** rows (zero-state) |
| Six S4 enable flags | **OFF** |
| Three Tiny staging keys | **MISSING** (prestate) |

## 3 — JIT fresh authority (sealed this run)

| Field | Value |
|-------|--------|
| `FRESH_TINY_NOT_BEFORE` | **`2026-10-07T14:54:57.152Z`** |
| `FRESH_CUTOFF_SOURCE` | **PRODUCTION_DATABASE_CLOCK** (`clock_timestamp()` UTC, ms via `to_char`) |
| `FRESH_TINY_EXPECTED_FINGERPRINT` | **`fc8df1903abf5ddefaf04d4f9bac63bd14dbe1335b155cdd853cfbcedad36b61`** |
| `FRESH_FINGERPRINT_DERIVE_STABLE` | **YES** (two CLI derives matched) |
| `TINY_COMPLETED_TRIP_END_TIME_IN_FUTURE_COUNT` | **0** |
| `FRESH_CUTOFF_EXISTING_ELIGIBLE_COMPLETED_TRIP_COUNT` | **0** |
| `DB_CLOCK_CANONICAL_UTC` (at `validate-fresh-authority`) | `2026-10-07T14:55:16.178Z` |
| `FRESH_AUTHORITY_AGE_SECONDS` | **19.026** (≤ **900**) |
| `FRESH_FINGERPRINT_OPERATOR_INTERNAL_MATCH` | **YES** |

**Do not reuse** S4F-7U evidence authority (`9abb1a57…` / `2026-10-06T18:33:26.610Z`) — expired and superseded by this JIT seal.

## 4 — Production `DRY_RUN=1` wrapper result

| Field | Value |
|-------|--------|
| `DRY_RUN` | **1** |
| `LIVE_PREFLIGHT_READONLY` | **PASS** |
| `GUARDS_OK` | **YES** |
| `DRY_RUN_FULL_GUARD_PATH_EXECUTED` | **YES** |
| `DRY_RUN_ENV_MUTATION_COUNT` | **0** |
| `INTENDED_ENV_CHANGED_KEY_COUNT` | **3** |
| `INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT` | **0** |
| `PRODUCTION_ENV_MUTATION_OCCURRED` | **NO** |
| `PRODUCTION_DB_WRITE_OCCURRED` | **NO** |
| `PRODUCTION_RESTART_OCCURRED` | **NO** |

Intended three-key delta (not written):

```
DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE=2026-10-07T14:54:57.152Z
DI_V0_S4_ORGANIZATION_ALLOWLIST=faa710c9-6d91-4079-a7d5-91fdccdec14a
DI_V0_S4_VEHICLE_ALLOWLIST=c10351f8-b6a2-4258-947f-631aeaa6d359
```

Full sanitized log: agent artifact `s4f7x-production-dry-run.log`.

## 5 — Post-dry-run independent read

| Field | Value |
|-------|--------|
| `POST_DRY_RUN_PRODUCTION_SHA` | `3c12875dc464ac9a0693957c794c935d101dd43f` (unchanged) |
| `POST_DRY_RUN_BACKEND_ENV_SHA256` | `9aae449e809ff7f1ac6cb3411e09d52b2e1f28923c453589218ebe26bab97e05` (unchanged) |

## 6 — Gate authority (unchanged)

| Field | Value |
|-------|--------|
| `EXPLICIT_OPERATOR_AUTHORIZATION_GATE` | **NOT_SATISFIED** |
| `TINY_ACTIVATION_READY` | **NO** |
| Gate 6 | **NOT_SATISFIED** |
| `LIVE_STAGING_SHELL_EXECUTION_READY` | **NO** |
| `LIVE_STAGING_REMAINS_FAIL_CLOSED` | **YES** |
| `DRY_RUN=0` | **NOT EXECUTED** |
| `DI_S4F7V_LIVE_STAGING_AUTHORIZED` | **NOT SET** |

## Outcome

| Field | Value |
|-------|--------|
| `FINAL_RESULT` | **`PASS`** |
| `BLOCKERS` | **NONE** |
| `NEXT_ACTION` | **Human Gate 6 / live staging remains unauthorized** — any future env mutation must refresh JIT authority (≤900 s) and re-run preflight; do not reuse this cutoff after expiry |

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
| `SHADOW_ACTIVATION_OCCURRED` | **NO** |
