# G2.1 Physical-Refuel Runtime Wiring — Audit

**Date:** 2026-09-04  
**Branch:** `cursor/refuel-physical-event-forensics-f21f`  
**PR:** #1531 (DRAFT — not merged, not production-activated)  
**G1.2d head (before G2.1):** `73000bb16c52d5acc25ee940ba93927ce2fc6b55`

## Gate summary

| Field | Value |
|-------|-------|
| **G2_1_IMPLEMENTED** | YES |
| **G2_1_FEATURE_FLAG_DEFAULT** | OFF (`PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED=false`) |
| **PRODUCTION_ACTIVATED** | NO |
| **PRODUCTION_VALIDATED** | NO |
| **PRODUCTION_MUTATED** | NO |
| **SCHEMA_CHANGE_REQUIRED** | YES (new reconciliation table; migration not run in production) |

## Runtime path (before G2.1)

```
REFUEL persist (EnergyEventsService.upsertSegment)
  → immediate FuelStationEnrichmentProducer.enqueueAfterPersistFromEvent (fire-and-forget)
  → legacy reconcileSupersededRefuelSiblings (delete overlapping rows)
  → V1 coordinate = segment start lat/lon
```

## Runtime path (after G2.1, flag ON)

```
REFUEL persist
  → PhysicalRefuelReconciliationRuntimeService.reconcileAndEnqueueAfterPersist
  → BEGIN TRANSACTION
  → pg_advisory_xact_lock(refuel_reconciliation:{vehicleId})
  → bounded same-vehicle REFUEL candidate load (createdAt window)
  → firstObservedAt = VehicleEnergyEvent.createdAt
  → reconcilePhysicalRefuelBatch (G1 modules)
  → persist VehicleEnergyEventRefuelReconciliation per member
  → COMMIT
  → post-commit: V2 forecourt coordinate resolve (if FINAL_* + enrichment eligible)
  → enqueue station enrichment ONLY if enrichmentEligibleId + FINAL_CANONICAL|FINAL_DISTINCT
  → set enrichmentEnqueuedAt (idempotent dedupe)
```

Flag OFF preserves legacy path exactly.

## firstObservedAt binding

**FIRST_OBSERVED_AT_RUNTIME_BINDING = PROVEN_createdAt**

- Set once on `create`; `update` on dimoSegmentId upsert does not touch `createdAt`.
- Represents first durable persistence, not pre-persist in-memory observation.

## Transaction / lock

- Semantic scope: `refuel_reconciliation:{vehicleId}`
- Implementation: `acquirePgAdvisoryXactLock64` inside `prisma.$transaction`
- Enrichment enqueue strictly after COMMIT

## Candidate query

| Parameter | Default |
|-----------|---------|
| CANDIDATE_LOOKBACK | 6h (`PHYSICAL_REFUEL_CANDIDATE_LOOKBACK_MS`) |
| CANDIDATE_LOOKAHEAD | 1h (`PHYSICAL_REFUEL_CANDIDATE_LOOKAHEAD_MS`) |
| FINALIZED_HISTORY_SCOPE | reconciliation table FINAL_* + enrichmentEligible |
| INDEX | `vehicle_energy_events(vehicle_id, kind, start_time)` |

## Persisted semantic state

`VehicleEnergyEventRefuelReconciliation`: finalityState, canonicalEventId, enrichmentEligible, settlementWindowOpen, lateSiblingConflict, reasonCodes, coordinate V2 fields, enrichmentEnqueuedAt.

## Enqueue idempotency

- Gate: `enrichmentEnqueuedAt` + existing `fuelStationEnrichment` row
- BullMQ job id: `{energyEventId}:{inputFingerprint}` (coordinate-aware fingerprint)
- Dedupe key documented in reconciliation row `enrichmentEnqueuedAt`

## Feature flag

`PHYSICAL_REFUEL_RECONCILIATION_V2_ENABLED` — default **false** in config and `.env.example`.

## Test evidence

| Suite | Result |
|-------|--------|
| G2_1_TARGETED_RUNTIME_TESTS | 107 passed (8 suites) |
| G12D_REGRESSIONS | included in design specs — PASS |
| G12C_REGRESSIONS | included — PASS |
| npm run build | PASS |
| FST_GRAPH_VALIDATOR | PASS |
| EED_GRAPH_VALIDATOR | PASS |

## Remaining risks

- Migration not applied in production (by design this turn)
- Shadow rollout (G2.2) and production validation (G2.3) not started
- Historical pre-G2 rows lack reconciliation state until backfill/replay (later phase)
