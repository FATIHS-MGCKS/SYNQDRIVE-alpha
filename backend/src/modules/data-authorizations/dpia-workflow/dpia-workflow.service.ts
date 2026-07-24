import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Prisma,
  ProcessingActivityDpiaDecisionType,
  ProcessingActivityDpiaStatus,
  PrivacyResidualRiskLevel,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { DpiaDecisionRecorderService } from './dpia-decision-recorder.service';
import type {
  AcceptResidualRiskDto,
  ApproveDpiaDto,
  CreateDpiaDto,
  DpiaReviewDecisionDto,
  RejectDpiaDto,
  UpdateDpiaDraftDto,
} from './dto/dpia-workflow.dto';

@Injectable()
export class DpiaWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: DpiaDecisionRecorderService,
  ) {}

  async ensureDpiaRecord(
    tx: Prisma.TransactionClient,
    input: {
      orgId: string;
      processingActivityId: string;
      riskAssessmentId?: string;
      assessmentOwnerUserId?: string | null;
      contentFingerprint?: string | null;
      approvalStatus: ProcessingActivityDpiaStatus;
    },
  ) {
    const existing = await tx.processingActivityDpia.findFirst({
      where: {
        organizationId: input.orgId,
        processingActivityId: input.processingActivityId,
        isCurrent: true,
        approvalStatus: {
          in: [
            ProcessingActivityDpiaStatus.DPIA_REQUIRED,
            ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS,
          ],
        },
      },
    });
    if (existing) return existing;

    await tx.processingActivityDpia.updateMany({
      where: { processingActivityId: input.processingActivityId, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await tx.processingActivityDpia.create({
      data: {
        id: randomUUID(),
        organizationId: input.orgId,
        processingActivityId: input.processingActivityId,
        riskAssessmentId: input.riskAssessmentId,
        assessmentOwnerUserId: input.assessmentOwnerUserId ?? null,
        approvalStatus: input.approvalStatus,
        contentFingerprint: input.contentFingerprint,
      },
    });

    await this.decisions.record(tx, {
      organizationId: input.orgId,
      dpiaId: created.id,
      decisionType: ProcessingActivityDpiaDecisionType.DPIA_CREATED,
      actorUserId: input.assessmentOwnerUserId,
      outcome: input.approvalStatus,
    });

    return created;
  }

  async getCurrent(orgId: string, processingActivityId: string) {
    const dpia = await this.prisma.processingActivityDpia.findFirst({
      where: { organizationId: orgId, processingActivityId, isCurrent: true },
      include: { decisions: { orderBy: { createdAt: 'asc' } }, riskAssessment: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!dpia) {
      throw new NotFoundException({ message: 'No DPIA record found', code: 'DPIA_NOT_FOUND' });
    }
    return dpia;
  }

  async createOrUpdateDraft(
    orgId: string,
    processingActivityId: string,
    dto: CreateDpiaDto | UpdateDpiaDraftDto,
    actorUserId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      let dpia = await tx.processingActivityDpia.findFirst({
        where: { organizationId: orgId, processingActivityId, isCurrent: true },
      });

      if (!dpia) {
        dpia = await this.ensureDpiaRecord(tx, {
          orgId,
          processingActivityId,
          assessmentOwnerUserId: actorUserId,
          approvalStatus: ProcessingActivityDpiaStatus.DPIA_REQUIRED,
        });
      }

      if (
        dpia.approvalStatus !== ProcessingActivityDpiaStatus.DPIA_REQUIRED &&
        dpia.approvalStatus !== ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS
      ) {
        throw new UnprocessableEntityException('DPIA is not editable in current status');
      }

      const updated = await tx.processingActivityDpia.update({
        where: { id: dpia.id },
        data: {
          identifiedRisks: dto.identifiedRisks as unknown as Prisma.InputJsonValue,
          proposedMeasures: dto.proposedMeasures as unknown as Prisma.InputJsonValue,
          evidenceReference: dto.evidenceReference?.trim(),
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
          privacyReviewerUserId: 'privacyReviewerUserId' in dto ? dto.privacyReviewerUserId : undefined,
          securityReviewerUserId: 'securityReviewerUserId' in dto ? dto.securityReviewerUserId : undefined,
          approvalStatus: ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS,
        },
      });

      await tx.processingActivity.update({
        where: { id: processingActivityId },
        data: { dpiaStatus: ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS },
      });

      return updated;
    });
  }

  async submitForReview(orgId: string, processingActivityId: string, actorUserId: string) {
    const dpia = await this.getCurrent(orgId, processingActivityId);
    if (!dpia.identifiedRisks) {
      throw new UnprocessableEntityException('identifiedRisks required before submission');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.processingActivityDpia.update({
        where: { id: dpia.id },
        data: { approvalStatus: ProcessingActivityDpiaStatus.DPIA_IN_PROGRESS },
      });
      await this.decisions.record(tx, {
        organizationId: orgId,
        dpiaId: dpia.id,
        decisionType: ProcessingActivityDpiaDecisionType.SUBMITTED_FOR_REVIEW,
        actorUserId,
        outcome: 'SUBMITTED',
      });
      return updated;
    });
  }

  async recordPrivacyReview(
    orgId: string,
    processingActivityId: string,
    actorUserId: string,
    dto: DpiaReviewDecisionDto,
  ) {
    const dpia = await this.getCurrent(orgId, processingActivityId);
    if (dpia.privacyReviewerUserId && dpia.privacyReviewerUserId !== actorUserId) {
      throw new ForbiddenException('Assigned privacy reviewer only');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.decisions.record(tx, {
        organizationId: orgId,
        dpiaId: dpia.id,
        decisionType: ProcessingActivityDpiaDecisionType.PRIVACY_REVIEWED,
        actorUserId,
        outcome: dto.outcome,
        reason: dto.reason,
      });
      return tx.processingActivityDpia.findUniqueOrThrow({ where: { id: dpia.id } });
    });
  }

  async recordSecurityReview(
    orgId: string,
    processingActivityId: string,
    actorUserId: string,
    dto: DpiaReviewDecisionDto,
  ) {
    const dpia = await this.getCurrent(orgId, processingActivityId);
    if (dpia.securityReviewerUserId && dpia.securityReviewerUserId !== actorUserId) {
      throw new ForbiddenException('Assigned security reviewer only');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.decisions.record(tx, {
        organizationId: orgId,
        dpiaId: dpia.id,
        decisionType: ProcessingActivityDpiaDecisionType.SECURITY_REVIEWED,
        actorUserId,
        outcome: dto.outcome,
        reason: dto.reason,
      });
      return tx.processingActivityDpia.findUniqueOrThrow({ where: { id: dpia.id } });
    });
  }

  async acceptResidualRisk(
    orgId: string,
    processingActivityId: string,
    actorUserId: string,
    dto: AcceptResidualRiskDto,
  ) {
    const dpia = await this.getCurrent(orgId, processingActivityId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.processingActivityDpia.update({
        where: { id: dpia.id },
        data: {
          residualRisk: dto.residualRisk,
          residualRiskAccepted: true,
          residualRiskAcceptedByUserId: actorUserId,
          residualRiskAcceptedAt: new Date(),
        },
      });

      await this.decisions.record(tx, {
        organizationId: orgId,
        dpiaId: dpia.id,
        decisionType: ProcessingActivityDpiaDecisionType.RESIDUAL_RISK_ACCEPTED,
        actorUserId,
        outcome: dto.residualRisk,
        reason: dto.reason,
      });

      return updated;
    });
  }

  async approve(
    orgId: string,
    processingActivityId: string,
    approverUserId: string,
    dto: ApproveDpiaDto,
  ) {
    const dpia = await this.getCurrent(orgId, processingActivityId);

    if (!dpia.residualRiskAccepted) {
      throw new UnprocessableEntityException(
        'Residual risk must be explicitly accepted before DPIA approval',
      );
    }
    if (dpia.privacyReviewerUserId === approverUserId || dpia.securityReviewerUserId === approverUserId) {
      throw new ForbiddenException('Approver must be separate from reviewers (four-eyes)');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.processingActivityDpia.update({
        where: { id: dpia.id },
        data: {
          approvalStatus: ProcessingActivityDpiaStatus.DPIA_APPROVED,
          approvedMeasures: dpia.proposedMeasures ?? undefined,
        },
      });

      await tx.processingActivity.update({
        where: { id: processingActivityId },
        data: { dpiaStatus: ProcessingActivityDpiaStatus.DPIA_APPROVED },
      });

      await this.decisions.record(tx, {
        organizationId: orgId,
        dpiaId: dpia.id,
        decisionType: ProcessingActivityDpiaDecisionType.APPROVED,
        actorUserId: approverUserId,
        outcome: 'APPROVED',
        reason: dto.reason,
      });

      return updated;
    });
  }

  async reject(
    orgId: string,
    processingActivityId: string,
    actorUserId: string,
    dto: RejectDpiaDto,
  ) {
    const dpia = await this.getCurrent(orgId, processingActivityId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.processingActivityDpia.update({
        where: { id: dpia.id },
        data: { approvalStatus: ProcessingActivityDpiaStatus.DPIA_REJECTED },
      });

      await tx.processingActivity.update({
        where: { id: processingActivityId },
        data: { dpiaStatus: ProcessingActivityDpiaStatus.DPIA_REJECTED },
      });

      await this.decisions.record(tx, {
        organizationId: orgId,
        dpiaId: dpia.id,
        decisionType: ProcessingActivityDpiaDecisionType.REJECTED,
        actorUserId,
        outcome: 'REJECTED',
        reason: dto.reason,
      });

      return updated;
    });
  }

  async markReviewDue(
    tx: Prisma.TransactionClient,
    dpia: { id: string; organizationId: string; processingActivityId: string },
  ) {
    await tx.processingActivityDpia.update({
      where: { id: dpia.id },
      data: { approvalStatus: ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE },
    });
    await tx.processingActivity.update({
      where: { id: dpia.processingActivityId },
      data: { dpiaStatus: ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE },
    });
    await this.decisions.record(tx, {
      organizationId: dpia.organizationId,
      dpiaId: dpia.id,
      decisionType: ProcessingActivityDpiaDecisionType.REVIEW_DUE,
      outcome: 'REVIEW_DUE',
    });
  }
}
