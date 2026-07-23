import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  Booking,
  BookingStatus,
  BookingStatusCommandType,
  HandoverKind,
  Prisma,
  VehicleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { BookingDocumentGenerationDispatcherService } from '@modules/documents/booking-document-generation/booking-document-generation.dispatcher.service';
import { BookingLegalDocumentEmailService } from '@modules/outbound-email/booking-legal-document-email.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import { VehicleCleaningTaskService } from '@modules/tasks/vehicle-cleaning-task.service';
import { FleetMapCacheService } from '@modules/vehicles/fleet-map-cache.service';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { BookingStatusTransitionService } from '../state-machine/booking-status-transition.service';
import type { BookingStatusTransitionResult } from '../state-machine/booking-status-transition.service';
import {
  BookingStatusHandoverProtocolRequiredError,
  BookingStatusIdempotencyKeyConflictError,
  BookingStatusIdempotencyKeyRequiredError,
} from './booking-status-command.errors';
import {
  deserializeBookingStatusCommandResult,
  serializeBooking,
} from './booking-status-command.response';
import type {
  BookingStatusCommandActor,
  BookingStatusCommandKind,
  BookingStatusCommandResult,
  ExecuteBookingStatusCommandInput,
} from './booking-status-command.types';
import {
  COMMAND_TO_TARGET_STATUS,
  COMMAND_TO_TRIGGER,
} from './booking-status-command.types';

@Injectable()
export class BookingStatusCommandService {
  private readonly logger = new Logger(BookingStatusCommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statusTransition: BookingStatusTransitionService,
    @Inject(forwardRef(() => GeneratedDocumentsService))
    private readonly generatedDocumentsService: GeneratedDocumentsService,
    @Inject(forwardRef(() => BookingDocumentGenerationDispatcherService))
    private readonly bookingDocumentGenerationDispatcher: BookingDocumentGenerationDispatcherService,
    @Inject(forwardRef(() => BookingLegalDocumentEmailService))
    private readonly bookingLegalDocumentEmailService: BookingLegalDocumentEmailService,
    private readonly taskAutomationService: TaskAutomationService,
    private readonly vehicleCleaningTasks: VehicleCleaningTaskService,
    private readonly fleetMapCache: FleetMapCacheService,
    private readonly rentalHealthSummaryCache: RentalHealthSummaryCacheService,
  ) {}

  async execute(input: ExecuteBookingStatusCommandInput): Promise<BookingStatusCommandResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BookingStatusIdempotencyKeyRequiredError();
    }

    const replay = await this.findReplay(input.organizationId, idempotencyKey);
    if (replay) {
      this.assertReplayMatches(input, replay);
      return this.withReplayMeta(replay);
    }

    const { commandResult: result, plannedForEffects } = await this.prisma.$transaction(async (tx) => {
      let planned: BookingStatusTransitionResult | null = null;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking-status:${input.bookingId}`}))`;

      const raced = await tx.bookingStatusCommand.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: input.organizationId,
            idempotencyKey,
          },
        },
      });
      if (raced) {
        this.assertStoredMatches(input, raced);
        const stored = deserializeBookingStatusCommandResult(raced.resultPayload);
        if (stored) {
          return { commandResult: this.withReplayMeta(stored), plannedForEffects: null };
        }
      }

      const booking = await tx.booking.findFirst({
        where: { id: input.bookingId, organizationId: input.organizationId },
      });
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      const targetStatus = this.resolveTargetStatus(input);
      if (booking.status === targetStatus) {
        const idempotentResult = this.buildResult(booking, input, {
          from: booking.status,
          planned: null,
          idempotent: true,
          replayed: false,
        });
        await this.persistCommand(tx, input, idempotentResult);
        return { commandResult: idempotentResult, plannedForEffects: null };
      }

      await this.assertHandoverProtocolIfNeeded(tx, input, booking);

      planned = this.planTransition(input, booking);
      const updated = await this.applyStatusWrite(tx, input, booking, planned, targetStatus);
      const commandResult = this.buildResult(updated, input, {
        from: booking.status,
        planned,
        idempotent: false,
        replayed: false,
      });
      await this.persistCommand(tx, input, commandResult);
      return { commandResult, plannedForEffects: planned };
    });

    if (
      !result.transition.idempotent &&
      !result.transition.replayed &&
      !input.skipSideEffects &&
      plannedForEffects
    ) {
      await this.statusTransition.commitTransitionEffects(
        {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          vehicleId: result.booking.vehicleId,
          from: plannedForEffects.from,
          to: plannedForEffects.to,
          trigger:
            input.command === 'ADMIN_OVERRIDE'
              ? 'admin_override'
              : COMMAND_TO_TRIGGER[input.command as Exclude<BookingStatusCommandKind, 'ADMIN_OVERRIDE'>],
          actor: input.actor,
          reason: input.reason ?? null,
          override: input.override
            ? {
                hasPermission: input.override.hasPermission,
                reason: input.override.reason,
              }
            : undefined,
          correlationId: `${input.command.toLowerCase()}:${input.bookingId}:${idempotencyKey}`,
        },
        plannedForEffects,
      );
      await this.runPostTransitionSideEffects(input, result);
    }

    await this.invalidateCaches(input.organizationId, result.booking.vehicleId);
    return result;
  }

  async recordCommandResult(
    input: ExecuteBookingStatusCommandInput,
    result: BookingStatusCommandResult,
  ): Promise<void> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) return;

    const existing = await this.prisma.bookingStatusCommand.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey,
        },
      },
    });
    if (existing) return;

    await this.prisma.bookingStatusCommand.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        commandType: input.command as BookingStatusCommandType,
        idempotencyKey,
        fromStatus: result.transition.from,
        toStatus: result.transition.to,
        trigger: result.transition.trigger,
        reasonCode: result.transition.reasonCode,
        requestPayload: {
          reason: input.reason ?? null,
          override: input.override ?? null,
        } as Prisma.InputJsonValue,
        resultPayload: {
          booking: serializeBooking(result.booking),
          transition: result.transition,
        } as unknown as Prisma.InputJsonValue,
        createdByUserId: input.actor.userId ?? null,
      },
    });
  }

  async findReplay(
    organizationId: string,
    idempotencyKey: string,
  ): Promise<BookingStatusCommandResult | null> {
    const row = await this.prisma.bookingStatusCommand.findUnique({
      where: {
        organizationId_idempotencyKey: { organizationId, idempotencyKey },
      },
    });
    if (!row) return null;
    return deserializeBookingStatusCommandResult(row.resultPayload);
  }

  private assertReplayMatches(
    input: ExecuteBookingStatusCommandInput,
    replay: BookingStatusCommandResult,
  ): void {
    if (replay.booking.id !== input.bookingId) {
      throw new BookingStatusIdempotencyKeyConflictError();
    }
    if (replay.transition.command !== input.command) {
      throw new BookingStatusIdempotencyKeyConflictError();
    }
  }

  private assertStoredMatches(
    input: ExecuteBookingStatusCommandInput,
    row: { bookingId: string; commandType: BookingStatusCommandType },
  ): void {
    if (row.bookingId !== input.bookingId || row.commandType !== input.command) {
      throw new BookingStatusIdempotencyKeyConflictError();
    }
  }

  private withReplayMeta(result: BookingStatusCommandResult): BookingStatusCommandResult {
    return {
      ...result,
      transition: { ...result.transition, idempotent: true, replayed: true },
    };
  }

  private resolveTargetStatus(input: ExecuteBookingStatusCommandInput): BookingStatus {
    if (input.command === 'ADMIN_OVERRIDE') {
      if (!input.override?.toStatus) {
        throw new ConflictException('Admin override requires target status');
      }
      return input.override.toStatus;
    }
    return COMMAND_TO_TARGET_STATUS[input.command];
  }

  private planTransition(
    input: ExecuteBookingStatusCommandInput,
    booking: Booking,
  ): BookingStatusTransitionResult {
    const to = this.resolveTargetStatus(input);
    if (input.command === 'ADMIN_OVERRIDE') {
      return this.statusTransition.planTransition({
        from: booking.status,
        to,
        trigger: 'admin_override',
        override: {
          hasPermission: input.override?.hasPermission ?? false,
          reason: input.override?.reason ?? '',
        },
      });
    }

    const trigger = COMMAND_TO_TRIGGER[input.command];
    return this.statusTransition.planTransition({
      from: booking.status,
      to,
      trigger,
      preconditions:
        input.command === 'MARK_NO_SHOW'
          ? { scheduledStartDate: booking.startDate }
          : undefined,
    });
  }

  private async assertHandoverProtocolIfNeeded(
    tx: Prisma.TransactionClient,
    input: ExecuteBookingStatusCommandInput,
    booking: Booking,
  ): Promise<void> {
    if (input.command === 'ACTIVATE' && booking.status !== 'ACTIVE') {
      const pickup = await tx.bookingHandoverProtocol.findUnique({
        where: { bookingId_kind: { bookingId: booking.id, kind: 'PICKUP' } },
      });
      if (!pickup) throw new BookingStatusHandoverProtocolRequiredError('PICKUP');
    }
    if (input.command === 'COMPLETE' && booking.status !== 'COMPLETED') {
      const ret = await tx.bookingHandoverProtocol.findUnique({
        where: { bookingId_kind: { bookingId: booking.id, kind: 'RETURN' } },
      });
      if (!ret) throw new BookingStatusHandoverProtocolRequiredError('RETURN');
    }
  }

  private async applyStatusWrite(
    tx: Prisma.TransactionClient,
    input: ExecuteBookingStatusCommandInput,
    booking: Booking,
    planned: BookingStatusTransitionResult,
    targetStatus: BookingStatus,
  ): Promise<Booking> {
    const patch: {
      cancelledAt?: Date;
      completedAt?: Date;
      notes?: string | null;
    } = {};

    if (input.command === 'MARK_NO_SHOW' && input.reason?.trim()) {
      const notesAddendum = `[No-Show ${new Date().toISOString()}] ${input.reason.trim()}`;
      patch.notes = booking.notes
        ? `${booking.notes}\n${notesAddendum}`
        : notesAddendum;
    }

    const updateData = this.statusTransition.buildUpdateData(targetStatus, patch);

    const [updated] = await Promise.all([
      tx.booking.update({
        where: { id: booking.id },
        data: updateData,
      }),
      this.applyVehicleSideEffects(tx, input, booking, targetStatus),
    ]);

    return updated;
  }

  private async applyVehicleSideEffects(
    tx: Prisma.TransactionClient,
    input: ExecuteBookingStatusCommandInput,
    booking: Booking,
    targetStatus: BookingStatus,
  ): Promise<void> {
    if (
      targetStatus === 'CANCELLED' ||
      targetStatus === 'NO_SHOW'
    ) {
      await tx.vehicle.updateMany({
        where: {
          id: booking.vehicleId,
          status: { notIn: [VehicleStatus.IN_SERVICE, VehicleStatus.OUT_OF_SERVICE] },
        },
        data: { status: VehicleStatus.AVAILABLE },
      });
      return;
    }

    if (input.command === 'ACTIVATE' && targetStatus === 'ACTIVE') {
      const vehicleRow = await tx.vehicle.findFirst({
        where: { id: booking.vehicleId, organizationId: input.organizationId },
        select: { status: true },
      });
      if (
        vehicleRow?.status === VehicleStatus.IN_SERVICE ||
        vehicleRow?.status === VehicleStatus.OUT_OF_SERVICE
      ) {
        throw new ConflictException({
          message: 'Vehicle is blocked for handover activation',
          code: 'HANDOVER_PICKUP_VEHICLE_BLOCKED',
        });
      }
      await tx.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: VehicleStatus.RENTED },
      });
    }
  }

  private buildResult(
    booking: Booking,
    input: ExecuteBookingStatusCommandInput,
    meta: {
      from: BookingStatus | null;
      planned: BookingStatusTransitionResult | null;
      idempotent: boolean;
      replayed: boolean;
    },
  ): BookingStatusCommandResult {
    const to = booking.status;
    const trigger =
      input.command === 'ADMIN_OVERRIDE'
        ? ('admin_override' as const)
        : COMMAND_TO_TRIGGER[input.command as Exclude<BookingStatusCommandKind, 'ADMIN_OVERRIDE'>];

    return {
      booking,
      transition: {
        command: input.command as BookingStatusCommandType,
        from: meta.from,
        to,
        trigger,
        reasonCode: meta.planned?.definition.reasonCode ?? `BOOKING_${input.command}_IDEMPOTENT`,
        idempotent: meta.idempotent,
        replayed: meta.replayed,
      },
    };
  }

  private async persistCommand(
    tx: Prisma.TransactionClient,
    input: ExecuteBookingStatusCommandInput,
    result: BookingStatusCommandResult,
  ): Promise<void> {
    const payload = {
      booking: serializeBooking(result.booking),
      transition: result.transition,
    };

    try {
      await tx.bookingStatusCommand.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          commandType: input.command as BookingStatusCommandType,
          idempotencyKey: input.idempotencyKey.trim(),
          fromStatus: result.transition.from,
          toStatus: result.transition.to,
          trigger: result.transition.trigger,
          reasonCode: result.transition.reasonCode,
          requestPayload: {
            reason: input.reason ?? null,
            override: input.override ?? null,
          } as Prisma.InputJsonValue,
          resultPayload: payload as unknown as Prisma.InputJsonValue,
          createdByUserId: input.actor.userId ?? null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const dup = await tx.bookingStatusCommand.findUnique({
          where: {
            organizationId_idempotencyKey: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey.trim(),
            },
          },
        });
        if (dup) {
          this.assertStoredMatches(input, dup);
          const stored = deserializeBookingStatusCommandResult(dup.resultPayload);
          if (stored) return;
        }
      }
      throw error;
    }
  }

  private async runPostTransitionSideEffects(
    input: ExecuteBookingStatusCommandInput,
    result: BookingStatusCommandResult,
  ): Promise<void> {
    const { organizationId, bookingId } = input;
    const booking = result.booking;

    switch (input.command) {
      case 'CANCEL':
        await this.generatedDocumentsService.voidAllForBooking(organizationId, bookingId).catch(() => {});
        void this.taskAutomationService
          .supersedeBookingLifecycleOnCancellation(organizationId, bookingId)
          .catch(() => {});
        void this.vehicleCleaningTasks
          .onBookingCancelled(organizationId, bookingId, booking.vehicleId)
          .catch(() => {});
        break;
      case 'MARK_NO_SHOW':
        void this.taskAutomationService.handleBookingNoShow(organizationId, bookingId).catch(() => {});
        break;
      case 'CONFIRM':
        void this.bookingDocumentGenerationDispatcher
          .enqueueInitialBundle(organizationId, bookingId, input.actor.userId ?? null)
          .then(() =>
            this.bookingLegalDocumentEmailService.maybeAutoSendFrozenBookingDocuments(
              organizationId,
              bookingId,
              input.actor.userId ?? null,
            ),
          )
          .catch((err) => {
            this.logger.error(
              `Failed document bundle on confirm booking=${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        void this.taskAutomationService
          .ensureBookingLifecycleTasks({
            id: booking.id,
            organizationId,
            vehicleId: booking.vehicleId,
            customerId: booking.customerId,
            status: booking.status,
            startDate: booking.startDate,
            endDate: booking.endDate,
            pickupStationId: booking.pickupStationId,
            returnStationId: booking.returnStationId,
          })
          .catch(() => {});
        break;
      default:
        break;
    }
  }

  private async invalidateCaches(orgId: string, vehicleId: string): Promise<void> {
    await this.fleetMapCache.invalidate(orgId);
    await this.rentalHealthSummaryCache.invalidate(orgId, vehicleId).catch(() => {});
  }
}

export function handoverKindToStatusCommand(kind: HandoverKind): 'ACTIVATE' | 'COMPLETE' {
  return kind === 'PICKUP' ? 'ACTIVATE' : 'COMPLETE';
}
