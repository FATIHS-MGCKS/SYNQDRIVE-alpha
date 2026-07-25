import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { assertMembershipPermission } from '@shared/auth/permission.util';
import { StationAccessService } from '@shared/stations/station-access.service';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { BookingDocumentGenerationDispatcherService } from '@modules/documents/booking-document-generation/booking-document-generation.dispatcher.service';
import { FleetMapCacheService } from '@modules/vehicles/fleet-map-cache.service';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import type { CreateHandoverProtocolPayload, HandoverProtocolDto } from '../handover.types';
import { COMPLETE_RETURN_HANDOVER_ERROR } from './complete-return-handover.errors';
import {
  mapHandoverProtocolRow,
  validatePickupHandoverPayload,
} from './handover-pickup-completion.executor';
import { executeReturnHandoverCompletionInTransaction } from './handover-return-completion.executor';
import { OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS } from './operator-handover-permission.constants';
import { resolveWritableStation } from './handover-session-context.util';
import { currentHandoverProtocolWhere } from './handover-protocol.query';
import { OperatorUploadService } from '@modules/operator-upload/operator-upload.service';

export interface CompleteReturnHandoverCommandInput {
  organizationId: string;
  bookingId: string;
  idempotencyKey: string;
  payload: CreateHandoverProtocolPayload;
  actor: HandoverActorContext;
  sessionId?: string | null;
  expectedVersion?: number | null;
  scopeOverrideReason?: string | null;
}

export interface CompleteReturnHandoverResult {
  idempotent: boolean;
  booking: { id: string; status: string };
  protocol: HandoverProtocolDto;
  sessionId: string | null;
}

@Injectable()
export class CompleteReturnHandoverService {
  private readonly logger = new Logger(CompleteReturnHandoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
    private readonly activityLog: ActivityLogService,
    @Inject(forwardRef(() => BookingDocumentGenerationDispatcherService))
    private readonly bookingDocumentGenerationDispatcher: BookingDocumentGenerationDispatcherService,
    private readonly taskAutomation: TaskAutomationService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly fleetMapCache: FleetMapCacheService,
    private readonly rentalHealthSummaryCache: RentalHealthSummaryCacheService,
    private readonly operatorUploads: OperatorUploadService,
  ) {}

  async completeReturnHandover(
    input: CompleteReturnHandoverCommandInput,
  ): Promise<CompleteReturnHandoverResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.IDEMPOTENCY_KEY_REQUIRED,
        message: 'idempotencyKey is required',
      });
    }

    await this.assertCompletePermission(input.actor, input.organizationId);
    validatePickupHandoverPayload(input.payload);
    this.assertSignaturesPresent(input.payload);
    this.assertDocumentsAcknowledged(input.payload);

    const cached = await this.prisma.bookingHandoverReturnCompletionIdempotency.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey,
        },
      },
    });
    if (cached) {
      const response = cached.responseJson as unknown as CompleteReturnHandoverResult;
      return { ...response, idempotent: true };
    }

    const existingReturn = await this.prisma.bookingHandoverProtocol.findFirst({
      where: currentHandoverProtocolWhere(input.bookingId, 'RETURN'),
    });
    if (existingReturn) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: input.bookingId, organizationId: input.organizationId },
        select: { id: true, status: true },
      });
      if (!booking) {
        throw new NotFoundException({
          code: COMPLETE_RETURN_HANDOVER_ERROR.BOOKING_NOT_FOUND,
          message: 'Booking not found',
        });
      }
      if (booking.status === 'COMPLETED') {
        return {
          idempotent: true,
          booking: { id: booking.id, status: booking.status },
          protocol: mapHandoverProtocolRow({
            ...existingReturn,
            kind: 'RETURN',
          }),
          sessionId: input.sessionId ?? null,
        };
      }
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.PROTOCOL_ALREADY_EXISTS,
        existingProtocolId: existingReturn.id,
      });
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        customerId: true,
        status: true,
        startDate: true,
        endDate: true,
        pickupStationId: true,
        returnStationId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.BOOKING_NOT_FOUND,
        message: 'Booking not found',
      });
    }
    if (booking.status !== 'ACTIVE') {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.BOOKING_WRONG_STATUS,
        message: `Return requires ACTIVE booking, got ${booking.status}`,
        currentStatus: booking.status,
      });
    }

    const pickupProtocol = await this.prisma.bookingHandoverProtocol.findFirst({
      where: currentHandoverProtocolWhere(input.bookingId, 'PICKUP'),
      select: { id: true, odometerKm: true },
    });
    if (!pickupProtocol) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.PICKUP_PROTOCOL_REQUIRED,
        message: 'Pickup protocol required before return',
      });
    }

    if (Math.round(input.payload.odometerKm) < pickupProtocol.odometerKm) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.ODOMETER_IMPLAUSIBLE,
        message: `Return odometer must be >= pickup odometer (${pickupProtocol.odometerKm})`,
        pickupOdometerKm: pickupProtocol.odometerKm,
        returnOdometerKm: input.payload.odometerKm,
      });
    }

    const stationAccess = await this.stationAccess.resolve(
      input.actor.userId,
      input.organizationId,
    );
    const stationId =
      input.payload.actualStationId?.trim() || booking.returnStationId;
    if (!resolveWritableStation(stationAccess, stationId)) {
      if (!input.scopeOverrideReason?.trim()) {
        throw new ForbiddenException({
          code: COMPLETE_RETURN_HANDOVER_ERROR.SCOPE_DENIED,
          message: 'Station scope denied — override reason required',
        });
      }
      await assertMembershipPermission(
        this.prisma,
        {
          id: input.actor.userId,
          platformRole: input.actor.platformRole ?? undefined,
          membershipRole: input.actor.membershipRole ?? undefined,
          organizationId: input.organizationId,
        },
        input.organizationId,
        OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS['operator.handover.override'].module,
        OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS['operator.handover.override'].level,
      );
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: booking.vehicleId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
    if (!vehicle || vehicle.id !== booking.vehicleId) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.VEHICLE_MISMATCH,
        message: 'Vehicle assignment mismatch',
      });
    }

    if (input.sessionId) {
      await this.assertSessionReadyForComplete(
        input.organizationId,
        input.bookingId,
        input.sessionId,
        input.expectedVersion ?? null,
        booking.vehicleId,
      );
      await this.operatorUploads.assertRequiredUploadsComplete(
        input.organizationId,
        input.sessionId,
      );
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      const result = await executeReturnHandoverCompletionInTransaction(tx, {
        orgId: input.organizationId,
        booking,
        payload: input.payload,
        actor: input.actor,
        pickupOdometerKm: pickupProtocol.odometerKm,
        sessionId: input.sessionId,
        sessionVersion: input.expectedVersion ?? null,
      });

      const response: CompleteReturnHandoverResult = {
        idempotent: false,
        booking: { id: result.booking.id, status: result.booking.status },
        protocol: mapHandoverProtocolRow(result.protocol),
        sessionId: input.sessionId ?? null,
      };

      await tx.bookingHandoverReturnCompletionIdempotency.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          idempotencyKey,
          sessionId: input.sessionId ?? null,
          protocolId: result.protocol.id,
          responseJson: response as object,
        },
      });

      return response;
    });

    await this.runPostCommitSideEffects(input, booking, txResult);

    return txResult;
  }

  private async assertCompletePermission(
    actor: HandoverActorContext,
    organizationId: string,
  ): Promise<void> {
    const requirement =
      OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS['operator.handover.complete'];
    try {
      await assertMembershipPermission(
        this.prisma,
        {
          id: actor.userId,
          platformRole: actor.platformRole ?? undefined,
          membershipRole: actor.membershipRole ?? undefined,
          organizationId,
        },
        organizationId,
        requirement.module,
        requirement.level,
      );
    } catch {
      throw new ForbiddenException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.PERMISSION_DENIED,
        message: 'Missing operator.handover.complete permission',
      });
    }
  }

  private async assertSessionReadyForComplete(
    orgId: string,
    bookingId: string,
    sessionId: string,
    expectedVersion: number | null,
    vehicleId: string,
  ): Promise<void> {
    const session = await this.prisma.bookingHandoverSession.findFirst({
      where: { id: sessionId, organizationId: orgId, bookingId, kind: 'RETURN' },
    });
    if (!session) {
      throw new NotFoundException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.SESSION_NOT_FOUND,
        message: 'Return handover session not found',
      });
    }
    if (session.vehicleId !== vehicleId) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.VEHICLE_MISMATCH,
        message: 'Session vehicle does not match booking',
      });
    }
    if (expectedVersion != null && session.version !== expectedVersion) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.VERSION_CONFLICT,
        message: `Expected session version ${expectedVersion}, got ${session.version}`,
      });
    }
    const allowedStatuses = new Set(['SUBMITTED', 'IN_PROGRESS', 'AWAITING_SIGNATURE']);
    if (!allowedStatuses.has(session.status)) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.SESSION_WRONG_STATUS,
        message: `Session status ${session.status} cannot complete return`,
      });
    }
  }

  private assertSignaturesPresent(payload: CreateHandoverProtocolPayload): void {
    const hasCustomer = Boolean(
      payload.customerSignatureDataUrl?.trim() || payload.customerSignatureName?.trim(),
    );
    const hasStaff = Boolean(
      payload.staffSignatureDataUrl?.trim() || payload.staffSignatureName?.trim(),
    );
    if (!hasCustomer || !hasStaff) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.SIGNATURE_REQUIRED,
        message: 'Customer and staff signatures are required',
      });
    }
  }

  private assertDocumentsAcknowledged(payload: CreateHandoverProtocolPayload): void {
    if (!payload.documentsAcknowledged) {
      throw new ConflictException({
        code: COMPLETE_RETURN_HANDOVER_ERROR.DOCUMENTS_NOT_ACKNOWLEDGED,
        message: 'Documents must be acknowledged before return completion',
      });
    }
  }

  private async runPostCommitSideEffects(
    input: CompleteReturnHandoverCommandInput,
    booking: {
      id: string;
      vehicleId: string;
      customerId: string;
      startDate: Date;
      endDate: Date;
      pickupStationId: string | null;
      returnStationId: string | null;
    },
    result: CompleteReturnHandoverResult,
  ): Promise<void> {
    if (result.idempotent) return;

    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.actor.userId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.BOOKING,
      entityId: booking.id,
      description: `Return handover completed for booking ${booking.id}`,
      metaJson: {
        protocolId: result.protocol.id,
        idempotencyKey: input.idempotencyKey,
        sessionId: input.sessionId ?? null,
      },
    });

    void this.bookingDocumentGenerationDispatcher
      .enqueueReturnDocuments(
        input.organizationId,
        booking.id,
        result.protocol.id,
        input.actor.userId,
      )
      .catch((err) => {
        this.logger.error(
          `Failed to enqueue return document generation booking=${booking.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    void this.taskAutomation
      .onReturnHandoverCompleted({
        id: booking.id,
        organizationId: input.organizationId,
        vehicleId: booking.vehicleId,
        customerId: booking.customerId,
        status: 'COMPLETED',
        startDate: booking.startDate,
        endDate: booking.endDate,
        pickupStationId: booking.pickupStationId,
        returnStationId: booking.returnStationId,
      })
      .catch((err) => {
        this.logger.error(
          `taskAutomation.onReturnHandoverCompleted failed: ${sanitizeAutomationError(err)}`,
        );
      });

    const eventBase = {
      organizationId: input.organizationId,
      entityType: 'booking' as const,
      entityId: booking.id,
      payload: {
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        status: result.booking.status,
        protocolId: result.protocol.id,
      },
    };
    this.workflowEvents.scheduleEmit({
      ...eventBase,
      type: 'booking.returned',
      idempotencyKey: `booking.returned:${booking.id}`,
    });
    this.workflowEvents.scheduleEmit({
      ...eventBase,
      type: 'booking.completed',
      idempotencyKey: `booking.completed:${booking.id}`,
    });

    await this.fleetMapCache.invalidate(input.organizationId);
    await this.rentalHealthSummaryCache.invalidate(
      input.organizationId,
      booking.vehicleId,
    );
  }
}
