import { BadRequestException, Injectable } from '@nestjs/common';
import { ActivityAction, ActivityEntity, Prisma } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
  StationRuleManualOverrideReferenceType,
  type StationRuleManualOverrideAuditRecord,
  type StationRuleManualOverrideInput,
  type StationRuleManualOverrideReference,
  type StationRuleManualOverrideRuleResultSnapshot,
  type StationRuleManualOverrideScope,
} from '@shared/stations/station-rule-manual-override.contract';
import {
  validateStationRuleManualOverrideRequest,
  type StationRuleManualOverrideEvaluationLike,
} from '@shared/stations/station-rule-manual-override.policy';

export interface PersistStationRuleManualOverrideInput {
  organizationId: string;
  referenceType: StationRuleManualOverrideReferenceType;
  reference: StationRuleManualOverrideReference;
  scope: StationRuleManualOverrideScope;
  actorUserId: string;
  manualOverride: StationRuleManualOverrideInput;
  evaluations: StationRuleManualOverrideEvaluationLike[];
  grantedAt?: Date;
}

@Injectable()
export class StationRuleManualOverrideService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  validate(input: PersistStationRuleManualOverrideInput) {
    return validateStationRuleManualOverrideRequest({
      manualOverride: input.manualOverride,
      actor: {
        userId: input.actorUserId,
        permission: STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
      },
      scope: input.scope,
      evaluations: input.evaluations,
      grantedAt: input.grantedAt,
    });
  }

  requiresOverride(evaluations: StationRuleManualOverrideEvaluationLike[]): boolean {
    return validateStationRuleManualOverrideRequest({
      scope: { organizationId: 'probe' },
      evaluations,
    }).issues.some((issue) => issue.code === 'STATION_RULE_MANUAL_OVERRIDE_REQUIRED');
  }

  async persistAppliedOverride(
    input: PersistStationRuleManualOverrideInput,
  ): Promise<StationRuleManualOverrideAuditRecord> {
    const grantedAt = input.grantedAt ?? new Date();
    const validation = this.validate({ ...input, grantedAt });
    if (!validation.valid || !validation.reason || !validation.expiresAt || !validation.scopeFingerprint) {
      throw new BadRequestException({
        message: 'Manual override validation failed.',
        issues: validation.issues,
      });
    }

    const created = await this.prisma.stationRuleManualOverride.create({
      data: {
        organizationId: input.organizationId,
        referenceType: input.referenceType,
        bookingId: input.reference.bookingId ?? null,
        transferId: input.reference.transferId ?? null,
        scopeFingerprint: validation.scopeFingerprint,
        scopeSnapshot: input.scope as unknown as Prisma.InputJsonValue,
        permission: STATION_RULE_MANUAL_OVERRIDE_PERMISSION,
        reason: validation.reason,
        actorUserId: input.actorUserId,
        originalRuleResults: (validation.originalRuleResults ?? []) as unknown as Prisma.InputJsonValue,
        grantedAt,
        expiresAt: validation.expiresAt,
        consumedAt: grantedAt,
      },
    });

    await this.audit.record({
      actorUserId: input.actorUserId,
      actorOrganizationId: input.organizationId,
      action: ActivityAction.ADMIN_OVERRIDE,
      entity:
        input.referenceType === StationRuleManualOverrideReferenceType.BOOKING_RULES ||
        input.referenceType === StationRuleManualOverrideReferenceType.HANDOVER_PICKUP ||
        input.referenceType === StationRuleManualOverrideReferenceType.HANDOVER_RETURN
          ? ActivityEntity.BOOKING
          : ActivityEntity.VEHICLE,
      entityId:
        input.reference.bookingId ??
        input.reference.transferId ??
        input.scope.vehicleId ??
        input.scope.transferVehicleId ??
        input.organizationId,
      description: `Station rule manual override (${input.referenceType}) until ${created.expiresAt.toISOString()}`,
      level: 'WARN',
      metaJson: {
        overrideId: created.id,
        referenceType: created.referenceType,
        scopeFingerprint: created.scopeFingerprint,
        reason: created.reason,
        expiresAt: created.expiresAt.toISOString(),
        originalRuleResults: created.originalRuleResults,
        permission: created.permission,
      },
    });

    return this.toAuditRecord(created);
  }

  async linkBookingReference(
    organizationId: string,
    overrideId: string,
    bookingId: string,
  ): Promise<void> {
    const updated = await this.prisma.stationRuleManualOverride.updateMany({
      where: {
        id: overrideId,
        organizationId,
      },
      data: {
        bookingId,
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException('Manual override audit record not found for booking linkage.');
    }
  }

  private toAuditRecord(row: {
    id: string;
    organizationId: string;
    referenceType: StationRuleManualOverrideReferenceType;
    bookingId: string | null;
    transferId: string | null;
    scopeFingerprint: string;
    scopeSnapshot: unknown;
    permission: string;
    reason: string;
    actorUserId: string;
    originalRuleResults: unknown;
    grantedAt: Date;
    expiresAt: Date;
  }): StationRuleManualOverrideAuditRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      referenceType: row.referenceType,
      reference: {
        type: row.referenceType,
        bookingId: row.bookingId,
        transferId: row.transferId,
      },
      scopeFingerprint: row.scopeFingerprint,
      scopeSnapshot: row.scopeSnapshot as StationRuleManualOverrideScope,
      permission: row.permission,
      reason: row.reason,
      actorUserId: row.actorUserId,
      grantedAt: row.grantedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      originalRuleResults: row.originalRuleResults as StationRuleManualOverrideRuleResultSnapshot[],
    };
  }
}
