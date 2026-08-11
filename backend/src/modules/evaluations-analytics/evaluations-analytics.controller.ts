import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import {
  EVALUATIONS_PERIOD_TYPES,
  type EvaluationsPeriodType,
} from '@synq/evaluations-periods/evaluations-period.contract';
import {
  normalizeEvaluationsAnalyticsFilters,
  normalizeEvaluationsAnalyticsGroupLimit,
  normalizeEvaluationsRequestedStationIds,
  assertValidEvaluationsAnalyticsGroupDimension,
  EvaluationsAnalyticsValidationError,
} from '@synq/evaluations-analytics/evaluations-analytics.validator';
import type {
  EvaluationsAnalyticsDetailResponse,
  EvaluationsAnalyticsGroupDimension,
  EvaluationsAnalyticsSummaryResponse,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { EVALUATIONS_MODULE } from './evaluations-analytics.constants';
import { EvaluationsAnalyticsFeatureGuard } from './evaluations-analytics-feature.guard';
import {
  EvaluationsAnalyticsScopeService,
  type EvaluationsAnalyticsActor,
} from './evaluations-analytics-scope.service';
import { EvaluationsAnalyticsService } from './evaluations-analytics.service';

function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((v) => String(v).trim()).filter((v) => v.length > 0);
}

function toOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new BadRequestException('Invalid numeric query parameter');
  }
  return parsed;
}

function resolvePeriodType(value: unknown): EvaluationsPeriodType {
  const raw = value === undefined || value === null ? 'MTD' : String(value);
  if (!(EVALUATIONS_PERIOD_TYPES as readonly string[]).includes(raw)) {
    throw new BadRequestException(`Unsupported periodType: ${raw}`);
  }
  return raw as EvaluationsPeriodType;
}

/**
 * Tenant-safe analytics foundation API. Organization scope is enforced by
 * OrgScopingGuard + repository scoping; station scope by the scope service;
 * the module permission by PermissionsGuard. The feature ships dark
 * (`EVALUATIONS_ANALYTICS_V2_MODE=off` → 404).
 */
@Controller('organizations/:orgId/evaluations/analytics')
@UseGuards(
  OrgScopingGuard,
  RolesGuard,
  PermissionsGuard,
  EvaluationsAnalyticsFeatureGuard,
)
export class EvaluationsAnalyticsController {
  constructor(
    private readonly scopeService: EvaluationsAnalyticsScopeService,
    private readonly analytics: EvaluationsAnalyticsService,
  ) {}

  private buildFilters(query: Record<string, unknown>) {
    return normalizeEvaluationsAnalyticsFilters({
      vehicleIds: toStringArray(query.vehicleIds),
      customerIds: toStringArray(query.customerIds),
      entityTypes: toStringArray(query.entityTypes),
      relationTypes: toStringArray(query.relationTypes),
    });
  }

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
  ): Promise<EvaluationsAnalyticsSummaryResponse> {
    try {
      const filters = this.buildFilters(query);
      let groupBy: EvaluationsAnalyticsGroupDimension | null = null;
      if (query.groupBy !== undefined && query.groupBy !== null && query.groupBy !== '') {
        assertValidEvaluationsAnalyticsGroupDimension(query.groupBy);
        groupBy = query.groupBy;
      }
      const groupLimit = normalizeEvaluationsAnalyticsGroupLimit(query.groupLimit);
      const scope = await this.resolveScope(actor, orgId, query);
      return await this.analytics.getSummary({
        scope,
        filters,
        groupBy,
        groupLimit,
      });
    } catch (error) {
      if (error instanceof EvaluationsAnalyticsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get('detail')
  @RequirePermission(EVALUATIONS_MODULE, 'read')
  async detail(
    @CurrentUser() actor: EvaluationsAnalyticsActor,
    @Param('orgId') orgId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<EvaluationsAnalyticsDetailResponse> {
    try {
      const filters = this.buildFilters(query);
      const scope = await this.resolveScope(actor, orgId, query);
      return await this.analytics.getDetail({
        scope,
        filters,
        page: {
          page: toOptionalInt(query.page),
          pageSize: toOptionalInt(query.pageSize),
          sortBy: query.sortBy as never,
          sortDir: query.sortDir as never,
        },
      });
    } catch (error) {
      if (error instanceof EvaluationsAnalyticsValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
