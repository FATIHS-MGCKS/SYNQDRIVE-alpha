# Tiguan Trip 7e7feff1 — Offline S4 Replay

## Scope
- **Production SHA:** `aeb7234fbb76b4a80a3238e5860c6a140862a735` (algorithms from repo checkout; not executed on production)
- **Trip:** `7e7feff1-4203-4b8e-8fca-95b55a3f6f6a` | **Vehicle:** `19fedd4b-c4e8-4de8-a125-dab293326e7e`
- **Window:** 2026-10-19T17:39:00Z – 2026-10-19T17:55:48Z (145 DIMO waypoints, irregular cadence)
- **Production S4 evidence snapshots:** **0** — replay uses **waypoints + Route V2 exports** only

## Input validity
- Each waypoint → one `ResearchGpsBucket` with `l3SpeedKmh` from DIMO when present.
- **No** S4 POSITION/L3 channel reconstruction; **no** per-second synthetic measurements.
- Comparisons between decoders are **relative** (no independent video/OSM ground-truth for this evening trip).

## Route V2 (production Mapbox)
- Status: **unknown**
- Confidence: **97.1%**
- Matched distance: **10.25 km**
- Geometry: external matched polyline (not OSM way IDs)

## Offline S4 research decoders (isolated)
| Decoder | Buckets with OSM way | UNKNOWN / null way |
|---------|---------------------|-------------------|
| Forward V2 (rounded adj) | 122 | 23 |
| Backtrack R1 | 122 | 23 |
| Strict node-ID fwd | 122 | 23 |
| Route-Aware R4.1 | 121 | 24 |
| Direction-Aware P1 | 144 | 1 |

### Cross-decoder disagreement (bucket-level way ID)
- Forward vs Backtrack: **3** / 145
- Forward vs Route-Aware R4.1: **5** / 145
- Forward vs P1: **25** / 145
- Route-Aware vs P1: **30** / 145

## Stops & dynamics
- GPS path distance (Haversine sum, raw waypoints): **10.09 km**
- Canonical trip `distance_km`: **10.0**
- Detected stop clusters: **6** (see GeoJSON `stop` points)
- GPS inter-sample gaps >10s: **0** 

## Speed discrepancy (70 km/h vs trip max 52 km/h)
| Source | Value | Timestamp / note |
|--------|-------|------------------|
| `vehicle_trip_waypoints.speed_kmh` | **70** | **2026-10-19T17:53:14Z** @ (51.3485533, 9.51729) |
| Next highest waypoint | 69 | 2026-10-19T17:52:25Z |
| `vehicle_trips.max_speed_kmh` | **52** | Trip aggregate field (production read-only query) |
| `vehicle_trips.avg_speed_kmh` | **32.5** | Trip aggregate |

**Interpretation:** The **70 km/h** value is a **single DIMO waypoint observation** on a ~7s sampling grid. The trip-level **52 km/h** maximum is a **separate canonical aggregate** (likely filtered/duration-weighted enrichment), not the raw waypoint max. **Do not treat 70 km/h as certified trip max without defining the aggregation policy.**

## Confidence & limitations
- OSM names: **UNKNOWN** when `name` tag missing (see road segments CSV).
- No production S4 Forward V2 shadow run — offline Forward V2 is **research replay**, not verified production output.
- Route V2 vs S4: different engines (Mapbox vs OSM Viterbi); divergence expected — **no accuracy score** claimed.

## Artifacts
- `TIGUAN_7e7feff1_ROUTE_MAP.html`
- `TIGUAN_7e7feff1_ROUTE.geojson`
- `TIGUAN_7e7feff1_TIMELINE.csv` (observation times only)
- `TIGUAN_7e7feff1_ROAD_SEGMENTS.csv`
- `TIGUAN_ALGORITHM_COMPARISON.json`
- `replay/*.json`

**PRODUCTION_MUTATIONS=NONE**
