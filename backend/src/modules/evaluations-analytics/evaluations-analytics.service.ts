import { Injectable } from '@nestjs/common';
import {
  EVALUATIONS_ANALYTICS_CONTRACT_SCHEMA_VERSION,
  type EvaluationsAnalyticsDetailResponse,
  type EvaluationsAnalyticsFilters,
  type EvaluationsAnalyticsGroup,
  type EvaluationsAnalyticsGroupDimension,
  type EvaluationsAnalyticsPageRequest,
  type EvaluationsAnalyticsSummaryResponse,
  type EvaluationsAuthorizedAnalyticsScope,
} from '@synq/evaluations-analytics/evaluations-analytics.contract';
import { normalizeEvaluationsAnalyticsPage } from '@synq/evaluations-analytics/evaluations-analytics.validator';
import {
  EVALUATIONS_ANALYTICS_DEFAULT_GROUP_LIMIT,
  EVALUATIONS_ANALYTICS_MAX_GROUP_LIMIT,
} from './evaluations-analytics.constants';
import { EvaluationsEntityReferenceRepository } from './evaluations-entity-reference.repository';

export interface EvaluationsAnalyticsSummaryQuery {
  readonly scope: EvaluationsAuthorizedAnalyticsScope;
  readonly filters: EvaluationsAnalyticsFilters;
  readonly groupBy: EvaluationsAnalyticsGroupDimension | null;
  readonly groupLimit?: number;
}

export interface EvaluationsAnalyticsDetailQuery {
  readonly scope: EvaluationsAuthorizedAnalyticsScope;
  readonly filters: EvaluationsAnalyticsFilters;
  readonly page?: EvaluationsAnalyticsPageRequest;
}

/**
 * Tenant-safe analytics foundation service. It reconciles summary and detail
 * over the SAME scope + filters and keeps the aggregate total strictly separate
 * from any top-N groups or paginated items. It performs NO finance/utilization
 * business computation (deferred to later packages).
 */
@Injectable()
export class EvaluationsAnalyticsService {
  constructor(private readonly references: EvaluationsEntityReferenceRepository) {}

  private scopeEcho(scope: EvaluationsAuthorizedAnalyticsScope) {
    return {
      organizationId: scope.organizationId,
      stationIds: scope.stationIds,
      stationScoped: scope.stationScoped,
    };
  }

  private periodBounds(scope: EvaluationsAuthorizedAnalyticsScope) {
    return { start: scope.period.start, endExclusive: scope.period.endExclusive };
  }

  async getSummary(
    query: EvaluationsAnalyticsSummaryQuery,
  ): Promise<EvaluationsAnalyticsSummaryResponse> {
    const { scope, filters, groupBy } = query;
    const period = this.periodBounds(scope);
    const groupLimit = Math.min(
      Math.max(1, query.groupLimit ?? EVALUATIONS_ANALYTICS_DEFAULT_GROUP_LIMIT),
      EVALUATIONS_ANALYTICS_MAX_GROUP_LIMIT,
    );

    const aggregateTotal = await this.references.countInScope(scope, filters, period);

    let groups: EvaluationsAnalyticsGroup[] = [];
    if (groupBy !== null) {
      const rows = await this.references.groupInScope(
        scope,
        filters,
        period,
        groupBy,
        groupLimit,
      );
      groups = rows.map((row) => ({ groupBy, key: row.key, count: row.count }));
    }

    return {
      schemaVersion: EVALUATIONS_ANALYTICS_CONTRACT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: 'AVAILABLE',
      scope: this.scopeEcho(scope),
      period: scope.period,
      appliedFilters: { ...filters },
      aggregateTotal,
      groupBy,
      groups,
      groupLimit,
    };
  }

  async getDetail(
    query: EvaluationsAnalyticsDetailQuery,
  ): Promise<EvaluationsAnalyticsDetailResponse> {
    const { scope, filters } = query;
    const period = this.periodBounds(scope);
    const page = normalizeEvaluationsAnalyticsPage(query.page);

    const totalCount = await this.references.countInScope(scope, filters, period);
    const rows = await this.references.listInScope(scope, filters, period, page);
    const returnedCount = rows.length;

    return {
      schemaVersion: EVALUATIONS_ANALYTICS_CONTRACT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      status: 'AVAILABLE',
      scope: this.scopeEcho(scope),
      period: scope.period,
      appliedFilters: { ...filters },
      totalCount,
      returnedCount,
      page: page.page,
      pageSize: page.pageSize,
      hasMore: page.skip + returnedCount < totalCount,
      items: rows.map((row) => ({
        reference: row.reference,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
