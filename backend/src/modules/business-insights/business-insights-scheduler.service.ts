import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { BusinessInsightsService } from './business-insights.service';

/** Wall-clock cadence — survives PM2 restarts better than @Interval (which resets every deploy). */
const INSIGHTS_CRON = '2,32 * * * *';

@Injectable()
export class BusinessInsightsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(BusinessInsightsScheduler.name);
  private cycleCount = 0;
  private running = false;

  constructor(
    private readonly insightsService: BusinessInsightsService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap() {
    // After deploy/restart, @Interval would wait 30 min — dashboard shows „Verzögert“ until then.
    setTimeout(() => {
      void this.scheduledRun('scheduled_boot');
    }, 15_000);
  }

  @Cron(INSIGHTS_CRON)
  async scheduledRunCron() {
    await this.scheduledRun('scheduled_active');
  }

  async scheduledRun(trigger: 'scheduled_active' | 'scheduled_boot' = 'scheduled_active') {
    if (this.running) {
      this.logger.debug(`Skipping insights refresh (${trigger}) — previous run still in flight`);
      return;
    }

    this.running = true;
    this.cycleCount++;
    this.logger.debug(`Starting scheduled insights refresh (${trigger})`);
    const start = Date.now();

    try {
      const activeOrgIds = await this.getActiveOrganizationIds();

      if (activeOrgIds.length === 0) {
        this.logger.debug('No active organizations to refresh');
        return;
      }

      let totalPublished = 0;

      for (const orgId of activeOrgIds) {
        try {
          const r = await this.insightsService.runForOrganization(orgId, trigger);
          totalPublished += r.published;
        } catch (err) {
          this.logger.warn(`Scheduled run failed for org ${orgId}: ${err}`);
        }
      }

      const elapsed = Date.now() - start;
      this.logger.log(
        `Scheduled refresh done (${trigger}): ${activeOrgIds.length} orgs, ${totalPublished} insights, ${elapsed}ms`,
      );

      if (this.cycleCount >= 48) {
        this.cycleCount = 0;
        await this.insightsService.pruneOldData();
      }
    } catch (err) {
      this.logger.error(`Scheduled insights refresh failed: ${err}`);
    } finally {
      this.running = false;
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
