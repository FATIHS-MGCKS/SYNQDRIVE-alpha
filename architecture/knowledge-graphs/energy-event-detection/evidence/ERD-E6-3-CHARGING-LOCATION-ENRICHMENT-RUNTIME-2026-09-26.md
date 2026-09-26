# ERD E6.3 — Charging location enrichment runtime (2026-09-26)

**Evidence ID:** EED-EV-0089  
**Stage:** `ERD_E6_3_CHARGING_LOCATION_ENRICHMENT_RUNTIME`

## Scope

E6.3 durably attaches E6.2 charging-station reference resolution to **canonical ERD RECHARGE** `VehicleEnergyEvent` rows via:

- `VehicleEnergyEventChargingStationEnrichment` (separate from fuel enrichment)
- Coordinate selector `erd-recharge-charging-enrichment-coordinate-v1`
- Queue `energy.recharge.station.enrich` / job `recharge.station.enrich`
- Post-projection enqueue in `ErdRechargeCanonicalProjectionRuntimeService` (CREATED, RECONCILED, HANDOFF_COMPLETED, NO_OP)
- Recovery scheduler with leader guard
- Read API `chargingStationEnrichment` on `EnergyEventDto` (RECHARGE only)

## Authority boundaries

| Layer | Question |
|-------|----------|
| E6.1 | WHERE did charging occur? (canonical coordinates) |
| E6.2 | WHICH station matches a coordinate? (reference resolver) |
| E6.3 | WHEN/HOW is resolution persisted on the product VEE? (async runtime + API) |

**Invariants:** charging enrichment does not affect physical identity, VEE identity, or E5.6 write authority.

## Feature flags (default OFF)

- `CHARGING_STATION_ENRICHMENT_ENABLED`
- `CHARGING_STATION_ENRICHMENT_CUTOVER_AT` (boundary: `VehicleEnergyEvent.endTime`)
- `CHARGING_STATION_ENRICHMENT_RECOVERY_*`

No production activation, no historical backfill, no dataset import in this stage.

## Acceptance matrices (required before merge readiness)

### P — PostgreSQL / persistence / product projection

**Gate:** `ERD_E6_3_POSTGRES_INTEGRATION=1` — `erd-e6-3-charging-station-enrichment.postgres.integration.spec.ts`  
**CI:** boundary step 16/18 + ephemeral migration `erd-e6-3-migration-ephemeral-gate.sh`

| Case | Contract |
|------|----------|
| P1–P3 | Canonical eligibility, one row per VEE, idempotent reprocess |
| P4 | Coordinate change updates same row + new fingerprint |
| P5–P6 | NO_COORDINATES → late coordinate → MATCHED |
| P7 | INCONSISTENT_COORDINATES, no station assignment |
| P8–P9 | REFUEL + legacy RECHARGE firewall |
| P10 | AMBIGUOUS |
| P11 | LOW match untrusted in API policy |
| P12–P13 | Dataset version + connector metadata |
| P14 | Fuel enrichment table untouched |
| P15 | VEE delete cascades charging enrichment |
| P16–P18 | Canonical/raw API projection + dedupe |
| P19 | VEE identity fields unchanged |
| P20 | Dual-client convergence to one row |
| P-NOT_FOUND | NOT_FOUND terminal |
| P-CUTOVER | Pre-cutover producer skip |
| P-FINGERPRINT | Terminal skip same fingerprint |
| P-ERROR | Resolver ERROR retryable persistence + later success |

### Q — Real Redis / BullMQ (Q1–Q10)

**Gate:** `ERD_E6_3_BULLMQ_REDIS_INTEGRATION=1` — `erd-e6-3-charging-station-enrichment.bullmq.redis.integration.spec.ts`  
**CI:** `scripts/test/erd-e6-3-bullmq-redis-ci.sh` (boundary step 17/18)  
**Infra:** real `ioredis` + `bullmq` Worker/Queue (`redis-memory-server` or `TEST_REDIS_PORT`)

| Case | Contract |
|------|----------|
| Q1 | Enqueue → worker → durable MATCHED |
| Q2 | Duplicate enqueue while waiting dedupes |
| Q3 | Completed job + terminal DB → terminal_skip |
| Q4/Q5 | Retries + max attempts → FAILED row |
| Q6 | Fingerprint change after NO_COORDINATES re-enqueues |
| Q7 | Concurrent producers → one job id |
| Q8 | Queue unavailable → deferred (fail-open to recovery); projection isolation H7 in unit suite |
| Q9 | attempts + exponential backoff on job opts |
| Q10 | Disabled flag → no enrichment row |
| Q-TRANSIENT | Transient resolver failure later completes |
| Q-FAILED-REMOVE | Failed job removed before re-enqueue |
| Q-FINGERPRINT-JOBID | Stable idempotency key |

### R — Full recovery (R1–R12)

**Gate:** `ERD_E6_3_RECOVERY_INTEGRATION=1` — `erd-e6-3-charging-station-enrichment.recovery.integration.spec.ts`  
**CI:** `scripts/test/erd-e6-3-recovery-ci.sh` (boundary step 18/18)  
**Infra:** real PostgreSQL + Redis/BullMQ + `ChargingStationEnrichmentRecoveryScheduler`

| Case | Contract |
|------|----------|
| R1 | Missing enrichment discovered and enqueued |
| R2 | PENDING recoverable |
| R3 | Stale PROCESSING recoverable |
| R4 | PROCESSING + ERROR recoverable |
| R5 | Fresh PROCESSING not stolen |
| R6 | Terminal COMPLETED not reprocessed |
| R7 | Pre-cutover excluded |
| R8–R9 | REFUEL + legacy RECHARGE excluded |
| R10 | Recovery batch bound |
| R11 | Leader guard blocks follower replica |
| R12 | Repeated cycles converge (one row) |
| R-MULTI-REPLICA | Parallel leaders dedupe to one BullMQ job |

### E6.1 / E6.2 regression (unchanged gates)

- E6.1 P1–P15: boundary step 14/18 — `erd-e6-1-recharge-location-provenance.postgres.integration.spec.ts`
- E6.2 PG1–PG15: boundary step 15/18 — `charging-station-location-resolver.postgres.integration.spec.ts`

### Migration

Ephemeral gate proves: single apply, table + constraints + cascade, fuel schema untouched, empty initial table, no hidden backfill.

## Async crash-window audit

| Window | Mitigation | Proof |
|--------|------------|-------|
| Projection OK, enqueue throws | Isolated catch in runtime (H7) | Unit + Q8 deferred |
| Projection OK, queue disabled | deferred_queue_unavailable | Q8 |
| Job lost after projection | Recovery R1 | R1 |
| PROCESSING crash | Stale recovery R3 | R3 |
| PROCESSING + ERROR | Recovery R4 | R4 |
| Max BullMQ attempts | markFailedAfterMaxRetries | Q4/Q5 |
| Failed job blocks re-enqueue | remove failed job before add | Q-FAILED-REMOVE, producer |
| Fingerprint change after terminal | New job id | Q6, P4 |
| Completed job in Redis, DB terminal | terminal_skip | Q3, R6 |

**UNRECOVERABLE_STATE_COUNT:** 0 identified in audited lifecycle (convergence via recovery + fingerprint re-enqueue).

## CI (exact-head)

Required in `backend-boundary-postgres` / `boundary-repair-postgres-ci.sh`:

1. Steps 1–15: prior ERD/VDC gates (incl. E6.1, E6.2)
2. Step 16: E6.3 migration + P matrix
3. Step 17: E6.3 Q1–Q10 BullMQ/Redis
4. Step 18: E6.3 R1–R12 recovery

Plus repository-wide required checks (RFRF stage 3/4, module registry, i18n, vehicle detail, legal docs, typecheck).

## Production boundary

Flags remain **OFF**. No deploy, no backfill, no OSM production dataset import, no SynqDrive Code → Changes/Architektur presentation seal in this technical PR (deferred post-merge per E6.2 pattern).

`AUTOMATIC_DATASET_REFRESH_REENRICHMENT=NO` in V1 — fingerprint changes on coordinate/resolver version only.

## Unit coverage (supplementary)

Coordinate selector C*, cutover T*, orchestrator O*, projection hook H* — not substitutes for P/Q/R gates.
