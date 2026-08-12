import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  EVALUATIONS_PERIOD_TYPES,
  type EvaluationsPeriodType,
} from '@synq/evaluations-periods/evaluations-period.contract';
import { normalizeEvaluationsRequestedStationIds } from '@synq/evaluations-analytics/evaluations-analytics.validator';
import { EVALUATIONS_MODULE } from '../evaluations-analytics.constants';
import { EvaluationsAnalyticsFeatureGuard } from '../evaluations-analytics-feature.guard';
import {
  EvaluationsAnalyticsScopeService,
  type EvaluationsAnalyticsActor,
} from '../evaluations-analytics-scope.service';
import { EvaluationsInsightsService } from './evaluations-insights.service';

function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((v) => String(v).trim()).filter((v) => v.length > 0);
}

function resolvePeriodType(value: unknown): EvaluationsPeriodType {
  const raw = value === undefined || value === null ? 'MTD' : String(value);
  if (!(EVALUATIONS_PERIOD_TYPES as readonly string[]).includes(raw)) {
    throw new BadRequestException(`Unsupported periodType: ${raw}`);
  }
  return raw as EvaluationsPeriodType;
}

/**
 * E4 tenant-safe analytics backend. Lives under the SAME evaluations analytics
 * namespace as the E2 foundation (no competing `/analytics-v2` API) and reuses
 * the same guards, feature flag, permission, and E2 scope authority. Every
 * capability delegates scope to `resolveAuthorizedScope` (requested scope may
 * narrow but never widen) and period/timezone to E1.
 */
@Controller('organizations/:orgId/evaluations/analytics/insights')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard, EvaluationsAnalyticsFeatureGuard)
export class EvaluationsInsightsController {
  constructor(
    private readonly scopeService: EvaluationsAnalyticsScopeService,
    private readonly insights: EvaluationsInsightsService,
  ) {}

  private async resolveScope(
    actor: EvaluationsAnalyticsActor,
    orgId: string,
    query: Record<string, unknown>,
  ) {
    const periodType = resolvePeriodType(query.periodType);
    const requestedStationIds = normalizeEvaluationsRequestedStationIds(
      toStringArray(query.stationIds) ?? null,
    );
    return this.scopeService.resolveAuthorizedScope({
      actor,
      orgId,
      requestedStationIds,
      periodType,
    });
  }

  @Get('summary')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async summary(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const scope = await this.resolveScope(actor, orgId, query);
    return this.insights.getSummary(scope, actor);
  }

  @Get('cost-model')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async costModel(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const scope = await this.resolveScope(actor, orgId, query);
    return this.insights.getCostModel(scope, new Date());
  }

  @Get('utilization')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async utilization(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const scope = await this.resolveScope(actor, orgId, query);
    return this.insights.getUtilization(scope, new Date());
  }

  @Get('strengths')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async strengths(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const scope = await this.resolveScope(actor, orgId, query);
    return this.insights.getStrengths(scope, actor);
  }

  @Get('weaknesses')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async weaknesses(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const scope = await this.resolveScope(actor, orgId, query);
    return this.insights.getWeaknesses(scope, actor);
  }

  @Get('driver-analysis')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async driverAnalysis(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const scope = await this.resolveScope(actor, orgId, query);
    return this.insights.getDriverInfluence(scope, actor, new Date());
  }
}
