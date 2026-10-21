-- Post-promotion sanity: spatial indexes exist on live charging_stations.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'osm'
  AND tablename = 'charging_stations'
  AND indexname IN (
    'charging_stations_centroid_gist',
    'charging_stations_geom_gist',
    'charging_stations_geom_geog_gist'
  );
