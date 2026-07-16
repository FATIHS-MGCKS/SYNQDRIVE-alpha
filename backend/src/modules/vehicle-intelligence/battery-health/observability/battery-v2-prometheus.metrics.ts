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
