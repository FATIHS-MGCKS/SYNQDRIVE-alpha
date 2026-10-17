# LDI-10D Phase 3E.1 — Result

```json
{
  "LDI10D_PHASE": "3E1",
  "INPUT_INTEGRITY": "PASS",
  "TESLA_OSM_SNAPSHOT": "LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json",
  "TESLA_OSM_SHA256": "34058acfba7f667414a174dc5489db02a49d8e24ba824ed4b63ec353c4769332",
  "GPS_BUCKETS": 1136,
  "ROAD_ASSOCIATED": 264,
  "ROAD_AMBIGUOUS": 512,
  "ROAD_UNKNOWN": 360,
  "JUNCTIONS_CONFIRMED": 3226,
  "TRAFFIC_SIGNALS_MAPPED": 632,
  "CONTEXTUAL_EVENTS_REPLAYED": 66,
  "SPATIAL_CONTEXT_IMPROVED": "YES",
  "HARD_BRAKING_CANDIDATES": 3,
  "L3_BASELINE_DRIFT": "NONE",
  "QC_MUTATIONS": "NONE",
  "PRODUCTION_MUTATIONS": "NONE",
  "DEPLOY_EXECUTED": "NO",
  "REPLAY_TESTS": "PASS",
  "PHASE3F_READINESS": "IMPROVED_CONTEXT_DOCUMENTED",
  "NEXT_SAFE_ACTION": "WAIT_OWNER_REVIEW",
  "headSha": "aae97962deee5d239775e1a1d78415a513f6f6af",
  "phase3eEventsExpected": 66,
  "acquisitionMode": "live_overpass_post"
}
```

## Repro
```bash
cd backend && npm run ldi10d:phase3e1-tesla-osm-spatial
cd backend && npx jest ldi10d-phase3e1 --runInBand
```

Original Phase 3E artifacts under `architecture/drivingintelligence/evidence/ldi-10d/LDI10D_PHASE3E_*` are preserved.