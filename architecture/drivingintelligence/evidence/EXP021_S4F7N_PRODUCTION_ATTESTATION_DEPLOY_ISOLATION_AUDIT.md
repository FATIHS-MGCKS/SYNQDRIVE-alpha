# EXP-021 S4F-7N — Production attestation deploy isolation / delta audit

**Date (UTC):** 2026-10-03  
**Scope:** Read-only Production preflight + repository delta audit. **No** deploy, **no** Production mutation, **no** env/GLOBAL/S4 activation.

## Authority anchors

| Field | Value |
|-------|--------|
| `CURRENT_MAIN_SHA` | `c29179366bb3e0f7f4cd3284155fd4bdbb8ae310` |
| `S4F-7M` | PR #1892 @ `f0cd0ecdee8211227973beebd9b2c7ea428735e5` (squash merge on main) |
| `EXPECTED_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `EXPECTED_PRODUCTION_RELEASE_ID` | `20261002014651_v4994` |

## 1 — Live Production prestate (read-only)

**Method:** SSH `synqdrive-admin@srv1374778.hstgr.cloud` (BatchMode). **No writes.**

| Check | Observed |
|-------|----------|
| `CURRENT_PRODUCTION_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `CURRENT_PRODUCTION_RELEASE_ID` | `20261002014651_v4994` |
| `PRODUCTION_SHA_MATCH` | **YES** |
| `PRODUCTION_RELEASE_MATCH` | **YES** |
| S4 enable flags (`backend.env`) | All **MISSING** → effective OFF |
| `NOT_BEFORE` / org / vehicle allowlists | **MISSING** |
| `GLOBAL_ROW_COUNT` | 1 |
| `GLOBAL_KILL_STATE` | KILLED |
| `EFFECTIVE_KILL_STATE` | KILLED |
| `S4_PIPELINE_REGISTRY_ROWS` | 0 |
| `S4_WORK_ITEM_ROWS` | 0 |
| `S4_ACTIVE_WORK_ITEM_ROWS` | 0 |
| `S4_EVIDENCE_SNAPSHOT_ROWS` | 0 |
| `S4_SHADOW_RUN_ROWS` / `S4_SHADOW_INTERVAL_ROWS` | **Not queryable** — relations `di_v0_s4_shadow_runs` / `di_v0_s4_shadow_intervals` **do not exist** on current Production schema (pre-migration / never deployed). Treat as **zero shadow persistence**, not as a failed guard. |

`ALL_S4_ENABLE_FLAGS_FALSE=YES`  
`PRODUCTION_TARGET_STAGING_KEYS_STATE=MISSING`

## 2 — Production → main delta

```
BASE=ee9588548845c8077aa0cba0684b06eac7c9d4d2
HEAD=c29179366bb3e0f7f4cd3284155fd4bdbb8ae310
PRODUCTION_TO_MAIN_COMMIT_COUNT=16
PRODUCTION_TO_MAIN_CHANGED_FILE_COUNT=114
```

### Per-commit inventory (newest first)

| SHA | PR | Workstream | Primary class | Production runtime impact | Migration impact | Env/config impact | Required for S4F-7M attestation |
|-----|-----|------------|---------------|-------------------------|------------------|-------------------|--------------------------------|
| `c29179366` | #1892 | DI / S4F-7M | RUNTIME_CODE + OPS + DOCS | **Yes** — attestation service + metrics; ops wrapper metrics proof | None | None in `backend.env` | **Yes** (attestation runtime) |
| `253dce5ce` | #1889 | Battery V2 HV-H4 | RUNTIME_CODE | **Yes** — retention gate + `battery-v2-retention.service` | None (uses A3.1 tables) | None | No |
| `e2229c402` | #1891 | DI evidence | DOCS_ONLY | No | No | No | No |
| `cb4136e90` | #1890 | DI / S4F-7K | OPS_ONLY | No (scripts only) | No | No | No (ops tooling) |
| `040170104` | #1888 | DI / S4F-7J | OPS_ONLY + TEST | No (scripts); dormant-audit spec update | No | No | No (ops; test allowlist for s4-runtime) |
| `b4c46adde` | #1887 | Battery V2 HV-H4 | RUNTIME_CODE | **Yes** — durable loader / throughput paths | None | None | No |
| `b184db7ed` | #1886 | DI evidence | DOCS_ONLY | No | No | No | No |
| `dcd5314b2` | #1885 | DI evidence | DOCS_ONLY | No | No | No | No |
| `064f2ef27` | #1881 | Battery V2 HV-H4 | RUNTIME_CODE | **Yes** — evidence writer service/repo | None | None | No |
| `484c4260f` | #1884 | DI evidence | DOCS_ONLY | No | No | No | No |
| `0b0eac19d` | #1882 | DI / S4F-7F | OPS_ONLY | No (kill-init scripts) | No | No | No |
| `24a472829` | #1880 | DI evidence | DOCS_ONLY | No | No | No | No |
| `d4a08b241` | #1874 | Vehicle Onboarding VO-5A | RUNTIME_CODE + WORKER | **Yes** — offboarding services; DIMO/HM link behavior; **dimo-snapshot** scheduler/processor | No | None | No |
| `41e0330c3` | #1876 | Battery V2 HV-H4 | MIGRATION + SCHEMA + RUNTIME | **Yes** — Prisma models + HV-H4 evidence mirror code | **Yes** — `20261002120000_battery_hv_h4_charge_session_evidence_revisions` | None | No |
| `f25336d2f` | #1879 | DI evidence | DOCS_ONLY | No | No | No | No |
| `b7d77643c` | #1877 | DI / S4F-7B | OPS_ONLY + DOCS | No (read-only preflight script) | No | No | No |

**Commit classification counts (primary label per commit):**

| Class | Count |
|-------|------:|
| DOCS_ONLY | 6 |
| OPS_ONLY | 4 |
| TEST_ONLY | 0 |
| RUNTIME_CODE | 5 |
| SCHEMA | 1 |
| MIGRATION | 1 |
| WORKER_OR_SCHEDULER | 1 (`d4a08b241`) |
| UNKNOWN | 0 |

## 3 — Migration audit

| Field | Value |
|-------|--------|
| `MIGRATION_COUNT_IN_DELTA` | **1** |
| Migration | `backend/prisma/migrations/20261002120000_battery_hv_h4_charge_session_evidence_revisions/migration.sql` |
| `ATTESTATION_REQUIRES_ANY_MIGRATION` | **NO** |
| `CANONICAL_DEPLOY_RUNS_PRISMA_MIGRATE_DEPLOY` | **YES** (`backend/scripts/ops/vps-deploy-release.sh` → `npm run prisma:migrate:deploy`) |
| `CURRENT_MAIN_DEPLOY_WOULD_RUN_MIGRATIONS` | **YES** (would apply Battery HV-H4 A3.1 migration if pending) |

Attestation code does not reference new Prisma models.

## 4 — Runtime delta (non-attestation)

| Metric | Count / note |
|--------|----------------|
| `UNRELATED_RUNTIME_CHANGE_COUNT` | **40** non-test `backend/src` files (excludes S4F-7M attestation + `di-v0-s4-runtime.module.ts` delta) |
| `UNRELATED_WORKER_SCHEDULER_CHANGE_COUNT` | **5** (`dimo-snapshot.processor.ts`, registry/trip-start specs, `dimo-snapshot.scheduler.ts` + spec) |
| `UNRELATED_SCHEMA_CHANGE_COUNT` | **1** (`schema.prisma` delta) |
| `UNRELATED_MIGRATION_COUNT` | **1** |

**Explicit areas in delta:**

- **Battery V2 HV-H4:** A3.1 schema/mirror, A3.2 writer, A3.3 durable loader, A3.4 retention ACK gate + `battery-v2-retention.service`
- **Vehicle Onboarding VO-5A:** offboarding services, contracts, DIMO/HM link services
- **DIMO snapshot worker/scheduler:** lifecycle/trip-start isolation changes (VO-5A commit)
- **S4F ops:** Tiny staging wrapper, global kill init scripts, metrics fetch CLI (not Nest runtime)
- **S4F-7M attestation:** 4 deployed runtime files (see §5)

## 5 — Minimal S4F-7M runtime dependency graph

**Production base** already includes `DiV0S4RuntimeModule`, global `ObservabilityModule` / `TripMetricsService`, and `s4a-foundation` control-plane parsers used by attestation.

| Field | Value |
|-------|--------|
| `MINIMAL_ATTESTATION_RUNTIME_FILE_COUNT` | **4** |
| `MINIMAL_ATTESTATION_RUNTIME_FILES` | `di-v0-s4-runtime-config-attestation.ts`, `di-v0-s4-runtime-config-attestation.metrics.ts`, `di-v0-s4-runtime-config-attestation.service.ts`, `di-v0-s4-runtime.module.ts` (provider registration) |
| `PRODUCTION_BASE_HAS_ALL_REQUIRED_DEPENDENCIES` | **YES** |
| `MISSING_DEPENDENCY_COUNT` | **0** |
| `MISSING_DEPENDENCIES` | *(none)* |

`di-v0-s4-runtime-config-attestation-metric-parse.ts` is **ops/test parser only** — not required inside the running Nest process.

### Isolated worktree proof (`/tmp/s4f7n-minimal-attest`)

- Base: `ee9588548845c8077aa0cba0684b06eac7c9d4d2`
- Applied: **only** the four runtime files above from `c29179366`
- `npm ci` + `npx prisma generate` + `npm run build` → **PASS** (no Battery/Prisma client errors on Production-era schema)
- `npm run test:di:s4f7m:runtime-attestation` → integration **3/3 PASS**; full suite needs S4F-7J/7F **ops** libs from main for wrapper cases (not part of minimal **deployed** runtime)
- `npm run test:di:s4f` → **PASS** on Production base + attestation
- `npm run test:di:s4a` → **1 fail** (`di-v0-s4a-dormant-audit` allowlist from S4F-7J commit not in minimal patch); attestation import of `s4a-foundation` is expected

| Field | Value |
|-------|--------|
| `MINIMAL_RELEASE_TECHNICALLY_VIABLE` | **YES** |
| `MINIMAL_RELEASE_BASE_SHA` | `ee9588548845c8077aa0cba0684b06eac7c9d4d2` |
| `MINIMAL_RELEASE_MIGRATION_COUNT` | **0** |
| `MINIMAL_RELEASE_SCHEMA_CHANGE_COUNT` | **0** |
| `MINIMAL_RELEASE_UNRELATED_RUNTIME_FILE_COUNT` | **0** |
| `MINIMAL_RELEASE_BUILD` | **PASS** |
| `MINIMAL_RELEASE_ATTESTATION_TESTS` | **INTEGRATION_PASS** (3/3); full 36-case suite requires ops checkout from main for lib imports |
| `MINIMAL_RELEASE_S4A_TESTS` | **PARTIAL** (114/115; dormant-audit allowlist from separate commit) |
| `MINIMAL_RELEASE_S4F_TESTS` | **PASS** |
| `MINIMAL_RELEASE_DORMANCY_AUDIT` | Attestation service: no timer/DB/Redis/provider (see §10); S4A dormant audit on minimal tree needs 7J test allowlist if run verbatim on main |

## 6 — Ops tooling vs deployed runtime

| File | Classification |
|------|----------------|
| `di-v0-s4-stage-tiny-production.sh` | **Remote execution tool only** |
| `di-v0-s4-tiny-staging-production-cli.ts` | **Remote execution tool only** |
| `di-v0-s4-tiny-staging-production.lib.ts` | **Remote execution tool only** |
| `di-v0-s4-tiny-staging-production.lib.sh` | **Remote execution tool only** |
| `di-v0-s4f-global-budget-rollout-cli.ts` | **Remote execution tool only** (`fetch-metrics-body` for attestation proof) |

| Field | Value |
|-------|--------|
| `OPS_TOOLING_REQUIRED_IN_DEPLOYED_RUNTIME` | **NO** |
| `OPS_TOOLING_CAN_RUN_FROM_TEMP_CHECKOUT` | **YES** (immutable checkout @ deploy SHA + bearer to `127.0.0.1:3001/3002`) |

## 7 — Strategy evaluation

### Strategy A — Deploy current main `c29179366…`

| Question | Answer |
|----------|--------|
| Unrelated runtime shipped? | **YES** (Battery HV-H4, VO-5A, DIMO snapshot worker, retention) |
| Migration executed? | **YES** (canonical deploy runs `prisma migrate deploy`) |
| Worker/scheduler behavior changed? | **YES** (dimo-snapshot) |
| Schema changed? | **YES** |
| Attestation-only? | **NO** |
| Migration-free? | **NO** |
| Unrelated-runtime-free? | **NO** |

### Strategy B — Minimal attestation release `ee958854…` + 4-file S4F-7M runtime delta

| Question | Answer |
|----------|--------|
| Unrelated runtime | **NO** (worktree proof) |
| Migration | **NO** |
| Attestation-only deploy intent | **YES** (subject to human authorization + exact SHA pin) |
| Buildable | **YES** (local proof) |

### Strategy C — Other governed mechanism

No existing Production mechanism found that deploys a partial tree without a normal `vps-deploy-release.sh` full-release swap. **Exact-SHA dormant deploy** (S4F-7C/D) still deploys **entire** release artifact at pinned SHA — it does not solve unrelated delta unless the **pinned SHA** is itself minimal.

## 8 — Decision

```
RECOMMENDED_DEPLOY_STRATEGY=MINIMAL_ATTESTATION_RELEASE
RECOMMENDED_DEPLOY_TARGET_SHA=<new branch/release: ee958854 + S4F-7M runtime only; not yet built as Production release>
RECOMMENDED_DEPLOY_REQUIRES_NEW_HUMAN_AUTHORIZATION=YES
```

**Do not** deploy current main for attestation-only intent.

## 9 — Attestation dormancy (code authority)

From `DiV0S4RuntimeConfigAttestationService` + pure attestation module (main / minimal tree):

| Invariant | Value |
|-----------|--------|
| S4 flags default / missing | OFF |
| `ATTESTATION_HAS_TIMER` | NO |
| `ATTESTATION_HAS_DB_ACCESS` | NO |
| `ATTESTATION_HAS_REDIS_ACCESS` | NO |
| `ATTESTATION_HAS_PROVIDER_ACCESS` | NO |
| `ATTESTATION_CAN_CREATE_S4_WORK` | NO |
| `ATTESTATION_CAN_CHANGE_GLOBAL_KILL` | NO |

Deploying attestation alone does **not** enable S4 execution paths.

## 10 — Future post-deploy acceptance (do not execute here)

Per replica, authenticated `GET /api/v1/metrics` on loopback:

| Replica | Port | Expected |
|---------|------|----------|
| A | 3001 | `state="PRESTATE"`, `fingerprint="b648908a5f74798f765b0631cd16d5c50a390222d36b63fb03f787367176750d"` |
| B | 3002 | same |

Use S4F-7J / S4F-7M ops parser; **no** staged values until a separately authorized staging task.

## 11 — Rollback (minimal attestation release)

| Field | Expected |
|-------|----------|
| `ROLLBACK_REQUIRES_DB_DOWN_MIGRATION` | **NO** |
| `ROLLBACK_REQUIRES_ENV_RESTORE` | **NO** (no env change for attestation deploy) |
| `ROLLBACK_REQUIRES_GLOBAL_KILL_CHANGE` | **NO** |

Rollback authority: redeploy prior release `20261002014651_v4994` @ `ee9588548845c8077aa0cba0684b06eac7c9d4d2` via existing VPS release swap.

## 12 — Production mutation gate

```
PRODUCTION_MUTATION_OCCURRED=NO
PRODUCTION_ENV_MUTATION_OCCURRED=NO
PRODUCTION_DB_WRITE_OCCURRED=NO
PRODUCTION_RESTART_OCCURRED=NO
DEPLOY_OCCURRED=NO
MIGRATION_EXECUTED=NO
```
