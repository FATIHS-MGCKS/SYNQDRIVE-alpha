# LDI10C — Spatial context

**Trip:** `f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9` · **Phase:** 1 (offline reconstruction)

## Map-data provenance

- **Frozen OSM in PR #2051 LDI chain:** **no**
- **Blocker:** No trip-scoped frozen OpenStreetMap/Overpass export in ldi-08/09/10/10b for f3e1fa83; offline mode forbids live Overpass fetch.
- **BBox (observed GPS):** south=51.3999883, west=9.6561166, north=51.4079316, east=9.6719416

## Verified from pin (not map)

- GPS polyline points: **346**
- Curvature proxies (bearing Δ≥25° between consecutive segments): **35** — *hypothesis: turn segment; not OSM-verified curve*
- Low-speed L3 buckets (≤5 km/h): **0** — *stopping candidate from speed only*
- Native corner event buckets: **0** — none

## Not claimed

- intersection_proximity
- traffic_signal_proximity
- named_road_geometry
- braking_cause_from_map

## Sequential patterns (kinematic only)

| Pattern | Groups | Note |
|---------|--------|------|
| OVERSEGMENTATION_CLUSTER | MANEUVER_DECELERATION_21 → MANEUVER_DECELERATION_23 → MANEUVER_DECELERATION_24 → MANEUVER_DECELERATION_27 → MANEUVER_DECELERATION_31 → MANEUVER_DECELERATION_32 → MANEUVER_ACCELERATION_16 | 7 single-step groups — consistent with LDI-10B oversplitRisk on ±3 km/h gate.… |



**No road context proves braking cause or driver intent.**