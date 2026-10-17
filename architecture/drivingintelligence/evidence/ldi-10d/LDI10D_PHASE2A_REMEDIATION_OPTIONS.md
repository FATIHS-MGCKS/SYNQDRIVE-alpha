# LDI-10D Phase 2A — Remediation options (prioritized, no threshold changes in this phase)

## P0 — Evidence-only (owner-approved)
1. **Per-bucket association** instead of centroid-only snap (may resolve G2 in parking-lot / parallel-residential cases).
2. **Widen candidate search along trajectory polyline** (buffer corridor) without changing UNCERTAINTY_RADIUS gate until validated offline.
3. **Archive Mapbox matched geometry** for same trip as *descriptive* side-by-side (no L3 QC coupling).

## P1 — OSM completeness (new fetch only with owner authorization)
4. Expand highway classes (`track`, `path`, `footway` where legally drivable) in bbox extract.
5. Query `crossing=traffic_signals` and `direction=forward` signal nodes (tags not in Phase 2 query).

## P2 — Algorithm (Phase 3+)
6. Graph-based map matching (OSM topology) with explicit ambiguity retention.
7. Lane-level GPS / RTK — outside current 1 Hz pin evidence.

## Counterfactual summary (UNKNOWN only)
- Would pass G1 at **35m** radius: **17** / 18
- Would pass G1 at **50m** radius: **18** / 18
- Would pass G3 at **60°** bearing tolerance: **4** / 18 (bearing UNKNOWN groups only)
- G2 still fires at **3m** gap threshold: **7** / 18 competing groups

**MATCHING_THRESHOLD_CHANGES:** NONE (counterfactuals are diagnostic only).