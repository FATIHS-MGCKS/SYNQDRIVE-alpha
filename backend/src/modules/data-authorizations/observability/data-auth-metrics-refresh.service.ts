import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DataAuthorizationAuditOutboxStatus,
  PrivacyPolicyLifecycleStatus,
  ProcessingActivityDpiaStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { readAuthorizationDecisionConfig } from '../authorization-decision-engine/authorization-decision.config';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import { EnforcementCoverageRegistryService } from '../enforcement-coverage-registry/enforcement-coverage-registry.service';
import { REVOCATION_IN_PROGRESS_STATUSES } from '../revocation-orchestrator/revocation-in-progress.constants';
import { WorkerRuntimeHealthService } from '../revocation-queue-control/worker-runtime-health.service';
import { DataAuthMetricsService } from './data-auth-metrics.service';

/**
 * Refreshes data-authorization gauges that require periodic DB/config scans.
 */
@Injectable()
export class DataAuthMetricsRefreshService implements OnModuleInit {
  private readonly logger = new Logger(DataAuthMetricsRefreshService.name);

  constructor(
    private readonly metrics: DataAuthMetricsService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly coverageRegistry?: EnforcementCoverageRegistryService,
    @Optional() private readonly workerHealth?: WorkerRuntimeHealthService,
    @Optional() private readonly decisionService?: AuthorizationDecisionService,
  ) {}

  onModuleInit(): void {
    this.refreshConfigGauges();
    this.metrics.publishBuildInfo();
  }

  @Cron('*/5 * * * *')
  async refreshDataAuthGauges(): Promise<void> {
    this.refreshConfigGauges();
    if (!this.prisma) return;

    try {
      const now = new Date();

      const [
        revocationsInProgress,
        expiredPolicies,
        overdueReviews,
        overdueDpias,
        auditOutboxPending,
      ] = await Promise.all([
        this.prisma.dataAuthorizationRevocationWorkflow.count({
          where: { status: { in: REVOCATION_IN_PROGRESS_STATUSES } },
        }),
        this.prisma.enforcementPolicy.count({
          where: {
            status: PrivacyPolicyLifecycleStatus.ACTIVE,
            validUntil: { lt: now },
          },
        }),
        this.prisma.processingActivity.count({
          where: {
            isCurrentVersion: true,
            status: { notIn: [PrivacyPolicyLifecycleStatus.REVOKED, PrivacyPolicyLifecycleStatus.REJECTED] },
            nextReviewDate: { lte: now },
          },
        }),
        this.prisma.processingActivity.count({
          where: {
            isCurrentVersion: true,
            dpiaStatus: {
              in: [
                ProcessingActivityDpiaStatus.DPIA_REQUIRED,
                ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE,
              ],
            },
          },
        }),
        this.prisma.dataAuthorizationAuditOutbox.count({
          where: {
            status: {
              in: [
                DataAuthorizationAuditOutboxStatus.PENDING,
                DataAuthorizationAuditOutboxStatus.RETRY,
                DataAuthorizationAuditOutboxStatus.PROCESSING,
              ],
            },
          },
        }),
      ]);

      this.metrics.setRevocationInProgress(revocationsInProgress);
      this.metrics.setExpiredPolicy(expiredPolicies);
      this.metrics.setOverdueReview(overdueReviews);
      this.metrics.setOverdueDpia(overdueDpias);
      this.metrics.setAuditOutboxPending(auditOutboxPending);

      if (this.coverageRegistry) {
        const integrity = this.coverageRegistry.validateRegistryIntegrity();
        this.metrics.setUnregisteredPath(integrity.errors.filter((e) => e.includes('Unregistered')).length);
      }

      if (this.workerHealth) {
        const snapshot = this.workerHealth.snapshot();
        this.metrics.setWorkerVersionMismatch(!snapshot.compliant);
      }

      if (this.decisionService) {
        const cacheStats = this.decisionService.getCacheStats();
        this.metrics.setPolicyCacheEntries(cacheStats?.size ?? 0);
      }
    } catch (err) {
      this.logger.warn(
        `Data-auth metrics gauge refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private refreshConfigGauges(): void {
    const config = readAuthorizationDecisionConfig();
    this.metrics.setDevBypassEnabled(config.devBypassEnabled);
    this.metrics.setEnforcementDisabled(!config.enforcementEnabled);
    this.metrics.setGlobalDenySwitchEnabled(config.globalDenySwitch);
  }
}
