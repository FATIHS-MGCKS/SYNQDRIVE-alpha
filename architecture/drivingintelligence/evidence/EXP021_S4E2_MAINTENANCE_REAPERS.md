# EXP-021 S4E-2 — dormant T10/T12 maintenance reapers

Date: 2026-09-29

## Authoritative starting main

`11adaf76d02ced78e4406b77a88d3b3eabe97807` (includes merged PR #1844 / S4E-1 drift watcher).

## Scope (S4E-2)

**In scope**

- `DiV0S4MaintenanceService` → `reapExhausted` (T10) and `retirePipelineItems` (T12) only
- Bounded retired-pipeline enumeration (`listDiV0S4RetiredPipelineVersionKeys`)
- Leader-guarded scheduler `di_v0_s4_maintenance_reaper` (`DiV0S4eDriftWatcherModule`, DEFINED_NOT_REGISTERED)
- `NO_EXHAUSTED_WORK_ITEM` / `NO_RETIRABLE_WORK_ITEM` → scheduler no-op (not failure)
- PostgreSQL matrix S4E2-M01..M21 + unit S4E2-U01..U03

**Out of scope (S4F)**

- Metrics, reconciliation export, activation cohort, production shadow, deploy

## T10 scheduler design

Single bounded `reapExhausted({ limit })` per maintenance tick (`t10BatchLimit`, cap 500). No per-item scan loop beyond repository SQL.

## T12 scheduler design

1. Read up to `t12MaxPipelinesPerTick` RETIRED keys (`ORDER BY pipeline_version_key`, DB authoritative).
2. For each key, one bounded `retirePipelineItems({ pipelineVersionKey, limit: t12BatchLimitPerPipeline })`.
3. No registry mutation; ACTIVE pipelines never enumerated.

## Control plane

Same gate as S4E-1: `masterEnabled` for scheduling; repository enforces `evaluateDiV0S4MaintenanceEnablement` + `requireNotKilled` on every T10/T12 transaction. KILLED → zero mutation.

## T11 ↔ T12 successor race (mandatory)

**Scenario:** T11 eligibility reads pipeline registry `ACTIVE` (`successorIdIfEligible`); concurrent actor retires pipeline; T11 may INSERT successor row.

**Repository facts (frozen contract, not modified in S4E-2):**

- `successorIdIfEligible` uses `FOR SHARE` read; eligibility is point-in-time (no lock held through INSERT).
- TOCTOU: a `PENDING` successor row may exist briefly with a `pipeline_version_key` whose registry row is already `RETIRED`.
- **Execution authority:** `T02_CLAIM` calls `requireRegistryStatus(..., 'ACTIVE')` — successor cannot be claimed or executed under a RETIRED pipeline.
- **Cleanup:** `T12_RETIRE` supersedes `PENDING` / `FAILED_RETRYABLE` / expired `LEASED` on RETIRED pipelines (no successor on T12).

**Conclusion:** No durable authoritative execution under a RETIRED pipeline; transient `PENDING` rows are claim-blocked and T12-retirable. **PROVEN_SAFE** for execution/successor authority; document TOCTOU transient row, not a contract patch in this slice.

**Evidence:** S4E2-M19 (concurrent T11 + T12 + drift after registry retire).

## T10 ↔ T11 race

Concurrent `reapExhausted` vs `supersedeOnDrift` on exhausted `LEASED` with boundary drift: row-level locks + conditional updates ensure one valid terminal/superseded outcome (S4E2-M20).

## Dormancy

- `S4E_APP_RUNTIME_REGISTERED=NO` (dormant audit)
- No AppModule import, no migration, no control-row seeding, no provider/trip writes

## CI

- `npm run test:di:s4e` / `test:di:s4e:postgres` (drift + maintenance specs)
- S4A–S4E workflow paths unchanged (same `s4e-drift-watcher/**` tree)

## Remaining S4E gaps before S4F

Drift horizon reconciliation export, metrics, tiny activation, production shadow — unchanged from S4E-1 evidence.

## S4F boundary

Anything requiring runtime activation, customer-visible behavior, deploy, or production control seeding.
