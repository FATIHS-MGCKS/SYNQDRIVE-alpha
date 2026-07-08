import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, TripAssignmentStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  TripAttribution,
  TripAttributionBookingOverlap,
  TripAttributionInput,
} from './trip-attribution.types';

@Injectable()
export class TripAttributionService {
  constructor(private readonly prisma: PrismaService) {}

  resolveAttribution(input: TripAttributionInput): TripAttribution {
    if (
      input.isPrivateTrip ||
      input.assignmentStatus === TripAssignmentStatus.PRIVATE_UNASSIGNED
    ) {
      return {
        scope: 'PRIVATE',
        confidence: 'HIGH',
        customerRelevant: false,
        bookingRelevant: false,
        customerChargeable: false,
        bookingId: null,
        customerId: null,
        reason: 'Privatfahrt — nicht kunden- oder buchungsrelevant',
      };
    }

    if (
      input.assignedBookingId &&
      input.bookingLinkSource === 'EXPLICIT'
    ) {
      return {
        scope: 'BOOKING_ASSIGNED',
        confidence: 'HIGH',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: input.assignedBookingId,
        customerId: input.assignmentSubjectId,
        reason: 'Explizit mit Buchung verknüpft',
      };
    }

    const overlap = input.bookingOverlap ?? null;
    if (
      input.assignedBookingId &&
      (input.bookingLinkSource === 'TIME_WINDOW' || input.bookingLinkSource == null)
    ) {
      return {
        scope: 'BOOKING_TIME_WINDOW_MATCH',
        confidence: 'MEDIUM',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: input.assignedBookingId,
        customerId: input.assignmentSubjectId ?? overlap?.customerId ?? null,
        reason: 'Nur über Buchungszeitfenster gefunden — Zuordnung nicht bestätigt',
      };
    }

    if (overlap) {
      return {
        scope: 'BOOKING_TIME_WINDOW_MATCH',
        confidence: 'LOW',
        customerRelevant: true,
        bookingRelevant: true,
        customerChargeable: false,
        bookingId: overlap.bookingId,
        customerId: overlap.customerId,
        reason: 'Nur über Buchungszeitfenster gefunden — Zuordnung nicht bestätigt',
      };
    }

    return {
      scope: 'UNASSIGNED',
      confidence: 'LOW',
      customerRelevant: false,
      bookingRelevant: false,
      customerChargeable: false,
      bookingId: null,
      customerId: null,
      reason: 'Keine Buchung verknüpft',
    };
  }

  async resolveAttributionForTrip(trip: {
    isPrivateTrip: boolean;
    assignmentStatus: TripAssignmentStatus | null;
    assignedBookingId: string | null;
    assignmentSubjectId: string | null;
    bookingLinkSource: 'EXPLICIT' | 'TIME_WINDOW' | null;
    vehicleId: string;
    startTime: Date;
    endTime: Date | null;
  }): Promise<TripAttribution> {
    const overlap =
      trip.assignedBookingId && trip.bookingLinkSource === 'EXPLICIT'
        ? null
        : await this.findBookingOverlap(trip);

    return this.resolveAttribution({
      isPrivateTrip: trip.isPrivateTrip,
      assignmentStatus: trip.assignmentStatus,
      assignedBookingId: trip.assignedBookingId,
      assignmentSubjectId: trip.assignmentSubjectId,
      bookingLinkSource: trip.bookingLinkSource,
      bookingOverlap: overlap,
    });
  }

  async findBookingOverlap(trip: {
    vehicleId: string;
    startTime: Date;
    endTime: Date | null;
    assignedBookingId?: string | null;
  }): Promise<TripAttributionBookingOverlap | null> {
    const tripEnd = trip.endTime ?? trip.startTime;
    const where: Prisma.BookingWhereInput = {
      vehicleId: trip.vehicleId,
      status: { in: [BookingStatus.ACTIVE, BookingStatus.COMPLETED] },
      startDate: { lte: tripEnd },
      endDate: { gte: trip.startTime },
    };
    if (trip.assignedBookingId) {
      where.id = trip.assignedBookingId;
    }

    const booking = await this.prisma.booking.findFirst({
      where,
      orderBy: { startDate: 'desc' },
      select: { id: true, customerId: true },
    });
    if (!booking) return null;
    return { bookingId: booking.id, customerId: booking.customerId };
  }

  isCustomerAnalyticsEligible(attribution: TripAttribution): boolean {
    return attribution.scope === 'BOOKING_ASSIGNED';
  }

  isBookingAnalyticsEligible(attribution: TripAttribution): boolean {
    return attribution.scope === 'BOOKING_ASSIGNED';
  }

  isHintOnlyAttribution(attribution: TripAttribution): boolean {
    return attribution.scope === 'BOOKING_TIME_WINDOW_MATCH';
  }
}
