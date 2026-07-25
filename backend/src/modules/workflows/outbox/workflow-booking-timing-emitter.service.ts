import { Injectable, Optional } from '@nestjs/common';
import type { BookingHandoverTiming } from '@modules/tasks/booking-pickup-return-timing.util';
import { WorkflowEventOutboxEmitterService } from './workflow-event-outbox-emitter.service';
import { buildBookingTimingOccurrenceId } from './workflow-event-occurrence.util';
import type { WorkflowTx } from './workflow-event-outbox-emitter.types';

export interface BookingTimingEmitContext {
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  stationId?: string | null;
  timing: BookingHandoverTiming;
  now?: Date;
}

@Injectable()
export class WorkflowBookingTimingEmitterService {
  constructor(
    @Optional() private readonly emitter?: WorkflowEventOutboxEmitterService,
  ) {}

  async emitPickupTiming(
    tx: WorkflowTx,
    ctx: BookingTimingEmitContext,
  ): Promise<void> {
    if (!this.emitter?.isGroupEnabled('bookingTiming')) return;

    const now = ctx.now ?? new Date();
    const dueAt = ctx.timing.milestoneAt.toISOString();
    const base = {
      organizationId: ctx.organizationId,
      entityType: 'booking' as const,
      entityId: ctx.bookingId,
      source: 'bookings',
      correlationId: `booking-lifecycle:${ctx.bookingId}`,
      payload: {
        bookingId: ctx.bookingId,
        vehicleId: ctx.vehicleId,
        dueAt,
        ...(ctx.stationId ? { stationId: ctx.stationId } : {}),
      },
      group: 'bookingTiming' as const,
    };

    const dueReached =
      now.getTime() >= ctx.timing.dueDate.getTime()
      && now.getTime() < ctx.timing.milestoneAt.getTime();
    if (dueReached) {
      const occurrenceId = buildBookingTimingOccurrenceId(
        'booking.pickup_due',
        ctx.bookingId,
        ctx.timing.milestoneDateOnly,
      );
      await this.emitter.enqueueInTransaction(tx, {
        ...base,
        eventType: 'booking.pickup_due',
        occurrenceId,
      });
    }

    if (ctx.timing.isOverdue) {
      const minutesOverdue = Math.max(
        0,
        Math.floor((now.getTime() - ctx.timing.milestoneAt.getTime()) / 60_000),
      );
      const occurrenceId = buildBookingTimingOccurrenceId(
        'booking.pickup_overdue',
        ctx.bookingId,
        ctx.timing.milestoneDateOnly,
      );
      await this.emitter.enqueueInTransaction(tx, {
        ...base,
        eventType: 'booking.pickup_overdue',
        occurrenceId,
        payload: { ...base.payload, minutesOverdue },
      });
    }
  }

  async emitReturnTiming(
    tx: WorkflowTx,
    ctx: BookingTimingEmitContext,
  ): Promise<void> {
    if (!this.emitter?.isGroupEnabled('bookingTiming')) return;

    const now = ctx.now ?? new Date();
    const dueAt = ctx.timing.milestoneAt.toISOString();
    const base = {
      organizationId: ctx.organizationId,
      entityType: 'booking' as const,
      entityId: ctx.bookingId,
      source: 'bookings',
      correlationId: `booking-handover:${ctx.bookingId}`,
      payload: {
        bookingId: ctx.bookingId,
        vehicleId: ctx.vehicleId,
        dueAt,
        ...(ctx.stationId ? { stationId: ctx.stationId } : {}),
      },
      group: 'bookingTiming' as const,
    };

    const dueReached =
      now.getTime() >= ctx.timing.dueDate.getTime()
      && now.getTime() < ctx.timing.milestoneAt.getTime();
    if (dueReached) {
      const occurrenceId = buildBookingTimingOccurrenceId(
        'booking.return_due',
        ctx.bookingId,
        ctx.timing.milestoneDateOnly,
      );
      await this.emitter.enqueueInTransaction(tx, {
        ...base,
        eventType: 'booking.return_due',
        occurrenceId,
      });
    }

    if (ctx.timing.isOverdue) {
      const minutesOverdue = Math.max(
        0,
        Math.floor((now.getTime() - ctx.timing.milestoneAt.getTime()) / 60_000),
      );
      const occurrenceId = buildBookingTimingOccurrenceId(
        'booking.return_overdue',
        ctx.bookingId,
        ctx.timing.milestoneDateOnly,
      );
      await this.emitter.enqueueInTransaction(tx, {
        ...base,
        eventType: 'booking.return_overdue',
        occurrenceId,
        payload: { ...base.payload, minutesOverdue },
      });
    }
  }

  /** Standalone enqueue for schedulers without enclosing tx. */
  async emitPickupTimingStandalone(ctx: BookingTimingEmitContext): Promise<void> {
    if (!this.emitter) return;
    await this.emitter.enqueueStandalone({
      organizationId: ctx.organizationId,
      eventType: ctx.timing.isOverdue ? 'booking.pickup_overdue' : 'booking.pickup_due',
      source: 'bookings',
      entityType: 'booking',
      entityId: ctx.bookingId,
      correlationId: `booking-lifecycle:${ctx.bookingId}`,
      group: 'bookingTiming',
      occurrenceId: buildBookingTimingOccurrenceId(
        ctx.timing.isOverdue ? 'booking.pickup_overdue' : 'booking.pickup_due',
        ctx.bookingId,
        ctx.timing.milestoneDateOnly,
      ),
      payload: {
        bookingId: ctx.bookingId,
        vehicleId: ctx.vehicleId,
        dueAt: ctx.timing.milestoneAt.toISOString(),
        ...(ctx.timing.isOverdue
          ? {
              minutesOverdue: Math.max(
                0,
                Math.floor(
                  ((ctx.now ?? new Date()).getTime() - ctx.timing.milestoneAt.getTime()) / 60_000,
                ),
              ),
            }
          : {}),
        ...(ctx.stationId ? { stationId: ctx.stationId } : {}),
      },
    });
  }

  async emitReturnTimingStandalone(ctx: BookingTimingEmitContext): Promise<void> {
    if (!this.emitter) return;
    await this.emitter.enqueueStandalone({
      organizationId: ctx.organizationId,
      eventType: ctx.timing.isOverdue ? 'booking.return_overdue' : 'booking.return_due',
      source: 'bookings',
      entityType: 'booking',
      entityId: ctx.bookingId,
      correlationId: `booking-handover:${ctx.bookingId}`,
      group: 'bookingTiming',
      occurrenceId: buildBookingTimingOccurrenceId(
        ctx.timing.isOverdue ? 'booking.return_overdue' : 'booking.return_due',
        ctx.bookingId,
        ctx.timing.milestoneDateOnly,
      ),
      payload: {
        bookingId: ctx.bookingId,
        vehicleId: ctx.vehicleId,
        dueAt: ctx.timing.milestoneAt.toISOString(),
        ...(ctx.timing.isOverdue
          ? {
              minutesOverdue: Math.max(
                0,
                Math.floor(
                  ((ctx.now ?? new Date()).getTime() - ctx.timing.milestoneAt.getTime()) / 60_000,
                ),
              ),
            }
          : {}),
        ...(ctx.stationId ? { stationId: ctx.stationId } : {}),
      },
    });
  }
}
