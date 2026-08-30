# OSM Fuel Stations Reference Dataset (PostGIS)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Phase** | B7–B12 — isolated geographic reference data only |
| **Status** | Production infrastructure (no Energy Event coupling) |

## Purpose

Local OpenStreetMap fuel-station dataset for future `FuelStationLocationResolverService` proximity matching. Germany V1 via Geofabrik extract.

## Architecture

```
Geofabrik DE PBF
  → osmium tags-filter nwr/amenity=fuel
  → osmium check-refs
  → pyosmium importer
  → osm.fuel_stations_staging
  → validation gates
  → atomic table swap
  → osm.fuel_stations (current)
```

- **Not Prisma-managed** — raw SQL ops scripts under `backend/scripts/ops/osm-fuel-stations/`
- **App runtime access (future):** `SELECT` only via `$queryRaw` in resolver (not implemented in this phase)

## Schema

| Object | Role |
|--------|------|
| `osm.fuel_stations` | Live stations with `geom` (geometry 4326) + `centroid` (geography point) |
| `osm.dataset_metadata` | Version, checksums, counts, `is_current` flag |
| `osm.fuel_stations_staging` | UNLOGGED import target |
| `osm.fuel_stations_old` | Previous dataset retained ~24h after swap |

Unique identity: `(osm_type, osm_id)`.

Indexes: GiST on `centroid` and `geom` (built on staging before promotion).

## Refresh

```bash
backend/scripts/ops/osm-fuel-stations/osm-fuel-stations-refresh.sh
```

Runbook: `docs/runbooks/osm-fuel-stations-import.md`

## Dev parity

Local Docker Postgres image: `postgis/postgis:16-3.4-alpine` (see `backend/docker-compose.yml`).

## Energy Event firewall

No changes to detection, persistence, confidence, coordinates, API, or frontend in this phase.

## Related audit

`docs/audits/fuel-station-osm-postgis-location-enrichment-audit-2026-08.md` (PB-16 implementation evidence appended after first prod import).
