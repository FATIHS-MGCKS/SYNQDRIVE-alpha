-- Read-only post-promotion verification for osm.fuel_stations.
\echo '=== dataset summary ==='
SELECT
  dm.dataset_version,
  dm.is_current,
  dm.station_count AS metadata_count,
  dm.downloaded_at,
  dm.promoted_at,
  dm.source_url,
  (SELECT COUNT(*) FROM osm.fuel_stations) AS live_count
FROM osm.dataset_metadata dm
WHERE dm.is_current = true;

\echo '=== field coverage ==='
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE name IS NOT NULL AND btrim(name) <> '') AS with_name,
  COUNT(*) FILTER (WHERE brand IS NOT NULL AND btrim(brand) <> '') AS with_brand,
  COUNT(*) FILTER (WHERE operator IS NOT NULL AND btrim(operator) <> '') AS with_operator,
  COUNT(*) FILTER (WHERE street IS NOT NULL OR postcode IS NOT NULL OR city IS NOT NULL) AS with_address,
  ROUND(100.0 * COUNT(*) FILTER (WHERE name IS NOT NULL AND btrim(name) <> '') / NULLIF(COUNT(*), 0), 1) AS name_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE brand IS NOT NULL AND btrim(brand) <> '') / NULLIF(COUNT(*), 0), 1) AS brand_pct
FROM osm.fuel_stations;

\echo '=== geometry validity ==='
SELECT
  COUNT(*) FILTER (WHERE NOT ST_IsValid(geom)) AS invalid_geom,
  COUNT(*) FILTER (WHERE centroid IS NULL) AS null_centroid,
  MIN(ST_SRID(geom)) AS min_srid,
  MAX(ST_SRID(geom)) AS max_srid
FROM osm.fuel_stations;

\echo '=== nearest station samples ==='
WITH samples AS (
  SELECT * FROM (VALUES
    ('Kassel', 9.4797::float, 51.3127::float),
    ('Berlin', 13.4050::float, 52.5200::float),
    ('Munich', 11.5820::float, 48.1351::float),
    ('Hamburg', 9.9937::float, 53.5511::float),
    ('Frankfurt', 8.6821::float, 50.1109::float)
  ) AS t(label, lon, lat)
)
SELECT
  s.label,
  s.lon AS query_lon,
  s.lat AS query_lat,
  fs.name,
  fs.brand,
  fs.operator,
  fs.osm_type,
  fs.osm_id,
  ROUND(ST_Distance(
    fs.centroid,
    ST_SetSRID(ST_MakePoint(s.lon, s.lat), 4326)::geography
  )::numeric, 1) AS distance_m
FROM samples s
CROSS JOIN LATERAL (
  SELECT *
  FROM osm.fuel_stations
  ORDER BY centroid <-> ST_SetSRID(ST_MakePoint(s.lon, s.lat), 4326)::geography
  LIMIT 1
) fs
ORDER BY s.label;

\echo '=== proximity query plan (500m near Kassel) ==='
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT osm_type, osm_id, name, brand
FROM osm.fuel_stations
WHERE ST_DWithin(
  centroid,
  ST_SetSRID(ST_MakePoint(9.4797, 51.3127), 4326)::geography,
  500
)
ORDER BY centroid <-> ST_SetSRID(ST_MakePoint(9.4797, 51.3127), 4326)::geography
LIMIT 10;
