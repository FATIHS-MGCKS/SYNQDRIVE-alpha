import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import { VehicleCleaningTaskService } from '@modules/tasks/vehicle-cleaning-task.service';
import { BOOKING_DOMAIN_EVENT_TYPES } from '../booking-domain-event.types';
import {
  BOOKING_DOMAIN_EVENT_CONSUMER_IDS,
  buildBookingDomainEventConsumerBusinessKey,
} from './booking-domain-event-consumer.constants';
import { BookingDomainEventConsumerBase } from './booking-domain-event-consumer.base';
import type {
  BookingDomainEventConsumerContext,
  BookingDomainEventConsumerHandler,
  BookingDomainEventConsumerResult,
} from './booking-domain-event-consumer.types';

type BookingLifecycleInput = {
  id: string;
  organizationId: string;
  vehicleId: string;
  customerId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  pickupStationId: string | null;
  returnStationId: string | null;
};

const SUPPORTED = new Set<string>([
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CONFIRMED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_UPDATED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_ACTIVATED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_COMPLETED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CANCELLED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_MARKED_NO_SHOW,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_VEHICLE_CHANGED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CUSTOMER_CHANGED,
  BOOKING_DOMAIN_EVENT_TYPES.BOOKING_PRICING_CHANGED,
  BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED,
  BOOKING_DOMAIN_EVENT_TYPES.RETURN_COMPLETED,
]);

@Injectable()
export class BookingPickupReturnTaskConsumer
  extends BookingDomainEventConsumerBase
  implements BookingDomainEventConsumerHandler
{
  readonly consumerId = BOOKING_DOMAIN_EVENT_CONSUMER_IDS.PICKUP_RETURN_TASKS;

  constructor(
    prisma: PrismaService,
    private readonly taskAutomation: TaskAutomationService,
    private readonly vehicleCleaning: VehicleCleaningTaskService,
  ) {
    super(prisma);
  }

  supportsEvent(eventType: string): boolean {
    return SUPPORTED.has(eventType);
  }

  buildBusinessKey(ctx: BookingDomainEventConsumerContext): string {
    return buildBookingDomainEventConsumerBusinessKey(this.consumerId, [
      ctx.envelope.organizationId,
      ctx.envelope.aggregateId,
      ctx.envelope.eventType,
      String(ctx.envelope.aggregateVersion),
    ]);
  }

  private toLifecycleInput(booking: {
    id: string;
    organizationId: string;
    vehicleId: string;
    customerId: string;
    status: string;
    startDate: Date;
    endDate: Date;
    pickupStationId: string | null;
    returnStationId: string | null;
  }): BookingLifecycleInput {
    return {
      id: booking.id,
      organizationId: booking.organizationId,
      vehicleId: booking.vehicleId,
      customerId: booking.customerId,
      status: booking.status,
      startDate: booking.startDate,
      endDate: booking.endDate,
      pickupStationId: booking.pickupStationId,
      returnStationId: booking.returnStationId,
    };
  }

  async handle(ctx: BookingDomainEventConsumerContext): Promise<BookingDomainEventConsumerResult> {
    const businessKey = this.buildBusinessKey(ctx);
    const booking = await this.loadBooking(
      ctx.envelope.organizationId,
      ctx.envelope.aggregateId,
      ctx.envelope.organizationId,
    );
    this.assertNotStale(ctx, await this.latestAggregateVersion(booking.id));

    const orgId = ctx.envelope.organizationId;
    const lifecycle = this.toLifecycleInput(booking);
    const payload = ctx.envelope.payload;

    switch (ctx.envelope.eventType) {
      case BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CANCELLED:
        await this.taskAutomation.supersedeBookingLifecycleOnCancellation(orgId, booking.id);
        await this.vehicleCleaning.onBookingCancelled(orgId, booking.id, booking.vehicleId);
        break;

      case BOOKING_DOMAIN_EVENT_TYPES.BOOKING_MARKED_NO_SHOW:
        await this.taskAutomation.handleBookingNoShow(orgId, booking.id);
        break;

      case BOOKING_DOMAIN_EVENT_TYPES.PICKUP_COMPLETED:
        await this.taskAutomation.onPickupHandoverCompleted(lifecycle);
        break;

      case BOOKING_DOMAIN_EVENT_TYPES.RETURN_COMPLETED:
        await this.taskAutomation.onReturnHandoverCompleted(lifecycle);
        break;

      case BOOKING_DOMAIN_EVENT_TYPES.BOOKING_VEHICLE_CHANGED: {
        const previousVehicleId = payload.previousVehicleId;
        if (previousVehicleId && previousVehicleId !== booking.vehicleId) {
          await this.vehicleCleaning.onBookingVehicleChanged(lifecycle, previousVehicleId);
        }
        await this.taskAutomation.ensureBookingLifecycleTasks(lifecycle);
        break;
      }

      case BOOKING_DOMAIN_EVENT_TYPES.BOOKING_PRICING_CHANGED: {
        const previousStartDate = payload.previousStartDate
          ? new Date(payload.previousStartDate)
          : null;
        const previousEndDate = payload.previousEndDate ? new Date(payload.previousEndDate) : null;
        if (
          booking.status === 'CONFIRMED' &&
          previousStartDate &&
          previousStartDate.getTime() !== booking.startDate.getTime()
        ) {
          await this.taskAutomation.syncBookingPreparationTiming(lifecycle, {
            previousStartDate,
          });
          await this.taskAutomation.syncBookingPickupTiming(lifecycle, {
            previousStartDate,
          });
        } else if (
          booking.status === 'ACTIVE' &&
          previousEndDate &&
          previousEndDate.getTime() !== booking.endDate.getTime()
        ) {
          await this.taskAutomation.syncBookingReturnTiming(lifecycle, {
            previousEndDate,
          });
        } else {
          await this.taskAutomation.ensureBookingLifecycleTasks(lifecycle);
        }
        break;
      }

      case BOOKING_DOMAIN_EVENT_TYPES.BOOKING_UPDATED:
      case BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CUSTOMER_CHANGED:
        if (booking.status === 'CONFIRMED' || booking.status === 'ACTIVE') {
          await this.taskAutomation.ensureBookingLifecycleTasks(lifecycle);
        }
        break;

      default:
        if (
          booking.status === 'CONFIRMED' ||
          booking.status === 'ACTIVE' ||
          ctx.envelope.eventType === BOOKING_DOMAIN_EVENT_TYPES.BOOKING_CREATED
        ) {
          await this.taskAutomation.ensureBookingLifecycleTasks(lifecycle);
        }
        break;
    }

    return this.succeeded(businessKey, { eventType: ctx.envelope.eventType });
  }
}
