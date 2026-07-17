import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

@Injectable()
export class BrakeMetricsService {
  readonly recalculationTotal: Counter<string>;
  readonly recalculationFailedTotal: Counter<string>;
  readonly recalculationDeduplicatedTotal: Counter<string>;
  readonly recalculationDuration: Histogram<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.recalculationTotal = new Counter({
      name: 'synqdrive_brake_recalculation_total',
      help: 'Brake health recalculation outcomes',
      labelNames: ['result'],
      registers: [register],
    });

    this.recalculationFailedTotal = new Counter({
      name: 'synqdrive_brake_recalculation_failed_total',
      help: 'Brake health recalculation failures',
      labelNames: ['error_code'],
      registers: [register],
    });

    this.recalculationDeduplicatedTotal = new Counter({
      name: 'synqdrive_brake_recalculation_deduplicated_total',
      help: 'Brake recalculations skipped due to identical input fingerprint',
      labelNames: ['reason'],
      registers: [register],
    });

    this.recalculationDuration = new Histogram({
      name: 'synqdrive_brake_recalculation_duration_seconds',
      help: 'Brake recalculation duration',
      labelNames: ['result'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [register],
    });
  }
}
