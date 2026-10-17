# LDI-10D Phase 2 — Data quality & ambiguity

- Groups analyzed: **32**
- Associated (INFERRED_MAP): **14**
- UNKNOWN outcome: **18**
- UNCLEAR plausibility preserved: **8**
- GPS present / ROW_ABSENT: **346** / **16**

## Common ambiguity reasons

- BEARING_MISMATCH_123deg
- BEARING_MISMATCH_173deg
- BEARING_MISMATCH_180deg
- COMPETING_WAYS_WITHIN_5M
- NO_WAY_WITHIN_UNCERTAINTY_RADIUS
- BEARING_MISMATCH_177deg
- BEARING_MISMATCH_93deg
- BEARING_MISMATCH_176deg

## Replay

```bash
cd backend && LDI10D_USE_FROZEN_OSM=1 npm run ldi10d:phase2-osm-road-context
```