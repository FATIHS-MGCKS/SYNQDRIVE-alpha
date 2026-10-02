# ERD E6.2 — Charging station reference dataset and resolver (2026-09-25)

## Scope

E6.2 introduces an **independent** OpenStreetMap reference dataset and deterministic resolver for EV **charging locations** (`amenity=charging_station`). It does **not** wire recharge event enrichment, persistence, or product UI (E6.3).

## Authority boundaries

| Domain | Authority |
|--------|-----------|
| Recharge coordinates | E6.1 — DIMO segment → HvChargeSession → canonical VEE |
| Charging location reference | E6.2 — OSM station dataset + geometry-first resolver |
| Recharge station enrichment runtime | E6.3 (future) |
| Fuel stations | Existing fuel OSM pipeline — unchanged |

**ChargingStation ≠ ChargePoint.** V1 resolves station-level objects only; `man_made=charge_point` is not promoted as standalone candidates.

**FuelStation ≠ ChargingStation.** Separate tables, metadata lifecycle, importer, and resolver modules.

## OSM V1 filters

- **Include:** `amenity=charging_station` (node, way, relation)
- **Exclude:** `amenity=fuel`, `amenity=device_charging_station`, explicit `motorcar=no` / `motor_vehicle=no`
- **Absent `motorcar` tag:** included (not assumed bicycle-only)

## Infrastructure SQL

- `osm.charging_stations` / `_staging`
- `osm.charging_station_dataset_metadata` / `_staging` (not shared with fuel `osm.dataset_metadata`)

Promotion is atomic; failed validation preserves last-good live dataset.

## Resolver (`charging-station-resolver-v1`)

- Input: finite lat/lon in WGS84 bounds
- Output states: `MATCHED`, `AMBIGUOUS`, `NOT_FOUND`, `INVALID_COORDINATES`, `ERROR`
- **Geometry distance authoritative**; centroid used for index-friendly search only
- **Ambiguity policy:** fail-open — no trusted station under ambiguity
- **Metadata completeness cannot override** stronger spatial evidence
- **No external runtime lookup** (Overpass, OCM, etc.)
- Connector summary is reference metadata only — **actual used connector not inferred**

## Validation & CI

- Unit tests: resolver matrix R*, connector C*, dedupe G/R cases
- Python importer/validation tests (I*)
- PostgreSQL gate: `charging-station-location-resolver.postgres.integration.spec.ts` (PG1–PG15), `boundary-repair-postgres-ci.sh` step **15/15**

## CI closure addendum (2026-09-25)

Required Vehicle Detail `backend-boundary-postgres` job uses **PostGIS-enabled** service image (`postgis/postgis:16-3.4`) with explicit `CREATE EXTENSION postgis` before Prisma push. E6.2 PG1–PG15 require real `PostGIS_Version()` — plain `postgres:16-alpine` is insufficient.

Explicit closure tests: G3 polygon-edge fixture; I11 invalid geometry validation; I12 failed validation preserves L1 live dataset; pyosmium required in CI importer step.

SynqDrive Code → Changes/Architektur UI entries for E6.2 were deferred to a separate PR (no mixed governance-authority + presentation change with `.github/workflows/*` per i18n authority protection).

## Presentation seal addendum (2026-09-26)

SynqDrive Code **Architektur** and **Changes** entries for E6.2 added in presentation-seal PR (post-merge #1781). UI deferral closed; E6.2 technical evidence unchanged.


- No Production charging dataset import
- No Prisma schema migration
- No `VehicleEnergyEvent` mutation or enrichment jobs
