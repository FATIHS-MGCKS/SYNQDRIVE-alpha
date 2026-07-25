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
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { FleetMapCacheService } from '@modules/vehicles/fleet-map-cache.service';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import { WorkflowEventService } from '@modules/workflows/workflow-event.service';
import { sanitizeAutomationError } from '@modules/tasks/outbox/task-automation-outbox-error.util';
import { BookingPickupGateService } from '../booking-pickup-gate/booking-pickup-gate.service';
import { BookingPickupGateAuditService } from '../booking-pickup-gate/booking-pickup-gate-audit.service';
import { BookingEligibilityEnforcementService } from '../booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import { BookingEligibilityRecheckService } from '../booking-eligibility-recheck/booking-eligibility-recheck.service';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import type { CreateHandoverProtocolPayload, HandoverProtocolDto } from '../handover.types';
import { COMPLETE_PICKUP_HANDOVER_ERROR } from './complete-pickup-handover.errors';
import {
  executePickupHandoverCompletionInTransaction,
  mapHandoverProtocolRow,
  resolvePickupPerformedAt,
  validatePickupHandoverPayload,
} from './handover-pickup-completion.executor';
import { OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS } from './operator-handover-permission.constants';
import { resolveWritableStation } from './handover-session-context.util';
import { currentHandoverProtocolWhere } from './handover-protocol.query';
import { OperatorUploadService } from '@modules/operator-upload/operator-upload.service';
import {
  assertOperatorSessionSignatureBindings,
} from './handover-signature-binding.complete';
import type { HandoverSignatureBindingRecord } from './handover-signature-binding.types';

export interface CompletePickupHandoverCommandInput {
  organizationId: string;
  bookingId: string;
  idempotencyKey: string;
  payload: CreateHandoverProtocolPayload;
  actor: HandoverActorContext;
  sessionId?: string | null;
  expectedVersion?: number | null;
  scopeOverrideReason?: string | null;
}

export interface CompletePickupHandoverResult {
  idempotent: boolean;
  booking: { id: string; status: string };
  protocol: HandoverProtocolDto;
  sessionId: string | null;
}

@Injectable()
export class CompletePickupHandoverService {
  private readonly logger = new Logger(CompletePickupHandoverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
    private readonly pickupGate: BookingPickupGateService,
    private readonly pickupGateAudit: BookingPickupGateAuditService,
    private readonly bookingEligibilityRecheck: BookingEligibilityRecheckService,
    private readonly bookingEligibilityEnforcement: BookingEligibilityEnforcementService,
    private readonly rentalHealth: RentalHealthService,
    private readonly activityLog: ActivityLogService,
    @Inject(forwardRef(() => BookingDocumentGenerationDispatcherService))
    private readonly bookingDocumentGenerationDispatcher: BookingDocumentGenerationDispatcherService,
    private readonly taskAutomation: TaskAutomationService,
    private readonly workflowEvents: WorkflowEventService,
    private readonly fleetMapCache: FleetMapCacheService,
    private readonly rentalHealthSummaryCache: RentalHealthSummaryCacheService,
    private readonly operatorUploads: OperatorUploadService,
  ) {}

  async completePickupHandover(
    input: CompletePickupHandoverCommandInput,
  ): Promise<CompletePickupHandoverResult> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.IDEMPOTENCY_KEY_REQUIRED,
        message: 'idempotencyKey is required',
      });
    }

    await this.assertCompletePermission(input.actor, input.organizationId);
    validatePickupHandoverPayload(input.payload);
    this.assertSignaturesPresent(input.payload, Boolean(input.sessionId));
    this.assertDocumentsAcknowledged(input.payload);

    const cached = await this.prisma.bookingHandoverPickupCompletionIdempotency.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: input.organizationId,
          idempotencyKey,
        },
      },
    });
    if (cached) {
      const response = cached.responseJson as unknown as CompletePickupHandoverResult;
      return { ...response, idempotent: true };
    }

    const existingPickup = await this.prisma.bookingHandoverProtocol.findFirst({
      where: currentHandoverProtocolWhere(input.bookingId, 'PICKUP'),
    });
    if (existingPickup) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: input.bookingId, organizationId: input.organizationId },
        select: { id: true, status: true },
      });
      if (!booking) {
        throw new NotFoundException({
          code: COMPLETE_PICKUP_HANDOVER_ERROR.BOOKING_NOT_FOUND,
          message: 'Booking not found',
        });
      }
      if (booking.status === 'ACTIVE') {
        return {
          idempotent: true,
          booking: { id: booking.id, status: booking.status },
          protocol: mapHandoverProtocolRow({
            ...existingPickup,
            kind: 'PICKUP',
          }),
          sessionId: input.sessionId ?? null,
        };
      }
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.PROTOCOL_ALREADY_EXISTS,
        existingProtocolId: existingPickup.id,
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
        code: COMPLETE_PICKUP_HANDOVER_ERROR.BOOKING_NOT_FOUND,
        message: 'Booking not found',
      });
    }
    if (booking.status !== 'CONFIRMED') {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.BOOKING_WRONG_STATUS,
        message: `Pickup requires CONFIRMED booking, got ${booking.status}`,
        currentStatus: booking.status,
      });
    }

    const stationAccess = await this.stationAccess.resolve(
      input.actor.userId,
      input.organizationId,
    );
    const stationId =
      input.payload.actualStationId?.trim() || booking.pickupStationId;
    if (!resolveWritableStation(stationAccess, stationId)) {
      if (!input.scopeOverrideReason?.trim()) {
        throw new ForbiddenException({
          code: COMPLETE_PICKUP_HANDOVER_ERROR.SCOPE_DENIED,
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

    let validatedSignatureBindings: HandoverSignatureBindingRecord[] | undefined;
    let sessionDraftVersion: number | undefined;

    if (input.sessionId) {
      const sessionMeta = await this.assertSessionReadyForComplete(
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
      sessionDraftVersion = sessionMeta.version;
    }

    const rentalGate = await this.rentalHealth.isRentalBlocked(
      input.organizationId,
      booking.vehicleId,
    );
    if (rentalGate.blocked) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.VEHICLE_RENTAL_BLOCKED,
        message: rentalGate.reasons.join(' · ') || 'Vehicle rental_blocked',
        reasons: rentalGate.reasons,
      });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: booking.vehicleId, organizationId: input.organizationId },
      select: { id: true, status: true },
    });
    if (!vehicle || vehicle.id !== booking.vehicleId) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.VEHICLE_MISMATCH,
        message: 'Vehicle assignment mismatch',
      });
    }
    if (vehicle.status === 'IN_SERVICE' || vehicle.status === 'OUT_OF_SERVICE') {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.VEHICLE_BLOCKED,
        vehicleStatus: vehicle.status,
      });
    }

    await this.bookingEligibilityRecheck.processPickupPrecheck(
      input.organizationId,
      input.bookingId,
      input.actor.userId,
    );
    await this.bookingEligibilityEnforcement.assertAllowedForPickup(
      input.organizationId,
      input.bookingId,
      {
        userId: input.actor.userId,
        membershipRole: input.actor.membershipRole as never,
        eligibilityApprovalId: input.payload.eligibilityApprovalId,
      },
    );

    const gateEvaluation = await this.pickupGate.assertPickupAllowed({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      actor: input.actor,
      payload: {
        documentsAcknowledged: input.payload.documentsAcknowledged,
        customerSignatureName: input.payload.customerSignatureName,
        customerSignatureDataUrl: input.payload.customerSignatureDataUrl,
      },
      overrideReason: input.payload.pickupGateOverrideReason,
      correlationId: `pickup-complete:${input.bookingId}:${idempotencyKey}`,
    });

    const performedAt = resolvePickupPerformedAt(input.payload, booking.startDate);

    if (input.sessionId && sessionDraftVersion != null) {
      validatedSignatureBindings = await assertOperatorSessionSignatureBindings(this.prisma, {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        handoverSessionId: input.sessionId,
        draftVersion: sessionDraftVersion,
        stationId: stationId ?? null,
        payload: input.payload,
        actor: input.actor,
        canonicalContext: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          vehicleId: booking.vehicleId,
          customerId: booking.customerId,
          stationId: stationId ?? null,
          kind: 'PICKUP',
          documentVersion: 1,
          protocolVersion: 1,
          performedAt: (performedAt ?? new Date()).toISOString(),
        },
      });
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      const result = await executePickupHandoverCompletionInTransaction(tx, {
        orgId: input.organizationId,
        booking,
        payload: input.payload,
        actor: input.actor,
        performedAt,
        gateEvaluation,
        sessionId: input.sessionId,
        sessionVersion: input.expectedVersion ?? null,
        pickupGateAudit: this.pickupGateAudit,
        signatureBindings: validatedSignatureBindings,
      });

      const response: CompletePickupHandoverResult = {
        idempotent: false,
        booking: { id: result.booking.id, status: result.booking.status },
        protocol: mapHandoverProtocolRow(result.protocol),
        sessionId: input.sessionId ?? null,
      };

      await tx.bookingHandoverPickupCompletionIdempotency.create({
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
        code: COMPLETE_PICKUP_HANDOVER_ERROR.PERMISSION_DENIED,
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
  ): Promise<{ version: number }> {
    const session = await this.prisma.bookingHandoverSession.findFirst({
      where: { id: sessionId, organizationId: orgId, bookingId, kind: 'PICKUP' },
    });
    if (!session) {
      throw new NotFoundException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.SESSION_NOT_FOUND,
        message: 'Handover session not found',
      });
    }
    if (session.vehicleId !== vehicleId) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.VEHICLE_MISMATCH,
        message: 'Session vehicle does not match booking',
      });
    }
    if (expectedVersion != null && session.version !== expectedVersion) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.VERSION_CONFLICT,
        message: `Expected session version ${expectedVersion}, got ${session.version}`,
      });
    }
    const allowedStatuses = new Set(['SUBMITTED', 'IN_PROGRESS', 'AWAITING_SIGNATURE']);
    if (!allowedStatuses.has(session.status)) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.SESSION_WRONG_STATUS,
        message: `Session status ${session.status} cannot complete pickup`,
      });
    }
    return { version: session.version };
  }

  private assertSignaturesPresent(
    payload: CreateHandoverProtocolPayload,
    requireDrawn = false,
  ): void {
    const hasCustomer = requireDrawn
      ? Boolean(payload.customerSignatureDataUrl?.trim())
      : Boolean(
          payload.customerSignatureDataUrl?.trim() || payload.customerSignatureName?.trim(),
        );
    const hasStaff = requireDrawn
      ? Boolean(payload.staffSignatureDataUrl?.trim())
      : Boolean(
          payload.staffSignatureDataUrl?.trim() || payload.staffSignatureName?.trim(),
        );
    if (!hasCustomer || !hasStaff) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.SIGNATURE_REQUIRED,
        message: requireDrawn
          ? 'Customer and staff drawn signatures are required'
          : 'Customer and staff signatures are required',
      });
    }
  }

  private assertDocumentsAcknowledged(payload: CreateHandoverProtocolPayload): void {
    if (!payload.documentsAcknowledged) {
      throw new ConflictException({
        code: COMPLETE_PICKUP_HANDOVER_ERROR.DOCUMENTS_NOT_ACKNOWLEDGED,
        message: 'Documents must be acknowledged before pickup completion',
      });
    }
  }

  private async runPostCommitSideEffects(
    input: CompletePickupHandoverCommandInput,
    booking: {
      id: string;
      vehicleId: string;
      customerId: string;
      startDate: Date;
      endDate: Date;
      pickupStationId: string | null;
      returnStationId: string | null;
    },
    result: CompletePickupHandoverResult,
  ): Promise<void> {
    if (result.idempotent) return;

    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.actor.userId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.BOOKING,
      entityId: booking.id,
      description: `Pickup handover completed for booking ${booking.id}`,
      metaJson: {
        protocolId: result.protocol.id,
        idempotencyKey: input.idempotencyKey,
        sessionId: input.sessionId ?? null,
      },
    });

    void this.bookingDocumentGenerationDispatcher
      .enqueuePickupProtocol(
        input.organizationId,
        booking.id,
        result.protocol.id,
        input.actor.userId,
      )
      .catch((err) => {
        this.logger.error(
          `Failed to enqueue pickup protocol generation booking=${booking.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    void this.taskAutomation
      .onPickupHandoverCompleted({
        id: booking.id,
        organizationId: input.organizationId,
        vehicleId: booking.vehicleId,
        customerId: booking.customerId,
        status: 'ACTIVE',
        startDate: booking.startDate,
        endDate: booking.endDate,
        pickupStationId: booking.pickupStationId,
        returnStationId: booking.returnStationId,
      })
      .catch((err) => {
        this.logger.error(
          `taskAutomation.onPickupHandoverCompleted failed: ${sanitizeAutomationError(err)}`,
        );
      });

    this.workflowEvents.scheduleEmit({
      organizationId: input.organizationId,
      entityType: 'booking',
      entityId: booking.id,
      type: 'booking.activated',
      idempotencyKey: `booking.activated:${booking.id}`,
      payload: {
        bookingId: booking.id,
        vehicleId: booking.vehicleId,
        status: 'ACTIVE',
        protocolId: result.protocol.id,
      },
    });

    await this.fleetMapCache.invalidate(input.organizationId);
    await this.rentalHealthSummaryCache.invalidate(
      input.organizationId,
      booking.vehicleId,
    );
  }
}
