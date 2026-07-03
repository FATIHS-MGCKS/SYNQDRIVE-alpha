import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { BusinessInsightsService } from './business-insights.service';

const REFRESH_INTERVAL_MS = 30 * 60_000;

@Injectable()
export class BusinessInsightsScheduler {
  private readonly logger = new Logger(BusinessInsightsScheduler.name);
  private cycleCount = 0;

  constructor(
    private readonly insightsService: BusinessInsightsService,
    private readonly prisma: PrismaService,
  ) {}

  @Interval(REFRESH_INTERVAL_MS)
  async scheduledRun() {
    this.cycleCount++;
    this.logger.debug('Starting scheduled insights refresh');
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
          const r = await this.insightsService.runForOrganization(orgId, 'scheduled_active');
          totalPublished += r.published;
        } catch (err) {
          this.logger.warn(`Scheduled run failed for org ${orgId}: ${err}`);
        }
      }

      const elapsed = Date.now() - start;
      this.logger.log(
        `Scheduled refresh done: ${activeOrgIds.length} orgs, ${totalPublished} insights, ${elapsed}ms`,
      );

      if (this.cycleCount >= 48) {
        this.cycleCount = 0;
        await this.insightsService.pruneOldData();
      }
    } catch (err) {
      this.logger.error(`Scheduled insights refresh failed: ${err}`);
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
