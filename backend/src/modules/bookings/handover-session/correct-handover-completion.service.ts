import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAction, ActivityEntity, HandoverKind } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { assertMembershipPermission } from '@shared/auth/permission.util';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import type { CreateHandoverProtocolPayload } from '../handover.types';
import {
  buildHandoverCompletionCanonicalPayload,
  hashHandoverCompletionPayload,
  hashHandoverSignedContent,
  signedHandoverContentChanged,
  type HandoverCompletionCanonicalPayload,
} from './handover-completion-payload.canonical';
import { HANDOVER_COMPLETION_RECORD_ERROR } from './handover-completion-record.errors';
import { createHandoverCompletionRecordInTransaction } from './handover-completion-record.service';
import { validatePickupHandoverPayload } from './handover-pickup-completion.executor';
import { currentHandoverCompletionRecordWhere, currentHandoverProtocolWhere } from './handover-protocol.query';
import { OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS } from './operator-handover-permission.constants';

export interface CorrectHandoverCompletionCommandInput {
  organizationId: string;
  bookingId: string;
  kind: HandoverKind;
  payload: CreateHandoverProtocolPayload;
  actor: HandoverActorContext;
  correctionReason: string;
}

export interface CorrectHandoverCompletionResult {
  protocolId: string;
  completionRecordId: string;
  version: number;
  documentVersion: number;
  payloadHash: string;
  signedContentHash: string;
  previousCompletionRecordId: string;
}

@Injectable()
export class CorrectHandoverCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async correctHandoverCompletion(
    input: CorrectHandoverCompletionCommandInput,
  ): Promise<CorrectHandoverCompletionResult> {
    const correctionReason = input.correctionReason?.trim();
    if (!correctionReason) {
      throw new ConflictException({
        code: HANDOVER_COMPLETION_RECORD_ERROR.CORRECTION_REASON_REQUIRED,
        message: 'correctionReason is required',
      });
    }

    await this.assertOverridePermission(input.actor, input.organizationId);
    validatePickupHandoverPayload(input.payload);

    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: {
        id: true,
        vehicleId: true,
        customerId: true,
        pickupStationId: true,
        returnStationId: true,
        status: true,
      },
    });
    if (!booking) {
      throw new NotFoundException({
        code: HANDOVER_COMPLETION_RECORD_ERROR.NOT_FOUND,
        message: 'Booking not found',
      });
    }

    const currentProtocol = await this.prisma.bookingHandoverProtocol.findFirst({
      where: currentHandoverProtocolWhere(input.bookingId, input.kind),
    });
    if (!currentProtocol) {
      throw new NotFoundException({
        code: HANDOVER_COMPLETION_RECORD_ERROR.PROTOCOL_NOT_FOUND,
        message: 'Current handover protocol not found',
      });
    }

    const currentRecord = await this.prisma.bookingHandoverCompletionRecord.findFirst({
      where: currentHandoverCompletionRecordWhere(input.bookingId, input.kind),
    });
    if (!currentRecord) {
      throw new NotFoundException({
        code: HANDOVER_COMPLETION_RECORD_ERROR.NOT_FOUND,
        message: 'Current completion record not found',
      });
    }

    const stationId =
      input.payload.actualStationId?.trim() ||
      (input.kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId);

    const previousCanonical = currentRecord.payloadCanonical as unknown as HandoverCompletionCanonicalPayload;
    const nextCanonical = buildHandoverCompletionCanonicalPayload(input.payload, {
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      vehicleId: booking.vehicleId,
      customerId: booking.customerId,
      stationId,
      kind: input.kind,
      documentVersion: currentRecord.documentVersion + 1,
      protocolVersion: currentProtocol.version + 1,
      performedAt: currentProtocol.performedAt.toISOString(),
    });

    if (signedHandoverContentChanged(previousCanonical, nextCanonical)) {
      this.assertSignaturesPresent(input.payload);
    }

    const damageIds = Array.isArray(input.payload.damageIds)
      ? input.payload.damageIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : [];

    const result = await this.prisma.$transaction(async (tx) => {
      const lockedProtocol = await tx.bookingHandoverProtocol.findFirst({
        where: {
          id: currentProtocol.id,
          organizationId: input.organizationId,
          isCurrent: true,
        },
      });
      if (!lockedProtocol) {
        throw new ConflictException({
          code: HANDOVER_COMPLETION_RECORD_ERROR.ALREADY_SUPERSEDED,
          message: 'Protocol already superseded',
        });
      }

      const supersededProtocol = await tx.bookingHandoverProtocol.updateMany({
        where: {
          id: currentProtocol.id,
          organizationId: input.organizationId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
          supersededAt: new Date(),
        },
      });
      if (supersededProtocol.count === 0) {
        throw new ConflictException({
          code: HANDOVER_COMPLETION_RECORD_ERROR.ALREADY_SUPERSEDED,
          message: 'Protocol already superseded',
        });
      }

      const newProtocol = await tx.bookingHandoverProtocol.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          vehicleId: booking.vehicleId,
          kind: input.kind,
          version: currentProtocol.version + 1,
          isCurrent: true,
          performedAt: currentProtocol.performedAt,
          performedByUserId: input.actor.userId,
          performedByName: input.actor.displayName,
          odometerKm: Math.max(0, Math.round(input.payload.odometerKm)),
          fuelPercent: Math.max(0, Math.min(100, Math.round(input.payload.fuelPercent))),
          fuelFull: !!input.payload.fuelFull,
          exteriorClean: input.payload.exteriorClean ?? true,
          interiorClean: input.payload.interiorClean ?? true,
          tiresSeasonOk: input.payload.tiresSeasonOk ?? true,
          warningLightsOn: input.payload.warningLightsOn ?? false,
          warningLightsNotes: input.payload.warningLightsNotes ?? null,
          notes: input.payload.notes ?? null,
          customerSignatureName: input.payload.customerSignatureName ?? null,
          customerSignatureDataUrl: input.payload.customerSignatureDataUrl ?? null,
          staffSignatureName: input.payload.staffSignatureName ?? null,
          staffSignatureDataUrl: input.payload.staffSignatureDataUrl ?? null,
          documentsAcknowledged: !!input.payload.documentsAcknowledged,
          damageIds: damageIds as object,
        },
      });

      await tx.bookingHandoverProtocol.update({
        where: { id: currentProtocol.id },
        data: { supersededById: newProtocol.id },
      });

      if (input.kind === 'RETURN') {
        const pickupProtocol = await tx.bookingHandoverProtocol.findFirst({
          where: currentHandoverProtocolWhere(input.bookingId, 'PICKUP'),
          select: { odometerKm: true },
        });
        if (pickupProtocol) {
          const kmDriven = Math.max(
            0,
            Math.round(input.payload.odometerKm) - pickupProtocol.odometerKm,
          );
          await tx.booking.update({
            where: { id: input.bookingId },
            data: { kmDriven },
          });
        }
      }

      const completionRecord = await createHandoverCompletionRecordInTransaction(tx, {
        orgId: input.organizationId,
        bookingId: input.bookingId,
        vehicleId: booking.vehicleId,
        customerId: booking.customerId,
        stationId,
        protocolId: newProtocol.id,
        kind: input.kind,
        protocolVersion: newProtocol.version,
        documentVersion: currentRecord.documentVersion + 1,
        performedAt: newProtocol.performedAt,
        payload: input.payload,
        actor: input.actor,
        previousVersionId: currentRecord.id,
        correctionReason,
        overrideUserId: input.actor.userId,
      });

      return {
        protocolId: newProtocol.id,
        completionRecordId: completionRecord.id,
        version: completionRecord.version,
        documentVersion: completionRecord.documentVersion,
        payloadHash: completionRecord.payloadHash,
        signedContentHash: completionRecord.signedContentHash,
        previousCompletionRecordId: currentRecord.id,
      };
    });

    await this.activityLog.log({
      organizationId: input.organizationId,
      userId: input.actor.userId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.BOOKING,
      entityId: input.bookingId,
      description: `Handover ${input.kind} completion corrected (v${result.version})`,
      metaJson: {
        kind: input.kind,
        correctionReason,
        previousCompletionRecordId: result.previousCompletionRecordId,
        completionRecordId: result.completionRecordId,
        protocolId: result.protocolId,
        payloadHash: result.payloadHash,
      },
    });

    return result;
  }

  private async assertOverridePermission(
    actor: HandoverActorContext,
    organizationId: string,
  ): Promise<void> {
    const requirement =
      OPERATOR_HANDOVER_PERMISSION_REQUIREMENTS['operator.handover.override'];
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
        code: HANDOVER_COMPLETION_RECORD_ERROR.OVERRIDE_PERMISSION_DENIED,
        message: 'Missing operator.handover.override permission',
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
        code: HANDOVER_COMPLETION_RECORD_ERROR.SIGNATURE_REQUIRED,
        message: 'Signatures are required when signed handover content changes',
      });
    }
  }
}

export function verifyCompletionRecordIntegrity(record: {
  payloadCanonical: unknown;
  payloadHash: string;
  signedContentHash: string;
}): boolean {
  const canonical = record.payloadCanonical as unknown as HandoverCompletionCanonicalPayload;
  return (
    hashHandoverCompletionPayload(canonical) === record.payloadHash &&
    hashHandoverSignedContent(canonical) === record.signedContentHash
  );
}
