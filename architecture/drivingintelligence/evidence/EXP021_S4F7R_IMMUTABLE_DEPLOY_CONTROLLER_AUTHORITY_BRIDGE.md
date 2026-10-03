# EXP-021 S4F-7R — Immutable deploy controller authority bridge

**Date (UTC):** 2026-10-03  
**Scope:** Engineering-only closure of post–S4F-7Q integration defects. **No** Production deploy/mutation.

## Context

S4F-7Q merged to main @ `7895bdf0f7f828e4e829103a5ada2c000817aa62` with CI green. Post-merge review found **target-release / deploy-controller coupling**: canonical `vps-deploy-release.sh` sources `vps-production-replica.lib.sh` from the **target release** (immutable runtime RC `9d286e58…`), which does **not** contain S4F-7Q guard/CLI. After symlink switch, attestation helpers resolved CLI via `SYNQDRIVE_CURRENT_LINK` → RC path (missing). Rollback with gate enabled re-applied forward exact-RC SHA pins and blocked `ee958854…`.

**Runtime RC remains valid, four files only, unchanged.**

## Pre-S4F-7R defect confirmation (main @ 7895bdf0… behavior model)

| Finding | Value |
|---------|--------|
| `TARGET_RELEASE_SUPPLIES_REPLICA_LIB` | **YES** |
| `RC_CONTAINS_S4F7Q_GUARD` | **NO** |
| `CURRENT_S4F7Q_GATE_REACHABLE_DURING_REAL_RC_DEPLOY` | **NO** |
| `CURRENT_LINK_POINTS_TO_RC_DURING_GATE` | **YES** |
| `RC_CONTAINS_S4F7Q_CLI` | **NO** |
| `CURRENT_GATE_CLI_PATH_VALID_DURING_REAL_DEPLOY` | **NO** |
| `CURRENT_ROLLBACK_WITH_GATE_ENABLED_ACCEPTS_OLD_SHA` | **NO** |
| `ROOT_CAUSE_CONFIRMED` | **YES** |

## S4F-7R architecture

| Authority | SHA / artifact |
|-----------|----------------|
| **Runtime RC** | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` (4 files) |
| **Deploy controller** | `release/exp021-s4f7r-deploy-controller-rc1` @ **`8a18bb6e13a04490ed3e49e393817bee77722902`** (separate immutable checkout) |

| Field | Value |
|-------|--------|
| `RUNTIME_SHA_AND_CONTROLLER_SHA_SEPARATE_AUTHORITIES` | **YES** |
| `DEPLOY_CONTROLLER_ROOT_INDEPENDENT_OF_CURRENT_SYMLINK` | **YES** |
| `DEPLOY_CONTROLLER_ROOT_INDEPENDENT_OF_TARGET_RELEASE` | **YES** |
| `DEPLOY_CONTROLLER_EXACT_SHA_REQUIRED` | **YES** (`EXPECTED_DEPLOY_CONTROLLER_SHA`) |
| `DEPLOY_CONTROLLER_BRANCH_AUTHORITY` | **NO** |
| `DEPLOY_CONTROLLER_MAIN_FALLBACK` | **NO** |
| `GUARDED_DEPLOY_REPLICA_LIB_SOURCE` | **CONTROLLER** |
| `GUARDED_DEPLOY_ATTESTATION_LIB_SOURCE` | **CONTROLLER** |
| `GUARDED_DEPLOY_ATTESTATION_CLI_SOURCE` | **CONTROLLER** |
| `APPLICATION_RUNTIME_SOURCE` | **TARGET_RC** |
| `DEPLOY_CONTROL_SOURCE` | **CONTROLLER_SHA** |
| `ATTESTATION_CLI_USES_CONTROLLER_ROOT` | **YES** |
| `ATTESTATION_CLI_USES_CURRENT_SYMLINK` | **NO** |

### Rollback

| Field | Value |
|-------|--------|
| `ROLLBACK_FORWARD_GATE_DISABLED` | **YES** |
| `ROLLBACK_TARGET_OLD_SHA_ALLOWED` | **YES** |
| `ROLLBACK_TARGET_RC_SHA_NOT_REQUIRED` | **YES** |

## Migration compatibility (preserved from S4F-7Q)

| Field | Value |
|-------|--------|
| `PRODUCTION_APPLIED_MIGRATION_COUNT` | 402 |
| `RC_KNOWN_MIGRATION_COUNT` | 369 |
| `DB_AHEAD_MIGRATION_HISTORY_COUNT` | 33 |
| `RC_FORWARD_PENDING_MIGRATION_COUNT` | 0 |
| `DISPOSABLE_MIGRATE_DEPLOY` | PASS |
| `DISPOSABLE_MIGRATE_DEPLOY_APPLIED_MIGRATION_COUNT` | 0 |

## RC immutability

| Field | Value |
|-------|--------|
| `RC_SHA_BEFORE` / `RC_SHA_AFTER` | `9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4` |
| `RC_BRANCH_TIP_UNCHANGED` | **YES** |
| `RC_PAYLOAD_FILE_COUNT_STILL` | **4** |

## Validation

- `npm run test:di:s4f7r:deploy-controller` — **13** cases  
- `npm run test:di:s4f7q:exact-rc-attestation-deploy` — **26** cases  
- `npm run test:di:s4a` / `test:di:s4f` — PASS  
- `npm run build` — PASS  

## Production status

**Blocked** until deploy controller SHA is sealed and authorized separately from runtime RC. No Production mutation in this slice.
