# Notification Engine — Vehicle Health & Telemetry Producers (W1 / Prompt 12)

**Datum:** 2026-07-26  
**Branch:** `remediation/notification-engine-production-readiness-2026-07`  
**Wave:** W1 (Vehicle Health & Telemetrie)  
**Basis:** `docs/audits/notification-producer-migration-matrix-2026-07.md`

## Ziel

Alle Vehicle-Health-, Telemetrie-, DTC-, Connectivity- und technischen Fahrzeugmeldungen materialisieren über die kanonische Notification Engine (`NotificationCandidate` → `NotificationCoreService.ingestCandidate`). V1 `dashboard_insights`-Publish für kanonische Typen wird bei `NOTIFICATIONS_V2=true` unterdrückt; Detektoren laufen weiter für Analytics.

## Migrierte Producer

| ID | Quelle | Eventtyp(e) | Entity | occurredAt / sourceEventId | Recovery |
|----|--------|-------------|--------|---------------------------|----------|
| P-11 | `battery-critical.detector` → BI → `syncVehicleHealthWarnings` | `BATTERY_CRITICAL` | VEHICLE | Rental-health batch / module state | SUCCESS ingest nach Grace (6h) oder explizit cleared |
| P-12 | `tire-critical.detector` + `tire-health-alert.service` | `TIRE_CRITICAL` | VEHICLE | Alert-row `dedupeKey` / per-code variant | wie oben |
| P-13 | `brake-critical.detector` + `brake-health-alert.service` | `BRAKE_CRITICAL` | VEHICLE | Alert-row / module aggregate | wie oben |
| P-14 | `compliance-operational.detector` → `syncComplianceFromInsights` | `SERVICE_OVERDUE`, `TUV_OVERDUE`, `BOKRAFT_OVERDUE` | VEHICLE | Insight `dedupeKey` | Absent from BI output → SUCCESS |
| P-17 | `driving-assessment-device-quality.service` | `DRIVING_ASSESSMENT_DEVICE_QUALITY` | VEHICLE | Letztes Driving-Event `occurredAt` | `NORMAL` / `RECOVERING` → SUCCESS |
| P-20 | `notification-producer.ingest` → `syncVehicleHealthWarnings` / `ingestVehicleHealthSources` | Health module types | VEHICLE | `source.occurredAt`, `source.sourceEventId` | Sweep + explicit `cleared` |
| P-21 | `resolveInboxExcludedNotifications` | `HM_SERVICE_NO_TRACKING` | VEHICLE | runId | resolve-only (kein Inbox-Open) |
| P-22 / P-23 | `technical-observations.service` | `TECHNICAL_OBSERVATION_ACTIVE` | VEHICLE | `createdAt` / `resolvedAt` | resolve/dismiss → SUCCESS |
| P-24 | `dimo-dtc.processor` → `emitDtcHealthNotifications` | `ACTIVE_DTC` | VEHICLE | DTC event timestamp, `dtc:poll:{id}` | DTC cleared → SUCCESS; `clearedFingerprints` bypass grace |
| P-25 | `brake-dtc-evidence.producer` | `BRAKE_CRITICAL` | VEHICLE | evidence timestamp | evidence cleared |
| P-28 | `rental-health-notification.projector` | via P-20 | VEHICLE | batch run | module recovery |
| P-29…P-31 | `connectivity-alert.service` | `TELEMETRY_SOFT_OFFLINE`, `TELEMETRY_OFFLINE`, auth/coverage types | VEHICLE | `observedAt` runtime snapshot | `telemetryFreshness: live` → resolve both offline types; hard-offline resolves soft |

**Shadow → Live:** `DRIVING_ASSESSMENT_DEVICE_QUALITY`, `TECHNICAL_OBSERVATION_ACTIVE` (`shadowModeEnabled: false` in registry).

## Entfernte / unterdrückte Duplikatpfade

| Pfad | Maßnahme |
|------|----------|
| BI → `dashboard_insights` für `BATTERY_CRITICAL`, `TIRE_CRITICAL`, `BRAKE_CRITICAL`, `SERVICE_OVERDUE`, `TUV_OVERDUE`, `BOKRAFT_OVERDUE`, `DRIVING_ASSESSMENT_DEVICE_QUALITY` | `filterInsightsForDashboardPublish` + `V2_CANONICAL_INSIGHT_TYPES` |
| Rental-health module aggregate + tire/brake alert rows | `mergeVehicleHealthNotificationSources` — alert rows gewinnen |
| Device-quality system observation | `isDeviceQualitySystemObservation` — kein zweites Inbox-Event neben P-17 |
| Connectivity soft + hard gleichzeitig OPEN | Hard-offline resolved soft-offline (bestehende Policy) |

## Adapter & Ingest

- `VehicleHealthNotificationAdapter` — ACTIVE_DTC, BATTERY/TIRE/BRAKE_CRITICAL
- `ComplianceOperationalNotificationAdapter` — SERVICE/TÜV/BOKraft
- `DrivingAssessmentNotificationAdapter` — live
- `TechnicalObservationNotificationAdapter` — live
- `NotificationProducerIngestService` — `syncComplianceFromInsights`, `clearedFingerprints` grace bypass, runtime `VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS`

## Tests

- `notification-vehicle-health-telemetry-producers.spec.ts` — repeated DTC, DTC recovery, soft→hard offline, connectivity recovery, driving assessment, technical observation dedupe, compliance sync, health source merge
- `notification-producers-phase1.spec.ts` — WOB L 7503 regression, vehicle health batch sweep

## Offene Legacy-Abhängigkeiten

- Frontend: `merge-v2-with-vehicle-health.ts`, `deriveVehicleHealthAlertsFromRentalHealth`, synthetic connectivity tiles (P-44…P-49)
- `MISUSE_DETECTED` — kein Producer
- Operator-App V1 insights subset
- Station shortage noch shadow mode (W4)
- BI-Detektoren laufen weiter; nur Inbox-Publish gefiltert
