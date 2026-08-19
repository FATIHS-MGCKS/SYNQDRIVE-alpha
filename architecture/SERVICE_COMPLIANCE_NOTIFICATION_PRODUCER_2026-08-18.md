# Service/Compliance Notification V2 Producer (P2.1)

**Date:** 2026-08-18  
**Status:** Hardening pass — live producer, overdue-only semantics, BI-independent trigger. **YELLOW / NOT READY FOR UI CUTOVER**

## Problem

Rental-blocking TÜV, BOKraft, and HM service overdue states are computed canonically in `ServiceComplianceService` and reflected in `rental-health` `blocking_reasons`, but V2 notifications were initially wired through `BusinessInsightsService.runForOrganization()` — which exits early when `policy.enabled === false`.

## Architecture (post-hardening)

```
NotificationEvaluationService.executeRun()     ← canonical runtime trigger
  (scheduled / debounced / boot via BusinessInsightsScheduler)
        ↓
VehicleHealthNotificationSyncService.syncForOrganization()
        ↓
ServiceComplianceService.evaluateCompliance()  (per vehicle)
        ↓
projectServiceComplianceOverdueNotifications()   ← true overdue only
        ↓
ServiceComplianceNotificationAdapter (shadowModeOnly: false)
        ↓
NotificationProducerIngestService.syncServiceComplianceWarnings()
        ↓
NotificationCoreService → OPEN / REOPEN / RESOLVE
```

**Not:** `Business Insights enabled → vehicle health notifications`  
**Not:** DashboardInsight → Notification (insight path remains for display/tasks only)

`BusinessInsightsService` may still run detectors and publish DashboardInsights when policy is enabled; it no longer owns fleet-readiness notification sync.

## Events (P2.1 scope — overdue only)

| eventType | conditionCode | Emitted when |
|-----------|---------------|--------------|
| TUV_OVERDUE | tuv_overdue | `tuvBokraft.tuvOverdue === true` |
| BOKRAFT_OVERDUE | bokraft_overdue | `tuvBokraft.bokraftOverdue === true` |
| SERVICE_OVERDUE | service_overdue | HM tracked + `nextService.severity === 'CRITICAL'` (and TÜV/BOKraft not already overdue) |

**Excluded from P2.1:** warning/due-soon windows (`WARNING` severity, imminent TÜV/BOKraft). Those remain in Business Insights / operational tasks — not projected as `*_OVERDUE` V2 events.

## Canonical trigger

| Layer | Component |
|-------|-----------|
| Scheduler | `BusinessInsightsScheduler` (cron + boot stagger) |
| Queue | `NOTIFICATION_EVALUATION` BullMQ queue |
| Runtime | `NotificationEvaluationService.executeRun()` |
| Producer | `VehicleHealthNotificationSyncService` |

Fleet-readiness sync runs on **every** evaluation pass, regardless of tenant insight policy.

## Rental-blocking source of truth

Single shared policy: `evaluateServiceComplianceRentalBlocking()` in  
`service-compliance-rental-blocking.policy.ts`

- **Cause detection:** `tuvOverdue`, `bokraftOverdue`, `serviceOverdue` — independent; multiple causes may coexist as separate V2 notifications
- **Rental UX dedup:** `serviceOverdueBlocksRental` — suppresses duplicate service entry in `blocking_reasons` only when TÜV/BOKraft already block; does **not** suppress `SERVICE_OVERDUE` notification emission

Used by:
- `RentalHealthService.collectBlockingReasons()` (blocking reasons display)
- `projectServiceComplianceOverdueNotifications()` (`blocksRental` metadata on SERVICE_OVERDUE)

**Note:** `NextServiceComplianceDto.blocksRental` remains `false` even on CRITICAL — historical API contract for HM service module display.

## Evaluation run failure semantics

When Business Insights throws, `NotificationEvaluationService`:
1. Logs error, increments `stats.failureCount`
2. **Still runs** `VehicleHealthNotificationSyncService.syncForOrganization()`
3. Re-throws BI error → BullMQ job marked failed (`observeEvaluationJob: error`)

Fleet-readiness sync errors are also logged, increment failure count, and rethrow if BI succeeded.

## Registry metadata

| eventType | producerModule | sourceType |
|-----------|----------------|------------|
| TUV_OVERDUE | `vehicle-intelligence` | `DASHBOARD_INSIGHT` (unchanged — persistence contract) |
| BOKRAFT_OVERDUE | `vehicle-intelligence` | `DASHBOARD_INSIGHT` |
| SERVICE_OVERDUE | `vehicle-intelligence` | `DASHBOARD_INSIGHT` |

`producerModule` reflects canonical evaluation owner. `sourceType` unchanged — no fingerprint/lifecycle impact.

## Lifecycle

Fleet sweep uses **eventType-filtered pagination** (`TUV_OVERDUE`, `BOKRAFT_OVERDUE`, `SERVICE_OVERDUE`, page size 500) — not the generic vehicle-health sweep limit.

Stale OPEN rows cleared via SUCCESS ingest after `VEHICLE_HEALTH_NOTIFICATION_CLEAR_GRACE_MS` (default 6h).

Full OPEN → idempotent repeat → RESOLVE → REOPEN proven for all three event types in `service-compliance-notification.spec.ts`.

## Legacy `overdue` fingerprint

Pre-P2.1 `insight-candidate.mapper` mapped `SERVICE_OVERDUE` → conditionCode `overdue`. DashboardInsight backfill could therefore persist V2 rows:

`orgId|SERVICE_OVERDUE|VEHICLE|vehicleId|overdue|v1`

Live P2.1 producer uses `service_overdue`. Reconciliation in `reconcileLegacyServiceOverdueFingerprints()` resolves **all** active legacy rows (cases A: canonical active, B: canonical recovered).

## Known technical debt (P2.1)

Per vehicle, sync still calls both `RentalHealthService.getVehicleHealth()` and `ServiceComplianceService.evaluateCompliance()` — duplicate snapshots of compliance state. Follow-up: single evaluation snapshot → rental-health projection + notification projection.

## Out of scope (P2.1)

SERVICE_WINDOW, HM_SERVICE_NO_TRACKING open path, vehicle_alerts, BLOCKED_VEHICLE, VEHICLE_NOT_READY, attentionScope API, dashboard UI.

## Audit

`docs/audits/fleet-readiness-notification-parity-2026-08.md` — overall **YELLOW**, **NOT READY FOR UI CUTOVER**, **READY FOR P2.2** after hardening gates.
