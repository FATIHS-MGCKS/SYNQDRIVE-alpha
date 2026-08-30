# OSM Fuel Stations Dataset — Import Runbook

Operational guide for the isolated `osm` schema fuel-station reference dataset.
This dataset is **not** connected to Energy Events or the frontend resolver in this phase.

## Prerequisites (production VPS)

| Requirement | Command / note |
|-------------|----------------|
| PostgreSQL 16 + PostGIS 3.4+ | `sudo -u postgres psql -d synqdrive -c 'SELECT PostGIS_Version();'` |
| osmium-tool | `osmium --version` |
| Python deps | `sudo apt install -y python3-pyosmium python3-psycopg2` |
| Disk | `df -h /` — **≥10 GB free** recommended |
| RAM | `free -h` — **≥1 GB MemAvailable** before heavy steps |
| App health | `curl -sf https://app.synqdrive.eu/api/v1/health` |

## Dataset pipeline

```
Geofabrik germany-latest.osm.pbf
  → osmium tags-filter nwr/amenity=fuel  (referenced nodes retained; no -R)
  → osmium check-refs
  → pyosmium lean import → osm.fuel_stations_staging
  → validation gates A–L
  → atomic promote → osm.fuel_stations
```

## One-shot refresh (production)

```bash
cd /opt/synqdrive/current/backend/scripts/ops/osm-fuel-stations
export BACKEND_ENV=/opt/synqdrive/shared/backend.env
bash osm-fuel-stations-refresh.sh
```

Environment overrides:

| Variable | Default | Purpose |
|----------|---------|---------|
| `OSM_FUEL_WORK_DIR` | `/var/tmp/synqdrive-osm-fuel` | Temp download/filter workspace |
| `OSM_FUEL_MIN_FREE_GB` | `10` | Abort if less free on `/` |
| `OSM_FUEL_SKIP_HEALTH` | `0` | Set `1` to skip app health gate |
| `OSM_FUEL_SKIP_DOWNLOAD` | `0` | Set `1` to reuse existing filtered PBF in work dir |
| `OSM_FUEL_KEEP_FILTERED` | `0` | Set `1` to retain filtered PBF after success |

Exit codes: `0` success; non-zero failure (live dataset unchanged on validation/promotion failure).

## Post-import verification

```bash
source /opt/synqdrive/shared/backend.env
psql "$DATABASE_URL" -f spatial_verify.sql
```

## Schema objects

- `osm.fuel_stations` — current live dataset
- `osm.fuel_stations_staging` — ephemeral import target
- `osm.fuel_stations_old` — previous dataset (retain ~24h, then `DROP`)
- `osm.dataset_metadata` — version/provenance (`is_current = true` for active)

Dataset version format: `geofabrik-germany-YYYYMMDD`.

## Representative point semantics

| Geometry | `centroid` (geography) |
|----------|------------------------|
| Point | Same as geometry |
| Polygon / multipolygon | `ST_PointOnSurface(geom)` |
| Linestring | `ST_LineInterpolatePoint(geom, 0.5)` |

## Failure handling

- Download/filter/import/validation failure: **live `osm.fuel_stations` untouched**
- Staging truncated on next run
- Full Germany PBF deleted after successful filter (unless debugging)
- Filtered PBF deleted after successful promotion (unless `OSM_FUEL_KEEP_FILTERED=1`)

## Energy Event firewall

This pipeline does **not** modify RefuelDetector, scoreConfidence, persist gates, coalescing, pruning, reconciliation, recovery, coordinates, confidence, API, or frontend.

## Attribution (future UI phase)

Display **© OpenStreetMap contributors** when showing matched station names (ODbL).
