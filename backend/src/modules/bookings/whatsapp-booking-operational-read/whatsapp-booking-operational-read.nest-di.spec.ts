import { Test } from '@nestjs/testing';
import { WHATSAPP_BOOKING_OPERATIONAL_READ_PORT } from '@modules/whatsapp/ports/whatsapp-booking-operational-read.port';
import { WhatsAppBookingOperationalReadAdapter } from './whatsapp-booking-operational-read.adapter';
import { BookingsService } from '../bookings.service';

describe('WhatsAppBookingOperationalReadModule — token binding', () => {
  it('resolves WHATSAPP_BOOKING_OPERATIONAL_READ_PORT to the adapter (useExisting)', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppBookingOperationalReadAdapter,
        {
          provide: BookingsService,
          useValue: { findDetail: jest.fn() },
        },
        {
          provide: WHATSAPP_BOOKING_OPERATIONAL_READ_PORT,
          useExisting: WhatsAppBookingOperationalReadAdapter,
        },
      ],
    }).compile();

    const port = moduleRef.get(WHATSAPP_BOOKING_OPERATIONAL_READ_PORT);
    expect(port).toBeInstanceOf(WhatsAppBookingOperationalReadAdapter);
    await moduleRef.close();
  });
});