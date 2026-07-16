import { getBatteryV2ReconciliationIntervalMs } from '@config/battery-health-v2.config';
import { buildCapabilityRefreshPeriodBucket } from '../jobs/battery-v2-job-idempotency.policy';
import { BATTERY_V2_JOB_IDENTITY_PREFIX } from '../jobs/battery-v2-job-idempotency.policy';
import type { HvRechargeSessionReconcileTrigger } from './hv-recharge-session-reconcile.trigger';

export const HV_RECHARGE_ROLLING_WINDOW_DAYS = 31;

export function buildHvRechargeRollingWindow(to: Date = new Date()): {
  from: Date;
  to: Date;
} {
  return {
    from: new Date(to.getTime() - HV_RECHARGE_ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    to,
  };
}

export function buildHvRechargeVehicleReconcileIdempotencyKey(input: {
  vehicleId: string;
  trigger: HvRechargeSessionReconcileTrigger;
  periodBucket?: string;
  nonce?: string;
}): string {
  const bucket =
    input.periodBucket ??
    input.nonce ??
    buildCapabilityRefreshPeriodBucket(
      new Date(),
      getBatteryV2ReconciliationIntervalMs(),
    );

  return [
    BATTERY_V2_JOB_IDENTITY_PREFIX.hvSession,
    input.vehicleId,
    'reconcile',
    input.trigger,
    bucket,
  ].join(':');
}

export function isHvRechargeSessionIdempotencyKey(key: string): boolean {
  return key.startsWith(`${BATTERY_V2_JOB_IDENTITY_PREFIX.hvSession}:`);
}
