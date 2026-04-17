-- ============================================================================
-- Audit batch C: composite indexes for hot multi-column queries
--
-- Uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so the migration is
--   • safe to run on production without acquiring an exclusive table lock
--   • idempotent / re-runnable (no-op if the index already exists)
--
-- NOTE: `CREATE INDEX CONCURRENTLY` cannot run inside an explicit transaction
-- block. Prisma's migrate engine does NOT wrap migrations in BEGIN/COMMIT, so
-- each statement below is executed autonomously. If you run this via `psql`
-- manually, do NOT wrap the file in `BEGIN; ... COMMIT;`.
--
-- Expected impact:
--   • Trip list per vehicle ordered by startTime — index-only backward scan
--   • DTC history + active fault count per vehicle — no heap fetch
--   • Driving events per vehicle/time — supports analytics range queries
--   • TripBehaviorEvent per trip + category — fast dashboard cards
--   • Booking availability (service window detector) — single-index scan
--   • Per-org timelines (ActivityLog, OrgInvoice, OrgTask) — predictable
--     pagination regardless of tenant data volume
-- ============================================================================

-- ── VehicleTrip ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicle_trips_vehicle_id_start_time_idx"
  ON "vehicle_trips" ("vehicle_id", "start_time");

-- ── VehicleDtcEvent ─────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicle_dtc_events_vehicle_id_last_seen_at_idx"
  ON "vehicle_dtc_events" ("vehicle_id", "last_seen_at");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "vehicle_dtc_events_vehicle_id_is_active_idx"
  ON "vehicle_dtc_events" ("vehicle_id", "is_active");

-- ── DrivingEvent ────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "driving_events_vehicle_id_recorded_at_idx"
  ON "driving_events" ("vehicle_id", "recorded_at");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "driving_events_trip_id_event_type_idx"
  ON "driving_events" ("trip_id", "event_type");

-- ── TripBehaviorEvent ───────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "trip_behavior_events_trip_id_event_category_idx"
  ON "trip_behavior_events" ("trip_id", "event_category");

-- ── DimoPollLog ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "dimo_poll_logs_vehicle_id_created_at_idx"
  ON "dimo_poll_logs" ("vehicle_id", "created_at");

-- ── ActivityLog ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "activity_logs_organization_id_created_at_idx"
  ON "activity_logs" ("organization_id", "created_at");

-- ── Booking ─────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_vehicle_id_status_start_date_idx"
  ON "bookings" ("vehicle_id", "status", "start_date");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookings_organization_id_status_idx"
  ON "bookings" ("organization_id", "status");

-- ── OrgInvoice ──────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_invoices_organization_id_status_idx"
  ON "org_invoices" ("organization_id", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_invoices_organization_id_invoice_date_idx"
  ON "org_invoices" ("organization_id", "invoice_date");

-- ── OrgTask ─────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_tasks_organization_id_status_idx"
  ON "org_tasks" ("organization_id", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "org_tasks_organization_id_due_date_idx"
  ON "org_tasks" ("organization_id", "due_date");
