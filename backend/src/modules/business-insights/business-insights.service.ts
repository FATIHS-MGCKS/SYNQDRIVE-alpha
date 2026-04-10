import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { InsightRankingService } from './insight-ranking.service';
import { InsightGroupingService } from './insight-grouping.service';
import { InsightFormatterService } from './insight-formatter.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { DetectorContext, InsightCandidate, InsightDetector } from './insight.types';

import { TightHandoverDetector } from './detectors/tight-handover.detector';
import { ReturnNeedsInspectionDetector } from './detectors/return-needs-inspection.detector';
import { StationShortageDetector } from './detectors/station-shortage.detector';
import { LowUtilizationDetector } from './detectors/low-utilization.detector';
import { ServiceWindowDetector } from './detectors/service-window.detector';
import { ServiceBeforeBookingDetector } from './detectors/service-before-booking.detector';

@Injectable()
export class BusinessInsightsService {
  private readonly logger = new Logger(BusinessInsightsService.name);
  private readonly detectors: InsightDetector[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: TenantInsightPolicyService,
    private readonly ranking: InsightRankingService,
    private readonly grouping: InsightGroupingService,
    private readonly formatter: InsightFormatterService,
    private readonly repo: DashboardInsightsRepository,
    tightHandover: TightHandoverDetector,
    returnInspection: ReturnNeedsInspectionDetector,
    stationShortage: StationShortageDetector,
    lowUtilization: LowUtilizationDetector,
    serviceWindow: ServiceWindowDetector,
    serviceBeforeBooking: ServiceBeforeBookingDetector,
  ) {
    this.detectors = [
      tightHandover,
      returnInspection,
      stationShortage,
      lowUtilization,
      serviceWindow,
      serviceBeforeBooking,
    ];
  }

  async runForOrganization(organizationId: string, trigger: string): Promise<{ runId: string; published: number }> {
    const policy = await this.policyService.getPolicy(organizationId);
    if (!policy.enabled) {
      this.logger.debug(`Insights disabled for org ${organizationId}`);
      return { runId: '', published: 0 };
    }

    await this.repo.expireStaleInsights(organizationId);

    const run = await this.repo.createRun(organizationId, trigger);
    const ctx: DetectorContext = { organizationId, now: new Date(), policy };

    try {
      const enabledDetectors = this.detectors.filter((d) => policy.enabledTypes.includes(d.type));
      const allCandidates: InsightCandidate[] = [];

      for (const detector of enabledDetectors) {
        try {
          const start = Date.now();
          const results = await detector.detect(ctx);
          const elapsed = Date.now() - start;
          if (elapsed > 2000) {
            this.logger.warn(`Detector ${detector.type} slow for org ${organizationId}: ${elapsed}ms`);
          }
          allCandidates.push(...results);
        } catch (err) {
          this.logger.warn(`Detector ${detector.type} failed for org ${organizationId}: ${err}`);
        }
      }

      const grouped = this.grouping.dedupeAndGroup(allCandidates);
      const ranked = this.ranking.rank(grouped);
      const formatted = this.formatter.format(ranked.slice(0, policy.maxVisibleInsights), policy.useLlmFormatting);

      await this.repo.publishInsights(organizationId, run.id, formatted);
      await this.repo.completeRun(run.id, allCandidates.length, formatted.length);

      this.logger.log(
        `Insights run [${trigger}] for org ${organizationId}: ${allCandidates.length} candidates → ${grouped.length} grouped → ${formatted.length} published`,
      );
      return { runId: run.id, published: formatted.length };
    } catch (err: any) {
      await this.repo.completeRun(run.id, 0, 0, err.message);
      this.logger.error(`Insights run failed for org ${organizationId}: ${err.message}`);
      return { runId: run.id, published: 0 };
    }
  }

  async runForAllActiveOrganizations(trigger: string) {
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    const results: { orgId: string; published: number }[] = [];
    for (const org of orgs) {
      const r = await this.runForOrganization(org.id, trigger);
      results.push({ orgId: org.id, published: r.published });
    }
    return results;
  }

  async pruneOldData() {
    const orgs = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    for (const org of orgs) {
      await this.repo.pruneOldRuns(org.id);
    }
    this.logger.log(`Pruned old insight data for ${orgs.length} organizations`);
  }
}
