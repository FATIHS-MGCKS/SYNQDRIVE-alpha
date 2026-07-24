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
import { EvaluationsAnalyticsSummaryResponseDto, EvaluationsDataQualityModelResponseDto, EvaluationsDriverAnalysisResponseDto, EvaluationsLineageResponseDto, EvaluationsStrengthDetectionResponseDto, EvaluationsWeaknessDetectionResponseDto } from './dto/evaluations-analytics-response.dto';
import { resolveLineageAudience } from '@synq/evaluations-insights/evaluations-lineage.contract';

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
    @Req() req: { user?: { id?: string; membershipRole?: string; platformRole?: string } },
  ) {
    const resolved = await this.filterService.resolve(
      orgId,
      req.user?.id,
      normalizeAnalyticsFilterQuery(query),
      { allowDataQualitySectionFilters: true },
    );
    const audience = resolveLineageAudience(req.user?.membershipRole, req.user?.platformRole);
    return this.summaryService.getSummary(orgId, resolved, { audience });
  }

  @Get('strengths')
  @ApiOperation({
    summary: 'Rule-based organizational strength detection for Auswertungen',
    description:
      'Detects traceable Unternehmensstärken from KPIs vs historical period, org targets, and peer stations. Same filter contract as summary.',
  })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiOkResponse({ type: EvaluationsStrengthDetectionResponseDto })
  async getStrengthDetection(
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
    return this.summaryService.getStrengthDetection(orgId, resolved);
  }

  @Get('weaknesses')
  @ApiOperation({
    summary: 'Rule-based organizational weakness detection for Auswertungen',
    description:
      'Detects traceable Unternehmensschwächen and improvement potentials with severity, deduplication, and financial impact labeling.',
  })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiOkResponse({ type: EvaluationsWeaknessDetectionResponseDto })
  async getWeaknessDetection(
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
    return this.summaryService.getWeaknessDetection(orgId, resolved);
  }

  @Get('driver-analysis')
  @ApiOperation({
    summary: 'Data-based driver analysis for strengths, weaknesses, and risks',
    description:
      'Transparent Ursachen- und Einflussanalyse — correlation is not causation. Same filter contract as summary.',
  })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiOkResponse({ type: EvaluationsDriverAnalysisResponseDto })
  async getDriverAnalysis(
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
    return this.summaryService.getDriverAnalysis(orgId, resolved);
  }

  @Get('data-quality')
  @ApiOperation({
    summary: 'Unified data quality model for Auswertungen analytics',
    description:
      'Per-source and per-metric assessments across completeness, freshness, validity, consistency, uniqueness, and coverage. Distinguishes NOT_CONNECTED from MISSING data. Same filter contract as summary.',
  })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiOkResponse({ type: EvaluationsDataQualityModelResponseDto })
  async getDataQuality(
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
    return this.summaryService.getDataQuality(orgId, resolved);
  }

  @Get('lineage')
  @ApiOperation({
    summary: 'Data lineage and freshness metadata for Auswertungen analytics',
    description:
      'Provenance per metric: sources, record bounds, import/job timestamps, exclusions, coverage, freshness. Admin roles receive additional diagnostics. Same filter contract as summary.',
  })
  @ApiParam({ name: 'orgId', description: 'Organization ID' })
  @ApiOkResponse({ type: EvaluationsLineageResponseDto })
  async getLineage(
    @Param('orgId') orgId: string,
    @Query() query: EvaluationsAnalyticsSummaryQueryDto,
    @Req() req: { user?: { id?: string; membershipRole?: string; platformRole?: string } },
  ) {
    const resolved = await this.filterService.resolve(
      orgId,
      req.user?.id,
      normalizeAnalyticsFilterQuery(query),
      { allowDataQualitySectionFilters: true },
    );
    const audience = resolveLineageAudience(req.user?.membershipRole, req.user?.platformRole);
    return this.summaryService.getLineage(orgId, resolved, audience);
  }
}
