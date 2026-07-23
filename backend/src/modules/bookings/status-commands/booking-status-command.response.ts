import type { Booking } from '@prisma/client';
import type { BookingStatusCommandResult } from './booking-status-command.types';

/** Canonical HTTP response for booking status commands. */
export type BookingStatusCommandResponseDto = {
  booking: {
    id: string;
    organizationId: string;
    status: string;
    startDate: string;
    endDate: string;
    cancelledAt: string | null;
    completedAt: string | null;
    notes: string | null;
    updatedAt: string;
    vehicleId: string;
    customerId: string;
  };
  transition: BookingStatusCommandResult['transition'];
};

export function toBookingStatusCommandResponse(
  result: BookingStatusCommandResult,
): BookingStatusCommandResponseDto {
  return {
    booking: serializeBooking(result.booking),
    transition: result.transition,
  };
}

export function serializeBooking(booking: Booking): BookingStatusCommandResponseDto['booking'] {
  return {
    id: booking.id,
    organizationId: booking.organizationId,
    status: booking.status,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate.toISOString(),
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    completedAt: booking.completedAt?.toISOString() ?? null,
    notes: booking.notes,
    updatedAt: booking.updatedAt.toISOString(),
    vehicleId: booking.vehicleId,
    customerId: booking.customerId,
  };
}

export function deserializeBookingStatusCommandResult(
  payload: unknown,
): BookingStatusCommandResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as Record<string, unknown>;
  const booking = row.booking;
  const transition = row.transition;
  if (!booking || typeof booking !== 'object' || !transition || typeof transition !== 'object') {
    return null;
  }
  const b = booking as Record<string, unknown>;
  return {
    booking: {
      id: String(b.id),
      organizationId: String(b.organizationId),
      status: b.status as Booking['status'],
      startDate: new Date(String(b.startDate)),
      endDate: new Date(String(b.endDate)),
      cancelledAt: b.cancelledAt ? new Date(String(b.cancelledAt)) : null,
      completedAt: b.completedAt ? new Date(String(b.completedAt)) : null,
      notes: (b.notes as string | null) ?? null,
      updatedAt: new Date(String(b.updatedAt)),
      vehicleId: String(b.vehicleId),
      customerId: String(b.customerId),
    } as Booking,
    transition: transition as BookingStatusCommandResult['transition'],
  };
}
