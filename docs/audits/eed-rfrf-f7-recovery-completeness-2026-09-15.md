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

## Closure flags

| Flag | Value |
|------|-------|
| PRISMA_SCHEMA_CHANGED | NO |
| NEW_MIGRATION_REQUIRED | NO |
| SECOND_RECOVERY_STACK_CREATED | NO |
| PRODUCTION_MUTATED | NO |
