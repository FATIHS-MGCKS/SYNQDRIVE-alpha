import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import type { BrakeRentalReviewOverrideSummary } from './brake-rental-health.types';

export interface CreateBrakeRentalReviewOverrideInput {
  organizationId: string;
  vehicleId: string;
  reason: string;
  grantedByUserId: string;
  expiresAt: Date;
}

@Injectable()
export class BrakeRentalHealthReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findActiveOverride(
    organizationId: string,
    vehicleId: string,
  ): Promise<BrakeRentalReviewOverrideSummary | null> {
    const row = await this.prisma.brakeRentalHealthReviewOverride.findFirst({
      where: {
        organizationId,
        vehicleId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });
    if (!row) return null;
    return {
      id: row.id,
      reason: row.reason,
      grantedByUserId: row.grantedByUserId,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createOverride(input: CreateBrakeRentalReviewOverrideInput) {
    const reason = input.reason.trim();
    if (reason.length < 10) {
      throw new BadRequestException('Override reason must be at least 10 characters');
    }
    if (input.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt must be in the future');
    }
    const maxExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
    if (input.expiresAt.getTime() > maxExpiry) {
      throw new BadRequestException('Override expiry cannot exceed 30 days');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }

    await this.prisma.brakeRentalHealthReviewOverride.updateMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    const created = await this.prisma.brakeRentalHealthReviewOverride.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        reason,
        grantedByUserId: input.grantedByUserId,
        expiresAt: input.expiresAt,
      },
    });

    await this.audit.record({
      actorUserId: input.grantedByUserId,
      actorOrganizationId: input.organizationId,
      action: ActivityAction.ADMIN_OVERRIDE,
      entity: ActivityEntity.VEHICLE,
      entityId: input.vehicleId,
      description: `Brake rental health review override until ${created.expiresAt.toISOString()}`,
      level: 'WARN',
      metaJson: {
        overrideId: created.id,
        reason,
        expiresAt: created.expiresAt.toISOString(),
      },
    });

    return created;
  }

  async revokeOverride(
    organizationId: string,
    vehicleId: string,
    overrideId: string,
    actorUserId: string,
  ) {
    const row = await this.prisma.brakeRentalHealthReviewOverride.findFirst({
      where: { id: overrideId, organizationId, vehicleId, revokedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Active override not found');
    }

    const revoked = await this.prisma.brakeRentalHealthReviewOverride.update({
      where: { id: overrideId },
      data: { revokedAt: new Date() },
    });

    await this.audit.record({
      actorUserId,
      actorOrganizationId: organizationId,
      action: ActivityAction.REVOKE,
      entity: ActivityEntity.VEHICLE,
      entityId: vehicleId,
      description: 'Brake rental health review override revoked',
      level: 'WARN',
      metaJson: { overrideId },
    });

    return revoked;
  }

  assertOrgAccess(organizationId: string, vehicleOrgId: string) {
    if (organizationId !== vehicleOrgId) {
      throw new ForbiddenException('Cross-tenant vehicle access denied');
    }
  }
}
