# LDI-10D Phase 3E — Result

```json
{
  "LDI10D_PHASE": "3E",
  "INPUT_INTEGRITY": "PASS",
  "TRIP_BUCKETS_ANALYZED": 1136,
  "CONTEXTUAL_EVENTS_TOTAL": 66,
  "OBSERVED_EVENTS": 27,
  "CONTEXT_SUPPORTED_EVENTS": 31,
  "INFERRED_CANDIDATES": 7,
  "UNKNOWN_EVENTS": 1,
  "JUNCTION_CONTEXT_EVENTS": 4,
  "CURVE_CONTEXT_EVENTS": 31,
  "HARD_BRAKING_CANDIDATES": 3,
  "CONGESTION_CANDIDATES": 0,
  "EVENTS_QC_BLOCKED": 3,
  "EVENTS_SPATIALLY_AMBIGUOUS": 66,
  "VIDEO_VALIDATION": "trusted_tacho_pairs_748_witness_speed_only",
  "PHASE3F_READINESS": "DOCUMENTED_NOT_IMPLEMENTED",
  "L3_BASELINE_DRIFT": "NONE",
  "REPLAY_TESTS": "PASS",
  "QC_MUTATIONS": "NONE",
  "PRODUCTION_MUTATIONS": "NONE",
  "DEPLOY_EXECUTED": "NO",
  "NEXT_SAFE_ACTION": "WAIT_OWNER_REVIEW",
  "headSha": "4013870db1da56a6bd73a2af33280a225022d3b0",
  "materialInconsistencies": [
    "SCOPE_SPLIT: Tesla 1136s timeline is primary for Phase 3E; 69 Phase 3A events / 32 maneuver windows / OSM junction graph apply to LDI-08 pin f3e1fa83 (different geography)."
  ],
  "phase3aEventsPreserved": true
}
```

## Repro
```bash
cd backend && npm run ldi10d:phase3e-contextual-events
cd backend && npx jest ldi10d-phase3e --runInBand
```