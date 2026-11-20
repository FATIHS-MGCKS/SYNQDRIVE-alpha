import { Injectable } from '@nestjs/common';
import { VehicleBookingContextService } from '../vehicle-booking-context/vehicle-booking-context.service';
import type {
  AiVehicleBookingContextReadOptions,
  AiVehicleBookingContextReadPort,
} from '@modules/ai/ports/ai-vehicle-booking-context-read.port';
import type { VehicleBookingOperationalContext } from '../vehicle-booking-context/vehicle-booking-context.types';

@Injectable()
export class AiVehicleBookingContextReadAdapter implements AiVehicleBookingContextReadPort {
  constructor(private readonly vehicleBookingContext: VehicleBookingContextService) {}

  getVehicleBookingOperationalContext(
    organizationId: string,
    vehicleId: string,
    options: AiVehicleBookingContextReadOptions = {},
  ): Promise<VehicleBookingOperationalContext | null> {
    return this.vehicleBookingContext.getVehicleBookingOperationalContext(
      organizationId,
      vehicleId,
      options,
    );
  }
}