# Vehicle Warnings Remediation — Follow-ups (2026-07-25)

## Scope

Backend follow-ups after P0–P3 remediation deploy (`824aaa06`). Closes audit items deferred at deploy time.

## Finding bridges

`FindingBridgeService` dual-writes domain alerts into `vehicle_findings` (opt-out: `VEHICLE_FINDING_BRIDGE_ENABLED=false`):

| Source | Writer | dedupeKey |
|--------|--------|-----------|
| DTC | `DtcService` | `dtc:{vehicleId}:{code}` |
| Tire alert | `TireHealthAlertService` | `tire_alert:{alertDedupeKey}` |
| Complaint | `TechnicalObservationsService` | `complaint:{dedupeKey}` |

Domain tables remain source-of-truth; findings enable cross-layer correlation. `FindingLifecycleService.expireFinding()` added for bridge expiry path.

## VW-F-026 — telemetry clear hysteresis

- `NotificationProducerIngestService` fleet-sweep: defer RESOLVED for WARNING/CRITICAL health notifications within `VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS` (default 6h) after `lastSeenAt`.
- `TireHealthAlertService`: defer resolve when evidence is stale or within `TIRE_ALERT_EVIDENCE_GRACE_MS` (default 6h).

## VW-F-030 — tire TPMS alignment

- `TireCriticalDetector`: `tpmsLiveCritical` path when TPMS reports critical pressure without tread-based primary alert.
- `rental-health-notification.projector`: `tires` included in `MODULE_EVENT_MAP` for notification materialization.

## VW-F-031 — station scope unification

`NotificationStationScopeService.buildScopeContext` prefers `StationAccessService.resolve(userId, orgId)` when `userId` is provided; legacy `stationScope` string remains fallback. Wired through `NotificationApiService` and `NotificationDeliveryEnqueueService`.

## GDPR (WP-16)

| Component | Flag | Behavior |
|-----------|------|----------|
| `VehicleWarningRetentionScheduler` | `VEHICLE_WARNING_RETENTION_ENABLED=true` | Deletes aged resolved notifications, inactive insights, resolved/dismissed complaints, terminal findings |
| `VehicleWarningErasureService` | always callable | Redacts customer PII in complaints + notification `templateParams` |

Per-table retention days via `VEHICLE_WARNING_RETENTION_*_DAYS` env vars.

## VW-F-038 — rental-health cache warm

`RentalHealthCacheWarmService` on worker boot when `RENTAL_HEALTH_CACHE_WARM_ON_BOOT=true`: pre-populates Redis summary cache for up to 20 orgs × 50 active vehicles.

## Battery V2 DLQ replay

`BatteryV2JobDeadLetterService.clearReplayableDeadLetters()` removes transient rows (`LOCK_CONTENTION`, `TRANSIENT_INFRA`, `PROVIDER_UNAVAILABLE`). `BatteryV2ReconciliationScheduler` invokes when `BATTERY_V2_DLQ_REPLAY_ENABLED=true` so reconciliation can re-enqueue on next tick.

## Not in scope (infra-only / deferred)

- VW-F-037: full observability dashboards — no code change in this pass.
