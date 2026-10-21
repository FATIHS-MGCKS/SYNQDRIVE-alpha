# OSM EV charging-station reference dataset — ops runbook

## Scope

Imports **only** `amenity=charging_station` into `osm.charging_stations` via staging + validation + atomic promotion.
Does **not** modify fuel dataset tables (`osm.fuel_stations`, `osm.dataset_metadata`).

## Prerequisites

- PostGIS-enabled PostgreSQL
- Apply `schema.sql` once per environment
- Python deps: `pyosmium`, `psycopg2` (same as fuel importer host)

## Refresh lifecycle (non-Production agents)

1. Download/filter Geofabrik PBF (charging filter — analogous to fuel refresh script)
2. `charging_station_importer.py --pbf … --dataset-version …`
3. `build_staging_indexes.sql`
4. `validate_dataset.py --dataset-version …`
5. `spatial_verify.sql`
6. `promote.sql`

Failed validation **must not** run `promote.sql` — live dataset unchanged.

## Resolver

Runtime uses local tables only (`ChargingStationLocationResolverService`).
Version: `charging-station-resolver-v1`.

## Tests

```bash
cd backend/scripts/ops/osm-charging-stations && bash run-tests.sh
cd backend && npx jest charging-stations --runInBand
ERD_E6_2_POSTGRES_INTEGRATION=1 npx jest charging-station-location-resolver.postgres.integration --runInBand
```
