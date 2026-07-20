import { ConflictException } from '@nestjs/common';
import type { RentalHealthGateResult } from '@modules/rental-health/rental-health.service';

export interface BookingRentalHealthGateError {
  message: string;
  code: 'VEHICLE_RENTAL_BLOCKED' | 'VEHICLE_HEALTH_GATE_UNAVAILABLE';
  healthGateStatus?: RentalHealthGateResult['healthGateStatus'];
  manualReviewRequired?: boolean;
  blockingReasons: string[];
  vehicleId: string;
}

/**
 * Shared rental-health gate used by booking create/update. Kept in a util so
 * runtime/health separation can be contract-tested without spinning up the
 * full BookingsService graph.
 */
export function enforceBookingRentalHealthGate(
  rentalGate: RentalHealthGateResult,
  vehicleId: string,
): void {
  if (
    rentalGate.healthGateStatus === 'UNAVAILABLE' ||
    rentalGate.healthGateStatus === 'UNKNOWN'
  ) {
    throw new ConflictException({
      message:
        rentalGate.healthGateWarning ??
        'Fahrzeug-Gesundheit konnte nicht geprüft werden — manuelle Prüfung erforderlich. Buchung wurde nicht freigegeben.',
      code: 'VEHICLE_HEALTH_GATE_UNAVAILABLE',
      healthGateStatus: rentalGate.healthGateStatus,
      manualReviewRequired: true,
      blockingReasons: rentalGate.reasons,
      vehicleId,
    } satisfies BookingRentalHealthGateError);
  }
  if (rentalGate.blocked) {
    throw new ConflictException({
      message:
        'Dieses Fahrzeug ist aktuell nicht vermietbar. ' +
        rentalGate.reasons.join(' · '),
      code: 'VEHICLE_RENTAL_BLOCKED',
      blockingReasons: rentalGate.reasons,
      vehicleId,
    } satisfies BookingRentalHealthGateError);
  }
}

export function bookingRentalHealthGateAllowsCreate(
  rentalGate: RentalHealthGateResult,
): boolean {
  return (
    rentalGate.healthGateStatus === 'OK' &&
    rentalGate.blocked === false &&
    rentalGate.manualReviewRequired === false
  );
}
