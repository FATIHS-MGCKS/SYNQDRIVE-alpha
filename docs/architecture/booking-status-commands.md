# Booking Status Commands

**Version:** V4.9.781 (Booking Production-Readiness Prompt 9/34)  
**Builds on:** [booking-state-machine.md](./booking-state-machine.md)

## Purpose

Dedicated, idempotent HTTP commands for every booking lifecycle status transition. Controllers validate permissions and DTOs; `BookingStatusCommandService` enforces the state machine, persists an idempotency ledger, and emits audit/workflow events **after** atomic DB writes.

## Endpoints

Base: `POST /api/v1/organizations/:orgId/bookings/:id/status/*`

| Route | Permission | Command | Target status |
|-------|------------|---------|---------------|
| `/confirm` | `booking.confirm` | `CONFIRM` | `CONFIRMED` |
| `/cancel` | `booking.cancel` | `CANCEL` | `CANCELLED` |
| `/no-show` | `booking.mark_no_show` | `MARK_NO_SHOW` | `NO_SHOW` |
| `/activate` | `booking.handover.perform` | `ACTIVATE` | `ACTIVE` |
| `/complete` | `booking.handover.perform` | `COMPLETE` | `COMPLETED` |
| `/override` | `booking.override` | `ADMIN_OVERRIDE` | body `toStatus` |

**Required header:** `Idempotency-Key` (non-empty, unique per org).

**Response:** canonical server state

```json
{
  "booking": { "id", "status", "updatedAt", ... },
  "transition": {
    "command", "from", "to", "trigger", "reasonCode",
    "idempotent": true|false,
    "replayed": true|false
  }
}
```

## Idempotency

- Table: `booking_status_commands` — unique `(organizationId, idempotencyKey)`
- Replay: same key + same booking + same command → stored result, `replayed: true`, no side effects
- Already in target status → success with `idempotent: true`, no duplicate side effects
- Concurrent requests: `pg_advisory_xact_lock` per booking during transaction
- Key conflict (same key, different booking/command) → `BOOKING_STATUS_IDEMPOTENCY_KEY_CONFLICT`

## Legacy endpoints removed

| Old | Replacement |
|-----|-------------|
| `DELETE /bookings/:id` | `POST /bookings/:id/status/cancel` |
| `POST /bookings/:id/no-show` | `POST /bookings/:id/status/no-show` |

Handover pickup/return remain at `/handover/pickup|return` but accept `Idempotency-Key` and record `ACTIVATE`/`COMPLETE` commands after successful protocol creation.

## Code layout

```
backend/src/modules/bookings/status-commands/
├── booking-status-command.service.ts      # Orchestration
├── booking-status-command.types.ts
├── booking-status-command.errors.ts
├── booking-status-command.response.ts
├── booking-status-commands.controller.ts
└── booking-status-command.service.spec.ts

backend/src/modules/bookings/dto/status-commands/
├── no-show-booking-status-command.dto.ts
└── admin-override-booking-status.dto.ts
```

## Frontend

`frontend/src/rental/lib/booking-status-idempotency.ts` — key helper  
`api.bookings.cancel` / `markNoShow` / handover methods send `Idempotency-Key` automatically.

## Tests

- `booking-status-command.service.spec.ts` — idempotency, allowed/forbidden transitions, replay, conflicts
- `booking-state-machine.spec.ts` — pure transition matrix (Prompt 8)
