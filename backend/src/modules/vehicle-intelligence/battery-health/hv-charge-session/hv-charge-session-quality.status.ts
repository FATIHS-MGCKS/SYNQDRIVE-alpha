export const HV_CHARGE_SESSION_QUALITY_STATUS = {
  QUALIFIED: 'QUALIFIED',
  PARTIAL: 'PARTIAL',
  INSUFFICIENT_SOC_DELTA: 'INSUFFICIENT_SOC_DELTA',
  INSUFFICIENT_COVERAGE: 'INSUFFICIENT_COVERAGE',
  PROVIDER_GAPS: 'PROVIDER_GAPS',
  ADDED_ENERGY_RESET: 'ADDED_ENERGY_RESET',
  ONGOING: 'ONGOING',
  CONFLICTING_SOURCES: 'CONFLICTING_SOURCES',
  INVALID: 'INVALID',
} as const;

export type HvChargeSessionQualityStatus =
  (typeof HV_CHARGE_SESSION_QUALITY_STATUS)[keyof typeof HV_CHARGE_SESSION_QUALITY_STATUS];

export const HV_CHARGE_SESSION_QUALITY_REASONS = {
  strong_dimo_boundaries: 'strong_dimo_boundaries',
  weak_session_boundaries: 'weak_session_boundaries',
  telemetry_fallback_source: 'telemetry_fallback_source',
  superseded_by_dimo_segment: 'superseded_by_dimo_segment',
  ongoing_session: 'ongoing_session',
  soc_delta_qualified: 'soc_delta_qualified',
  soc_delta_partial_m2: 'soc_delta_partial_m2',
  soc_delta_insufficient: 'soc_delta_insufficient',
  duration_insufficient: 'duration_insufficient',
  sample_coverage_low: 'sample_coverage_low',
  provider_gap_started_before_range: 'provider_gap_started_before_range',
  provider_gap_missing_end: 'provider_gap_missing_end',
  provider_gap_missing_signals: 'provider_gap_missing_signals',
  duplicate_timestamps: 'duplicate_timestamps',
  timestamp_inconsistent: 'timestamp_inconsistent',
  current_energy_unavailable: 'current_energy_unavailable',
  added_energy_reset_mid_session: 'added_energy_reset_mid_session',
  added_energy_negative_delta: 'added_energy_negative_delta',
  charging_interruption: 'charging_interruption',
  stale_provider_data: 'stale_provider_data',
  invalid_soc_range: 'invalid_soc_range',
  missing_soc_data: 'missing_soc_data',
} as const;

export type HvChargeSessionQualityReasonCode =
  (typeof HV_CHARGE_SESSION_QUALITY_REASONS)[keyof typeof HV_CHARGE_SESSION_QUALITY_REASONS];

export type HvChargeSessionBoundaryStrength = 'strong' | 'weak' | 'invalid';

export type HvChargeSessionSourceStrength =
  | 'dimo_segment'
  | 'telemetry_fallback'
  | 'superseded';
