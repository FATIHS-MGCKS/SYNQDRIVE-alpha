import type { DomainBookingRef } from './vehicle-operational-state.engine.types';
import type { FleetVehicleFutureBookingDto } from './vehicle-operational-state.types';
import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';
import {
  formatBookingDisplayNumber,
} from './vehicle-booking-context.types';
import type { BookingPhase } from './vehicle-operational-state.engine.types';

export function toDomainBookingRef(
  row: VehicleBookingQueryRow,
  phase: BookingPhase,
  evaluationAt: Date,
): DomainBookingRef {
  const isActivePhase = phase === 'active_rental';
  const pickupInstant =
    isActivePhase && row.handover.pickupPerformedAt
      ? row.handover.pickupPerformedAt
      : row.startDate;
  const customerLabel = row.customerLabel?.trim();
  return {
    id: row.id,
    bookingNumber: formatBookingDisplayNumber(row.id),
    status: row.status,
    pickupAt: pickupInstant.toISOString(),
    returnAt: row.endDate.toISOString(),
    customerLabel: customerLabel || null,
    vehicleId: row.vehicleId,
    phase,
    pickupStationName: row.pickupStationName,
    returnStationName: row.returnStationName,
    kmIncluded: row.kmIncluded,
    kmDriven: row.kmDriven,
    isOverdue: isActivePhase
      ? row.endDate.getTime() < evaluationAt.getTime()
      : row.startDate.getTime() < evaluationAt.getTime(),
  };
}

export function serializeFleetBookingRef(
  ref: DomainBookingRef | null | undefined,
): FleetVehicleFutureBookingDto | null {
  if (!ref) return null;
  return {
    id: ref.id,
    bookingNumber: ref.bookingNumber,
    status: ref.status,
    pickupAt: ref.pickupAt,
    returnAt: ref.returnAt,
    customerLabel: ref.customerLabel ?? null,
    vehicleId: ref.vehicleId,
    phase: ref.phase,
  };
}

export function serializeFleetBookingRefs(
  refs: DomainBookingRef[] | undefined,
): FleetVehicleFutureBookingDto[] {
  if (!refs?.length) return [];
  return refs
    .map((ref) => serializeFleetBookingRef(ref))
    .filter((dto): dto is FleetVehicleFutureBookingDto => dto != null);
}
