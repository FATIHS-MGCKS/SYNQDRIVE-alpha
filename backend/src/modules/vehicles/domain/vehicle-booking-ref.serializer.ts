import type { DomainBookingRef } from './vehicle-operational-state.engine.types';
import type { FleetVehicleFutureBookingDto } from './vehicle-operational-state.types';
import type { VehicleBookingQueryRow } from './vehicle-booking-context.types';
import {
  resolveFleetBookingDisplayNumber,
} from './vehicle-booking-context.types';
import type { BookingPhase } from './vehicle-operational-state.engine.types';
import type { FleetBookingRefDto } from './vehicle-booking-context.serializer';

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
  const { bookingNumber, bookingNumberDiagnostic } =
    resolveFleetBookingDisplayNumber({ explicitRef: row.displayRef });
  return {
    id: row.id,
    bookingNumber,
    bookingNumberDiagnostic,
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

function toFleetBookingRefDto(
  ref: DomainBookingRef,
  options?: { includeVehicleId?: boolean },
): FleetBookingRefDto & Partial<Pick<FleetVehicleFutureBookingDto, 'vehicleId'>> {
  const dto: FleetBookingRefDto & { vehicleId?: string } = {
    id: ref.id,
    bookingNumber: ref.bookingNumber,
    ...(ref.bookingNumberDiagnostic
      ? { bookingNumberDiagnostic: ref.bookingNumberDiagnostic }
      : {}),
    status: ref.status,
    pickupAt: ref.pickupAt,
    returnAt: ref.returnAt,
    customerLabel: ref.customerLabel ?? null,
    phase: ref.phase,
  };
  if (options?.includeVehicleId) {
    dto.vehicleId = ref.vehicleId;
  }
  return dto;
}

export function serializeFleetBookingRef(
  ref: DomainBookingRef | null | undefined,
): FleetVehicleFutureBookingDto | null {
  if (!ref) return null;
  return toFleetBookingRefDto(ref, { includeVehicleId: true }) as FleetVehicleFutureBookingDto;
}

export function serializeFleetBookingRefs(
  refs: DomainBookingRef[] | undefined,
): FleetVehicleFutureBookingDto[] {
  if (!refs?.length) return [];
  return refs
    .map((ref) => serializeFleetBookingRef(ref))
    .filter((dto): dto is FleetVehicleFutureBookingDto => dto != null);
}

export { serializeFleetBookingRefDto } from './vehicle-booking-context.serializer';
