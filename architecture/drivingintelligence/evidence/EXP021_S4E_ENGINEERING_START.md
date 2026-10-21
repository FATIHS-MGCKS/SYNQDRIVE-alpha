# EXP-021 S4E-1 engineering start — dormant boundary drift watcher

Date: 2026-09-29

## Base SHA

- **S4E branch base (starting main for this PR):** `1dd4224037a84417c5d605575bb6d288ac93184e` (Battery V2 `#1842` only; no S4 overlap with S4E diff)
- **S4D merge / seal ancestor (context only, not S4E branch base):** `06955ea65b15ab2801865893eebb1c387d17b327` (merged PR #1841 / S4D on earlier main)

## Scope (S4E-1)

**In scope**

- Bounded drift candidate read path (`listDiV0S4DriftWatchCandidates`)
- Canonical `DI_V0_S4_BOUNDARY_FP_V1` re-hash from live trip rows (not repair history / `updatedAt`)
- `DiV0S4DriftWatcherService` invoking **only** `DiV0S4WorkItemRepository.supersedeOnDrift` (T11)
- Leader-guarded dormant scheduler `di_v0_s4_drift_watcher` (`DiV0S4eDriftWatcherModule`, DEFINED_NOT_REGISTERED)
- Unit + PostgreSQL matrix S4E-D01..D15 + dormant audit
- CI: `test:di:s4e`, `test:di:s4e:postgres` in S4 gate

**Out of scope (S4F / later)**

- Metrics dashboards, 10-day reconciliation export, tiny activation, production shadow runs
- T10 exhausted-attempt reaper scheduling (repository `reapExhausted` exists — inventory only)
- T12 retirement reaper scheduling (repository `retirePipelineItems` exists — inventory only)

## Code layout

`backend/src/modules/vehicle-intelligence/driving-intelligence/s4e-drift-watcher/`

| File | Role |
|------|------|
| `di-v0-s4e-drift-candidates.ts` | Horizon-bounded candidate SQL + fingerprint re-hash |
| `di-v0-s4e-drift-watcher.service.ts` | Drift pass; T11 delegation |
| `di-v0-s4e-drift-watcher.scheduler.ts` | `SchedulerLeaderGuardService` tick |
| `di-v0-s4e-drift-watcher.module.ts` | Nest wiring (not AppModule-imported) |
| `di-v0-s4e-config.ts` | Horizon + env composition boundary |

## Drift horizon

`driftHorizonSeconds = 864000` (10 days after `settlement_anchor_at` on work item).

## T11 authority

No duplicate T11 SQL. All supersession via `supersedeOnDrift` with reasons `BOUNDARY_CHANGED`, `TRIP_NOT_COMPLETED`, `TRIP_CANCELLED`.

## Dormancy

- `S4E_APP_RUNTIME_REGISTERED=NO`
- No Prisma migration in this slice
- No production control row seeding

## Race-test matrix

PostgreSQL: `di-v0-s4e-drift.postgres.integration.spec.ts` (S4E-D01..D15).

## T10 / T12 inventory

| Transition | Repository method | Scheduled in S4E-1 |
|------------|-------------------|------------------|
| T10_EXHAUST | `reapExhausted` | NO (future maintenance sub-slice) |
| T12_RETIRE | `retirePipelineItems` | NO (future maintenance sub-slice) |

Both remain tested via existing S4A Postgres fixtures; not modified.

## Remaining gaps (S4F / activation)

Unchanged contract gaps: provider backpressure, native readiness, location retention governance, shadow deletion audit, reconciliation metrics beyond 10d horizon.
