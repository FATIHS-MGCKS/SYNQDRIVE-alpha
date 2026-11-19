import { Module } from '@nestjs/common';
import { COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT } from '@modules/communication/ports/communication-booking-snapshot-read.port';
import { BookingsModule } from '../bookings.module';
import { CommunicationBookingSnapshotReadAdapter } from './communication-booking-snapshot-read.adapter';

/**
 * Rental adapter binding for Communication Center booking snapshot reads.
 */
@Module({
  imports: [BookingsModule],
  providers: [
    CommunicationBookingSnapshotReadAdapter,
    {
      provide: COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT,
      useExisting: CommunicationBookingSnapshotReadAdapter,
    },
  ],
  exports: [COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT],
})
export class CommunicationBookingSnapshotReadModule {}