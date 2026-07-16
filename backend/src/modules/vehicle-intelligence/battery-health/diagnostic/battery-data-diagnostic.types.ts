export type BatteryDiagnosticSeverity = 'error' | 'warning' | 'info';

export type BatteryDiagnosticCategory =
  | 'rest_quality'
  | 'crank_start'
  | 'evidence'
  | 'publication'
  | 'hv_capacity'
  | 'reference_capacity'
  | 'write_chain'
  | 'legacy';

export type BatteryDiagnosticCheckId =
  | 'rest_voltage_above_wake_threshold'
  | 'rest_voltage_above_charging_context'
  | 'rest_60m_6h_same_timestamp'
  | 'rest_after_trip_start'
  | 'crank_insufficient_coverage'
  | 'bev_with_ice_crank'
  | 'lv_wrong_soh_percent_evidence'
  | 'incompatible_measurement_cycle'
  | 'stable_publication_without_evidence'
  | 'hv_persistence_duplicate'
  | 'legacy_pairwise_capacity'
  | 'unverified_reference_capacity'
  | 'partial_write_chain';

export interface BatteryDiagnosticFinding {
  checkId: BatteryDiagnosticCheckId;
  category: BatteryDiagnosticCategory;
  severity: BatteryDiagnosticSeverity;
  organizationId: string;
  vehicleId: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface BatteryDiagnosticCheckResult {
  checkId: BatteryDiagnosticCheckId;
  category: BatteryDiagnosticCategory;
  severity: BatteryDiagnosticSeverity;
  label: string;
  count: number;
  sampleVehicleIds: string[];
}

export interface BatteryDiagnosticReport {
  mode: 'diagnostic';
  scriptVersion: string;
  dryRun: true;
  readOnly: true;
  generatedAt: string;
  referenceNow: string;
  organizationId: string | null;
  vehicleId: string | null;
  organizationCount: number;
  vehiclesScanned: number;
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    infos: number;
    byCategory: Record<BatteryDiagnosticCategory, number>;
    byCheck: Partial<Record<BatteryDiagnosticCheckId, number>>;
  };
  checks: BatteryDiagnosticCheckResult[];
  findings?: BatteryDiagnosticFinding[];
}

export interface BatteryDiagnosticRunOptions {
  organizationId?: string;
  vehicleId?: string;
  sampleLimit?: number;
  referenceNow?: Date;
  includeFindings?: boolean;
}
