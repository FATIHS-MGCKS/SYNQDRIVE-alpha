# SynqDrive — VPS Storage Ops Runbook

One-time / occasional operations to run **on the production VPS** to stop and reclaim
storage growth. These are deliberately **not** wired into the app (no automatic
`VACUUM FULL`, no destructive ops at runtime). Run them manually in a maintenance window.

> Take a backup before any DB-mutating step: > `pg_dump "$DATABASE_URL" -Fc -f /var/backups/synqdrive-$(date +%F).dump`

## Recommended order

1. **Stop the bleeding (app-side, already in code):**
   - Set `NODE_ENV=production` and (optionally) `LOG_LEVEL=error,warn,log`.
   - Set `DATA_RETENTION_ENABLED=true` (default) so the `DataRetentionScheduler`
     prunes append-only tables nightly (03:30). Tune `RETENTION_*_DAYS` as needed.
2. **Report what's bloated:**
   ```bash
   psql "$DATABASE_URL" -f backend/scripts/ops/pg-bloat-report.sql
   ```
3. **Reclaim the dead space** (after retention has pruned rows):
   - Online (preferred): `DATABASE_URL=... ./backend/scripts/ops/pg-repack.sh`
   - Offline fallback (locks tables): `psql "$DATABASE_URL" -f backend/scripts/ops/pg-reclaim-bloat.sql`
4. **Cap log growth:**
   ```bash
   ./backend/scripts/ops/setup-log-limits.sh
   ```

## Files

| File | What it does | Risk |
|------|--------------|------|
| `pg-bloat-report.sql` | Lists largest tables + dead-tuple bloat | read-only |
| `pg-repack.sh` | Online table/index rebuild via `pg_repack` | safe (online), backup first |
| `pg-reclaim-bloat.sql` | `VACUUM FULL` of the worst tables | locks tables — maintenance window only |
| `setup-log-limits.sh` | pm2-logrotate (50M×14, gz) + journald cap (1G/2w) | safe |
| `pg-fix-app-table-ownership.sql` | Re-assign postgres-owned app tables to `synqdrive` after migrate | safe (run as postgres) |
| `nginx-csp-didit-frame-src.snippet` | CSP `frame-src` for Didit SDK iframe on app.synqdrive.eu | manual nginx apply |
| `sync-mistral-env-to-vps.sh` | Copy `AI_*` / `MISTRAL_*` / `DOCUMENT_AI_*` from local `backend/.env` → VPS `backend.env` | secrets — backup remote env first |
| `sync-resend-dns-to-hostinger.sh` | Merge Resend DKIM/SPF/MX (`send.*`) into Hostinger DNS zone (preserves root `@` MX) | secrets — `RESEND_API_KEY` + `HOSTINGER_API_TOKEN` |
| `sync-resend-env-to-vps.sh` | Copy Resend/EMAIL block from Secret or `backend/.env` → VPS `backend.env` | secrets — backup remote env first |
| `partition-time-series.sql` | Reviewed template to RANGE-partition time-series tables | NEEDS APPROVAL — backup + maintenance window |
| `cleanup-dimo-device-connection-duplicates.ts` | Remove historical OBD plug/unplug duplicate rows (canonical state transitions only) | mutating — run `--dry-run` first |
| `backfill-brake-health-from-registration-specs.ts` | Initialize `BrakeHealthCurrent` for vehicles with registration/manual brake specs but no baseline | mutating — run `--dry-run` first |
| `audit-brake-health-baseline-candidates.ts` | Read-only per-component brake baseline backfill candidate audit (missing/unreliable BHC) | read-only — `--fixtures-only` or DB; writes anonymized report under `docs/audits/` |
| `backfill-billing-legacy.ts` | Controlled legacy SaaS billing migration (catalog, price books, subscription items, quantity ledger) | mutating — run `--dry-run` first; supports `--checkpoint-file` |
| `audit-pricing-integrity.ts` | Read-only pricing data integrity audit (tariff versions, assignments, snapshots, quotes) | read-only — JSON report, exit code 1/2 on warnings/errors |
| `audit-task-data.ts` | Read-only OrgTask integrity diagnostic (DONE gaps, duplicates, links, timing, audit trail, legacy automation) | read-only — `--organization-id`, `--format`, `--output`, `--limit`; exit 1 only on runtime errors |
| `audit-vehicle-booking-handover-data.ts` | Read-only vehicle / booking / handover consistency diagnostic (raw status vs booking truth, handover lifecycle, reservation window, cross-org links, timezone) | read-only — `--organization-id`, `--vehicle-id`, `--license-plate`, `--format`, `--output`, `--limit`; exit 1 only on runtime errors. **Runbook:** [`docs/runbooks/vehicle-operational-status-repair.md`](../../docs/runbooks/vehicle-operational-status-repair.md) |
| `repair-vehicle-booking-handover-data.ts` | Controlled repair for unambiguous vehicle/booking/handover status inconsistencies (stale RESERVED/RENTED, handover/booking reconciliation) | mutating — dry-run default; `--apply` required for writes; `--organization-id`, `--vehicle-id`, `--batch-size`. **Runbook:** [`docs/runbooks/vehicle-operational-status-repair.md`](../../docs/runbooks/vehicle-operational-status-repair.md) |
| `repair-task-data.ts` | Controlled OrgTask repair from diagnostic findings (completion backfill, duplicate supersede, timing clamp, legacy checklist docs) | mutating — dry-run default; `--apply` required for writes; `--organization-id`, `--batch-size` |
| `audit-invoice-document-links.ts` | Read-only invoice ↔ GeneratedDocument / bundle pointer consistency (legacy fallback readiness) | read-only — `--org=<uuid>`; exit 1 on critical findings |
| `repair-pricing-integrity.ts` | Controlled repair: expire stale quotes, deactivate assignments on inactive groups | mutating — `--dry-run` default path; `--execute --confirm` required |
| `prod-cleanup-dimo-device-connection-duplicates.sh` | VPS wrapper for the cleanup script above | mutating — backup first |
| `vps-setup-prometheus.sh` | Install/refresh Prometheus Docker on VPS (localhost:9090, scrapes :3001) | safe — requires `METRICS_BEARER_TOKEN` |
| `vps-setup-grafana.sh` | Install/refresh Grafana Docker on VPS (localhost:3000, SynqDrive Ops dashboard) | safe — requires Prometheus |
| `vps-enable-clickhouse-mirrors.sh` | Enable HF/Waypoint/Activity mirror flags in `backend.env` + PM2 restart | safe — post-trip CH mirrors only |
| `vps-clickhouse-log-hardening.sh` | Truncate oversized Docker logs + recreate ClickHouse with hardened config mounts | safe — CH analytics brief outage only |

### Partitioning (P2)

`partition-time-series.sql` is a **reviewed template, not auto-applied**. It converts
`dimo_poll_logs` (and, by the same pattern, `vehicle_trip_waypoints` /
`activity_logs`) to monthly RANGE partitions so retention becomes an instant
`DROP TABLE <partition>` with no bloat. Apply only after a backup, in a maintenance
window. The `DataRetentionScheduler` keeps working on partitioned tables.

> Raw telemetry already has a ClickHouse path with TTL — prefer keeping high-volume
> raw signals there rather than duplicating them long-term in Postgres.

## Notes

- Edit the table lists in `pg-repack.sh` / `pg-reclaim-bloat.sql` to match the
  current output of `pg-bloat-report.sql`.
- `VACUUM FULL` requires free disk roughly equal to the table size (it rewrites
  the table). `pg_repack` has the same transient requirement but stays online.
- After reclaiming, autovacuum tuning (P1 migration `*_autovacuum_tuning`) keeps
  bloat from re-accumulating on the high-churn tables.
