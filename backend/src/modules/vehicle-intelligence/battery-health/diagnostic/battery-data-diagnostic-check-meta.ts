import type {
  BatteryDiagnosticCategory,
  BatteryDiagnosticCheckId,
  BatteryDiagnosticSeverity,
} from './battery-data-diagnostic.types';

export interface BatteryDiagnosticCheckMeta {
  category: BatteryDiagnosticCategory;
  severity: BatteryDiagnosticSeverity;
  label: string;
}

export const BATTERY_DATA_DIAGNOSTIC_SCRIPT_VERSION = '1.0.0';

export const BATTERY_DIAGNOSTIC_CHECK_META: Record<
  BatteryDiagnosticCheckId,
  BatteryDiagnosticCheckMeta
> = {
  rest_voltage_above_wake_threshold: {
    category: 'rest_quality',
    severity: 'warning',
    label: 'REST measurement above wake voltage threshold but not contaminated',
  },
  rest_voltage_above_charging_context: {
    category: 'rest_quality',
    severity: 'warning',
    label: 'REST measurement with charging context marked as valid',
  },
  rest_60m_6h_same_timestamp: {
    category: 'rest_quality',
    severity: 'error',
    label: 'REST_60M and REST_6H share identical observedAt',
  },
  rest_after_trip_start: {
    category: 'rest_quality',
    severity: 'warning',
    label: 'REST measurement observed after trip start within rest window',
  },
  crank_insufficient_coverage: {
    category: 'crank_start',
    severity: 'warning',
    label: 'Crank / start-proxy without sufficient coverage',
  },
  bev_with_ice_crank: {
    category: 'crank_start',
    severity: 'error',
    label: 'BEV vehicle with ICE crank / start-proxy session',
  },
  lv_wrong_soh_percent_evidence: {
    category: 'evidence',
    severity: 'error',
    label: 'LV scope evidence with SOH_PERCENT value type',
  },
  incompatible_measurement_cycle: {
    category: 'evidence',
    severity: 'warning',
    label: 'Measurement with incompatible cycle quality',
  },
  stable_publication_without_evidence: {
    category: 'publication',
    severity: 'error',
    label: 'STABLE publication without belastbare evidence',
  },
  hv_persistence_duplicate: {
    category: 'hv_capacity',
    severity: 'warning',
    label: 'HV snapshot persistence duplicate rows',
  },
  legacy_pairwise_capacity: {
    category: 'legacy',
    severity: 'info',
    label: 'Legacy pairwise HV capacity observation',
  },
  unverified_reference_capacity: {
    category: 'reference_capacity',
    severity: 'warning',
    label: 'Active reference capacity not verified',
  },
  partial_write_chain: {
    category: 'write_chain',
    severity: 'error',
    label: 'Partial or broken battery write chain',
  },
};
