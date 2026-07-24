import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { buildPaginatedResult, parsePagination } from '@shared/utils/pagination';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import type { DashboardInsightDto } from './insight.types';
import type {
  InsightAnalyticsFilters,
  InsightAnalyticsListQuery,
  InsightAnalyticsRow,
  InsightAnalyticsSummary,
} from '@synq/evaluations-insights/insights-analytics.contract';
import {
  computeInsightAnalyticsSummaryCounts,
  estimateInsightFinancialExposureMinor,
  matchesInsightAnalyticsFilters,
  sortInsights,
} from '@synq/evaluations-insights/insights-analytics';

@Injectable()
export class DashboardInsightsAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: DashboardInsightsRepository,
  ) {}

  async getAnalyticsSummary(
    organizationId: string,
    filters: InsightAnalyticsFilters = {},
  ): Promise<InsightAnalyticsSummary> {
    const runMeta = await this.repo.getRunMetadata(organizationId);
    const resolvedFilters = await this.resolveFilters(organizationId, filters);
    const insights = await this.loadActiveInsightRows(organizationId);
    const counts = computeInsightAnalyticsSummaryCounts(insights, resolvedFilters, organizationId);
    const exposure = estimateInsightFinancialExposureMinor(insights, resolvedFilters);

    return {
      generatedAt: runMeta.lastRunAt,
      hasRun: runMeta.hasRun,
      lastRunAt: runMeta.lastRunAt,
      stale: runMeta.stale,
      error: runMeta.error,
      counts,
      estimatedFinancialExposureMinor: exposure.amountMinor,
      estimatedFinancialExposureCurrency: exposure.currency,
      appliedFilters: this.serializeFilters(resolvedFilters),
    };
  }

  async listAnalyticsInsights(
    organizationId: string,
    query: InsightAnalyticsListQuery = {},
  ) {
    const resolvedFilters = await this.resolveFilters(organizationId, query);
    const insights = await this.loadActiveInsightRows(organizationId);
    const filtered = insights.filter((row) => matchesInsightAnalyticsFilters(row, resolvedFilters));
    const sorted = sortInsights(filtered, query.sortBy ?? 'priority', query.sortOrder ?? 'desc');
    const { skip, take } = parsePagination(query);
    const pageRows = sorted.slice(skip, skip + take);
    const dtos = await this.repo.mapRowsToInsightDtos(organizationId, pageRows.map((r) => r.id));

    return {
      ...buildPaginatedResult(dtos, filtered.length, query),
      appliedFilters: this.serializeFilters(resolvedFilters),
    };
  }

  async getAnalyticsInsightById(
    organizationId: string,
    insightId: string,
  ): Promise<DashboardInsightDto | null> {
    await this.repo.expireStaleInsights(organizationId);
    const row = await this.prisma.dashboardInsight.findFirst({
      where: { id: insightId, organizationId, isActive: true },
    });
    if (!row) return null;
    return this.repo.toPublicInsightDto(row, organizationId);
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

    return rows.map((row) => ({
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
    }));
  }

  private async resolveFilters(
    organizationId: string,
    filters: InsightAnalyticsFilters,
  ): Promise<InsightAnalyticsFilters> {
    if (!filters.stationId) {
      return { ...filters, stationVehicleIds: null };
    }
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        OR: [
          { homeStationId: filters.stationId },
          { currentStationId: filters.stationId },
        ],
      },
      select: { id: true },
    });
    return {
      ...filters,
      stationVehicleIds: new Set(vehicles.map((v) => v.id)),
    };
  }

  private serializeFilters(filters: InsightAnalyticsFilters): InsightAnalyticsFilters {
    return {
      category: filters.category,
      severity: filters.severity,
      stationId: filters.stationId ?? null,
    };
  }
}
