import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { mapForecastRow } from '@shared/predictive/predictive-forecast.mapper';

@Injectable()
export class PredictiveForecastRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(
    organizationId: string,
    data: { featureSetVersion: string; asOfDate: string; trigger?: string },
  ) {
    return this.prisma.orgPredictiveForecastRun.create({
      data: {
        organizationId,
        featureSetVersion: data.featureSetVersion,
        asOfDate: data.asOfDate,
        status: 'PARTIAL',
        trigger: data.trigger ?? null,
      },
    });
  }

  async completeRun(
    runId: string,
    data: {
      status: 'COMPLETED' | 'PARTIAL' | 'FAILED';
      forecastsWritten: number;
      errorMessage?: string;
    },
  ) {
    return this.prisma.orgPredictiveForecastRun.update({
      where: { id: runId },
      data: {
        status: data.status,
        forecastsWritten: data.forecastsWritten,
        errorMessage: data.errorMessage ?? null,
        completedAt: new Date(),
      },
    });
  }

  async upsertForecast(data: Prisma.OrgPredictiveForecastCreateInput) {
    const row = await this.prisma.orgPredictiveForecast.upsert({
      where: {
        organizationId_forecastKey_horizonDays_scopeKey_asOfDate: {
          organizationId: data.organization.connect!.id!,
          forecastKey: data.forecastKey,
          horizonDays: data.horizonDays,
          scopeKey: data.scopeKey ?? 'fleet',
          asOfDate: data.asOfDate,
        },
      },
      create: data,
      update: {
        modelVersion: data.modelVersion,
        featureSetVersion: data.featureSetVersion,
        inferenceTier: data.inferenceTier,
        timezone: data.timezone,
        currency: data.currency,
        unit: data.unit,
        horizonStartDate: data.horizonStartDate,
        horizonEndDate: data.horizonEndDate,
        pointEstimate: data.pointEstimate,
        intervalLow: data.intervalLow,
        intervalHigh: data.intervalHigh,
        trainingWindowStart: data.trainingWindowStart,
        trainingWindowEnd: data.trainingWindowEnd,
        dataCoveragePercent: data.dataCoveragePercent,
        evaluationMetrics: data.evaluationMetrics ?? undefined,
        explainability: data.explainability ?? undefined,
        status: data.status,
        suppressedReason: data.suppressedReason,
        lineage: data.lineage ?? undefined,
        expiresAt: data.expiresAt,
        forecastRun: data.forecastRun,
        generatedAt: new Date(),
      },
    });
    return mapForecastRow(row);
  }

  async listForecasts(
    organizationId: string,
    params: {
      forecastKey?: string;
      horizonDays?: number;
      asOfDate?: string;
      scopeKey?: string;
    },
  ) {
    const rows = await this.prisma.orgPredictiveForecast.findMany({
      where: {
        organizationId,
        ...(params.forecastKey ? { forecastKey: params.forecastKey as 'DEMAND' | 'REVENUE' | 'UTILIZATION' } : {}),
        ...(params.horizonDays ? { horizonDays: params.horizonDays } : {}),
        ...(params.asOfDate ? { asOfDate: params.asOfDate } : {}),
        ...(params.scopeKey ? { scopeKey: params.scopeKey } : {}),
      },
      orderBy: [{ asOfDate: 'desc' }, { forecastKey: 'asc' }, { horizonDays: 'asc' }],
    });
    return rows.map(mapForecastRow);
  }

  async getLatestRun(organizationId: string) {
    return this.prisma.orgPredictiveForecastRun.findFirst({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
    });
  }
}
