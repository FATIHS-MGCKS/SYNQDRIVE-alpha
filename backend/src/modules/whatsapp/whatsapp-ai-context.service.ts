import { Injectable } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import type { WhatsAppAiContextSnapshot } from './whatsapp-ai.types';

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.ACTIVE,
  BookingStatus.PENDING,
];

@Injectable()
export class WhatsAppAiContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
  ) {}

  async load(
    orgId: string,
    conversation: {
      id: string;
      customerId: string | null;
      bookingId: string | null;
      vehicleId: string | null;
      contactName: string | null;
      contactPhone: string;
    },
    triggerMessageId?: string | null,
  ): Promise<WhatsAppAiContextSnapshot> {
    const sourceContextIds: WhatsAppAiContextSnapshot['sourceContextIds'] = {
      organizationId: orgId,
      conversationId: conversation.id,
      customerId: conversation.customerId,
      bookingId: conversation.bookingId,
      vehicleId: conversation.vehicleId,
      messageId: triggerMessageId ?? null,
      stationId: null,
    };

    let customer: WhatsAppAiContextSnapshot['customer'] = null;
    if (conversation.customerId) {
      const row = await this.prisma.customer.findFirst({
        where: { id: conversation.customerId, organizationId: orgId },
        select: { id: true, firstName: true, lastName: true, phone: true },
      });
      if (row) {
        customer = {
          id: row.id,
          displayName:
            conversation.contactName ??
            ([row.firstName, row.lastName].filter(Boolean).join(' ') || conversation.contactPhone),
          phone: row.phone,
        };
      }
    }

    let bookingId = conversation.bookingId;
    let vehicleId = conversation.vehicleId;
    let hasActiveBooking = false;

    if (customer && !bookingId) {
      const active = await this.prisma.booking.findFirst({
        where: {
          organizationId: orgId,
          customerId: customer.id,
          status: { in: ACTIVE_BOOKING_STATUSES },
        },
        orderBy: { startDate: 'desc' },
        select: { id: true, vehicleId: true },
      });
      if (active) {
        bookingId = active.id;
        vehicleId = active.vehicleId;
        hasActiveBooking = true;
      }
    }

    let booking: WhatsAppAiContextSnapshot['booking'] = null;
    let station: WhatsAppAiContextSnapshot['station'] = null;

    if (bookingId) {
      const detail = await this.bookings.findDetail(orgId, bookingId);
      if (detail) {
        hasActiveBooking = ACTIVE_BOOKING_STATUSES.includes(detail.core.statusEnum as BookingStatus);
        vehicleId = detail.vehicle?.vehicleId ?? vehicleId;
        booking = {
          id: detail.core.bookingId,
          status: detail.core.status,
          startDate: detail.core.startDate,
          endDate: detail.core.endDate,
          pickupStationName: detail.core.pickupStationName,
          returnStationName: detail.core.returnStationName,
          vehicleLabel: detail.vehicle?.displayName ?? null,
        };

        const pickupStation = detail.stations.pickup;
        if (pickupStation) {
          station = {
            id: pickupStation.stationId,
            name: pickupStation.name,
            handoverInstructions: pickupStation.handoverInstructions,
            returnInstructions: pickupStation.returnInstructions,
            address: pickupStation.address,
          };
          sourceContextIds.stationId = pickupStation.stationId;
        }
      }
    }

    let vehicle: WhatsAppAiContextSnapshot['vehicle'] = null;
    if (vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: orgId },
        select: { id: true, make: true, model: true, licensePlate: true, vehicleName: true },
      });
      if (v) {
        vehicle = {
          id: v.id,
          label:
            v.vehicleName ??
            ([v.make, v.model].filter(Boolean).join(' ') || v.licensePlate || v.id),
          licensePlate: v.licensePlate,
        };
      }
    }

    sourceContextIds.bookingId = bookingId;
    sourceContextIds.vehicleId = vehicleId;
    sourceContextIds.customerId = customer?.id ?? null;

    return {
      organizationId: orgId,
      conversationId: conversation.id,
      customer,
      hasActiveBooking,
      booking,
      vehicle,
      station,
      sourceContextIds,
    };
  }
}
