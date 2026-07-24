import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { RetentionDeletionExecutorService } from './retention-deletion-executor.service';
import { RETENTION_DELETION_CONFIG } from './retention-deletion.config';

@Injectable()
export class RetentionDeletionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionDeletionSchedulerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: RetentionDeletionExecutorService,
  ) {}

  onModuleInit(): void {
    if (!RETENTION_DELETION_CONFIG.enabled) return;
    if (process.env.RETENTION_DELETION_SCHEDULER_ENABLED === 'false') return;

    this.timer = setInterval(() => {
      void this.processDueDeletions().catch((err) => {
        this.logger.error(
          'Retention deletion scheduler failed',
          err instanceof Error ? err.stack : String(err),
        );
      });
    }, RETENTION_DELETION_CONFIG.schedulerPollMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async processDueDeletions(): Promise<{ processed: number; skipped: number }> {
    const now = new Date();
    const due = await this.prisma.processingActivityRetentionPolicy.findMany({
      where: {
        isConfigured: true,
        legalHold: false,
        deletionCompletedAt: null,
        deletionDueAt: { lte: now },
      },
      take: RETENTION_DELETION_CONFIG.batchSize,
      orderBy: { deletionDueAt: 'asc' },
    });

    let processed = 0;
    let skipped = 0;
    const schedulerDryRun = process.env.RETENTION_DELETION_SCHEDULER_DRY_RUN !== 'false';

    for (const policy of due) {
      const activeException = policy.id
        ? await this.prisma.processingActivityRetentionException.findFirst({
            where: {
              retentionPolicyId: policy.id,
              organizationId: policy.organizationId,
              extendsUntil: { gt: now },
            },
          })
        : null;

      if (activeException) {
        skipped++;
        continue;
      }

      try {
        await this.executor.runJob(
          policy.organizationId,
          policy.processingActivityId,
          {
            retentionPolicyId: policy.id,
            dryRun: schedulerDryRun,
            trigger: 'scheduler',
          },
        );
        processed++;
      } catch (err) {
        this.logger.warn(
          `Deletion job skipped for policy=${policy.id} org=${policy.organizationId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        skipped++;
      }
    }

    if (processed > 0 || skipped > 0) {
      this.logger.log(`Retention scheduler: processed=${processed} skipped=${skipped} dryRun=${schedulerDryRun}`);
    }

    return { processed, skipped };
  }
}
