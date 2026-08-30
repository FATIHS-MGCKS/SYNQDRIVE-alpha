-- Atomic promotion: staging → current. Run inside a single transaction.
-- Renames preserve live data if this script fails before COMMIT.

BEGIN;

-- Drop previous retention table if present (from last successful swap).
DROP TABLE IF EXISTS osm.fuel_stations_old;

-- If first run, live table may be empty shell — still rename for uniform path.
ALTER TABLE IF EXISTS osm.fuel_stations RENAME TO fuel_stations_old;

ALTER TABLE osm.fuel_stations_staging RENAME TO fuel_stations;

-- Rename indexes to production names.
ALTER INDEX IF EXISTS osm.fuel_stations_staging_centroid_gist RENAME TO fuel_stations_centroid_gist;
ALTER INDEX IF EXISTS osm.fuel_stations_staging_geom_gist RENAME TO fuel_stations_geom_gist;
ALTER INDEX IF EXISTS osm.fuel_stations_staging_osm_type_osm_id_key RENAME TO fuel_stations_osm_type_osm_id_key;
ALTER INDEX IF EXISTS osm.fuel_stations_staging_pkey RENAME TO fuel_stations_pkey;

-- Recreate empty staging shell for next refresh.
CREATE UNLOGGED TABLE osm.fuel_stations_staging (LIKE osm.fuel_stations INCLUDING ALL);

-- Metadata: demote prior current, promote staging row.
UPDATE osm.dataset_metadata SET is_current = false WHERE is_current = true;

INSERT INTO osm.dataset_metadata (
  dataset_version, source_url, source_pbf_sha256, filtered_pbf_sha256,
  station_count, downloaded_at, imported_at, promoted_at, is_current
)
SELECT
  dataset_version, source_url, source_pbf_sha256, filtered_pbf_sha256,
  station_count, downloaded_at, imported_at, now(), true
FROM osm.dataset_metadata_staging;

TRUNCATE osm.dataset_metadata_staging;

COMMIT;
