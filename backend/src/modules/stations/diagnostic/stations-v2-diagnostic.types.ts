export type StationsV2DiagnosticSeverity = 'error' | 'warning' | 'info';

export type StationsV2DiagnosticCategory =
  | 'primary_invariant'
  | 'lifecycle_capabilities'
  | 'location_masterdata'
  | 'opening_hours'
  | 'vehicle_positioning'
  | 'expected_station'
  | 'archived_station_links'
  | 'booking_rules'
  | 'access_scope'
  | 'kpi_consistency';

export type StationsV2DiagnosticCheckId =
  | 'primary_none'
  | 'primary_multiple'
  | 'primary_on_archived_or_inactive'
  | 'archived_active_capabilities'
  | 'invalid_coordinates'
  | 'invalid_timezone'
  | 'invalid_opening_hours'
  | 'home_current_coupling_suspect'
  | 'current_without_source'
  | 'expected_without_valid_context'
  | 'expected_stale_context'
  | 'vehicles_on_archived_stations'
  | 'booking_rule_violation'
  | 'stale_scope_station_ids'
  | 'kpi_home_fleet_deviation'
  | 'kpi_current_on_site_deviation';

export interface StationsV2DiagnosticFinding {
  checkId: StationsV2DiagnosticCheckId;
  category: StationsV2DiagnosticCategory;
  severity: StationsV2DiagnosticSeverity;
  organizationId: string;
  stationId?: string;
  vehicleId?: string;
  bookingId?: string;
  membershipId?: string;
  message: string;
  remediation: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface StationsV2DiagnosticCheckResult {
  checkId: StationsV2DiagnosticCheckId;
  category: StationsV2DiagnosticCategory;
  severity: StationsV2DiagnosticSeverity;
  label: string;
  remediation: string;
  count: number;
  sampleStationIds: string[];
  sampleVehicleIds: string[];
  sampleBookingIds: string[];
  sampleMembershipIds: string[];
}

export interface StationsV2DiagnosticOrgSummary {
  organizationId: string;
  stationsScanned: number;
  vehiclesScanned: number;
  bookingsScanned: number;
  membershipsScanned: number;
  totalFindings: number;
  byCheck: Partial<Record<StationsV2DiagnosticCheckId, number>>;
}

export interface StationsV2DiagnosticReport {
  mode: 'diagnostic';
  dryRun: true;
  readOnly: true;
  generatedAt: string;
  referenceNow: string;
  organizationId: string | null;
  organizationCount: number;
  stationsScanned: number;
  vehiclesScanned: number;
  bookingsScanned: number;
  membershipsScanned: number;
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    infos: number;
    byCategory: Record<StationsV2DiagnosticCategory, number>;
    byCheck: Partial<Record<StationsV2DiagnosticCheckId, number>>;
  };
  byOrganization: StationsV2DiagnosticOrgSummary[];
  checks: StationsV2DiagnosticCheckResult[];
  findings?: StationsV2DiagnosticFinding[];
}

export interface StationsV2DiagnosticRunOptions {
  organizationId?: string;
  referenceNow?: Date;
  sampleLimit?: number;
  includeFindings?: boolean;
  bookingLookaheadDays?: number;
}
