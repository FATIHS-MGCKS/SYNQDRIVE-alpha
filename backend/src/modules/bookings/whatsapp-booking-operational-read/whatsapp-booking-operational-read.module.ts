import { Module } from '@nestjs/common';
import { WHATSAPP_BOOKING_OPERATIONAL_READ_PORT } from '@modules/whatsapp/ports/whatsapp-booking-operational-read.port';
import { BookingsModule } from '../bookings.module';
import { WhatsAppBookingOperationalReadAdapter } from './whatsapp-booking-operational-read.adapter';

/**
 * Rental adapter binding for WhatsApp booking operational reads.
 */
@Module({
  imports: [BookingsModule],
  providers: [
    WhatsAppBookingOperationalReadAdapter,
    {
      provide: WHATSAPP_BOOKING_OPERATIONAL_READ_PORT,
      useExisting: WhatsAppBookingOperationalReadAdapter,
    },
  ],
  exports: [WHATSAPP_BOOKING_OPERATIONAL_READ_PORT],
})
export class WhatsAppBookingOperationalReadModule {}