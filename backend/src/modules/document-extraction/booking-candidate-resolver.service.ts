import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildBookingResolverHints,
  scoreBookingCandidates,
} from './booking-candidate-matching.util';
import {
  BOOKING_CANDIDATE_RESOLVER_DOCUMENT_TYPES,
  type BookingCandidatePipelineState,
  type BookingCandidateResolverInput,
  type BookingCandidateSearchRecord,
} from './booking-candidate-resolver.types';

const BOOKING_SELECT = {
  id: true,
  vehicleId: true,
  customerId: true,
  assignedDriverId: true,
  startDate: true,
  endDate: true,
  status: true,
  customer: {
    select: {
      firstName: true,
      lastName: true,
      company: true,
    },
  },
} satisfies Prisma.BookingSelect;

const BOOKING_MATCH_STATUSES = ['ACTIVE', 'COMPLETED', 'CONFIRMED'] as const;

@Injectable()
export class BookingCandidateResolverService {
  constructor(private readonly prisma: PrismaService) {}

  supportsDocumentType(documentType: string): boolean {
    return (BOOKING_CANDIDATE_RESOLVER_DOCUMENT_TYPES as readonly string[]).includes(documentType);
  }

  async resolve(input: BookingCandidateResolverInput): Promise<BookingCandidatePipelineState> {
    const hints = buildBookingResolverHints(input);

    if (!input.vehicleId) {
      return {
        evaluatedAt: new Date().toISOString(),
        hints,
        candidates: [],
        ambiguousOverlap: false,
        autoConfirmEligible: false,
      };
    }

    const bookings = await this.loadBookingsForHints({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      hints,
    });

    const candidates = scoreBookingCandidates({ bookings, hints });
    const overlapMatches = candidates.filter(
      (candidate) =>
        candidate.temporalOverlap && candidate.confidence >= 0.55,
    );

    return {
      evaluatedAt: new Date().toISOString(),
      hints,
      candidates,
      ambiguousOverlap: overlapMatches.length > 1,
      autoConfirmEligible: false,
    };
  }

  private async loadBookingsForHints(input: {
    organizationId: string;
    vehicleId: string;
    hints: ReturnType<typeof buildBookingResolverHints>;
  }): Promise<BookingCandidateSearchRecord[]> {
    const { organizationId, vehicleId, hints } = input;
    const where: Prisma.BookingWhereInput = {
      organizationId,
      vehicleId,
      status: { in: [...BOOKING_MATCH_STATUSES] },
    };

    if (hints.eventInstant && hints.eventTimePrecision !== 'missing') {
      const eventDate = new Date(hints.eventInstant);
      const windowStart = new Date(eventDate);
      const windowEnd = new Date(eventDate);
      if (hints.eventTimePrecision === 'date') {
        windowStart.setUTCHours(0, 0, 0, 0);
        windowEnd.setUTCHours(23, 59, 59, 999);
      }
      where.startDate = { lte: windowEnd };
      where.endDate = { gte: windowStart };
    }

    const rows = await this.prisma.booking.findMany({
      where,
      select: BOOKING_SELECT,
      orderBy: { startDate: 'desc' },
      take: 25,
    });

    const byId = new Map(rows.map((row) => [row.id, row]));

    if (hints.documentContextBookingId) {
      const contextBooking = await this.prisma.booking.findFirst({
        where: {
          id: hints.documentContextBookingId,
          organizationId,
          vehicleId,
          status: { in: [...BOOKING_MATCH_STATUSES] },
        },
        select: BOOKING_SELECT,
      });
      if (contextBooking) {
        byId.set(contextBooking.id, contextBooking);
      }
    }

    if (hints.bookingReference) {
      const referencedBooking = await this.prisma.booking.findFirst({
        where: {
          id: hints.bookingReference,
          organizationId,
          vehicleId,
          status: { in: [...BOOKING_MATCH_STATUSES] },
        },
        select: BOOKING_SELECT,
      });
      if (referencedBooking) {
        byId.set(referencedBooking.id, referencedBooking);
      }
    }

    return [...byId.values()];
  }
}
