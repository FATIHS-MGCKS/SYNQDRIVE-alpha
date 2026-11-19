import { Module } from '@nestjs/common';
import { VOICE_BOOKING_READ_PORT } from '@modules/voice-mcp-gateway/ports/voice-booking-read.port';
import { BookingsModule } from '../bookings.module';
import { VoiceBookingReadAdapter } from './voice-booking-read.adapter';

/**
 * Rental adapter binding for Voice MCP booking reads.
 */
@Module({
  imports: [BookingsModule],
  providers: [
    VoiceBookingReadAdapter,
    {
      provide: VOICE_BOOKING_READ_PORT,
      useExisting: VoiceBookingReadAdapter,
    },
  ],
  exports: [VOICE_BOOKING_READ_PORT],
})
export class VoiceBookingReadModule {}