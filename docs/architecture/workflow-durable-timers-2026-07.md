# Workflow Durable Timers (Phase 6 Prompt 28)

Persistent timers and delay steps for time-based workflow automation. **PostgreSQL `workflow_timers` is the source of truth**; the 60s runtime scheduler polls due rows. No second-precision guarantees.

## Architecture

```
Booking confirmed / pickupAt changed
  → BookingPickupOverdueTimerService.scheduleOrReplace()
  → workflow_timers (SCHEDULED, occurrenceId, fireAt/dueAt)

Workflow delay action (workflow.delay)
  → WorkflowDelayActionService
  → action RUN → WAITING + RESUME_DELAY timer

Runtime scheduler (60s cron)
  → WorkflowTimerFireService.fireDueTimers()
  → markFired (idempotent) + handler by timerType
```

### Timer record

| Field | Purpose |
|-------|---------|
| `organizationId` | Tenant scope (required) |
| `occurrenceId` | Stable business key for replace/cancel |
| `fireAt` / `dueAt` | UTC due instant |
| `idempotencyKey` | Org-unique schedule key |
| `timerType` | `SCHEDULED_TRIGGER`, `RESUME_DELAY`, `RETRY_BACKOFF`, `APPROVAL_EXPIRY` |
| `status` | `SCHEDULED` → `FIRED` / `CANCELLED` |
| `payload` | Opaque trigger metadata (no PII) |

### Timer types

| Type | Use |
|------|-----|
| `SCHEDULED_TRIGGER` | Booking pickup overdue (`pickupAt + 30min` default) |
| `RESUME_DELAY` | `workflow.delay` action resume |
| `RETRY_BACKOFF` | Failed-retryable action wake-up |
| `APPROVAL_EXPIRY` | Reserved (approval still uses direct poll) |

## Booking pickup overdue flow

1. **Schedule:** On `CONFIRMED` booking sync (`TaskAutomationService.syncBookingPickupTiming`), timer fires at `pickupAt + WORKFLOW_BOOKING_PICKUP_OVERDUE_OFFSET_MINUTES` (default 30).
2. **Replace:** `pickupAt` change → `scheduleOrReplace` cancels prior `SCHEDULED` row with same `occurrenceId`.
3. **Cancel:** Status ≠ `CONFIRMED`, cancellation, or pickup → `cancelForBooking`.
4. **Fire:** `BookingPickupOverdueRecheckService` re-validates:
   - booking still `CONFIRMED`, not cancelled
   - no PICKUP handover protocol
   - no manual exception in `extrasJson`
   - customer not already contacted (outbound email since pickup)
   - org not archived/suspended
   - active workflow definition exists
5. **Emit:** `booking.pickup_overdue` via `WorkflowBookingTimingEmitterService`.

## Delay action

```json
{ "type": "workflow.delay", "config": { "minutes": 30 } }
// or
{ "type": "workflow.delay", "config": { "until": "2026-07-25T12:00:00Z" } }
```

Sets action `WAITING` + `waitingUntil`, schedules `RESUME_DELAY` timer. On fire → `PENDING` + `processRun`.

## Limits & operations

| Config | Default | Env |
|--------|---------|-----|
| Max timer delay | 30 days | `WORKFLOW_RUNTIME_MAX_TIMER_DELAY_MS` |
| Pickup overdue offset | 30 min | `WORKFLOW_BOOKING_PICKUP_OVERDUE_OFFSET_MINUTES` |
| Late fire warning | 60s | `WORKFLOW_RUNTIME_TIMER_LATE_WARNING_MS` |
| Scheduler poll | 60s | `WORKFLOW_RUNTIME_SCHEDULER_ENABLED` |

### Operational notes

- Process restart safe: timers persist in PostgreSQL.
- Clock drift: all `fireAt` stored/computed in UTC; `withinTimeWindow` uses explicit IANA timezone when needed.
- Late execution logged when `now - fireAt >= timerLateWarningMs`.
- Duplicate fire prevented via `markFired` conditional update (`SCHEDULED` only).
- Archived/suspended orgs: recheck skips emission; cancellation service cancels active runs.

## Tests

`workflow-durable-timer.spec.ts` — schedule, replace, cancel, delay action, idempotent fire, late worker, recheck guards, DST UTC offset, cross-tenant.

## Module layout

- `workflow-timers-core.module.ts` — durable timer + booking pickup (importable from Tasks)
- `workflow-durable-timer.service.ts` — schedule/replace/cancel
- `workflow-timer-fire.service.ts` — poll handler
- `workflow-delay-action.service.ts` — `workflow.delay`
- `booking-pickup-overdue-timer.service.ts` — booking lifecycle hooks
- `booking-pickup-overdue-recheck.service.ts` — business re-check at fire time
