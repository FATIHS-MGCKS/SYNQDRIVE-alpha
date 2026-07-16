import type { DRIVING_METRIC_NORMALIZATION_VERSION } from './driving-metric-normalization.config';

export type NormalizationStrategy =
  | 'EVENTS_PER_100KM'
  | 'EVENTS_PER_DRIVING_HOUR'
  | 'AFFECTED_TRIP_SHARE'
  | 'CLUSTERS_PER_TIME_WINDOW'
  | 'DURATION_SHARE'
  | 'DISTANCE_SHARE'
  | 'EVENT_SHARE'
  | 'ENERGY_PER_KM';

export type MetricReliability = 'RELIABLE' | 'LIMITED' | 'UNRELIABLE';

export type NormalizationReasonCode =
  | 'ZERO_DISTANCE'
  | 'ZERO_DURATION'
  | 'BELOW_MIN_DISTANCE'
  | 'BELOW_MIN_DURATION'
  | 'SHORT_TRIP_DISTANCE'
  | 'SHORT_TRIP_DURATION'
  | 'ZERO_DENOMINATOR'
  | 'CAPPED'
  | 'NO_EVENTS';

export type TripNormalizationContext = {
  distanceKm: number;
  durationHours: number | null;
};

export type NormalizedMetric<T extends NormalizationStrategy = NormalizationStrategy> = {
  strategy: T;
  value: number | null;
  reliability: MetricReliability;
  reasonCodes: NormalizationReasonCode[];
  rawNumerator: number;
  rawDenominator: number | null;
  capped: boolean;
  normalizationVersion: typeof DRIVING_METRIC_NORMALIZATION_VERSION;
};
