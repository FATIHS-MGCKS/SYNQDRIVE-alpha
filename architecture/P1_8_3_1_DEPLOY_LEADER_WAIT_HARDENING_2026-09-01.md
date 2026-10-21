# P1.8.3.1 — Deploy Leader-Wait / Convergence Hardening

**DATE:** 2026-09-01  
**WORKSTREAM:** Scaling Process  
**INCIDENT:** INC-06  
**STATUS:** IMPLEMENTED (pending production validation)

---

## Executive summary

P1.8.3 production verification discovered **INC-06**: the multi-replica deploy lifecycle performed a **single snapshot** scheduler leader check immediately after rolling restart. At ~T+15s after restart, `leaderCount=0` caused a **false abort** and auto-rollback. Production converged correctly to `leaderCount=1` by ~T+35s.

P1.8.3.1 adds a **bounded, observable convergence gate** between replica health verification and the final scheduler invariant check. The gate treats `leaderCount=0` as a transient convergence state (retry within timeout), `leaderCount=1` as candidate success (requires stable consecutive observations), and `leaderCount>1` as immediate **FAIL_SPLIT_BRAIN**.

**No blind fixed sleep.** **No production mutation in this task.**

---

## Phase 0 — INC-06 audit (root cause)

### Observation (P1.8.3)

| Timestamp | Event |
|-----------|-------|
| T+0 | Rolling restart completes; both replicas healthy |
| T+~15s | `vps_replica_verify_scheduler_leaders` → `leaders=0` → ABORT |
| T+~35s | Post-audit: A=LEADER, B=FOLLOWER, `leaderCount=1` |

### Causal chain

1. **Entry point:** `vps-deploy-release.sh` → `vps_replica_verify_post_deploy()`
2. **Pre-fix ordering:** SHA verify → **immediate** `vps_replica_verify_scheduler_leaders` → nginx → external health
3. **Implementation:** `vps_replica_verify_scheduler_leaders()` in `vps-production-replica.lib.sh` — single curl to readiness endpoints, no retry
4. **Scheduler election (P1.7):** `acquireIntervalMs=5000`, `renewIntervalMs=10000`, `leaseMs=30000` (Redis `synqdrive:scheduler:leader`)
5. **Why 0 is transiently safe:** After rolling restart both replicas start as FOLLOWER; acquire loop retries every 5s until one wins SET NX PX lease
6. **Why >1 is never safe to wait:** Split-brain would duplicate singleton scheduler producers — immediate hard failure preserves INV-01

### Scenarios where waiting on 0 could hide failure

| Scenario | Would timeout? | Notes |
|----------|----------------|-------|
| Redis down | YES (44s) | Both replicas stay FOLLOWER; readiness may still report healthy |
| Both replicas crash-looping | Partial | Health gate should catch before convergence |
| Permanent election bug | YES | Bounded timeout → FAIL_TIMEOUT |
| Split brain (2 leaders) | NO | Immediate FAIL_SPLIT_BRAIN — no wait |

**Conclusion:** Bounded wait on `leaderCount=0` is safe when combined with: (a) prior health/readiness gates, (b) immediate failure on `>1`, (c) deterministic timeout.

---

## Phase 1 — Convergence contract

### State machine

```
START → replica restarted → health/readiness PASS
  ↓
scheduler convergence gate (poll loop)
  ↓
leaderCount == 0  → WAIT / RETRY (reset stable counter)
leaderCount == 1  → increment stable counter; PASS if stable >= required
leaderCount > 1   → FAIL_SPLIT_BRAIN (immediate)
timeout           → FAIL_TIMEOUT
observe error     → FAIL_OBSERVE
```

### Parameters

| Parameter | Value | Env var | Rationale |
|-----------|-------|---------|-----------|
| Poll interval | 2000 ms | `SYNQDRIVE_SCHEDULER_LEADER_POLL_INTERVAL_MS` | Matches existing deploy health poll cadence |
| Stable observations | 2 | `SYNQDRIVE_SCHEDULER_LEADER_STABLE_OBSERVATIONS` | Two consecutive `leaderCount==1` before PASS; below 10s renew interval — catches 1→0 flicker (CASE F) |
| Timeout | 44000 ms | `SYNQDRIVE_SCHEDULER_LEADER_CONVERGENCE_TIMEOUT_MS` | `(2×replicaCount+2)×acquireInterval + 2×poll + margin` = 6×5000 + 4000 + 10000 |

**Why not single observation of 1?** Renew interval is 10s; a transient mis-read or brief lease gap could show 1 then 0. Two stable polls at 2s interval (4s window) is below renew cadence but sufficient to reject flicker.

**Why not blind sleep 35?** P1.8.3 convergence took ~35s in one observation; future deploys may converge faster. Polling with explicit diagnostics is observable and bounded.

### Formula

```
timeoutMs = (2 * replicaCount + 2) * acquireIntervalMs + 2 * pollIntervalMs + marginMs
          = (2 * 2 + 2) * 5000 + 2 * 2000 + 10000
          = 44000
```

---

## Phase 2 — Implementation

### Files changed

| File | Change |
|------|--------|
| `backend/scripts/ops/vps-multi-replica-deploy.util.mjs` | Convergence state machine, timeout formula, async poll driver |
| `backend/scripts/ops/vps-scheduler-leader-convergence-wait.mjs` | **NEW** CLI: polls readiness, invokes convergence gate |
| `backend/scripts/ops/lib/vps-production-replica.lib.sh` | `vps_replica_wait_scheduler_leader_convergence()`; post-deploy ordering |
| `backend/scripts/ops/vps-production-replica-topology.config.sh` | Env defaults for poll/timeout/stable |

### Deploy lifecycle (post-fix)

```
capture state
→ switch current
→ restart replica A → verify A health/SHA
→ restart replica B → verify B health/SHA
→ wait for scheduler convergence (bounded poll)
→ verify scheduler invariant (final snapshot)
→ verify nginx topology
→ verify external health
→ PASS
```

The final `vps_replica_verify_scheduler_leaders` remains as a defense-in-depth snapshot after convergence PASS.

---

## Phase 3 — Tests

**Suite:** `backend/scripts/ops/vps-multi-replica-deploy.util.test.mjs` — **18/18 PASS**

| Case | Sequence | Expected | Result |
|------|----------|----------|--------|
| A | 0 → 0 → 1 → 1 | PASS | PASS |
| B | 0 → 1 → 1 | PASS | PASS |
| C | 1 only | WAIT (needs 2nd stable) | PASS |
| D | 0 → 0 → 0 (timeout) | FAIL_TIMEOUT | PASS |
| E | 0 → 2 | FAIL_SPLIT_BRAIN | PASS |
| F | 1 → 0 → 1 → 1 | PASS (stability reset) | PASS |
| G | 1 → 2 | FAIL_SPLIT_BRAIN | PASS |
| H | observe failure | FAIL_OBSERVE | PASS |

Tests use injected observation sequences — no real wall-clock waiting.

---

## Phase 4 — Production safety

| Action | Status |
|--------|--------|
| Production deploy | **NOT EXECUTED** |
| PM2 restart | **NOT EXECUTED** |
| nginx / Redis / Postgres changes | **NONE** |

INC-06 status remains **IMPLEMENTED_PENDING_PRODUCTION_VALIDATION** until next production deploy exercises the gate.

---

## Agent continuity FAQ

| Question | Answer |
|----------|--------|
| Why tolerate zero leaders temporarily? | Post-restart both replicas are FOLLOWER until acquire loop wins Redis lease (~5s cadence) |
| Why NOT tolerate >1? | Split-brain duplicates singleton scheduler producers — INV-01 violation |
| How long can convergence take? | Up to 44s default; formula scales with replica count |
| What determines timeout? | `(2N+2)×acquireInterval + 2×poll + margin` |
| Why no fixed sleep? | Convergence time varies; polling is observable and fails fast on split-brain |
| Stable vs transient? | `requiredStableObservations=2` consecutive `leaderCount==1` polls |
| Election never converges? | FAIL_TIMEOUT after 44s → deploy abort + rollback |
| What evidence caused this? | P1.8.3 deploy log: false abort at leaders=0, healthy at T+35s |
| Which incident? | INC-06 |
| How to change safely? | Adjust env vars in `vps-production-replica-topology.config.sh`; update formula docs; re-run unit tests |

---

## Machine-readable verdict

```
P1_8_3_1_VERDICT = IMPLEMENTED_PENDING_PRODUCTION_VALIDATION
INC_06_ROOT_CAUSE_CONFIRMED = YES
LEADER_WAIT_IMPLEMENTED = YES
BLIND_FIXED_SLEEP_USED = NO
LEADER_ZERO_TREATED_AS_TRANSIENT = YES
LEADER_GT_ONE_IMMEDIATE_FAILURE = YES
CONVERGENCE_TIMEOUT = 44000ms
POLL_INTERVAL = 2000ms
STABLE_OBSERVATIONS_REQUIRED = 2
TEST_STATUS = PASS (18/18)
PRODUCTION_MUTATION_EXECUTED = NO
PRODUCTION_VALIDATION_STATUS = PENDING
INC_06_STATUS = IMPLEMENTED_PENDING_PRODUCTION_VALIDATION
```
