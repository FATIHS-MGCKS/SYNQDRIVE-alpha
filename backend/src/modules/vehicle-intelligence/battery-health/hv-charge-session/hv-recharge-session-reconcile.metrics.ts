import type { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordHvChargeSession,
  recordHvRechargeSegments,
} from '../observability/battery-v2-prometheus.metrics';
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
  recordHvRechargeSegments(metrics, {
    trigger: input.trigger,
    outcome: input.errorCode ? 'error' : 'success',
    count: input.segmentsFetched,
  });

  recordHvChargeSession(metrics, {
    trigger: input.trigger,
    change: 'created',
    count: input.created,
  });
  recordHvChargeSession(metrics, {
    trigger: input.trigger,
    change: 'updated',
    count: input.updated,
  });
  recordHvChargeSession(metrics, {
    trigger: input.trigger,
    change: 'unchanged',
    count: input.unchanged,
  });

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
