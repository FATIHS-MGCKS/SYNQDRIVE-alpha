-- SynqDrive OSM fuel-station reference dataset (infrastructure SQL, not Prisma).
-- Schema: osm — isolated from application tables.

CREATE SCHEMA IF NOT EXISTS osm;

-- Live dataset (empty until first successful promotion).
CREATE TABLE IF NOT EXISTS osm.fuel_stations (
  id                 BIGSERIAL PRIMARY KEY,
  osm_type           TEXT NOT NULL CHECK (osm_type IN ('node', 'way', 'relation')),
  osm_id             BIGINT NOT NULL,
  name               TEXT,
  brand              TEXT,
  operator           TEXT,
  ref                TEXT,
  street             TEXT,
  housenumber        TEXT,
  postcode           TEXT,
  city               TEXT,
  country_code       CHAR(2) NOT NULL DEFAULT 'DE',
  opening_hours      TEXT,
  geom               GEOMETRY(Geometry, 4326) NOT NULL,
  -- Representative point for meter-distance queries (ST_PointOnSurface for areas).
  centroid           GEOGRAPHY(POINT, 4326) NOT NULL,
  source_timestamp   TIMESTAMPTZ,
  dataset_version    TEXT NOT NULL,
  imported_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  tags               JSONB,
  CONSTRAINT fuel_stations_osm_unique UNIQUE (osm_type, osm_id)
);

CREATE TABLE IF NOT EXISTS osm.dataset_metadata (
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

-- Staging tables (recreated each refresh run).
CREATE UNLOGGED TABLE IF NOT EXISTS osm.fuel_stations_staging (
  LIKE osm.fuel_stations INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS osm.dataset_metadata_staging (
  LIKE osm.dataset_metadata INCLUDING ALL
);

COMMENT ON SCHEMA osm IS 'OpenStreetMap reference datasets (not Prisma-managed).';
COMMENT ON COLUMN osm.fuel_stations.centroid IS 'Representative geography point: identical for nodes; ST_PointOnSurface(geom) for polygons; midpoint for lines.';
COMMENT ON TABLE osm.fuel_stations_staging IS 'Ephemeral import target; truncated before each refresh.';
