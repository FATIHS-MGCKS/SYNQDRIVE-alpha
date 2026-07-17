import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';

/**
 * Brake-health Prometheus metrics — low-cardinality labels only.
 * Metric names use synqdrive_brake_* prefix (platform convention).
 */
@Injectable()
export class BrakeMetricsService {
  readonly initializationTotal: Counter<string>;
  readonly initializationFailedTotal: Counter<string>;
  readonly recalculationTotal: Counter<string>;
  readonly recalculationFailedTotal: Counter<string>;
  readonly recalculationDeduplicatedTotal: Counter<string>;
  readonly recalculationDuration: Histogram<string>;
  readonly recalculationLockContendedTotal: Counter<string>;
  readonly componentInstallationTotal: Counter<string>;
  readonly serviceScopeMismatchTotal: Counter<string>;
  readonly specFallbackTotal: Counter<string>;
  readonly tripCoverageRatio: Histogram<string>;
  readonly tripMissingImpactTotal: Counter<string>;
  readonly tripOvercoverageTotal: Counter<string>;
  readonly neutralGapKm: Histogram<string>;
  readonly eventIngestedTotal: Counter<string>;
  readonly eventDuplicatePreventedTotal: Counter<string>;
  readonly measurementTotal: Counter<string>;
  readonly predictionErrorMm: Histogram<string>;
  readonly evidenceActive: Gauge<string>;
  readonly evidenceDuplicateTotal: Counter<string>;
  readonly alertTotal: Counter<string>;
  readonly rentalBlockTotal: Counter<string>;
  readonly backfillConflictTotal: Counter<string>;
  readonly snapshotTotal: Counter<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.initializationTotal = new Counter({
      name: 'synqdrive_brake_initialization_total',
      help: 'Brake baseline initialization outcomes',
      labelNames: ['result', 'source'],
      registers: [register],
    });

    this.initializationFailedTotal = new Counter({
      name: 'synqdrive_brake_initialization_failed_total',
      help: 'Brake baseline initialization failures',
      labelNames: ['error_code'],
      registers: [register],
    });

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

    this.recalculationLockContendedTotal = new Counter({
      name: 'synqdrive_brake_recalculation_lock_contended_total',
      help: 'Brake recalculation jobs that failed to acquire per-vehicle lock',
      labelNames: ['trigger'],
      registers: [register],
    });

    this.componentInstallationTotal = new Counter({
      name: 'synqdrive_brake_component_installation_total',
      help: 'Brake component installation lifecycle events',
      labelNames: ['component', 'source'],
      registers: [register],
    });

    this.serviceScopeMismatchTotal = new Counter({
      name: 'synqdrive_brake_service_scope_mismatch_total',
      help: 'Brake service requests with invalid kind/scope combinations',
      labelNames: ['kind'],
      registers: [register],
    });

    this.specFallbackTotal = new Counter({
      name: 'synqdrive_brake_spec_fallback_total',
      help: 'Brake baselines anchored on reference spec fallback',
      labelNames: ['reason'],
      registers: [register],
    });

    this.tripCoverageRatio = new Histogram({
      name: 'synqdrive_brake_trip_coverage_ratio',
      help: 'Modeled trip coverage ratio since brake anchor (0-1)',
      labelNames: ['coverage_status'],
      buckets: [0, 0.25, 0.5, 0.75, 1, 1.25],
      registers: [register],
    });

    this.tripMissingImpactTotal = new Counter({
      name: 'synqdrive_brake_trip_missing_impact_total',
      help: 'Trips missing driving-impact data for brake modeling',
      labelNames: ['trigger'],
      registers: [register],
    });

    this.tripOvercoverageTotal = new Counter({
      name: 'synqdrive_brake_trip_overcoverage_total',
      help: 'Brake modeling overcoverage incidents',
      labelNames: ['source'],
      registers: [register],
    });

    this.neutralGapKm = new Histogram({
      name: 'synqdrive_brake_neutral_gap_km',
      help: 'Neutral-gap kilometers not attributed to brake wear modeling',
      labelNames: ['bucket'],
      buckets: [0, 50, 200, 500, 1000, 5000],
      registers: [register],
    });

    this.eventIngestedTotal = new Counter({
      name: 'synqdrive_brake_event_ingested_total',
      help: 'Braking events ingested into the canonical ledger',
      labelNames: ['source', 'outcome'],
      registers: [register],
    });

    this.eventDuplicatePreventedTotal = new Counter({
      name: 'synqdrive_brake_event_duplicate_prevented_total',
      help: 'Duplicate braking events prevented at intake/ledger',
      labelNames: ['source'],
      registers: [register],
    });

    this.measurementTotal = new Counter({
      name: 'synqdrive_brake_measurement_total',
      help: 'Brake thickness measurement evidence recorded',
      labelNames: ['source'],
      registers: [register],
    });

    this.predictionErrorMm = new Histogram({
      name: 'synqdrive_brake_prediction_error_mm',
      help: 'Signed brake thickness prediction error in mm',
      labelNames: ['bucket'],
      buckets: [-3, -2, -1, -0.5, -0.2, 0, 0.2, 0.5, 1, 2, 3],
      registers: [register],
    });

    this.evidenceActive = new Gauge({
      name: 'synqdrive_brake_evidence_active',
      help: 'Active brake evidence rows by category (refreshed on sync)',
      labelNames: ['category'],
      registers: [register],
    });

    this.evidenceDuplicateTotal = new Counter({
      name: 'synqdrive_brake_evidence_duplicate_total',
      help: 'Duplicate brake evidence writes prevented',
      labelNames: ['source'],
      registers: [register],
    });

    this.alertTotal = new Counter({
      name: 'synqdrive_brake_alert_total',
      help: 'Brake health alert lifecycle events',
      labelNames: ['action', 'alert_type'],
      registers: [register],
    });

    this.rentalBlockTotal = new Counter({
      name: 'synqdrive_brake_rental_block_total',
      help: 'Brake rental health blocking decisions',
      labelNames: ['level', 'reason_code'],
      registers: [register],
    });

    this.backfillConflictTotal = new Counter({
      name: 'synqdrive_brake_backfill_conflict_total',
      help: 'Brake backfill operations that detected conflicts',
      labelNames: ['mode'],
      registers: [register],
    });

    this.snapshotTotal = new Counter({
      name: 'synqdrive_brake_snapshot_total',
      help: 'Brake health snapshots persisted after recalculation',
      labelNames: ['result'],
      registers: [register],
    });
  }
}
