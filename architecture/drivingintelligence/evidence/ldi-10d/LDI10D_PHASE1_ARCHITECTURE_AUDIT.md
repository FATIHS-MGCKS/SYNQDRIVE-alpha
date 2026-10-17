# LDI-10D Phase 1 — Mapbox / OSM architecture audit

**Mode:** READ-ONLY · **PR:** #2051 · **Pinned trip:** `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9`  
**LDI chain preserved:** 362 shadow buckets, 346 GPS-present points, 75 candidates, 32 groups, 8 UNCLEAR (unchanged).

---

## 1. Mapbox dependencies and surfaces

| Layer | Role | Key paths |
|-------|------|-----------|
| **Frontend map rendering** | Fleet live map, trip route overlay | `frontend/src/components/MapboxMap.tsx`, `frontend/src/rental/components/trips/useTripsRouteMap.ts`, `frontend/src/rental/components/trips/hooks/useTripMapbox.ts` (alias) |
| **Frontend dependency** | `mapbox-gl` ^3.19.1 | `frontend/package.json` |
| **Backend trip map-matching** | Mapbox Matching API v5 `driving` profile | `backend/src/modules/vehicle-intelligence/trips/mapbox.service.ts` (URL ~line 232) |
| **Chunked matching (canonical R3)** | ≤100 coords/chunk, stitch, quality gates | `backend/src/modules/vehicle-intelligence/trips/route-artifact/chunked-matching/trip-route-chunked-matcher.ts`, `trip-route-chunked-matcher.service.ts`, `mapbox-chunk-matching.client.service.ts` |
| **Legacy matcher port** | Deprecated ≤100 stride sampler | `backend/src/modules/vehicle-intelligence/trips/mapbox-route-matcher.service.ts`, `route-map-matcher.port.ts` |
| **Trip enrichment consumer** | Speeding sections, matched geometry on enrich | `backend/src/modules/vehicle-intelligence/trips/trips.service.ts` (`enrichTrip`, `mapMatchConfidence`, `matchedGeometry`) |
| **Stations geocode / search** | Forward geocode, Mapbox Search suggest/retrieve | `backend/src/modules/stations/station-mapbox.service.ts` |
| **Vendors POI** | Suggest/retrieve proxied server-side | `backend/src/modules/vendors/vendor-mapbox.service.ts` |
| **Token resolution** | `MAPBOX_ACCESS_TOKEN` → `MAPBOX_TOKEN` → `VITE_*` → `NEXT_PUBLIC_*` | `mapbox.service.ts` `resolveMapboxAccessToken()`, `backend/.env.example` |

**Not present in Driving Intelligence (LDI) offline chain:** no Mapbox import under `backend/src/modules/vehicle-intelligence/driving-intelligence/` (grep: zero Mapbox/OSM).

---

## 2. Provenance trace (ingestion → storage → UI)

### A. LDI forensic path (PR #2051 pin — authoritative for this audit)

```
DIMO / Ruptela S4 evidence pin
  → LDI08_COMBINED_SNAPSHOT.json rows (1 Hz evaluationIndexUtc)
      gps: S4_POSITION_PIN (lat/lon, availability, positionState)
      l3: SHADOW_RUN_L3_RECONSTRUCTION_PINNED (speedKmh, qcTrustLevel, qcReasonCodes, sourceRelation)
      hf/obd: S4_R1_OBD subset (INTERVAL_ONLY semantics)
  → LDI10A/B/C forensics (candidates, groups, GeoJSON route)
```

| Signal | Provenance field (frozen) | Notes |
|--------|---------------------------|--------|
| GPS position | `gps.provenance` = `S4_POSITION_PIN_DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1` | 16 `ROW_ABSENT` buckets; no fill |
| Timestamp | `evaluationIndexUtc` calendar second | Not raw GNSS sub-second in export |
| L3 speed | `l3.provenance` = `SHADOW_RUN_L3_RECONSTRUCTION_PINNED` | Derived kinematic estimate |
| QC label | `evaluateDiV0SpeedQcInterval` replayed at pin build | See `ldi03-ruptela-combined-pin.lib.ts` |
| OBD/HF | R1 payload maps | Shared lineage; not independent GT |
| Maneuver groups | L3 Δv gates ±3 km/h | `ldi08-r1-fusion-replay.lib.ts` |

### B. Production trip UI path (separate from LDI pin)

```
DIMO route / telemetry
  → VehicleTripWaypoint (stored on enrich)
  → Optional Mapbox map-match (chunked) → matchedGeometry, legs, maxspeed annotations
  → GET canonical route → frontend useTripsRouteMap (segments or raw point LineString)
```

Core DI V0 compute (L3 at shadow): `backend/src/modules/vehicle-intelligence/driving-intelligence/core/compute-trip-intervals.ts` → `assessSourceRelationAtLabel` in `core/claims/cross-source-relation.ts`.

QC: `backend/src/modules/vehicle-intelligence/driving-intelligence/speed-qc/evaluate-di-v0-speed-qc-interval.ts` (policy V2 documented in `DI_V0_SPEED_QC_POLICY_V2.md`).

---

## 3. Route geometry: raw vs matched (pinned trip)

| Question | LDI-10C answer | Production trips answer |
|----------|----------------|-------------------------|
| Geometry source | **Raw observed GPS** per present bucket | **Measured waypoints** + optional **Mapbox-matched** polyline |
| Interpolation | **Forbidden** in LDI evidence scripts | Chunk stitch may bridge gaps; timestamps via `trip-route-mapbox-timestamps.ts` |
| Simplification | None in `LDI10C_ROUTE.geojson` | Legacy matcher subsamples >100 points (`mapMatchRoute` stride) |
| Precision loss | 1 Hz bucketization; 16 missing GPS rows | DIMO route often ~7s cadence; matching snaps to road network |
| Timestamps | `evaluationIndexUtc` only | Waypoint `recordedAt`; matching API optional `timestamps=` param |

**Conclusion for f3e1fa83 LDI work:** `GPS_GEOMETRY_SOURCE=observed_S4_pin_LineString_346_points` — **not** map-matched.

---

## 4. OSM / Overpass / road-context integrations (existing)

| Integration | Status | Location |
|-------------|--------|----------|
| Overpass traffic_signals | **Research / EXP021 only** | `backend/scripts/ops/exp021-retrospective-halt-overpass.lib.ts` |
| Frozen OSM in LDI-08…10C | **None** for this trip | `LDI10C_SPATIAL_CONTEXT.md` |
| Road network DB on VPS | **Not found** in repo | — |
| Curvature from map | **Not in LDI** | LDI-10C uses GPS bearing-Δ proxy only |
| Speed limits in DI | **Mapbox annotation** on trip enrich only | `mapbox.service.ts` legs `speedLimit` |
| Traffic-light state inference | **Not implemented** (correctly absent) | — |

---

## 5. Reusable components vs gaps

**Reusable**

- Trip route artifact pipeline (chunked Mapbox matching, gap segments, canonical read).
- Mapbox token resolution pattern (server-side proxy).
- LDI-10C GeoJSON route + maneuver timeline JSON.
- EXP021 Overpass fetch helper (needs frozen export + User-Agent; live call not for LDI offline).
- Haversine / bearing utilities (`di-v0-speed-qc-geo`, LDI-10C scripts).

**Gaps (LDI road context)**

- No versioned OSM extract bound to trip bbox / pin hash.
- No spatiotemporal association table (maneuver ↔ way ↔ signal).
- No GPS uncertainty model in evidence (horizontal accuracy not in LDI08 rows).
- No separation of “observed stop” vs “inferred signal stop” in map layer.
- Driving Intelligence module has **no** map-matching adapter (noted in `architecture/drivingintelligence/research/CHANGE_LEDGER.md`).

---

## 6. Test fixtures and acceptance gates (existing)

- Mapbox matching: `mapbox.service.matching.spec.ts`, `trip-route-chunked-matcher.spec.ts`, `trip-route-mapbox-timestamps.spec.ts`
- Speed QC: `di-v0-speed-qc-policy-v2.spec.ts`, golden specs
- LDI reproducibility: `npm run ldi10c:spatial-trip-reconstruction`, `ldi10c:phase2-*`, `ldi10c:phase3-root-cause`
- **Proposed LDI-10D Phase 2 gate:** frozen OSM artifact SHA-256 + 32/32 maneuver association rows with explicit `UNKNOWN` rate documented

---

## 7. VPS / deployment compatibility (minimal)

- **Single VPS** (per `AGENTS.md`): Phase 2 should add **git-versioned evidence files** + optional **offline** Overpass fetch at audit time (owner-approved), not a new service.
- Optional small Nest script under `backend/scripts/ops/` (mirror LDI-10C pattern) writing only to `architecture/drivingintelligence/evidence/ldi-10d/`.
- **Do not** wire Mapbox matching into LDI QC or maneuver classification without separate owner decision (licensing + non-GT warning).
