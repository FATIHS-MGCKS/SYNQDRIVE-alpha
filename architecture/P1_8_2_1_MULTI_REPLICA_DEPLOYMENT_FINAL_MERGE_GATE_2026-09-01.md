# P1.8.2.1 — Multi-Replica Deploy Final Merge Gate

**Date:** 2026-09-01  
**PR:** #1472 — `feat(ops): P1.8.2.1 multi-replica production deploy lifecycle hardening`  
**Task:** Rebase / conflict resolution / merge gate (no production mutations)

---

## Phase 0 — Authority baseline

```
CURRENT_MAIN_HEAD = 4843a4ebc60f38237f9184d47b1da731e426b7b3
PR_1472_HEAD_BEFORE = b81db4c44169b31ee3f941ff0d1f996b6f51eb0a
PR_1472_BASE = main (at branch creation)
COMMITS_BEHIND_MAIN = 10
MERGEABLE_BEFORE = CONFLICTING
MERGEABLE_STATE_BEFORE = DIRTY
```

**Authority read:** `architecture/scaling-process/` (merged via #1481), `architecture/P1_8_2_1_MULTI_REPLICA_DEPLOYMENT_LIFECYCLE_HARDENING_2026-08-31.md`

**Related merged PRs:** #1469 (soak), #1470 (remediation), #1471 (scale-to-2), #1481 (scaling knowledge graph)

---

## Phase 1 — Rebase strategy

**Strategy:** `git merge origin/main` into `cursor/p1-8-2-1-multi-replica-deploy-83be` (preserves PR history; no force-push rewrite).

```
CONFLICT_COUNT = 2
CONFLICTED_FILES = frontend/src/master/components/ChangesView.tsx, frontend/src/master/components/ArchitekturView.tsx
```

No conflicts in deploy scripts, ops libs, or tests.

---

## Phase 2 — Conflict resolution

```
CONFLICT_RESOLUTION_VERDICT = SUCCESS
```

| File | Resolution |
|------|------------|
| `ChangesView.tsx` | Preserved **both** P1.8.2.1 entry (first) and #1481 scaling-process bootstrap + all main entries (fuel station, dimo 3a, etc.) |
| `ArchitekturView.tsx` | Preserved **both** P1.8.2.1 deploy lifecycle entry (first) and Scaling Process canonical authority entry |

**Invariants preserved:** All 15 P1.8.2.1 deployment invariants unchanged in ops code. No trip/route/energy/DIMO/scheduler/mutex code touched.

---

## Phase 3 — Deploy implementation audit

**Canonical deploy path:** `vps-deploy-release.sh` → `vps-production-replica.lib.sh` → rolling A→B with post-deploy verification.

| Path | Classification |
|------|----------------|
| `vps-deploy-release.sh` (rolling multi-replica) | **CANONICAL** (after #1472 merge) |
| `vps-rollback-production-release.sh` | **CANONICAL** |
| `pm2.production-ecosystem.config.cjs` | **CANONICAL** |
| `lib/vps-production-replica.lib.sh` | **CANONICAL** |
| `vps-multi-replica-deploy.util.mjs` | **CANONICAL** (verification helpers) |
| `docs/runbooks/*` `pm2 restart synqdrive` | **LEGACY / DOC_ONLY** (manual operator runbooks; not canonical deploy) |
| `cloud-agent-deploy.sh` → `vps-deploy-release.sh` | **CANONICAL** (inherits rolling deploy after merge) |

**Single-replica drift risk on main (pre-merge):** `vps-deploy-release.sh` on `origin/main` still uses `pm2 restart synqdrive` only — **DANGEROUS_DUPLICATE** relative to #1472 branch. This is the documented INC-05 root cause.

```
SINGLE_REPLICA_DEPLOY_PATH_REINTRODUCED = NO (in #1472 branch)
```

---

## Phase 4 — Local validation

| Command | Result |
|---------|--------|
| `node --test backend/scripts/ops/vps-multi-replica-deploy.util.test.mjs` | **7/7 PASS** |
| `bash backend/scripts/ops/vps-multi-replica-deploy.selftest.sh` | **PASS** |
| `bash -n` on all modified `.sh` files | **PASS** |
| `npm run build` (backend, after `prisma generate`) | **PASS** |
| `npx tsc --noEmit` (frontend) | **PASS** |
| Jest: scheduler-leader, reconciliation-mutex, dimo-budget, staging-multi-replica gate | **56/56 PASS** |
| Merge marker search (`<<<<<<<`) in source | **0 hits** |

```
LOCAL_TEST_STATUS = PASS
```

---

## Phase 5 — Regression audit

```
SCHEDULER_LEADER_REGRESSION = NO
DIMO_GLOBAL_BUDGET_REGRESSION = NO
RECONCILIATION_MUTEX_REGRESSION = NO
BULLMQ_WORKER_MODEL_REGRESSION = NO
TRIP_PIPELINE_REGRESSION = NO
ROUTE_V2_REGRESSION = NO
ENERGY_PIPELINE_REGRESSION = NO
SINGLE_REPLICA_DEPLOY_PATH_REINTRODUCED = NO
MIXED_SHA_PROTECTION_PRESENT = YES
```

**Deploy capability matrix (branch after rebase):**

```
CANONICAL_REPLICA_COUNT = 2
REPLICA_A_PORT = 3001
REPLICA_B_PORT = 3002
ROLLING_DEPLOY_SUPPORTED = YES
MIXED_SHA_PROTECTION = YES
PER_REPLICA_HEALTH_VERIFICATION = YES
PER_REPLICA_SHA_VERIFICATION = YES
NGINX_DUAL_UPSTREAM_VERIFICATION = YES
SCHEDULER_SINGLE_LEADER_VERIFICATION = YES
MULTI_REPLICA_ROLLBACK_SUPPORTED = YES
```

---

## Phase 6 — GitHub CI

```
FINAL_PR_HEAD = 5dd40076ce9658d7a4588b167e2cfffda9432c81
GITHUB_CHECKS_TOTAL = 25 (across 2 workflow runs)
GITHUB_CHECKS_SUCCESS = 25
GITHUB_CHECKS_FAILED = 0
GITHUB_CHECKS_PENDING = 0
GITHUB_CI_STATUS = ALL_PASS (including CI gate)
```

---

## Phase 7 — Mergeability

```
MERGEABLE = YES
MERGEABLE_STATE = CLEAN
PR_DRAFT_STATUS = false (ready for review)
PR_READY_FOR_REVIEW = YES
```

---

## Phase 8 — Knowledge graph updates

| File | Updated | Reason |
|------|---------|--------|
| `architecture/scaling-process/CURRENT_STATE.md` | YES | Main SHA, #1472 rebase status |
| `architecture/scaling-process/MULTI_REPLICA_DEPLOYMENT.md` | YES | PR #1472 rebase pending merge |
| `architecture/scaling-process/VALIDATION_EVIDENCE.md` | YES | Merge gate local test evidence |
| `architecture/scaling-process/DECISION_LOG.md` | NO | No new architectural decisions |
| `architecture/scaling-process/FAILURE_AND_RECOVERY_MODEL.md` | NO | INC-05 unchanged until production restore |
| `architecture/scaling-process/OPEN_QUESTIONS_AND_FUTURE_WORK.md` | NO | Blockers unchanged |

```
KNOWLEDGE_GRAPH_UPDATED = PARTIAL (CURRENT_STATE, MULTI_REPLICA_DEPLOYMENT, VALIDATION_EVIDENCE)
CHANGES_VIEW_UPDATED = YES (conflict resolution — both P1.8.2.1 + scaling bootstrap entries)
ARCHITECTURE_VIEW_UPDATED = YES (conflict resolution — both entries)
```

---

## Production safety

```
PRODUCTION_MUTATIONS = NONE
DEPLOY_EXECUTED = NO
SCALE_TO_2_EXECUTED = NO
```

---

## Merge recommendation

```
MERGE_RECOMMENDATION = APPROVE_FOR_HUMAN_MERGE
```

**Conditions:**
1. CI green on final PR HEAD
2. Human merge only — do not auto-merge
3. First production deploy after merge must restore N=2 and verify post-deploy invariants

```
BLOCKERS = (none if CI passes)
NEXT_STAGE = merge #1472 → controlled production deploy using new canonical lifecycle → verify N=2 → P1.8.3 retrospective audit
```
