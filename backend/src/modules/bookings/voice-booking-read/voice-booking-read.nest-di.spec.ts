import { Test } from '@nestjs/testing';
import { VOICE_BOOKING_READ_PORT } from '@modules/voice-mcp-gateway/ports/voice-booking-read.port';
import { VoiceBookingReadAdapter } from './voice-booking-read.adapter';
import { BookingsService } from '../bookings.service';

describe('VoiceBookingReadModule — token binding', () => {
  it('resolves VOICE_BOOKING_READ_PORT to the adapter (useExisting)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        VoiceBookingReadAdapter,
        {
          provide: BookingsService,
          useValue: { findAll: jest.fn(), findById: jest.fn() },
        },
        {
          provide: VOICE_BOOKING_READ_PORT,
          useExisting: VoiceBookingReadAdapter,
        },
      ],
    }).compile();

    const port = moduleRef.get(VOICE_BOOKING_READ_PORT);
    expect(port).toBeInstanceOf(VoiceBookingReadAdapter);
    await moduleRef.close();
  });
});