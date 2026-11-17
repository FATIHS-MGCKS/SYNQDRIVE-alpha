import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT } from '@modules/vehicle-intelligence/ports/driving-intelligence-booking-resolution.port';
import { DrivingIntelligenceBookingResolutionPrismaAdapter } from './driving-intelligence-booking-resolution.adapter';

/**
 * Minimal rental adapter module for DI job booking validation — no VehicleIntelligence import.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    DrivingIntelligenceBookingResolutionPrismaAdapter,
    {
      provide: DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT,
      useExisting: DrivingIntelligenceBookingResolutionPrismaAdapter,
    },
  ],
  exports: [DRIVING_INTELLIGENCE_BOOKING_RESOLUTION_PORT],
})
export class DrivingIntelligenceBookingResolutionModule {}