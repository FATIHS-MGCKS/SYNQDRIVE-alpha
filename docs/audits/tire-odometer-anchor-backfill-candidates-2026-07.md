# Tire Odometer Anchor — Backfill Candidate Audit (2026-07)

**Audit ID:** `tire-odometer-anchor-backfill-2026-07`
**Generated:** 2026-07-16T17:41:09.696Z
**Mode:** fixtures (read-only)

## Summary

| Metric | Count |
|--------|------:|
| Setups audited (missing traceable anchor) | 8 |
| Safe candidate (EXACT/HIGH/MEDIUM) | 4 |
| Conflicting | 1 |
| No safe candidate | 1 |

### By confidence class

- **EXACT:** 1
- **HIGH_CONFIDENCE:** 2
- **MEDIUM_CONFIDENCE:** 1
- **LOW_CONFIDENCE:** 2
- **NO_SAFE_CANDIDATE:** 1
- **CONFLICTING_DATA:** 1

## Methodology

1. Targets: setups with `installed_odometer_km IS NULL` or `odometer_anchor_status` ∈ {`ANCHOR_REQUIRED`,`MEASUREMENT_REQUIRED`}.
2. Candidate priority: documented install/registration → DIMO history → HM history → snapshot history → workshop docs → trip odometer boundaries.
3. **Excluded:** retroactive inference from current `vehicle_latest_states.odometer_km` minus trip km (never treated as historical truth).
4. Rollbacks, provider switches, and delayed telemetry downgrade confidence.
5. Output is anonymized (`setup_<hash>`) — no VIN, plates, GPS, or secrets.

## Per-setup candidates

| Anonymized setup | installedAt | candidateKm | source | Δt (h) | confidence | recommendedAction |
|------------------|-------------|------------:|--------|-------:|------------|-------------------|
| setup_617c25d50954 | 2026-03-15T10:00:00.000Z | 45200 | DOCUMENTED_INSTALL_MEASUREMENT | 0.3 | EXACT | eligible_for_prompt_8_controlled_apply_with_human_review |
| setup_fa8c76f5e432 | 2026-03-15T10:00:00.000Z | 88120 | DIMO_HISTORICAL | 2.5 | HIGH_CONFIDENCE | eligible_for_prompt_8_controlled_apply_with_human_review |
| setup_0d3b3a96207c | 2026-03-15T10:00:00.000Z | 12050 | HIGH_MOBILITY_HISTORICAL | 1.0 | HIGH_CONFIDENCE | eligible_for_prompt_8_controlled_apply_with_human_review |
| setup_d375d0815b37 | 2026-03-15T10:00:00.000Z | 67300 | HANDOVER_PROTOCOL | 23.0 | MEDIUM_CONFIDENCE | manual_review_then_optional_prompt_8_apply |
| setup_2429ada08064 | 2026-03-15T10:00:00.000Z | 15000 | TRIP_ODOMETER_BOUNDARY | 214.0 | LOW_CONFIDENCE | require_workshop_or_telemetry_confirmation_before_apply |
| setup_f2f05ba4b956 | 2026-03-15T10:00:00.000Z | — | — | — | NO_SAFE_CANDIDATE | collect_measurement_or_wait_for_telemetry_anchor |
| setup_fc0b26387af3 | 2026-03-15T10:00:00.000Z | 50000 | DIMO_HISTORICAL | 1.0 | CONFLICTING_DATA | resolve_conflicts_manually_do_not_auto_apply |
| setup_5a4baeb0eb58 | 2026-03-15T10:00:00.000Z | 55000 | DIMO_HISTORICAL | 1.0 | LOW_CONFIDENCE | require_workshop_or_telemetry_confirmation_before_apply |

## Detail rows

### setup_617c25d50954

- **confidence:** EXACT
- **candidateOdometerKm:** 45200
- **source:** DOCUMENTED_INSTALL_MEASUREMENT
- **timeDistanceToInstallationHours:** 0.25
- **supportingSignals:** source=DOCUMENTED_INSTALL_MEASUREMENT; observedAt=2026-03-15T10:15:00.000Z; evidenceRef=meas_hash_exact
- **recommendedAction:** eligible_for_prompt_8_controlled_apply_with_human_review

### setup_fa8c76f5e432

- **confidence:** HIGH_CONFIDENCE
- **candidateOdometerKm:** 88120
- **source:** DIMO_HISTORICAL
- **timeDistanceToInstallationHours:** 2.5
- **supportingSignals:** source=DIMO_HISTORICAL; observedAt=2026-03-15T12:30:00.000Z; provider=DIMO; evidenceRef=snap_hash_dimo
- **recommendedAction:** eligible_for_prompt_8_controlled_apply_with_human_review

### setup_0d3b3a96207c

- **confidence:** HIGH_CONFIDENCE
- **candidateOdometerKm:** 12050
- **source:** HIGH_MOBILITY_HISTORICAL
- **timeDistanceToInstallationHours:** 1
- **supportingSignals:** source=HIGH_MOBILITY_HISTORICAL; observedAt=2026-03-15T11:00:00.000Z; provider=HIGH_MOBILITY; evidenceRef=hm_hash
- **recommendedAction:** eligible_for_prompt_8_controlled_apply_with_human_review

### setup_d375d0815b37

- **confidence:** MEDIUM_CONFIDENCE
- **candidateOdometerKm:** 67300
- **source:** HANDOVER_PROTOCOL
- **timeDistanceToInstallationHours:** 23
- **supportingSignals:** source=HANDOVER_PROTOCOL; observedAt=2026-03-16T09:00:00.000Z; evidenceRef=handover_hash
- **recommendedAction:** manual_review_then_optional_prompt_8_apply

### setup_2429ada08064

- **confidence:** LOW_CONFIDENCE
- **candidateOdometerKm:** 15000
- **source:** TRIP_ODOMETER_BOUNDARY
- **timeDistanceToInstallationHours:** 214
- **supportingSignals:** source=TRIP_ODOMETER_BOUNDARY; observedAt=2026-03-24T08:00:00.000Z; evidenceRef=trip_hash; explicit_trip_end_odometer_only
- **conflicts:** trips_already_recorded_on_setup_after_delayed_anchor; delayed_telemetry_far_from_install
- **recommendedAction:** require_workshop_or_telemetry_confirmation_before_apply

### setup_f2f05ba4b956

- **confidence:** NO_SAFE_CANDIDATE
- **candidateOdometerKm:** null
- **source:** null
- **timeDistanceToInstallationHours:** null
- **supportingSignals:** no_historical_candidate_found
- **recommendedAction:** collect_measurement_or_wait_for_telemetry_anchor

### setup_fc0b26387af3

- **confidence:** CONFLICTING_DATA
- **candidateOdometerKm:** 50000
- **source:** DIMO_HISTORICAL
- **timeDistanceToInstallationHours:** 1
- **supportingSignals:** source=DIMO_HISTORICAL; observedAt=2026-03-15T11:00:00.000Z; provider=DIMO
- **conflicts:** provider_switch:dimo_and_hm_disagree_near_install; candidate_spread_50000_62000_km_exceeds_500
- **recommendedAction:** resolve_conflicts_manually_do_not_auto_apply

### setup_5a4baeb0eb58

- **confidence:** LOW_CONFIDENCE
- **candidateOdometerKm:** 55000
- **source:** DIMO_HISTORICAL
- **timeDistanceToInstallationHours:** 1
- **supportingSignals:** source=DIMO_HISTORICAL; observedAt=2026-03-15T11:00:00.000Z; provider=DIMO
- **conflicts:** odometer_rollback_vs_prior_vehicle_anchor
- **recommendedAction:** require_workshop_or_telemetry_confirmation_before_apply

---

*Read-only audit — no writes, no recalculation, no tire events. Suitable input for controlled Prompt 8 apply.*