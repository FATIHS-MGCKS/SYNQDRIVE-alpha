# Notification Ingest Concurrency

**Module:** `backend/src/modules/notifications`  
**Status:** Production (Notification Engine Remediation — Prompt 7)

## Guarantee

Notification ingest is **logically exactly-once per fingerprint identity** under parallel producers, multi-instance backends, BullMQ retries, and webhook duplicates.

## Transaction boundary

Each ingest attempt runs inside `repository.runTransaction` (`ReadCommitted`) and performs atomically:

1. `SELECT … FOR UPDATE` on latest / active fingerprint row
2. Fingerprint match (create | update | reopen | ignore)
3. `notification_occurrences` insert
4. Notification row update with optimistic `version`
5. Optional `notification_delivery_outbox` enqueue (same transaction)

Post-commit (outside transaction):

- Delivery scheduler fan-out
- Structured ingest log + `notification.ingest.audit` event

## Retry strategy

`withUniqueConflictRetry` (max **4** attempts) retries on:

| Code | Cause |
|------|--------|
| `P2002` | Partial unique `notifications_active_fingerprint_uidx` race on create |
| `P2025` | Optimistic lock version mismatch on concurrent update |

Non-retryable errors propagate — nothing is swallowed.

## Database as source of truth

- Partial unique index `(organization_id, fingerprint)` for active statuses
- Optimistic locking via `notifications.version`
- Row locks serialize ingest decisions per fingerprint

## Tests

`notification-core.service.spec.ts` — concurrency describe block (10 parallel candidates, severity race, recovery vs escalation, sourceEventId, multi-tenant isolation).
