import { Injectable, Logger } from '@nestjs/common';
import { BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { findTransition, resolveBookingStatusTransition } from './booking-state-machine';
import type {
  AssertBookingTransitionInput,
  BookingStatusTransitionDefinition,
  BookingTransitionActor,
  BookingStatusTrigger,
} from './booking-state-machine.types';

export interface ApplyBookingStatusTransitionInput {
  organizationId: string;
  bookingId: string;
  vehicleId: string;
  from: BookingStatus;
  to: BookingStatus;
  trigger: BookingStatusTrigger;
  actor: BookingTransitionActor;
  preconditions?: AssertBookingTransitionInput['preconditions'];
  override?: AssertBookingTransitionInput['override'];
  reason?: string | null;
  patch?: {
    cancelledAt?: Date;
    completedAt?: Date;
    notes?: string | null;
  };
  correlationId?: string;
}

export interface BookingStatusTransitionResult {
  definition: BookingStatusTransitionDefinition;
  from: BookingStatus;
  to: BookingStatus;
}

@Injectable()
export class BookingStatusTransitionService {
  private readonly logger = new Logger(BookingStatusTransitionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly workflowEvents: WorkflowEventService,
  ) {}

  planTransition(
    input: Omit<
      ApplyBookingStatusTransitionInput,
      'organizationId' | 'bookingId' | 'vehicleId' | 'actor' | 'patch' | 'correlationId'
    >,
  ): BookingStatusTransitionResult {
    const definition = resolveBookingStatusTransition({
      from: input.from,
      to: input.to,
      trigger: input.trigger,
      preconditions: input.preconditions,
      override: input.override,
    });
    return { definition, from: input.from, to: input.to };
  }

  assertInitialStatus(status: BookingStatus): BookingStatusTransitionDefinition {
    const found = findTransition(null, status, 'create');
    if (!found) {
      throw new Error(`Invalid initial booking status: ${status}`);
    }
    return found;
  }

  buildUpdateData(
    to: BookingStatus,
    patch?: ApplyBookingStatusTransitionInput['patch'],
  ): Prisma.BookingUncheckedUpdateInput {
    const data: Prisma.BookingUncheckedUpdateInput = { status: to };
    if (to === 'CANCELLED' || to === 'NO_SHOW') {
      data.cancelledAt = patch?.cancelledAt ?? new Date();
    }
    if (to === 'COMPLETED') {
      data.completedAt = patch?.completedAt ?? new Date();
    }
    if (patch?.notes !== undefined) {
      data.notes = patch.notes;
    }
    return data;
  }

  async recordTransitionEffects(
    input: ApplyBookingStatusTransitionInput & BookingStatusTransitionResult,
  ): Promise<void> {
    const {
      organizationId,
      bookingId,
      vehicleId,
      from,
      to,
      definition,
      actor,
      reason,
      override,
      correlationId,
    } = input;

    const timestamp = new Date().toISOString();
    const description = `Booking status ${from} → ${to} (${definition.reasonCode})`;

    await this.activityLog
      .log({
        organizationId,
        userId: actor.userId ?? undefined,
        action: 'UPDATE',
        entity: 'BOOKING',
        entityId: bookingId,
        description,
        metaJson: {
          kind: 'booking_status_transition',
          from,
          to,
          trigger: definition.trigger,
          reasonCode: definition.reasonCode,
          permission: definition.permission,
          reason: reason ?? null,
          overrideReason: override?.reason ?? null,
          actorUserId: actor.userId ?? null,
          actorDisplayName: actor.displayName ?? null,
          timestamp,
          correlationId: correlationId ?? null,
        },
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to write booking status audit booking=${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    if (definition.workflowEventType) {
      this.workflowEvents.scheduleEmit({
        organizationId,
        type: definition.workflowEventType,
        entityType: 'booking',
        entityId: bookingId,
        idempotencyKey: `${definition.workflowEventType}:${bookingId}:${from}:${to}`,
        payload: {
          bookingId,
          vehicleId,
          fromStatus: from,
          toStatus: to,
          reasonCode: definition.reasonCode,
          actorUserId: actor.userId ?? null,
        },
        occurredAt: new Date(),
      });
    }
  }

  async executeTransition(
    input: ApplyBookingStatusTransitionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<BookingStatusTransitionResult> {
    const planned = this.planTransition(input);
    const client = tx ?? this.prisma;
    const updateData = this.buildUpdateData(planned.to, input.patch);

    await client.booking.update({
      where: { id: input.bookingId, organizationId: input.organizationId },
      data: updateData,
    });

    if (!tx) {
      await this.recordTransitionEffects({ ...input, ...planned });
    }

    return planned;
  }

  async commitTransitionEffects(
    input: ApplyBookingStatusTransitionInput,
    result: BookingStatusTransitionResult,
  ): Promise<void> {
    await this.recordTransitionEffects({ ...input, ...result });
  }
}
