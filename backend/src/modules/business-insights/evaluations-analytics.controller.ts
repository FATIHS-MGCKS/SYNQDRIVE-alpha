import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { EvaluationsAnalyticsSummaryService } from './evaluations-analytics-summary.service';
import { EvaluationsAnalyticsSummaryQueryDto } from './dto/evaluations-analytics-query.dto';

@ApiTags('Evaluations Analytics')
@Controller('organizations/:orgId/evaluations/analytics')
@UseGuards(OrgScopingGuard, RolesGuard)
export class EvaluationsAnalyticsController {
  constructor(private readonly summaryService: EvaluationsAnalyticsSummaryService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Canonical Auswertungen analytics summary',
    description:
      'Tenant-scoped executive KPIs, financial/receivables/booking/fleet sections, active risks, affected entities, strengths/weaknesses, and data-quality metadata. Partial source failures surface as section-level ERROR/PARTIAL/UNAVAILABLE without failing the entire payload.',
  })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiQuery({ name: 'stationId', required: false, description: 'Optional station filter (UUID)' })
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['mtd', 'last7d', 'last30d'],
    description: 'Comparison window (default: mtd)',
  })
  getAnalyticsSummary(
    @Param('orgId') orgId: string,
    @Query() query: EvaluationsAnalyticsSummaryQueryDto,
  ) {
    return this.summaryService.getSummary(orgId, {
      stationId: query.stationId ?? null,
      period: query.period,
    });
  }
}
