import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';

@Controller('organizations/:orgId/dashboard-insights')
@UseGuards(OrgScopingGuard, RolesGuard)
export class DashboardInsightsController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
    private readonly analytics: DashboardInsightsAnalyticsService,
  ) {}

  @Get()
  async getInsights(@Param('orgId') orgId: string) {
    const policy = await this.policyService.getPolicy(orgId);
    return this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
  }

  @Get('summary')
  async getSummary(@Param('orgId') orgId: string) {
    const policy = await this.policyService.getPolicy(orgId);
    const analyticsSummary = await this.analytics.getAnalyticsSummary(orgId);
    const lastRun = await this.repo.getLastRunForOrg(orgId);

    return {
      generatedAt: analyticsSummary.generatedAt,
      summary: {
        total: analyticsSummary.counts.totalVisible,
        ...analyticsSummary.counts.bySeverity,
      },
      insightCount: analyticsSummary.counts.totalVisible,
      maxVisible: policy.maxVisibleInsights,
      enabled: policy.enabled,
      lastRunTrigger: lastRun?.trigger ?? null,
      lastRunDurationMs: lastRun?.durationMs ?? null,
      analytics: analyticsSummary.counts,
    };
  }
}
