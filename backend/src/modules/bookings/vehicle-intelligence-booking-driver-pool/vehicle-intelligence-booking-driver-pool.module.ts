import { Module } from '@nestjs/common';
import { VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT } from '@modules/vehicle-intelligence/ports/vehicle-intelligence-booking-driver-pool.port';
import { VehicleIntelligenceBookingDriverPoolAdapter } from './vehicle-intelligence-booking-driver-pool.adapter';

/**
 * Rental-owned driver pool policy adapter for Vehicle Intelligence (pure util delegation).
 */
@Module({
  providers: [
    VehicleIntelligenceBookingDriverPoolAdapter,
    {
      provide: VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT,
      useExisting: VehicleIntelligenceBookingDriverPoolAdapter,
    },
  ],
  exports: [VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT],
})
export class VehicleIntelligenceBookingDriverPoolModule {}