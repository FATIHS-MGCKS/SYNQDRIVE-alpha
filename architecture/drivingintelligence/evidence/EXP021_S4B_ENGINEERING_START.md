# EXP-021 — S4B engineering start (discovery + claim orchestration)

| Field | Value |
|-------|-------|
| **Slice** | S4B-1 — PRIMARY discovery, leader-guarded scheduler, DB claim loop, heartbeat/budget wrapper, S4C executor port |
| **Production anchor** | `6952fdf727f236ac7b338e14b85d54af6733fa0f` / release `20260928175908_v4994` |
| **Runtime** | **Dormant** — `DiV0S4bOrchestrationModule` defined, **not** imported by `AppModule`; flags default OFF; no control row |

## Code layout

- `backend/src/modules/vehicle-intelligence/driving-intelligence/s4b-orchestration/`
  - `di-v0-s4b-pipeline-manifest.ts` — canonical runtime manifest + `calibrationBundleHash` over numeric bundle content
  - `di-v0-s4b-config.ts` — **only** `process.env` reader (`loadDiV0S4bControlPlaneConfig`)
  - `di-v0-s4b-discovery.service.ts` — bounded candidate query + `createWorkItem` (T01) only
  - `di-v0-s4b-claim-loop.ts` — `claim` / T03 / T07 orchestration; AbortSignal work budget 240s
  - `di-v0-s4b-executor.port.ts` — registry; **no S4C implementation**
  - Schedulers: `di_v0_s4_discovery` (SINGLETON_GLOBAL + leader guard), `di_v0_s4_claim_loop` (REPLICA_LOCAL)
- Scheduler registry: `backend/src/shared/scheduler-leader/scheduler-leader.registry.ts`

## Invariants (verified by tests + dormant audit)

| Invariant | Value |
|-----------|-------|
| DISCOVERY_DIRECT_WORK_ITEM_WRITE_COUNT | 0 (T01 via repository only) |
| DISCOVERY_BOUNDARY_OCCURRENCE_WRITE_COUNT | 0 |
| TRIP_FINALIZE_CALL_SITES | 0 |
| CLAIM_DIRECT_DB_WRITE_COUNT | 0 |
| HEARTBEAT_DIRECT_DB_WRITE_COUNT | 0 |
| CLAIM_WITHOUT_EXECUTOR_COUNT | 0 |
| PROVIDER / acquisition calls | 0 |
| S4B_BULLMQ_USED | NO |
| PRISMA_SCHEMA_CHANGE_COUNT | 0 |
| S4B_APP_REGISTRATION_STATUS | DEFINED_NOT_REGISTERED |

## Control config

`CONTROL_CONFIG_WIRING_STRATEGY=COMPOSITION_BOUNDARY_ADAPTER` (`di-v0-s4b-config.ts`); `di-v0-s4a-control-plane.ts` remains pure.

## Discovery tuning (non-semantic)

- `DISCOVERY_BATCH_SIZE=50` (`DI_V0_S4B_TUNING.discoveryBatchLimit`)
- `DISCOVERY_ORDER=settlement_anchor ASC, trip_id ASC`
- `DISCOVERY_SETTLEMENT_DELAY_SECONDS=86400`

## T07 release reason codes (bounded)

`EXECUTOR_ERROR`, `EXECUTOR_RELEASED`, `WORK_BUDGET_EXCEEDED`, `CONTROL_PLANE_RELINQUISH`, `SHUTDOWN_RELINQUISH`

## Production dormancy (read-only 2026-09-28)

Post-implementation verification on `srv1374778.hstgr.cloud`: S4/S2 counts all 0; `di_v0_s4_trip_primary_boundary_seq` and `boundary_occurrence` present; deployed SHA `6952fdf72`.

## Tests

- Unit + module: `npm run test:di:s4b`
- PostgreSQL: `npm run test:di:s4b:postgres` (requires S4A bootstrap DB)
- S4A Postgres gate unchanged: 92/92
