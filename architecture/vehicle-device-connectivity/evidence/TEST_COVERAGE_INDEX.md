# Vehicle & Device Connectivity — Test Coverage Index (Phase 1)

Classification: **UNIT** | **REGRESSION** | **INTEGRATION** | **NO TEST**

## Core freshness / interpreter

| Test | Type | Claims covered |
|------|------|----------------|
| `telemetry-freshness.resolver.spec.ts` | UNIT | 15m/24h/48h, priority, backfill guard |
| `vehicle-state-interpreter.spec.ts` | UNIT | Classification, legacy onlineStatus |
| `connectivity-state-regression.spec.ts` | REGRESSION | Threshold constants, FC-P1-03 provider-link gap |

## Runtime builder / domain

| Test | Type | Claims |
|------|------|--------|
| `vehicle-connectivity-runtime-state.builder.spec.ts` | UNIT | Dimensions, precedence, unplug/recovery |
| `connectivity-domain.spec.ts` | UNIT | Priority map, invariants |
| `physical-device-evidence.spec.ts` | UNIT | Evidence ordering |
| `provider-link-state.builder.spec.ts` | UNIT | Link precedence chain |
| `connectivity-diagnostic-state.spec.ts` | UNIT | Diagnostic vs freshness split |
| `connectivity-consumer-migration.spec.ts` | REGRESSION | Legacy projection contract |
| `connectivity-diagnostic-hardening.spec.ts` | REGRESSION | Diagnostic tenant isolation |

## DIMO connectivity / alerts / episodes

| Test | Type | Claims |
|------|------|--------|
| `connectivity-alert.policy.spec.ts` | UNIT | Alert policy matrix |
| `connectivity-alert.service.spec.ts` | UNIT | Notification delivery |
| `connectivity-alert-policy-regression.spec.ts` | REGRESSION | FC-C-03 registry |
| `device-connection-episode.service.spec.ts` | UNIT | Episode lifecycle |
| `device-connection-webhook*.spec.ts` | UNIT/INT | Inbox pipeline |
| `vls-monotonic-merge.util.spec.ts` | UNIT | Monotonic guard |
| `dimo-snapshot.*.spec.ts` | UNIT/INT | Processor, trip isolation, wake |

## Snapshot wake / polling

| Test | Type | Claims |
|------|------|--------|
| `snapshot-wake-*.spec.ts` | UNIT/INT | Wake intake, handoff, recovery |
| `derive-snapshot-polling-tier.spec.ts` | UNIT | Tier cadence |
| `dimo-snapshot.scheduler.spec.ts` | UNIT | Scheduler tick |
| `scheduler-leader-multi-replica.integration.spec.ts` | INTEGRATION | Leader election |

## Fleet API

| Test | Type | Claims |
|------|------|--------|
| `vehicles.service.fleet-connectivity.spec.ts` | UNIT | Tenant isolation, contract |
| `vehicles.controller.fleet-connectivity.spec.ts` | UNIT | Guards, permissions |
| `fleet-connectivity-api.mapper.spec.ts` | UNIT | Sort, KPI, timeline |

## Frontend

| Test | Type | Claims |
|------|------|--------|
| `vehicle-connectivity-presentation.test.ts` | UNIT | Detail presentation |
| `VehicleConnectivityTab.test.tsx` | UNIT | Tab rendering |
| `connectivity-cross-surface-certification.test.tsx` | REGRESSION | Cross-surface consistency |

## Gaps (NO TEST or PRODUCTION ONLY)

- Operational list `resolveRowTelemetry` reduced evidence path
- `dimo.controller.ts` admin 15m/24h debug thresholds vs canonical 48h
- HM → canonical runtime integration
- End-to-end webhook → poll → UI at Production cadence
- LTE_R1 physical sleep interval (Phase 2)
