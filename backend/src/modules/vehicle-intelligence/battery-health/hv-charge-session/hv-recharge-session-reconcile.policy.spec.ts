import {
  buildHvRechargePeriodicPeriodBucket,
  buildHvRechargeVehicleReconcileIdempotencyKey,
} from './hv-recharge-session-reconcile.policy';
import { HvRechargeSessionReconcileTrigger } from './hv-recharge-session-reconcile.trigger';

describe('buildHvRechargeVehicleReconcileIdempotencyKey (E4)', () => {
  const evaluatedAt = new Date('2026-07-16T12:00:00.000Z');

  it('uses explicit period bucket for PERIODIC without hidden Date.now()', () => {
    const keyA = buildHvRechargeVehicleReconcileIdempotencyKey({
      vehicleId: 'veh-1',
      trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
      periodBucket: '12345',
    });
    const keyB = buildHvRechargeVehicleReconcileIdempotencyKey({
      vehicleId: 'veh-1',
      trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
      periodBucket: '12345',
    });
    expect(keyA).toBe(keyB);
    expect(keyA).toContain(':PERIODIC:12345');
  });

  it('derives periodic bucket from evaluatedAt when periodBucket omitted', () => {
    const bucket = buildHvRechargePeriodicPeriodBucket(evaluatedAt);
    const key = buildHvRechargeVehicleReconcileIdempotencyKey({
      vehicleId: 'veh-1',
      trigger: HvRechargeSessionReconcileTrigger.PERIODIC,
      evaluatedAt,
    });
    expect(key.endsWith(`:${bucket}`)).toBe(true);
  });

  it('uses nonce for charging transition triggers', () => {
    const key = buildHvRechargeVehicleReconcileIdempotencyKey({
      vehicleId: 'veh-1',
      trigger: HvRechargeSessionReconcileTrigger.CHARGING_STATE,
      nonce: 'on:2026-07-16T12:00:00.000Z',
    });
    expect(key).toContain('on:2026-07-16T12:00:00.000Z');
  });
});
