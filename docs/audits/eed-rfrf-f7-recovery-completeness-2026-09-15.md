# RFRF F7 — Recovery completeness + post-commit crash-window closure

**Date:** 2026-09-15
**Branch:** `cursor/eed-rfrf-f7-recovery-completeness-f21f`
**Base:** `main` @ `c310d752fbfd3d99f2b623f2a21e6dddfa039e83` (post F6 merge #1653 + VDC #1654 docs)

## Scope rebase after F5-PR3

F5-PR3 already delivered substantial G2 recovery (orphan_refuel, settlement, stale/lost enqueue, coordinate recovery, BullMQ idempotency, multi-replica PG advisory locks). **F7 did not build a second recovery engine.**

| Phase | Responsibility |
|-------|----------------|
| F5-PR3 | Post-commit G2 handoff + recovery-side authority defence |
| F6 | Canonical persisted fallback G2 payload compatibility |
| F7 | Durable autonomous recovery completeness for post-commit failure window |

## Production lifecycle audit (pre-F7)

| Question | Answer |
|----------|--------|
| Who invokes `runRecoveryBatch()` in production? | `PhysicalRefuelReconciliationRecoveryScheduler.runRecoveryTick()` |
| Registration | `WorkersModule` → `app.module.ts` |
| Config consumed | `PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED` + `PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_ENABLED` + `PHYSICAL_REFUEL_RECONCILIATION_RECOVERY_INTERVAL_MS` + batch size |
| Automatic periodic execution | **YES** when V2 + recovery flags enabled |
| Overlap guard | Local `inProgress` (same-process) |
| Cross-replica safety | PG vehicle advisory lock + persisted state + BullMQ idempotency (not scheduler singleton) |

## Post-commit crash window

TRANSACTION A (F5-PR2) commits fallback VEE + PROMOTED together. F5-PR3 G2 handoff runs **after** commit. Process loss between commit and handoff leaves:

- fallback `VehicleEnergyEvent` exists
- candidate = `PROMOTED`
- no `refuelReconciliation` row

`findPhysicalRefuelRecoveryWork()` classifies this as **`orphan_refuel`**. F7-P1/P2 prove `runRecoveryBatch()` discovers and reconciles without manual handoff.

## F7 implementation (minimal)

1. **Scheduler hardening:** `runRecoveryTick()` catches errors, logs `physical_refuel_recovery_tick_failed`, returns 0 — future ticks continue (F7-P10e).
2. **F7 PostgreSQL gate:** 12 integration cases + 6 scheduler lifecycle unit tests (18/18).
3. **Test mock alignment:** G2.1b/G2.1c/G2.1d Prisma mocks expose `vehicleEnergyEvent.findUnique` for F5-PR3 recovery authority filter (pre-existing gap on main).

No Prisma schema change. No new recovery repository. No RFRF-specific reconciliation implementation.

## Candidate-level recovery

| Field | Value |
|-------|-------|
| CANDIDATE_LEVEL_RECOVERY_IN_F7 | **NO** |
| Reason | F7 covers post-commit PROMOTED+VEE orphan window only. Pre-promotion `READY_FOR_PERSIST` retry would require separate authority/retry architecture — out of F7 scope unless proven P0 gap. |

## Real PostgreSQL gate

Script: `backend/scripts/test/rfrf-f7-recovery-completeness-gate.sh`
Env: `RAW_FUEL_REFUEL_F7_INTEGRATION=1`, `RAW_FUEL_REFUEL_F7_POSTGRES_REQUIRED=1`
Isolated DB: `rfrf_f7_*` on localhost only.

| Case | Status |
|------|--------|
| F7-P1 pre-handoff process-loss → orphan_refuel recovery | PASS |
| F7-P2 thrown post-commit G2 handoff → PROMOTED+VEE survive + recovery | PASS |
| F7-P3 idempotent repeated recovery | PASS |
| F7-P4 authority OFF — no fallback G2 bypass | PASS |
| F7-P5 native orphan recovery unaffected | PASS |
| F7-P6 enrichment-eligible state recoverable (BullMQ: F5-PR3 P17 regression) | PASS |
| F7-P7 concurrent recovery — one logical outcome | PASS |
| F7-P8 late native SAME after recovery | PASS |
| F7-P9 forensic/identity preserved | PASS |
| F7-P10 scheduler lifecycle (unit) | PASS (6 tests) |
| F7-P11 bounded orphan scan / cutover | PASS |
| F7-P12 backlog metrics | PASS |

**Gate result:** 18/18 PASS (0 required skips)

## Queue / Redis

F7 does not introduce a new scheduler-to-queue path. **F5-PR3 P17** remains authoritative BullMQ deferred-recovery proof (30/30 PG+Redis gate regression-certified).

## F7.1 — Pre-merge micro-closure (2026-09-15)

Prior F7 head `cf31a6695aa0b7b164a7b297f0137689a8efaf5d` closed implementation scope but **did not** satisfy merge gates: mandatory historical regressions were NOT_RUN, multi-replica PG+Redis was SKIPPED, and F7-P8 did not prove **RECOVERY → COMPLETED → LATE NATIVE SAME**. `F7_COMPLETE=YES` was therefore forbidden.

| Item | Prior F7 head | F7.1 closure |
|------|---------------|--------------|
| F4-PR3 regression | NOT_RUN | PASS (50/50) |
| F4-PR2 regression | NOT_RUN | PASS (41/41) |
| F3→F2 regression | NOT_RUN | PASS (6/6) |
| Multi-replica PG+Redis | SKIPPED | PASS (3/3, 0 skips) on final head |
| F7-P8 completed-ownership | recovery → late native only | recovery → COMPLETED enrichment → late native SAME (F5-P21 A2 semantics) |
| F7-P3 / F7-P7 idempotency | weak | strong persistent counts incl. operational owner = 1 where expected |
| Main sync | `c310d752f` | unchanged at closure execution |
| CI | pending on prior head | verified on exact final head (see closure report) |

### Multi-replica real PG+Redis (F7.1 required)

Script: `backend/scripts/test/rfrf-f7-multi-replica-recovery-gate.sh`
Env: `PHYSICAL_REFUEL_MULTI_REPLICA_INTEGRATION=1`
Infra: isolated localhost PostgreSQL (`rfrf_f7_mr_*`) + isolated localhost Redis (port 56379, db 14), real BullMQ.

| Case | Result |
|------|--------|
| FULL_MULTI_REPLICA_RECOVERY_E2E | PASS — concurrent same-vehicle recovery converges; one deterministic BullMQ job |
| MULTI_REPLICA_RECOVERY | PASS — different vehicles progress independently |
| MULTI_REPLICA_SCHEDULER | PASS — two scheduler instances, no duplicate logical enqueue |

**Suite:** 3 tests, 3 passed, 0 skipped.

### F7-P8 strengthened sequence

1. Real RFRF candidate → atomic promote (no post-commit handoff)
2. `runRecoveryBatch()` recovery
3. `seedCompletedFallbackEnrichment()` (F5-P21 helper)
4. Assert operational enrichment owner count = **1** + fallback recon enrichmentEligible = true
5. Late native SAME via real `reconcileAndEnqueueAfterPersist`
6. Assert: both forensic rows retained; fallback COMPLETED enrichment sticky; native lateSiblingConflict + INSUFFICIENT_EVIDENCE + `late_sibling_after_finalization`; second enqueue = 0

### Regression matrix (final head)

| Gate | Result |
|------|--------|
| F7 real PG | 18/18 PASS |
| F6 | 11/11 PASS |
| F5-PR3.1 | 30/30 PASS |
| F5-PR2 | 50/50 PASS |
| F5-PR1 | 19/19 PASS |
| G2 unit | 155/155 PASS |
| G2 recovery (g21b/c/d) | 38/38 PASS |

## Closure flags

| Flag | Value |
|------|-------|
| PRISMA_SCHEMA_CHANGED | NO |
| NEW_MIGRATION_REQUIRED | NO |
| SECOND_RECOVERY_STACK_CREATED | NO |
| PRODUCTION_MUTATED | NO |
