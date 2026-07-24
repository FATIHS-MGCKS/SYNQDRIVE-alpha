import { Injectable, Optional } from '@nestjs/common';
import {
  DataProcessingReviewEntityType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isLegalBasisCurrentlyValid } from '../legal-basis-assessment/legal-basis-assessment.transitions';
import { DataProcessingReviewWorkflowService } from '../review-workflow/review-workflow.service';
import { DpiaActivationGateService } from '../../dpia-workflow/dpia-activation-gate.service';
import { RetentionActivationGateService } from '../../retention-deletion/retention-activation-gate.service';
import { POLICY_LIFECYCLE_ERROR_CODES } from './policy-lifecycle.constants';
import { throwPolicyLifecycleError } from './policy-lifecycle.exceptions';
import { HttpStatus } from '@nestjs/common';

export interface PolicyActivationGuardInput {
  orgId: string;
  processingActivityId: string;
  lifecycleStatus: PrivacyPolicyLifecycleStatus;
  versionNumber: number;
  contentFingerprint?: string | null;
}

/**
 * Validates prerequisites at scheduled/manual activation time.
 * Blocks activation when review or legal basis became invalid since scheduling.
 */
@Injectable()
export class PolicyLifecycleActivationGuardService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly reviewWorkflow?: DataProcessingReviewWorkflowService,
    @Optional() private readonly dpiaGate?: DpiaActivationGateService,
    @Optional() private readonly retentionGate?: RetentionActivationGateService,
  ) {}

  async assertActivationPrerequisites(input: PolicyActivationGuardInput): Promise<void> {
    if (this.reviewWorkflow && input.contentFingerprint) {
      await this.reviewWorkflow.assertActivationAllowed({
        orgId: input.orgId,
        entityType: DataProcessingReviewEntityType.PROCESSING_ACTIVITY,
        entityId: input.processingActivityId,
        versionNumber: input.versionNumber,
        contentFingerprint: input.contentFingerprint,
        lifecycleStatus: input.lifecycleStatus,
      });
    }

    await this.assertLegalBasisValid(input.orgId, input.processingActivityId);

    if (this.dpiaGate) {
      await this.dpiaGate.assertActivationAllowed(input.orgId, input.processingActivityId);
    }

    if (this.retentionGate) {
      await this.retentionGate.assertActivationAllowed(input.orgId, input.processingActivityId);
    }
  }

  async assertLegalBasisValid(orgId: string, processingActivityId: string): Promise<void> {
    const assessments = await this.prisma.legalBasisAssessment.findMany({
      where: {
        organizationId: orgId,
        processingActivityId,
        status: {
          in: [
            PrivacyPolicyLifecycleStatus.ACTIVE,
            PrivacyPolicyLifecycleStatus.APPROVED,
            PrivacyPolicyLifecycleStatus.SCHEDULED,
          ],
        },
      },
      orderBy: { versionNumber: 'desc' },
      take: 5,
    });

    if (assessments.length === 0) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.ACTIVATION_PREREQUISITE_INVALID,
        'No valid legal basis assessment exists for this processing activity.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const now = new Date();
    const hasValid = assessments.some((a) =>
      isLegalBasisCurrentlyValid({
        status: a.status,
        validFrom: a.validFrom,
        validUntil: a.validUntil,
        now,
      }),
    );

    if (!hasValid) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.ACTIVATION_PREREQUISITE_INVALID,
        'Legal basis assessment is no longer valid at activation time.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
