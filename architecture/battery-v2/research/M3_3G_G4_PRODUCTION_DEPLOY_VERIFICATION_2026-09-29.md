# M3.3G G4 — Production deploy + verification evidence

**Date:** 2026-09-29 (UTC)  
**Authorized target SHA:** **`1dd4224037a84417c5d605575bb6d288ac93184e`** (PR #1842 merge)  
**Deploy path:** `CLOUD_AGENT_SKIP_GIT_PREFLIGHT=1` + `CLOUD_AGENT_REQUESTED_DEPLOY_SHA` → `cloud-agent-deploy.sh` → `vps-deploy-release.sh`

## Status semantics (G1–G3 on this SHA)

| Label | Value |
|-------|-------|
| **MERGED** | PRs #1837 / #1840 / #1842 on main |
| **CI_VALIDATED** | All workflows on commit `1dd422403` **success** (0 failed / 0 pending at gate time) |
| **PRODUCTION_DEPLOYED** | Release **`20260929224455_v4994`** @ **`1dd422403`** |
| **PRODUCTION_VERIFIED** | Post-deploy checklist below **PASS** (GT schema live, **0** GT rows, env preserved) |
| **NATURAL_GT_VALIDATED** | **NO** — `GT_ROW_COUNT=0`; wait for first legitimate confirmed event |

`origin/main` advanced to **`11adaf76d…`** after deploy authorization — production intentionally **not** on latest main tip.

---

## Pre-deploy snapshot

| Field | Value |
|-------|-------|
| `PRODUCTION_SHA_BEFORE` | `6952fdf727f236ac7b338e14b85d54af6733fa0f` |
| `PRODUCTION_RELEASE_BEFORE` | `20260928175908_v4994` |
| `PM2_REPLICA_COUNT_BEFORE` | **2** (online) |
| `GT_TABLE_EXISTS_BEFORE` | **NO** |
| `GT_ROW_COUNT_BEFORE` | **0** (N/A — table absent) |
| `D3_FLAG_BEFORE` | `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=true` |
| `DI_V0_S4_ANY_ENABLED_BEFORE` | **NO** (no keys in `backend.env`) |
| `BACKEND_ENV_SHA256` | `98a6aac259b3268f8f45e9d5d4fd5cb3b82e5a748bb7f4097b43f9232296e9f4` (unchanged post-deploy) |

### Service-event org backfill precheck

| Metric | Value |
|--------|------:|
| `SERVICE_EVENT_TOTAL_ROWS` | **1** |
| `SERVICE_EVENT_ROWS_WITH_NULL_ORG_BEFORE` | **1** |
| `SERVICE_EVENT_BACKFILL_ELIGIBLE_ROWS` | **1** |
| `SERVICE_EVENT_BACKFILL_AMBIGUOUS_ROWS` | **0** |

---

## Deploy result

| Field | Value |
|-------|-------|
| `NEW_RELEASE_ID` | **`20260929224455_v4994`** |
| `DEPLOYED_SHA` | **`1dd4224037a84417c5d605575bb6d288ac93184e`** |
| `EXACT_SHA_DEPLOYED` | **YES** (`REQUESTED_SHA == TARGET_SHA == replica SHA invariant`) |
| `GT_MIGRATION_1_APPLIED` | **YES** @ `2026-09-29T22:51:21Z` |
| `GT_MIGRATION_2_APPLIED` | **YES** @ `2026-09-29T22:51:21Z` |

Prisma log: applied `20260929120000_battery_ground_truth_events`, `20260929140000_battery_ground_truth_replacement_source_scope_unique`.

---

## Post-deploy verification

| Field | Value |
|-------|-------|
| `BATTERY_GROUND_TRUTH_EVENTS_TABLE_EXISTS` | **YES** |
| `BATTERY_GROUND_TRUTH_REVOCATIONS_TABLE_EXISTS` | **YES** |
| `GT_ROW_COUNT_IMMEDIATELY_AFTER_DEPLOY` | **0** |
| `SERVICE_EVENT_ROWS_WITH_NULL_ORG_AFTER` | **0** |
| `SERVICE_EVENT_BACKFILLED_ROW_COUNT` | **1** (bounded G1 migration only) |
| `AUTOMATIC_GT_BACKFILL_OCCURRED` | **NO** |
| `SYNTHETIC_GT_CREATED` | **NO** |
| `STARTUP_GT_CREATED` | **NO** |
| `D3_FLAG_AFTER` | **true** |
| `D3_FLAG_CHANGED` | **NO** |
| `D3_RECENT_ACTIVITY` | **25** revisions / 24h; **34** / 7d (pre-existing sustained D3; latest `materialized_at` `2026-09-29T19:42:18Z`) |
| `F5_REMAINS_READ_ONLY_REPORTING` | **YES** (no F5 writer; CLI/report only) |
| `DI_V0_S4_ANY_ENABLED_AFTER` | **NO** |
| `S4D_AUTOMATIC_RUNTIME_ACTIVE` | **NO** |
| `E3_RUNTIME_ACTIVE` | **NO** |
| `F6_ACTIVE` | **NO** |
| `PM2_REPLICA_COUNT_AFTER` | **2** (online) |
| `BACKEND_HEALTH` | **PASS** (`https://app.synqdrive.eu/api/v1/health` + local replicas) |
| `DATABASE_HEALTH` | **PASS** (read-only psql + migrate success) |
| `REDIS_HEALTH` | **PASS** (inferred — app health OK; no Redis fault in deploy log) |
| `MIGRATION_ERROR` | **NO** |
| `BOOT_ERROR` | **NO** |
| `NEW_ERROR_SPIKE` | **NO** (bounded log scan: pre-existing DIMO JWT 403 noise only) |

### Indexes verified (GT events)

Partial uniques present: `battery_ground_truth_events_active_fingerprint_key`, `battery_ground_truth_one_confirmed_successor_per_prior`, `battery_ground_truth_one_active_replacement_per_source_event`.

---

## G4 readiness

```
G4_COLLECTION_INFRASTRUCTURE_READY=YES
NATURAL_GT_PRESENT=NO
```

**Recommended next action:** Continue natural D3/F5 collection; wait for first **CONFIRMED** document apply or manual **confirm-replacement** GT; then re-run G4 read-only correlation audit (`BATTERY_F5_ALLOW_PRODUCTION_READONLY=true`).

```
M3_3G_G4_PRODUCTION_ENABLEMENT_DEPLOY_RESULT=PASS
ROLLBACK_REQUIRED=NO
```

Deploy log artifact: `/opt/cursor/artifacts/g4_deploy.log` (agent run).
