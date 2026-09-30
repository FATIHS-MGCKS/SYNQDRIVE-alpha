# EXP-021 S4E-2 — dormant T10/T12 maintenance reapers

Date: 2026-09-29 (CLASS A hardening 2026-09-29)

## Authoritative starting main

`11adaf76d02ced78e4406b77a88d3b3eabe97807` (includes merged PR #1844 / S4E-1 drift watcher).

## Scope (S4E-2)

**In scope**

- `DiV0S4MaintenanceService` → `reapExhausted` (T10) and `retirePipelineItems` (T12) only
- **Authoritative** `DiV0S4WorkItemRepository.retirePipelineVersion` (operator/test retirement: registry ACTIVE→RETIRED + full retirable supersession in one transaction)
- Bounded retired-pipeline enumeration (`listDiV0S4RetiredPipelineVersionKeys`)
- Leader-guarded scheduler `di_v0_s4_maintenance_reaper` (`DiV0S4eDriftWatcherModule`, DEFINED_NOT_REGISTERED)
- `NO_EXHAUSTED_WORK_ITEM` / `NO_RETIRABLE_WORK_ITEM` → scheduler no-op (not failure)
- PostgreSQL matrix S4E2-M01..M21 + S4E2-A01..A10 (CLASS A) + unit S4E2-U01..U03

**Out of scope (S4F)**

- Metrics, reconciliation export, activation cohort, production shadow, deploy

## T10 scheduler design

Single bounded `reapExhausted({ limit })` per maintenance tick (`t10BatchLimit`, cap 500). No per-item scan loop beyond repository SQL.

## T12 scheduler design

1. Read up to `t12MaxPipelinesPerTick` RETIRED keys (`ORDER BY pipeline_version_key`, DB authoritative).
2. For each key, one bounded `retirePipelineItems({ pipelineVersionKey, limit: t12BatchLimitPerPipeline })`.
3. **No registry mutation** on the maintenance tick path; ACTIVE pipelines never enumerated.
4. **Registry ACTIVE→RETIRED** is only via `retirePipelineVersion` (same T12 transition id for work-item supersession; not raw operator DML).

## Control plane

Same gate as S4E-1: `masterEnabled` for scheduling; repository enforces `evaluateDiV0S4MaintenanceEnablement` + `requireNotKilled` on every T10/T12 transaction. KILLED → zero mutation.

## T11 ↔ pipeline retirement — invariant classes

| Class | Meaning |
|-------|---------|
| **Execution-safe** | No authoritative claim/execute under RETIRED pipeline (`T02_CLAIM` + `PIPELINE_VERSION_ACTIVE`). |
| **Eventual cleanup (CLASS B)** | Transient or durable `PENDING` successor possible after registry RETIRED until a later bounded T12 pass; claim still blocked. |
| **Strong serialized durable invariant (CLASS A)** | After `retirePipelineVersion` commits, `COUNT(PENDING PRIMARY WHERE pipeline_version_key = retired) = 0`; concurrent T11 cannot leave a durable successor under RETIRED. |

### Gap DI-GAP-S4A-T11-RETIRED-SUCCESSOR-TOCTOU-001

**Pre-fix (S4E-2 initial):** CLASS B. T11 used `FOR SHARE` registry read; test harness `retireRegistry` was raw DML (`ACTIVE→RETIRED` only). RACE-A could commit a `PENDING` PRIMARY successor while registry was already `RETIRED`. Execution remained safe (claim blocked); cleanup was conditional on a future T12 tick.

**Post-fix (S4E-2 CLASS A hardening):** CLASS A for authoritative retirement + T11 lock order.

**S4B C15 (2026-09-29):** Pre-fix C15 expected `CLAIM_REFUSED` / `PIPELINE_VERSION_NOT_ACTIVE` on a still-`PENDING` item after `retireRegistry` DML. Post-fix authoritative retirement supersedes eligible `PENDING` first → claim loop correctly returns `IDLE` (`NO_CLAIMABLE_WORK_ITEM`). Defensive T02 refusal on a status-only RETIRED straggler is covered by a separate postgres case (`retireRegistryStatusOnly`, test-only).

**S4E2-M19 (2026-09-29):** Concurrent `Promise.all` treated a losing T11 `ILLEGAL_SOURCE_STATE` (predecessor already `SUPERSEDED` by retirement) as test failure. M19 now uses `Promise.allSettled` with an allowlisted race-loser rejection set and asserts final CLASS A durable state (same pattern as A3/A8).

- `retirePipelineVersion`: `pipeline_versions` row `FOR UPDATE` → loop supersede all retirable work items (batch 500, same transaction) → `ACTIVE→RETIRED`.
- `supersedeOnDrift` (T11): **registry `FOR UPDATE` before work-item `FOR UPDATE`**; successor insert only when registry status is `ACTIVE` under that lock; retirement blocks on registry until T11 completes, then supersedes any successor in the same retirement transaction.
- Bounded T12 scheduler remains for stragglers on already-RETIRED pipelines (e.g. valid `LEASED` until lease expiry per R21).

**Ambiguity removed:** `T11_T12_RACE_PROVEN_SAFE=YES` applied only to **execution authority** pre-fix; it did **not** prove CLASS A. Post-fix, durable successor under RETIRED is **disallowed** for paths through `retirePipelineVersion`.

### Canonical lock order (no inversion)

`di_v0_s4_pipeline_versions` (FOR UPDATE) → `di_v0_s4_work_items` (FOR UPDATE).

Applies to: `retirePipelineVersion`, `supersedeOnDrift` (T11). Other transitions (T02 claim: work item then registry `FOR SHARE`; T10: work item only) remain compatible — retirement waits on registry while claim holds work item only.

## T10 ↔ T11 race

Concurrent `reapExhausted` vs `supersedeOnDrift` on exhausted `LEASED` with boundary drift: row-level locks + conditional updates ensure one valid terminal/superseded outcome (S4E2-M20).

## Dormancy

- `S4E_APP_RUNTIME_REGISTERED=NO` (dormant audit)
- No AppModule import, no migration, no control-row seeding, no provider/trip writes

## CI

- `npm run test:di:s4e` / `test:di:s4e:postgres` (drift + maintenance + CLASS A specs)
- S4A–S4E workflow paths unchanged (same `s4e-drift-watcher/**` tree)

## Remaining S4E gaps before S4F

Drift horizon reconciliation export, metrics, tiny activation, production shadow — unchanged from S4E-1 evidence.

## S4F boundary

Anything requiring runtime activation, customer-visible behavior, deploy, or production control seeding.
