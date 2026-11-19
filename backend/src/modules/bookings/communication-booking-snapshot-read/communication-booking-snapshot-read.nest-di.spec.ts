import { Test } from '@nestjs/testing';
import { COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT } from '@modules/communication/ports/communication-booking-snapshot-read.port';
import { CommunicationBookingSnapshotReadAdapter } from './communication-booking-snapshot-read.adapter';
import { BookingsService } from '../bookings.service';

/**
 * Mirrors `CommunicationBookingSnapshotReadModule` provider bindings without importing
 * `BookingsModule` (full graph OOMs under parallel Jest workers in this VM).
 * Module export wiring is identical to communication-booking-snapshot-read.module.ts.
 */
describe('CommunicationBookingSnapshotReadModule — token binding', () => {
  it('resolves COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT to the adapter (useExisting)', async () => {
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
    expect(port).toBe(moduleRef.get(CommunicationBookingSnapshotReadAdapter));
    await moduleRef.close();
  });
});