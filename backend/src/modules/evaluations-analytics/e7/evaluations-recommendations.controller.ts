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
import { EvaluationsRecommendationsService } from './evaluations-recommendations.service';

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

@Controller('organizations/:orgId/evaluations/analytics/insights')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard, EvaluationsAnalyticsFeatureGuard)
export class EvaluationsRecommendationsController {
  constructor(
    private readonly scopeService: EvaluationsAnalyticsScopeService,
    private readonly recommendationsService: EvaluationsRecommendationsService,
  ) {}

  @Get('recommendations')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async getRecommendations(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ) {
    const periodType = resolvePeriodType(query.periodType);
    const requestedStationIds = normalizeEvaluationsRequestedStationIds(
      toStringArray(query.stationIds) ?? null,
    );
    const scope = await this.scopeService.resolveAuthorizedScope({
      actor,
      orgId,
      requestedStationIds,
      periodType,
    });
    return this.recommendationsService.getRecommendations(scope, actor);
  }
}
