import type { BookingDriverRole } from '@prisma/client';
import type { BookingDriverPool } from './booking-allowed-drivers.types';

export function resolveBookingDriverPool(input: {
  bookingCustomerId: string;
  assignedDriverId: string | null;
  allowedRows: Array<{ customerId: string; role: BookingDriverRole }>;
}): BookingDriverPool {
  const primaryFromRow =
    input.allowedRows.find((row) => row.role === 'PRIMARY')?.customerId ?? null;
  const primaryDriverId = primaryFromRow ?? input.assignedDriverId ?? null;
  const additionalDriverIds = input.allowedRows
    .filter((row) => row.role === 'ADDITIONAL' && row.customerId !== primaryDriverId)
    .map((row) => row.customerId);
  const allowedDriverIds = [
    ...new Set(
      [primaryDriverId, ...additionalDriverIds].filter((id): id is string => Boolean(id)),
    ),
  ];

  return {
    bookingCustomerId: input.bookingCustomerId,
    primaryDriverId,
    additionalDriverIds,
    allowedDriverIds,
  };
}

export function isDriverInBookingPool(
  driverId: string | null | undefined,
  pool: Pick<BookingDriverPool, 'allowedDriverIds'>,
): boolean {
  if (!driverId) return false;
  if (pool.allowedDriverIds.length === 0) return true;
  return pool.allowedDriverIds.includes(driverId);
}
