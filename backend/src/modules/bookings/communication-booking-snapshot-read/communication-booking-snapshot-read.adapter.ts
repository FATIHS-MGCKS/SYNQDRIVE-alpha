import { Injectable } from '@nestjs/common';
import { BookingsService } from '../bookings.service';
import type {
  CommunicationBookingSnapshot,
  CommunicationBookingSnapshotReadPort,
} from '@modules/communication/ports/communication-booking-snapshot-read.port';

@Injectable()
export class CommunicationBookingSnapshotReadAdapter
  implements CommunicationBookingSnapshotReadPort
{
  constructor(private readonly bookingsService: BookingsService) {}

  async getSnapshot(
    organizationId: string,
    bookingId: string,
  ): Promise<CommunicationBookingSnapshot | null> {
    const detail = await this.bookingsService.findDetail(organizationId, bookingId);
    if (!detail) {
      return null;
    }
    return {
      bookingNumber: detail.core.bookingNumber,
      depositStatus: detail.finance.depositStatus,
      paymentStatus: detail.finance.paymentStatus,
    };
  }
}