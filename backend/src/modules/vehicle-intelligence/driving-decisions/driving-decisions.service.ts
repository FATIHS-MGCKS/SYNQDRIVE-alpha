import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DrivingDecisionAuditAction,
  DrivingDecisionRecommendation,
  DrivingDecisionSubjectType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { TripDecisionSummary } from '../trips/trip-decision-summary.types';

const MIN_REASON_LENGTH = 20;

export type CreateDrivingDecisionAuditInput = {
  organizationId: string;
  subjectType: DrivingDecisionSubjectType;
  subjectId: string;
  decision: DrivingDecisionAuditAction;
  recommendationAtDecision: DrivingDecisionRecommendation;
  dimensionsSnapshot: TripDecisionSummary | Record<string, unknown>;
  reason: string;
  decidedByUserId: string;
};

@Injectable()
export class DrivingDecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateDrivingDecisionAuditInput) {
    if (input.reason.trim().length < MIN_REASON_LENGTH) {
      throw new BadRequestException(
        `Decision reason must be at least ${MIN_REASON_LENGTH} characters`,
      );
    }

    return this.prisma.drivingDecisionAudit.create({
      data: {
        organizationId: input.organizationId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        decision: input.decision,
        recommendationAtDecision: input.recommendationAtDecision,
        dimensionsSnapshotJson: input.dimensionsSnapshot as object,
        reason: input.reason.trim(),
        decidedByUserId: input.decidedByUserId,
      },
      include: {
        decidedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async findBySubject(
    organizationId: string,
    subjectType: DrivingDecisionSubjectType,
    subjectId: string,
    limit = 20,
  ) {
    return this.prisma.drivingDecisionAudit.findMany({
      where: { organizationId, subjectType, subjectId, revokedAt: null },
      orderBy: { decidedAt: 'desc' },
      take: limit,
      include: {
        decidedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async revoke(
    organizationId: string,
    auditId: string,
    revokedByUserId: string,
    revokeReason: string,
  ) {
    if (revokeReason.trim().length < MIN_REASON_LENGTH) {
      throw new BadRequestException(
        `Revoke reason must be at least ${MIN_REASON_LENGTH} characters`,
      );
    }

    const existing = await this.prisma.drivingDecisionAudit.findFirst({
      where: { id: auditId, organizationId },
    });
    if (!existing) throw new NotFoundException('Decision audit not found');
    if (existing.revokedAt) throw new BadRequestException('Decision already revoked');

    return this.prisma.drivingDecisionAudit.update({
      where: { id: auditId },
      data: {
        revokedAt: new Date(),
        revokedByUserId,
        revokeReason: revokeReason.trim(),
      },
    });
  }
}
