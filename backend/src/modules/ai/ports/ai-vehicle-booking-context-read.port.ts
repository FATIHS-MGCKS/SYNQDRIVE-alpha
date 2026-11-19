/**
 * Core-owned port — AI fleet tools read vehicle booking operational context
 * without injecting Rental VehicleBookingContextService.
 *
 * Return type is a **type-only** import of the Rental `VehicleBookingOperationalContext`
 * shape (no runtime coupling to Rental service implementation).
 */
import type { VehicleBookingOperationalContext } from '@modules/bookings/vehicle-booking-context/vehicle-booking-context.types';

export const AI_VEHICLE_BOOKING_CONTEXT_READ_PORT = Symbol(
  'AI_VEHICLE_BOOKING_CONTEXT_READ_PORT',
);

export type AiVehicleBookingContextReadOptions = {
  now?: Date;
  includeCustomerDisplayName?: boolean;
};

export interface AiVehicleBookingContextReadPort {
  getVehicleBookingOperationalContext(
    organizationId: string,
    vehicleId: string,
    options?: AiVehicleBookingContextReadOptions,
  ): Promise<VehicleBookingOperationalContext | null>;
}