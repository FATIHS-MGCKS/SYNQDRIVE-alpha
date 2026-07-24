import { Injectable, Logger } from '@nestjs/common';
import { FEATURE_SET_VERSION } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import { runAllMaintenanceRiskForecasts } from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk-forecast';
import {
  RISK_FORECAST_HORIZONS_DAYS,
  type RiskForecastHorizonDays,
} from '@synq/evaluations-insights/predictive/evaluations-maintenance-risk.contract';
import {
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@synq/evaluations-insights/predictive/evaluations-feature-time';
import { toPrismaRiskForecastCreateInput } from '@shared/predictive/predictive-risk-forecast.mapper';
import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveRiskLoader } from './predictive-risk.loader';
import { PredictiveRiskRepository } from './predictive-risk.repository';

export type RunPredictiveRiskForecastsInput = {
  organizationId: string;
  asOfDate?: string;
  timezone?: string;
  horizons?: RiskForecastHorizonDays[];
  trigger?: string;
};

const RISK_TTL_DAYS = 3;

@Injectable()
export class PredictiveRiskService {
  private readonly logger = new Logger(PredictiveRiskService.name);

  constructor(
    private readonly featureLoader: PredictiveFeatureLoader,
    private readonly riskLoader: PredictiveRiskLoader,
    private readonly repository: PredictiveRiskRepository,
  ) {}

  async listForecasts(
    organizationId: string,
    query: {
      riskKey?: string;
      horizonDays?: number;
      asOfDate?: string;
      scopeKey?: string;
    },
  ) {
    return this.repository.listForecasts(organizationId, query);
  }

  async getLatestRun(organizationId: string) {
    return this.repository.getLatestRun(organizationId);
  }

  async runForecasts(input: RunPredictiveRiskForecastsInput) {
    const timezone =
      input.timezone ?? (await this.featureLoader.loadOrganizationTimezone(input.organizationId));
    const asOfDate = input.asOfDate ?? this.yesterdayInTimezone(timezone);
    const horizons = input.horizons ?? [...RISK_FORECAST_HORIZONS_DAYS];
    const scopeKey = 'fleet';

    const run = await this.repository.createRun(input.organizationId, {
      featureSetVersion: FEATURE_SET_VERSION,
      asOfDate,
      trigger: input.trigger ?? 'api',
    });

    try {
      let forecastsWritten = 0;
      const expiresAt = new Date(Date.now() + RISK_TTL_DAYS * 24 * 60 * 60 * 1000);

      for (const horizonDays of horizons) {
        const fleetInput = await this.riskLoader.loadFleetInput(
          input.organizationId,
          asOfDate,
          timezone,
          horizonDays,
        );
        const results = runAllMaintenanceRiskForecasts(fleetInput);

        for (const result of results) {
          await this.repository.upsertForecast(
            toPrismaRiskForecastCreateInput(
              input.organizationId,
              result,
              scopeKey,
              run.id,
              expiresAt,
            ),
          );
          forecastsWritten += 1;
        }
      }

      await this.repository.completeRun(run.id, {
        status: 'COMPLETED',
        forecastsWritten,
      });

      return {
        riskRunId: run.id,
        asOfDate,
        timezone,
        horizons,
        forecastsWritten,
        trigger: input.trigger ?? 'api',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Risk forecast run failed';
      this.logger.error(
        `Predictive risk forecast failed for org ${input.organizationId}: ${message}`,
      );
      await this.repository.completeRun(run.id, {
        status: 'FAILED',
        forecastsWritten: 0,
        errorMessage: message,
      });
      throw error;
    }
  }

  private yesterdayInTimezone(timezone: string): string {
    const today = zonedDateOnly(new Date(), timezone);
    return zonedDateOnly(
      new Date(zonedStartOfDayToUtc(today, timezone).getTime() - 1),
      timezone,
    );
  }
}
