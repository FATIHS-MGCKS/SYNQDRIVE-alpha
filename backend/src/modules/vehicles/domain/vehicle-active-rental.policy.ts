import type { DataQualityReasonCode } from './vehicle-operational-state.engine.types';
import type {
  VehicleBookingHandoverSignals,
  VehicleBookingQueryRow,
} from './vehicle-booking-context.types';
import { compareBookingsByPickupStable } from './vehicle-booking-context.types';

/**
 * Kanonische Active-Rental-Policy — Prompt 11/43.
 *
 * ACTIVE_RENTED is only reliable when:
 * - Booking.status = ACTIVE
 * - Pickup evidenced (PICKUP protocol or actualPickupStationId from handover path)
 * - Return not completed (no RETURN protocol, no completedAt)
 * - Booking belongs to the scoped vehicle + organization
 * - At most one ACTIVE booking per vehicle
 */
export type ActiveRentalDiagnosticCode =
  | 'ACTIVE_WITHOUT_PICKUP'
  | 'PICKUP_WITHOUT_ACTIVE'
  | 'RETURN_COMPLETE_BUT_ACTIVE'
  | 'MULTIPLE_ACTIVE_BOOKINGS'
  | 'TENANT_VEHICLE_MISMATCH';

export interface ActiveRentalPolicyInput {
  vehicleId: string;
  organizationId: string;
  bookings: VehicleBookingQueryRow[];
}

export interface ActiveRentalPolicyResult {
  activeRow: VehicleBookingQueryRow | null;
  dataQualityReasons: DataQualityReasonCode[];
  diagnostics: ActiveRentalDiagnosticCode[];
  /** False when any inconsistency blocks a reliable active rental. */
  isReliable: boolean;
}

export function hasBelievablePickupEvidence(
  handover: VehicleBookingHandoverSignals,
): boolean {
  return (
    handover.pickupPerformedAt != null || handover.actualPickupStationId != null
  );
}

export function hasCompletedReturnEvidence(
  handover: VehicleBookingHandoverSignals,
  status: string,
): boolean {
  return (
    handover.returnPerformedAt != null ||
    handover.completedAt != null ||
    status === 'COMPLETED'
  );
}

/**
 * Resolves the single canonical active rental row for a vehicle, or null when
 * inconsistencies forbid a reliable active rental signal.
 */
export function resolveActiveRentalForVehicle(
  input: ActiveRentalPolicyInput,
): ActiveRentalPolicyResult {
  const { vehicleId, organizationId, bookings } = input;
  const dataQualityReasons: DataQualityReasonCode[] = [];
  const diagnostics: ActiveRentalDiagnosticCode[] = [];

  const vehicleBookings = bookings.filter((b) => b.vehicleId === vehicleId);

  for (const booking of vehicleBookings) {
    if (booking.organizationId !== organizationId) {
      diagnostics.push('TENANT_VEHICLE_MISMATCH');
      if (!dataQualityReasons.includes('BOOKING_TENANT_SCOPE_VIOLATION')) {
        dataQualityReasons.push('BOOKING_TENANT_SCOPE_VIOLATION');
      }
    }
  }

  for (const booking of vehicleBookings) {
    const hasPickup = hasBelievablePickupEvidence(booking.handover);
    if (hasPickup && booking.status !== 'ACTIVE') {
      diagnostics.push('PICKUP_WITHOUT_ACTIVE');
      if (!dataQualityReasons.includes('PICKUP_WITHOUT_ACTIVE_BOOKING')) {
        dataQualityReasons.push('PICKUP_WITHOUT_ACTIVE_BOOKING');
      }
    }
  }

  const activeCandidates = vehicleBookings
    .filter((b) => b.status === 'ACTIVE')
    .sort(compareBookingsByPickupStable);

  if (activeCandidates.length > 1) {
    diagnostics.push('MULTIPLE_ACTIVE_BOOKINGS');
    if (!dataQualityReasons.includes('MULTIPLE_ACTIVE_BOOKINGS')) {
      dataQualityReasons.push('MULTIPLE_ACTIVE_BOOKINGS');
    }
  }

  const primaryActive = activeCandidates[0] ?? null;

  if (primaryActive) {
    if (primaryActive.organizationId !== organizationId) {
      diagnostics.push('TENANT_VEHICLE_MISMATCH');
    }
    if (!hasBelievablePickupEvidence(primaryActive.handover)) {
      diagnostics.push('ACTIVE_WITHOUT_PICKUP');
      if (!dataQualityReasons.includes('ACTIVE_WITHOUT_PICKUP_PROTOCOL')) {
        dataQualityReasons.push('ACTIVE_WITHOUT_PICKUP_PROTOCOL');
      }
    }
    if (
      hasCompletedReturnEvidence(
        primaryActive.handover,
        primaryActive.status,
      )
    ) {
      diagnostics.push('RETURN_COMPLETE_BUT_ACTIVE');
      if (!dataQualityReasons.includes('RETURN_COMPLETED_WHILE_ACTIVE')) {
        dataQualityReasons.push('RETURN_COMPLETED_WHILE_ACTIVE');
      }
    }
  }

  const isReliable =
    primaryActive != null &&
    diagnostics.length === 0 &&
    dataQualityReasons.length === 0;

  return {
    activeRow: isReliable ? primaryActive : null,
    dataQualityReasons,
    diagnostics,
    isReliable,
  };
}
