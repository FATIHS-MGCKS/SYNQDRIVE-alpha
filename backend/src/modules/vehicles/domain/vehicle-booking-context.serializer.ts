import type { BookingContextBlock } from './vehicle-operational-state.engine.types';
import type { DomainBookingRef } from './vehicle-operational-state.engine.types';
import type { BookingPhase } from './vehicle-operational-state.engine.types';
import type { FleetBookingNumberDiagnostic } from './vehicle-operational-state.engine.types';
import type { FleetVehicleBookingContextDto } from './vehicle-operational-state.types';
import { EMPTY_BOOKING_CONTEXT } from './vehicle-operational-state.types';

/**
 * Compact booking reference for fleet read-models (§16.5).
 * Machine-readable `status` and `phase` — no UI labels.
 */
export interface FleetBookingRefDto {
  id: string;
  bookingNumber: string;
  bookingNumberDiagnostic?: FleetBookingNumberDiagnostic | null;
  status: string;
  pickupAt: string;
  returnAt: string;
  customerLabel?: string | null;
  phase: BookingPhase;
}

/**
 * Normalized booking occupancy block — single source for fleet APIs (§16.4).
 *
 * `futureBookingCount` = count of binding future bookings strictly after
 * `nextBooking`, excluding `activeBooking` and `reservedBooking`.
 */
export interface FleetBookingContextDto {
  activeBooking: FleetBookingRefDto | null;
  reservedBooking: FleetBookingRefDto | null;
  nextBooking: FleetBookingRefDto | null;
  futureBookingCount: number;
}

export function serializeFleetBookingRefDto(
  ref: DomainBookingRef | null | undefined,
): FleetBookingRefDto | null {
  if (!ref) return null;
  return {
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
}

export function serializeFleetBookingContextBlock(
  block: BookingContextBlock,
  futureBookingCount: number,
): FleetBookingContextDto {
  return {
    activeBooking: serializeFleetBookingRefDto(block.activeBooking),
    reservedBooking: serializeFleetBookingRefDto(block.reservedBooking),
    nextBooking: serializeFleetBookingRefDto(block.nextBooking),
    futureBookingCount,
  };
}

/**
 * Projects deprecated flat booking fields from the same canonical refs
 * used in `bookingContext` — prevents reservedReturnAt / activeStartAt drift.
 */
export function projectLegacyBookingDtoFromRefs(
  active: DomainBookingRef | null,
  reserved: DomainBookingRef | null,
): FleetVehicleBookingContextDto {
  if (!active && !reserved) {
    return { ...EMPTY_BOOKING_CONTEXT };
  }

  return {
    reservedBookingId: reserved?.id ?? null,
    reservedCustomerName: reserved?.customerLabel ?? null,
    reservedPickupAt: reserved?.pickupAt ?? null,
    reservedReturnAt: reserved?.returnAt ?? null,
    reservedPickupStationName: reserved?.pickupStationName ?? null,
    reservedIsOverdue: reserved?.isOverdue ?? false,
    activeBookingId: active?.id ?? null,
    activeCustomerName: active?.customerLabel ?? null,
    activeStartAt: active?.pickupAt ?? null,
    activeReturnAt: active?.returnAt ?? null,
    activeReturnStationName: active?.returnStationName ?? null,
    activeKmIncluded: active?.kmIncluded ?? null,
    activeKmDriven: active?.kmDriven ?? null,
    activeIsOverdue: active?.isOverdue ?? false,
  };
}
