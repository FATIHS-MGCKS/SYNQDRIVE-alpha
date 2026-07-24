import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { POLICY_LIFECYCLE_ERROR_CODES } from '../privacy-domain/policy-lifecycle/policy-lifecycle.constants';
import { throwPolicyLifecycleError } from '../privacy-domain/policy-lifecycle/policy-lifecycle.exceptions';
import { RETENTION_DELETION_CONFIG } from './retention-deletion.config';

@Injectable()
export class RetentionActivationGateService {
  constructor(private readonly prisma: PrismaService) {}

  async assertActivationAllowed(orgId: string, processingActivityId: string): Promise<void> {
    if (!RETENTION_DELETION_CONFIG.requireRetentionForActivation) return;

    const activity = await this.prisma.processingActivity.findFirst({
      where: { id: processingActivityId, organizationId: orgId },
      include: { dataCategories: true },
    });
    if (!activity) return;

    const policies = await this.prisma.processingActivityRetentionPolicy.findMany({
      where: { organizationId: orgId, processingActivityId, isConfigured: true },
    });

    if (policies.length === 0) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.RETENTION_NOT_CONFIGURED,
        'Activation blocked: retention policy not configured for this processing activity.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const configuredCategories = new Set(
      policies.filter((p) => p.dataCategory).map((p) => p.dataCategory!),
    );
    const missing = activity.dataCategories
      .map((c) => c.dataCategory)
      .filter((cat) => !configuredCategories.has(cat));

    const hasActivityWide = policies.some((p) => !p.dataCategory);
    if (missing.length > 0 && !hasActivityWide) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.RETENTION_INCOMPLETE,
        `Activation blocked: missing retention policy for categories: ${missing.join(', ')}`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (policies.some((p) => p.legalHold)) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.RETENTION_LEGAL_HOLD_ACTIVE,
        'Activation blocked while legal hold is active on retention policy.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
