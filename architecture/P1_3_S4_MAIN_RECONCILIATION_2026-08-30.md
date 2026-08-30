# P1.3-S4 Main Reconciliation — PR #1429

**Date:** 2026-08-30  
**PR:** #1429 (`cursor/p1-3-s4-readiness-closure-f21f`)

## Merge context

| Field | SHA |
|-------|-----|
| OLD_PR_HEAD_SHA | `43e681956d2f11cffda28413df24069db1204c9a` |
| CURRENT_MAIN_SHA | `9a1f7e3b123ba9093db184fad01f55a55d310e73` |
| MERGE_BASE_SHA | `dc9ab567d16d62ef118e4fbd076747c9f91eba18` |

## Conflicts resolved

| File | Class | Resolution |
|------|-------|------------|
| `backend/src/modules/dimo/dimo-telemetry.service.ts` | A + B | Stacked `DimoProviderGateway` → `DimoRequestExecutor` → HTTP |
| `backend/src/modules/dimo/dimo-telemetry.service.spec.ts` | A + B | Combined off-gateway + bypass-executor test harness |
| `backend/src/modules/dimo/dimo.module.ts` | A + B | Restored S4 gateway providers + `DimoProviderBudgetModule` |
| `frontend/src/master/components/ArchitekturView.tsx` | C | Merged snapshot worker description |
| `frontend/src/master/components/ChangesView.tsx` | C | Preserved S4 + main changelog entries |

## Architectural invariant (post-reconcile)

```
DimoTelemetryService.queryGraphQL / fetchVehicleSummary / fetchVehicleVin
  → DimoProviderGateway.execute (S4 canary, shadow default, requestContext)
    → DimoRequestExecutor.execute (P1.3 global Redis lease semaphore)
      → axios client.post
```

Production defaults unchanged: `DIMO_PROVIDER_LIMITER_MODE=shadow`, global enforce OFF, `PERMANENT_TRIP_LOSS=NO`.

## Energy boundary

`REAL_WORLD_FUEL_EVENT_PROVEN=NO`  
`REAL_WORLD_CHARGING_EVENT_PROVEN=NO`
