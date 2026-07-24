import { Injectable, Logger } from '@nestjs/common';
import { FEATURE_SET_VERSION } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import { runBaselineForecast } from '@synq/evaluations-insights/predictive/evaluations-baseline-forecast';
import type {
  ForecastHorizonDays,
  ForecastTarget,
} from '@synq/evaluations-insights/predictive/evaluations-forecast.contract';
import { FORECAST_HORIZONS_DAYS } from '@synq/evaluations-insights/predictive/evaluations-forecast.contract';
import {
  zonedDateOnly,
  zonedStartOfDayToUtc,
} from '@synq/evaluations-insights/predictive/evaluations-feature-time';
import { toPrismaForecastCreateInput } from '@shared/predictive/predictive-forecast.mapper';
import { PredictiveFeatureLoader } from './predictive-feature.loader';
import { PredictiveForecastLoader } from './predictive-forecast.loader';
import { PredictiveForecastRepository } from './predictive-forecast.repository';

export type RunPredictiveForecastsInput = {
  organizationId: string;
  asOfDate?: string;
  timezone?: string;
  targets?: ForecastTarget[];
  horizons?: ForecastHorizonDays[];
  trigger?: string;
};

const FORECAST_TTL_DAYS = 2;

@Injectable()
export class PredictiveForecastService {
  private readonly logger = new Logger(PredictiveForecastService.name);

  constructor(
    private readonly featureLoader: PredictiveFeatureLoader,
    private readonly forecastLoader: PredictiveForecastLoader,
    private readonly repository: PredictiveForecastRepository,
  ) {}

  async listForecasts(
    organizationId: string,
    query: {
      forecastKey?: string;
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

  async runForecasts(input: RunPredictiveForecastsInput) {
    const timezone =
      input.timezone ?? (await this.featureLoader.loadOrganizationTimezone(input.organizationId));
    const asOfDate =
      input.asOfDate ?? this.yesterdayInTimezone(timezone);
    const targets = input.targets ?? this.forecastLoader.targets();
    const horizons = input.horizons ?? [...FORECAST_HORIZONS_DAYS];
    const scopeKey = 'fleet';

    const run = await this.repository.createRun(input.organizationId, {
      featureSetVersion: FEATURE_SET_VERSION,
      asOfDate,
      trigger: input.trigger ?? 'api',
    });

    try {
      let forecastsWritten = 0;
      const expiresAt = new Date(Date.now() + FORECAST_TTL_DAYS * 24 * 60 * 60 * 1000);

      for (const target of targets) {
        const series = await this.forecastLoader.loadSeriesForTarget(
          input.organizationId,
          target,
          asOfDate,
          scopeKey,
        );

        for (const horizonDays of horizons) {
          const result = runBaselineForecast({
            target,
            horizonDays,
            series,
            asOfDate,
            timezone,
            currency: 'EUR',
          });

          await this.repository.upsertForecast(
            toPrismaForecastCreateInput(
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
        forecastRunId: run.id,
        asOfDate,
        timezone,
        targets,
        horizons,
        forecastsWritten,
        trigger: input.trigger ?? 'api',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Forecast run failed';
      this.logger.error(
        `Predictive forecast run failed for org ${input.organizationId}: ${message}`,
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
