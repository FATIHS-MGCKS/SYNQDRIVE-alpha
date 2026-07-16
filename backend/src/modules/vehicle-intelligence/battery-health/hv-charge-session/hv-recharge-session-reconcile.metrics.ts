import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type { HvRechargeSessionReconcileTrigger } from './hv-recharge-session-reconcile.trigger';

export function recordHvRechargeReconcileMetrics(
  metrics: TripMetricsService,
  input: {
    trigger: HvRechargeSessionReconcileTrigger;
    segmentsFetched: number;
    created: number;
    updated: number;
    unchanged: number;
    providerDelaySeconds?: number | null;
    errorCode?: string | null;
  },
): void {
  metrics.batteryV2HvRechargeSegmentsTotal.inc(
    {
      trigger: input.trigger,
      outcome: input.errorCode ? 'error' : 'success',
    },
    input.segmentsFetched,
  );

  metrics.batteryV2HvRechargeSessionsPersisted.inc(
    {
      trigger: input.trigger,
      change: 'created',
    },
    input.created,
  );
  metrics.batteryV2HvRechargeSessionsPersisted.inc(
    {
      trigger: input.trigger,
      change: 'updated',
    },
    input.updated,
  );
  metrics.batteryV2HvRechargeSessionsPersisted.inc(
    {
      trigger: input.trigger,
      change: 'unchanged',
    },
    input.unchanged,
  );

  if (input.errorCode) {
    metrics.batteryV2HvRechargeReconcileErrors.inc({
      trigger: input.trigger,
      error_code: input.errorCode,
    });
  }

  if (
    input.providerDelaySeconds != null &&
    Number.isFinite(input.providerDelaySeconds) &&
    input.providerDelaySeconds >= 0
  ) {
    metrics.batteryV2HvRechargeProviderDelay.observe(
      { trigger: input.trigger },
      input.providerDelaySeconds,
    );
  }
}
