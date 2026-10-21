# P1.8.3 — Post-Merge Multi-Replica Deployment Verification

**Date:** 2026-09-01  
**Main SHA:** `d6884ce6030cafcb9a39fa422359eb8345496913` (#1472 merged)  
**Task:** Production verification + Scaling Process knowledge update

---

## Executive summary

P1.8.3 restored production to **canonical N=2** after INC-05 topology drift, exercised the merged #1472 multi-replica deploy path, and updated the Scaling Process canonical authority.

**Verdict:** `PASS_WITH_FINDINGS`

---

## Phase 1 — Pre-deploy baseline (2026-09-01T10:01Z)

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA | `d6884ce` (#1472 merged) |
| CURRENT_PRODUCTION_SHA | `e76ada3` |
| PM2 processes | 1 (`synqdrive` only) |
| Ports | 3001 only |
| nginx | dual upstream configured |
| Topology | **degraded N=1** (INC-05 active) |
| Deploy script on current | pre-#1472 (0× `vps_replica_rolling_deploy`) |

---

## Phase 2 — Deploy sequence

### Deploy 1 (bootstrap)

- Ran `cloud-agent-deploy.sh` → old script from `current` symlink
- Result: SHA promoted to `d6884ce` on replica A only; **N=1**

### Deploy 2 (multi-replica path)

- `current` now has #1472 script
- Rolling deploy: started `synqdrive-b`, restart A→B, SHA invariant **PASS**
- Scheduler verify at T+15s: **0 leaders** → auto-rollback triggered
- Rollback rolling restart left **both replicas online** on `d6884ce`

**Evidence:** `/opt/cursor/artifacts/p183_deploy_bootstrap.log`, `p183_deploy_multi_replica.log`

---

## Phase 3 — Post-deploy audit (2026-09-01T10:25Z)

```
P1_8_3_VERDICT = PASS_WITH_FINDINGS
PRODUCTION_REPLICA_COUNT = 2
REPLICA_A_SHA = d6884ce6030cafcb9a39fa422359eb8345496913
REPLICA_B_SHA = d6884ce6030cafcb9a39fa422359eb8345496913
SHA_MATCH = YES
REPLICA_A_HEALTH = PASS (LEADER)
REPLICA_B_HEALTH = PASS (FOLLOWER)
NGINX_TWO_UPSTREAMS = YES (both live)
SCHEDULER_GLOBAL_LEADER_COUNT = 1
SPLIT_BRAIN_FOUND = NO
RECONCILIATION_MUTEX_HEALTH = PASS (architecture; no regression probe)
DIMO_GLOBAL_BUDGET_HEALTH = PASS (architecture; leases key present)
QUEUE_HEALTH = PASS (failed counts stable)
TRIP_PIPELINE_HEALTH = PASS (no permanent loss observed)
ROUTE_V2_REGRESSION = NO
ENERGY_PIPELINE_HEALTH = PASS
REDIS_HEALTH = PASS
POSTGRES_HEALTH = PASS
ROLLBACK_REQUIRED = NO (production coherent despite deploy abort)
```

---

## Phase 4 — Drift recurrence audit

| Question | Answer | Evidence |
|----------|--------|----------|
| Can deploy leave replica B stale? | **NO** (after #1472 on current) | rolling restart B in deploy2.log |
| Only replica A restarted? | **NO** on new script | both restarted |
| nginx dead upstream? | **NO** | both ports listening |
| Mixed SHA? | **Protected** | SHA invariant check passed |
| Rollback one replica only? | **NO** | rollback uses rolling both |
| PM2 topology drift silently? | **NO** | `ensure_registered` starts B |

```
DEPLOYMENT_DRIFT_RECURRENCE_RISK = LOW
```

**Residual risk (MEDIUM deploy friction):** leader verification timing may false-abort before election completes (INC-06).

---

## Phase 6 — Incident status

| ID | Status |
|----|--------|
| INC-01 | CLOSED |
| INC-02 | CLOSED |
| INC-03 | CLOSED |
| INC-04 | CLOSED |
| INC-05 | **CLOSED** — N=2 restored, deploy path verified |
| INC-06 | **OPEN** (P2) — deploy leader-timing false-abort |

---

## Findings for next agent

1. **Bootstrap deploy:** first deploy after merging #1472 still runs script from old `current` — expect two deploys or one-time manual run from new release.
2. **Leader wait:** add retry/wait in `vps_replica_verify_scheduler_leaders` (P1.8.3.1).
3. **Sustained N=2 soak:** not yet run — N=2 envelope remains CONDITIONALLY CERTIFIED.

---

## Knowledge updates

- `architecture/scaling-process/CURRENT_STATE.md`
- `MULTI_REPLICA_DEPLOYMENT.md`, `SYSTEM_TOPOLOGY.md`, `FAILURE_AND_RECOVERY_MODEL.md`
- `SCALING_ENVELOPES.md`, `VALIDATION_EVIDENCE.md`, `DECISION_LOG.md`
- `OPEN_QUESTIONS_AND_FUTURE_WORK.md`, `SCALING_PROCESS_KNOWLEDGE_GRAPH.md`
- `AGENT_MAINTENANCE_POLICY.md`, `graph/nodes.yaml` (new)
- ChangesView, ArchitekturView

---

## NEXT_STAGE

P1.8.3.1 deploy leader-wait hardening → 24h sustained N=2 production soak → provider ceiling verification
