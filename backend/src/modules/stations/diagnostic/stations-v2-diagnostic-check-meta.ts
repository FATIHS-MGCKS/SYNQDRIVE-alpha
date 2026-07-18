import type {
  StationsV2DiagnosticCategory,
  StationsV2DiagnosticCheckId,
  StationsV2DiagnosticSeverity,
} from './stations-v2-diagnostic.types';

export interface StationsV2DiagnosticCheckMeta {
  checkId: StationsV2DiagnosticCheckId;
  category: StationsV2DiagnosticCategory;
  severity: StationsV2DiagnosticSeverity;
  label: string;
  remediation: string;
}

export const STATIONS_V2_DIAGNOSTIC_CHECK_META: Record<
  StationsV2DiagnosticCheckId,
  StationsV2DiagnosticCheckMeta
> = {
  primary_none: {
    checkId: 'primary_none',
    category: 'primary_invariant',
    severity: 'warning',
    label: 'No primary station configured',
    remediation:
      'Set exactly one ACTIVE station as primary via POST /stations/:id/set-primary after confirming the correct default location.',
  },
  primary_multiple: {
    checkId: 'primary_multiple',
    category: 'primary_invariant',
    severity: 'error',
    label: 'Multiple primary stations in organization',
    remediation:
      'Run stations-v2-primary-reconcile in dry-run, pick the canonical primary, then set-primary on that station only.',
  },
  primary_on_archived_or_inactive: {
    checkId: 'primary_on_archived_or_inactive',
    category: 'primary_invariant',
    severity: 'error',
    label: 'Primary flag on archived or inactive station',
    remediation:
      'Clear primary from archived/inactive stations and set primary on an ACTIVE successor station.',
  },
  archived_active_capabilities: {
    checkId: 'archived_active_capabilities',
    category: 'lifecycle_capabilities',
    severity: 'error',
    label: 'Archived station with active pickup/return capabilities',
    remediation:
      'Re-archive via restore flow or patch capabilities to disabled; archived stations must not accept bookings.',
  },
  invalid_coordinates: {
    checkId: 'invalid_coordinates',
    category: 'location_masterdata',
    severity: 'warning',
    label: 'Invalid or incomplete coordinates',
    remediation:
      'Provide latitude/longitude as a pair via station edit or run backfill-coordinates after fixing the address.',
  },
  invalid_timezone: {
    checkId: 'invalid_timezone',
    category: 'location_masterdata',
    severity: 'error',
    label: 'Invalid IANA timezone',
    remediation: 'Set a valid IANA timezone (e.g. Europe/Berlin) on the station master data.',
  },
  invalid_opening_hours: {
    checkId: 'invalid_opening_hours',
    category: 'opening_hours',
    severity: 'warning',
    label: 'Opening hours fail contract validation',
    remediation:
      'Open the station form, fix opening hours structure (slots, overlaps, midnight intervals), and save.',
  },
  home_current_coupling_suspect: {
    checkId: 'home_current_coupling_suspect',
    category: 'vehicle_positioning',
    severity: 'info',
    label: 'Home/current coupling without provenance',
    remediation:
      'Review vehicle positioning: use correct-current-station or handover completion instead of implicit home=current copies.',
  },
  current_without_source: {
    checkId: 'current_without_source',
    category: 'vehicle_positioning',
    severity: 'warning',
    label: 'Current station set without position source',
    remediation:
      'Run current-provenance backfill or correct via POST /stations/vehicles/correct-current-station with MANUAL source.',
  },
  expected_without_valid_context: {
    checkId: 'expected_without_valid_context',
    category: 'expected_station',
    severity: 'error',
    label: 'Expected station without source or timestamp',
    remediation:
      'Set expected via transfer plan, one-way return, or repositioning workflow — never via direct field writes.',
  },
  expected_stale_context: {
    checkId: 'expected_stale_context',
    category: 'expected_station',
    severity: 'warning',
    label: 'Expected station with stale or missing context',
    remediation:
      'Mark for reconciliation: verify active transfer/booking context or clear expected via supported lifecycle command.',
  },
  vehicles_on_archived_stations: {
    checkId: 'vehicles_on_archived_stations',
    category: 'archived_station_links',
    severity: 'error',
    label: 'Vehicles linked to archived stations',
    remediation:
      'Move home/current/expected assignments to ACTIVE stations using home-assignment or current-correction workflows.',
  },
  booking_rule_violation: {
    checkId: 'booking_rule_violation',
    category: 'booking_rules',
    severity: 'error',
    label: 'Active booking violates station rules',
    remediation:
      'Reschedule booking, change stations, fix station hours/capabilities, or apply audited manual override where permitted.',
  },
  stale_scope_station_ids: {
    checkId: 'stale_scope_station_ids',
    category: 'access_scope',
    severity: 'warning',
    label: 'Membership or role references unknown/archived station IDs',
    remediation:
      'Update membership stationIds/stationScope or role default_station_ids to valid ACTIVE station UUIDs.',
  },
  kpi_home_fleet_deviation: {
    checkId: 'kpi_home_fleet_deviation',
    category: 'kpi_consistency',
    severity: 'warning',
    label: 'Home fleet KPI count mismatch',
    remediation:
      'Recompute station summaries and investigate vehicles with homeStationId outside the station org scope.',
  },
  kpi_current_on_site_deviation: {
    checkId: 'kpi_current_on_site_deviation',
    category: 'kpi_consistency',
    severity: 'warning',
    label: 'Current on-site KPI count mismatch',
    remediation:
      'Refresh station read models and reconcile currentStationId assignments against fleet tab ground truth.',
  },
};
