-- Build GiST indexes on staging before promotion.
CREATE INDEX IF NOT EXISTS fuel_stations_staging_centroid_gist
  ON osm.fuel_stations_staging USING GIST (centroid);

CREATE INDEX IF NOT EXISTS fuel_stations_staging_geom_gist
  ON osm.fuel_stations_staging USING GIST (geom);

ANALYZE osm.fuel_stations_staging;
