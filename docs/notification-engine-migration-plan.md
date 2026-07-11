# Notification Engine — Migration Plan (Prisma V4.9.351)

> **Status:** Additive schema only — **no** Insight backfill, **no** dashboard cutover.  
> **Migration:** `20260711120000_notification_engine_tables`

## Scope

| Artifact | Action |
|----------|--------|
| `notifications` | **CREATE** — persistent lifecycle notifications |
| `notification_occurrences` | **CREATE** — audit history per notification |
| `notification_receipts` | **CREATE** — per-user read/ack/snooze/hidden |
| `UserNotificationPreference` | **UNCHANGED** — channel prefs remain separate |
| `DashboardInsight` | **UNCHANGED** — remains producer until backfill prompt |
| `NotificationOutbox` / `NotificationDelivery` | **NOT ADDED** — deferred until dispatch architecture is wired |

---

## New tables and fields

### `notifications`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `organization_id` | FK → organizations | CASCADE delete |
| `fingerprint` | TEXT | Canonical identity string |
| `lifecycle_generation` | INT DEFAULT 1 | New row after max reopens / EVENT re-fire |
| `event_type` | TEXT | Producer code (e.g. `DRIVING_ASSESSMENT_DEVICE_QUALITY`) |
| `event_kind` | ENUM | `EVENT` \| `STATE` |
| `condition_code` | TEXT | Stable condition within entity |
| `domain` | ENUM | `NotificationDomain` |
| `severity` | ENUM | `NotificationSeverity` |
| `status` | ENUM | `OPEN` … `ARCHIVED` |
| `entity_type` / `entity_id` | ENUM + TEXT | Polymorphic anchor (no hard FK to vehicles/bookings) |
| `title_key` / `body_key` | TEXT | i18n keys only |
| `template_params` | JSONB | Interpolation payload |
| `action_type` | ENUM | CTA type |
| `action_target` | JSONB | Structured navigation target |
| `source_type` | ENUM | Producer system |
| `primary_source_ref` | TEXT | Opaque producer id (insight id, run id, …) |
| `legacy_insight_id` | TEXT NULL | **Backfill bridge** → `dashboard_insights.id` (no FK) |
| `first_seen_at` / `last_seen_at` | TIMESTAMP | |
| `occurrence_count` | INT | Denormalized counter |
| `reopen_count` | INT | Lifecycle reopen tracking |
| `acknowledged_at` / `snoozed_until` | TIMESTAMP NULL | Optional global lifecycle fields |
| `resolved_at` / `archived_at` / `expires_at` | TIMESTAMP NULL | |
| `version` | INT | Optimistic concurrency |
| `created_at` / `updated_at` | TIMESTAMP | |

### `notification_occurrences`

Audit rows — **do not** create new dashboard cards. Fields: `notification_id`, `organization_id`, `occurred_at`, `detected_at`, `source_type`, `source_ref`, `severity_at_occurrence`, `payload` (JSONB).

### `notification_receipts`

Per-user inbox state: `read_at`, `acknowledged_at`, `snoozed_until`, `hidden_at`. Unique `(notification_id, user_id)`.

---

## Constraints

### Partial unique index (manual SQL)

Prisma **does not** support partial unique indexes. Enforced in migration SQL:

```sql
CREATE UNIQUE INDEX "notifications_active_fingerprint_generation_key"
ON "notifications" ("organization_id", "fingerprint", "lifecycle_generation")
WHERE "status" IN ('OPEN', 'ACKNOWLEDGED', 'SNOOZED');
```

**Behavior:**

- At most **one** active notification per org + fingerprint + generation.
- Multiple **RESOLVED** / **ARCHIVED** rows with the same fingerprint are allowed (history).
- New **generation** allows a second active row for the same fingerprint.

### Receipt unique

```sql
UNIQUE (notification_id, user_id)
```

### Foreign keys

| Child | Parent | ON DELETE |
|-------|--------|-----------|
| notifications | organizations | CASCADE |
| notification_occurrences | notifications | CASCADE |
| notification_occurrences | organizations | CASCADE |
| notification_receipts | notifications | CASCADE |
| notification_receipts | users | CASCADE |
| notification_receipts | organizations | CASCADE |

No FK to `vehicles` / `bookings` — entity resolved via `entity_type` + `entity_id`.

---

## Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `notifications_organization_id_status_last_seen_at_idx` | org, status, last_seen_at | Inbox sort / active feed |
| `notifications_organization_id_severity_status_idx` | org, severity, status | Severity filters |
| `notifications_organization_id_domain_status_idx` | org, domain, status | Domain tabs |
| `notifications_entity_type_entity_id_idx` | entity_type, entity_id | Entity detail pages |
| `notifications_fingerprint_idx` | fingerprint | Materialize lookup |
| `notifications_expires_at_idx` | expires_at | Expiry sweeps |
| `notifications_resolved_at_idx` | resolved_at | Analytics / cleanup |
| `notifications_organization_id_fingerprint_lifecycle_genera_idx` | org, fingerprint, generation | Generation lookup |
| `notification_occurrences_notification_id_occurred_at_idx` | notification_id, occurred_at | Timeline |
| `notification_receipts_user_id_read_at_idx` | user_id, read_at | Unread counts |

---

## Lock impact (production)

| Step | Expected lock | Duration risk |
|------|---------------|---------------|
| `CREATE TYPE` (7 enums) | Lightweight catalog lock | Low |
| `CREATE TABLE` × 3 | None on existing tables | Low |
| `CREATE INDEX` on new tables | None on existing tables | Low |
| `ALTER TABLE … ADD CONSTRAINT` | Brief on new tables only | Low |

**No** `ALTER` on existing application tables. **No** table rewrites. Safe for online deploy with standard Prisma migrate.

---

## Migration order

1. Backup database (see below).
2. Deploy backend build containing migration `20260711120000_notification_engine_tables`.
3. `npx prisma migrate deploy` on VPS (via `vps-deploy-release.sh`).
4. Verify health + optional row count `SELECT COUNT(*) FROM notifications` (= 0 initially).
5. Frontend deploy **after** backend (no frontend dependency yet — ordering for future feature flags).

---

## Dry-run

### Local / staging

```bash
cd backend
npm ci
npx prisma generate
npx prisma validate
npx prisma format

# Against a disposable DB clone:
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" \
  --exit-code

# Or apply to local docker postgres:
npm run infra:up
npx prisma migrate deploy
```

### Production pre-check

```bash
# On VPS — read-only: list pending migrations
cd /opt/synqdrive/current/backend
npx prisma migrate status

# Optional: apply to staging clone first with same migration folder
```

Expected outcome: 3 new empty tables, 7 new enum types, partial unique index present:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'notifications'
  AND indexname = 'notifications_active_fingerprint_generation_key';
```

---

## Backup requirements

- **Mandatory** before first production apply: `pg_dump` snapshot (existing `vps-deploy-release.sh` runs DB backup pre-deploy).
- Retain backup until post-deploy health check passes and `prisma migrate status` shows all migrations applied.

---

## Rollback

### If migration not yet applied

- Revert git commit / deploy previous backend release. No DB action needed.

### If migration applied but no production writes yet

```sql
-- Only when notifications tables are still empty and feature unused
DROP TABLE IF EXISTS "notification_receipts";
DROP TABLE IF EXISTS "notification_occurrences";
DROP TABLE IF EXISTS "notifications";

DROP TYPE IF EXISTS "NotificationEventKind";
DROP TYPE IF EXISTS "NotificationSourceType";
DROP TYPE IF EXISTS "NotificationActionType";
DROP TYPE IF EXISTS "NotificationEntityType";
DROP TYPE IF EXISTS "NotificationDomain";
DROP TYPE IF EXISTS "NotificationStatus";
DROP TYPE IF EXISTS "NotificationSeverity";

DELETE FROM "_prisma_migrations"
WHERE migration_name = '20260711120000_notification_engine_tables';
```

Then redeploy previous backend artifact.

### If production data exists

- **Do not** drop tables. Forward-fix only. Rollback requires explicit data export + DBA review.

---

## Duplicate handling (pre-existing data)

New tables start **empty**. The partial unique index cannot conflict with legacy data.

**Future backfill** from `dashboard_insights`:

| DashboardInsight | Notification |
|------------------|--------------|
| `id` | `legacy_insight_id` + `primary_source_ref` |
| `dedupeKey` | `fingerprint` via `fingerprintPartsFromInsightDedupeKey()` |
| `type` | `event_type` |
| `severity` | `severity` (mapped) |
| `entityIds` | `entity_type` + `entity_id` |
| `isActive` | `status` (OPEN vs RESOLVED) |
| `expiresAt` | `expires_at` |
| `title` / `message` | **Not copied** — use `title_key` / `body_key` + registry |

Backfill must dedupe active insights per fingerprint before insert or use generation > 1 for conflicts.

---

## Feature-flag strategy

| Flag | Default | Purpose |
|------|---------|---------|
| `NOTIFICATIONS_V2` | `false` | Gate core engine writes (`NotificationCoreService.ingestCandidate`) |

Prompt 7 adds `NotificationCoreService` — still no dashboard read path. See `docs/notification-engine-core.md`.

---

## Deployment order

1. **Backend** — migrate + deploy (this prompt).
2. **Workers** — no change required.
3. **Frontend** — no change required until inbox API exists.

---

## Verification checklist

- [ ] `npx prisma validate`
- [ ] `npx prisma migrate deploy` on staging
- [ ] Partial unique index exists (`\d notifications` in psql)
- [ ] `npm test -- --testPathPattern=notification.repository`
- [ ] `GET /api/v1/health` OK
- [ ] `notifications` row count = 0 until materialize prompt

---

## Related docs

- `docs/notification-engine-domain-contract.md` — domain enums and lifecycle
- `docs/notification-engine-source-ownership.md` — frontend P0 transition
- `backend/src/modules/notifications/notification.repository.ts` — persistence helpers
