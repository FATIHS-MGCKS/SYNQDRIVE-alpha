import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import {
  InsightAnalyticsListQueryDto,
  InsightAnalyticsSummaryQueryDto,
} from './dto/insight-analytics-query.dto';

@Controller('organizations/:orgId/evaluations/insights')
@UseGuards(OrgScopingGuard, RolesGuard)
export class EvaluationsInsightsController {
  constructor(private readonly analytics: DashboardInsightsAnalyticsService) {}

  @Get('summary')
  getAnalyticsSummary(
    @Param('orgId') orgId: string,
    @Query() query: InsightAnalyticsSummaryQueryDto,
  ) {
    return this.analytics.getAnalyticsSummary(orgId, {
      category: query.category,
      severity: query.severity,
      stationId: query.stationId ?? null,
    });
  }

  @Get()
  listAnalyticsInsights(@Param('orgId') orgId: string, @Query() query: InsightAnalyticsListQueryDto) {
    return this.analytics.listAnalyticsInsights(orgId, {
      page: query.page,
      limit: query.limit,
      category: query.category,
      severity: query.severity,
      stationId: query.stationId ?? null,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get(':insightId')
  async getAnalyticsInsightById(
    @Param('orgId') orgId: string,
    @Param('insightId') insightId: string,
  ) {
    const insight = await this.analytics.getAnalyticsInsightById(orgId, insightId);
    if (!insight) throw new NotFoundException('Insight not found');
    return insight;
  }
}
