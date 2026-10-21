# EXP-021 S4F-7K — Production Tiny config staging dry run (read-only)

**Date (UTC):** 2026-10-02  
**Scope:** Read-only Production guard evaluation via `.cursor/scripts/cloud-agent-s4-tiny-staging.sh` + `di-v0-s4-stage-tiny-production.sh` with `DRY_RUN=1`. **No** Production env/DB/restart/deploy/migration/provider call.

## Authority pins

| Field | Value |
|-------|--------|
| Frozen merged `main` tool SHA (S4F-7J merge) | `040170104c101e960ec75406c216c38b6f4b183f` |
| Remediation tool SHA (this evidence branch) | `947a70540da6d227616fdf26c7e628d274d50c4a` |
| `CURRENT_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261002014651_v4994` |
| Expected pre-staging `backend.env` SHA256 | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `GLOBAL_KILL_STATE` | KILLED |

## Defect on frozen tool SHA `04017010` (blocking)

Dry-run bootstrap with `CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA=040170104c101e960ec75406c216c38b6f4b183f` reached vehicle proof then **failed**:

| Symptom | Cause |
|---------|--------|
| `VEHICLE_DB_PROOF=FAIL` | Vehicle SQL used `'${vid}'::uuid` while Production `vehicles.id` / `vehicle_provider_consents.vehicle_id` are **text** |

Remediation on branch `cursor/exp021-s4f7k-production-tiny-staging-dry-run-evidence-7d78` (`af9987885`, `947a70540`): text-id SQL + bootstrap `sudo -n -E` with explicit env exports + `PM2_HOME=/root/.pm2` + `dry-run-intent` CLI output.

**Production runtime SHA unchanged** — temp checkout only; `WRAPPER_REQUIRES_NEW_CODE_DEPLOY_BEFORE_USE=NO`.

## Successful dry run (remediation tool SHA)

**Command (local):** `bash .cursor/scripts/cloud-agent-s4-tiny-staging.sh` with pins documented in task S4F-7K and `CLOUD_AGENT_S4_TINY_STAGING_TOOL_SHA=947a70540da6d227616fdf26c7e628d274d50c4a`.

**Artifact:** `/opt/cursor/artifacts/s4f7k-bootstrap-dry-run.log`

### Production identity

| Check | Result |
|-------|--------|
| `PRODUCTION_SHA_MATCH` | YES |
| `PRODUCTION_RELEASE_MATCH` | YES |
| `REPLICA_A_PROCESS_RELEASE_IDENTITY` | YES |
| `REPLICA_B_PROCESS_RELEASE_IDENTITY` | YES |
| `STEADY_STATE_NO_MIXED_RELEASE_IDENTITY` | YES |
| `SCHEDULER_SINGLE_LEADER` | YES |
| `NGINX_DUAL_UPSTREAM` | YES |

### Pre-staging `backend.env`

| Check | Result |
|-------|--------|
| `PRODUCTION_BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `PRE_ENV_SHA_MATCH` | YES |
| `PRE_NOT_BEFORE_STATE` | MISSING |
| `PRE_ORG_ALLOWLIST_STATE` | MISSING |
| `PRE_VEHICLE_ALLOWLIST_STATE` | MISSING |
| `ALL_S4_ENABLE_FLAGS_FALSE` | YES |

### GLOBAL + S4 zero-state (pre)

| Metric | Value |
|--------|--------|
| `GLOBAL_ROW_COUNT` | 1 |
| `GLOBAL_KILL_STATE` / `EFFECTIVE_KILL_STATE` | KILLED |
| `S4_PIPELINE_REGISTRY_ROWS` | 0 |
| `S4_WORK_ITEM_ROWS` | 0 |
| `S4_ACTIVE_WORK_ITEM_ROWS` | 0 |
| `S4_EVIDENCE_SNAPSHOT_ROWS` | 0 |
| `S4_SHADOW_RUN_ROWS` | 0 |
| `S4_SHADOW_INTERVAL_ROWS` | 0 |

### Tiny vehicle (KS MS 661)

| Field | Value |
|-------|--------|
| `TINY_ORGANIZATION_ID` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `TINY_VEHICLE_ID` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| `TINY_VEHICLE_EXISTS` | YES |
| `TINY_VEHICLE_BELONGS_TO_ORG` | YES |
| `TINY_REGISTRY_LIFECYCLE` | ACTIVE |
| `TINY_HARDWARE_TYPE` | LTE_R1 |
| `TINY_SOURCE` | RUPTELA_R1 (registry authority) |
| `TINY_PROVIDER_LINK_ACTIVE` | YES (R1-relevant DIMO consent + `dimo_vehicle_id`) |
| `TINY_CROSS_TENANT_MISMATCH` | NO |

### Frozen staging packet (intent only)

| Key | Value |
|-----|--------|
| `DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE` | `2026-10-02T05:55:28.839Z` |
| `DI_V0_S4_ORGANIZATION_ALLOWLIST` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| `DI_V0_S4_VEHICLE_ALLOWLIST` | `c10351f8-b6a2-4258-947f-631aeaa6d359` |

`NOT_BEFORE_COMPARISON_AUTHORITY=vehicle_trips.end_time >= cutoff` (UTC `Z`).

### Budget / Redis / metrics

| Check | Result |
|-------|--------|
| `DIMO_GLOBAL_BUDGET_CONFIG_STATE` | EXPLICIT_ENABLED |
| `REPLICA_A_GLOBAL_BUDGET_RUNTIME` | ENABLED |
| `REPLICA_B_GLOBAL_BUDGET_RUNTIME` | ENABLED |
| `REDIS_REACHABLE` | YES |
| `METRICS_BEARER_AUTH_USED` | YES |
| `METRICS_SECRET_EXPOSED` | NO |

### Dry-run plan

| Field | Value |
|-------|--------|
| `GUARDS_OK` | YES |
| `INTENDED_ENV_CHANGED_KEY_COUNT` | 3 |
| `INTENDED_UNEXPECTED_ENV_CHANGED_KEY_COUNT` | 0 |
| `INTENDED_TARGET_KEY_COUNT_AFTER` | 3 |
| `PLANNED_ROLLING_RESTART_ORDER` | A_THEN_B |
| `PLANNED_PM2_UPDATE_ENV` | YES |
| `DISCOVERY_EFFECTIVE_ENABLED_AFTER_INTENDED_STAGING` | NO |
| `WORKER_EFFECTIVE_ENABLED_AFTER_INTENDED_STAGING` | NO |
| `MAINTENANCE_EFFECTIVE_ENABLED_AFTER_INTENDED_STAGING` | NO |
| `ENV_MUTATION_COUNT` / `RESTART_COUNT` | 0 |
| `TINY_ACTIVATION_READY` | NO (5/6 gates) |

## Post-dry-run independent verification

| Check | Result |
|-------|--------|
| `POST_BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `BACKEND_ENV_SHA256_UNCHANGED` | YES |
| `POST_NOT_BEFORE_STATE` / org / vehicle allowlist | MISSING |
| `POST_GLOBAL_KILL_STATE` | KILLED |
| `REPLICA_A_PID` / `REPLICA_B_PID` (post) | 4010324 / 4010550 |
| `PRODUCTION_RESTART_OCCURRED` | NO |
| `PRODUCTION_MUTATION_OCCURRED` | NO |

Replica PIDs unchanged vs steady-state observation during dry run (no PM2 restart; uptime ~19h).

## Readiness

| Field | Value |
|-------|--------|
| `PRODUCTION_TINY_STAGING_DRY_RUN_READINESS` | **PASS** (remediation tool SHA) |
| `NEXT_ACTION` | Merge remediation to `main`; then execute **separately authorized** config-only staging (`DRY_RUN=0`) — not part of S4F-7K |
