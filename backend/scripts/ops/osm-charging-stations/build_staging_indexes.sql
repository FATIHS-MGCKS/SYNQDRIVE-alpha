CREATE INDEX IF NOT EXISTS charging_stations_staging_centroid_gist
  ON osm.charging_stations_staging USING GIST (centroid);

CREATE INDEX IF NOT EXISTS charging_stations_staging_geom_gist
  ON osm.charging_stations_staging USING GIST (geom);

CREATE INDEX IF NOT EXISTS charging_stations_staging_geom_geog_gist
  ON osm.charging_stations_staging USING GIST ((geom::geography));

ANALYZE osm.charging_stations_staging;
