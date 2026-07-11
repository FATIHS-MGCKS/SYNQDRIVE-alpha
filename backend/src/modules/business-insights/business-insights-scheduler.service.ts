import { Injectable, Logger, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigType } from '@nestjs/config';
import notificationEvaluationConfig from '@config/notification-evaluation.config';
import { PrismaService } from '@shared/database/prisma.service';
import { BusinessInsightsService } from './business-insights.service';
import { NotificationEvaluationService } from '@modules/notifications/runtime/notification-evaluation.service';

/** Wall-clock cadence — survives PM2 restarts better than @Interval (which resets every deploy). */
const INSIGHTS_CRON = '2,32 * * * *';

@Injectable()
export class BusinessInsightsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(BusinessInsightsScheduler.name);
  private cycleCount = 0;

  constructor(
    private readonly insightsService: BusinessInsightsService,
    private readonly prisma: PrismaService,
    private readonly evaluationService: NotificationEvaluationService,
    @Inject(notificationEvaluationConfig.KEY)
    private readonly evalConfig: ConfigType<typeof notificationEvaluationConfig>,
  ) {}

  onApplicationBootstrap() {
    // Enqueue boot evaluation jobs — persisted in BullMQ, survives process restarts.
    setTimeout(() => {
      void this.scheduledRun('scheduled_boot');
    }, this.evalConfig.bootStaggerMs);
  }

  @Cron(INSIGHTS_CRON)
  async scheduledRunCron() {
    await this.scheduledRun('scheduled_active');
  }

  async scheduledRun(trigger: 'scheduled_active' | 'scheduled_boot' = 'scheduled_active') {
    this.cycleCount++;
    this.logger.debug(`Enqueueing scheduled notification evaluations (${trigger})`);
    const start = Date.now();

    try {
      const activeOrgIds = await this.getActiveOrganizationIds();

      if (activeOrgIds.length === 0) {
        this.logger.debug('No active organizations to refresh');
        return;
      }

      const triggerClass = trigger === 'scheduled_boot' ? 'scheduled_boot' : 'scheduled';

      await Promise.all(
        activeOrgIds.map((orgId) =>
          this.evaluationService.scheduleScheduledEvaluation(orgId, triggerClass, trigger),
        ),
      );

      const elapsed = Date.now() - start;
      this.logger.log(
        `Scheduled evaluation jobs enqueued (${trigger}): ${activeOrgIds.length} orgs in ${elapsed}ms`,
      );

      if (this.cycleCount >= 48) {
        this.cycleCount = 0;
        await this.insightsService.pruneOldData();
      }
    } catch (err) {
      this.logger.error(`Scheduled notification evaluation enqueue failed: ${err}`);
    }
  }

  private async getActiveOrganizationIds(): Promise<string[]> {
    const allOrgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    return allOrgs.map((o) => o.id);
  }
}
