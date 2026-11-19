import { Injectable } from '@nestjs/common';
import { BookingsService } from '../bookings.service';
import type {
  WhatsAppBookingOperationalRead,
  WhatsAppBookingOperationalReadPort,
} from '@modules/whatsapp/ports/whatsapp-booking-operational-read.port';
import { mapBookingDetailToWhatsAppOperationalRead } from './whatsapp-booking-operational-read.mapper';

@Injectable()
export class WhatsAppBookingOperationalReadAdapter
  implements WhatsAppBookingOperationalReadPort
{
  constructor(private readonly bookingsService: BookingsService) {}

  async getOperationalRead(
    organizationId: string,
    bookingId: string,
  ): Promise<WhatsAppBookingOperationalRead | null> {
    const detail = await this.bookingsService.findDetail(organizationId, bookingId);
    if (!detail) {
      return null;
    }
    return mapBookingDetailToWhatsAppOperationalRead(detail);
  }
}