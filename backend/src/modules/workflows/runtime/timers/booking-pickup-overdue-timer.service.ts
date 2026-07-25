import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkflowTimer } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { computeBookingPickupTiming } from '@modules/tasks/booking-pickup-return-timing.util';
import { WorkflowBookingTimingEmitterService } from '../../outbox/workflow-booking-timing-emitter.service';
import { buildBookingTimingOccurrenceId } from '../../outbox/workflow-event-occurrence.util';
import { WorkflowDurableTimerService } from './workflow-durable-timer.service';
import { BookingPickupOverdueRecheckService } from './booking-pickup-overdue-recheck.service';

export interface BookingTimerSyncInput {
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  pickupStationId?: string | null;
  startDate: Date;
  status: string;
  timeZone?: string;
}

@Injectable()
export class BookingPickupOverdueTimerService {
  private readonly logger = new Logger(BookingPickupOverdueTimerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly durableTimers: WorkflowDurableTimerService,
    private readonly recheck: BookingPickupOverdueRecheckService,
    private readonly prisma: PrismaService,
    @Optional() private readonly timingEmitter?: WorkflowBookingTimingEmitterService,
  ) {}

  private get offsetMinutes() {
    return this.config.get<number>('workflowRuntime.bookingPickupOverdueOffsetMinutes', 30);
  }

  buildOccurrenceId(bookingId: string, milestoneDateOnly: string): string {
    return buildBookingTimingOccurrenceId('booking.pickup_overdue', bookingId, milestoneDateOnly);
  }

  computeDueAt(pickupAt: Date): Date {
    return new Date(pickupAt.getTime() + this.offsetMinutes * 60_000);
  }

  async syncForConfirmedBooking(input: BookingTimerSyncInput, tx?: Parameters<WorkflowDurableTimerService['scheduleOrReplace']>[1]): Promise<void> {
    if (input.status !== 'CONFIRMED') {
      await this.cancelForBooking(input.organizationId, input.bookingId);
      return;
    }

    const timeZone = input.timeZone ?? 'Europe/Berlin';
    const timing = computeBookingPickupTiming(input.startDate, new Date(), timeZone);
    const occurrenceId = this.buildOccurrenceId(input.bookingId, timing.milestoneDateOnly);
    const dueAt = this.computeDueAt(input.startDate);

    if (dueAt.getTime() <= Date.now()) {
      await this.cancelForBooking(input.organizationId, occurrenceId);
      return;
    }

    await this.durableTimers.scheduleOrReplace(
      {
        organizationId: input.organizationId,
        occurrenceId,
        idempotencyKey: `timer:${occurrenceId}`,
        timerType: 'SCHEDULED_TRIGGER',
        dueAt,
        payload: {
          trigger: 'booking.pickup_overdue',
          bookingId: input.bookingId,
          vehicleId: input.vehicleId,
          pickupAt: input.startDate.toISOString(),
          stationId: input.pickupStationId ?? null,
          milestoneDateOnly: timing.milestoneDateOnly,
          timeZone,
        },
      },
      tx,
    );
  }

  async cancelForBooking(orgId: string, bookingIdOrOccurrence: string): Promise<void> {
    const timers = await this.prisma.workflowTimer.findMany({
      where: {
        organizationId: orgId,
        status: 'SCHEDULED',
        OR: [
          { occurrenceId: { contains: bookingIdOrOccurrence } },
          {
            payload: {
              path: ['bookingId'],
              equals: bookingIdOrOccurrence,
            },
          },
        ],
      },
      select: { occurrenceId: true },
    });
    for (const row of timers) {
      if (row.occurrenceId) {
        await this.durableTimers.cancelByOccurrence(orgId, row.occurrenceId);
      }
    }
  }

  async handleScheduledTrigger(
    timer: WorkflowTimer,
    now: Date,
    lateMs: number,
  ): Promise<{ skipped: boolean; skipReason?: string }> {
    const payload =
      timer.payload && typeof timer.payload === 'object' && !Array.isArray(timer.payload)
        ? (timer.payload as Record<string, unknown>)
        : {};

    if (payload.trigger !== 'booking.pickup_overdue') {
      return { skipped: true, skipReason: 'unknown_trigger' };
    }

    const bookingId = typeof payload.bookingId === 'string' ? payload.bookingId : null;
    if (!bookingId) {
      return { skipped: true, skipReason: 'missing_booking_id' };
    }

    const recheck = await this.recheck.evaluate(timer.organizationId, bookingId, now);
    if (!recheck.shouldEmit) {
      this.logger.debug(
        `Skipping booking.pickup_overdue for ${bookingId}: ${recheck.skipReason ?? 'conditions_not_met'}`,
      );
      return { skipped: true, skipReason: recheck.skipReason };
    }

    const timeZone = typeof payload.timeZone === 'string' ? payload.timeZone : 'Europe/Berlin';
    const pickupAt = typeof payload.pickupAt === 'string' ? new Date(payload.pickupAt) : new Date();
    const timing = {
      ...computeBookingPickupTiming(pickupAt, now, timeZone),
      isOverdue: true,
    };

    await this.timingEmitter?.emitPickupTimingStandalone({
      organizationId: timer.organizationId,
      bookingId,
      vehicleId: typeof payload.vehicleId === 'string' ? payload.vehicleId : '',
      stationId: typeof payload.stationId === 'string' ? payload.stationId : null,
      timing,
      now,
    });

    this.logger.log(
      `Emitted booking.pickup_overdue for ${bookingId} (lateMs=${lateMs}, occurrenceId=${timer.occurrenceId})`,
    );
    return { skipped: false };
  }
}
