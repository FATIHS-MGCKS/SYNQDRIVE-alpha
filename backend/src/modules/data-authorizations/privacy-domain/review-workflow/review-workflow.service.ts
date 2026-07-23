import { HttpStatus, Injectable } from '@nestjs/common';
import {
  DataAuthorizationRiskLevel,
  DataProcessingReviewCycleStatus,
  DataProcessingReviewDecisionOutcome,
  DataProcessingReviewEntityType,
  DataProcessingReviewStepType,
  Prisma,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { calculateAuthorizationRiskLevel } from '../../data-authorization-risk.util';
import { DataAuthorizationAuditService } from '../audit-log/data-authorization-audit.service';
import { DATA_PROCESSING_REVIEW_STEP_PERMISSION } from './data-processing-permission.constants';
import { DataProcessingPermissionService } from './data-processing-permission.service';
import { assertFourEyesSeparation } from './review-workflow.four-eyes';
import { computeProcessingActivityFingerprint } from './review-workflow.fingerprint';
import { resolveRequiredReviewSteps } from './review-workflow.config';
import {
  ReviewCycleNotFoundException,
  ReviewDecisionReasonRequiredException,
  ReviewParallelDecisionException,
  ReviewStepAlreadyDecidedException,
  ReviewStepNotRequiredException,
  ReviewWorkflowBlockedException,
} from './review-workflow.exceptions';

type ReviewCycle = Prisma.DataProcessingReviewCycleGetPayload<{
  include: { decisions: true };
}>;

@Injectable()
export class DataProcessingReviewWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: DataProcessingPermissionService,
    private readonly audit: DataAuthorizationAuditService,
  ) {}

  async computeProcessingActivityRisk(orgId: string, activityId: string): Promise<DataAuthorizationRiskLevel> {
    const activity = await this.prisma.processingActivity.findFirst({
      where: { id: activityId, organizationId: orgId },
      include: { dataCategories: true, purposes: true },
    });
    if (!activity) {
      throw new ReviewWorkflowBlockedException('ProcessingActivity not found');
    }
    return calculateAuthorizationRiskLevel({
      dataCategories: activity.dataCategories.map((c) => c.dataCategory),
      purposes: activity.purposes.map((p) => p.purpose),
    });
  }

  async buildProcessingActivityFingerprint(orgId: string, activityId: string): Promise<string> {
    const activity = await this.prisma.processingActivity.findFirst({
      where: { id: activityId, organizationId: orgId },
      include: { dataCategories: true, purposes: true },
    });
    if (!activity) {
      throw new ReviewWorkflowBlockedException('ProcessingActivity not found');
    }
    return computeProcessingActivityFingerprint({
      activityCode: activity.activityCode,
      title: activity.title,
      description: activity.description,
      categories: activity.dataCategories.map((c) => c.dataCategory),
      purposes: activity.purposes.map((p) => p.purpose),
    });
  }

  async startReviewCycle(params: {
    orgId: string;
    entityType: DataProcessingReviewEntityType;
    entityId: string;
    entityVersionNumber: number;
    contentFingerprint: string;
    riskLevel: DataAuthorizationRiskLevel;
    requesterUserId: string;
    processingActivityId?: string | null;
  }): Promise<ReviewCycle> {
    await this.permissions.assertOrgMembership(params.requesterUserId, params.orgId);

    const requiredSteps = resolveRequiredReviewSteps(params.riskLevel);

    return this.prisma.$transaction(async (tx) => {
      const openCycles = await tx.dataProcessingReviewCycle.findMany({
        where: {
          organizationId: params.orgId,
          entityType: params.entityType,
          entityId: params.entityId,
          status: DataProcessingReviewCycleStatus.OPEN,
        },
      });

      for (const cycle of openCycles) {
        await tx.dataProcessingReviewCycle.update({
          where: { id: cycle.id },
          data: {
            status: DataProcessingReviewCycleStatus.SUPERSEDED,
            supersededAt: new Date(),
          },
        });
      }

      const created = await tx.dataProcessingReviewCycle.create({
        data: {
          id: randomUUID(),
          organizationId: params.orgId,
          entityType: params.entityType,
          entityId: params.entityId,
          entityVersionNumber: params.entityVersionNumber,
          entityContentFingerprint: params.contentFingerprint,
          riskLevel: params.riskLevel,
          requiredSteps,
          requestedByUserId: params.requesterUserId,
          processingActivityId: params.processingActivityId ?? null,
        },
        include: { decisions: true },
      });

      if (params.entityType === DataProcessingReviewEntityType.PROCESSING_ACTIVITY) {
        await tx.processingActivity.update({
          where: { id: params.entityId },
          data: {
            activeReviewCycleId: created.id,
            submittedByUserId: params.requesterUserId,
            submittedAt: new Date(),
            riskLevel: params.riskLevel,
            contentFingerprint: params.contentFingerprint,
          },
        });
      }

      return created;
    });
  }

  async recordDecision(params: {
    orgId: string;
    cycleId: string;
    stepType: DataProcessingReviewStepType;
    outcome: DataProcessingReviewDecisionOutcome;
    actorUserId: string;
    reason?: string | null;
  }): Promise<ReviewCycle> {
    const permission = DATA_PROCESSING_REVIEW_STEP_PERMISSION[params.stepType];
    await this.permissions.assert({ id: params.actorUserId }, params.orgId, permission);
    await this.permissions.assertOrgMembership(params.actorUserId, params.orgId);

    if (
      params.outcome === DataProcessingReviewDecisionOutcome.REJECTED ||
      params.outcome === DataProcessingReviewDecisionOutcome.REQUESTED_CHANGES
    ) {
      if (!(params.reason ?? '').trim()) {
        throw new ReviewDecisionReasonRequiredException();
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const cycle = await tx.dataProcessingReviewCycle.findFirst({
        where: { id: params.cycleId, organizationId: params.orgId },
        include: { decisions: true },
      });
      if (!cycle) {
        throw new ReviewCycleNotFoundException();
      }
      if (cycle.status !== DataProcessingReviewCycleStatus.OPEN) {
        throw new ReviewWorkflowBlockedException('Review cycle is not open');
      }

      if (!cycle.requiredSteps.includes(params.stepType)) {
        throw new ReviewStepNotRequiredException(params.stepType);
      }

      const priorDecision = cycle.decisions.find((d) => d.stepType === params.stepType);
      if (priorDecision) {
        throw new ReviewStepAlreadyDecidedException(params.stepType);
      }

      const org = await tx.organization.findUnique({
        where: { id: params.orgId },
        select: { dataProcessingFourEyesEnabled: true },
      });

      assertFourEyesSeparation({
        fourEyesEnabled: org?.dataProcessingFourEyesEnabled ?? true,
        requesterUserId: cycle.requestedByUserId,
        actorUserId: params.actorUserId,
        stepType: params.stepType,
      });

      await tx.dataProcessingReviewDecision.create({
        data: {
          id: randomUUID(),
          organizationId: params.orgId,
          reviewCycleId: cycle.id,
          stepType: params.stepType,
          decision: params.outcome,
          actorUserId: params.actorUserId,
          reason: params.reason?.trim() || null,
          entityVersionNumber: cycle.entityVersionNumber,
        },
      });

      await this.audit.enqueueReviewDecisionAuditInTransaction(tx, {
        organizationId: params.orgId,
        cycleId: cycle.id,
        stepType: params.stepType,
        outcome: params.outcome,
        actorUserId: params.actorUserId,
        reason: params.reason,
        entityVersionNumber: cycle.entityVersionNumber,
      });

      if (
        params.outcome === DataProcessingReviewDecisionOutcome.REJECTED ||
        params.outcome === DataProcessingReviewDecisionOutcome.REQUESTED_CHANGES
      ) {
        const updated = await tx.dataProcessingReviewCycle.update({
          where: { id: cycle.id },
          data: {
            status:
              params.outcome === DataProcessingReviewDecisionOutcome.REJECTED
                ? DataProcessingReviewCycleStatus.REJECTED
                : DataProcessingReviewCycleStatus.SUPERSEDED,
            completedAt: new Date(),
          },
          include: { decisions: true },
        });

        if (
          params.outcome === DataProcessingReviewDecisionOutcome.REJECTED &&
          cycle.entityType === DataProcessingReviewEntityType.PROCESSING_ACTIVITY
        ) {
          await tx.processingActivity.update({
            where: { id: cycle.entityId },
            data: {
              status: PrivacyPolicyLifecycleStatus.REJECTED,
              rejectionReason: params.reason?.trim() || null,
              activeReviewCycleId: null,
            },
          });
        }

        return updated;
      }

      const refreshed = await tx.dataProcessingReviewCycle.findUniqueOrThrow({
        where: { id: cycle.id },
        include: { decisions: true },
      });

      const approvedSteps = new Set(
        refreshed.decisions
          .filter((d) => d.decision === DataProcessingReviewDecisionOutcome.APPROVED)
          .map((d) => d.stepType),
      );

      const allApproved = refreshed.requiredSteps.every((step) => approvedSteps.has(step));
      if (!allApproved) {
        return refreshed;
      }

      const completed = await tx.dataProcessingReviewCycle.update({
        where: { id: cycle.id },
        data: {
          status: DataProcessingReviewCycleStatus.APPROVED,
          completedAt: new Date(),
        },
        include: { decisions: true },
      });

      if (cycle.entityType === DataProcessingReviewEntityType.PROCESSING_ACTIVITY) {
        const finalDecision = refreshed.decisions.find(
          (d) => d.stepType === DataProcessingReviewStepType.FINAL_APPROVAL,
        );
        await tx.processingActivity.update({
          where: { id: cycle.entityId },
          data: {
            status: PrivacyPolicyLifecycleStatus.APPROVED,
            approvedByUserId: finalDecision?.actorUserId ?? params.actorUserId,
            approvedAt: new Date(),
            activeReviewCycleId: cycle.id,
          },
        });
      }

      return completed;
    });
  }

  async assertActivationAllowed(params: {
    orgId: string;
    entityType: DataProcessingReviewEntityType;
    entityId: string;
    versionNumber: number;
    contentFingerprint: string;
    lifecycleStatus: PrivacyPolicyLifecycleStatus;
  }): Promise<void> {
    if (
      params.lifecycleStatus !== PrivacyPolicyLifecycleStatus.APPROVED &&
      params.lifecycleStatus !== PrivacyPolicyLifecycleStatus.SCHEDULED
    ) {
      throw new ReviewWorkflowBlockedException(
        'Activation requires APPROVED or SCHEDULED status after full review',
        { status: params.lifecycleStatus },
      );
    }

    const cycle = await this.prisma.dataProcessingReviewCycle.findFirst({
      where: {
        organizationId: params.orgId,
        entityType: params.entityType,
        entityId: params.entityId,
        entityVersionNumber: params.versionNumber,
        entityContentFingerprint: params.contentFingerprint,
        status: DataProcessingReviewCycleStatus.APPROVED,
      },
      include: { decisions: true },
      orderBy: { completedAt: 'desc' },
    });

    if (!cycle) {
      throw new ReviewWorkflowBlockedException('No approved review cycle for this version');
    }

    const approvedSteps = new Set(
      cycle.decisions
        .filter((d) => d.decision === DataProcessingReviewDecisionOutcome.APPROVED)
        .map((d) => d.stepType),
    );

    for (const step of cycle.requiredSteps) {
      if (!approvedSteps.has(step)) {
        throw new ReviewWorkflowBlockedException(`Missing required review step: ${step}`);
      }
    }
  }

  async invalidateOnMaterialChange(params: {
    orgId: string;
    entityType: DataProcessingReviewEntityType;
    entityId: string;
    newFingerprint: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const cycles = await tx.dataProcessingReviewCycle.findMany({
        where: {
          organizationId: params.orgId,
          entityType: params.entityType,
          entityId: params.entityId,
          status: { in: [DataProcessingReviewCycleStatus.OPEN, DataProcessingReviewCycleStatus.APPROVED] },
        },
      });

      for (const cycle of cycles) {
        if (cycle.entityContentFingerprint === params.newFingerprint) continue;
        await tx.dataProcessingReviewCycle.update({
          where: { id: cycle.id },
          data: {
            status: DataProcessingReviewCycleStatus.SUPERSEDED,
            supersededAt: new Date(),
          },
        });
      }

      if (params.entityType === DataProcessingReviewEntityType.PROCESSING_ACTIVITY) {
        await tx.processingActivity.updateMany({
          where: { id: params.entityId, organizationId: params.orgId },
          data: {
            contentFingerprint: params.newFingerprint,
            status: PrivacyPolicyLifecycleStatus.DRAFT,
            approvedByUserId: null,
            approvedAt: null,
            activeReviewCycleId: null,
          },
        });
      }
    });
  }

  async getCycleStatus(orgId: string, cycleId: string): Promise<ReviewCycle> {
    const cycle = await this.prisma.dataProcessingReviewCycle.findFirst({
      where: { id: cycleId, organizationId: orgId },
      include: { decisions: { orderBy: { decidedAt: 'asc' } } },
    });
    if (!cycle) {
      throw new ReviewCycleNotFoundException();
    }
    return cycle;
  }

  /** Detect parallel race — used in tests and defensive checks. */
  assertNoParallelDecision(existing: ReviewCycle, stepType: DataProcessingReviewStepType): void {
    if (existing.decisions.some((d) => d.stepType === stepType)) {
      throw new ReviewParallelDecisionException(stepType);
    }
  }
}
