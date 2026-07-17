# Brake Health Baseline Backfill Candidates — July 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `brake-health-baseline-backfill-candidates-2026-07` |
| **Generated** | 2026-07-17T13:45:15.511Z |
| **Mode** | fixtures |
| **Production data modified** | **No** — read-only audit |
| **Candidate version** | `brake-baseline-backfill-audit-2026-07-v1` |

## Summary

| Metric | Count |
|--------|------:|
| Vehicles audited | 9 |
| Auto-applicable components | 4 |
| Manual review components | 8 |
| Spec-only components | 6 |
| Conflicting components | 1 |
| No safe baseline components | 24 |
| Vehicles with pending BRAKE jobs | 1 |

### By candidate class

| Class | Components |
|-------|----------:|
| EXACT_MEASURED | 3 |
| CONFIRMED_REPLACEMENT | 1 |
| HIGH_CONFIDENCE_DOCUMENTED | 0 |
| SPEC_ONLY | 6 |
| REGISTRATION_ASSERTION_ONLY | 1 |
| CONFLICTING_DATA | 1 |
| NO_SAFE_BASELINE | 24 |

## Component matrix (anonymized)

| Vehicle | Component | Candidate | Source | Timestamp | Odometer km | Confidence | Conflicts | Recommended action | Auto |
|---------|-----------|-----------|--------|-----------|-------------|------------|-----------|-------------------|:----:|
| VEHICLE_329 | FRONT_PADS | EXACT_MEASURED | BRAKE_EVIDENCE_MEASUREMENT | 2026-03-10T14:00:00.000Z | 45200 | HIGH | — | auto_backfill_eligible | yes |
| VEHICLE_329 | REAR_PADS | EXACT_MEASURED | SERVICE_EVENT_MEASUREMENT | 2026-03-10T14:00:00.000Z | 45200 | HIGH | — | auto_backfill_eligible | yes |
| VEHICLE_329 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_329 | REAR_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_706 | FRONT_PADS | CONFIRMED_REPLACEMENT | SERVICE_EVENT_REPLACEMENT | 2026-03-05T09:00:00.000Z | 44800 | MEDIUM | — | auto_backfill_eligible | yes |
| VEHICLE_706 | REAR_PADS | NO_SAFE_BASELINE | — | — | 44800 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_706 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | 44800 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_706 | REAR_DISCS | NO_SAFE_BASELINE | — | — | 44800 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_804 | FRONT_PADS | SPEC_ONLY | REFERENCE_SPEC_NOMINAL | 2026-03-01T10:05:00.000Z | 45000 | LOW | nominal_spec_not_measurement | measurement_or_replacement_confirmation_required | no |
| VEHICLE_804 | REAR_PADS | SPEC_ONLY | REFERENCE_SPEC_NOMINAL | 2026-03-01T10:05:00.000Z | 45000 | LOW | nominal_spec_not_measurement | measurement_or_replacement_confirmation_required | no |
| VEHICLE_804 | FRONT_DISCS | SPEC_ONLY | REFERENCE_SPEC_NOMINAL | 2026-03-01T10:05:00.000Z | 45000 | LOW | nominal_spec_not_measurement | measurement_or_replacement_confirmation_required | no |
| VEHICLE_804 | REAR_DISCS | SPEC_ONLY | REFERENCE_SPEC_NOMINAL | 2026-03-01T10:05:00.000Z | 45000 | LOW | nominal_spec_not_measurement | measurement_or_replacement_confirmation_required | no |
| VEHICLE_362 | FRONT_PADS | REGISTRATION_ASSERTION_ONLY | REGISTRATION_ASSERTION | 2026-03-01T10:00:00.000Z | 45000 | LOW | — | confirm_registration_state_or_measure | no |
| VEHICLE_362 | REAR_PADS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_362 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_362 | REAR_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_611 | FRONT_PADS | EXACT_MEASURED | SERVICE_EVENT_MEASUREMENT | 2026-02-20T11:00:00.000Z | 44100 | HIGH | — | auto_backfill_eligible | yes |
| VEHICLE_611 | REAR_PADS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_611 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_611 | REAR_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_674 | FRONT_PADS | CONFLICTING_DATA | SERVICE_EVENT_MEASUREMENT | 2026-03-02T12:00:00.000Z | 45000 | HIGH | component_measurement_spread_5.5_9.0_mm | manual_reconciliation_required | no |
| VEHICLE_674 | REAR_PADS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_674 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_674 | REAR_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_962 | FRONT_PADS | SPEC_ONLY | REFERENCE_SPEC_NOMINAL | 2026-03-01T10:00:00.000Z | — | LOW | missing_odometer_anchor; nominal_spec_not_measurement | measurement_or_replacement_confirmation_required | no |
| VEHICLE_962 | REAR_PADS | NO_SAFE_BASELINE | — | — | — | UNKNOWN | missing_odometer_anchor | no_safe_baseline_collect_evidence | no |
| VEHICLE_962 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | — | UNKNOWN | missing_odometer_anchor | no_safe_baseline_collect_evidence | no |
| VEHICLE_962 | REAR_DISCS | NO_SAFE_BASELINE | — | — | — | UNKNOWN | missing_odometer_anchor | no_safe_baseline_collect_evidence | no |
| VEHICLE_514 | FRONT_PADS | SPEC_ONLY | REFERENCE_SPEC_NOMINAL | 2026-03-01T10:00:00.000Z | 45000 | LOW | nominal_spec_not_measurement | measurement_or_replacement_confirmation_required | no |
| VEHICLE_514 | REAR_PADS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_514 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_514 | REAR_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_311 | FRONT_PADS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_311 | REAR_PADS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_311 | FRONT_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |
| VEHICLE_311 | REAR_DISCS | NO_SAFE_BASELINE | — | — | 45000 | UNKNOWN | — | no_safe_baseline_collect_evidence | no |

## Policy reminders

- **SPEC_ONLY** and **REGISTRATION_ASSERTION_ONLY** must never be treated as measured thickness.
- Component baselines are **never** inferred from a single partial signal across all four components.
- **CONFLICTING_DATA** and **NO_SAFE_BASELINE** require supervised manual review before any backfill execute.
- This audit does not mutate production data.
