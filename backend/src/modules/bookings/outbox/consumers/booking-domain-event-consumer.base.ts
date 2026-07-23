import type { Booking } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingDomainEventConsumerContext } from './booking-domain-event-consumer.types';
import { BookingDomainEventStaleError, BookingDomainEventTenantError } from './booking-domain-event-consumer.errors';

export abstract class BookingDomainEventConsumerBase {
  constructor(protected readonly prisma: PrismaService) {}

  protected async loadBooking(
    organizationId: string,
    bookingId: string,
    envelopeOrgId: string,
  ): Promise<Booking> {
    if (organizationId !== envelopeOrgId) {
      throw new BookingDomainEventTenantError('Organization mismatch between envelope and handler', {
        organizationId,
        envelopeOrgId,
        bookingId,
      });
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
    });
    if (!booking) {
      throw new BookingDomainEventTenantError('Booking not found for tenant', {
        organizationId,
        bookingId,
      });
    }
    return booking;
  }

  protected assertNotStale(
    ctx: BookingDomainEventConsumerContext,
    currentAggregateVersion: number,
  ): void {
    if (currentAggregateVersion > ctx.envelope.aggregateVersion) {
      throw new BookingDomainEventStaleError({
        eventAggregateVersion: ctx.envelope.aggregateVersion,
        currentAggregateVersion,
        bookingId: ctx.envelope.aggregateId,
      });
    }
  }

  protected async latestAggregateVersion(bookingId: string): Promise<number> {
    const latest = await this.prisma.bookingDomainEventOutbox.findFirst({
      where: { aggregateId: bookingId },
      orderBy: { aggregateVersion: 'desc' },
      select: { aggregateVersion: true },
    });
    return latest?.aggregateVersion ?? 0;
  }

  protected skipped(businessKey: string, reason: string, metadata?: Record<string, unknown>) {
    return {
      status: 'SKIPPED' as const,
      businessKey,
      metadata: { reason, ...metadata },
    };
  }

  protected succeeded(businessKey: string, metadata?: Record<string, unknown>) {
    return {
      status: 'SUCCEEDED' as const,
      businessKey,
      metadata,
    };
  }
}
