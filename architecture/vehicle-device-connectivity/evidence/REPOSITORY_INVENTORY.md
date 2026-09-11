# Vehicle & Device Connectivity — Repository Inventory (Phase 1)

**Audit date:** 2026-09-11  
**origin/main at audit start:** `d6ce9c104033afcfa55678c8de6e9eef2397e12a`  
**Audit branch:** `cursor/vehicle-connectivity-bootstrap-dafe`

## Backend — vehicles / connectivity projection

```
backend/src/modules/vehicles/connectivity/domain/
  connectivity-domain.types.ts
  connectivity-domain.priority.ts
  connectivity-domain.validation.ts
  connectivity-diagnostic-state.ts
  provider-link-state.types.ts
  provider-link-state.builder.ts
  provider-link-evidence.assembler.ts
  physical-device-evidence.ts
  vehicle-connectivity-runtime-state.builder.ts
backend/src/modules/vehicles/connectivity/
  vehicle-connectivity-runtime-batch.assembler.ts
  vehicle-connectivity-runtime-state.dto.ts
  vehicle-connectivity-runtime-legacy.projection.ts
  connectivity-diagnostic.admin-dto.ts
backend/src/modules/vehicles/
  telemetry-freshness.resolver.ts
  vehicle-state-interpreter.ts
  fleet-connectivity.types.ts
  fleet-connectivity.util.ts
  fleet-connectivity-api.types.ts
  fleet-connectivity-api.mapper.ts
  fleet-data-coverage.ts
  vehicles-operational.service.ts
  vehicle-attention.util.ts
  vehicles.controller.ts (fleet-connectivity endpoints)
  vehicles.service.ts
backend/src/modules/dimo/device-connection-episode-resolution/
  vehicle-connectivity-runtime-projection.service.ts
```

## Backend — DIMO connectivity (provider implementation)

```
backend/src/modules/dimo/connectivity-alert/
backend/src/modules/dimo/connectivity/
backend/src/modules/dimo/device-connection-*
backend/src/modules/dimo/device-connection-webhook*/
backend/src/modules/dimo/device-connection-episode-reconciliation/
backend/src/modules/dimo/device-connection-episode-resolution/
backend/src/modules/dimo/vls-monotonic-merge.util.ts
backend/src/modules/dimo/interruption-knowledge.ts
backend/src/modules/dimo/dimo-webhook.controller.ts
backend/src/modules/dimo/dimo-telemetry.service.ts
backend/src/modules/dimo/dimo-connectivity-lifecycle-di.module.ts
backend/src/workers/processors/dimo-snapshot.processor.ts
backend/src/workers/processors/device-connection-webhook.processor.ts
```

## Backend — workers / schedulers

```
backend/src/workers/schedulers/dimo-snapshot.scheduler.ts
backend/src/workers/schedulers/snapshot-polling/*
backend/src/workers/schedulers/snapshot-wake-handoff-recovery.scheduler.ts
backend/src/workers/snapshot-wake/*
backend/src/workers/queues/queue-names.ts
backend/src/shared/scheduler-leader/*  (Scaling Process — reference)
```

## Backend — AI

```
backend/src/modules/ai/evidence/ai-evidence-telemetry.mapper.ts
backend/src/modules/ai/tools/get-vehicle-telemetry-status/*
```

## Backend — High Mobility (bounded)

```
backend/src/modules/high-mobility/*
backend/prisma — high_mobility_*, hm_latest_*
```

## Frontend

```
frontend/src/rental/lib/telemetryFreshness.ts
frontend/src/rental/lib/operational-projection/**
frontend/src/rental/lib/obd-plug-status.ts
frontend/src/rental/components/vehicle-detail/VehicleConnectivityTab.tsx
frontend/src/rental/components/vehicle-detail/vehicle-connectivity-presentation.ts
frontend/src/master/components/connected-vehicles/*
```

## Persistence (Prisma)

- `vehicle_latest_states`
- `dimo_vehicles`
- `dimo_poll_logs` (30d retention)
- `dimo_device_connection_events`
- `device_connection_webhook_inbox`
- `device_connection_episodes` (+ audits, outbox, telemetry recovery)
- Notifications (connectivity alerts — no dedicated table)

## ClickHouse

- `telemetry_snapshots` (TTL 180d, dedupe on vehicle_id+recorded_at)
- `telemetry_state_changes` (TTL 365d)

## API endpoints (connectivity)

| Method | Path |
|--------|------|
| GET | `/organizations/:orgId/fleet-connectivity` |
| GET | `/organizations/:orgId/fleet-connectivity/:vehicleId` |
| GET | `/organizations/:orgId/vehicles/:vehicleId/device-connection` |
| GET | `/admin/vehicles/operational*` |
| POST | `/webhooks/dimo` |

See [../CURRENT_STATE.md](../CURRENT_STATE.md) for semantic reconstruction.
