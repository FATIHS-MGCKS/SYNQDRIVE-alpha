# LDI-10D Phase 1 — Spatiotemporal matching algorithm (design)

**Status:** Design only — **no implementation** in Phase 1.

## Inputs (frozen)

1. `LDI10C_ROUTE.geojson` — `observed_gps_route` LineString + `maneuver_group_marker` / `maneuver_sub_route` features.
2. `LDI10B_MANEUVER_PHYSICS.json` — 32 groups, 8 UNCLEAR flagged (`touchesUntrustedQc`).
3. Proposed `LDI10D_OSM_ROAD_CONTEXT_EXPORT_V1` — versioned OSM features for bbox (Phase 2).

## Algorithm (read-only association)

### Step 0 — Integrity gate

- Verify LDI08 SHA-256 and group/candidate counts (32/75).
- Abort association if maneuver window has **zero** GPS-present buckets → association `UNKNOWN` with reason `DATA_GAP`.

### Step 1 — Temporal window

- For group `G` with `[startUtc, endUtc]` inclusive, select snapshot rows `R` where `evaluationIndexUtc ∈ [start, end]`.
- **Do not** synthesize coordinates for `ROW_ABSENT` rows.

### Step 2 — Representative point(s)

- **Primary:** centroid of GPS-present points in `R` (same as LDI-10C).
- **Secondary:** per-bucket associations for UNTRUSTED/QC conflict buckets (8 UNCLEAR groups) — document each bucket separately.

### Step 3 — Spatial query (OSM)

- Project WGS84 → local metric (equirectangular at bbox center acceptable for ~1.5 km box).
- Query frozen OSM index:
  - nearest drivable **way** within `r_way` (default 25 m);
  - nearest `traffic_signals` node within `r_signal` (default 35 m);
  - nearest **junction** node/way tag within `r_junction` (default 30 m).

### Step 4 — Ambiguity

If `count(features within r) > 1` with mutually incompatible types → `associationClass=UNKNOWN`, `confidence=UNKNOWN`, list candidate ids in evidence JSON.

### Step 5 — Curvature

- **Option A (OSM):** high vertex angle on associated way.
- **Option B (GPS, already in LDI-10C):** bearing Δ proxy — label `OBSERVED_GPS_BEARING` not OSM curve.

Do not merge A and B into one score.

### Step 6 — Output row per group

Emit `LDI10D_MANEUVER_ROAD_ASSOCIATION.json` row with provenance pointers (OSM export hash, LDI10C hash, bucket list).

## Mapbox matching (optional branch — not recommended as Phase 2 minimum)

If owner approves archived Matching API responses:

1. Submit **only** GPS-present sub-route coordinates (no interpolation).
2. Store **full JSON response** as evidence artifact (versioned).
3. Associate group to matched leg `roadClass` / `maxspeed` annotation with `confidence=INFERRED_MAPBOX` — still **not** ground truth.
4. Never upgrade maneuver plausibility from match confidence.

## UNCLEAR groups (8)

- Preserve `UNCLEAR_QC_OR_GAPS` and UNTRUSTED overlap from LDI-10C Phase 3 (cross-source S1 conflict).
- Road association may be `UNKNOWN` even when OSM signal is nearby if GPS/QC uncertainty flag set — record both facts without resolution.
