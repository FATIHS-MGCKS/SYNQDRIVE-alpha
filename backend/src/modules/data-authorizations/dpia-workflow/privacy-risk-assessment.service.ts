import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DataAuthorizationRiskLevel,
  ProcessingActivityDpiaDecisionType,
  ProcessingActivityDpiaStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { calculateAuthorizationRiskLevel } from '../data-authorization-risk.util';
import { computeProcessingActivityFingerprint } from '../privacy-domain/review-workflow/review-workflow.fingerprint';
import {
  computePrivacyRiskScore,
  mapRiskScoreToOrgLevel,
  type PrivacyRiskFactorInput,
} from './dpia-risk.config';
import { DpiaDecisionRecorderService } from './dpia-decision-recorder.service';
import type { SubmitPrivacyRiskAssessmentDto } from './dto/dpia-workflow.dto';
import { DpiaWorkflowService } from './dpia-workflow.service';

@Injectable()
export class PrivacyRiskAssessmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: DpiaDecisionRecorderService,
    private readonly dpiaWorkflow: DpiaWorkflowService,
  ) {}

  async assess(
    orgId: string,
    processingActivityId: string,
    dto: SubmitPrivacyRiskAssessmentDto,
    actorUserId?: string,
  ) {
    const activity = await this.findActivity(orgId, processingActivityId);
    const fingerprint = computeProcessingActivityFingerprint({
      activityCode: activity.activityCode,
      title: activity.title,
      description: activity.description,
      categories: activity.dataCategories.map((c) => c.dataCategory),
      purposes: activity.purposes.map((p) => p.purpose),
    });

    const orgRiskLevel = calculateAuthorizationRiskLevel({
      dataCategories: activity.dataCategories.map((c) => c.dataCategory),
      purposes: activity.purposes.map((p) => p.purpose),
    });

    const factorInput: PrivacyRiskFactorInput = {
      dataCategories: activity.dataCategories.map((c) => c.dataCategory),
      dataVolumeScope: dto.dataVolumeScope,
      processingFrequency: dto.processingFrequency,
      processingDuration: dto.processingDuration,
      dataSubjectScale: dto.dataSubjectScale,
      systematicMonitoring: dto.systematicMonitoring ?? false,
      locationData: dto.locationData ?? activity.dataCategories.some((c) => c.dataCategory === 'GPS_LOCATION'),
      profiling: dto.profiling ?? false,
      automatedDecisionMaking: dto.automatedDecisionMaking ?? false,
      vulnerableSubjects: dto.vulnerableSubjects ?? false,
      dataCombination: dto.dataCombination ?? false,
      thirdCountryTransfer: dto.thirdCountryTransfer ?? false,
      externalRecipients: dto.externalRecipients ?? false,
      likelihood: dto.likelihood,
      orgRiskLevel,
    };

    const scored = computePrivacyRiskScore(factorInput);
    const derivedRiskLevel = mapRiskScoreToOrgLevel(scored.riskScore);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.processingActivityRiskAssessment.updateMany({
        where: { processingActivityId, isCurrent: true },
        data: { isCurrent: false },
      });

      const created = await tx.processingActivityRiskAssessment.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          processingActivityId,
          contentFingerprint: fingerprint,
          assessmentOwnerUserId: actorUserId ?? null,
          dataVolumeScope: dto.dataVolumeScope,
          processingFrequency: dto.processingFrequency,
          processingDuration: dto.processingDuration,
          dataSubjectScale: dto.dataSubjectScale,
          systematicMonitoring: dto.systematicMonitoring ?? false,
          locationData: factorInput.locationData ?? false,
          profiling: dto.profiling ?? false,
          automatedDecisionMaking: dto.automatedDecisionMaking ?? false,
          vulnerableSubjects: dto.vulnerableSubjects ?? false,
          dataCombination: dto.dataCombination ?? false,
          thirdCountryTransfer: dto.thirdCountryTransfer ?? false,
          externalRecipients: dto.externalRecipients ?? false,
          securityMeasures: dto.securityMeasures?.trim() || null,
          potentialHarm: dto.potentialHarm?.trim() || null,
          likelihood: dto.likelihood,
          riskScore: scored.riskScore,
          dpiaRequired: scored.dpiaRequired,
          residualRiskLevel: dto.residualRiskLevel,
        },
      });

      const dpiaStatus: ProcessingActivityDpiaStatus = scored.dpiaRequired
        ? ProcessingActivityDpiaStatus.DPIA_REQUIRED
        : ProcessingActivityDpiaStatus.DPIA_NOT_REQUIRED;

      await tx.processingActivity.update({
        where: { id: processingActivityId },
        data: {
          riskLevel: derivedRiskLevel as DataAuthorizationRiskLevel,
          dpiaStatus,
        },
      });

      if (scored.dpiaRequired) {
        await this.dpiaWorkflow.ensureDpiaRecord(tx, {
          orgId,
          processingActivityId,
          riskAssessmentId: created.id,
          assessmentOwnerUserId: actorUserId,
          contentFingerprint: fingerprint,
          approvalStatus: ProcessingActivityDpiaStatus.DPIA_REQUIRED,
        });
      }

      return { assessment: created, scored, derivedRiskLevel, dpiaStatus };
    });

    return {
      ...result.assessment,
      riskScore: result.scored.riskScore,
      dpiaRequired: result.scored.dpiaRequired,
      factors: result.scored.factors,
      derivedRiskLevel: result.derivedRiskLevel,
      dpiaStatus: result.dpiaStatus,
      disclaimer: result.scored.disclaimer,
      legalDecisionSeparate: true,
    };
  }

  async getCurrent(orgId: string, processingActivityId: string) {
    const row = await this.prisma.processingActivityRiskAssessment.findFirst({
      where: { organizationId: orgId, processingActivityId, isCurrent: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      throw new NotFoundException({ message: 'No risk assessment found', code: 'RISK_ASSESSMENT_NOT_FOUND' });
    }
    return row;
  }

  async detectMaterialChange(orgId: string, processingActivityId: string): Promise<boolean> {
    const activity = await this.findActivity(orgId, processingActivityId);
    const current = await this.prisma.processingActivityRiskAssessment.findFirst({
      where: { organizationId: orgId, processingActivityId, isCurrent: true },
    });
    if (!current?.contentFingerprint) return false;

    const fingerprint = computeProcessingActivityFingerprint({
      activityCode: activity.activityCode,
      title: activity.title,
      description: activity.description,
      categories: activity.dataCategories.map((c) => c.dataCategory),
      purposes: activity.purposes.map((p) => p.purpose),
    });

    return fingerprint !== current.contentFingerprint;
  }

  private async findActivity(orgId: string, id: string) {
    const activity = await this.prisma.processingActivity.findFirst({
      where: { id, organizationId: orgId },
      include: { dataCategories: true, purposes: true },
    });
    if (!activity) {
      throw new NotFoundException({ message: 'Processing activity not found' });
    }
    return activity;
  }
}
