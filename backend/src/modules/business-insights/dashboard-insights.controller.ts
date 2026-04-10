import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';

@Controller('organizations/:orgId/dashboard-insights')
@UseGuards(RolesGuard)
export class DashboardInsightsController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
  ) {}

  @Get()
  async getInsights(@Param('orgId') orgId: string) {
    const policy = await this.policyService.getPolicy(orgId);
    return this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
  }

  @Get('summary')
  async getSummary(@Param('orgId') orgId: string) {
    const policy = await this.policyService.getPolicy(orgId);
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights);
    const lastRun = await this.repo.getLastRunForOrg(orgId);

    return {
      generatedAt: response.generatedAt,
      summary: response.summary,
      insightCount: response.insights.length,
      maxVisible: policy.maxVisibleInsights,
      enabled: policy.enabled,
      lastRunTrigger: lastRun?.trigger ?? null,
      lastRunDurationMs: lastRun?.durationMs ?? null,
    };
  }
}
