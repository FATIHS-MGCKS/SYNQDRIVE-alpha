import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HandoverKind,
  HandoverSessionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { BookingPickupGateService } from '../booking-pickup-gate/booking-pickup-gate.service';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import {
  HandoverSessionNotFoundException,
  HandoverSessionTransitionForbiddenException,
} from './handover-session.exceptions';
import { handoverStateMachine } from './handover-state-machine';
import {
  extractPayloadSnapshot,
  mapPickupGateToBlockers,
  mergePayloadJson,
  resolveWritableStation,
} from './handover-session-context.util';
import { mapHandoverSessionRow } from './handover-session.mapper';
import { resolveHandoverSessionPermissions } from './handover-session-permissions.util';
import {
  HANDOVER_SESSION_ACTIVE_STATUSES,
  HANDOVER_SESSION_NOT_STARTED,
  type HandoverSessionDto,
  type HandoverSessionLifecycleStatus,
  type HandoverSessionTransitionAction,
} from './handover-session.types';
import type { HandoverSessionTransitionBodyDto } from './dto/handover-session.dto';

export interface HandoverSessionView {
  lifecycleStatus: HandoverSessionLifecycleStatus;
  session: HandoverSessionDto | null;
}

@Injectable()
export class BookingsHandoverSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
    private readonly pickupGate: BookingPickupGateService,
    private readonly rentalHealth: RentalHealthService,
  ) {}

  async getSessionView(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    actor: HandoverActorContext,
  ): Promise<HandoverSessionView> {
    await this.assertBookingExists(orgId, bookingId);

    const session = await this.findActiveSession(orgId, bookingId, kind);
    return {
      lifecycleStatus: session?.status ?? HANDOVER_SESSION_NOT_STARTED,
      session: session ? mapHandoverSessionRow(session) : null,
    };
  }

  async transition(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    body: HandoverSessionTransitionBodyDto,
    actor: HandoverActorContext,
  ): Promise<HandoverSessionDto> {
    const context = await this.buildTransitionContext(orgId, bookingId, kind, body, actor);
    const decision = handoverStateMachine.evaluate(context.evaluateInput);

    if (!decision.allowed) {
      throw new HandoverSessionTransitionForbiddenException({
        code: decision.code ?? HANDOVER_SESSION_ERROR.TRANSITION_FORBIDDEN,
        message: decision.reason ?? 'Handover session transition forbidden',
        blockers: decision.blockers,
      });
    }

    if (context.fromStatus === HANDOVER_SESSION_NOT_STARTED) {
      return this.createSession(context);
    }

    return this.updateSession(context);
  }

  private async buildTransitionContext(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    body: HandoverSessionTransitionBodyDto,
    actor: HandoverActorContext,
  ) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: {
        id: true,
        status: true,
        vehicleId: true,
        pickupStationId: true,
        returnStationId: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const [vehicle, protocols, activeSession, membership, stationAccess] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: booking.vehicleId, organizationId: orgId },
        select: { id: true, status: true },
      }),
      this.prisma.bookingHandoverProtocol.findMany({
        where: { bookingId, organizationId: orgId },
        select: { id: true, kind: true },
      }),
      this.findActiveSession(orgId, bookingId, kind),
      this.prisma.organizationMembership.findFirst({
        where: { userId: actor.userId, organizationId: orgId, status: 'ACTIVE' },
        select: { role: true, status: true, permissions: true },
      }),
      this.stationAccess.resolve(actor.userId, orgId),
    ]);

    const permissions = resolveHandoverSessionPermissions(membership, actor);
    const stationId =
      body.actualStationId?.trim() ||
      (kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId);
    const stationWritable = resolveWritableStation(stationAccess, stationId);

    const existingPayload = activeSession?.payloadJson as Record<string, unknown> | null;
    const mergedPayload = mergePayloadJson(existingPayload, body.payload);
    const payloadSnapshot = extractPayloadSnapshot(mergedPayload);

    let pickupGateOverrideReason = body.pickupGateOverrideReason?.trim() || null;
    let blockers: ReturnType<typeof mapPickupGateToBlockers> = [];

    if (kind === 'PICKUP') {
      const gateEval = await this.pickupGate.evaluatePickupGate({
        organizationId: orgId,
        bookingId,
        actor,
        payload: mergedPayload,
        overrideReason: pickupGateOverrideReason,
      });
      blockers = mapPickupGateToBlockers(gateEval);
      if (gateEval.overrideUsed) {
        pickupGateOverrideReason = body.pickupGateOverrideReason?.trim() || pickupGateOverrideReason;
      }
    }

    let rentalBlocked = false;
    let blockingReasons: string[] = [];
    try {
      const gate = await this.rentalHealth.isRentalBlocked(orgId, booking.vehicleId);
      rentalBlocked = gate.blocked;
      blockingReasons = gate.reasons;
    } catch {
      rentalBlocked = false;
      blockingReasons = [];
    }

    const pickupProtocol = protocols.find((p) => p.kind === 'PICKUP');
    const returnProtocol = protocols.find((p) => p.kind === 'RETURN');
    const completedProtocol =
      kind === 'PICKUP' ? pickupProtocol : returnProtocol;

    const fromStatus: HandoverSessionLifecycleStatus =
      activeSession?.status ?? HANDOVER_SESSION_NOT_STARTED;

    const toStatus =
      body.toStatus ??
      handoverStateMachine.resolveTargetStatus(body.action, body.toStatus) ??
      null;

    if (!toStatus) {
      throw new HandoverSessionTransitionForbiddenException({
        code: HANDOVER_SESSION_ERROR.INVALID_STATUS,
        message: `Action ${body.action} requires explicit toStatus`,
      });
    }

    const evaluateInput = {
      organizationId: orgId,
      bookingId,
      kind,
      fromStatus,
      toStatus,
      action: body.action,
      expectedVersion: body.expectedVersion ?? null,
      currentVersion: activeSession?.version ?? null,
      lockedByUserId: activeSession?.lockedByUserId ?? null,
      actor: {
        userId: actor.userId,
        displayName: actor.displayName,
        platformRole: actor.platformRole,
        membershipRole: actor.membershipRole,
      },
      permissions,
      scope: {
        stationWritable,
        actualStationId: stationId,
      },
      scopeOverrideReason: body.scopeOverrideReason?.trim() || null,
      cancelReason: body.cancelReason?.trim() || null,
      supersedeReason: body.supersedeReason?.trim() || null,
      booking: {
        status: booking.status,
        vehicleId: booking.vehicleId,
        pickupStationId: booking.pickupStationId,
        returnStationId: booking.returnStationId,
        hasPickupProtocol: Boolean(pickupProtocol),
        hasReturnProtocol: Boolean(returnProtocol),
      },
      vehicle: vehicle
        ? {
            status: vehicle.status,
            rentalBlocked,
            blockingReasons,
          }
        : null,
      existingCompletedProtocolId: completedProtocol?.id ?? null,
      requirements: {
        blockers,
        pickupGateOverrideReason,
        eligibilityApprovalId: body.eligibilityApprovalId?.trim() || null,
      },
      payload: payloadSnapshot,
    };

    return {
      orgId,
      bookingId,
      kind,
      body,
      actor,
      fromStatus,
      toStatus,
      activeSession,
      mergedPayload,
      blockers,
      evaluateInput,
      booking,
      vehicle,
    };
  }

  private async createSession(
    context: Awaited<ReturnType<typeof this.buildTransitionContext>>,
  ): Promise<HandoverSessionDto> {
    const now = new Date();
    const isLock = context.body.action === 'ACQUIRE';
    const isCancel = context.body.action === 'CANCEL';
    const isSubmit = context.body.action === 'SUBMIT';

    try {
      const row = await this.prisma.bookingHandoverSession.create({
        data: {
          organizationId: context.orgId,
          bookingId: context.bookingId,
          vehicleId: context.booking.vehicleId,
          kind: context.kind,
          status: context.toStatus,
          version: 1,
          payloadJson: context.mergedPayload as Prisma.InputJsonValue,
          blockingRequirements: context.blockers as unknown as Prisma.InputJsonValue,
          lockedByUserId: isLock ? context.actor.userId : null,
          lockedAt: isLock ? now : null,
          scopeOverrideReason: context.body.scopeOverrideReason?.trim() || null,
          cancelReason: isCancel ? context.body.cancelReason?.trim() || null : null,
          cancelledAt: isCancel ? now : null,
          submittedAt: isSubmit ? now : null,
        },
      });
      return mapHandoverSessionRow(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          code: HANDOVER_SESSION_ERROR.ACTIVE_SESSION_EXISTS,
          message: 'An active handover session already exists for this booking side',
        });
      }
      throw err;
    }
  }

  private async updateSession(
    context: Awaited<ReturnType<typeof this.buildTransitionContext>>,
  ): Promise<HandoverSessionDto> {
    if (!context.activeSession) {
      throw new HandoverSessionNotFoundException();
    }

    const now = new Date();
    const isLock = context.body.action === 'ACQUIRE';
    const isRelease = context.body.action === 'RELEASE';
    const isCancel = context.body.action === 'CANCEL';
    const isSubmit = context.body.action === 'SUBMIT';

    const lockedByUserId = isLock
      ? context.actor.userId
      : isRelease
        ? null
        : context.activeSession.lockedByUserId;
    const lockedAt = isLock ? now : isRelease ? null : context.activeSession.lockedAt;

    try {
      const row = await this.prisma.bookingHandoverSession.update({
        where: {
          id: context.activeSession.id,
          version: context.activeSession.version,
        },
        data: {
          status: context.toStatus,
          version: { increment: 1 },
          payloadJson: context.mergedPayload as Prisma.InputJsonValue,
          blockingRequirements: context.blockers as unknown as Prisma.InputJsonValue,
          lockedByUserId,
          lockedAt,
          scopeOverrideReason:
            context.body.scopeOverrideReason?.trim() ||
            context.activeSession.scopeOverrideReason,
          cancelReason: isCancel
            ? context.body.cancelReason?.trim() || null
            : context.activeSession.cancelReason,
          cancelledAt: isCancel ? now : context.activeSession.cancelledAt,
          submittedAt: isSubmit ? now : context.activeSession.submittedAt,
        },
      });
      return mapHandoverSessionRow(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        throw new HandoverSessionTransitionForbiddenException({
          code: HANDOVER_SESSION_ERROR.VERSION_CONFLICT,
          message: 'Session version conflict — reload and retry',
        });
      }
      throw err;
    }
  }

  private async findActiveSession(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
  ) {
    return this.prisma.bookingHandoverSession.findFirst({
      where: {
        organizationId: orgId,
        bookingId,
        kind,
        status: { in: [...HANDOVER_SESSION_ACTIVE_STATUSES] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertBookingExists(orgId: string, bookingId: string): Promise<void> {
    const exists = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Booking not found');
    }
  }
}

export function isHandoverSessionAction(
  value: string,
): value is HandoverSessionTransitionAction {
  return [
    'START',
    'ACQUIRE',
    'RELEASE',
    'SYNC_REQUIREMENTS',
    'SYNC_SIGNATURES',
    'SUBMIT',
    'CANCEL',
    'SUPERSEDE',
    'COMPLETE',
  ].includes(value);
}

export function isHandoverSessionStatusValue(
  value: string,
): value is HandoverSessionStatus {
  return [
    'DRAFT',
    'IN_PROGRESS',
    'AWAITING_REQUIREMENTS',
    'AWAITING_SIGNATURE',
    'SUBMITTED',
    'COMPLETED',
    'CANCELLED',
    'SUPERSEDED',
  ].includes(value);
}
