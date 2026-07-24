import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { EvaluationsAnalyticsFilterService } from './evaluations-analytics-filter.service';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import type { DashboardInsightDto } from './insight.types';

@Controller('organizations/:orgId/dashboard-insights')
@UseGuards(OrgScopingGuard, RolesGuard)
export class DashboardInsightsController {
  constructor(
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
    private readonly analytics: DashboardInsightsAnalyticsService,
    private readonly filterService: EvaluationsAnalyticsFilterService,
  ) {}

  @Get()
  async getInsights(
    @Param('orgId') orgId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const policy = await this.policyService.getPolicy(orgId);
    const resolved = await this.filterService.resolve(orgId, req.user?.id, {});
    const response = await this.repo.getActiveInsights(orgId, policy.maxVisibleInsights * 4);
    const runMeta = await this.repo.getRunMetadata(orgId);
    const filtered = this.analytics
      .filterInsightRows(
        response.insights.map((dto) => this.toAnalyticsRow(dto, orgId)),
        resolved,
        runMeta.stale,
      )
      .map((row) => response.insights.find((dto) => dto.id === row.id))
      .filter((dto): dto is DashboardInsightDto => dto != null)
      .slice(0, policy.maxVisibleInsights);

    return {
      ...response,
      insights: filtered,
      activeInsightCount: filtered.length,
      summary: this.buildSummary(filtered),
    };
  }

  @Get('summary')
  async getSummary(
    @Param('orgId') orgId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    const policy = await this.policyService.getPolicy(orgId);
    const resolved = await this.filterService.resolve(orgId, req.user?.id, {});
    const analyticsSummary = await this.analytics.getAnalyticsSummary(orgId, resolved);
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

  private toAnalyticsRow(dto: DashboardInsightDto, organizationId: string) {
    return {
      id: dto.id,
      type: dto.type,
      severity: dto.severity,
      priority: dto.priority,
      entityScope: dto.entityScope,
      entityIds: dto.entityIds ?? null,
      isGrouped: dto.isGrouped,
      groupCount: dto.groupCount,
      organizationId,
      entityReferences: dto.entityReferences ?? null,
      metrics: dto.metrics ?? null,
      timeContext: dto.timeContext ?? null,
      createdAt: dto.createdAt,
    };
  }

  private buildSummary(insights: DashboardInsightDto[]) {
    return {
      total: insights.length,
      critical: insights.filter((i) => i.severity === 'CRITICAL').length,
      warning: insights.filter((i) => i.severity === 'WARNING').length,
      opportunity: insights.filter((i) => i.severity === 'OPPORTUNITY').length,
      info: insights.filter((i) => i.severity === 'INFO').length,
    };
  }
}
