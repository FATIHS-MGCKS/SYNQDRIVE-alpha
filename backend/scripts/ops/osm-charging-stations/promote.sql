BEGIN;

DROP TABLE IF EXISTS osm.charging_stations_old;

DO $$
DECLARE
  live_count bigint;
BEGIN
  SELECT COUNT(*) INTO live_count FROM osm.charging_stations;
  IF live_count = 0 THEN
    DROP TABLE IF EXISTS osm.charging_stations CASCADE;
  ELSE
    ALTER TABLE osm.charging_stations RENAME TO charging_stations_old;
  END IF;
END $$;

ALTER TABLE osm.charging_stations_staging RENAME TO charging_stations;

ALTER INDEX IF EXISTS osm.charging_stations_staging_centroid_gist RENAME TO charging_stations_centroid_gist;
ALTER INDEX IF EXISTS osm.charging_stations_staging_geom_gist RENAME TO charging_stations_geom_gist;
ALTER INDEX IF EXISTS osm.charging_stations_staging_geom_geog_gist RENAME TO charging_stations_geom_geog_gist;
ALTER INDEX IF EXISTS osm.charging_stations_staging_osm_type_osm_id_key RENAME TO charging_stations_osm_type_osm_id_key;
ALTER INDEX IF EXISTS osm.charging_stations_staging_pkey RENAME TO charging_stations_pkey;

CREATE UNLOGGED TABLE osm.charging_stations_staging (LIKE osm.charging_stations INCLUDING ALL);

UPDATE osm.charging_station_dataset_metadata SET is_current = false WHERE is_current = true;

INSERT INTO osm.charging_station_dataset_metadata (
  dataset_version, source_url, source_pbf_sha256, filtered_pbf_sha256,
  station_count, downloaded_at, imported_at, promoted_at, is_current
)
SELECT
  dataset_version, source_url, source_pbf_sha256, filtered_pbf_sha256,
  station_count, downloaded_at, imported_at, now(), true
FROM osm.charging_station_dataset_metadata_staging;

TRUNCATE osm.charging_station_dataset_metadata_staging;

COMMIT;
