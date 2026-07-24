import { Controller, Get, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { EvaluationsAnalyticsFilterService } from './evaluations-analytics-filter.service';
import {
  EvaluationsInsightAnalyticsListQueryDto,
  EvaluationsInsightAnalyticsSummaryQueryDto,
  normalizeAnalyticsFilterQuery,
} from './dto/evaluations-analytics-filters.dto';
import {
  EvaluationsInsightDetailDto,
  InsightAnalyticsSummaryResponseDto,
} from './dto/evaluations-analytics-response.dto';

@ApiTags('Evaluations Insights Analytics')
@Controller('organizations/:orgId/evaluations/insights')
@UseGuards(OrgScopingGuard, RolesGuard)
export class EvaluationsInsightsController {
  constructor(
    private readonly analytics: DashboardInsightsAnalyticsService,
    private readonly filterService: EvaluationsAnalyticsFilterService,
  ) {}

  @Get('summary')
  @ApiOperation({ summary: 'Insight analytics summary for Auswertungen' })
  @ApiOkResponse({ type: InsightAnalyticsSummaryResponseDto })
  async getAnalyticsSummary(
    @Param('orgId') orgId: string,
    @Query() query: EvaluationsInsightAnalyticsSummaryQueryDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const resolved = await this.filterService.resolve(
      orgId,
      req.user?.id,
      normalizeAnalyticsFilterQuery(query),
    );
    return this.analytics.getAnalyticsSummary(orgId, resolved);
  }

  @Get()
  async listAnalyticsInsights(
    @Param('orgId') orgId: string,
    @Query() query: EvaluationsInsightAnalyticsListQueryDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const resolved = await this.filterService.resolve(
      orgId,
      req.user?.id,
      normalizeAnalyticsFilterQuery(query),
    );
    return this.analytics.listAnalyticsInsights(orgId, resolved, {
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get(':insightId')
  @ApiOperation({ summary: 'Single insight detail (station-scoped)' })
  @ApiParam({ name: 'insightId', description: 'Insight UUID' })
  @ApiOkResponse({ type: EvaluationsInsightDetailDto })
  async getAnalyticsInsightById(
    @Param('orgId') orgId: string,
    @Param('insightId') insightId: string,
    @Query() query: EvaluationsInsightAnalyticsSummaryQueryDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const resolved = await this.filterService.resolve(
      orgId,
      req.user?.id,
      normalizeAnalyticsFilterQuery(query),
    );
    const insight = await this.analytics.getAnalyticsInsightById(orgId, insightId, resolved);
    if (!insight) throw new NotFoundException('Insight not found');
    return insight;
  }
}
