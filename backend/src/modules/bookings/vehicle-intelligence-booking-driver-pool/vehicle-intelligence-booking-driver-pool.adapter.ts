import { Injectable } from '@nestjs/common';
import {
  isDriverInBookingPool,
  resolveBookingDriverPool,
} from '../booking-allowed-drivers/booking-allowed-drivers.util';
import type {
  VehicleIntelligenceBookingDriverPoolPort,
  VehicleIntelligenceBookingDriverPoolResolveInput,
} from '@modules/vehicle-intelligence/ports/vehicle-intelligence-booking-driver-pool.port';
import type { BookingDriverPool } from '../booking-allowed-drivers/booking-allowed-drivers.types';

@Injectable()
export class VehicleIntelligenceBookingDriverPoolAdapter
  implements VehicleIntelligenceBookingDriverPoolPort
{
  resolveBookingDriverPool(input: VehicleIntelligenceBookingDriverPoolResolveInput): BookingDriverPool {
    return resolveBookingDriverPool(input);
  }

  isDriverInBookingPool(
    driverId: string | null | undefined,
    pool: Pick<BookingDriverPool, 'allowedDriverIds'>,
  ): boolean {
    return isDriverInBookingPool(driverId, pool);
  }
}