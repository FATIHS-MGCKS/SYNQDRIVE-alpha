# Notification Database Integrity

**Migration:** `20260726120000_notification_db_integrity`  
**Module:** `backend/src/modules/notifications`  
**Status:** Production (Notification Engine Remediation — Prompt 6)

## Goals

- Prevent duplicate **active** notifications per `(organization_id, fingerprint)`
- Eliminate orphan child rows and cross-tenant `organization_id` mismatches
- Enforce status/timestamp and JSON size invariants at the database layer
- Add indexes for dashboard queries, counts, outbox workers, and retention sweeps
- Preserve optimistic locking via `notifications.version`

## Tables covered

| Table | Tenant column | Parent FK | onDelete |
|-------|---------------|-----------|----------|
| `notifications` | `organization_id` | `organizations` | CASCADE |
| `notification_occurrences` | `organization_id` | `notifications` | CASCADE |
| `notification_receipts` | `organization_id` | `notifications` | CASCADE |
| `notification_delivery_outbox` | `organization_id` | `notifications` | CASCADE |

Workflow and audit systems reference notifications only via `source_type` / activity payloads — no hard FK to workflow tables (by design).

## Active fingerprint uniqueness

**Before:** partial unique on `(organization_id, fingerprint, lifecycle_generation)` for active statuses.

**After:** stricter partial unique on `(organization_id, fingerprint)` WHERE `status IN ('OPEN','ACKNOWLEDGED','SNOOZED')`.

At most **one** active row per tenant + fingerprint. Historical generations remain as `RESOLVED` / `ARCHIVED`.

## Status values

| Status | Required timestamps |
|--------|---------------------|
| `OPEN` | — |
| `ACKNOWLEDGED` | optional `acknowledged_at` |
| `SNOOZED` | `snoozed_until` required |
| `RESOLVED` | `resolved_at` required |
| `ARCHIVED` | `archived_at` required |

## Repair strategy (pre-constraint)

1. Resolve duplicate active fingerprints (keep highest `lifecycle_generation`, then `last_seen_at`)
2. Align child `organization_id` to parent notification
3. Delete orphan occurrences / receipts / outbox rows (logged)
4. Backfill missing status timestamps

All repairs logged in `notification_integrity_repair_log`.

## Audit queries

`backend/src/modules/notifications/integrity/notification-integrity-audit.sql`

Run before deploy and after migration to verify zero duplicates/orphans.

## Production conflicts

| Risk | Mitigation |
|------|------------|
| Existing duplicate active fingerprints | Migration auto-resolves losers to `RESOLVED` |
| Cross-tenant child rows | Repaired to parent org before constraints |
| Oversized JSON payloads | CHECK fails deploy — run audit query #9 first |
| Race on concurrent inserts | Partial unique index + app `withUniqueConflictRetry` |

## Rollback

1. Drop CHECK constraints added by this migration (names suffix `_check`)
2. Drop new indexes (`*_idx`, `notifications_active_fingerprint_uidx`)
3. Recreate legacy index:

```sql
CREATE UNIQUE INDEX notifications_active_fingerprint_generation_key
  ON notifications (organization_id, fingerprint, lifecycle_generation)
  WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED');
```

4. `notification_integrity_repair_log` is audit-only — retain for forensics

**Do not** rollback without `pg_dump` backup taken immediately before deploy.

## Tests

`notification-db-integrity.schema.spec.ts` — Prisma validate, schema/index assertions, migration SQL guards.
