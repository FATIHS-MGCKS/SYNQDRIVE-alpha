import { Injectable } from '@nestjs/common';
import type { Booking, Prisma } from '@prisma/client';
import { BookingDomainEventOutboxRepository } from './booking-domain-event-outbox.repository';
import {
  BOOKING_DOMAIN_EVENT_TYPES,
  type BookingDomainEventType,
} from './booking-domain-event.types';
import {
  buildBookingDomainEventCorrelationId,
  buildBookingDomainEventIdempotencyKey,
} from './booking-domain-event-outbox.constants';
import { buildBookingEventPayload } from './booking-domain-event-payload.util';

export type BookingDomainEventContext = {
  correlationId?: string;
  causationId?: string | null;
  actorUserId?: string | null;
};

@Injectable()
export class BookingDomainEventLifecycleService {
  constructor(private readonly outboxRepo: BookingDomainEventOutboxRepository) {}

  private correlationId(bookingId: string, ctx?: BookingDomainEventContext): string {
    return ctx?.correlationId?.trim() || buildBookingDomainEventCorrelationId(bookingId);
  }

  private async emit(
    tx: Prisma.TransactionClient,
    input: {
      eventType: BookingDomainEventType;
      booking: Pick<
        Booking,
        'id' | 'organizationId' | 'status' | 'vehicleId' | 'customerId' | 'totalPriceCents' | 'startDate' | 'endDate'
      >;
      payloadExtras?: Parameters<typeof buildBookingEventPayload>[0];
      idempotencySuffix: string;
      ctx?: BookingDomainEventContext;
    },
  ) {
    const payload = buildBookingEventPayload({
      bookingId: input.booking.id,
      status: input.booking.status,
      vehicleId: input.booking.vehicleId,
      customerId: input.booking.customerId,
      totalPriceCents: input.booking.totalPriceCents,
      startDate: input.booking.startDate,
      endDate: input.booking.endDate,
      ...input.payloadExtras,
    });

    return this.outboxRepo.enqueueInTransaction(tx, {
      eventType: input.eventType,
      aggregateId: input.booking.id,
      organizationId: input.booking.organizationId,
      payload,
      correlationId: this.correlationId(input.booking.id, input.ctx),
      causationId: input.ctx?.causationId ?? input.ctx?.actorUserId ?? null,
      idempotencyKey: buildBookingDomainEventIdempotencyKey([
        input.booking.organizationId,
        input.eventType,
        input.booking.id,
        input.idempotencySuffix,
      ]),
    });
  }

  async recordCreated(
    tx: Prisma.TransactionClient,
    booking: Booking,
    ctx?: BookingDomainEventContext,
  ) {
    await this.emit(tx, {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
      booking,
      idempotencySuffix: 'created',
      ctx,
    });
    if (booking.status === 'CONFIRMED') {
      await this.emit(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
        booking,
        idempotencySuffix: 'confirmed-at-create',
        ctx,
      });
    }
  }

  async recordUpdated(
    tx: Prisma.TransactionClient,
    existing: Booking,
    updated: Booking,
    ctx?: BookingDomainEventContext,
  ) {
    const suffix = `${updated.updatedAt.toISOString()}:${updated.status}`;
    await this.emit(tx, {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_UPDATED,
      booking: updated,
      payloadExtras: { previousStatus: existing.status },
      idempotencySuffix: `updated:${suffix}`,
      ctx,
    });

    if (updated.customerId !== existing.customerId) {
      await this.emit(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CUSTOMER_CHANGED,
        booking: updated,
        payloadExtras: {
          previousCustomerId: existing.customerId,
        },
        idempotencySuffix: `customer:${updated.customerId}`,
        ctx,
      });
    }

    if (updated.vehicleId !== existing.vehicleId) {
      await this.emit(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_VEHICLE_CHANGED,
        booking: updated,
        payloadExtras: {
          previousVehicleId: existing.vehicleId,
        },
        idempotencySuffix: `vehicle:${updated.vehicleId}`,
        ctx,
      });
    }

    const pricingChanged =
      updated.totalPriceCents !== existing.totalPriceCents ||
      updated.dailyRateCents !== existing.dailyRateCents ||
      updated.startDate.getTime() !== existing.startDate.getTime() ||
      updated.endDate.getTime() !== existing.endDate.getTime();

    if (pricingChanged) {
      await this.emit(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_PRICING_CHANGED,
        booking: updated,
        idempotencySuffix: `pricing:${updated.totalPriceCents}:${updated.startDate.toISOString()}`,
        ctx,
      });
    }

    if (existing.status !== 'CONFIRMED' && updated.status === 'CONFIRMED') {
      await this.emit(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
        booking: updated,
        payloadExtras: { previousStatus: existing.status },
        idempotencySuffix: `confirmed:${suffix}`,
        ctx,
      });
    }
  }

  async recordCancelled(
    tx: Prisma.TransactionClient,
    booking: Booking,
    ctx?: BookingDomainEventContext,
  ) {
    await this.emit(tx, {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CANCELLED,
      booking,
      idempotencySuffix: `cancelled:${booking.cancelledAt?.toISOString() ?? 'now'}`,
      ctx,
    });
  }

  async recordNoShow(
    tx: Prisma.TransactionClient,
    booking: Booking,
    ctx?: BookingDomainEventContext,
  ) {
    await this.emit(tx, {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_MARKED_NO_SHOW,
      booking,
      idempotencySuffix: `no-show:${booking.cancelledAt?.toISOString() ?? 'now'}`,
      ctx,
    });
  }

  async recordPickupCompleted(
    tx: Prisma.TransactionClient,
    booking: Booking,
    protocolId: string,
    ctx?: BookingDomainEventContext,
  ) {
    await this.emit(tx, {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED,
      booking,
      payloadExtras: {
        protocolId,
        handoverKind: 'PICKUP',
        previousStatus: 'CONFIRMED',
      },
      idempotencySuffix: `pickup:${protocolId}`,
      ctx,
    });
    if (booking.status === 'ACTIVE') {
      await this.emit(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_ACTIVATED,
        booking,
        payloadExtras: {
          protocolId,
          handoverKind: 'PICKUP',
          previousStatus: 'CONFIRMED',
        },
        idempotencySuffix: `activated:${protocolId}`,
        ctx,
      });
    }
  }

  async recordReturnCompleted(
    tx: Prisma.TransactionClient,
    booking: Booking,
    protocolId: string,
    ctx?: BookingDomainEventContext,
  ) {
    await this.emit(tx, {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.RETURN_COMPLETED,
      booking,
      payloadExtras: {
        protocolId,
        handoverKind: 'RETURN',
        previousStatus: 'ACTIVE',
      },
      idempotencySuffix: `return:${protocolId}`,
      ctx,
    });
    if (booking.status === 'COMPLETED') {
      await this.emit(tx, {
        eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_COMPLETED,
        booking,
        payloadExtras: {
          protocolId,
          handoverKind: 'RETURN',
          previousStatus: 'ACTIVE',
        },
        idempotencySuffix: `completed:${protocolId}`,
        ctx,
      });
    }
  }

  async recordLegalAccepted(
    tx: Prisma.TransactionClient,
    booking: Pick<
      Booking,
      'id' | 'organizationId' | 'status' | 'vehicleId' | 'customerId' | 'totalPriceCents' | 'startDate' | 'endDate'
    >,
    acceptanceType: string,
    acceptanceId: string,
    ctx?: BookingDomainEventContext,
  ) {
    await this.emit(tx, {
      eventType: BOOKING_DOMAIN_EVENT_TYPES.BOOKING_LEGAL_ACCEPTED,
      booking,
      payloadExtras: { acceptanceType },
      idempotencySuffix: `legal:${acceptanceId}`,
      ctx,
    });
  }
}
