#!/usr/bin/env bash
# ============================================================================
# SynqDrive — Online bloat reclamation via pg_repack (zero exclusive lock)
# ----------------------------------------------------------------------------
# pg_repack rebuilds tables/indexes online without the long ACCESS EXCLUSIVE
# lock that VACUUM FULL needs. Preferred for production. Requires the pg_repack
# extension + client on the VPS.
#
# Install (Debian/Ubuntu):
#   sudo apt-get install -y postgresql-16-repack   # match your PG major version
#   psql "$DATABASE_URL" -c 'CREATE EXTENSION IF NOT EXISTS pg_repack;'
#
# Usage:
#   DATABASE_URL=postgres://... ./backend/scripts/ops/pg-repack.sh
#
# ALWAYS take a backup first:
#   pg_dump "$DATABASE_URL" -Fc -f /var/backups/synqdrive-$(date +%F).dump
# ============================================================================
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to the production Postgres connection string}"

TABLES=(
  public.vehicle_trip_waypoints
  public.dimo_poll_logs
  public.vehicle_trip_tracking_runs
  public.high_mobility_stream_sync_logs
  public.high_mobility_health_sync_logs
  public.trip_repairs
  public.activity_logs
)

echo "==> pg_repack reclamation starting ($(date -u +%FT%TZ))"
for t in "${TABLES[@]}"; do
  echo "--> repacking ${t}"
  pg_repack --dbname="$DATABASE_URL" --table="${t}" --no-order --wait-timeout=300 || {
    echo "!! pg_repack failed for ${t} (continuing)"; }
done
echo "==> pg_repack reclamation complete ($(date -u +%FT%TZ))"
