# Service/Compliance Notification V2 Producer (P2.1)

**Date:** 2026-08-18  
**Status:** Implemented — live producer, no UI cutover

## Problem

Rental-blocking TÜV, BOKraft, and HM service overdue states were computed canonically in `ServiceComplianceService` and reflected in `rental-health` `blocking_reasons`, but V2 notifications were only reachable via DashboardInsight backfill — no live ingest.

## Architecture

```
ServiceComplianceService.evaluateCompliance()
        ↓
buildComplianceInsightCandidates()   ← single shared signal builder
        ↓
projectServiceComplianceWarnings()
        ↓
ServiceComplianceNotificationAdapter (shadowModeOnly: false)
        ↓
NotificationProducerIngestService.syncServiceComplianceWarnings()
        ↓
NotificationCoreService → OPEN / REOPEN / RESOLVE
```

**Not:** DashboardInsight → Notification (legacy insight path remains for display/tasks only).

## Events

| eventType | conditionCode | Blocking when |
|-----------|---------------|---------------|
| TUV_OVERDUE | tuv_overdue | overdue (CRITICAL) |
| BOKRAFT_OVERDUE | bokraft_overdue | overdue (CRITICAL) |
| SERVICE_OVERDUE | service_overdue | HM tracked + CRITICAL severity |

Warning window (due soon) emits WARNING severity — does not block rental.

## Trigger

`BusinessInsightsService.syncVehicleHealthNotifications()` — after each BI evaluation pass, batch per org fleet.

## Lifecycle

Fleet sweep resolve mirrors `syncVehicleHealthWarnings` — stale OPEN rows cleared via SUCCESS ingest after `VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS` (default 6h).

## Coexistence

- `ComplianceOperationalDetector` + DashboardInsight unchanged (display/tasks)
- `insight-candidate.mapper` SERVICE_OVERDUE conditionCode aligned to `service_overdue`
- Legacy backfill rows with `overdue` fingerprint: monitor; separate migration if needed

## Out of scope (P2.1)

SERVICE_WINDOW, HM_SERVICE_NO_TRACKING open path, vehicle_alerts, BLOCKED_VEHICLE, VEHICLE_NOT_READY, attentionScope API, dashboard UI.

## Audit

`docs/audits/fleet-readiness-notification-parity-2026-08.md` — overall YELLOW, NOT READY FOR UI CUTOVER.
