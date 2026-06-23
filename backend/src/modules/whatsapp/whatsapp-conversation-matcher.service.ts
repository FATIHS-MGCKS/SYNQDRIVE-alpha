import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { normalizePhoneNumber } from './utils/whatsapp-phone.util';

export interface ConversationMatchResult {
  customerId: string | null;
  bookingId: string | null;
  vehicleId: string | null;
  contactName: string | null;
  status: 'OPEN' | 'PENDING_HUMAN';
}

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.ACTIVE,
  BookingStatus.PENDING,
];

@Injectable()
export class WhatsAppConversationMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async matchContext(
    orgId: string,
    contactPhone: string,
    contactName?: string | null,
  ): Promise<ConversationMatchResult> {
    const phoneNormalized = normalizePhoneNumber(contactPhone);
    if (!phoneNormalized) {
      return {
        customerId: null,
        bookingId: null,
        vehicleId: null,
        contactName: contactName ?? null,
        status: 'PENDING_HUMAN',
      };
    }

    const customer = await this.prisma.customer.findFirst({
      where: {
        organizationId: orgId,
        archivedAt: null,
        OR: [{ phoneNormalized }, { phone: contactPhone }],
      },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!customer) {
      return {
        customerId: null,
        bookingId: null,
        vehicleId: null,
        contactName: contactName ?? null,
        status: 'PENDING_HUMAN',
      };
    }

    const displayName =
      contactName ??
      ([customer.firstName, customer.lastName].filter(Boolean).join(' ') || null);

    const activeBooking = await this.prisma.booking.findFirst({
      where: {
        organizationId: orgId,
        customerId: customer.id,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
      orderBy: { startDate: 'desc' },
      select: { id: true, vehicleId: true },
    });

    if (activeBooking) {
      return {
        customerId: customer.id,
        bookingId: activeBooking.id,
        vehicleId: activeBooking.vehicleId,
        contactName: displayName,
        status: 'OPEN',
      };
    }

    const lastBooking = await this.prisma.booking.findFirst({
      where: { organizationId: orgId, customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, vehicleId: true },
    });

    return {
      customerId: customer.id,
      bookingId: lastBooking?.id ?? null,
      vehicleId: lastBooking?.vehicleId ?? null,
      contactName: displayName,
      status: 'OPEN',
    };
  }
}
