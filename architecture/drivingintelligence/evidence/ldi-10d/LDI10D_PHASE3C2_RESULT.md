# LDI-10D Phase 3C.2 — Result

```json
{
  "POSITION_RECOVERY_STATUS": "COMMITTED_FIXTURE",
  "GPS_FIXTURE_COMMITTED": "YES",
  "RECORDS_RECOVERED": 1136,
  "HASH_PARITY": "YES",
  "ALGORITHMS_REPLAYED": "YES",
  "VIDEO_REFERENCE_MATCHES": 748,
  "BASELINE_MAE": 2.303091434778603,
  "BEST_CANDIDATE_MAE": 2.303091434778603,
  "BASELINE_P95": 4.482993843287588,
  "BEST_CANDIDATE_P95": 4.482993843287588,
  "BIAS_COMPARISON": {
    "baseline": -2.067576220371461,
    "best": -2.067576220371461
  },
  "COVERAGE_COMPARISON": [
    {
      "algorithm": "L3_BASELINE_PRODUCTION",
      "numericCoverage": 0.7235915492957746
    },
    {
      "algorithm": "L3_REPLAY_FROM_PINNED_POSITIONS",
      "numericCoverage": 0.7235915492957746
    },
    {
      "algorithm": "ADAPTIVE_DT_LEG_MEAN",
      "numericCoverage": 0.7235915492957746
    },
    {
      "algorithm": "MEDIAN_LEG_3S",
      "numericCoverage": 0.7235915492957746
    },
    {
      "algorithm": "CAUSAL_EMA_LEGS",
      "numericCoverage": 0.7235915492957746
    },
    {
      "algorithm": "MOTION_GATE_DISPLACEMENT",
      "numericCoverage": 0.7227112676056338
    },
    {
      "algorithm": "NONCAUSAL_OFFLINE_CENTERED_MEAN",
      "numericCoverage": 0.7235915492957746
    }
  ],
  "ACCURACY_IMPROVEMENT_PROVEN": "NO",
  "NEXT_SAFE_ACTION": "Owner_review_phase3c2_before_any_algorithm_activation"
}
```

## Repro
```bash
cd backend && npm run ldi10d:phase3c2-tesla-seven-algorithm-replay
```