import type { VehicleBookingOperationalContext } from '@modules/bookings/vehicle-booking-context';

export const AI_GET_VEHICLE_BOOKING_CONTEXT_TOOL =
  'get_vehicle_booking_context' as const;

export interface AiGetVehicleBookingContextInput {
  readonly vehicleId: string;
}

export interface AiGetVehicleBookingContextData extends VehicleBookingOperationalContext {
  readonly displayName: string;
  readonly licensePlate: string | null;
}
