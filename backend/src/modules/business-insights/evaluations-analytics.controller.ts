import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { EvaluationsAnalyticsFilterService } from './evaluations-analytics-filter.service';
import { EvaluationsAnalyticsSummaryService } from './evaluations-analytics-summary.service';
import {
  EvaluationsAnalyticsSummaryQueryDto,
  normalizeAnalyticsFilterQuery,
} from './dto/evaluations-analytics-filters.dto';
import { EvaluationsAnalyticsSummaryResponseDto } from './dto/evaluations-analytics-response.dto';

@ApiTags('Evaluations Analytics')
@Controller('organizations/:orgId/evaluations/analytics')
@UseGuards(OrgScopingGuard, RolesGuard)
export class EvaluationsAnalyticsController {
  constructor(
    private readonly summaryService: EvaluationsAnalyticsSummaryService,
    private readonly filterService: EvaluationsAnalyticsFilterService,
  ) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Canonical Auswertungen analytics summary',
    description:
      'Unified filter contract applies across summary, insights, charts, and drill-downs. See docs/api/evaluations-analytics-contracts.md.',
  })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiOkResponse({ type: EvaluationsAnalyticsSummaryResponseDto })
  async getAnalyticsSummary(
    @Param('orgId') orgId: string,
    @Query() query: EvaluationsAnalyticsSummaryQueryDto,
    @Req() req: { user?: { id?: string } },
  ) {
    const resolved = await this.filterService.resolve(
      orgId,
      req.user?.id,
      normalizeAnalyticsFilterQuery(query),
      { allowDataQualitySectionFilters: true },
    );
    return this.summaryService.getSummary(orgId, resolved);
  }
}
