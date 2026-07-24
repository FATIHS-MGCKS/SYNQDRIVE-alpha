import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrivacyPolicyLifecycleStatus, ProcessingActivityDpiaStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import { DPIA_RISK_CONFIG } from './dpia-risk.config';
import { DpiaWorkflowService } from './dpia-workflow.service';
import { ProcessingActivityLifecycleService } from '../privacy-domain/policy-lifecycle/processing-activity-lifecycle.service';

const DEFAULT_POLL_MS = 60 * 60 * 1000;

@Injectable()
export class DpiaReviewDueSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DpiaReviewDueSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dpia: DpiaWorkflowService,
    @Optional() private readonly processingLifecycle?: ProcessingActivityLifecycleService,
    @Optional() private readonly auditService?: DataAuthorizationAuditService,
  ) {}

  onModuleInit(): void {
    if (process.env.DPIA_REVIEW_DUE_POLL_ENABLED === 'false') return;
    const intervalMs = Number(process.env.DPIA_REVIEW_DUE_POLL_MS ?? DEFAULT_POLL_MS);
    this.timer = setInterval(() => {
      void this.processReviewDue().catch((err) => {
        this.logger.error('DPIA review-due poll failed', err instanceof Error ? err.stack : String(err));
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processReviewDue(): Promise<{ marked: number; suspended: number }> {
    const leadMs = DPIA_RISK_CONFIG.reviewDueLeadDays * 24 * 60 * 60 * 1000;
    const threshold = new Date(Date.now() + leadMs);

    const due = await this.prisma.processingActivityDpia.findMany({
      where: {
        isCurrent: true,
        approvalStatus: ProcessingActivityDpiaStatus.DPIA_APPROVED,
        reviewDate: { lte: threshold },
      },
      take: 100,
    });

    let marked = 0;
    let suspended = 0;

    for (const row of due) {
      await this.prisma.$transaction(async (tx) => {
        await this.dpia.markReviewDue(tx, row);
        if (this.auditService) {
          await this.auditService.enqueueLifecycleAuditInTransaction(tx, {
            organizationId: row.organizationId,
            entityType: 'PROCESSING_ACTIVITY_DPIA',
            entityId: row.id,
            eventType: 'DPIA_REVIEW_DUE',
            previousStatus: ProcessingActivityDpiaStatus.DPIA_APPROVED,
            newStatus: ProcessingActivityDpiaStatus.DPIA_REVIEW_DUE,
          });
        }
      });
      marked++;

      if (
        DPIA_RISK_CONFIG.reviewDueSuspendEnabled &&
        this.processingLifecycle
      ) {
        const activity = await this.prisma.processingActivity.findUnique({
          where: { id: row.processingActivityId },
          select: { status: true, organizationId: true },
        });
        if (activity?.status === PrivacyPolicyLifecycleStatus.ACTIVE) {
          await this.processingLifecycle.suspend(
            row.organizationId,
            row.processingActivityId,
            'DPIA review due — automatic suspension per org policy',
          );
          suspended++;
        }
      }
    }

    if (marked > 0) {
      this.logger.log(`DPIA review due: marked=${marked} suspended=${suspended}`);
    }

    return { marked, suspended };
  }
}
