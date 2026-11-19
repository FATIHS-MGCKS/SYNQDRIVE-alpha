import { Module } from '@nestjs/common';
import { AI_VEHICLE_BOOKING_CONTEXT_READ_PORT } from '@modules/ai/ports/ai-vehicle-booking-context-read.port';
import { BookingsModule } from '../bookings.module';
import { AiVehicleBookingContextReadAdapter } from './ai-vehicle-booking-context-read.adapter';

/**
 * Rental adapter binding for AI vehicle booking operational context reads.
 */
@Module({
  imports: [BookingsModule],
  providers: [
    AiVehicleBookingContextReadAdapter,
    {
      provide: AI_VEHICLE_BOOKING_CONTEXT_READ_PORT,
      useExisting: AiVehicleBookingContextReadAdapter,
    },
  ],
  exports: [AI_VEHICLE_BOOKING_CONTEXT_READ_PORT],
})
export class AiVehicleBookingContextReadModule {}