import { Counter, Histogram } from 'prom-client';

export const stationsV2FeatureDisabledTotal = new Counter({
  name: 'synqdrive_stations_v2_feature_disabled_total',
  help: 'Stations V2 feature guard rejections',
  labelNames: ['flag'] as const,
});

export const stationsV2PartialReadTotal = new Counter({
  name: 'synqdrive_stations_v2_partial_read_total',
  help: 'Stations V2 read responses with partial data fields',
  labelNames: ['endpoint'] as const,
});

export const stationsV2SummaryLatencySeconds = new Histogram({
  name: 'synqdrive_stations_v2_summary_latency_seconds',
  help: 'Stations V2 summary read latency',
  labelNames: ['batch'] as const,
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});
