# LDI-10D Phase 3C.1 — Decision template

```json
{
  "MANIFEST_USABLE": "YES",
  "GPS_COORDINATES_AVAILABLE": "NO",
  "INDEPENDENT_GROUND_TRUTH_AVAILABLE": "YES",
  "ALGORITHMS_REPLAYED": "BASELINE_ONLY",
  "BASELINE_REPRODUCED": "YES",
  "BEST_VALIDATED_CANDIDATE": "L3_BASELINE_PRODUCTION",
  "ACCURACY_IMPROVEMENT_PROVEN": "NOT_ASSESSABLE",
  "NEXT_SAFE_ACTION": "Owner_authorize_commit_or_readonly_rehydrate_POSITION_payload_sha256_2dbcf7c6_before_seven_algorithm_GPS_replay",
  "baselineMaeKmh": 2.303091434778606,
  "baselineP95Kmh": 4.482993843287602,
  "baselineBiasKmh": -2.0675762203714627,
  "historicalBaselineReproduced": true
}
```

## Interpretation

- **MANIFEST_USABLE:** Identity, window, checksums, and derived per-second replay align with EXP021 Tesla reference.
- **GPS_COORDINATES_AVAILABLE:** NO in git — seven-algorithm comparative replay on identical DIMO GPS inputs is **not** executed.
- **INDEPENDENT_GROUND_TRUTH_AVAILABLE:** Video tacho witness on synchronized bucket labels (quantized 1 s clock).
- **ACCURACY_IMPROVEMENT_PROVEN:** NOT_ASSESSABLE — no candidate beat baseline under independent GPS replay.

**STOP:** Phase 3C.1 complete — await owner review. No deploy, merge, or Phase 3D.

## Repro

```bash
cd backend && npm run ldi10d:phase3c1-tesla-gps-comparative-replay
cd backend && npx jest ldi10d-phase3c1 --runInBand
```