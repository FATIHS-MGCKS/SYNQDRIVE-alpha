import { HttpStatus, Injectable } from '@nestjs/common';
import { ProcessingActivityDpiaStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { POLICY_LIFECYCLE_ERROR_CODES } from '../privacy-domain/policy-lifecycle/policy-lifecycle.constants';
import { throwPolicyLifecycleError } from '../privacy-domain/policy-lifecycle/policy-lifecycle.exceptions';
import {
  DPIA_ACTIVATION_ALLOWED_STATUSES,
  DPIA_ACTIVATION_BLOCKED_STATUSES,
} from './dpia-decision-recorder.service';

@Injectable()
export class DpiaActivationGateService {
  constructor(private readonly prisma: PrismaService) {}

  async assertActivationAllowed(orgId: string, processingActivityId: string): Promise<void> {
    const activity = await this.prisma.processingActivity.findFirst({
      where: { id: processingActivityId, organizationId: orgId },
      select: { dpiaStatus: true },
    });
    if (!activity) return;

    if (activity.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_REJECTED) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.DPIA_REJECTED_BLOCKS_ACTIVATION,
        'Activation blocked: DPIA was rejected.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (DPIA_ACTIVATION_BLOCKED_STATUSES.has(activity.dpiaStatus)) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.DPIA_NOT_APPROVED,
        `Activation blocked: DPIA status is ${activity.dpiaStatus}. Required DPIA must be approved first.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (!DPIA_ACTIVATION_ALLOWED_STATUSES.has(activity.dpiaStatus)) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.DPIA_NOT_APPROVED,
        `Activation blocked: unresolved DPIA status ${activity.dpiaStatus}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const currentDpia = await this.prisma.processingActivityDpia.findFirst({
      where: {
        organizationId: orgId,
        processingActivityId,
        isCurrent: true,
      },
    });

    if (currentDpia && currentDpia.approvalStatus === ProcessingActivityDpiaStatus.DPIA_REQUIRED) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.DPIA_NOT_APPROVED,
        'Activation blocked: DPIA is required but not yet approved.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
