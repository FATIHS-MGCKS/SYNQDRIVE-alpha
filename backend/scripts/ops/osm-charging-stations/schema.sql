-- SynqDrive OSM EV charging-station reference dataset (infrastructure SQL, not Prisma).
-- Independent from osm.fuel_stations / osm.dataset_metadata (fuel lifecycle).

CREATE SCHEMA IF NOT EXISTS osm;

CREATE TABLE IF NOT EXISTS osm.charging_stations (
  id                 BIGSERIAL PRIMARY KEY,
  osm_type           TEXT NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
  osm_id             BIGINT NOT NULL,
  name               TEXT,
  brand              TEXT,
  operator           TEXT,
  network            TEXT,
  ref                TEXT,
  street             TEXT,
  housenumber        TEXT,
  postcode           TEXT,
  city               TEXT,
  country_code       CHAR(2) NOT NULL DEFAULT 'DE',
  access             TEXT,
  fee                TEXT,
  capacity           TEXT,
  opening_hours      TEXT,
  geom               GEOMETRY(Geometry, 4326) NOT NULL,
  centroid           GEOGRAPHY(POINT, 4326) NOT NULL,
  source_timestamp   TIMESTAMPTZ,
  dataset_version    TEXT NOT NULL,
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  tags               JSONB,
  CONSTRAINT charging_stations_osm_unique UNIQUE (osm_type, osm_id)
);

CREATE TABLE IF NOT EXISTS osm.charging_station_dataset_metadata (
  id                   BIGSERIAL PRIMARY KEY,
  dataset_version      TEXT NOT NULL UNIQUE,
  source_url           TEXT,
  source_pbf_sha256    TEXT,
  filtered_pbf_sha256  TEXT,
  station_count        INTEGER NOT NULL,
  downloaded_at        TIMESTAMPTZ,
  imported_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at          TIMESTAMPTZ,
  is_current           BOOLEAN NOT NULL DEFAULT false
);

CREATE UNLOGGED TABLE IF NOT EXISTS osm.charging_stations_staging (
  LIKE osm.charging_stations INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS osm.charging_station_dataset_metadata_staging (
  LIKE osm.charging_station_dataset_metadata INCLUDING ALL
);

COMMENT ON TABLE osm.charging_stations IS 'OSM amenity=charging_station reference objects (station-level, not charge_point).';
COMMENT ON COLUMN osm.charging_stations.centroid IS 'Representative point for index-friendly lookup; matching prefers geom distance.';
