import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { FEATURE_SET_VERSION } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import {
  FORECAST_FEATURE_KEYS,
  FORECAST_HORIZONS_DAYS,
  type ForecastHorizonDays,
  type ForecastTarget,
} from '@synq/evaluations-insights/predictive/evaluations-forecast.contract';
import {
  buildForecastSeriesFromSnapshots,
  runBaselineForecast,
} from '@synq/evaluations-insights/predictive/evaluations-baseline-forecast';
import {
  runAllMaintenanceRiskForecasts,
  isUnplannedServiceCategory,
} from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk-forecast';
import type { RiskForecastHorizonDays } from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk.contract';
import { PredictiveFeatureRepository } from './predictive-feature.repository';
import { PredictiveForecastLoader } from './predictive-forecast.loader';
import { PredictiveRiskLoader } from './predictive-risk.loader';

@Injectable()
export class PredictiveBacktestLoader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly forecastLoader: PredictiveForecastLoader,
    private readonly riskLoader: PredictiveRiskLoader,
    private readonly featureRepository: PredictiveFeatureRepository,
  ) {}

  async loadOperationalSeries(organizationId: string, target: ForecastTarget, asOfDate: string) {
    return this.forecastLoader.loadSeriesForTarget(organizationId, target, asOfDate);
  }

  forecastTargets(): ForecastTarget[] {
    return this.forecastLoader.targets();
  }

  forecastHorizons(): ForecastHorizonDays[] {
    return [...FORECAST_HORIZONS_DAYS];
  }

  riskHorizons(): RiskForecastHorizonDays[] {
    return [30, 90];
  }

  async buildRiskRegressionFolds(
    organizationId: string,
    riskKey: 'MAINTENANCE_COST' | 'EXPECTED_DOWNTIME' | 'COST_RISK',
    horizonDays: RiskForecastHorizonDays,
    asOfDate: string,
    timezone: string,
    maxOrigins = 8,
  ) {
    const folds: Array<{
      originDate: string;
      predicted: number;
      actual: number;
      intervalLow: number;
      intervalHigh: number;
      baselinePredicted: number;
    }> = [];

    for (let i = 1; i <= maxOrigins; i += 1) {
      const originDate = this.shiftDate(asOfDate, -i * 7);
      try {
        const fleetInput = await this.riskLoader.loadFleetInput(
          organizationId,
          originDate,
          timezone,
          horizonDays,
        );
        const results = runAllMaintenanceRiskForecasts(fleetInput);
        const forecast = results.find((r) => r.riskKey === riskKey);
        if (!forecast || forecast.status === 'INSUFFICIENT_DATA') continue;

        const actual = await this.actualRiskValue(
          organizationId,
          riskKey,
          originDate,
          horizonDays,
        );
        if (actual == null) continue;

        const predicted =
          riskKey === 'MAINTENANCE_COST' || riskKey === 'COST_RISK'
            ? (forecast.costP50Minor ?? forecast.pointEstimate ?? 0)
            : (forecast.pointEstimate ?? forecast.impactEstimate ?? 0);

        const baselinePredicted = await this.baselineRiskValue(organizationId, riskKey, originDate, horizonDays);

        folds.push({
          originDate,
          predicted,
          actual,
          intervalLow: forecast.intervalLow ?? predicted * 0.7,
          intervalHigh: forecast.intervalHigh ?? predicted * 1.3,
          baselinePredicted,
        });
      } catch {
        continue;
      }
    }

    return folds;
  }

  async buildRiskClassificationFolds(
    organizationId: string,
    riskKey: 'UNPLANNED_FAILURE' | 'CAPACITY_RISK',
    horizonDays: RiskForecastHorizonDays,
    asOfDate: string,
    timezone: string,
    maxOrigins = 8,
  ) {
    const folds: Array<{
      originDate: string;
      predictedProbability: number;
      actualPositive: boolean;
    }> = [];

    for (let i = 1; i <= maxOrigins; i += 1) {
      const originDate = this.shiftDate(asOfDate, -i * 7);
      try {
        const fleetInput = await this.riskLoader.loadFleetInput(
          organizationId,
          originDate,
          timezone,
          horizonDays,
        );
        const results = runAllMaintenanceRiskForecasts(fleetInput);
        const forecast = results.find((r) => r.riskKey === riskKey);
        if (!forecast || forecast.status === 'INSUFFICIENT_DATA') continue;

        const predictedProbability = forecast.probabilityEstimate ?? 0;
        const actualPositive = await this.actualClassificationOutcome(
          organizationId,
          riskKey,
          originDate,
          horizonDays,
        );
        if (actualPositive == null) continue;

        folds.push({ originDate, predictedProbability, actualPositive });
      } catch {
        continue;
      }
    }

    return folds;
  }

  async buildDriftInputSignals(organizationId: string, target: ForecastTarget, asOfDate: string) {
    const featureKey = FORECAST_FEATURE_KEYS[target];
    const recentFrom = this.shiftDate(asOfDate, -28);
    const baselineFrom = this.shiftDate(asOfDate, -56);
    const baselineTo = this.shiftDate(asOfDate, -29);

    const [recentSnaps, baselineSnaps] = await Promise.all([
      this.featureRepository.listSnapshots(organizationId, {
        fromDate: recentFrom,
        toDate: asOfDate,
        featureSetVersion: FEATURE_SET_VERSION,
        scopeKey: 'fleet',
      }),
      this.featureRepository.listSnapshots(organizationId, {
        fromDate: baselineFrom,
        toDate: baselineTo,
        featureSetVersion: FEATURE_SET_VERSION,
        scopeKey: 'fleet',
      }),
    ]);

    const recentValues = recentSnaps
      .map((s) => s.features[featureKey]?.value)
      .filter((v): v is number => typeof v === 'number');
    const baselineValues = baselineSnaps
      .map((s) => s.features[featureKey]?.value)
      .filter((v): v is number => typeof v === 'number');

    const recentMean =
      recentValues.length > 0
        ? recentValues.reduce((a, b) => a + b, 0) / recentValues.length
        : 0;
    const baselineMean =
      baselineValues.length > 0
        ? baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length
        : 0;

    return [{ signal: featureKey, recentMean, baselineMean }];
  }

  async buildRecentForecastErrors(
    organizationId: string,
    target: ForecastTarget,
    asOfDate: string,
    timezone: string,
    weeks = 4,
  ) {
    const errors: Array<{ actual: number; predicted: number }> = [];
    const series = await this.loadOperationalSeries(organizationId, target, asOfDate);

    for (let w = 1; w <= weeks; w += 1) {
      const originDate = this.shiftDate(asOfDate, -w * 7);
      const horizonDays = 7 as ForecastHorizonDays;
      const trainSeries = series.filter((p) => p.date <= originDate);
      if (trainSeries.length < 30) continue;

      const horizonEnd = this.shiftDate(originDate, horizonDays);
      const actualPoints = series.filter((p) => p.date > originDate && p.date <= horizonEnd);
      if (actualPoints.length === 0) continue;

      const forecast = runBaselineForecast({
        target,
        horizonDays,
        series: trainSeries,
        asOfDate: originDate,
        timezone,
      });
      if (forecast.status === 'INSUFFICIENT_HISTORY') continue;

      const actual =
        target === 'UTILIZATION'
          ? actualPoints.reduce((a, p) => a + p.value, 0) / actualPoints.length
          : actualPoints.reduce((a, p) => a + p.value, 0);

      errors.push({ actual, predicted: forecast.pointEstimate });
    }

    return errors;
  }

  private async actualRiskValue(
    organizationId: string,
    riskKey: 'MAINTENANCE_COST' | 'EXPECTED_DOWNTIME' | 'COST_RISK',
    originDate: string,
    horizonDays: number,
  ): Promise<number | null> {
    const horizonEnd = this.shiftDate(originDate, horizonDays);
    const snapshots = await this.featureRepository.listSnapshots(organizationId, {
      fromDate: this.shiftDate(originDate, 1),
      toDate: horizonEnd,
      featureSetVersion: FEATURE_SET_VERSION,
      scopeKey: 'fleet',
    });

    if (snapshots.length === 0) return null;

    if (riskKey === 'EXPECTED_DOWNTIME') {
      const series = buildForecastSeriesFromSnapshots(
        snapshots.map((s) => ({
          observationDate: s.observationDate,
          value:
            typeof s.features['downtime.minutes']?.value === 'number'
              ? (s.features['downtime.minutes'].value as number)
              : null,
        })),
      );
      return series.reduce((a, p) => a + p.value, 0);
    }

    const costSeries = buildForecastSeriesFromSnapshots(
      snapshots.map((s) => ({
        observationDate: s.observationDate,
        value:
          typeof s.features['maintenance.cost_minor']?.value === 'number'
            ? (s.features['maintenance.cost_minor'].value as number)
            : null,
      })),
    );
    return costSeries.reduce((a, p) => a + p.value, 0);
  }

  private async baselineRiskValue(
    organizationId: string,
    riskKey: 'MAINTENANCE_COST' | 'EXPECTED_DOWNTIME' | 'COST_RISK',
    originDate: string,
    horizonDays: number,
  ): Promise<number> {
    const lookbackStart = this.shiftDate(originDate, -90);
    const snapshots = await this.featureRepository.listSnapshots(organizationId, {
      fromDate: lookbackStart,
      toDate: originDate,
      featureSetVersion: FEATURE_SET_VERSION,
      scopeKey: 'fleet',
    });

    const key =
      riskKey === 'EXPECTED_DOWNTIME' ? 'downtime.minutes' : 'maintenance.cost_minor';
    const series = buildForecastSeriesFromSnapshots(
      snapshots.map((s) => ({
        observationDate: s.observationDate,
        value: typeof s.features[key]?.value === 'number' ? (s.features[key].value as number) : null,
      })),
    );
    if (series.length === 0) return 0;
    const dailyAvg = series.reduce((a, p) => a + p.value, 0) / series.length;
    return Math.round(dailyAvg * horizonDays);
  }

  private async actualClassificationOutcome(
    organizationId: string,
    riskKey: 'UNPLANNED_FAILURE' | 'CAPACITY_RISK',
    originDate: string,
    horizonDays: number,
  ): Promise<boolean | null> {
    const horizonEnd = this.shiftDate(originDate, horizonDays);
    const originEnd = new Date(`${originDate}T23:59:59.999Z`);
    const horizonEndDate = new Date(`${horizonEnd}T23:59:59.999Z`);

    const casesInHorizon = await this.prisma.serviceCase.findMany({
      where: {
        organizationId,
        openedAt: { gt: originEnd, lte: horizonEndDate },
      },
      select: { category: true, blocksRental: true },
    });

    if (riskKey === 'UNPLANNED_FAILURE') {
      return casesInHorizon.some((sc) => isUnplannedServiceCategory(sc.category));
    }

    const blockedCases = casesInHorizon.filter((sc) => sc.blocksRental).length;
    return blockedCases >= 1;
  }

  private shiftDate(dateOnly: string, offset: number): string {
    const [y, m, d] = dateOnly.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
  }
}
