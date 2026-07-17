import { Injectable, Logger } from '@nestjs/common';
import {
  bucketCoverageRatio,
  bucketNeutralGapKm,
  bucketPredictionErrorMm,
  formatBrakeHealthLog,
  type BrakeHealthLogEvent,
} from './brake-health-observability.util';
import { BrakeMetricsService } from './brake-metrics.service';

@Injectable()
export class BrakeHealthObservabilityService {
  private readonly logger = new Logger(BrakeHealthObservabilityService.name);

  constructor(private readonly metrics: BrakeMetricsService) {}

  log(event: BrakeHealthLogEvent): void {
    const line = formatBrakeHealthLog(event);
    if (event.status === 'failed') {
      this.logger.warn(line);
    } else if (event.status === 'deduplicated' || event.status === 'duplicate_prevented') {
      this.logger.debug(line);
    } else {
      this.logger.log(line);
    }
  }

  recordRecalculation(args: {
    result: 'success' | 'failed' | 'skipped' | 'deduplicated';
    durationMs?: number;
    skipReason?: string | null;
    errorCode?: string | null;
    trigger?: string;
  }): void {
    this.log({
      component: 'brake_recalculation',
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
      trigger: args.trigger ?? null,
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

  recordRecalculationLockContended(trigger?: string): void {
    this.log({
      component: 'brake_recalculation',
      event: 'lock_contended',
      status: 'skipped',
      trigger: trigger ?? 'unknown',
      reasonCode: 'lock_contended',
    });
    this.metrics.recalculationLockContendedTotal.inc({
      trigger: trigger ?? 'unknown',
    });
  }

  recordInitialization(args: {
    result: 'success' | 'failed' | 'skipped';
    source: string;
    errorCode?: string | null;
    reasonCode?: string | null;
  }): void {
    this.log({
      component: 'brake_registration_initialization',
      event: 'initialize',
      status: args.result === 'failed' ? 'failed' : args.result === 'skipped' ? 'skipped' : 'completed',
      source: args.source,
      reasonCode: args.reasonCode ?? args.errorCode ?? null,
      result: args.result,
    });
    this.metrics.initializationTotal.inc({ result: args.result, source: args.source });
    if (args.result === 'failed') {
      this.metrics.initializationFailedTotal.inc({
        error_code: args.errorCode ?? 'unknown',
      });
    }
  }

  recordComponentInstallation(args: { component: string; source: string }): void {
    this.log({
      component: 'brake_component_installation',
      event: 'installation_recorded',
      status: 'created',
      componentType: args.component,
      source: args.source,
    });
    this.metrics.componentInstallationTotal.inc({
      component: args.component,
      source: args.source,
    });
  }

  recordServiceApplication(args: {
    result: 'applied' | 'history_only' | 'duplicate' | 'failed';
    kind: string;
    scopeMismatch?: boolean;
  }): void {
    this.log({
      component: 'brake_service_application',
      event: 'service_applied',
      status: args.result === 'failed' ? 'failed' : args.result === 'duplicate' ? 'duplicate_prevented' : 'completed',
      result: args.result,
      source: args.kind,
    });
    if (args.scopeMismatch) {
      this.metrics.serviceScopeMismatchTotal.inc({ kind: args.kind });
      this.log({
        component: 'brake_service_application',
        event: 'scope_mismatch',
        status: 'failed',
        reasonCode: 'scope_mismatch',
        source: args.kind,
      });
    }
  }

  recordSpecFallback(reason: string): void {
    this.log({
      component: 'brake_registration_initialization',
      event: 'spec_fallback_anchor',
      status: 'completed',
      reasonCode: reason,
    });
    this.metrics.specFallbackTotal.inc({ reason });
  }

  recordCoverage(args: {
    coverageRatio: number | null;
    coverageStatus: string | null;
    underCoverageKm: number | null;
    overCoverageKm: number | null;
    missingImpact?: boolean;
  }): void {
    const status = args.coverageStatus ?? 'unknown';
    if (args.coverageRatio != null && Number.isFinite(args.coverageRatio)) {
      this.metrics.tripCoverageRatio.observe({ coverage_status: status }, args.coverageRatio);
    }
    if (args.underCoverageKm != null && args.underCoverageKm > 0) {
      this.metrics.neutralGapKm.observe(
        { bucket: bucketNeutralGapKm(args.underCoverageKm) },
        args.underCoverageKm,
      );
      this.log({
        component: 'brake_reconciliation',
        event: 'coverage_gap',
        status: 'completed',
        coverageBucket: bucketCoverageRatio(args.coverageRatio),
        reasonCode: 'coverage_gap',
      });
    }
    if (args.overCoverageKm != null && args.overCoverageKm > 0) {
      this.metrics.tripOvercoverageTotal.inc({ source: status });
      this.log({
        component: 'brake_reconciliation',
        event: 'overcoverage',
        status: 'completed',
        reasonCode: 'overcoverage',
      });
    }
    if (args.missingImpact) {
      this.metrics.tripMissingImpactTotal.inc({ trigger: 'recalculate' });
      this.log({
        component: 'brake_tdi_processing',
        event: 'missing_impact',
        status: 'skipped',
        reasonCode: 'missing_tdi',
      });
    }
  }

  recordEventIntake(args: { source: string; outcome: 'created' | 'duplicate' | 'skipped' | 'failed' }): void {
    this.log({
      component: args.source === 'dimo' ? 'brake_dimo_intake' : 'brake_event_dedupe',
      event: 'event_intake',
      status:
        args.outcome === 'failed'
          ? 'failed'
          : args.outcome === 'duplicate'
            ? 'duplicate_prevented'
            : args.outcome === 'skipped'
              ? 'skipped'
              : 'created',
      source: args.source,
      result: args.outcome,
    });
    this.metrics.eventIngestedTotal.inc({ source: args.source, outcome: args.outcome });
    if (args.outcome === 'duplicate') {
      this.metrics.eventDuplicatePreventedTotal.inc({ source: args.source });
    }
  }

  recordMeasurement(source: string): void {
    this.log({
      component: 'brake_evidence',
      event: 'measurement_recorded',
      status: 'created',
      source,
    });
    this.metrics.measurementTotal.inc({ source });
  }

  recordEvidence(args: {
    action: 'created' | 'resolved' | 'duplicate_prevented' | 'stale';
    source: string;
    category?: string;
  }): void {
    this.log({
      component: 'brake_evidence',
      event: 'evidence_lifecycle',
      status:
        args.action === 'duplicate_prevented'
          ? 'duplicate_prevented'
          : args.action === 'stale'
            ? 'stale'
            : args.action === 'resolved'
              ? 'resolved'
              : 'created',
      source: args.source,
      result: args.action,
    });
    if (args.action === 'duplicate_prevented') {
      this.metrics.evidenceDuplicateTotal.inc({ source: args.source });
    }
    if (args.category) {
      this.metrics.evidenceActive.set({ category: args.category }, 1);
    }
  }

  recordTdiProcessing(args: { status: 'completed' | 'failed' | 'skipped'; reasonCode?: string }): void {
    this.log({
      component: 'brake_tdi_processing',
      event: 'tdi_processed',
      status: args.status === 'failed' ? 'failed' : args.status === 'skipped' ? 'skipped' : 'completed',
      reasonCode: args.reasonCode ?? null,
    });
  }

  recordSnapshot(args: { result: 'created' | 'deduplicated' | 'failed' }): void {
    this.log({
      component: 'brake_snapshot',
      event: 'snapshot_persisted',
      status: args.result === 'failed' ? 'failed' : args.result === 'deduplicated' ? 'deduplicated' : 'completed',
      result: args.result,
    });
    this.metrics.snapshotTotal.inc({ result: args.result });
  }

  recordPredictionValidation(args: { errorMm: number; linked: boolean }): void {
    this.log({
      component: 'brake_snapshot',
      event: 'prediction_validation',
      status: args.linked ? 'completed' : 'skipped',
      result: args.linked ? 'linked' : 'rejected',
    });
    this.metrics.predictionErrorMm.observe(
      { bucket: bucketPredictionErrorMm(args.errorMm) },
      args.errorMm,
    );
  }

  recordAlert(args: { action: string; alertType: string }): void {
    this.log({
      component: 'brake_alert',
      event: 'alert_lifecycle',
      status: 'completed',
      alertType: args.alertType,
      result: args.action,
    });
    this.metrics.alertTotal.inc({ action: args.action, alert_type: args.alertType });
  }

  recordRentalBlock(args: { level: string; reasonCode: string }): void {
    this.log({
      component: 'brake_rental_block',
      event: 'rental_decision',
      status: 'completed',
      reasonCode: args.reasonCode,
      result: args.level,
    });
    this.metrics.rentalBlockTotal.inc({
      level: args.level,
      reason_code: args.reasonCode,
    });
  }

  recordBackfill(args: {
    mode: string;
    outcome: 'success' | 'conflict' | 'failed' | 'skipped';
    reasonCode?: string;
  }): void {
    this.log({
      component: 'brake_backfill',
      event: 'backfill_run',
      status: args.outcome === 'failed' ? 'failed' : args.outcome === 'conflict' ? 'conflict' : 'completed',
      mode: args.mode,
      reasonCode: args.reasonCode ?? null,
      result: args.outcome,
    });
    if (args.outcome === 'conflict') {
      this.metrics.backfillConflictTotal.inc({ mode: args.mode });
    }
  }

  recordReconciliation(args: { action: string; result: string }): void {
    this.log({
      component: 'brake_reconciliation',
      event: args.action,
      status: 'completed',
      result: args.result,
    });
  }
}
