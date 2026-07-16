export type VbhDiagnosticSeverity = 'error' | 'warning' | 'info';

export type VbhDiagnosticCategory =
  | 'vehicle_raw_status'
  | 'booking_status'
  | 'handover_integrity'
  | 'reservation_window'
  | 'cross_org'
  | 'timing'
  | 'derivation'
  | 'organization_config';

export type VbhDiagnosticCheckId =
  | 'raw_reserved_without_window'
  | 'raw_rented_without_active_booking'
  | 'active_booking_raw_available'
  | 'pickup_completed_booking_not_active'
  | 'return_completed_booking_still_active'
  | 'multiple_active_bookings_per_vehicle'
  | 'multiple_reservation_window_bookings'
  | 'future_booking_legacy_reserved_trigger'
  | 'endpoint_canonical_derivation_divergence'
  | 'cross_org_booking_link'
  | 'booking_date_inconsistency'
  | 'organization_timezone_missing_or_invalid';

export interface VbhDiagnosticFinding {
  checkId: VbhDiagnosticCheckId;
  category: VbhDiagnosticCategory;
  severity: VbhDiagnosticSeverity;
  organizationId: string;
  vehicleId?: string;
  bookingId?: string;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

export interface VbhDiagnosticCheckResult {
  checkId: VbhDiagnosticCheckId;
  category: VbhDiagnosticCategory;
  severity: VbhDiagnosticSeverity;
  label: string;
  count: number;
  sampleVehicleIds: string[];
  sampleBookingIds: string[];
}

export interface VbhDiagnosticOrgSummary {
  organizationId: string;
  vehiclesScanned: number;
  bookingsScanned: number;
  handoversScanned: number;
  totalFindings: number;
  byCheck: Partial<Record<VbhDiagnosticCheckId, number>>;
}

export interface VbhDiagnosticReport {
  mode: 'diagnostic';
  dryRun: true;
  readOnly: true;
  generatedAt: string;
  referenceNow: string;
  organizationId: string | null;
  organizationCount: number;
  vehiclesScanned: number;
  bookingsScanned: number;
  handoversScanned: number;
  summary: {
    totalFindings: number;
    errors: number;
    warnings: number;
    infos: number;
    byCategory: Record<VbhDiagnosticCategory, number>;
    byCheck: Partial<Record<VbhDiagnosticCheckId, number>>;
  };
  byOrganization: VbhDiagnosticOrgSummary[];
  checks: VbhDiagnosticCheckResult[];
  findings?: VbhDiagnosticFinding[];
}

export interface VbhDiagnosticRunOptions {
  organizationId?: string;
  vehicleId?: string;
  licensePlate?: string;
  sampleLimit?: number;
  referenceNow?: Date;
  includeFindings?: boolean;
}
