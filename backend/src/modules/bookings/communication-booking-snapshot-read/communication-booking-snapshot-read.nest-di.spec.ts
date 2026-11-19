import { Test } from '@nestjs/testing';
import { COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT } from '@modules/communication/ports/communication-booking-snapshot-read.port';
import { CommunicationBookingSnapshotReadAdapter } from './communication-booking-snapshot-read.adapter';
import { BookingsService } from '../bookings.service';

describe('CommunicationBookingSnapshotReadModule (Nest DI)', () => {
  it('resolves COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT to the adapter', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunicationBookingSnapshotReadAdapter,
        {
          provide: BookingsService,
          useValue: { findDetail: jest.fn() },
        },
        {
          provide: COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT,
          useExisting: CommunicationBookingSnapshotReadAdapter,
        },
      ],
    }).compile();

    const port = moduleRef.get(COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT);
    expect(port).toBeInstanceOf(CommunicationBookingSnapshotReadAdapter);
  });
});