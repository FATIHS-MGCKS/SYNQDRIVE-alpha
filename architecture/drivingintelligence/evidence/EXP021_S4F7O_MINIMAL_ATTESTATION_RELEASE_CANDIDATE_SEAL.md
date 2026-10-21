# EXP-021 S4F-7O — Minimal attestation release candidate seal

**Date (UTC):** 2026-10-03  
**Scope:** Engineering release-candidate construction only. **No** Production deploy, mutation, restart, env change, migration execution, or S4 activation.

## Authority anchors

| Field | Value |
|-------|--------|
| `CURRENT_MAIN_SHA` (evidence branch) | `82707f28b338f8548274961cf1ccd620dd1c64ff` |
| `PRODUCTION_BASE_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `PRODUCTION_RELEASE` | `20261002014651_v4994` |
| `S4F7M_RUNTIME_SOURCE_SHA` | `c29179366bb3e0f7f4cd3284155fd4bdbb8ae310` |
| S4F-7N audit | PR #1896 |

## Release candidate (immutable deploy authority)

| Field | Value |
|-------|--------|
| `RC_BRANCH` | `release/exp021-s4f7o-minimal-attestation-rc1` |
| **`MINIMAL_ATTESTATION_RELEASE_CANDIDATE_SHA`** | **`9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4`** |
| `RC_PARENT_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `RC_COMMIT_COUNT_ABOVE_PRODUCTION` | **1** |
| `RC_FIRST_PARENT_IS_PRODUCTION_SHA` | **YES** |
| Commit message | `feat(exp021): S4F-7O minimal dormant runtime attestation release` |

**Not** intended to merge into `main`. Deploy authorization, when granted, pins this **SHA**, not the branch name.

## Four-file payload (byte-identical to S4F-7M @ `c29179366…`)

| # | Path | `BYTE_IDENTICAL_TO_S4F7M` |
|---|------|---------------------------|
| 1 | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.ts` | **YES** |
| 2 | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.metrics.ts` | **YES** |
| 3 | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation.service.ts` | **YES** |
| 4 | `backend/src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime.module.ts` | **YES** |

## Diff seal (`base=ee958854…` → `head=9d286e58a…`)

| Check | Value |
|-------|--------|
| `RC_CHANGED_FILE_COUNT` | **4** |
| `RC_RUNTIME_CHANGED_FILE_COUNT` | **4** |
| `RC_UNRELATED_CHANGED_FILE_COUNT` | **0** |
| `RC_PRISMA_SCHEMA_CHANGED` | **NO** |
| `RC_MIGRATION_CHANGED_FILE_COUNT` | **0** |
| `RC_MIGRATION_TREE_IDENTICAL_TO_PRODUCTION` | **YES** |
| `RC_PRISMA_SCHEMA_IDENTICAL_TO_PRODUCTION` | **YES** |
| `RC_NEW_MIGRATION_COUNT` | **0** |
| `RC_PACKAGE_JSON_CHANGED` | **NO** |
| `RC_PACKAGE_LOCK_CHANGED` | **NO** |
| `RC_OPS` / worker / scheduler / battery / VO / frontend / doc / test (committed) | **0** |

## Canonical deploy script (candidate tree)

`backend/scripts/ops/vps-deploy-release.sh` still runs `npm run prisma:migrate:deploy` — **unchanged** from Production base.

| Field | Value |
|-------|--------|
| `CANONICAL_DEPLOY_RUNS_PRISMA_MIGRATE_DEPLOY` | **YES** |
| `RC_HAS_PENDING_CODE_INTRODUCED_MIGRATION` | **NO** |

## Clean worktree validation @ `9d286e58a…`

| Step | Result |
|------|--------|
| `npm ci` | **PASS** |
| `npx prisma generate` | **PASS** |
| `npm run build` | **PASS** |

Log: `/opt/cursor/artifacts/s4f7o-rc-build.log` (`BUILD_EXIT:0`)

### Temporary validation harness (untracked only)

Materialized from `c29179366…` for test run, then **deleted** (not committed):

- `di-v0-s4-runtime-config-attestation.integration.spec.ts`
- `di-v0-s4-runtime-config-attestation-metric-parse.ts` (parser helper required by integration spec)

| Field | Value |
|-------|--------|
| `TEMP_VALIDATION_FILES_COMMITTED` | **NO** |
| `RC_GIT_WORKTREE_CLEAN` | **YES** |

### Attestation integration tests

`npx jest di-v0-s4-runtime-config-attestation.integration.spec.ts --runInBand`

| Case | Result |
|------|--------|
| PRESTATE + fingerprint `b648908a…` | **PASS** |
| STAGED + fingerprint `8db53233…` | **PASS** |
| OTHER | **PASS** |

### Production-base regression

| Suite | Result |
|-------|--------|
| `npm run test:di:s4a` | **PASS** (115/115) |
| `npm run test:di:s4f` | **PASS** (43/43) |
| `RC_RUNTIME_REGRESSION_CLASSIFICATION` | **NO_FAILURES** |

## Dormancy & metric safety

Attestation service: `OnModuleInit` only; reads `process.env`; publishes one bounded Prometheus gauge via global `TripMetricsService` → existing authenticated `GET /api/v1/metrics`.

| Invariant | Value |
|-----------|--------|
| S4 enable flags default / missing | OFF |
| `ATTESTATION_HAS_TIMER` … `ATTESTATION_CAN_CHANGE_GLOBAL_KILL` | **NO** |
| `ATTESTATION_CAN_SATISFY_OPERATOR_GATE` | **NO** |
| Metric labels | fingerprint, state, contract_version only |

## Remote reachability

| Field | Value |
|-------|--------|
| `RC_BRANCH_PUSHED` | **YES** |
| `RC_REMOTE_SHA_MATCHES_LOCAL_SHA` | **YES** (`9d286e58ac7a4b5b6900b48c64b92fdb21afa6f4`) |
| `RC_REMOTE_COMMIT_REACHABLE` | **YES** |

## Immutability

`RC_IMMUTABILITY_POLICY=NEW_SHA_REQUIRED_FOR_ANY_CHANGE` — no amend / no force-push replacement under same RC identity.

## Future deploy acceptance (not executed)

After separate human authorization, per replica authenticated metrics @ `127.0.0.1:3001` / `:3002`:

- `state="PRESTATE"`
- `fingerprint="b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d"`

Rollback code authority: `ee9588548845c8077aa0cba0684b06eac7c9d4d2` / `20261002014651_v4994` — **no** DB down-migration, env restore, or GLOBAL change required for this four-file delta.

## Production gate

```
PRODUCTION_MUTATION_OCCURRED=NO
DEPLOY_OCCURRED=NO
MIGRATION_EXECUTED=NO
```

`RELEASE_CANDIDATE_READY_FOR_DEPLOY_AUTHORIZATION=YES` (subject to human review of this seal + exact SHA pin).
