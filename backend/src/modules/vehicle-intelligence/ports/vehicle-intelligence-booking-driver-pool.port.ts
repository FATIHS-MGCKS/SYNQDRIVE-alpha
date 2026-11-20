import type { BookingDriverRole } from '@prisma/client';
import type { BookingDriverPool } from '@modules/bookings/booking-allowed-drivers/booking-allowed-drivers.types';

/**
 * Core-owned synchronous driver-pool resolution — delegates to Rental policy via adapter.
 * Type-only import of `BookingDriverPool` (in-process monorepo).
 */
export const VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT = Symbol(
  'VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT',
);

export type VehicleIntelligenceBookingDriverPoolResolveInput = {
  bookingCustomerId: string;
  assignedDriverId: string | null;
  allowedRows: Array<{ customerId: string; role: BookingDriverRole }>;
};

export interface VehicleIntelligenceBookingDriverPoolPort {
  resolveBookingDriverPool(
    input: VehicleIntelligenceBookingDriverPoolResolveInput,
  ): BookingDriverPool;
  isDriverInBookingPool(
    driverId: string | null | undefined,
    pool: Pick<BookingDriverPool, 'allowedDriverIds'>,
  ): boolean;
}