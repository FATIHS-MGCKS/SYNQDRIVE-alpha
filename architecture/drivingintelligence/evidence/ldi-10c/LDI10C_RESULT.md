# LDI10C Phase 1 — Result

## Provenance verification

- Status: **PASS**
- LDI08 snapshot SHA-256: `effe180fe128a6c9f5c5f74f52f34ddc0c7d6f9960825d55573b02ca5b2f7009`
- LDI10B physics SHA-256: `8bf2a4257c519dff8357aed4ad6c67873e6e01dddc8bd4a8002177449123d9cb`

## Acceptance

- Maneuver groups accounted: **32/32**
- Candidates traceable: **75/75**
- Plausible / unclear preserved: **24** / **8**
- Groups touching UNTRUSTED QC: **8** (flagged in timeline + GeoJSON)
- Route GPS points: **346** (no coordinate interpolation)
- Frozen OSM for intersections/signals: **unavailable** — see `LDI10C_SPATIAL_CONTEXT.md`

## Repro

```bash
cd backend && npm run ldi10c:spatial-trip-reconstruction
```

```
LDI10C_PHASE=1
LDI10C_RESULT=SPATIAL_TEMPORAL_RECONSTRUCTION_COMPLETE
GROUPS_ACCOUNTED=32
CANDIDATES_TRACED=75
PLAUSIBLE_GROUPS=24
UNCLEAR_GROUPS=8
UNTRUSTED_TOUCHING_GROUPS=8
ROUTE_GPS_POINTS=346
MAP_CONTEXT_FROZEN_OSM=UNAVAILABLE
PRODUCTION_MUTATIONS=NONE
STOP=LDI10C_phase1_complete_no_phase2_no_deploy
```