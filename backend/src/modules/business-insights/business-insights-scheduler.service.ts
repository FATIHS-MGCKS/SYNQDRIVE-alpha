import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@shared/database/prisma.service';
import { BusinessInsightsService } from './business-insights.service';

const REFRESH_INTERVAL_MS = 30 * 60_000;
const OVERNIGHT_START_HOUR = 23;
const OVERNIGHT_END_HOUR = 6;

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
    const isOvernight = this.isOvernightWindow();

    if (isOvernight && this.cycleCount % 3 !== 0) {
      this.logger.debug('Overnight window — skipping this cycle (reduced frequency)');
      return;
    }

    this.logger.debug('Starting scheduled insights refresh');
    const start = Date.now();

    try {
      const activeOrgIds = await this.getActiveOrganizationIds(isOvernight);

      if (activeOrgIds.length === 0) {
        this.logger.debug('No active organizations to refresh');
        return;
      }

      const trigger = isOvernight ? 'scheduled_overnight' : 'scheduled_active';
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

  private async getActiveOrganizationIds(isOvernight: boolean): Promise<string[]> {
    const allOrgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    if (isOvernight) {
      return this.filterOperationallyActive(allOrgs.map((o) => o.id));
    }

    return allOrgs.map((o) => o.id);
  }

  private async filterOperationallyActive(orgIds: string[]): Promise<string[]> {
    if (orgIds.length === 0) return [];

    const now = new Date();
    const horizon = new Date(now.getTime() + 12 * 3600_000);

    const orgsWithActivity = await this.prisma.booking.groupBy({
      by: ['organizationId'],
      where: {
        organizationId: { in: orgIds },
        status: { in: ['CONFIRMED', 'ACTIVE'] },
        OR: [
          { startDate: { gte: now, lte: horizon } },
          { endDate: { gte: now, lte: horizon } },
        ],
      },
    });

    const activeSet = new Set(orgsWithActivity.map((r) => r.organizationId));
    return orgIds.filter((id) => activeSet.has(id));
  }

  private isOvernightWindow(): boolean {
    const hour = new Date().getHours();
    return hour >= OVERNIGHT_START_HOUR || hour < OVERNIGHT_END_HOUR;
  }
}
