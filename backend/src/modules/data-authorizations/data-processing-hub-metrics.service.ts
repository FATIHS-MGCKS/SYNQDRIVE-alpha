import { Injectable } from '@nestjs/common';
import { PrivacyPolicyLifecycleStatus, ProcessingActivityDpiaStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { EnforcementCoverageRegistryService } from './enforcement-coverage-registry/enforcement-coverage-registry.service';
import { ProcessingActivityRegisterCompletenessService } from './processing-activity-register/processing-activity-register-completeness.service';
import {
  REGISTER_ACTIVITY_INCLUDE,
  toCompletenessInput,
} from './processing-activity-register/processing-activity-register.mapper';
import { DataAuthorizationsService } from './data-authorizations.service';
import { REVOCATION_IN_PROGRESS_STATUSES } from './revocation-orchestrator/revocation-in-progress.constants';

export interface DataProcessingHubMetrics {
  activeProcessingActivities: number;
  blockingControlGaps: number;
  reviewsDue: number;
  revocationsInProgress: number;
  enforcementErrors: number;
  dpiaOverdue: number;
  legacy: Awaited<ReturnType<DataAuthorizationsService['getStats']>>;
}

@Injectable()
export class DataProcessingHubMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly completeness: ProcessingActivityRegisterCompletenessService,
    private readonly coverageRegistry: EnforcementCoverageRegistryService,
    private readonly legacyAuths: DataAuthorizationsService,
  ) {}

  async getMetrics(orgId: string): Promise<DataProcessingHubMetrics> {
    const now = new Date();

    const [activities, revocationsInProgress, coverage, legacy] = await Promise.all([
      this.prisma.processingActivity.findMany({
        where: { organizationId: orgId, isCurrentVersion: true },
        include: REGISTER_ACTIVITY_INCLUDE,
      }),
      this.prisma.dataAuthorizationRevocationWorkflow.count({
        where: {
          organizationId: orgId,
          status: { in: REVOCATION_IN_PROGRESS_STATUSES },
        },
      }),
      Promise.resolve(this.coverageRegistry.evaluate(orgId, `hub-metrics-${Date.now()}`)),
      this.legacyAuths.getStats(orgId),
    ]);

    let activeProcessingActivities = 0;
    let blockingControlGaps = 0;
    let reviewsDue = 0;
    let dpiaOverdue = 0;

    for (const activity of activities) {
      if (activity.status === PrivacyPolicyLifecycleStatus.ACTIVE) {
        activeProcessingActivities++;
      }

      const evaluation = this.completeness.evaluate(toCompletenessInput(activity));
      if (evaluation.blockingGaps.length > 0) {
        blockingControlGaps++;
      }

      if (
        activity.nextReviewDate &&
        activity.nextReviewDate.getTime() <= now.getTime() &&
        activity.status !== PrivacyPolicyLifecycleStatus.REVOKED &&
        activity.status !== PrivacyPolicyLifecycleStatus.REJECTED
      ) {
        reviewsDue++;
      }

      if (
        activity.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_REQUIRED ||
        activity.dpiaStatus === ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE
      ) {
        dpiaOverdue++;
      }
    }

    return {
      activeProcessingActivities,
      blockingControlGaps,
      reviewsDue,
      revocationsInProgress,
      enforcementErrors: coverage.enforcementErrorCount,
      dpiaOverdue,
      legacy,
    };
  }
}
