import { BatteryMeasurementQuality, BatteryMeasurementType } from '@prisma/client';
import { evaluateStartProxyCadenceGate } from './battery-start-proxy-cadence-gate';
import { buildStartProxyMeasurementPlan } from './battery-start-proxy-measurements';
import type { BatteryStartProxyCrankPoint } from './battery-start-proxy.policy';

const TRIP = 'cltrip123456789012345678901';
const TRIP_START = new Date('2026-07-16T12:00:00.000Z');
const EVAL_AT = new Date('2026-07-16T12:03:00.000Z');

function auditSeries5s(voltage = 12.4): BatteryStartProxyCrankPoint[] {
  const startMs = TRIP_START.getTime() - 25_000;
  return Array.from({ length: 35 }, (_, index) => {
    const ms = startMs + index * 5_000;
    return {
      timestamp: new Date(ms).toISOString(),
      voltage,
      rpm: ms >= TRIP_START.getTime() ? 600 : 0,
    };
  });
}

describe('buildStartProxyMeasurementPlan', () => {
  it('creates PRE_START, START_DIP drop proxy, and labeled recoveries for 5s audit cadence', () => {
    const points = auditSeries5s(12.4);
    points[5].voltage = 12.5;
    points[7].voltage = 11.7;
    const gate = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });
    expect(gate.ok).toBe(true);

    const plan = buildStartProxyMeasurementPlan({
      tripId: TRIP,
      tripStartedAt: TRIP_START,
      gate,
    });

    expect(plan.map((item) => item.messart)).toEqual([
      'PRE_START',
      'START_DIP_PROXY',
      'RECOVERY_5S',
      'RECOVERY_30S',
    ]);

    const startDip = plan.find((item) => item.messart === 'START_DIP_PROXY');
    expect(startDip?.numericValue).toBeCloseTo(0.8, 5);
    expect(startDip?.context.notCrankMinimum).toBe(true);
    expect(startDip?.context.startDipDrop).toBeCloseTo(0.8, 5);
    expect(startDip?.type).toBe(BatteryMeasurementType.START_DIP_PROXY);

    const recovery5s = plan.find((item) => item.messart === 'RECOVERY_5S');
    expect(recovery5s?.type).toBe(BatteryMeasurementType.RECOVERY_5S_VOLTAGE);
    expect(recovery5s?.context.offsetFromTargetMs).toBe(0);
  });

  it('uses RECOVERY_PROXY when 30s target is outside tolerance', () => {
    const points = auditSeries5s(12.4).filter((point) => {
      const offset = new Date(point.timestamp).getTime() - TRIP_START.getTime();
      return offset < 25_000 || offset > 35_000;
    });
    const gate = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });
    expect(gate.ok).toBe(true);

    const plan = buildStartProxyMeasurementPlan({
      tripId: TRIP,
      tripStartedAt: TRIP_START,
      gate,
    });

    expect(plan.some((item) => item.messart === 'RECOVERY_5S')).toBe(true);
    expect(plan.some((item) => item.messart === 'RECOVERY_PROXY')).toBe(true);
    expect(plan.some((item) => item.messart === 'RECOVERY_30S')).toBe(false);

    const recoveryProxy = plan.find((item) => item.messart === 'RECOVERY_PROXY');
    expect(recoveryProxy?.type).toBe(BatteryMeasurementType.RECOVERY_PROXY_VOLTAGE);
    expect(recoveryProxy?.context.recoveryLabel).toBe('RECOVERY_PROXY');
  });

  it('emits status measurements without numeric values when gate fails', () => {
    const gate = evaluateStartProxyCadenceGate({
      points: [],
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });

    const plan = buildStartProxyMeasurementPlan({
      tripId: TRIP,
      tripStartedAt: TRIP_START,
      gate,
    });

    expect(plan).toHaveLength(5);
    expect(plan.every((item) => item.numericValue == null)).toBe(true);
    expect(plan.every((item) => item.quality === BatteryMeasurementQuality.NO_DATA)).toBe(
      true,
    );
    expect(plan.every((item) => item.context.statusOnly === true)).toBe(true);
  });

  it('uses distinct idempotency keys per messart', () => {
    const points = auditSeries5s();
    const gate = evaluateStartProxyCadenceGate({
      points,
      tripStartAt: TRIP_START,
      evaluatedAt: EVAL_AT,
    });
    const plan = buildStartProxyMeasurementPlan({
      tripId: TRIP,
      tripStartedAt: TRIP_START,
      gate,
    });

    const keys = plan.map((item) => item.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        `pre-start-voltage:${TRIP}`,
        `start-dip-proxy:${TRIP}`,
        `recovery-5s-voltage:${TRIP}`,
        `recovery-30s-voltage:${TRIP}`,
      ]),
    );
  });
});
