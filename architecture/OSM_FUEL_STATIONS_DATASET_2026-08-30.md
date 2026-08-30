# OSM Fuel Stations Reference Dataset (PostGIS)

| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Phase** | B7–B12 — isolated geographic reference data only |
| **Status** | Production dataset live (`geofabrik-germany-20260830`) |

## Production evidence (2026-08-30)

| Metric | Value |
|--------|-------|
| Dataset version | `geofabrik-germany-20260830` |
| Station count | **18,195** |
| Named stations | **91.3%** (16,616) |
| Branded stations | **71.2%** (12,960) |
| With address fields | **64.0%** (11,643) |
| Import + promote (reuse filtered PBF) | ~6 s DB phase |
| End-to-end refresh (incl. download) | ~8 min observed |
| Peak RSS (filter stage) | ~2.0 GB |
| Disk before / after | 97 GB free → 97 GB free (51% used) |
| GiST index used | `fuel_stations_centroid_gist` (EXPLAIN ANALYZE 0.13 ms) |
| App health after | `/api/v1/health` → ok |

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
