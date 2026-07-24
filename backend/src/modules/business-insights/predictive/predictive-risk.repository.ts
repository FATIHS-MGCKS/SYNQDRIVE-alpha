import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { mapRiskForecastRow } from '@shared/predictive/predictive-risk-forecast.mapper';

@Injectable()
export class PredictiveRiskRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createRun(
    organizationId: string,
    data: { featureSetVersion: string; asOfDate: string; trigger?: string },
  ) {
    return this.prisma.orgPredictiveRiskForecastRun.create({
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
    return this.prisma.orgPredictiveRiskForecastRun.update({
      where: { id: runId },
      data: {
        status: data.status,
        forecastsWritten: data.forecastsWritten,
        errorMessage: data.errorMessage ?? null,
        completedAt: new Date(),
      },
    });
  }

  async upsertForecast(data: Prisma.OrgPredictiveRiskForecastCreateInput) {
    const row = await this.prisma.orgPredictiveRiskForecast.upsert({
      where: {
        organizationId_riskKey_horizonDays_scopeKey_asOfDate: {
          organizationId: data.organization.connect!.id!,
          riskKey: data.riskKey,
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
        probabilityEstimate: data.probabilityEstimate,
        impactEstimate: data.impactEstimate,
        costP50Minor: data.costP50Minor,
        costP90Minor: data.costP90Minor,
        pointEstimate: data.pointEstimate,
        intervalLow: data.intervalLow,
        intervalHigh: data.intervalHigh,
        dataCoveragePercent: data.dataCoveragePercent,
        evaluationMetrics: data.evaluationMetrics ?? undefined,
        explainability: data.explainability ?? undefined,
        safetyBoundaries: data.safetyBoundaries ?? undefined,
        status: data.status,
        suppressedReason: data.suppressedReason,
        lineage: data.lineage ?? undefined,
        expiresAt: data.expiresAt,
        riskRun: data.riskRun,
        generatedAt: new Date(),
      },
    });
    return mapRiskForecastRow(row);
  }

  async listForecasts(
    organizationId: string,
    params: {
      riskKey?: string;
      horizonDays?: number;
      asOfDate?: string;
      scopeKey?: string;
    },
  ) {
    const rows = await this.prisma.orgPredictiveRiskForecast.findMany({
      where: {
        organizationId,
        ...(params.riskKey
          ? { riskKey: params.riskKey as 'MAINTENANCE_COST' | 'UNPLANNED_FAILURE' | 'EXPECTED_DOWNTIME' | 'CAPACITY_RISK' | 'COST_RISK' }
          : {}),
        ...(params.horizonDays ? { horizonDays: params.horizonDays } : {}),
        ...(params.asOfDate ? { asOfDate: params.asOfDate } : {}),
        ...(params.scopeKey ? { scopeKey: params.scopeKey } : {}),
      },
      orderBy: [{ asOfDate: 'desc' }, { riskKey: 'asc' }, { horizonDays: 'asc' }],
    });
    return rows.map(mapRiskForecastRow);
  }

  async getLatestRun(organizationId: string) {
    return this.prisma.orgPredictiveRiskForecastRun.findFirst({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
    });
  }
}
