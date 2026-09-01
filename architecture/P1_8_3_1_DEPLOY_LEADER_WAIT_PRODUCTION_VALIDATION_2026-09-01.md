# P1.8.3.1 — Deploy Leader-Wait Production Validation

**DATE:** 2026-09-01  
**VERDICT:** PASS (after bootstrap remediation)  
**INC-06:** CLOSED

---

## Executive summary

First authoritative production validation of P1.8.3.1 scheduler leader-convergence gate. **Attempt 3** deployed `3772d992d` successfully with bounded convergence: **6× `leaderCount=0` → 2× `leaderCount=1` → PASS** in **14s**. No false abort, no split brain.

Attempts 1–2 failed due to **OQ-18 bootstrap**: deploy entrypoint and sourced libs came from stale `current` (`d6884ce`) without P1.8.3.1. Remediated by sourcing libs from `RELEASE_DIR` (commit `3772d992d`) and invoking deploy from a release that contained the fix.

---

## Phase 0 — Pre-deploy baseline

| Field | Value |
|-------|-------|
| PRE_DEPLOY_BASELINE | PASS |
| CURRENT_MAIN_SHA | `814a7e009` → `3772d992d` (after sourcing fix) |
| CURRENT_PRODUCTION_SHA | `d6884ce6030cafcb9a39fa422359eb8345496913` |
| PRODUCTION_REPLICA_COUNT | 2 |
| REPLICA_A | synqdrive @ 3001 LEADER |
| REPLICA_B | synqdrive-b @ 3002 FOLLOWER |
| NGINX_TWO_UPSTREAMS | YES |
| SCHEDULER_LEADER_COUNT | 1 |
| INC_06_FIX_PRESENT_IN_MAIN | YES (#1487 @ 814a7e009) |
| INC_06_FIX_PRESENT_IN_DEPLOY_SCRIPT | NO (current was d6884ce) |

**Queue baseline:** battery.v2 failed=64 (unchanged pre/post); trip/reconciliation/route/energy failed=0.

---

## Phase 1 — Implementation verification (main @ 3772d992d)

| Check | Result |
|-------|--------|
| BLIND_FIXED_SLEEP_USED | NO |
| LEADER_ZERO_TRANSIENT | YES |
| LEADER_GT_ONE_IMMEDIATE_FAILURE | YES |
| STABLE_OBSERVATIONS_REQUIRED | 2 |
| CONVERGENCE_TIMEOUT_BOUNDED | YES (44000ms) |
| POLL_INTERVAL | 2000ms |

---

## Phase 2–3 — Deploy attempts and INC-06 proof

### Attempt 1 (11:25Z) — FAILED / ROLLBACK

- Entry: `cloud-agent-deploy.sh` → `current` deploy script (`d6884ce`)
- New release `814a7e009` built; convergence gate **not executed** (old lib sourced)
- `leaders=0` at T+1s after B healthy → immediate ABORT (INC-06 recurrence)
- Rollback to `d6884ce`; production N=2 healthy

### Attempt 2 (11:33Z) — FAILED / ROLLBACK

- Same bootstrap issue despite `3772d992d` sourcing fix on main — **entry script still from `current` (`d6884ce`)**
- Rollback; rollback verify also hit transient `leaders=0` (old lib, no wait)

### Attempt 3 (11:41Z) — **PASS**

- Entry: release `20260901113355_v4994` deploy script (`3772d992d` with RELEASE_OPS_DIR fix)
- Deployed release: `20260901114113_v4994` (`3772d992d`)

| Timestamp (UTC) | Event |
|-----------------|-------|
| 11:46:52 | Boot check complete |
| 11:46:54 | Replica A restart |
| 11:47:00 | Replica A ready |
| 11:47:00 | Replica B restart |
| 11:47:08 | Replica B ready |
| 11:47:09 | SHA invariant OK; **convergence gate START** |
| 11:47:09–11:47:21 | 6× `FOLLOWER/FOLLOWER leaders=0` (WAIT) |
| 11:47:21 | First `leaderCount=1` (B=LEADER) |
| 11:47:23 | Second stable `leaderCount=1` → **CONVERGED** |
| 11:47:23 | Final verify `leaders=1`; external health PASS |

**Convergence trace (from deploy log):**

```
attempt 1-6: leaderCount=0 TRANSIENT_ZERO WAIT
attempt 7:   leaderCount=1 CANDIDATE WAIT (stable=1)
attempt 8:   leaderCount=1 CANDIDATE PASS (stable=2)
```

| Metric | Value |
|--------|-------|
| LEADER_ZERO_OBSERVED | YES (6 polls) |
| LEADER_ZERO_FALSE_ABORT_OCCURRED | NO (attempt 3) |
| LEADER_CONVERGED | YES |
| LEADER_CONVERGENCE_MS | ~14000 |
| MAX_LEADER_COUNT_OBSERVED | 1 |
| SPLIT_BRAIN_FOUND | NO |
| CONVERGENCE_TIMEOUT_HIT | NO |
| STABLE_ONE_OBSERVATIONS | 2 |

---

## Phase 4 — Multi-replica invariants (post-deploy 11:47:59Z)

| Check | Result |
|-------|--------|
| PRODUCTION_REPLICA_COUNT | 2 |
| REPLICA_A_SHA | 3772d992d |
| REPLICA_B_SHA | 3772d992d |
| SHA_MATCH | YES |
| NGINX_TWO_UPSTREAMS | YES |
| NGINX_CONFIG_TEST | PASS |
| NGINX_UPSTREAMS_LIVE | 3001=200, 3002=200 |
| EXTERNAL_HEALTH | PASS |
| SCHEDULER_GLOBAL_LEADER_COUNT | 1 (A=FOLLOWER, B=LEADER) |
| UNEXPECTED_PM2_RESTARTS | 0 (during verify window) |

---

## Phase 5–7 — Coordination and pipelines

| Check | Result |
|-------|--------|
| DIMO_GLOBAL_BUDGET_HEALTH | PASS (no breach signal; shared Redis DB 0) |
| DIMO_LIMIT_BREACHES | 0 |
| RECONCILIATION_MUTEX_HEALTH | PASS (no double-execution signal) |
| QUEUE_HEALTH | PASS |
| battery.v2 failed | 64 (unchanged) |
| TRIP_PIPELINE_HEALTH | PASS |
| ROUTE_V2_REGRESSION | NO |
| ENERGY_PIPELINE_HEALTH | NEUTRAL (no new events required) |

---

## Phase 8 — Rollback assessment

| Attempt | ROLLBACK_EXECUTED | Reason |
|---------|-------------------|--------|
| 1 | YES | leaders=0 immediate abort (bootstrap) |
| 2 | YES | same |
| 3 | NO | PASS |

---

## Phase 9 — INC-06 decision

**INC_06_STATUS = CLOSED**

Production proved P1.8.3.1 convergence gate is active and correct when deploy sources libs from the promoted release. Historical P1.8.3 false-abort preserved in evidence.

**Residual:** OQ-18 — deploy entrypoint bootstrap (mitigated: `cloud-agent-deploy.sh` updated to clone main entry script; production `current` now at `3772d992d`).

---

## Evidence files

- `/opt/cursor/artifacts/p1831_production_deploy.log` (attempt 1)
- `/opt/cursor/artifacts/p1831_production_deploy_attempt2.log` (attempt 2)
- `/opt/cursor/artifacts/p1831_production_deploy_attempt3.log` (attempt 3 — PASS)
