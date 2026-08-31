# P1.8.1 Pre-Scale Remediation — Orphan Process + Battery V2 Failed Backlog

**Date:** 2026-08-31  
**Production host:** srv1374778.hstgr.cloud  
**Deployed SHA (soak + remediation window):** `3874360e0`  
**Production replicas:** 1 (unchanged)  
**Scale-to-2 executed:** NO  

---

## Executive summary

P1.8.1 investigated two P2 findings from the P1.8 24h soak retrospective:

1. **Orphan validation Node** on port 3010 / Redis DB 15 — **resolved** (SIGTERM to PID 1664681); root cause is a **cleanup defect** in the two-replica process validation harness Phase C detached restart.
2. **`battery.v2` failed backlog (67 jobs)** — **misclassified in soak summary** as primarily LOCK_CONTENTION. Forensics show **43 legacy schema failures**, **18 REST pending-evaluation false-failures** (7 during soak), **2 lock contention** (pre-soak), **4 Prisma create errors**. Runtime fix for REST pending is **already on `main`** (#1445); production deploy required.

**Gate verdict:** `READY_WITH_CONDITIONS`

---

## Phase 0 — Production state (2026-08-31)

| Check | Result |
|-------|--------|
| Deployed release | `/opt/synqdrive/releases/20260830145314_v4994` |
| Production PID | 1700071 (`node …/dist/src/main.js`) |
| Production port | 3001 (listening) |
| PM2 replica count | 1 (process managed; `pm2 list` empty under root — direct node Ssl) |
| Health / readiness | PASS |
| Scheduler leader | LEADER, status ok |
| Port 3010 | **not listening** (post-remediation) |
| `battery.v2` failed gauge | 67 (unchanged — no queue mutation in this task) |
| SCALE_TO_2_EXECUTED | NO |

---

## Phase 1 — Orphan process forensics

### Observed orphan (P1.8 soak)

| Field | Value |
|-------|-------|
| PID | 1664681 |
| Started | 2026-08-30 11:59:17Z |
| Command | `node dist/src/main.js` |
| Cwd | `/opt/synqdrive/validation-process/20260830115539_p18/backend` |
| Port | 3010 |
| REDIS_DB | 15 |
| PPID | 1 (detached) |
| PM2 / systemd | Neither |
| nginx production traffic | No (prod on 3001 only) |

**Classification:** **A) harmless stale validation process** with **B) cleanup defect** in validation tooling.

### Root cause

`two-replica-process-validation-probe.mjs` Phase C spawns a **detached** restart child (`detached: true`, `unref()`). The parent shell trap in `vps-two-replica-process-validation.sh` only killed initial `PID_A` / `PID_B` from `nohup` — not the Phase C restart child.

Directory suffix `_p18` indicates a manual/custom validation run (not default `_procval`), but the same probe code path applies.

### Remediation performed (production)

- SIGTERM to PID 1664681 only (after identity proof).
- Verified: port 3010 closed, prod health unchanged, scheduler leader intact, Redis DB 0 unaffected.

---

## Phase 2 — Orphan recurrence prevention (code)

**Fix (this PR):**

- `validation-process-tracked-pids.util.mjs` — append spawned PIDs to `VALIDATION_TRACKED_PIDS_FILE`.
- `two-replica-process-validation-probe.mjs` — record Phase C `restartedPid` for trap cleanup.
- `vps-two-replica-process-validation.sh` — trap now kills tracked PIDs + listeners on ports 3010/3011 (fuser/lsof fallback).

**Regression:** `validation-process-tracked-pids.util.test.mjs` (node:test).

---

## Phase 3 — Battery V2 failed job forensics

**Source:** BullMQ `battery.v2` failed set on production Redis DB 0 (read-only classification).

| Metric | Value |
|--------|-------|
| BATTERY_V2_FAILED_TOTAL | 67 |
| BATTERY_V2_LOCK_CONTENTION_TOTAL | 2 (permanent failed after retries) |
| BATTERY_V2_AFFECTED_VEHICLES | ~12 (dominant: `c10351f8-…` — 2 lock + several REST) |
| BATTERY_V2_DOMINANT_VEHICLE | `c10351f8-…` |
| BATTERY_V2_FIRST_FAILURE | ~2026-08-26 (legacy `missing restWindowId`) |
| BATTERY_V2_LAST_FAILURE | 2026-08-31 soak window (REST pending) |

### Failure classification

| Class | Count | Retryable | Notes |
|-------|------:|-----------|-------|
| `REST target job missing restWindowId` | 43 | No | Legacy enqueue schema; obsolete |
| `REST target evaluation pending: no_eligible_observation_in_target_window` | 18 | **Should not fail** | 7 during soak; deployed SHA throws → BullMQ FAILED |
| `Battery V2 vehicle lock contended` | 2 | Yes (exhausted) | Pre-soak Aug 28–29 |
| Prisma `batteryAssessment.create()` | 4 | Mixed | Requires manual review |

**Soak-window failures (7):** all REST pending — **not** lock contention.

---

## Phase 4 — LOCK_CONTENTION root cause

### Execution path

```
Producers (snapshot / trip / REST / reconciliation*)
  → BullMQ battery.v2 (concurrency 2 per process)
  → BatteryV2Processor
  → BatteryV2IdempotentExecutionService
  → BatteryV2VehicleLockService (Redis key battery:v2:lock:{scope}:{vehicleId})
  → handler → persistence
```

\* `BatteryV2ReconciliationScheduler` is **leader-guarded** (`SchedulerLeaderGuardService.shouldRun`).

### Why LOCK_CONTENTION becomes FAILED

- `BatteryV2VehicleLockContendedError` → `classifyBatteryV2JobError` → `LOCK_CONTENTION`, **retryable: true**.
- Processor rethrows for BullMQ retry until `maxAttempts`; intermediate failures log `worker_failed` with `LOCK_CONTENTION`.
- Only **2** jobs exhausted retries and landed in failed — expected under sustained same-vehicle overlap, not a systemic defect.

**Contention is expected control-flow** — should retry with bounded attempts, not be treated as terminal except after max attempts.

### REST pending false-failure (dominant soak issue)

On deployed `3874360e0`, handler **throws** on retryable pending evaluation.  
On `main` (#1445 / `7556a5119`), handler sets metadata `PENDING_EVALUATION` and **returns** — job completes successfully; reconciliation reschedules.

---

## Phase 5 — Scale-to-2 risk analysis

| Question | Assessment |
|----------|------------|
| BATTERY_V2_MULTI_REPLICA_SAFE | **YES_WITH_CONDITIONS** — per-vehicle Redis lock + idempotent execution; reconciliation scheduler leader-only |
| BATTERY_V2_DUPLICATE_WRITE_RISK | **LOW** — idempotency keys + DB uniqueness; lock serializes same-vehicle mutations |
| BATTERY_V2_RETRY_AMPLIFICATION_RISK | **LOW_MED** — 2 replicas × concurrency 2 = 4 workers increases transient LOCK_CONTENTION logs; bounded retries |
| BATTERY_V2_LOCK_MODEL_CORRECT | **YES** — scope-aware keys, 120s TTL, release on completion |

**Conditions before scale:**

1. Deploy `main` including #1445 REST pending fix (eliminates false FAILED for pending evaluations).
2. Merge harness orphan cleanup (this PR).
3. Document failed-job disposition; no blind mass-retry.

---

## Phase 6 — Remediation

| Item | Action |
|------|--------|
| Orphan harness | Code fix in this PR |
| REST pending false-fail | **Already on main** — deploy required |
| LOCK_CONTENTION | No algorithm change; model correct |
| New battery scoring | **Out of scope** |

---

## Phase 7 — Failed job disposition

| Class | Count | Disposition |
|-------|------:|-------------|
| missing restWindowId | 43 | **DO_NOT_RETRY** — obsolete schema |
| REST pending (soak + pre-soak) | 18 | **OBSOLETE_SUPERSEDED** after #1445 deploy + reconciliation |
| LOCK_CONTENTION exhausted | 2 | **RETRY_SAFE** via reconciliation re-enqueue (post-deploy) |
| Prisma assessment create | 4 | **REQUIRES_MANUAL_REVIEW** |

**No queue mutations performed in P1.8.1** — classification only.

---

## Phase 8 — Focused tests

Run locally on remediation branch:

```bash
cd backend
node --test scripts/ops/validation-process-tracked-pids.util.test.mjs
npm test -- --testPathPattern='battery-v2-(job-error|idempotent-execution|rest-target-pending|reconciliation|stage1-pipeline)' --passWithNoTests
```

---

## Phase 9 — PR strategy

| PR | Purpose | Action |
|----|---------|--------|
| #1469 | P1.8 soak audit (draft) | Merge when ready — historical record |
| P1.8.1 remediation PR | Harness cleanup + this doc | Merge before next validation run |
| Deploy | `main` → VPS | Required for REST pending fix (#1445) before scale-to-2 |

**Recommended merge order:** #1469 (docs) → P1.8.1 remediation PR → deploy `main` → controlled scale-to-2 gate.

---

## Machine-readable gate block

```
P1_8_1_PRE_SCALE_GATE = READY_WITH_CONDITIONS
PRODUCTION_REPLICAS = 1
SCALE_TO_2_EXECUTED = NO

ORPHAN_PROCESS_PRESENT = NO
ORPHAN_PROCESS_IDENTITY = validation_harness_phase_c_detached_restart_port_3010_redis_db_15
ORPHAN_PROCESS_REMOVED = YES
ORPHAN_RECURRENCE_FIX_REQUIRED = YES
ORPHAN_RECURRENCE_FIX_COMPLETE = YES

BATTERY_V2_FAILED_TOTAL = 67
BATTERY_V2_LOCK_CONTENTION_TOTAL = 2
BATTERY_V2_AFFECTED_VEHICLES = 12
BATTERY_V2_ROOT_CAUSE = REST_PENDING_THROW_ON_DEPLOYED_SHA_PLUS_LEGACY_RESTWINDOWID_JOBS_PLUS_MINOR_LOCK_EXHAUSTION
BATTERY_V2_MULTI_REPLICA_SAFE = YES_WITH_CONDITIONS
BATTERY_V2_DUPLICATE_WRITE_RISK = LOW
BATTERY_V2_RETRY_AMPLIFICATION_RISK = LOW_MED
BATTERY_V2_LOCK_MODEL_CORRECT = YES
BATTERY_V2_REMEDIATION_REQUIRED = YES
BATTERY_V2_REMEDIATION_COMPLETE = YES_ON_MAIN_DEPLOY_PENDING

FAILED_JOB_DISPOSITION = DOCUMENTED_NO_MUTATION
FOCUSED_TEST_STATUS = PASS
PRODUCTION_HEALTH = PASS
NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0

PR_1469_RECOMMENDED_ACTION = MERGE_WHEN_REVIEWED_DO_NOT_MIX_RUNTIME_FIXES
REMEDIATION_PR = cursor/p1-8-1-pre-scale-remediation-83be
MERGE_ORDER = PR_1469_THEN_P1_8_1_THEN_DEPLOY_MAIN_THEN_SCALE_GATE
READY_FOR_CONTROLLED_SCALE_TO_2 = YES_WITH_CONDITIONS
BLOCKERS = DEPLOY_MAIN_1445_REST_PENDING_FIX; MERGE_P1_8_1_HARNESS_FIX
NEXT_STAGE = DEPLOY_MAIN_REPLICA_1_THEN_P1_8_2_SCALE_TO_2_GATE
```

---

## References

- P1.8 soak audit: `architecture/P1_8_24H_SINGLE_REPLICA_SOAK_RETROSPECTIVE_AUDIT_2026-08-31.md` (PR #1469)
- REST pending fix: PR #1445, `battery-rest-target-evaluate.handler.ts`
- Harness: `backend/scripts/ops/vps-two-replica-process-validation.sh`
- Leader probe: `backend/scripts/ops/two-replica-process-validation-probe.mjs`
