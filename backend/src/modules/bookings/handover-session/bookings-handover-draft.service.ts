import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HandoverKind,
  HandoverSessionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { assertMembershipPermission } from '@shared/auth/permission.util';
import { StationAccessService } from '@shared/stations/station-access.service';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import { currentHandoverProtocolWhere } from './handover-protocol.query';
import {
  createEmptyHandoverDraftPayload,
  mergeHandoverDraftPayload,
  parseHandoverSessionDraftPayload,
} from './handover-session-draft.payload';
import {
  assertHandoverDraftStepValid,
  deriveDraftSessionStatus,
  validateHandoverDraftStep,
} from './handover-session-draft-step.validation';
import { HANDOVER_DRAFT_ERROR } from './handover-session-draft.errors';
import {
  HANDOVER_DRAFT_RETENTION_MS,
  type HandoverDraftDto,
  type HandoverDraftStepId,
  type HandoverDraftView,
  type HandoverSessionDraftPayload,
} from './handover-session-draft.types';
import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import {
  HANDOVER_SESSION_ACTIVE_STATUSES,
  isHandoverSessionTerminal,
} from './handover-session.types';
import { resolveWritableStation } from './handover-session-context.util';
import { resolveHandoverSessionPermissions } from './handover-session-permissions.util';

export interface CreateHandoverDraftInput {
  organizationId: string;
  bookingId: string;
  kind: HandoverKind;
  actor: HandoverActorContext;
  currentStep?: HandoverDraftStepId;
  draft?: Partial<HandoverSessionDraftPayload>;
  actualStationId?: string | null;
}

export interface UpdateHandoverDraftInput {
  organizationId: string;
  bookingId: string;
  kind: HandoverKind;
  actor: HandoverActorContext;
  expectedVersion: number;
  currentStep?: HandoverDraftStepId;
  draft?: Partial<HandoverSessionDraftPayload>;
  validateStep?: HandoverDraftStepId;
  actualStationId?: string | null;
  acquireLock?: boolean;
}

export interface CancelHandoverDraftInput {
  organizationId: string;
  bookingId: string;
  kind: HandoverKind;
  actor: HandoverActorContext;
  expectedVersion?: number | null;
  cancelReason?: string | null;
}

@Injectable()
export class BookingsHandoverDraftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationAccess: StationAccessService,
  ) {}

  async getDraft(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    actor: HandoverActorContext,
  ): Promise<HandoverDraftView> {
    await this.assertReadPermission(actor, orgId);
    const booking = await this.loadBooking(orgId, bookingId);
    const session = await this.findActiveSession(orgId, bookingId, kind);
    if (!session) {
      return { lifecycleStatus: 'NOT_STARTED', draft: null };
    }
    const expired = await this.expireIfNeeded(session);
    if (expired) {
      return { lifecycleStatus: 'CANCELLED', draft: null };
    }
    return {
      lifecycleStatus: session.status,
      draft: this.mapDraftRow(session, booking, actor),
    };
  }

  async createDraft(input: CreateHandoverDraftInput): Promise<HandoverDraftDto> {
    await this.assertWritePermission(input.actor, input.organizationId);
    const booking = await this.loadBooking(input.organizationId, input.bookingId);
    this.assertBookingAllowsDraft(booking.status, input.kind);

    const existing = await this.findActiveSession(
      input.organizationId,
      input.bookingId,
      input.kind,
    );
    if (existing) {
      const expired = await this.expireIfNeeded(existing);
      if (!expired) {
        throw new ConflictException({
          code: HANDOVER_DRAFT_ERROR.ACTIVE_EXISTS,
          message: 'Active handover draft already exists',
          draftId: existing.id,
          version: existing.version,
        });
      }
    }

    const stationId = this.resolveStationId(booking, input.kind, input.actualStationId);
    await this.assertStationWritable(input.actor, input.organizationId, stationId);

    const empty = createEmptyHandoverDraftPayload(input.currentStep ?? 'vehicle', stationId);
    const draftPayload = input.draft
      ? mergeHandoverDraftPayload(empty, input.draft, stationId)
      : empty;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + HANDOVER_DRAFT_RETENTION_MS);

    try {
      const row = await this.prisma.bookingHandoverSession.create({
        data: {
          organizationId: input.organizationId,
          stationId,
          bookingId: input.bookingId,
          vehicleId: booking.vehicleId,
          kind: input.kind,
          status: 'DRAFT',
          currentStep: draftPayload.currentStep,
          version: 1,
          payloadJson: draftPayload as unknown as Prisma.InputJsonValue,
          startedByUserId: input.actor.userId,
          assignedToUserId: input.actor.userId,
          updatedByUserId: input.actor.userId,
          lockedByUserId: input.actor.userId,
          lockedAt: now,
          expiresAt,
        },
      });
      return this.mapDraftRow(row, booking, input.actor);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: HANDOVER_DRAFT_ERROR.ACTIVE_EXISTS,
          message: 'Active handover draft already exists',
        });
      }
      throw err;
    }
  }

  async updateDraft(input: UpdateHandoverDraftInput): Promise<HandoverDraftDto> {
    await this.assertWritePermission(input.actor, input.organizationId);
    const booking = await this.loadBooking(input.organizationId, input.bookingId);

    const session = await this.findActiveSession(
      input.organizationId,
      input.bookingId,
      input.kind,
    );
    if (!session) {
      throw new NotFoundException({
        code: HANDOVER_DRAFT_ERROR.NOT_FOUND,
        message: 'Handover draft not found',
      });
    }

    if (await this.expireIfNeeded(session)) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.EXPIRED,
        message: 'Handover draft has expired',
      });
    }

    this.assertDraftEditable(session);

    if (session.lockedByUserId && session.lockedByUserId !== input.actor.userId && !input.acquireLock) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.LOCK_CONFLICT,
        message: 'Draft is locked by another operator',
        lockedByUserId: session.lockedByUserId,
      });
    }

    if (session.version !== input.expectedVersion) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.VERSION_CONFLICT,
        message: `Expected version ${input.expectedVersion}, got ${session.version}`,
        currentVersion: session.version,
      });
    }

    const stationId = this.resolveStationId(
      booking,
      input.kind,
      input.actualStationId ?? session.stationId,
    );
    await this.assertStationWritable(input.actor, input.organizationId, stationId);

    const existingDraft = parseHandoverSessionDraftPayload(session.payloadJson, stationId);
    const merged = input.draft
      ? mergeHandoverDraftPayload(existingDraft, input.draft, stationId)
      : existingDraft;
    if (input.currentStep) {
      merged.currentStep = input.currentStep;
    }

    if (input.validateStep) {
      const pickupOdometer =
        input.kind === 'RETURN'
          ? await this.loadPickupOdometer(input.organizationId, input.bookingId)
          : null;
      assertHandoverDraftStepValid(input.validateStep, input.kind, merged, {
        pickupOdometerKm: pickupOdometer,
      });
    }

    const nextStatus = deriveDraftSessionStatus(merged);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HANDOVER_DRAFT_RETENTION_MS);

    try {
      const row = await this.prisma.bookingHandoverSession.update({
        where: { id: session.id, version: session.version },
        data: {
          status: nextStatus,
          currentStep: merged.currentStep,
          stationId,
          payloadJson: merged as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
          updatedByUserId: input.actor.userId,
          assignedToUserId: input.actor.userId,
          lockedByUserId: input.acquireLock ? input.actor.userId : session.lockedByUserId,
          lockedAt: input.acquireLock ? now : session.lockedAt,
          expiresAt,
        },
      });
      return this.mapDraftRow(row, booking, input.actor);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ConflictException({
          code: HANDOVER_DRAFT_ERROR.VERSION_CONFLICT,
          message: 'Draft version conflict — reload and retry',
        });
      }
      throw err;
    }
  }

  async cancelDraft(input: CancelHandoverDraftInput): Promise<HandoverDraftDto | null> {
    await this.assertWritePermission(input.actor, input.organizationId);
    const booking = await this.loadBooking(input.organizationId, input.bookingId);
    const session = await this.findActiveSession(
      input.organizationId,
      input.bookingId,
      input.kind,
    );
    if (!session) {
      return null;
    }

    if (
      input.expectedVersion != null &&
      session.version !== input.expectedVersion
    ) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.VERSION_CONFLICT,
        message: 'Draft version conflict',
        currentVersion: session.version,
      });
    }

    const now = new Date();
    const row = await this.prisma.bookingHandoverSession.update({
      where: { id: session.id, version: session.version },
      data: {
        status: 'CANCELLED',
        version: { increment: 1 },
        cancelReason: input.cancelReason?.trim() || 'Cancelled by operator',
        cancelledAt: now,
        lockedByUserId: null,
        lockedAt: null,
        updatedByUserId: input.actor.userId,
      },
    });
    return this.mapDraftRow(row, booking, input.actor);
  }

  async assertDraftReadyForComplete(
    orgId: string,
    bookingId: string,
    kind: HandoverKind,
    sessionId: string,
    expectedVersion: number | null,
    actor: HandoverActorContext,
  ): Promise<{ sessionId: string; version: number }> {
    const session = await this.prisma.bookingHandoverSession.findFirst({
      where: {
        id: sessionId,
        organizationId: orgId,
        bookingId,
        kind,
      },
    });
    if (!session) {
      throw new NotFoundException({
        code: HANDOVER_DRAFT_ERROR.NOT_FOUND,
        message: 'Handover draft not found',
      });
    }

    if (await this.expireIfNeeded(session)) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.EXPIRED,
        message: 'Handover draft has expired',
      });
    }

    if (isHandoverSessionTerminal(session.status)) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.NOT_EDITABLE,
        message: `Draft status ${session.status} cannot complete`,
      });
    }

    if (expectedVersion != null && session.version !== expectedVersion) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.VERSION_CONFLICT,
        message: 'Draft version conflict',
        currentVersion: session.version,
      });
    }

    const stationId = session.stationId;
    const draft = parseHandoverSessionDraftPayload(session.payloadJson, stationId);
    const pickupOdometer =
      kind === 'RETURN' ? await this.loadPickupOdometer(orgId, bookingId) : null;

    for (const step of ['vehicle', 'condition', 'documents', 'signatures', 'review'] as const) {
      const issues = validateHandoverDraftStep(step, kind, draft, {
        pickupOdometerKm: pickupOdometer,
      });
      if (issues.length > 0) {
        throw new ConflictException({
          code: HANDOVER_DRAFT_ERROR.NOT_READY_FOR_COMPLETE,
          message: issues[0]!.message,
          issues,
        });
      }
    }

  if (session.lockedByUserId && session.lockedByUserId !== actor.userId) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.LOCK_CONFLICT,
        message: 'Draft locked by another operator',
      });
    }

    return { sessionId: session.id, version: session.version };
  }

  async lockDraftAfterComplete(
    tx: Prisma.TransactionClient,
    sessionId: string,
    orgId: string,
    protocolId: string,
  ): Promise<void> {
    await tx.bookingHandoverSession.updateMany({
      where: { id: sessionId, organizationId: orgId },
      data: {
        status: 'COMPLETED',
        completedProtocolId: protocolId,
        lockedByUserId: null,
        lockedAt: null,
        version: { increment: 1 },
      },
    });
  }

  private mapDraftRow(
    row: {
      id: string;
      organizationId: string;
      stationId: string | null;
      bookingId: string;
      vehicleId: string;
      kind: HandoverKind;
      status: HandoverSessionStatus;
      currentStep: string | null;
      version: number;
      payloadJson: unknown;
      blockingRequirements: unknown;
      startedByUserId: string | null;
      assignedToUserId: string | null;
      updatedByUserId: string | null;
      lockedByUserId: string | null;
      lockedAt: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    booking: { pickupStationId: string | null; returnStationId: string | null },
    actor: HandoverActorContext,
  ): HandoverDraftDto {
    const stationId =
      row.stationId ??
      (row.kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId);
    const draft = parseHandoverSessionDraftPayload(row.payloadJson, stationId);
    const now = Date.now();
    const expired = row.expiresAt ? row.expiresAt.getTime() < now : false;
    const editable =
      !expired &&
      !isHandoverSessionTerminal(row.status) &&
      (!row.lockedByUserId || row.lockedByUserId === actor.userId);

    return {
      id: row.id,
      organizationId: row.organizationId,
      stationId,
      bookingId: row.bookingId,
      vehicleId: row.vehicleId,
      kind: row.kind,
      status: row.status,
      currentStep: (row.currentStep as HandoverDraftStepId | null) ?? draft.currentStep,
      version: row.version,
      draft,
      blockingRequirements: Array.isArray(row.blockingRequirements)
        ? (row.blockingRequirements as Array<{ code: string; message: string }>)
        : [],
      startedByUserId: row.startedByUserId,
      assignedToUserId: row.assignedToUserId,
      updatedByUserId: row.updatedByUserId,
      lockedByUserId: row.lockedByUserId,
      lockedAt: row.lockedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      retentionExpiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      expired,
      editable,
    };
  }

  private async findActiveSession(orgId: string, bookingId: string, kind: HandoverKind) {
    return this.prisma.bookingHandoverSession.findFirst({
      where: {
        organizationId: orgId,
        bookingId,
        kind,
        status: { in: [...HANDOVER_SESSION_ACTIVE_STATUSES] },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async expireIfNeeded(session: {
    id: string;
    organizationId: string;
    version: number;
    expiresAt: Date | null;
    status: HandoverSessionStatus;
  }): Promise<boolean> {
    if (!session.expiresAt || session.expiresAt.getTime() >= Date.now()) {
      return false;
    }
    await this.prisma.bookingHandoverSession.updateMany({
      where: {
        id: session.id,
        organizationId: session.organizationId,
        version: session.version,
        status: { in: [...HANDOVER_SESSION_ACTIVE_STATUSES] },
      },
      data: {
        status: 'CANCELLED',
        cancelReason: 'Draft expired (retention)',
        cancelledAt: new Date(),
        version: { increment: 1 },
        lockedByUserId: null,
        lockedAt: null,
      },
    });
    return true;
  }

  private assertDraftEditable(session: { status: HandoverSessionStatus }): void {
    if (isHandoverSessionTerminal(session.status)) {
      throw new ConflictException({
        code: HANDOVER_DRAFT_ERROR.NOT_EDITABLE,
        message: `Draft status ${session.status} is not editable`,
      });
    }
  }

  private resolveStationId(
    booking: { pickupStationId: string | null; returnStationId: string | null },
    kind: HandoverKind,
    override: string | null | undefined,
  ): string | null {
    const trimmed = override?.trim();
    if (trimmed) return trimmed;
    return kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId;
  }

  private async loadBooking(orgId: string, bookingId: string) {
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
      throw new NotFoundException({
        code: HANDOVER_SESSION_ERROR.BOOKING_NOT_FOUND,
        message: 'Booking not found',
      });
    }
    return booking;
  }

  private assertBookingAllowsDraft(status: string, kind: HandoverKind): void {
    const expected = kind === 'PICKUP' ? 'CONFIRMED' : 'ACTIVE';
    if (status !== expected) {
      throw new ConflictException({
        code: HANDOVER_SESSION_ERROR.BOOKING_WRONG_STATUS,
        message: `Draft requires booking status ${expected}, got ${status}`,
      });
    }
  }

  private async loadPickupOdometer(orgId: string, bookingId: string): Promise<number | null> {
    const protocol = await this.prisma.bookingHandoverProtocol.findFirst({
      where: currentHandoverProtocolWhere(bookingId, 'PICKUP'),
      select: { odometerKm: true },
    });
    return protocol?.odometerKm ?? null;
  }

  private async assertReadPermission(actor: HandoverActorContext, orgId: string): Promise<void> {
    try {
      await assertMembershipPermission(
        this.prisma,
        {
          id: actor.userId,
          platformRole: actor.platformRole ?? undefined,
          membershipRole: actor.membershipRole ?? undefined,
          organizationId: orgId,
        },
        orgId,
        'bookings',
        'read',
      );
    } catch {
      throw new ForbiddenException({
        code: HANDOVER_DRAFT_ERROR.PERMISSION_DENIED,
        message: 'Missing bookings.read permission',
      });
    }
  }

  private async assertWritePermission(actor: HandoverActorContext, orgId: string): Promise<void> {
    try {
      await assertMembershipPermission(
        this.prisma,
        {
          id: actor.userId,
          platformRole: actor.platformRole ?? undefined,
          membershipRole: actor.membershipRole ?? undefined,
          organizationId: orgId,
        },
        orgId,
        'bookings',
        'write',
      );
    } catch {
      throw new ForbiddenException({
        code: HANDOVER_DRAFT_ERROR.PERMISSION_DENIED,
        message: 'Missing bookings.write permission',
      });
    }
  }

  private async assertStationWritable(
    actor: HandoverActorContext,
    orgId: string,
    stationId: string | null,
  ): Promise<void> {
    if (!stationId) return;
    const stationAccess = await this.stationAccess.resolve(actor.userId, orgId);
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: actor.userId, organizationId: orgId, status: 'ACTIVE' },
      select: { role: true, status: true, permissions: true },
    });
    const permissions = resolveHandoverSessionPermissions(membership, actor);
    if (!resolveWritableStation(stationAccess, stationId) && !permissions.canOverrideScope) {
      throw new ForbiddenException({
        code: HANDOVER_DRAFT_ERROR.SCOPE_DENIED,
        message: 'Station scope denied for handover draft',
      });
    }
  }
}
