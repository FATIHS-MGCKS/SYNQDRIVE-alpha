import type {
  VbhDiagnosticCategory,
  VbhDiagnosticCheckId,
  VbhDiagnosticSeverity,
} from './vehicle-booking-handover-diagnostic.types';

export interface VbhDiagnosticCheckMeta {
  category: VbhDiagnosticCategory;
  severity: VbhDiagnosticSeverity;
  label: string;
}

export const VBH_DIAGNOSTIC_CHECK_META: Record<VbhDiagnosticCheckId, VbhDiagnosticCheckMeta> = {
  raw_reserved_without_window: {
    category: 'vehicle_raw_status',
    severity: 'warning',
    label: 'Raw RESERVED without current reservation window',
  },
  raw_rented_without_active_booking: {
    category: 'vehicle_raw_status',
    severity: 'error',
    label: 'Raw RENTED without consistent active booking',
  },
  active_booking_raw_available: {
    category: 'vehicle_raw_status',
    severity: 'error',
    label: 'ACTIVE booking while raw vehicle status is AVAILABLE',
  },
  pickup_completed_booking_not_active: {
    category: 'handover_integrity',
    severity: 'error',
    label: 'Pickup handover completed but booking is not ACTIVE',
  },
  return_completed_booking_still_active: {
    category: 'handover_integrity',
    severity: 'error',
    label: 'Return handover completed but booking is still ACTIVE',
  },
  multiple_active_bookings_per_vehicle: {
    category: 'booking_status',
    severity: 'error',
    label: 'Multiple ACTIVE bookings for the same vehicle',
  },
  multiple_reservation_window_bookings: {
    category: 'reservation_window',
    severity: 'warning',
    label: 'Multiple bookings simultaneously in reservation window',
  },
  future_booking_legacy_reserved_trigger: {
    category: 'reservation_window',
    severity: 'info',
    label: 'Future booking would trigger Reserved under legacy logic only',
  },
  endpoint_canonical_derivation_divergence: {
    category: 'derivation',
    severity: 'warning',
    label: 'Raw DB status diverges from canonical fleet derivation',
  },
  cross_org_booking_link: {
    category: 'cross_org',
    severity: 'error',
    label: 'Booking or handover linked to foreign organization',
  },
  booking_date_inconsistency: {
    category: 'timing',
    severity: 'warning',
    label: 'Booking startDate/endDate or lifecycle timestamp inconsistency',
  },
  organization_timezone_missing_or_invalid: {
    category: 'organization_config',
    severity: 'warning',
    label: 'Organization timezone missing or invalid IANA value',
  },
};
