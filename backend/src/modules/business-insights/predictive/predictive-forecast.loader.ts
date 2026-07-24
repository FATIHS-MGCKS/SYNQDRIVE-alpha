import { Injectable } from '@nestjs/common';
import { FEATURE_SET_VERSION } from '@synq/evaluations-insights/predictive/evaluations-feature-store.contract';
import {
  FORECAST_FEATURE_KEYS,
  FORECAST_HORIZONS_DAYS,
  type ForecastTarget,
} from '@synq/evaluations-insights/predictive/evaluations-forecast.contract';
import { buildForecastSeriesFromSnapshots } from '@synq/evaluations-insights/predictive/evaluations-baseline-forecast';
import { PredictiveFeatureRepository } from './predictive-feature.repository';

const TARGETS: ForecastTarget[] = ['DEMAND', 'REVENUE', 'UTILIZATION'];
const HISTORY_DAYS = 400;

@Injectable()
export class PredictiveForecastLoader {
  constructor(private readonly featureRepository: PredictiveFeatureRepository) {}

  async loadSeriesForTarget(
    organizationId: string,
    target: ForecastTarget,
    asOfDate: string,
    scopeKey = 'fleet',
  ) {
    const fromDate = this.shiftDateOnly(asOfDate, -HISTORY_DAYS);
    const snapshots = await this.featureRepository.listSnapshots(organizationId, {
      fromDate,
      toDate: asOfDate,
      featureSetVersion: FEATURE_SET_VERSION,
      scopeKey,
    });

    const featureKey = FORECAST_FEATURE_KEYS[target];
    const points = snapshots.map((s) => ({
      observationDate: s.observationDate,
      value:
        typeof s.features[featureKey]?.value === 'number'
          ? (s.features[featureKey].value as number)
          : null,
    }));

    return buildForecastSeriesFromSnapshots(points);
  }

  targets(): ForecastTarget[] {
    return [...TARGETS];
  }

  horizons(): typeof FORECAST_HORIZONS_DAYS {
    return [...FORECAST_HORIZONS_DAYS];
  }

  private shiftDateOnly(dateOnly: string, offset: number): string {
    const [y, m, d] = dateOnly.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    return dt.toISOString().slice(0, 10);
  }
}
