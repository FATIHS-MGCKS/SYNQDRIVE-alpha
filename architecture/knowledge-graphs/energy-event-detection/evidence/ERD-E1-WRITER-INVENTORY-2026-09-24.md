# ERD E1 — Recharge writer / mutator inventory

**Date:** 2026-09-24  
**Scope:** All repository paths that create or update `VehicleEnergyEvent` (`kind=RECHARGE`) or `HvChargeSession`.  
**Runtime:** No behavior change in E1; inventory for cutover planning.

---

## VehicleEnergyEvent.RECHARGE writers

| Component | Trigger | Provider input | Write method | Idempotency | Enabled / flags | Future disposition |
|-----------|---------|----------------|--------------|-------------|-----------------|-------------------|
| `EnergyEventsService.detectEnergyEvents` | Trip reconciliation step 5; manual POST `/vehicles/:id/energy-events/detect` | DIMO native recharge segments via `DimoSegmentsService` / `DimoRechargeSegmentsClient` | `upsertSegment` → `vehicleEnergyEvent.create/update` when `kind=RECHARGE` | Unique `dimoSegmentId` (coalesced segment id) | Always on when service injected; no separate RECHARGE flag | **DEPRECATE_AFTER_CUTOVER** physical role → **BECOME_PROJECTION_WRITER** (E5) |
| `energy-events-recovery-write-backfill` / ops scripts | Operator-authorized recovery only | Same as detection | Bulk create/update VEE | Script-defined | Ops gate | **UNCHANGED_INFRASTRUCTURE** (recovery tooling; must not bypass ERD authority post-cutover without E5 policy) |
| Integration tests / harnesses | Test setup | Fixtures | Direct Prisma create | N/A | Test-only | **UNCHANGED_INFRASTRUCTURE** |

**Notes:** RECHARGE rows skip REFUEL-only post-persist hooks (physical refuel / fuel-station enrichment). No code path links RECHARGE VEE to `HvChargeSession`.

---

## HvChargeSession writers

| Component | Trigger | Provider input | Write method | Idempotency | Enabled / flags | Future disposition |
|-----------|---------|----------------|--------------|-------------|-----------------|-------------------|
| `HvChargeSessionPersistService.persistRechargeSegment` | `HvChargeSessionIngestService`; `HvRechargeSessionReconcileService` | Normalized DIMO recharge segment | `repository.create/update` via draft | `(vehicleId, segmentFingerprint)`, `(vehicleId, idempotencyKey)` | `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` (default **false**) | **KEEP_PHYSICAL_WRITER** (canonical native ingest under ERD flags E7) |
| `HvChargeSessionPersistService.persistSessionDraft` | `HvFallbackChargeSessionDetectorService` | HV snapshots + added-energy evidence | create/update | Same unique keys | Requires both `BATTERY_V2_HV_RECHARGE_SESSION_ENABLED` and `BATTERY_V2_HV_FALLBACK_CHARGE_SESSION_ENABLED` (defaults **false**) | **KEEP_PHYSICAL_WRITER** (fallback under ERD E3/E7) |
| `HvChargeSessionPersistService.supersedeOverlappingFallbackSessions` | Called from native `persistRechargeSegment` | Overlap with `TELEMETRY_POLL_FALLBACK` rows | metadata update on fallback row | N/A | Same as native ingest flag | **KEEP_PHYSICAL_WRITER** (native>fallback evidence) |
| `HvCapacityShadowProducer` / M3 validation | After session persist | N/A | `hvChargeSession.update` metadata only | Session id | Battery V2 shadow paths | **BATTERY_CONSUMER_ONLY** |
| `BatteryV2RetentionService` | Retention job | N/A | delete/prune old sessions | Policy-based | Retention config | **UNCHANGED_INFRASTRUCTURE** (must respect ERD retention policy E7) |

---

## Triggers (enqueue / schedule) without direct DB write

| Component | Trigger | Effect |
|-----------|---------|--------|
| `HvRechargeSessionReconcileProducerService` | Periodic batch, ongoing sessions, capability rows, charging transition | Enqueues `HV_RECHARGE_SESSION_RECONCILE` job |
| `BatteryV2SnapshotIngestionService` | `tractionBatteryIsCharging` flank | Enqueue reconcile or inline fallback detect |
| `BatteryV2ReconciliationService` | Reconciliation tick | May enqueue HV recharge reconcile |
| `HvRechargeSessionReconcileHandler` | BullMQ worker | Calls reconcile service (writes via ingest/fallback) |

---

## Future single physical writer model

1. **Physical authority:** Only ERD-gated `HvChargeSessionPersistService` paths (native + fallback) mutate canonical session rows.  
2. **Product projection:** Dedicated projector (E5) writes `VehicleEnergyEvent.RECHARGE` from canonical session; `EnergyEventsService` stops direct RECHARGE upsert after cutover flag.  
3. **Battery V2:** Reads sessions for capacity/SOH; no parallel physical detection.  
4. **Legacy VEE:** Read-only product history until optional reconciliation stage; no auto-promotion to physical sessions in E1.
