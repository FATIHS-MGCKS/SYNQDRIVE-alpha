import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, parsePagination } from '@shared/utils/pagination';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import type { DashboardInsightDto } from './insight.types';
import type {
  InsightAnalyticsListQuery,
  InsightAnalyticsRow,
  InsightAnalyticsSummary,
} from '@synq/evaluations-insights/insights-analytics.contract';
import type { ResolvedEvaluationsAnalyticsFilters } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import {
  computeInsightAnalyticsSummaryCounts,
  estimateInsightFinancialExposureMinor,
  sortInsights,
} from '@synq/evaluations-insights/insights-analytics';
import {
  matchesDataQualityInsightFilter,
  matchesResolvedInsightFilters,
  toAppliedFilters,
} from '@synq/evaluations-insights/evaluations-analytics-filters';

@Injectable()
export class DashboardInsightsAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DashboardInsightsRepository,
  ) {}

  async getAnalyticsSummary(
    organizationId: string,
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<InsightAnalyticsSummary> {
    const runMeta = await this.repo.getRunMetadata(organizationId);
    const insights = await this.loadActiveInsightRows(organizationId);
    const filtered = this.filterInsights(insights, resolved, runMeta.stale);
    const legacyFilters = {
      category: resolved.riskCategory ?? undefined,
      severity: resolved.insightStatus ?? undefined,
      stationId: resolved.stationId,
      stationVehicleIds: resolved.stationVehicleIds,
      allowedStationIds: resolved.allowedStationIds,
    };
    const counts = computeInsightAnalyticsSummaryCounts(
      filtered,
      legacyFilters,
      organizationId,
    );
    const exposure = estimateInsightFinancialExposureMinor(filtered, legacyFilters);

    return {
      generatedAt: runMeta.lastRunAt,
      hasRun: runMeta.hasRun,
      lastRunAt: runMeta.lastRunAt,
      stale: runMeta.stale,
      error: runMeta.error,
      counts,
      estimatedFinancialExposureMinor: exposure.amountMinor,
      estimatedFinancialExposureCurrency: exposure.currency,
      appliedFilters: toAppliedFilters(resolved) as unknown as InsightAnalyticsSummary['appliedFilters'],
    };
  }

  async listAnalyticsInsights(
    organizationId: string,
    resolved: ResolvedEvaluationsAnalyticsFilters,
    query: Pick<InsightAnalyticsListQuery, 'page' | 'limit' | 'sortBy' | 'sortOrder'> = {},
  ) {
    const runMeta = await this.repo.getRunMetadata(organizationId);
    const insights = await this.loadActiveInsightRows(organizationId);
    const filtered = this.filterInsights(insights, resolved, runMeta.stale);
    const sorted = sortInsights(filtered, query.sortBy ?? 'priority', query.sortOrder ?? 'desc');
    const { skip, take } = parsePagination(query);
    const pageRows = sorted.slice(skip, skip + take);
    const dtos = await this.repo.mapRowsToInsightDtos(organizationId, pageRows.map((r) => r.id));

    return {
      ...buildPaginatedResult(dtos, filtered.length, query),
      appliedFilters: toAppliedFilters(resolved),
    };
  }

  async getAnalyticsInsightById(
    organizationId: string,
    insightId: string,
    resolved: ResolvedEvaluationsAnalyticsFilters,
  ): Promise<DashboardInsightDto | null> {
    const runMeta = await this.repo.getRunMetadata(organizationId);
    await this.repo.expireStaleInsights(organizationId);
    const row = await this.prisma.dashboardInsight.findFirst({
      where: { id: insightId, organizationId, isActive: true },
    });
    if (!row) return null;
    const analyticsRow = this.toAnalyticsRow(row, organizationId);
    if (!this.isInsightAccessible(analyticsRow, resolved, runMeta.stale)) return null;
    return this.repo.toPublicInsightDto(row, organizationId);
  }

  filterInsightRows(
    insights: InsightAnalyticsRow[],
    resolved: ResolvedEvaluationsAnalyticsFilters,
    insightStale: boolean,
  ): InsightAnalyticsRow[] {
    return this.filterInsights(insights, resolved, insightStale);
  }

  private isInsightAccessible(
    insight: InsightAnalyticsRow,
    resolved: ResolvedEvaluationsAnalyticsFilters,
    insightStale = false,
  ): boolean {
    return (
      matchesResolvedInsightFilters(insight, resolved) &&
      matchesDataQualityInsightFilter(insightStale, resolved.dataQualityStatus)
    );
  }

  private toAnalyticsRow(
    row: {
      id: string;
      type: string;
      severity: string;
      priority: number;
      entityScope: string;
      entityIds: unknown;
      isGrouped: boolean;
      groupCount: number;
      entityReferences: unknown;
      metrics: unknown;
      timeContext: unknown;
      createdAt: Date;
    },
    organizationId: string,
  ): InsightAnalyticsRow {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      priority: row.priority,
      entityScope: row.entityScope,
      entityIds: (row.entityIds as string[] | null) ?? null,
      isGrouped: row.isGrouped,
      groupCount: row.groupCount,
      organizationId,
      entityReferences: (row.entityReferences as InsightAnalyticsRow['entityReferences']) ?? null,
      metrics: (row.metrics as Record<string, unknown> | null) ?? null,
      timeContext: (row.timeContext as Record<string, string> | null) ?? null,
      createdAt: row.createdAt,
    };
  }

  private filterInsights(
    insights: InsightAnalyticsRow[],
    resolved: ResolvedEvaluationsAnalyticsFilters,
    insightStale: boolean,
  ): InsightAnalyticsRow[] {
    return insights.filter(
      (row) =>
        matchesResolvedInsightFilters(row, resolved) &&
        matchesDataQualityInsightFilter(insightStale, resolved.dataQualityStatus),
    );
  }

  private async loadActiveInsightRows(organizationId: string): Promise<InsightAnalyticsRow[]> {
    await this.repo.expireStaleInsights(organizationId);
    const rows = await this.prisma.dashboardInsight.findMany({
      where: { organizationId, isActive: true },
      select: {
        id: true,
        type: true,
        severity: true,
        priority: true,
        entityScope: true,
        entityIds: true,
        isGrouped: true,
        groupCount: true,
        entityReferences: true,
        metrics: true,
        timeContext: true,
        createdAt: true,
      },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    });

    return rows.map((row) => this.toAnalyticsRow(row, organizationId));
  }
}
