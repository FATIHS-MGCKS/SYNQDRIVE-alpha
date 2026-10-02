# EXP-021 S4F-7B — Dormant Production deploy preflight (read-only)

**Audit date:** 2026-10-02 (UTC)  
**Target deploy SHA (exact):** `ee9588548845c8077aa0cba0684b06eac7c9d4d2` (merged PR #1873 — S4F-7A)  
**Scope:** Read-only Production + repository delta audit — **no** deploy, env mutation, PM2 restart, migrations, `di_v0_s4_control` writes, kill initializer, S4 activation, operator grant, or provider calls.

## Step 1 — Repository anchor

| Field | Value |
|-------|--------|
| `STARTING_MAIN_SHA` / `origin/main` at audit | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `TARGET_DEPLOY_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `TARGET_REACHABLE_FROM_MAIN` | **YES** (main tip equals target) |
| Commits after target on main | **0** |

## Step 2 — Live Production identity (VPS read-only)

Canonical topology via SSH `synqdrive-admin@srv1374778.hstgr.cloud` (2026-10-02).

| Field | Value |
|-------|--------|
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261001035130_v4994` |
| `CURRENT_PRODUCTION_SHA` | `8fa531b275bc4dca02c09b279c0d2b806e544007` |
| `REPLICA_A_SHA` / `REPLICA_B_SHA` | `8fa531b275bc4dca02c09b279c0d2b806e544007` (shared `current` release) |
| `NO_MIXED_SHA` | **YES** |
| `REPLICA_A_HEALTH` / `REPLICA_B_HEALTH` | **OK** (`:3001` / `:3002`) |
| `SCHEDULER_SINGLE_LEADER` | **YES** (readiness: LEADER + FOLLOWER) |
| `NGINX_DUAL_UPSTREAM` | **YES** |
| `RESTART_LOOP_DETECTED` | **NO** |

## Step 3 — Production `backend.env` (SHA-256 only; values redacted)

| Field | Value |
|-------|--------|
| `PRODUCTION_BACKEND_ENV_SHA256` | `6ea36831d58d9182877936beaa183e5a0024b766a4c195df9d94d261c639a1d7` |
| `DIMO_GLOBAL_BUDGET_CONFIG_STATE` | **EXPLICIT_ENABLED** (`DIMO_GLOBAL_BUDGET_ENABLED` truthy) |
| `DI_V0_S4_*_ENABLED` keys | **MISSING** (parsed as OFF by S4A control plane) |
| `PRODUCTION_ORG_ALLOWLIST_STATE` | **MISSING** |
| `PRODUCTION_VEHICLE_ALLOWLIST_STATE` | **MISSING** |
| `PRODUCTION_NOT_BEFORE_STATE` | **MISSING** (fail-closed for discovery) |
| `ALL_S4_ENABLE_FLAGS_FALSE` | **YES** |
| `ORG_ALLOWLIST_EFFECTIVE_NONE` | **YES** |
| `VEHICLE_ALLOWLIST_EFFECTIVE_NONE` | **YES** |
| `REDIS_REACHABLE` | **YES** (`PONG`) |

`GLOBAL_BUDGET_ACTIVE_RUNTIME_STATE`: **CONFIG_EXPLICIT_ENABLED** (S4F-6 committed config rollout on unchanged code SHA `8fa531b27…`; Prometheus gauge scrape not observed on `/metrics` in this audit — non-blocking for dormant S4 deploy readiness).

## Step 4 — Production DB (read-only)

| Field | Value |
|-------|--------|
| `PRODUCTION_DB_CONTROL_TABLE_PRESENT` | **YES** |
| `PRODUCTION_DB_CONTROL_ROW_STATE` | **MISSING** |
| `PRODUCTION_DB_KILL_STATE` | **KILLED_FAIL_CLOSED** |
| `PRODUCTION_S4_PIPELINE_REGISTRY_ROWS` | **0** (`di_v0_s4_pipeline_versions`) |
| `PRODUCTION_S4_WORK_ITEM_ROWS` | **0** |
| `PRODUCTION_S4_ACTIVE_WORK_ITEM_ROWS` | **0** |
| `PRODUCTION_S4_EVIDENCE_SNAPSHOT_ROWS` | **0** |
| `PRODUCTION_S4_SHADOW_RUN_ROWS` | **0** (S4 execution identity prefix) |
| `PRODUCTION_S4_SHADOW_INTERVAL_ROWS` | **0** (S4-attributed) |

## Step 5 — Delta `8fa531b27…` → `ee958854…`

| Field | Value |
|-------|--------|
| `PROD_TO_TARGET_COMMIT_COUNT` | **15** |
| `PROD_TO_TARGET_CHANGED_FILE_COUNT` | **127** |
| `TARGET_NEW_MIGRATION_COUNT` | **0** |
| `TARGET_NEW_MIGRATIONS` | *(none)* |
| `PRODUCTION_PENDING_TARGET_MIGRATION_COUNT` | **0** |
| `ACTIVE_FAILED_OR_PARTIAL_MIGRATION_COUNT` | **0** (incomplete with `finished_at IS NULL AND rolled_back_at IS NULL`) |

Historical rolled-back migration tombstones exist (`rolled_back_at` populated) — expected, not active failures.

Notable delta tranches: **S4F-7A** (runtime composition + NO_BACKFILL + kill initializer tooling), Vehicle Onboarding VO-4.9/4.10, Battery V2 H4-A2/A3 docs+reporting, RFRF OQ-014 identity/cross-version, governance/docs/frontend.

## Step 6 — Non-S4 deploy side-effect classification (target code review)

| Tranche | `DEPLOY_SIDE_EFFECT_CLASS` | Rationale |
|---------|---------------------------|-----------|
| Vehicle Onboarding VO-4.10 / VO-4.9 | **DORMANT_OR_READ_ONLY** | HTTP/governance + candidate projection; no new always-on scheduler or auto-adoption on bootstrap in delta |
| Battery V2 H4-A2/A3 | **DORMANT_OR_READ_ONLY** | Report/CLI + integration tests; no new Nest scheduler registering automatic writes on app boot |
| RFRF / Energy Events OQ-014 | **DORMANT_OR_READ_ONLY** | Identity/cross-version foundation; no new `setInterval`/`@Cron` in application delta outside tests |
| S4F-7A | **EXISTING_RUNTIME_BEHAVIOR_CHANGE** | S4 becomes **registered** but **control-plane dormant** under current env |

`UNEXPECTED_AUTOMATIC_RUNTIME_FOUND` = **NO**

## Step 7 — S4 runtime bootstrap safety (target SHA `ee958854…`)

| Check | Result |
|-------|--------|
| `DiV0S4RuntimeModule` → `VehicleIntelligenceModule` | **YES** |
| S4B / S4E / S4F composed | **YES** |
| S4C executor registration count | **1** |
| Shared `DI_V0_S4B_CONTROL_PLANE_CONFIG` | **YES** |
| ALL-OFF dormant tests (`di-v0-s4-runtime-dormant.spec.ts`, S4B gates) | **PASS** (local, target code) |
| ALL-OFF timers / Prisma / DIMO on bootstrap | **NONE** (test-proven) |

Production release **before** deploy: `s4-runtime/` **absent** on `8fa531b27…` — expected.

## Step 8 — Nest circular dependency

`VehicleIntelligenceModule` → `DiV0S4RuntimeModule` → `forwardRef(DimoModule)` → existing `forwardRef(VehicleIntelligenceModule)` pattern preserved. Dormant Nest test module compiles and boots ALL-OFF.

| Field | Value |
|-------|--------|
| `NEST_CIRCULAR_DEPENDENCY_RESOLUTION` | **OK** |
| `DIMO_AUTH_PROVIDER_RESOLVABLE` | **YES** |
| `DIMO_TELEMETRY_PROVIDER_RESOLVABLE` | **YES** |
| `PRISMA_PROVIDER_RESOLVABLE` | **YES** |
| `SCHEDULER_GUARD_RESOLVABLE` | **YES** |

## Step 9 — Deploy script authority (`vps-deploy-release.sh` @ target)

| Capability | Present |
|------------|---------|
| Exact `SYNQDRIVE_REQUESTED_DEPLOY_SHA` | **YES** |
| Pre-deploy DB backup | **YES** |
| `prisma migrate deploy` | **YES** (0 pending for this target) |
| Backend + frontend build | **YES** |
| `SYNQDRIVE_BOOT_CHECK=1` boot check | **YES** |
| Rolling replica deploy + post-verify | **YES** |
| Rollback on failure | **YES** |

## Step 11 — Provider budget (pre-deploy)

| Field | Value |
|-------|--------|
| `GLOBAL_BUDGET_GATE_AFTER_TARGET_DEPLOY_EXPECTED` | **SATISFIED** (explicit env + Redis; S4 dormant so no S4C provider calls) |
| `S4C_PROVIDER_CONTEXT` | **POST_TRIP_ENRICHMENT / BACKGROUND** |
| `S4C_PROVIDER_BYPASS_PRESENT` | **NO** |

## Step 12 — Mandatory post-deploy checks (future execution task)

After authorized deploy to `ee958854…` only:

- Replica SHA match target; health OK; single scheduler leader; nginx dual upstream  
- `BACKEND_ENV_SHA256` unchanged  
- All S4 flags remain false/absent; allowlists none; NOT_BEFORE missing/empty  
- `S4_RUNTIME_REGISTERED=YES` + `S4_RUNTIME_EFFECTIVELY_DORMANT=YES`  
- Zero deltas: S4 provider calls, work items, snapshots, shadow runs  
- `GLOBAL_KILL_EFFECTIVE=KILLED` (missing row or KILLED row)  
- Operator gate **NOT_SATISFIED**; `TINY_ACTIVATION_READY=NO`

Indirect timer proof when flags OFF: dormant integration tests + absence of discovery/work-item growth + no DIMO JWT/GraphQL in ALL-OFF bootstrap test contract.

## Step 13 — Rollback triggers (future deploy)

Rollback if: replica health failure, mixed SHA, Nest bootstrap failure, leader/nginx convergence failure, unexpected env hash change, any S4 flag truthy, S4 persistence growth, provider calls, restart loop, or unexpected VO/Battery/RFRF automatic runtime activation.

## Decision

**`DORMANT_DEPLOY_READINESS=PASS`**

Exact SHA `ee9588548845c8077aa0cba0684b06eac7c9d4d2` may proceed to a **separately authorized** dormant Production deploy. This does **not** authorize deploy, GLOBAL row creation, NOT_BEFORE, allowlists, flags, operator grant, or Tiny execution.

Repeatable VPS snapshot: `backend/scripts/ops/di-v0-s4f7b-dormant-production-deploy-preflight.sh`

## Frozen Tiny authority (unchanged)

`EXPLICIT_OPERATOR_AUTHORIZATION_GATE=NOT_SATISFIED` · `FROZEN_TINY_GATE_SATISFIED_COUNT=5` · `TINY_ACTIVATION_READY=NO`

## Machine result block

```
EXP021_S4F7B_DORMANT_PRODUCTION_DEPLOY_PREFLIGHT_RESULT=PASS
TARGET_DEPLOY_SHA=ee9588548845c8077aa0cba0684b06eac7c9d4d2
CURRENT_PRODUCTION_SHA=8fa531b275bc4dca02c09b279c0d2b806e544007
DORMANT_DEPLOY_READINESS=PASS
PRODUCTION_MUTATION_OCCURRED=NO
DEPLOY_OCCURRED=NO
NEXT_ACTION=SEPARATE_EXPLICIT_AUTHORIZATION_FOR_EXACT_SHA_DORMANT_PRODUCTION_DEPLOY
```
