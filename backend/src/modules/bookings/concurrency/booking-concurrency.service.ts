import { Injectable } from '@nestjs/common';
import { Booking, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingVersionRefreshPayload } from './booking-concurrency.constants';
import {
  BookingVersionConflictError,
  BookingVersionRequiredError,
} from './booking-concurrency.errors';

@Injectable()
export class BookingConcurrencyService {
  constructor(private readonly prisma: PrismaService) {}

  requireExpectedUpdatedAt(
    expectedUpdatedAt: string | undefined | null,
  ): Date {
    const trimmed = expectedUpdatedAt?.trim();
    if (!trimmed) {
      throw new BookingVersionRequiredError();
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new BookingVersionRequiredError();
    }
    return parsed;
  }

  toRefreshPayload(booking: Pick<
    Booking,
    | 'id'
    | 'updatedAt'
    | 'status'
    | 'vehicleId'
    | 'customerId'
    | 'startDate'
    | 'endDate'
    | 'totalPriceCents'
  >): BookingVersionRefreshPayload {
    return {
      bookingId: booking.id,
      updatedAt: booking.updatedAt.toISOString(),
      status: booking.status,
      vehicleId: booking.vehicleId,
      customerId: booking.customerId,
      startDate: booking.startDate.toISOString(),
      endDate: booking.endDate.toISOString(),
      totalPriceCents: booking.totalPriceCents,
    };
  }

  async loadForVersionCheck(
    organizationId: string,
    bookingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking | null> {
    const client = tx ?? this.prisma;
    return client.booking.findFirst({
      where: { id: bookingId, organizationId },
    });
  }

  async assertVersionMatches(
    organizationId: string,
    bookingId: string,
    expectedUpdatedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking> {
    const current = await this.loadForVersionCheck(organizationId, bookingId, tx);
    if (!current) {
      throw new BookingVersionConflictError({
        bookingId,
        updatedAt: expectedUpdatedAt.toISOString(),
        status: 'UNKNOWN',
        vehicleId: '',
        customerId: '',
        startDate: '',
        endDate: '',
        totalPriceCents: null,
      });
    }
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new BookingVersionConflictError(this.toRefreshPayload(current));
    }
    return current;
  }

  async optimisticUpdate(
    organizationId: string,
    bookingId: string,
    expectedUpdatedAt: Date,
    data: Prisma.BookingUpdateManyMutationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking> {
    const client = tx ?? this.prisma;
    const result = await client.booking.updateMany({
      where: {
        id: bookingId,
        organizationId,
        updatedAt: expectedUpdatedAt,
      },
      data,
    });

    if (result.count === 1) {
      const updated = await client.booking.findFirst({
        where: { id: bookingId, organizationId },
      });
      if (!updated) {
        throw new BookingVersionConflictError({
          bookingId,
          updatedAt: expectedUpdatedAt.toISOString(),
          status: 'UNKNOWN',
          vehicleId: '',
          customerId: '',
          startDate: '',
          endDate: '',
          totalPriceCents: null,
        });
      }
      return updated;
    }

    const current = await client.booking.findFirst({
      where: { id: bookingId, organizationId },
    });
    if (!current) {
      throw new BookingVersionConflictError({
        bookingId,
        updatedAt: expectedUpdatedAt.toISOString(),
        status: 'UNKNOWN',
        vehicleId: '',
        customerId: '',
        startDate: '',
        endDate: '',
        totalPriceCents: null,
      });
    }
    throw new BookingVersionConflictError(this.toRefreshPayload(current));
  }
}
