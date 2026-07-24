# Notification Authorization (Prompt 21)

Authorization Decision Engine bound to the Notification Engine V2 — notifications only from authorized data and processes.

## Protected notification types

| Gate kind | Event types (examples) | Authorization |
|-----------|------------------------|---------------|
| `OPERATIONAL` | Bookings, handovers, compliance, billing | Tenant scope only |
| `TECHNICAL_MONITORING` | `WEBHOOK_FAILURE`, `INTEGRATION_DISCONNECTED` | Tenant scope — no privacy-derived data |
| `HEALTH_ALERT` | `BRAKE_CRITICAL`, `TIRE_CRITICAL`, `BATTERY_CRITICAL`, `ACTIVE_DTC` | `NOTIFY` via `VehicleHealthEnforcementService.mayNotify()` |
| `DRIVING_ALERT` | `MISUSE_DETECTED`, `POSSIBLE_IMPACT`, `DRIVING_ASSESSMENT_DEVICE_QUALITY` | `NOTIFY` via `DrivingBehaviorEnforcementService.mayNotify()` |
| `CONNECTIVITY_ALERT` | `TELEMETRY_OFFLINE`, `DEVICE_UNPLUGGED`, `AUTHORIZATION_REQUIRED` | `NOTIFY` via direct decision (`GPS_LOCATION` + `ALERTS`) |

## NOTIFY integration points

| Phase | Location | Behavior |
|-------|----------|----------|
| Ingest | `NotificationCoreService.ingestCandidate` | Pre-flight gate; skip on DENY |
| Delivery enqueue | `NotificationDeliveryEnqueueService` | Re-check before outbox |
| Delivery process | `NotificationDeliveryProcessorService` | Suppress (no retry) on DENY/revocation |
| Deep link / API | `NotificationApiService.mapRows` | Re-authorize; minimize preview |
| E-mail | `NotificationEmailChannelService` | Generic body when denied |
| Revocation | `NotificationEnforcementService.handleRevocation` | Resolve active + cancel pending |

## Revocation behavior

- Active notifications (`OPEN`, `ACKNOWLEDGED`) matching revoked data category → `RESOLVED`
- Pending delivery outbox rows → `SUPPRESSED` with `NOTIFICATION_REVOKED`
- No notification retries after revocation (`markSuppressed`, not `markRetry`)

## Data minimization

- Preview: `minimizeNotificationPreviewParams` strips sensitive fields (DTC, wear, coordinates, misuse evidence)
- E-mail/Push: `minimizeNotificationDeliveryBody` uses generic title/body keys
- Deep links: action target cleared when `checkDeepLink` denies
- Internal auth metadata stored in `_auth*` template params (stripped from API)

## Decision cache

- Per evaluation run via `notification-run-context` `authCache`
- Avoids duplicate decision requests within same process

## Environment

| Variable | Default | Effect |
|----------|---------|--------|
| `DATA_AUTH_NOTIFICATION_SHADOW_MODE` | `true` | DENY logged; ingest may continue |
| `DATA_AUTH_NOTIFICATION_FAIL_CLOSED` | `false` | Blocks ingest/delivery when enabled |

## Tests

```bash
cd backend && npm test -- --testPathPattern="notification-enforcement|notification-core.authorization|notification-preview"
```

Covers: ALLOW, DENY, revocation, upstream blocked, multi-tenant, cache dedup, technical vs business, driving/health NOTIFY, core ingest skip, preview/email minimization.

## Remaining gaps

- Push channel still stubbed (`PUSH_NOT_IMPLEMENTED`)
- Insight-task-bridge automated task materialization uses separate task automation path
- Policy lifecycle webhook → `handleRevocation` wiring on REVOKED events
