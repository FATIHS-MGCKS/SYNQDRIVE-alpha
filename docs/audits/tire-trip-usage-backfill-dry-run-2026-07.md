# Tire Trip Usage Ledger — Historical Backfill Dry Run (2026-07)

**Audit ID:** `tire-trip-usage-backfill-2026-07`
**Version:** `tire-trip-usage-backfill-audit-2026-07-v1`
**Generated:** 2026-07-16T18:24:09.665Z
**Mode:** fixtures (read-only)

## Filters

| Parameter | Value |
|-----------|-------|
| Organization | all |
| Vehicle | all |
| From | 2026-05-17T18:24:09.664Z |
| To | 2026-07-16T18:24:09.664Z |
| Lookback days | 60 |
| Batch size | 100 |
| Full setup history | true |

## Summary

| Metric | Count |
|--------|------:|
| Trips scanned | 9 |
| Eligible for ledger (single setup) | 4 |
| Single-setup attribution | 4 |
| Conflicts (multi/boundary) | 2 |
| No setup match | 1 |
| Incomplete history | 1 |
| Trip before first setup | 1 |
| Trip after setup removal | 0 |
| Skipped (not final) | 0 |
| Skipped (no distance) | 0 |
| Potential duplicates | 0 |
| Reprocessing candidates | 1 |
| Odometer conflicts | 1 |
| Setups with km deviation | 2 |
| Total expected km (eligible) | 159 |

## Methodology

1. **Read-only** — no ledger writes, no aggregate mutation, no tire events.
2. Trips filtered to completed + canonically final analysis (same guards as `TireTripUsageService`).
3. Setup resolution uses **historical mount periods** (fallback: setup install intervals).
4. Conflicts (multi-setup, boundary-in-trip) are flagged — **never auto-guessed**.
5. Distance: `vehicle_trips.distance_km` is authoritative; odometer envelope is cross-check only; waypoint chain is plausibility only (not summed into totals).
6. Output anonymized (`trip_<hash>`, `setup_<hash>`, `vehicle_<hash>`) — no plates/VIN/secrets.

## Setup km rollups

| Anonymized setup | Status | Trips | Expected km | Ledger km | totalKmOnSet | |Δ| km | Δ % | deviation |
|------------------|--------|------:|------------:|----------:|-------------:|-------:|----:|-----------|
| setup_96df3954a383 | ACTIVE | 2 | 87 | 40 | 80 | 47 | 117.5 | yes |
| setup_65159cc0f3ea | STORED | 2 | 72 | 0 | 22 | 50 | 227.3 | yes |

## Trip attribution sample

| Anonymized trip | Class | Setup | km | odometer Δ | conflict | reprocessing | action |
|-----------------|-------|-------|---:|-----------:|:--------:|--------------|--------|
| trip_c36fe256dc7f | SINGLE_SETUP | setup_96df3954a383 | 42 | 42 | no | NONE | eligible_for_controlled_backfill_apply |
| trip_b8ef07291769 | NO_SETUP | — | 0 | — | no | NONE | skip_not_eligible_for_ledger |
| trip_a77af7c24639 | SETUP_CHANGE_IN_TRIP | — | 0 | — | no | NONE | manual_review_required_do_not_auto_attribute |
| trip_7707f14e8e76 | SETUP_CHANGE_IN_TRIP | — | 0 | — | no | NONE | manual_review_required_do_not_auto_attribute |
| trip_d71ae01de46f | SINGLE_SETUP | setup_96df3954a383 | 45 | 45 | no | LEDGER_EXISTS_WOULD_REVISE | controlled_replay_would_revise_ledger |
| trip_2ac567add763 | SINGLE_SETUP | setup_65159cc0f3ea | 50 | 10 | yes | NONE | resolve_odometer_distance_conflict_before_apply |
| trip_0b5095b3b703 | SINGLE_SETUP | setup_65159cc0f3ea | 22 | 22 | no | NONE | eligible_for_controlled_backfill_apply |
| trip_0b510f86edc1 | TRIP_BEFORE_FIRST_SETUP | — | 0 | — | no | NONE | skip_not_eligible_for_ledger |
| trip_f77979ad5867 | INCOMPLETE_HISTORY | — | 0 | — | no | NONE | repair_mount_period_history_before_backfill |

## Detail rows

### trip_c36fe256dc7f

- **attributionClass:** SINGLE_SETUP
- **eligibleForLedger:** true
- **attributableKm:** 42
- **authoritativeDistanceKm:** 42
- **odometerDeltaKm:** 42
- **waypointPlausibilityKm:** 41.2 (not summed)
- **reprocessingPattern:** NONE
- **recommendedAction:** eligible_for_controlled_backfill_apply

### trip_b8ef07291769

- **attributionClass:** NO_SETUP
- **eligibleForLedger:** false
- **attributableKm:** 0
- **authoritativeDistanceKm:** 18
- **odometerDeltaKm:** null
- **waypointPlausibilityKm:** null (not summed)
- **reprocessingPattern:** NONE
- **recommendedAction:** skip_not_eligible_for_ledger

### trip_a77af7c24639

- **attributionClass:** SETUP_CHANGE_IN_TRIP
- **eligibleForLedger:** false
- **attributableKm:** 0
- **authoritativeDistanceKm:** 55
- **odometerDeltaKm:** null
- **waypointPlausibilityKm:** null (not summed)
- **conflictSetupIds:** setup_fff0e6ba067b, setup_d52e28eda9b7
- **reprocessingPattern:** NONE
- **recommendedAction:** manual_review_required_do_not_auto_attribute
- **notes:** setup_change_boundary_within_trip_interval; manual_review_required_no_auto_guess

### trip_7707f14e8e76

- **attributionClass:** SETUP_CHANGE_IN_TRIP
- **eligibleForLedger:** false
- **attributableKm:** 0
- **authoritativeDistanceKm:** 30
- **odometerDeltaKm:** null
- **waypointPlausibilityKm:** null (not summed)
- **conflictSetupIds:** setup_fff0e6ba067b, setup_d52e28eda9b7
- **reprocessingPattern:** NONE
- **recommendedAction:** manual_review_required_do_not_auto_attribute
- **notes:** setup_change_boundary_within_trip_interval; manual_review_required_no_auto_guess

### trip_d71ae01de46f

- **attributionClass:** SINGLE_SETUP
- **eligibleForLedger:** true
- **attributableKm:** 45
- **authoritativeDistanceKm:** 45
- **odometerDeltaKm:** 45
- **waypointPlausibilityKm:** null (not summed)
- **reprocessingPattern:** LEDGER_EXISTS_WOULD_REVISE
- **recommendedAction:** controlled_replay_would_revise_ledger

### trip_2ac567add763

- **attributionClass:** SINGLE_SETUP
- **eligibleForLedger:** true
- **attributableKm:** 50
- **authoritativeDistanceKm:** 50
- **odometerDeltaKm:** 10
- **waypointPlausibilityKm:** 48 (not summed)
- **reprocessingPattern:** NONE
- **recommendedAction:** resolve_odometer_distance_conflict_before_apply

### trip_0b5095b3b703

- **attributionClass:** SINGLE_SETUP
- **eligibleForLedger:** true
- **attributableKm:** 22
- **authoritativeDistanceKm:** 22
- **odometerDeltaKm:** 22
- **waypointPlausibilityKm:** null (not summed)
- **reprocessingPattern:** NONE
- **recommendedAction:** eligible_for_controlled_backfill_apply

### trip_0b510f86edc1

- **attributionClass:** TRIP_BEFORE_FIRST_SETUP
- **eligibleForLedger:** false
- **attributableKm:** 0
- **authoritativeDistanceKm:** 15
- **odometerDeltaKm:** null
- **waypointPlausibilityKm:** null (not summed)
- **reprocessingPattern:** NONE
- **recommendedAction:** skip_not_eligible_for_ledger

### trip_f77979ad5867

- **attributionClass:** INCOMPLETE_HISTORY
- **eligibleForLedger:** false
- **attributableKm:** 0
- **authoritativeDistanceKm:** 12
- **odometerDeltaKm:** null
- **waypointPlausibilityKm:** null (not summed)
- **reprocessingPattern:** NONE
- **recommendedAction:** repair_mount_period_history_before_backfill

---

*Read-only dry-run — projects full backfill impact before any controlled apply. Conflicts require manual review.*