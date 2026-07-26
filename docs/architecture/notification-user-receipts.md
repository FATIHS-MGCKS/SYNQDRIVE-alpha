# Notification User Receipts vs Domain Lifecycle

**Module:** `backend/src/modules/notifications/access`  
**Migration:** `20260726140000_notification_receipt_user_state`  
**Status:** Production (Notification Engine Remediation — Prompt 10)

## Separation model

| Layer | Storage | Examples |
|-------|---------|----------|
| **Domain lifecycle** | `notifications.status` | OPEN, ACKNOWLEDGED, SNOOZED, RESOLVED, ARCHIVED |
| **Personal inbox** | `notification_receipts` | readAt, acknowledgedAt, snoozedUntil, hiddenAt, lastSeenAt |

`READ` is not a domain status. Unread is computed per user (`readAt IS NULL`).

## Receipt fields

| Field | Scope | Notes |
|-------|-------|-------|
| `readAt` | per user | Mark-as-read never changes org status |
| `acknowledgedAt` | per user | Personal ack via API; org-wide ack via `NotificationCoreService.acknowledgeNotification` |
| `snoozedUntil` | per user | Personal snooze hides from inbox; CRITICAL still surfaces |
| `hiddenAt` | per user | Soft-hide only; mandatory/compliance rows remain visible |
| `lastSeenAt` | per user | Last personal view timestamp |

Unique constraint: `(notification_id, user_id)` — receipts are org- and user-scoped.

## Rules

- Personal snooze ≠ org `SNOOZED` lifecycle state.
- Hide does not delete notifications or resolve compliance items.
- Counts (`/counts`) exclude personal snooze + hidden overlays; CRITICAL bypasses snooze exclusion.
- Inactive memberships (`SUSPENDED`, etc.) cannot access receipts.
- Cross-tenant access returns 404 at notification layer.

## API surface

| Endpoint | Effect |
|----------|--------|
| `POST …/read` | Receipt `readAt` + `lastSeenAt` |
| `POST …/acknowledge` | Personal `acknowledgedAt` |
| `POST …/snooze` | Personal `snoozedUntil` |
| `POST …/hide` | Personal `hiddenAt` (non-mandatory only) |
| `POST …/resolve` | Org-wide `RESOLVED` |

## Tests

- `access/notification-receipt.separation.spec.ts`
- `api/notification-api.service.spec.ts` — multi-user read, read≠resolve, snooze, counts, suspended user
