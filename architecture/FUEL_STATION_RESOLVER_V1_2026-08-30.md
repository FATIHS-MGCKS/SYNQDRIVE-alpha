# Fuel Station Resolver V1

| Field | Value |
|-------|-------|
| **Date** | 2026-08-30 |
| **Resolver version** | `fuel-station-resolver-v1` |
| **Phase** | C — isolated read-only resolver (no Energy Event coupling) |

## Purpose

Given a WGS84 coordinate, determine which OSM fuel station (if any) can be assigned with sufficient **station-match confidence**.

This is separate from Energy Event confidence (`VehicleEnergyEvent.confidence`).

## Module layout

```
backend/src/modules/vehicle-intelligence/fuel-stations/
  fuel-station-location-resolver.service.ts   # orchestrator
  fuel-station-candidate.repository.ts        # PostGIS SELECT queries
  fuel-station-match-scorer.ts                # feature + base score
  fuel-station-match-decision.ts              # ambiguity + confidence
  fuel-station-dedupe.ts                      # conservative duplicate merge
  fuel-station-resolve.pipeline.ts            # row → scored candidate mapping
```

Probe CLI (read-only): `npm run fuel-station:resolve -- --lat <lat> --lon <lon> [--explain]`

## Input contract

```typescript
{ latitude: number; longitude: number }
```

Validation: finite values, latitude ∈ [-90, 90], longitude ∈ [-180, 180] → else `INVALID_COORDINATES`.

## Output contract

`FuelStationResolveResult` with `status`:

| Status | Meaning |
|--------|---------|
| `MATCHED` | Single confident station |
| `AMBIGUOUS` | Multiple similarly plausible stations |
| `NOT_FOUND` | No sufficiently strong candidate |
| `INVALID_COORDINATES` | Input validation failed |
| `ERROR` | Dataset/query operational failure |

`confidence` (station-match only): `HIGH` | `MEDIUM` | `LOW` when `MATCHED`.

## Candidate SQL (index-backed)

Single bounded query per radius attempt:

```sql
WHERE ST_DWithin(fs.centroid, query_geog, $radius_m)
ORDER BY fs.centroid <-> query_geog
LIMIT 10
```

Features computed in SQL:

- `ST_Covers(geom, point)` → `inside_geometry`
- `ST_Distance(geom::geography, point)` → `geometry_distance_m`
- `ST_Distance(centroid, point)` → `point_distance_m`

Radii:

| Stage | Radius |
|-------|--------|
| Primary | **100 m** |
| Fallback (only if primary empty) | **250 m** |

## V1 scoring (deterministic)

Base score components:

| Evidence | Points |
|----------|--------|
| Point inside station geometry | +100 |
| Geometry distance ≤ 20 m | +70 |
| Geometry distance ≤ 25 m | +60 |
| Geometry distance ≤ 50 m | +45 |
| Geometry distance ≤ 100 m | +25 |
| Point station ≤ 20 m (non-area) | +55 |
| Point station ≤ 50 m (non-area) | +35 |
| Metadata completeness ≥ 80% | +8 |
| Metadata completeness ≥ 50% | +4 |

## Ambiguity rules

`AMBIGUOUS` when top candidate score ≥ 45 and any of:

- score gap to #2 < **20**
- score gap < **25** while geometry gap < **15 m** and top score ≥ 50
- relative score gap < **15%** and top score < 85

## Match decision

| Outcome | Rule |
|---------|------|
| `NOT_FOUND` | no candidates, or top score ≤ 44 |
| `AMBIGUOUS` | ambiguity rules triggered |
| `MATCHED` | otherwise |

Station-match confidence:

| Level | Rule |
|-------|------|
| `HIGH` | score ≥ 85 and (inside geometry OR geometry distance ≤ 15 m) |
| `MEDIUM` | score ≥ 70 |
| `LOW` | score ≥ 55 |

Precision-first: weak distant clusters return `NOT_FOUND` rather than forcing a label.

## Duplicate handling (V1)

Conservative merge only when:

1. Same brand and centroid distance ≤ **8 m**
2. Same brand + same normalized name and distance ≤ **12 m**
3. Area/point pair with same brand or name, one inside geometry, distance ≤ **30 m**

Keeps higher-scoring / area representative. Does **not** merge unrelated nearby brands.

## Dataset provenance

Read from `osm.dataset_metadata WHERE is_current = true` — never hard-coded.

Empty/missing dataset → `ERROR`.

## Performance

Production evidence (2026-08-30, existing dataset):

- GiST index `fuel_stations_centroid_gist` used for `ST_DWithin` + KNN
- Kassel 100 m probe EXPLAIN: Index Scan, sub-ms class

## Real-data calibration notes

From `geofabrik-germany-20260830` (18,195 stations):

- ~91% named, ~71% branded — metadata bonus is useful but not decisive
- Mix of `POINT`, `POLYGON`, `LINESTRING` geometries
- Node-inside-polygon duplicates common for same brand — dedupe required
- Dense urban clusters need ambiguity model (20 m / 25 m pairs)
- Rural probes may return `NOT_FOUND` beyond 250 m — expected

## Limitations / edge cases

- V1 uses single coordinate only (no start/end midpoint yet)
- No `shop=fuel` expansion
- No cross-border stations outside Germany extract
- LOW confidence matches are rare; ambiguous close pairs preferred over wrong label
- Relation multipolygon coverage depends on OSM import quality

## Energy Event firewall

No changes to RefuelDetector, persistence, scoreConfidence, API, frontend, BullMQ, or enrichment tables.

## Tests

- Unit: `npm run test:fuel-stations:unit` (26 tests)
- Postgres integration (optional): `npm run test:fuel-stations:postgres` with `FUEL_STATION_POSTGRES_INTEGRATION=1`
