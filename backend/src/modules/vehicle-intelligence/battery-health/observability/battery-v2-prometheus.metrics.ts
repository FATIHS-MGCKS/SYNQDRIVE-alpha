import type { BatteryMeasurementQuality } from '@prisma/client';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { isLvRestShadowContaminationQuality } from '../lv-rest-window/lv-rest-shadow.policy';
import type { BatteryV2JobType } from '../jobs/battery-v2-job.types';
import type { BatteryV2JobErrorCode } from '../jobs/battery-v2-job.errors';
import type { BatteryProviderObservationOutcome } from '../battery-provider-observation.policy';
import type { HvRechargeSessionReconcileTrigger } from '../hv-charge-session/hv-recharge-session-reconcile.trigger';

export type BatteryProviderSignal = 'lv' | 'hv';
export type BatteryRestWindowLabel = '60m' | '6h' | 'session';
export type BatteryJobOutcome = 'enqueued' | 'completed';

export function toBatteryRestWindowLabel(
  targetType: 'REST_60M' | 'REST_6H',
): BatteryRestWindowLabel {
  return targetType === 'REST_6H' ? '6h' : '60m';
}

export function recordBatteryProviderObservation(
  metrics: TripMetricsService,
  input: {
    signal: BatteryProviderSignal;
    outcome: BatteryProviderObservationOutcome | string;
  },
): void {
  metrics.batteryProviderObservationTotal.inc({
    signal: input.signal,
    outcome: input.outcome,
  });
}

export function recordBatteryProviderDuplicate(
  metrics: TripMetricsService,
  input: {
    signal: BatteryProviderSignal;
    reason: string;
  },
): void {
  metrics.batteryProviderDuplicateTotal.inc({
    signal: input.signal,
    reason: input.reason,
  });
}

export function recordBatteryJob(
  metrics: TripMetricsService,
  input: {
    jobType: BatteryV2JobType | string;
    outcome: BatteryJobOutcome;
  },
): void {
  metrics.batteryJobsTotal.inc({
    job_type: input.jobType,
    outcome: input.outcome,
  });
}

export function recordBatteryJobFailed(
  metrics: TripMetricsService,
  input: {
    jobType: BatteryV2JobType | string;
    errorCode: BatteryV2JobErrorCode | string;
  },
): void {
  metrics.batteryJobsFailedTotal.inc({
    job_type: input.jobType,
    error_code: input.errorCode,
  });
}

export function recordBatteryJobDeadLetter(
  metrics: TripMetricsService,
  input: {
    jobType: BatteryV2JobType | string;
    errorCode: BatteryV2JobErrorCode | string;
  },
): void {
  metrics.batteryJobsDeadLetterTotal.inc({
    job_type: input.jobType,
    error_code: input.errorCode,
  });
}

export function recordBatteryRestWindow(
  metrics: TripMetricsService,
  input: {
    window: BatteryRestWindowLabel;
    outcome: 'opened' | 'expired' | 'invalidated';
  },
): void {
  metrics.batteryRestWindowsTotal.inc({
    window: input.window,
    outcome: input.outcome,
  });
}

export function recordBatteryRestMeasurement(
  metrics: TripMetricsService,
  input: {
    window: BatteryRestWindowLabel;
    quality: BatteryMeasurementQuality | string;
  },
): void {
  metrics.batteryRestMeasurementsTotal.inc({
    window: input.window,
    quality: input.quality,
  });

  if (input.quality === 'MISSED') {
    metrics.batteryRestMissedTotal.inc({ window: input.window });
    return;
  }

  if (isLvRestShadowContaminationQuality(input.quality as BatteryMeasurementQuality)) {
    metrics.batteryRestContaminatedTotal.inc({ window: input.window });
  }
}

export function recordBatteryStartProxy(
  metrics: TripMetricsService,
  input: {
    outcome: 'persisted' | 'skipped' | 'failed';
  },
): void {
  metrics.batteryStartProxyTotal.inc({ outcome: input.outcome });
}

export function recordBatteryStartInsufficientCoverage(
  metrics: TripMetricsService,
): void {
  metrics.batteryStartInsufficientCoverageTotal.inc();
}

export function recordHvRechargeSegments(
  metrics: TripMetricsService,
  input: {
    trigger: HvRechargeSessionReconcileTrigger | string;
    outcome: 'success' | 'error';
    count?: number;
  },
): void {
  metrics.hvRechargeSegmentsTotal.inc(
    {
      trigger: input.trigger,
      outcome: input.outcome,
    },
    input.count ?? 1,
  );
}

export function recordHvChargeSession(
  metrics: TripMetricsService,
  input: {
    trigger: HvRechargeSessionReconcileTrigger | string;
    change: 'created' | 'updated' | 'unchanged';
    count?: number;
  },
): void {
  metrics.hvChargeSessionsTotal.inc(
    {
      trigger: input.trigger,
      change: input.change,
    },
    input.count ?? 1,
  );
}

export function recordHvCapacityObservation(
  metrics: TripMetricsService,
  input: {
    quality: string;
  },
  count = 1,
): void {
  metrics.hvCapacityObservationsTotal.inc({ quality: input.quality }, count);
}

export function recordHvCapacitySessionQualified(
  metrics: TripMetricsService,
  input: {
    qualified: boolean;
  },
): void {
  metrics.hvCapacitySessionsQualifiedTotal.inc({
    qualified: input.qualified ? 'true' : 'false',
  });
}

export function recordBatteryAssessment(
  metrics: TripMetricsService,
  input: {
    scope: 'lv' | 'hv';
    mode: 'canonical' | 'shadow';
    outcome: 'persisted' | 'skipped' | 'unsupported';
  },
  count = 1,
): void {
  metrics.batteryAssessmentsTotal.inc(
    {
      scope: input.scope,
      mode: input.mode,
      outcome: input.outcome,
    },
    count,
  );
}

export function recordBatteryPublication(
  metrics: TripMetricsService,
  input: {
    maturity: string;
    outcome: 'persisted' | 'skipped' | 'superseded';
  },
): void {
  metrics.batteryPublicationsTotal.inc({
    maturity: input.maturity,
    outcome: input.outcome,
  });
}

export type BatteryV2EnqueueOutcome = 'success' | 'failed';

export type BatteryV2EnqueueSuppressionReason =
  | 'dead_letter'
  | 'duplicate'
  | 'workers_disabled';

export type BatteryV2ReconciliationCategory =
  | 'observation_classify'
  | 'rest_targets'
  | 'trip_starts'
  | 'recharge_segments'
  | 'assessments'
  | 'capability_refresh'
  | 'capability_signal_loss';

export type BatteryV2PublicationCoverageState =
  | 'published'
  | 'skipped'
  | 'missing';

export function recordBatteryV2JobEnqueue(
  metrics: TripMetricsService,
  input: {
    jobType: BatteryV2JobType | string;
    outcome: BatteryV2EnqueueOutcome;
  },
): void {
  metrics.batteryV2JobsEnqueueTotal.inc({
    job_type: input.jobType,
    outcome: input.outcome,
  });
}

export function recordBatteryV2JobEnqueueSuppressed(
  metrics: TripMetricsService,
  input: {
    jobType: BatteryV2JobType | string;
    reason: BatteryV2EnqueueSuppressionReason;
  },
): void {
  metrics.batteryV2JobsEnqueueSuppressedTotal.inc({
    job_type: input.jobType,
    reason: input.reason,
  });
}

export function recordBatteryV2ReconciliationEnqueued(
  metrics: TripMetricsService,
  input: {
    category: BatteryV2ReconciliationCategory;
    count?: number;
  },
): void {
  const count = input.count ?? 0;
  if (count <= 0) return;
  metrics.batteryV2ReconciliationEnqueuedTotal.inc({ category: input.category }, count);
}

export function recordBatteryV2PublicationCoverage(
  metrics: TripMetricsService,
  input: {
    scope: 'lv' | 'hv';
    state: BatteryV2PublicationCoverageState;
  },
): void {
  metrics.batteryV2PublicationCoverageTotal.inc({
    scope: input.scope,
    state: input.state,
  });
}

export function recordBatteryV2PublicationAgeHours(
  metrics: TripMetricsService,
  input: {
    maturity: string;
    ageHours: number;
  },
): void {
  if (!Number.isFinite(input.ageHours) || input.ageHours < 0) return;
  metrics.batteryV2PublicationAgeHours.observe(
    { maturity: input.maturity },
    input.ageHours,
  );
}

export function setBatteryV2VehiclesWithoutPublication(
  metrics: TripMetricsService,
  input: {
    scope: 'lv' | 'hv';
    count: number;
  },
): void {
  metrics.batteryV2VehiclesWithoutPublication.set(
    { scope: input.scope },
    Math.max(0, input.count),
  );
}

export function recordBatteryCapabilitySignal(
  metrics: TripMetricsService,
  input: {
    signal: string;
    status: string;
  },
): void {
  metrics.batteryCapabilitySignalsTotal.inc({
    signal: input.signal,
    status: input.status,
  });
}

export function recordHvCapacityM2SessionCv(
  metrics: TripMetricsService,
  coefficientOfVariation: number,
): void {
  if (!Number.isFinite(coefficientOfVariation) || coefficientOfVariation < 0) {
    return;
  }
  metrics.hvCapacityM2SessionCv.observe(coefficientOfVariation);
}

export function recordHvCapacityMethodConflict(
  metrics: TripMetricsService,
  input: {
    conflict: boolean;
  },
): void {
  metrics.hvCapacityMethodConflictTotal.inc({
    outcome: input.conflict ? 'conflict' : 'agree',
  });
}

export function recordBatteryRetentionRun(
  metrics: TripMetricsService,
  input: {
    dryRun: boolean;
    deleted: number;
    aggregated: number;
  },
): void {
  metrics.batteryRetentionRunsTotal.inc({
    dry_run: input.dryRun ? 'true' : 'false',
  });
  if (input.deleted > 0) {
    metrics.batteryRetentionRowsDeletedTotal.inc(input.deleted);
  }
  if (input.aggregated > 0) {
    metrics.batteryRetentionRowsAggregatedTotal.inc(input.aggregated);
  }
}

export function recordBatteryMeasurementDuplicateSkip(metrics: TripMetricsService): void {
  metrics.batteryMeasurementDuplicateSkipTotal.inc();
}
