# LDI-10D Phase 3B — Result

```json
{
  "LDI10D_PHASE": "3B",
  "LDI10D_RESULT": "TRIP_CONTINUITY_STOP_GO_FORENSICS_COMPLETE",
  "INPUT_INTEGRITY": "PASS",
  "TRIP_BUCKETS_ANALYZED": 362,
  "OBSERVED_GPS_BUCKETS": 346,
  "ROW_ABSENT_BUCKETS": 16,
  "LOW_SPEED_INTERVALS": 8,
  "OBSERVED_STANDSTILLS": 0,
  "STOP_GO_CONFIRMED": 0,
  "STOP_GO_CANDIDATES": 0,
  "QC_BLOCKED_INTERVALS": 5,
  "GAP_INTERRUPTED_INTERVALS": 0,
  "JUNCTION_CONTEXT_CASES": 12,
  "CURVE_CONTEXT_CASES": 12,
  "CONCRETE_CASE_STUDIES": 6,
  "PHASE3A_REPLAY_DRIFT": "NONE",
  "REPLAY_TESTS": "PASS",
  "QC_MUTATIONS": "NONE",
  "PRODUCTION_MUTATIONS": "NONE",
  "NEXT_SAFE_ACTION": "Owner_review_phase3b_before_any_phase3c",
  "STOP": "LDI10D_phase3b_complete_wait_owner_review"
}
```

## Repro
```bash
cd backend && npm run ldi10d:phase3b-trip-continuity
cd backend && npx jest ldi10d-phase3b --runInBand
```