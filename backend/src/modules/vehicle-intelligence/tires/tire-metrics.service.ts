import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

/**
 * Tire-health Prometheus metrics — low-cardinality labels only.
 * Metric names use synqdrive_tire_* prefix (platform convention).
 */
@Injectable()
export class TireMetricsService {
  readonly recalculationTotal: Counter<string>;
  readonly recalculationFailedTotal: Counter<string>;
  readonly recalculationDeduplicatedTotal: Counter<string>;
  readonly usageProcessedTotal: Counter<string>;
  readonly usageDuplicatePreventedTotal: Counter<string>;
  readonly usageMappingConflictTotal: Counter<string>;
  readonly measurementTotal: Counter<string>;
  readonly predictionErrorMm: Histogram<string>;
  readonly predictionMaeMm: Gauge<string>;
  readonly pressureCoverageRatio: Histogram<string>;
  readonly pressureInvalidTotal: Counter<string>;
  readonly signalStaleTotal: Counter<string>;
  readonly defaultBaselineTotal: Counter<string>;
  readonly groundTruthTotal: Counter<string>;
  readonly alertTotal: Counter<string>;
  readonly rentalBlockTotal: Counter<string>;
  readonly snapshotCreatedTotal: Counter<string>;
  readonly recalculationDuration: Histogram<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.recalculationTotal = new Counter({
      name: 'synqdrive_tire_recalculation_total',
      help: 'Tire health recalculation outcomes',
      labelNames: ['result'],
      registers: [register],
    });

    this.recalculationFailedTotal = new Counter({
      name: 'synqdrive_tire_recalculation_failed_total',
      help: 'Tire health recalculation failures',
      labelNames: ['error_code'],
      registers: [register],
    });

    this.recalculationDeduplicatedTotal = new Counter({
      name: 'synqdrive_tire_recalculation_deduplicated_total',
      help: 'Tire recalculations skipped due to identical input fingerprint',
      labelNames: ['reason'],
      registers: [register],
    });

    this.usageProcessedTotal = new Counter({
      name: 'synqdrive_tire_usage_processed_total',
      help: 'Canonical tire trip usage ledger processing outcomes',
      labelNames: ['result'],
      registers: [register],
    });

    this.usageDuplicatePreventedTotal = new Counter({
      name: 'synqdrive_tire_usage_duplicate_prevented_total',
      help: 'Trip usage duplicate applications prevented',
      labelNames: ['reason'],
      registers: [register],
    });

    this.usageMappingConflictTotal = new Counter({
      name: 'synqdrive_tire_usage_mapping_conflict_total',
      help: 'Trip-to-setup mapping conflicts requiring review',
      labelNames: ['status'],
      registers: [register],
    });

    this.measurementTotal = new Counter({
      name: 'synqdrive_tire_measurement_total',
      help: 'Tire tread measurement events',
      labelNames: ['source'],
      registers: [register],
    });

    this.predictionErrorMm = new Histogram({
      name: 'synqdrive_tire_prediction_error_mm',
      help: 'Signed tire tread prediction error in mm',
      labelNames: ['bucket'],
      buckets: [-3, -2, -1, -0.5, -0.2, 0, 0.2, 0.5, 1, 2, 3],
      registers: [register],
    });

    this.predictionMaeMm = new Gauge({
      name: 'synqdrive_tire_prediction_mae_mm',
      help: 'Rolling mean absolute tire prediction error in mm (updated inline per validation batch)',
      labelNames: ['window'],
      registers: [register],
    });

    this.pressureCoverageRatio = new Histogram({
      name: 'synqdrive_tire_pressure_coverage_ratio',
      help: 'Tire pressure wheel coverage ratio (0-1)',
      labelNames: ['source'],
      buckets: [0, 0.25, 0.5, 0.75, 1],
      registers: [register],
    });

    this.pressureInvalidTotal = new Counter({
      name: 'synqdrive_tire_pressure_invalid_total',
      help: 'Rejected implausible tire pressure normalizations',
      labelNames: ['plausibility'],
      registers: [register],
    });

    this.signalStaleTotal = new Counter({
      name: 'synqdrive_tire_signal_stale_total',
      help: 'Stale tire-related provider signals observed',
      labelNames: ['signal'],
      registers: [register],
    });

    this.defaultBaselineTotal = new Counter({
      name: 'synqdrive_tire_default_baseline_total',
      help: 'Tire setups using default 8mm baseline assumption',
      labelNames: ['reason'],
      registers: [register],
    });

    this.groundTruthTotal = new Counter({
      name: 'synqdrive_tire_ground_truth_total',
      help: 'Tire wear ground-truth data point linkage outcomes',
      labelNames: ['result'],
      registers: [register],
    });

    this.alertTotal = new Counter({
      name: 'synqdrive_tire_alert_total',
      help: 'Tire health alert lifecycle events',
      labelNames: ['action', 'alert_type'],
      registers: [register],
    });

    this.rentalBlockTotal = new Counter({
      name: 'synqdrive_tire_rental_block_total',
      help: 'Tire rental health blocking decisions',
      labelNames: ['level', 'reason_code'],
      registers: [register],
    });

    this.snapshotCreatedTotal = new Counter({
      name: 'synqdrive_tire_snapshot_created_total',
      help: 'Tire health snapshots persisted after recalculation',
      labelNames: ['result'],
      registers: [register],
    });

    this.recalculationDuration = new Histogram({
      name: 'synqdrive_tire_recalculation_duration_seconds',
      help: 'Tire recalculation wall time',
      labelNames: ['result'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [register],
    });
  }
}
