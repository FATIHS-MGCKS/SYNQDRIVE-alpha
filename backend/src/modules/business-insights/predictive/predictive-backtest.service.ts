import { Injectable, Logger } from '@nestjs/common';
import { FEATURE_SET_VERSION } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import {
  runOperationalForecastBacktest,
  runRiskClassificationBacktest,
  runRiskRegressionBacktest,
} from '@synq/evaluations-insights/predictive/evaluations-backtest';
import {
  FORECAST_BACKTEST_TARGETS,
  RISK_CLASSIFICATION_TARGETS,
  RISK_REGRESSION_TARGETS,
} from '@synq/evaluations-insights/predictive/evaluations-backtest.contract';
import {
  applyDriftToRegistryStatus,
  evaluateDrift,
} from '@synq/evaluations-insights/predictive/evaluations-drift-monitor';
import {
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@synq/evaluations-insights/predictive/evaluations-feature-time';
import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveBacktestLoader } from './predictive-backtest.loader';
import { PredictiveBacktestRepository } from './predictive-backtest.repository';

export type RunBacktestInput = {
  organizationId: string;
  asOfDate?: string;
  timezone?: string;
  trigger?: string;
};

@Injectable()
export class PredictiveBacktestService {
  private readonly logger = new Logger(PredictiveBacktestService.name);

  constructor(
    private readonly featureLoader: PredictiveFeatureLoader,
    private readonly loader: PredictiveBacktestLoader,
    private readonly repository: PredictiveBacktestRepository,
  ) {}

  async listResults(
    organizationId: string,
    query: { modelKey?: string; horizonDays?: number; limit?: number },
  ) {
    return this.repository.listResults(organizationId, query);
  }

  async listRegistry(
    organizationId: string,
    query?: { modelKey?: string; status?: string },
  ) {
    return this.repository.listRegistry(organizationId, query);
  }

  async listDriftSnapshots(
    organizationId: string,
    query?: { modelKey?: string; limit?: number },
  ) {
    return this.repository.listDriftSnapshots(organizationId, query);
  }

  async getLatestRun(organizationId: string) {
    return this.repository.getLatestBacktestRun(organizationId);
  }

  async runBacktests(input: RunBacktestInput) {
    const timezone =
      input.timezone ?? (await this.featureLoader.loadOrganizationTimezone(input.organizationId));
    const asOfDate = input.asOfDate ?? this.yesterdayInTimezone(timezone);

    const run = await this.repository.createRun(input.organizationId, {
      modelFamily: 'ALL',
      featureSetVersion: FEATURE_SET_VERSION,
      asOfDate,
      trigger: input.trigger ?? 'api',
    });

    let modelsEvaluated = 0;
    let resultsWritten = 0;

    try {
      for (const target of FORECAST_BACKTEST_TARGETS) {
        for (const horizonDays of this.loader.forecastHorizons()) {
          const series = await this.loader.loadOperationalSeries(
            input.organizationId,
            target,
            asOfDate,
          );
          const evaluation = runOperationalForecastBacktest({
            target,
            horizonDays,
            series,
            timezone,
          });
          modelsEvaluated += 1;
          if (evaluation.status !== 'INSUFFICIENT_DATA' || evaluation.foldRecords.length > 0) {
            await this.repository.upsertResult(input.organizationId, run.id, evaluation);
            await this.repository.upsertModelRegistry(input.organizationId, evaluation);
            resultsWritten += 1;
          }
        }
      }

      for (const riskKey of RISK_REGRESSION_TARGETS) {
        for (const horizonDays of this.loader.riskHorizons()) {
          const folds = await this.loader.buildRiskRegressionFolds(
            input.organizationId,
            riskKey,
            horizonDays,
            asOfDate,
            timezone,
          );
          const evaluation = runRiskRegressionBacktest({
            riskKey,
            horizonDays,
            folds,
          });
          modelsEvaluated += 1;
          if (evaluation.status !== 'INSUFFICIENT_DATA') {
            await this.repository.upsertResult(input.organizationId, run.id, evaluation);
            await this.repository.upsertModelRegistry(input.organizationId, evaluation);
            resultsWritten += 1;
          }
        }
      }

      for (const riskKey of RISK_CLASSIFICATION_TARGETS) {
        for (const horizonDays of this.loader.riskHorizons()) {
          const folds = await this.loader.buildRiskClassificationFolds(
            input.organizationId,
            riskKey,
            horizonDays,
            asOfDate,
            timezone,
          );
          const evaluation = runRiskClassificationBacktest({
            riskKey,
            horizonDays,
            folds,
          });
          modelsEvaluated += 1;
          if (evaluation.status !== 'INSUFFICIENT_DATA') {
            await this.repository.upsertResult(input.organizationId, run.id, evaluation);
            await this.repository.upsertModelRegistry(input.organizationId, evaluation);
            resultsWritten += 1;
          }
        }
      }

      await this.repository.completeRun(run.id, {
        status: 'COMPLETED',
        modelsEvaluated,
        resultsWritten,
      });

      return {
        backtestRunId: run.id,
        asOfDate,
        timezone,
        modelsEvaluated,
        resultsWritten,
        trigger: input.trigger ?? 'api',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backtest run failed';
      this.logger.error(`Backtest failed for org ${input.organizationId}: ${message}`);
      await this.repository.completeRun(run.id, {
        status: 'FAILED',
        modelsEvaluated,
        resultsWritten,
        errorMessage: message,
      });
      throw error;
    }
  }

  async runDriftCheck(input: RunBacktestInput) {
    const timezone =
      input.timezone ?? (await this.featureLoader.loadOrganizationTimezone(input.organizationId));
    const asOfDate = input.asOfDate ?? this.yesterdayInTimezone(timezone);
    const snapshots = [];

    for (const target of FORECAST_BACKTEST_TARGETS) {
      const registry = await this.repository.getRegistryEntry(
        input.organizationId,
        target,
        7,
      );
      if (!registry) continue;

      const backtestMetrics = registry.backtestMetrics as {
        mae?: number;
        smape?: number;
      } | null;

      const recentErrors = await this.loader.buildRecentForecastErrors(
        input.organizationId,
        target,
        asOfDate,
        timezone,
      );
      const inputSignals = await this.loader.buildDriftInputSignals(
        input.organizationId,
        target,
        asOfDate,
      );

      const drift = evaluateDrift({
        modelFamily: 'FORECAST',
        modelKey: target,
        backtestMetrics:
          backtestMetrics && backtestMetrics.mae != null
            ? {
                foldCount: 4,
                observationCount: 4,
                mae: backtestMetrics.mae ?? null,
                rmse: null,
                mape: null,
                smape: backtestMetrics.smape ?? null,
                bias: null,
                biasPercent: null,
                predictionIntervalCoverage: null,
                calibrationError: null,
                baselineMae: null,
                baselineRmse: null,
                baselineSmape: null,
                beatBaselineByPercent: null,
              }
            : null,
        recentErrors,
        inputSignals,
      });

      await this.repository.saveDriftSnapshot(input.organizationId, drift);
      const nextStatus = applyDriftToRegistryStatus(registry.status, drift);
      if (nextStatus !== registry.status) {
        await this.repository.updateRegistryStatus(
          input.organizationId,
          target,
          registry.modelVersion,
          7,
          nextStatus,
          {
            driftSeverity: drift.severity,
            ...(nextStatus === 'DISABLED' ? { disabledAt: new Date() } : {}),
          },
        );
      }

      snapshots.push({
        modelKey: target,
        severity: drift.severity,
        recommendedAction: drift.recommendedAction,
      });
    }

    return { asOfDate, timezone, snapshots };
  }

  async approveModel(
    organizationId: string,
    modelKey: string,
    modelVersion: string,
    horizonDays: number,
  ) {
    const entry = await this.repository.getRegistryEntry(organizationId, modelKey, horizonDays);
    if (!entry) {
      return { approved: false, reason: 'Model registry entry not found' };
    }
    if (entry.modelVersion !== modelVersion) {
      return { approved: false, reason: 'Model version mismatch' };
    }
    const gates = entry.releaseGates as Array<{ passed: boolean }>;
    const allPassed = Array.isArray(gates) && gates.every((g) => g.passed);
    if (!allPassed) {
      return { approved: false, reason: 'Release gates not passed — remains DRAFT/SHADOW' };
    }

    await this.repository.updateRegistryStatus(
      organizationId,
      modelKey,
      modelVersion,
      horizonDays,
      'APPROVED',
    );
    return { approved: true, modelKey, modelVersion, horizonDays, status: 'APPROVED' };
  }

  isModelApproved(
    registryStatus: string | null | undefined,
    driftSeverity: string | null | undefined,
  ): boolean {
    if (!registryStatus || registryStatus !== 'APPROVED') return false;
    if (driftSeverity === 'CRITICAL') return false;
    return true;
  }

  private yesterdayInTimezone(timezone: string): string {
    const today = zonedDateOnly(new Date(), timezone);
    return zonedDateOnly(
      new Date(zonedStartOfDayToUtc(today, timezone).getTime() - 1),
      timezone,
    );
  }
}
