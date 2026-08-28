import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { DIMO_ENERGY_DETECTOR_CONFIG_VERSION } from '@modules/dimo/energy-events/dimo-energy-detector.config';

export interface EnergyEventsRunMetrics {
  mechanism: 'refuel' | 'recharge';
  status: 'SUCCESS_WITH_EVENTS' | 'SUCCESS_EMPTY' | 'FAILED';
  httpStatus?: number;
  retryable?: boolean;
  detectedSegments: number;
  persistableSegments: number;
  created: number;
  updated: number;
  skipped: number;
  pruned: number;
  durationMs: number;
}

/**
 * E3A observability for automatic energy-event detection.
 * Reuses TripMetricsService Prometheus registry — no second metrics system.
 */
@Injectable()
export class EnergyEventsMetricsService {
  readonly detectionRunsTotal: Counter<string>;
  readonly mechanismFetchTotal: Counter<string>;
  readonly segmentsDetectedTotal: Counter<string>;
  readonly segmentsPersistableTotal: Counter<string>;
  readonly eventsCreatedTotal: Counter<string>;
  readonly eventsUpdatedTotal: Counter<string>;
  readonly eventsSkippedTotal: Counter<string>;
  readonly eventsPrunedTotal: Counter<string>;
  readonly dimoHttp422Total: Counter<string>;
  readonly dimoRetryableFailuresTotal: Counter<string>;
  readonly detectionDuration: Histogram<string>;
  readonly zeroPersistRunsTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.detectionRunsTotal = new Counter({
      name: 'synqdrive_energy_events_detection_runs_total',
      help: 'Energy event detection runs',
      labelNames: ['result', 'detector_config_version'],
      registers: [register],
    });

    this.mechanismFetchTotal = new Counter({
      name: 'synqdrive_energy_events_mechanism_fetch_total',
      help: 'Per-mechanism DIMO fetch outcomes',
      labelNames: ['mechanism', 'status', 'detector_config_version'],
      registers: [register],
    });

    this.segmentsDetectedTotal = new Counter({
      name: 'synqdrive_energy_events_segments_detected_total',
      help: 'Raw DIMO segments returned before persist gate',
      labelNames: ['mechanism'],
      registers: [register],
    });

    this.segmentsPersistableTotal = new Counter({
      name: 'synqdrive_energy_events_segments_persistable_total',
      help: 'Segments passing production persist gate',
      labelNames: ['mechanism'],
      registers: [register],
    });

    this.eventsCreatedTotal = new Counter({
      name: 'synqdrive_energy_events_created_total',
      help: 'Energy events created',
      registers: [register],
    });

    this.eventsUpdatedTotal = new Counter({
      name: 'synqdrive_energy_events_updated_total',
      help: 'Energy events updated',
      registers: [register],
    });

    this.eventsSkippedTotal = new Counter({
      name: 'synqdrive_energy_events_skipped_total',
      help: 'Segments skipped by persist gate',
      registers: [register],
    });

    this.eventsPrunedTotal = new Counter({
      name: 'synqdrive_energy_events_pruned_total',
      help: 'Legacy sub-segments pruned after coalescing',
      registers: [register],
    });

    this.dimoHttp422Total = new Counter({
      name: 'synqdrive_energy_events_dimo_http_422_total',
      help: 'DIMO GraphQL validation failures (HTTP 422)',
      labelNames: ['mechanism'],
      registers: [register],
    });

    this.dimoRetryableFailuresTotal = new Counter({
      name: 'synqdrive_energy_events_dimo_retryable_failures_total',
      help: 'Retryable DIMO fetch failures',
      labelNames: ['mechanism'],
      registers: [register],
    });

    this.detectionDuration = new Histogram({
      name: 'synqdrive_energy_events_detection_duration_seconds',
      help: 'Energy event detection wall duration',
      labelNames: ['result'],
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [register],
    });

    this.zeroPersistRunsTotal = new Counter({
      name: 'synqdrive_energy_events_zero_persist_runs_total',
      help:
        'Single detection runs that persisted zero events (supporting signal only; not fleet-level outage proof)',
      labelNames: ['had_fetch_failure'],
      registers: [register],
    });
  }

  recordDetectionRun(
    result: 'success' | 'partial_failure' | 'no_token',
    durationMs: number,
  ): void {
    this.detectionRunsTotal.inc({
      result,
      detector_config_version: DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
    });
    this.detectionDuration.observe({ result }, durationMs / 1000);
  }

  recordMechanismOutcomes(
    outcomes: Array<{
      mechanism: 'refuel' | 'recharge';
      status: string;
      segments: unknown[];
      error?: { httpStatus?: number; retryable?: boolean };
    }>,
  ): void {
    for (const outcome of outcomes) {
      this.mechanismFetchTotal.inc({
        mechanism: outcome.mechanism,
        status: outcome.status,
        detector_config_version: DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
      });
      if (outcome.error?.httpStatus === 422) {
        this.dimoHttp422Total.inc({ mechanism: outcome.mechanism });
      }
      if (outcome.error?.retryable) {
        this.dimoRetryableFailuresTotal.inc({ mechanism: outcome.mechanism });
      }
      this.segmentsDetectedTotal.inc(
        { mechanism: outcome.mechanism },
        outcome.segments.length,
      );
    }
  }

  recordPersistStats(stats: {
    created: number;
    updated: number;
    skipped: number;
    pruned: number;
    persistableByMechanism: Record<string, number>;
    hadFetchFailure: boolean;
    totalPersisted: number;
  }): void {
    this.eventsCreatedTotal.inc(stats.created);
    this.eventsUpdatedTotal.inc(stats.updated);
    this.eventsSkippedTotal.inc(stats.skipped);
    this.eventsPrunedTotal.inc(stats.pruned);
    for (const [mechanism, count] of Object.entries(stats.persistableByMechanism)) {
      this.segmentsPersistableTotal.inc({ mechanism }, count);
    }
    if (stats.totalPersisted === 0) {
      this.zeroPersistRunsTotal.inc({
        had_fetch_failure: stats.hadFetchFailure ? 'true' : 'false',
      });
    }
  }
}
