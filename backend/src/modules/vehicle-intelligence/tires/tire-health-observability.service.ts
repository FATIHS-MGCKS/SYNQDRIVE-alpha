import { Injectable, Logger } from '@nestjs/common';
import {
  bucketPredictionErrorMm,
  bucketPressureCoverageRatio,
  formatTireHealthLog,
  type TireHealthLogEvent,
} from './tire-health-observability.util';
import { TireMetricsService } from './tire-metrics.service';
import type {
  TireTripUsageMetricHook,
  TireTripUsageProcessResult,
} from './tire-trip-usage.service';
import type { TireTripUsageMetricName } from './tire-trip-usage-replay';
import type { TirePressureContext } from './tire-pressure-context.types';

@Injectable()
export class TireHealthObservabilityService implements TireTripUsageMetricHook {
  private readonly logger = new Logger(TireHealthObservabilityService.name);

  constructor(private readonly metrics: TireMetricsService) {}

  log(event: TireHealthLogEvent): void {
    const line = formatTireHealthLog(event);
    if (event.status === 'failed') {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }

  recordRecalculation(args: {
    result: 'success' | 'failed' | 'skipped' | 'deduplicated';
    durationMs?: number;
    skipReason?: string | null;
    errorCode?: string | null;
  }): void {
    this.log({
      component: 'tire_recalculation',
      event: 'recalculate',
      status:
        args.result === 'failed'
          ? 'failed'
          : args.result === 'deduplicated'
            ? 'deduplicated'
            : args.result === 'skipped'
              ? 'skipped'
              : 'completed',
      durationMs: args.durationMs ?? null,
      reasonCode: args.skipReason ?? args.errorCode ?? null,
      result: args.result,
    });

    this.metrics.recalculationTotal.inc({ result: args.result });
    if (args.result === 'failed') {
      this.metrics.recalculationFailedTotal.inc({
        error_code: args.errorCode ?? 'unknown',
      });
    }
    if (args.result === 'deduplicated') {
      this.metrics.recalculationDeduplicatedTotal.inc({
        reason: args.skipReason ?? 'identical_input_fingerprint',
      });
    }
    if (args.durationMs != null) {
      this.metrics.recalculationDuration.observe(
        { result: args.result },
        args.durationMs / 1000,
      );
    }
  }

  recordTripUsageProcessed(result: TireTripUsageProcessResult): void {
    const status = result.attributionStatus;
    this.log({
      component: 'tire_trip_usage',
      event: 'ledger_processed',
      status: 'completed',
      result: result.ledgerAction ?? status,
      reasonCode: result.reason ?? status,
    });

    this.metrics.usageProcessedTotal.inc({
      result: result.ledgerAction ?? status,
    });

    if (result.requiresReviewSetupIds && result.requiresReviewSetupIds.length > 0) {
      this.metrics.usageMappingConflictTotal.inc({ status: 'review_required' });
      this.log({
        component: 'tire_trip_usage',
        event: 'setup_mapping_conflict',
        status: 'mapping_conflict',
        reasonCode: status,
      });
    }
  }

  recordMetric(name: TireTripUsageMetricName, labels?: Record<string, string>): void {
    switch (name) {
      case 'duplicate_prevented':
        this.metrics.usageDuplicatePreventedTotal.inc({
          reason: labels?.reason ?? 'idempotent',
        });
        this.log({
          component: 'tire_trip_usage',
          event: 'duplicate_prevented',
          status: 'duplicate_prevented',
          reasonCode: labels?.reason ?? 'idempotent',
        });
        break;
      case 'ledger_created':
      case 'ledger_revised':
      case 'ledger_invalidated':
      case 'aggregate_rebuilt':
        this.metrics.usageProcessedTotal.inc({ result: name });
        break;
      default:
        break;
    }
  }

  recordOdometerAnchor(args: {
    status: 'anchored' | 'required' | 'plausibility_issue';
    source?: string | null;
    issue?: string | null;
  }): void {
    this.log({
      component: 'tire_odometer_anchor',
      event: 'anchor_evaluated',
      status: args.status === 'plausibility_issue' ? 'failed' : 'completed',
      source: args.source ?? null,
      reasonCode: args.issue ?? args.status,
    });
  }

  recordMeasurement(args: { source: string }): void {
    this.log({
      component: 'tire_measurement',
      event: 'measurement_recorded',
      status: 'created',
      source: args.source,
    });
    this.metrics.measurementTotal.inc({ source: args.source });
  }

  recordPredictionValidation(args: {
    errorMm: number;
    linked: boolean;
  }): void {
    this.log({
      component: 'tire_prediction_validation',
      event: 'validation_point',
      status: args.linked ? 'completed' : 'skipped',
      result: args.linked ? 'linked' : 'rejected',
    });
    this.metrics.predictionErrorMm.observe(
      { bucket: bucketPredictionErrorMm(args.errorMm) },
      args.errorMm,
    );
    this.metrics.groundTruthTotal.inc({
      result: args.linked ? 'linked' : 'rejected',
    });
  }

  recordPredictionMae(maeMm: number): void {
    if (!Number.isFinite(maeMm)) return;
    this.metrics.predictionMaeMm.set({ window: 'batch' }, maeMm);
  }

  recordPressureNormalization(args: {
    plausibility: string;
    invalid: boolean;
    source?: string | null;
  }): void {
    if (args.invalid) {
      this.metrics.pressureInvalidTotal.inc({ plausibility: args.plausibility });
      this.log({
        component: 'tire_pressure_normalization',
        event: 'pressure_rejected',
        status: 'invalid',
        reasonCode: args.plausibility,
        source: args.source ?? null,
      });
    }
  }

  recordPressureContext(context: TirePressureContext): void {
    const ratio = context.coverage.wheelsAvailable / 4;
    this.metrics.pressureCoverageRatio.observe(
      { source: context.sourceType },
      ratio,
    );
    if (context.overallFreshness === 'stale') {
      this.metrics.signalStaleTotal.inc({ signal: 'tire_pressure' });
      this.log({
        component: 'tire_pressure_normalization',
        event: 'pressure_stale',
        status: 'stale',
        source: context.sourceType,
        coverageBucket: bucketPressureCoverageRatio(ratio),
      });
    }
  }

  recordDefaultBaseline(reason: string): void {
    this.metrics.defaultBaselineTotal.inc({ reason });
    this.log({
      component: 'tire_measurement',
      event: 'default_baseline',
      status: 'completed',
      reasonCode: reason,
    });
  }

  recordAlert(args: {
    action: 'created' | 'resolved' | 'deduplicated';
    alertType: string;
  }): void {
    this.log({
      component: 'tire_alert',
      event: 'alert_sync',
      status: args.action === 'resolved' ? 'resolved' : 'created',
      alertType: args.alertType,
      result: args.action,
    });
    this.metrics.alertTotal.inc({
      action: args.action,
      alert_type: args.alertType,
    });
  }

  recordRentalBlock(args: { level: string; reasonCode: string }): void {
    this.log({
      component: 'tire_rental_block',
      event: 'rental_block_evaluated',
      status: 'completed',
      reasonCode: args.reasonCode,
      result: args.level,
    });
    this.metrics.rentalBlockTotal.inc({
      level: args.level,
      reason_code: args.reasonCode,
    });
  }

  recordSnapshotCreated(result: 'created' | 'skipped' | 'failed'): void {
    this.log({
      component: 'tire_snapshot',
      event: 'snapshot_persisted',
      status: result === 'failed' ? 'failed' : 'completed',
      result,
    });
    this.metrics.snapshotCreatedTotal.inc({ result });
  }
}
